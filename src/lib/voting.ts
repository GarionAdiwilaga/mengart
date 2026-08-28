import { db } from "@/db";
import {
  challenges,
  challengeSubmissions,
  challengeSubmissionVersions,
  artworkVersions,
  profiles,
  challengeBallots,
  challengeBallotStars,
  challengeWinnerSlots,
  challengeResults,
  challengeJuryScores,
} from "@/db/schema";
import { eq, and, sql, desc, asc } from "drizzle-orm";
import crypto from "crypto";
import { getEffectiveChallengeStatus } from "./challenges";

export interface CandidateArtwork {
  submissionId: string;
  artistUserId: string;
  artistName: string;
  artistSlug: string;
  artistAvatar: string | null;
  versionNumber: number;
  title: string;
  description: string | null;
  softwareUsed: string | null;
  thumbnailStorageKey: string | null;
  publicStorageKey: string | null;
  width: number | null;
  height: number | null;
  mediaType: "image" | "gif" | "video";
  totalStars: number;
  userAllocatedStars: number;
  isSelfSubmission: boolean;
}

/**
 * Deterministic seeded candidate shuffle per voter to eliminate top-of-list bias
 */
export function getDeterministicVoterCandidateOrder<T extends { submissionId: string }>(
  candidates: T[],
  voterId: string = "anonymous",
  challengeId: string
): T[] {
  return [...candidates].sort((a, b) => {
    const hashA = crypto
      .createHash("sha256")
      .update(`${voterId}:${challengeId}:${a.submissionId}`)
      .digest("hex");
    const hashB = crypto
      .createHash("sha256")
      .update(`${voterId}:${challengeId}:${b.submissionId}`)
      .digest("hex");
    return hashA.localeCompare(hashB);
  });
}

/**
 * Fetch challenge voting data with community stars & voter's ballot allocations
 */
export async function getChallengeVotingData(challengeId: string, userId?: string) {
  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (!challenge) return null;

  const effectiveStatus = getEffectiveChallengeStatus(challenge);

  // 1. Fetch all submitted candidates
  const candidateRows = await db
    .select({
      submissionId: challengeSubmissions.id,
      artistUserId: challengeSubmissions.userId,
      artistName: profiles.displayName,
      artistSlug: profiles.slug,
      artistAvatar: profiles.avatarUrl,
      versionNumber: challengeSubmissionVersions.versionNumber,
      title: challengeSubmissionVersions.title,
      description: challengeSubmissionVersions.description,
      softwareUsed: challengeSubmissionVersions.softwareUsed,
      thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
      publicStorageKey: artworkVersions.publicStorageKey,
      width: artworkVersions.width,
      height: artworkVersions.height,
      mediaType: artworkVersions.mediaType,
    })
    .from(challengeSubmissions)
    .innerJoin(profiles, eq(profiles.id, challengeSubmissions.profileId))
    .innerJoin(
      challengeSubmissionVersions,
      eq(challengeSubmissionVersions.id, challengeSubmissions.currentVersionId)
    )
    .innerJoin(artworkVersions, eq(artworkVersions.id, challengeSubmissionVersions.artworkVersionId))
    .where(
      and(
        eq(challengeSubmissions.challengeId, challengeId),
        eq(challengeSubmissions.submissionStatus, "submitted")
      )
    );

  // 2. Fetch total community Stars for all candidates in this challenge
  const starCounts = await db
    .select({
      submissionId: challengeBallotStars.submissionId,
      totalStars: sql<number>`COALESCE(SUM(${challengeBallotStars.starsCount}), 0)::int`,
    })
    .from(challengeBallotStars)
    .innerJoin(challengeBallots, eq(challengeBallots.id, challengeBallotStars.ballotId))
    .where(eq(challengeBallots.challengeId, challengeId))
    .groupBy(challengeBallotStars.submissionId);

  const starCountMap = new Map<string, number>();
  for (const row of starCounts) {
    starCountMap.set(row.submissionId, row.totalStars);
  }

  // 3. Fetch current user's ballot allocations if logged in
  let userAllocations = new Map<string, number>();
  let totalUserStarsAllocated = 0;
  let ballotId: string | null = null;
  let isFinalized = false;

  if (userId) {
    const [userBallot] = await db
      .select()
      .from(challengeBallots)
      .where(
        and(
          eq(challengeBallots.challengeId, challengeId),
          eq(challengeBallots.userId, userId),
          eq(challengeBallots.roundType, "main")
        )
      )
      .limit(1);

    if (userBallot) {
      ballotId = userBallot.id;
      totalUserStarsAllocated = userBallot.starsAllocated;
      isFinalized = userBallot.isFinalized;

      const userStars = await db
        .select()
        .from(challengeBallotStars)
        .where(eq(challengeBallotStars.ballotId, userBallot.id));

      for (const item of userStars) {
        userAllocations.set(item.submissionId, item.starsCount);
      }
    }
  }

  // 4. Map candidates with star totals and user allocations
  const mappedCandidates: CandidateArtwork[] = candidateRows.map((c) => ({
    ...c,
    totalStars: starCountMap.get(c.submissionId) || 0,
    userAllocatedStars: userAllocations.get(c.submissionId) || 0,
    isSelfSubmission: userId ? c.artistUserId === userId : false,
  }));

  // 5. Apply deterministic voter seed shuffle
  const orderedCandidates = getDeterministicVoterCandidateOrder(
    mappedCandidates,
    userId || "guest",
    challenge.id
  );

  const maxStars = challenge.starsPerMember || 3;
  const remainingStars = Math.max(0, maxStars - totalUserStarsAllocated);

  return {
    challenge,
    effectiveStatus,
    candidates: orderedCandidates,
    userBallot: {
      ballotId,
      starsAllocated: totalUserStarsAllocated,
      maxStars,
      remainingStars,
      isFinalized,
    },
  };
}

