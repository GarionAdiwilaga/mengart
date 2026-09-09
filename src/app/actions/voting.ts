"use server";

import { requireAuth, requireModerator, getCurrentUser } from "@/lib/rbac";
import { db } from "@/db";
import {
  challenges,
  challengeSubmissions,
  challengeVotingRounds,
  challengeVotingRoundCandidates,
  challengeBallots,
  challengeBallotStars,
  challengeJuryAssignments,
  challengeResults,
  auditLogs,
} from "@/db/schema";
import { eq, and, sql, desc, asc, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getEffectiveChallengeStatus } from "@/lib/challenges";
import { canVoteInChallenge } from "@/lib/policy";
import { createNotification } from "@/lib/notifications";
import { checkRateLimit } from "@/lib/rateLimit";

import {
  getAuthoritativeVotingRoundData,
  castOrUpdateBallotService,
  resetBallotService,
  finalizeVotingRoundService,
  startTiebreakService,
  resolveTieManuallyService,
} from "@/lib/services/votingService";

/**
 * Fetch challenge candidates and user's ballot for a specific voting round.
 * Server Action securely derives viewer identity and rejects unauthorized 3rd-party ballot queries.
 */
export async function getChallengeVotingData(
  challengeId: string,
  userId?: string | null,
  roundType: "main" | "tiebreak" = "main"
) {
  const sessionUser = await getCurrentUser();

  let targetUserId: string | null = null;
  if (userId) {
    const isStaff =
      sessionUser &&
      (sessionUser.role === "admin" || sessionUser.role === "moderator") &&
      sessionUser.membershipStatus === "active";
    if (sessionUser?.id !== userId && !isStaff) {
      throw new Error("Akses ditolak: Tidak dapat melihat alokasi suara anggota lain.");
    }
    targetUserId = userId;
  } else {
    targetUserId = sessionUser?.id || null;
  }

  return await getAuthoritativeVotingRoundData(challengeId, targetUserId);
}

/**
 * Cast or Update Ballot for a Challenge Voting Round
 * Operates authoritatively on votingRoundId
 */
export async function castOrUpdateBallotAction(params: {
  votingRoundId: string;
  votes: Array<{ submissionId: string; starsCount: number }>;
}) {
  const user = await requireAuth("/login");

  // Rate Limiting on voting actions (Security-Critical, Fail-Closed)
  const rl = await checkRateLimit(`vote:${user.id}`, {
    limit: 20,
    windowSeconds: 60,
    criticality: "fail_closed",
  });
  if (!rl.success) {
    throw new Error("Terlalu banyak permintaan pemungutan suara. Harap tunggu beberapa saat.");
  }

  const { votingRoundId, votes } = params;

  const result = await db.transaction(async (tx) => {
    return await castOrUpdateBallotService(
      tx,
      { userId: user.id, role: user.role },
      { votingRoundId, votes }
    );
  });

  // Revalidate voting page
  const [targetRound] = await db
    .select({ challengeId: challengeVotingRounds.challengeId })
    .from(challengeVotingRounds)
    .where(eq(challengeVotingRounds.id, votingRoundId))
    .limit(1);

  if (targetRound) {
    const [challenge] = await db
      .select({ slug: challenges.slug })
      .from(challenges)
      .where(eq(challenges.id, targetRound.challengeId))
      .limit(1);

    if (challenge) {
      revalidatePath(`/challenges/${challenge.slug}/voting`);
      revalidatePath(`/challenges/${challenge.slug}`);
    }
  }

  return result;
}

/**
 * Reconcile Ballot Action
 * Fetches the caller's authoritative saved ballot from the database
 */
export async function reconcileBallotAction(votingRoundId: string) {
  const user = await requireAuth("/login");
  const [round] = await db
    .select({ challengeId: challengeVotingRounds.challengeId })
    .from(challengeVotingRounds)
    .where(eq(challengeVotingRounds.id, votingRoundId))
    .limit(1);

  if (!round) {
    throw new Error("Babak pemungutan suara tidak ditemukan.");
  }

  return await getAuthoritativeVotingRoundData(round.challengeId, user.id, {
    targetRoundId: votingRoundId,
  });
}

/**
 * Reset Ballot Action
 * Operates authoritatively on votingRoundId
 */
export async function resetBallotAction(params: { votingRoundId: string }) {
  const user = await requireAuth("/login");

  // Rate Limiting on voting actions (Security-Critical, Fail-Closed)
  const rl = await checkRateLimit(`vote:${user.id}`, {
    limit: 20,
    windowSeconds: 60,
    criticality: "fail_closed",
  });
  if (!rl.success) {
    throw new Error("Terlalu banyak permintaan reset suara. Harap tunggu beberapa saat.");
  }

  const { votingRoundId } = params;

  const result = await db.transaction(async (tx) => {
    return await resetBallotService(tx, { userId: user.id, role: user.role }, { votingRoundId });
  });

  const [targetRound] = await db
    .select({ challengeId: challengeVotingRounds.challengeId })
    .from(challengeVotingRounds)
    .where(eq(challengeVotingRounds.id, votingRoundId))
    .limit(1);

  if (targetRound) {
    const [challenge] = await db
      .select({ slug: challenges.slug })
      .from(challenges)
      .where(eq(challenges.id, targetRound.challengeId))
      .limit(1);

    if (challenge) {
      revalidatePath(`/challenges/${challenge.slug}/voting`);
      revalidatePath(`/challenges/${challenge.slug}`);
    }
  }

  return result;
}

