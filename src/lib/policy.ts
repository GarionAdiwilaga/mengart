import { db } from "@/db";
import {
  challenges,
  challengeSubmissions,
  challengeJuryAssignments,
  artworks,
  artworkVersions,
  users,
  profiles,
} from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getEffectiveChallengeStatus } from "@/lib/challenges";

export interface PolicyUser {
  id: string;
  role: "member" | "moderator" | "admin";
  membershipStatus?: "active" | "suspended" | "deleted" | null;
}

export interface ArtworkEntity {
  id: string;
  userId: string;
  audience: "public" | "members_only" | "unlisted" | "private";
  publicationStatus: "draft" | "processing" | "ready" | "published" | "hidden" | "processing_failed" | string;
  deletedAt?: Date | null;
}

export interface ChallengeEntity {
  id: string;
  status: string;
  submissionStartsAt?: Date | null;
  submissionDeadline?: Date | null;
  votingStartsAt?: Date | null;
  votingDeadline?: Date | null;
  maxSubmissionsPerArtist?: number;
}

/**
 * Validates whether a viewer can view an artwork.
 */
export function canViewArtwork(
  viewer: PolicyUser | null | undefined,
  artwork: ArtworkEntity,
  owner?: { id: string }
): boolean {
  const isOwner = Boolean(viewer && viewer.id === (owner?.id || artwork.userId));
  const isActive = viewer?.membershipStatus === "active";
  const isActiveAdmin = Boolean(viewer && viewer.role === "admin" && isActive);
  const isActiveModerator = Boolean(viewer && viewer.role === "moderator" && isActive);
  const isActiveStaff = isActiveAdmin || isActiveModerator;

  // If artwork is soft-deleted, only owner and active admin can view it
  if (artwork.deletedAt) {
    return Boolean(isOwner || isActiveAdmin);
  }

  // If unpublished/draft/hidden/archived, only owner or active staff can view it
  if (artwork.publicationStatus !== "published") {
    return Boolean(isOwner || isActiveStaff);
  }

  // Private audience: strictly owner and active admin only
  if (artwork.audience === "private") {
    return Boolean(isOwner || isActiveAdmin);
  }

  // Unlisted audience: direct link access for authenticated active members, owner, or active staff
  if (artwork.audience === "unlisted") {
    if (!viewer) return false;
    return Boolean(isActive || isOwner || isActiveStaff);
  }

  // Members only: viewer must be authenticated active member, owner, or active staff
  if (artwork.audience === "members_only") {
    if (!viewer) return false;
    return Boolean(isActive || isOwner || isActiveStaff);
  }

  // Public audience: allowed for everyone
  return true;
}

/**
 * Validates whether a viewer can access the clean, unwatermarked master media variant.
 * Exact ACL Matrix:
 * - Owner: Allowed
 * - Platform Admin: Allowed
 * - Active Assigned Jury: Allowed ONLY for submitted entries during jury_selection_open / review
 * - All others (guests, regular members, unassigned moderators): STRICTLY DENIED (403)
 */
export async function canAccessMasterMedia(
  viewer: PolicyUser | null | undefined,
  artwork: ArtworkEntity,
  challengeId?: string | null
): Promise<boolean> {
  // 1. Viewer MUST be an authenticated ACTIVE member
  if (!viewer || viewer.membershipStatus !== "active") return false;

  // 2. AND independently pass Gate A media ACL (owner, admin, or active challenge jury)
  const isOwner = viewer.id === artwork.userId;
  const isAdmin = viewer.role === "admin";

  if (isOwner || isAdmin) return true;

  // Check if caller is an active jury member for the challenge this artwork was submitted to
  if (challengeId) {
    const [challenge] = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, challengeId))
      .limit(1);

    if (challenge) {
      const dynamicStatus = getEffectiveChallengeStatus(challenge as any);
      if (dynamicStatus === "jury_selection_open" || dynamicStatus === "review") {
        const [juryAssignment] = await db
          .select()
          .from(challengeJuryAssignments)
          .where(
            and(
              eq(challengeJuryAssignments.challengeId, challengeId),
              eq(challengeJuryAssignments.userId, viewer.id)
            )
          )
          .limit(1);

        if (juryAssignment) return true;
      }
    }
  }

  return false;
}

/**
 * Validates whether a profile is publicly discoverable.
 */
export function canViewProfile(
  viewer: PolicyUser | null | undefined,
  user: { id: string; membershipStatus: "active" | "suspended" | "deleted" | null; role: string },
  profile: { isPublic?: boolean; deletedAt?: Date | null }
): boolean {
  const isSelf = viewer && viewer.id === user.id;
  const isAdmin = viewer && viewer.role === "admin";

  if (profile.deletedAt) {
    return Boolean(isSelf || isAdmin);
  }

  if (user.membershipStatus !== "active") {
    return Boolean(isSelf || isAdmin);
  }

  if (profile.isPublic === false) {
    return Boolean(isSelf || isAdmin);
  }

  return true;
}