/**
 * Fetch challenge results and Hall of Fame data.
 * By default, public retrieval strictly requires challenge.status === 'finished' and challengeResults.isPublished === true.
 */
export async function getChallengeResultsData(
  challengeId: string,
  options?: { includeUnpublished?: boolean }
) {
  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (!challenge) return null;

  const includeUnpublished = options?.includeUnpublished ?? false;

  // If public query and challenge is not finished, return empty results with challenge state
  if (!includeUnpublished && challenge.status !== "finished") {
    return {
      challenge,
      results: [],
      isPublished: false,
      status: challenge.status,
    };
  }

  const whereCondition = includeUnpublished
    ? eq(challengeResults.challengeId, challengeId)
    : and(
        eq(challengeResults.challengeId, challengeId),
        eq(challengeResults.isPublished, true)
      );

  const results = await db
    .select({
      resultId: challengeResults.id,
      finalRank: challengeResults.finalRank,
      awardType: challengeResults.awardType,
      totalCommunityStars: challengeResults.totalCommunityStars,
      juryScore: challengeResults.juryScore,
      isPublished: challengeResults.isPublished,
      slotTitle: challengeWinnerSlots.title,
      slotType: challengeWinnerSlots.slotType,
      submissionId: challengeSubmissions.id,
      artistName: profiles.displayName,
      artistSlug: profiles.slug,
      artistAvatar: profiles.avatarUrl,
      title: challengeSubmissionVersions.title,
      description: challengeSubmissionVersions.description,
      softwareUsed: challengeSubmissionVersions.softwareUsed,
      thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
      publicStorageKey: artworkVersions.publicStorageKey,
      mediaType: artworkVersions.mediaType,
    })
    .from(challengeResults)
    .innerJoin(challengeSubmissions, eq(challengeSubmissions.id, challengeResults.submissionId))
    .leftJoin(profiles, eq(profiles.id, challengeSubmissions.profileId))
    .leftJoin(
      challengeSubmissionVersions,
      eq(challengeSubmissionVersions.id, challengeSubmissions.currentVersionId)
    )
    .leftJoin(artworkVersions, eq(artworkVersions.id, challengeSubmissionVersions.artworkVersionId))
    .leftJoin(challengeWinnerSlots, eq(challengeWinnerSlots.id, challengeResults.winnerSlotId))
    .where(whereCondition)
    .orderBy(asc(challengeResults.finalRank));

  return {
    challenge,
    results,
    isPublished: challenge.status === "finished" && results.length > 0,
    status: challenge.status,
  };
}

/**
 * Moderator & Curator review result retrieval for REVIEW and RESULTS_REVOKED stages
 */
export async function getModeratorReviewResultsData(challengeId: string) {
  return await getChallengeResultsData(challengeId, { includeUnpublished: true });
}
