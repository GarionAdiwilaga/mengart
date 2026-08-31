import { db } from "@/db";
import {
  challenges,
  challengeKitFiles,
  challengeWinnerSlots,
  challengeJuryAssignments,
  challengeSubmissions,
  artworkVersions,
  artworks,
  profiles,
} from "@/db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import crypto from "crypto";

export function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "karya";
}

export type EffectiveChallengeStatus =
  | "draft"
  | "scheduled"
  | "submission_open"
  | "submission_locked"
  | "voting_open"
  | "tiebreak_open"
  | "tie_pending"
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
    return now > new Date(challenge.submissionDeadline);
  }
  if (phase === "voting" && challenge.votingDeadline) {
    return now > new Date(challenge.votingDeadline);
  }
  return false;
}

/**
 * Fetch full Challenge entity including associated relation records
 */
export async function getChallengeWithRelations(challengeId: string) {
  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (!challenge) return null;

  const kitFiles = await db
    .select()
    .from(challengeKitFiles)
    .where(eq(challengeKitFiles.challengeId, challengeId))
    .orderBy(asc(challengeKitFiles.createdAt));

  const winnerSlots = await db
    .select()
    .from(challengeWinnerSlots)
    .where(eq(challengeWinnerSlots.challengeId, challengeId))
    .orderBy(asc(challengeWinnerSlots.displayOrder));

  const juryAssignments = await db
    .select({
      id: challengeJuryAssignments.id,
      userId: challengeJuryAssignments.userId,
      isRecorder: challengeJuryAssignments.isRecorder,
      assignedAt: challengeJuryAssignments.assignedAt,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
    })
    .from(challengeJuryAssignments)
    .innerJoin(profiles, eq(profiles.userId, challengeJuryAssignments.userId))
    .where(eq(challengeJuryAssignments.challengeId, challengeId));

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
 * Fetch full Challenge entity by its URL slug
 */
export async function getChallengeBySlug(slug: string) {
  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.slug, slug))
    .limit(1);

  if (!challenge) return null;

  return getChallengeWithRelations(challenge.id);
}

/**
 * Fetch user's active submission for a challenge
 */
export async function getUserChallengeSubmission(challengeId: string, userId: string) {
  const [submission] = await db
    .select({
      id: challengeSubmissions.id,
      challengeId: challengeSubmissions.challengeId,
      userId: challengeSubmissions.userId,
      profileId: challengeSubmissions.profileId,
      artworkId: challengeSubmissions.artworkId,
      artworkVersionId: challengeSubmissions.artworkVersionId,
      title: challengeSubmissions.title,
      description: challengeSubmissions.description,
      softwareUsed: challengeSubmissions.softwareUsed,
      submissionStatus: challengeSubmissions.submissionStatus,
      createdAt: challengeSubmissions.createdAt,
      updatedAt: challengeSubmissions.updatedAt,
      isSpoiler: artworks.isSpoiler,
      publicStorageKey: artworkVersions.publicStorageKey,
      thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
      width: artworkVersions.width,
      height: artworkVersions.height,
      mediaType: artworkVersions.mediaType,
    })
    .from(challengeSubmissions)
    .innerJoin(artworks, eq(artworks.id, challengeSubmissions.artworkId))
    .innerJoin(artworkVersions, eq(artworkVersions.id, challengeSubmissions.artworkVersionId))
    .where(
      and(
        eq(challengeSubmissions.challengeId, challengeId),
        eq(challengeSubmissions.userId, userId)
      )
    )
    .limit(1);

  if (!submission) return null;

  return {
    ...submission,
    currentVersion: {
      id: submission.artworkVersionId,
      versionNumber: 1,
      title: submission.title,
      description: submission.description,
      softwareUsed: submission.softwareUsed,
      submittedAt: submission.createdAt,
      artworkVersionId: submission.artworkVersionId,
      publicStorageKey: submission.publicStorageKey,
      thumbnailStorageKey: submission.thumbnailStorageKey,
      width: submission.width,
      height: submission.height,
      mediaType: submission.mediaType,
    },
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
      title: challengeSubmissions.title,
      description: challengeSubmissions.description,
      softwareUsed: challengeSubmissions.softwareUsed,
      artworkId: challengeSubmissions.artworkId,
      artworkVersionId: challengeSubmissions.artworkVersionId,
      isSpoiler: artworks.isSpoiler,
      artistName: profiles.displayName,
      artistSlug: profiles.slug,
      artistAvatar: profiles.avatarUrl,
      thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
      publicStorageKey: artworkVersions.publicStorageKey,
      width: artworkVersions.width,
      height: artworkVersions.height,
      mediaType: artworkVersions.mediaType,
    })
    .from(challengeSubmissions)
    .innerJoin(artworks, eq(artworks.id, challengeSubmissions.artworkId))
    .innerJoin(profiles, eq(profiles.id, challengeSubmissions.profileId))
    .innerJoin(artworkVersions, eq(artworkVersions.id, challengeSubmissions.artworkVersionId))
    .where(
      and(
        eq(challengeSubmissions.challengeId, challengeId),
        eq(challengeSubmissions.submissionStatus, "submitted")
      )
    )
    .orderBy(desc(challengeSubmissions.createdAt));

  return list;
}