/**
 * Validates whether a user can submit an entry to a challenge.
 */
export function canSubmitChallengeEntry(
  viewer: PolicyUser | null | undefined,
  challenge: ChallengeEntity,
  currentSubmissionCount: number = 0
): { allowed: boolean; reason?: string } {
  if (!viewer) {
    return { allowed: false, reason: "Harus masuk untuk mengirimkan karya ke challenge." };
  }

  if (viewer.membershipStatus !== "active") {
    return { allowed: false, reason: "Akun Anda tidak aktif atau ditangguhkan." };
  }

  const dynamicStatus = getEffectiveChallengeStatus(challenge as any);
  if (dynamicStatus !== "submission_open") {
    return { allowed: false, reason: `Periode submisi sedang ditutup (Status: ${dynamicStatus}).` };
  }

  const maxAllowed = challenge.maxSubmissionsPerArtist || 1;
  if (currentSubmissionCount >= maxAllowed) {
    return { allowed: false, reason: `Maksimum submisi tercapai (${maxAllowed} karya per artist).` };
  }

  return { allowed: true };
}

/**
 * Validates whether a user can vote in a challenge round.
 */
export function canVoteInChallenge(
  viewer: PolicyUser | null | undefined,
  challenge: ChallengeEntity,
  roundType: "main" | "tiebreak" = "main"
): { allowed: boolean; reason?: string } {
  if (!viewer) {
    return { allowed: false, reason: "Harus masuk untuk memberikan suara." };
  }

  if (viewer.membershipStatus !== "active") {
    return { allowed: false, reason: "Akun Anda tidak aktif atau ditangguhkan." };
  }

  const dynamicStatus = getEffectiveChallengeStatus(challenge as any);
  if (roundType === "main" && dynamicStatus !== "voting_open") {
    return { allowed: false, reason: "Periode voting komunitas sedang ditutup." };
  }

  if (roundType === "tiebreak" && dynamicStatus !== "tiebreak_open") {
    return { allowed: false, reason: "Putaran tiebreak sedang tidak aktif." };
  }

  return { allowed: true };
}

/**
 * Validates whether a user can record or mutate jury awards for a challenge (Blueprint 2.2.1).
 */
export async function canRecordJuryAward(
  viewer: PolicyUser | null | undefined,
  challengeId: string,
  submissionId: string
): Promise<{ allowed: boolean; reason?: string }> {
  if (!viewer) {
    return { allowed: false, reason: "Harus masuk untuk mencatat penghargaan juri." };
  }

  if (viewer.membershipStatus !== "active") {
    return { allowed: false, reason: "Akun Anda tidak aktif atau ditangguhkan." };
  }

  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (!challenge) {
    return { allowed: false, reason: "Challenge tidak ditemukan." };
  }

  const dynamicStatus = getEffectiveChallengeStatus(challenge as any);
  if (dynamicStatus !== "jury_selection_open" && dynamicStatus !== "results_revoked") {
    return { allowed: false, reason: "Sesi kurasi juri sedang tidak aktif." };
  }

  const isAdmin = viewer.role === "admin";
  const isModerator = viewer.role === "moderator";

  if (dynamicStatus === "results_revoked") {
    if (!isAdmin && !isModerator) {
      return { allowed: false, reason: "Hanya Administrator atau Moderator yang dapat mengoreksi penghargaan pada status hasil dicabut." };
    }
  } else {
    // jury_selection_open
    const [assignment] = await db
      .select()
      .from(challengeJuryAssignments)
      .where(
        and(
          eq(challengeJuryAssignments.challengeId, challengeId),
          eq(challengeJuryAssignments.userId, viewer.id)
        )
      )
      .limit(1);

    const isRecorder = assignment?.isRecorder === true;
    if (!isAdmin && !isRecorder) {
      return { allowed: false, reason: "Hanya Jury Recorder yang ditunjuk atau Administrator yang dapat mencatat penghargaan juri." };
    }
  }

  // Check target submission
  const [submission] = await db
    .select()
    .from(challengeSubmissions)
    .where(
      and(
        eq(challengeSubmissions.id, submissionId),
        eq(challengeSubmissions.challengeId, challengeId),
        eq(challengeSubmissions.submissionStatus, "submitted")
      )
    )
    .limit(1);

  if (!submission) {
    return { allowed: false, reason: "Karya submisi tidak valid atau tidak aktif pada challenge ini." };
  }

  if (submission.userId === viewer.id && !isAdmin) {
    return { allowed: false, reason: "Anggota juri tidak dapat menilai atau memberikan penghargaan pada karya milik sendiri." };
  }

  return { allowed: true };
}

/**
 * Validates whether a user can submit jury evaluations for a challenge (Legacy / Compatibility).
 */
export async function canSubmitJuryScore(
  viewer: PolicyUser | null | undefined,
  challengeId: string,
  submissionId: string
): Promise<{ allowed: boolean; reason?: string }> {
  return canRecordJuryAward(viewer, challengeId, submissionId);
}