/**
 * Finalize Voting Round Action (Staff or Recovery)
 * Enforces deadline check before closing an open round.
 */
export async function finalizeVotingRoundAction(params: { votingRoundId: string }) {
  const user = await requireModerator("/dashboard");

  const result = await db.transaction(async (tx) => {
    return await finalizeVotingRoundService(
      tx,
      { userId: user.id, role: user.role },
      { votingRoundId: params.votingRoundId }
    );
  });

  const [targetRound] = await db
    .select({ challengeId: challengeVotingRounds.challengeId })
    .from(challengeVotingRounds)
    .where(eq(challengeVotingRounds.id, params.votingRoundId))
    .limit(1);

  if (targetRound) {
    const [challenge] = await db
      .select({ slug: challenges.slug })
      .from(challenges)
      .where(eq(challenges.id, targetRound.challengeId))
      .limit(1);

    if (challenge) {
      revalidatePath(`/challenges/${challenge.slug}`);
      revalidatePath(`/challenges/${challenge.slug}/voting`);
      revalidatePath(`/challenges/${challenge.slug}/results`);
    }
  }
  revalidatePath("/admin/challenges");

  return result;
}

/**
 * Start Tiebreak Action (Admin/Moderator only from TIE_PENDING)
 */
export async function startTiebreakAction(params: {
  challengeId: string;
  deadline?: string;
}) {
  const user = await requireModerator("/dashboard");

  const result = await db.transaction(async (tx) => {
    return await startTiebreakService(
      tx,
      { userId: user.id, role: user.role },
      { challengeId: params.challengeId, deadline: params.deadline }
    );
  });

  const [challenge] = await db
    .select({ slug: challenges.slug })
    .from(challenges)
    .where(eq(challenges.id, params.challengeId))
    .limit(1);

  if (challenge) {
    revalidatePath(`/challenges/${challenge.slug}`);
    revalidatePath(`/challenges/${challenge.slug}/voting`);
    revalidatePath(`/challenges/${challenge.slug}/results`);
  }
  revalidatePath("/admin/challenges");

  return result;
}

/**
 * Resolve Tie Manually Action (Admin/Moderator only from TIE_PENDING)
 */
export async function resolveTieManuallyAction(params: {
  challengeId: string;
  submissionId: string;
  reason: string;
}) {
  const user = await requireModerator("/dashboard");

  const result = await db.transaction(async (tx) => {
    return await resolveTieManuallyService(
      tx,
      { userId: user.id, role: user.role },
      params
    );
  });

  const [challenge] = await db
    .select({ slug: challenges.slug })
    .from(challenges)
    .where(eq(challenges.id, params.challengeId))
    .limit(1);

  if (challenge) {
    revalidatePath(`/challenges/${challenge.slug}`);
    revalidatePath(`/challenges/${challenge.slug}/voting`);
    revalidatePath(`/challenges/${challenge.slug}/results`);
  }
  revalidatePath("/admin/challenges");

  return result;
}

import {
  computeChallengeResultsService,
  publishChallengeResultsService,
} from "@/lib/services/challengeService";

/**
 * Stage 1: Compute Challenge Results & Detect Ties (Transitions -> REVIEW or TIEBREAK_OPEN)
 */
export async function computeChallengeResultsAction(challengeId: string) {
  const user = await requireModerator("/dashboard");

  const result = await db.transaction(async (tx) => {
    return computeChallengeResultsService(
      tx,
      { userId: user.id, role: user.role },
      challengeId
    );
  });

  const [challenge] = await db
    .select({ slug: challenges.slug })
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (challenge) {
    revalidatePath(`/challenges/${challenge.slug}`);
    revalidatePath(`/challenges/${challenge.slug}/results`);
    revalidatePath(`/challenges/${challenge.slug}/jury`);
  }
  revalidatePath("/admin/challenges");
  revalidatePath("/challenges");

  return result;
}

/**
 * Stage 2: Explicitly Review and Publish Results (Transitions REVIEW -> FINISHED)
 * Dispatches notifications safely post-commit.
 */
export async function publishChallengeResultsAction(challengeId: string) {
  const user = await requireModerator("/dashboard");

  const result = await db.transaction(async (tx) => {
    return publishChallengeResultsService(
      tx,
      { userId: user.id, role: user.role },
      challengeId
    );
  });

  // Post-commit: Dispatch winner notifications safely
  if (result.pendingNotifications && result.pendingNotifications.length > 0) {
    await Promise.all(
      result.pendingNotifications.map((notif) =>
        createNotification({
          userId: notif.userId,
          type: notif.type as any,
          title: notif.title,
          body: notif.body,
          actionUrl: notif.actionUrl,
        })
      )
    );
  }

  const [challenge] = await db
    .select({ slug: challenges.slug })
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (challenge) {
    revalidatePath(`/challenges/${challenge.slug}/results`);
    revalidatePath(`/challenges/${challenge.slug}`);
  }
  revalidatePath("/admin/challenges");
  revalidatePath("/challenges");

  return { success: true, outcome: "published" as const };
}

/**
 * @deprecated Use computeChallengeResultsAction and publishChallengeResultsAction explicitly.
 * Does NOT auto-publish to prevent review bypass.
 */
export async function finalizeChallengeResultsAction(challengeId: string) {
  return await computeChallengeResultsAction(challengeId);
}
