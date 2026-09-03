import { db } from "@/db";
import {
  challenges,
  challengeSubmissions,
  artworkVersions,
  artworks,
  profiles,
  challengeResults,
} from "@/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import {
  getAuthoritativeVotingRoundData,
  getDeterministicVoterCandidateOrder,
} from "./services/votingService";

export type { CandidateRoundData as CandidateArtwork } from "./services/votingService";
export { getDeterministicVoterCandidateOrder };

/**
 * Fetch challenge voting data with community stars & voter's ballot allocations.
 * Authoritatively delegates to votingService.ts.
 */
export async function getChallengeVotingData(challengeId: string, userId?: string) {
  const data = await getAuthoritativeVotingRoundData(challengeId, userId);
  if (!data) return null;

  return {
    challenge: data.challenge,
    effectiveStatus: data.challenge.status,
    votingRound: data.votingRound,
    candidates: data.candidates,
    userBallot: data.userBallot || {
      ballotId: null,
      starsAllocated: 0,
      maxStars: data.starsAllowance,
      remainingStars: data.starsAllowance,
      isFinalized: false,
    },
  };
}

/**
 * Fetch challenge results and Hall of Fame data.
 * Blueprint 2.2.1: Community Vote Winner (if any) and Jury Awards (if any).
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

  // If public query and challenge is not finished, return empty results
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
      categoryLabel: challengeResults.categoryLabel,
      juryAwardId: challengeResults.juryAwardId,
      recordedByUserId: challengeResults.recordedByUserId,
      resolutionMethod: challengeResults.resolutionMethod,
      totalCommunityStars: challengeResults.totalCommunityStars,
      juryScore: challengeResults.juryScore,
      isPublished: challengeResults.isPublished,
      slotTitle: sql<string>`COALESCE(${challengeResults.categoryLabel}, 'Pilihan Juri')`,
      submissionId: challengeSubmissions.id,
      artworkId: challengeSubmissions.artworkId,
      artworkVersionId: challengeSubmissions.artworkVersionId,
      isSpoiler: artworks.isSpoiler,
      artistName: profiles.displayName,
      artistSlug: profiles.slug,
      artistAvatar: profiles.avatarUrl,
      title: challengeSubmissions.title,
      description: challengeSubmissions.description,
      softwareUsed: challengeSubmissions.softwareUsed,
      thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
      publicStorageKey: artworkVersions.publicStorageKey,
      mediaType: artworkVersions.mediaType,
    })
    .from(challengeResults)
    .innerJoin(challengeSubmissions, eq(challengeSubmissions.id, challengeResults.submissionId))
    .innerJoin(artworks, eq(artworks.id, challengeSubmissions.artworkId))
    .leftJoin(profiles, eq(profiles.id, challengeSubmissions.profileId))
    .leftJoin(artworkVersions, eq(artworkVersions.id, challengeSubmissions.artworkVersionId))
    .where(whereCondition)
    .orderBy(
      asc(sql`CASE WHEN ${challengeResults.awardType} = 'community_vote_winner' THEN 0 ELSE 1 END`),
      asc(challengeResults.finalRank),
      asc(challengeResults.createdAt)
    );

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
  return getChallengeResultsData(challengeId, { includeUnpublished: true });
}
