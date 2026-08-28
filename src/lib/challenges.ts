import { db } from "@/db";
import {
  challenges,
  challengeKitFiles,
  challengeWinnerSlots,
  challengeJuryAssignments,
  challengeSubmissions,
  challengeSubmissionVersions,
  artworkVersions,
  artworks,
  profiles,
} from "@/db/schema";
import { eq, and, desc, asc } from "drizzle-orm";

export type EffectiveChallengeStatus =
  | "draft"
  | "scheduled"
  | "submission_open"
  | "submission_locked"
  | "voting_open"
  | "tiebreak_open"
  | "jury_selection_open"
  | "review"
  | "finished"
  | "paused"
  | "cancelled"
  | "results_revoked";

/**
 * Authoritative lifecycle status: Persisted database status is single source of truth.
 */
export function getEffectiveChallengeStatus(challenge: {
  status: EffectiveChallengeStatus;
  submissionStartsAt?: Date | null;
  submissionDeadline?: Date | null;
  votingStartsAt?: Date | null;
  votingDeadline?: Date | null;
}): EffectiveChallengeStatus {
  return challenge.status;
}

/**
 * Helper to inspect whether scheduled transitions or phase deadlines have passed
 */
export function isChallengePhaseDeadlinePassed(
  challenge: {
    submissionDeadline?: Date | null;
    votingDeadline?: Date | null;
  },
  phase: "submission" | "voting"
): boolean {
  const now = new Date();
  if (phase === "submission" && challenge.submissionDeadline) {
    return now >= new Date(challenge.submissionDeadline);
  }
  if (phase === "voting" && challenge.votingDeadline) {
    return now >= new Date(challenge.votingDeadline);
  }
  return false;
}

/**
 * Fetch challenge by slug with kit files and winner slots
 */
export async function getChallengeBySlug(slug: string) {
  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.slug, slug))
    .limit(1);

  if (!challenge) return null;

  const kitFiles = await db
    .select()
    .from(challengeKitFiles)
    .where(eq(challengeKitFiles.challengeId, challenge.id))
    .orderBy(asc(challengeKitFiles.displayOrder));

  const winnerSlots = await db
    .select()
    .from(challengeWinnerSlots)
    .where(eq(challengeWinnerSlots.challengeId, challenge.id))
    .orderBy(asc(challengeWinnerSlots.displayOrder));

  const juryAssignments = await db
    .select({
      id: challengeJuryAssignments.id,
      userId: challengeJuryAssignments.userId,
      displayName: profiles.displayName,
      slug: profiles.slug,
      avatarUrl: profiles.avatarUrl,
    })
    .from(challengeJuryAssignments)
    .innerJoin(profiles, eq(profiles.id, challengeJuryAssignments.profileId))
    .where(eq(challengeJuryAssignments.challengeId, challenge.id));

  const effectiveStatus = getEffectiveChallengeStatus(challenge);

  return {
    ...challenge,
    effectiveStatus,
    kitFiles,
    winnerSlots,
    juryAssignments,
  };
}

/**
 * Fetch user's active submission for a challenge
 */
export async function getUserChallengeSubmission(challengeId: string, userId: string) {
  const [submission] = await db
    .select()
    .from(challengeSubmissions)
    .where(
      and(
        eq(challengeSubmissions.challengeId, challengeId),
        eq(challengeSubmissions.userId, userId)
      )
    )
    .limit(1);

  if (!submission || !submission.currentVersionId) return null;

  const [version] = await db
    .select({
      id: challengeSubmissionVersions.id,
      versionNumber: challengeSubmissionVersions.versionNumber,
      title: challengeSubmissionVersions.title,
      description: challengeSubmissionVersions.description,
      softwareUsed: challengeSubmissionVersions.softwareUsed,
      submittedAt: challengeSubmissionVersions.submittedAt,
      artworkVersionId: challengeSubmissionVersions.artworkVersionId,
      publicStorageKey: artworkVersions.publicStorageKey,
      thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
      width: artworkVersions.width,
      height: artworkVersions.height,
      mediaType: artworkVersions.mediaType,
    })
    .from(challengeSubmissionVersions)
    .innerJoin(artworkVersions, eq(artworkVersions.id, challengeSubmissionVersions.artworkVersionId))
    .where(eq(challengeSubmissionVersions.id, submission.currentVersionId))
    .limit(1);

  return {
    ...submission,
    currentVersion: version,
  };
}

/**
 * Fetch all candidate submissions for a challenge (for gallery & voting)
 */
export async function getChallengeCandidates(challengeId: string) {
  const list = await db
    .select({
      submissionId: challengeSubmissions.id,
      userId: challengeSubmissions.userId,
      submissionStatus: challengeSubmissions.submissionStatus,
      createdAt: challengeSubmissions.createdAt,
      artistName: profiles.displayName,
      artistSlug: profiles.slug,
      artistAvatar: profiles.avatarUrl,
      versionId: challengeSubmissionVersions.id,
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
    )
    .orderBy(desc(challengeSubmissions.createdAt));

  return list;
}
