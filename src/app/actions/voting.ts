"use server";

import { requireAuth, requireModerator } from "@/lib/rbac";
import { db } from "@/db";
import {
  challenges,
  challengeSubmissions,
  challengeWinnerSlots,
  challengeVotingRounds,
  challengeVotingRoundCandidates,
  challengeBallots,
  challengeBallotStars,
  challengeJuryAssignments,
  challengeJurySlotAssignments,
  challengeJuryScores,
  challengeResults,
  auditLogs,
} from "@/db/schema";
import { eq, and, sql, desc, asc, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getEffectiveChallengeStatus } from "@/lib/challenges";
import { canVoteInChallenge, canSubmitJuryScore } from "@/lib/policy";
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
 * Fetch challenge candidates and user's ballot for a specific voting round
 */
export async function getChallengeVotingData(
  challengeId: string,
  userId?: string | null,
  roundType: "main" | "tiebreak" = "main"
) {
  return await getAuthoritativeVotingRoundData(challengeId, userId);
}

/**
 * Cast or Update Ballot for a Challenge Voting Round
 * Operates authoritatively on votingRoundId
 */
export async function castOrUpdateBallotAction(
  arg1: string | { votingRoundId: string; votes: Array<{ submissionId: string; starsCount: number }> },
  arg2?: Array<{ submissionId: string; starsCount: number }>,
  arg3: "main" | "tiebreak" = "main"
) {
  const user = await requireAuth("/login");

  // Rate Limiting on voting actions
  const rl = await checkRateLimit(`vote:${user.id}`, { limit: 20, windowSeconds: 60 });
  if (!rl.success) {
    throw new Error("Terlalu banyak permintaan pemungutan suara. Harap tunggu beberapa saat.");
  }

  let votingRoundId: string;
  let votes: Array<{ submissionId: string; starsCount: number }>;

  if (typeof arg1 === "object" && "votingRoundId" in arg1) {
    votingRoundId = arg1.votingRoundId;
    votes = arg1.votes;
  } else {
    // Legacy positional signature: (challengeId, votes, roundType)
    const challengeId = arg1 as string;
    votes = arg2 || [];
    const roundType = arg3;

    const [round] = await db
      .select({ id: challengeVotingRounds.id })
      .from(challengeVotingRounds)
      .where(
        and(
          eq(challengeVotingRounds.challengeId, challengeId),
          eq(challengeVotingRounds.roundType, roundType)
        )
      )
      .orderBy(desc(challengeVotingRounds.roundSequence))
      .limit(1);

    if (!round) {
      throw new Error(`Babak pemungutan suara ${roundType} tidak ditemukan untuk challenge ini.`);
    }
    votingRoundId = round.id;
  }

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
 * Reset Ballot Action
 * Operates authoritatively on votingRoundId
 */
export async function resetBallotAction(
  arg1: string | { votingRoundId: string },
  arg2: "main" | "tiebreak" = "main"
) {
  const user = await requireAuth("/login");

  let votingRoundId: string;

  if (typeof arg1 === "object" && "votingRoundId" in arg1) {
    votingRoundId = arg1.votingRoundId;
  } else {
    const challengeId = arg1 as string;
    const roundType = arg2;

    const [round] = await db
      .select({ id: challengeVotingRounds.id })
      .from(challengeVotingRounds)
      .where(
        and(
          eq(challengeVotingRounds.challengeId, challengeId),
          eq(challengeVotingRounds.roundType, roundType)
        )
      )
      .orderBy(desc(challengeVotingRounds.roundSequence))
      .limit(1);

    if (!round) {
      throw new Error(`Babak pemungutan suara ${roundType} tidak ditemukan.`);
    }
    votingRoundId = round.id;
  }

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

/**
 * Shared Jury Winner-Slot Assignment with Optimistic Concurrency Locking
 */
export async function assignJurySlotAction(params: {
  challengeId: string;
  winnerSlotId: string;
  submissionId: string;
  expectedVersion?: number;
  notes?: string;
}) {
  const { challengeId, winnerSlotId, submissionId, expectedVersion = 1, notes } = params;
  const user = await requireAuth("/login");

  // Validate Jury Authorization
  const juryPolicy = await canSubmitJuryScore(user as any, challengeId, submissionId);
  if (!juryPolicy.allowed) {
    throw new Error(juryPolicy.reason || "Anda tidak diizinkan menetapkan slot juri.");
  }

  return db.transaction(async (tx) => {
    // 1. Lock challenge and winner slot row
    const [challenge] = await tx
      .select()
      .from(challenges)
      .where(eq(challenges.id, challengeId))
      .for("update")
      .limit(1);

    if (!challenge) throw new Error("Challenge tidak ditemukan.");
    if (challenge.status === "finished" || challenge.status === "cancelled") {
      throw new Error(`Challenge tidak dapat menerima penetapan juri pada status "${challenge.status}".`);
    }

    // 2. Validate target winner slot exists and is a jury award slot
    const [slot] = await tx
      .select()
      .from(challengeWinnerSlots)
      .where(
        and(
          eq(challengeWinnerSlots.id, winnerSlotId),
          eq(challengeWinnerSlots.challengeId, challengeId),
          eq(challengeWinnerSlots.slotType, "jury_award")
        )
      )
      .for("update")
      .limit(1);

    if (!slot) {
      throw new Error("Slot penghargaan juri tidak valid untuk challenge ini.");
    }

    // 3. Optimistic Concurrency Version Verification
    const [existingAssignment] = await tx
      .select()
      .from(challengeJurySlotAssignments)
      .where(
        and(
          eq(challengeJurySlotAssignments.challengeId, challengeId),
          eq(challengeJurySlotAssignments.winnerSlotId, winnerSlotId)
        )
      )
      .for("update")
      .limit(1);

    if (existingAssignment) {
      if (existingAssignment.version !== expectedVersion) {
        throw new Error(
          `Konflik konkurensi (409 Conflict): Slot ini telah diperbarui oleh juri lain (Versi terkini: ${existingAssignment.version}, Versi Anda: ${expectedVersion}). Harap muat ulang halaman.`
        );
      }

      const nextVersion = existingAssignment.version + 1;
      await tx
        .update(challengeJurySlotAssignments)
        .set({
          submissionId,
          assignedByUserId: user.id,
          version: nextVersion,
          notes: notes?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(challengeJurySlotAssignments.id, existingAssignment.id));
    } else {
      await tx.insert(challengeJurySlotAssignments).values({
        challengeId,
        winnerSlotId,
        submissionId,
        assignedByUserId: user.id,
        version: 1,
        notes: notes?.trim() || null,
      });
    }

    // 4. Audit Log
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "jury.assign_slot",
      targetType: "challenge_winner_slot",
      targetId: winnerSlotId,
      reason: `Penetapan slot "${slot.title}" ke karya submisi ${submissionId}`,
    });

    revalidatePath(`/challenges/${challenge.slug}/jury`);
    return { success: true };
  });
}

/**
 * Submit or update jury evaluation notes and winner slot recommendation
 */
export async function submitJuryScoreAction(
  challengeId: string,
  submissionId: string,
  winnerSlotId?: string,
  score?: number,
  critiqueNotes?: string
) {
  const user = await requireAuth("/login");

  // Validate Jury Authorization
  const juryPolicy = await canSubmitJuryScore(user as any, challengeId, submissionId);
  if (!juryPolicy.allowed) {
    throw new Error(juryPolicy.reason || "Anda tidak diizinkan mengevaluasi karya ini.");
  }

  return db.transaction(async (tx) => {
    // 1. If winnerSlotId is provided, assign jury slot
    if (winnerSlotId) {
      await assignJurySlotAction({
        challengeId,
        winnerSlotId,
        submissionId,
        notes: critiqueNotes,
      });
    }

    // 2. Upsert challenge_jury_scores evaluation record
    const [existingScore] = await tx
      .select()
      .from(challengeJuryScores)
      .where(
        and(
          eq(challengeJuryScores.challengeId, challengeId),
          eq(challengeJuryScores.juryUserId, user.id),
          eq(challengeJuryScores.submissionId, submissionId)
        )
      )
      .limit(1);

    if (existingScore) {
      await tx
        .update(challengeJuryScores)
        .set({
          winnerSlotId: winnerSlotId || null,
          score: score || null,
          critiqueNotes: critiqueNotes || null,
          updatedAt: new Date(),
        })
        .where(eq(challengeJuryScores.id, existingScore.id));
    } else {
      await tx.insert(challengeJuryScores).values({
        challengeId,
        juryUserId: user.id,
        submissionId,
        winnerSlotId: winnerSlotId || null,
        score: score || null,
        critiqueNotes: critiqueNotes || null,
      });
    }

    revalidatePath(`/challenges/${challengeId}`);
    return { success: true };
  });
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
