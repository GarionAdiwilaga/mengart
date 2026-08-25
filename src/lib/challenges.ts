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
  | "cancelled";

/**
 * Authoritative lifecycle calculator based on server clock (WITA / UTC)
 */
export function getEffectiveChallengeStatus(challenge: {
  status: EffectiveChallengeStatus;
  submissionStartsAt: Date | null;
  submissionDeadline: Date | null;
  votingStartsAt: Date | null;
  votingDeadline: Date | null;
}): EffectiveChallengeStatus {
  if (challenge.status === "draft" || challenge.status === "paused" || challenge.status === "cancelled" || challenge.status === "finished" || challenge.status === "review" || challenge.status === "tiebreak_open" || challenge.status === "jury_selection_open") {
    return challenge.status;
  }

  const now = new Date();

  // If scheduled, check if submission window has opened
  if (challenge.status === "scheduled") {
    if (challenge.submissionStartsAt && now >= new Date(challenge.submissionStartsAt)) {
      if (challenge.submissionDeadline && now >= new Date(challenge.submissionDeadline)) {
        return "submission_locked";
      }
      return "submission_open";
    }
    return "scheduled";
  }

  // If submission_open, check if deadline has passed
  if (challenge.status === "submission_open") {
    if (challenge.submissionDeadline && now >= new Date(challenge.submissionDeadline)) {
      if (challenge.votingStartsAt && now >= new Date(challenge.votingStartsAt)) {
        if (challenge.votingDeadline && now >= new Date(challenge.votingDeadline)) {
          return "review";
        }
        return "voting_open";
      }
      return "submission_locked";
    }
    return "submission_open";
  }

  // If submission_locked, check if voting window opened
  if (challenge.status === "submission_locked") {
    if (challenge.votingStartsAt && now >= new Date(challenge.votingStartsAt)) {
      if (challenge.votingDeadline && now >= new Date(challenge.votingDeadline)) {
        return "review";
      }
      return "voting_open";
    }
    return "submission_locked";
  }

  // If voting_open, check if voting deadline passed
  if (challenge.status === "voting_open") {
    if (challenge.votingDeadline && now >= new Date(challenge.votingDeadline)) {
      return "review";
    }
    return "voting_open";
  }

  return challenge.status;
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
