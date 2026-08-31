import { db as defaultDb } from "@/db";
import {
  challenges,
  challengeSubmissions,
  challengeWinnerSlots,
  challengeVotingRounds,
  challengeVotingRoundCandidates,
  challengeBallots,
  challengeBallotStars,
  challengeJurySlotAssignments,
  challengeResults,
  auditLogs,
  users,
} from "@/db/schema";
import { eq, and, sql, desc, asc, lte, isNull } from "drizzle-orm";
import type { EffectiveChallengeStatus } from "@/lib/challenges";
import { validateJuryPhaseReadinessService } from "./juryService";
import { autoAddChallengeSubmissionsToPortfolioService } from "./portfolioService";

export interface ServiceContext {
  userId: string | null;
  role: string;
}

/**
 * Internal/trusted status transition helper used by domain services.
 */
export async function internalTransitionChallengeStatus(
  dbOrTx: any,
  actor: ServiceContext | { userId?: string | null; role?: string },
  challengeId: string,
  newStatus: EffectiveChallengeStatus,
  reason: string
) {
  const [challenge] = await dbOrTx
    .update(challenges)
    .set({
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(challenges.id, challengeId))
    .returning();

  await dbOrTx.insert(auditLogs).values({
    actorId: actor?.userId || null,
    action: "challenge.transition_status",
    targetType: "challenge",
    targetId: challengeId,
    reason,
  });

  if (newStatus === "finished") {
    await autoAddChallengeSubmissionsToPortfolioService(dbOrTx, challengeId);
  }

  return challenge;
}

/**
 * Blueprint 2.2.1 Configuration-Aware Legal Transition Matrix
 */
export const LEGAL_TRANSITIONS: Record<string, Record<string, string[]>> = {
  // Mode: vote_and_jury (Standard Community Voting + Jury Awards)
  vote_and_jury: {
    draft: ["scheduled", "cancelled"],
    scheduled: ["submission_open", "cancelled"],
    submission_open: ["cancelled"],
    submission_locked: ["cancelled"],
    voting_open: ["cancelled"],
    tie_pending: ["cancelled"],
    tiebreak_open: ["cancelled"],
    jury_selection_open: ["finished", "cancelled"],
    review: ["finished", "cancelled"],
    finished: ["results_revoked"],
    results_revoked: ["finished", "cancelled"],
    cancelled: [],
  },

  // Mode: vote_only (Community Voting Only)
  vote_only: {
    draft: ["scheduled", "cancelled"],
    scheduled: ["submission_open", "cancelled"],
    submission_open: ["cancelled"],
    submission_locked: ["cancelled"],
    voting_open: ["cancelled"],
    tie_pending: ["cancelled"],
    tiebreak_open: ["cancelled"],
    review: ["finished", "cancelled"],
    finished: ["results_revoked"],
    results_revoked: ["finished", "cancelled"],
    cancelled: [],
  },

  // Mode: jury_only (Jury Selection Only)
  jury_only: {
    draft: ["scheduled", "cancelled"],
    scheduled: ["submission_open", "cancelled"],
    submission_open: ["cancelled"],
    submission_locked: ["jury_selection_open", "cancelled"],
    jury_selection_open: ["finished", "cancelled"],
    review: ["finished", "cancelled"],
    finished: ["results_revoked"],
    results_revoked: ["finished", "cancelled"],
    cancelled: [],
  },

  // Mode: showcase_only (Showcase / Curated Portfolio Submissions)
  showcase_only: {
    draft: ["scheduled", "cancelled"],
    scheduled: ["submission_open", "cancelled"],
    submission_open: ["cancelled"],
    submission_locked: ["review", "finished", "cancelled"],
    review: ["finished", "cancelled"],
    finished: ["results_revoked"],
    results_revoked: ["finished", "cancelled"],
    cancelled: [],
  },
};

export function getLegalTransitionsForChallenge(
  awardMode: string,
  currentStatus: string,
  pausedPreviousStatus?: string | null
): string[] {
  const modeMatrix = LEGAL_TRANSITIONS[awardMode] || LEGAL_TRANSITIONS.vote_and_jury;
  
  if (currentStatus === "paused") {
    if (pausedPreviousStatus && pausedPreviousStatus !== "paused") {
      return [pausedPreviousStatus, "cancelled"];
    }
    return ["cancelled"];
  }

  return modeMatrix[currentStatus] || [];
}

/**
 * Service: Transition Challenge Lifecycle Status
 */
export async function transitionChallengeStatusService(
  dbOrTx: any,
  actor: ServiceContext,
  challengeId: string,
  newStatus: EffectiveChallengeStatus,
  options?: {
    reason?: string;
    submissionDeadline?: Date | string | null;
    votingDeadline?: Date | string | null;
  }
) {
  if (actor.role !== "admin" && actor.role !== "moderator") {
    throw new Error("Tidak memiliki izin mengubah status challenge.");
  }

  // Protected Transitions: REVIEW -> FINISHED and FINISHED -> RESULTS_REVOKED must go through their dedicated services
  if (newStatus === "finished") {
    throw new Error(
      "Transisi langsung ke 'finished' dilarang. Gunakan layanan publishJuryChallengeResultsService atau finalizeVotingRoundService untuk menyelesaikan challenge."
    );
  }
  if (newStatus === "results_revoked") {
    throw new Error(
      "Transisi langsung ke 'results_revoked' dilarang. Gunakan layanan revokeChallengeResultsService untuk mencabut hasil dengan alasan dan audit log yang valid."
    );
  }

  // Protected Voting & Tie Resolution Transitions
  if (["tie_pending", "tiebreak_open"].includes(newStatus)) {
    throw new Error(
      `Transisi langsung ke '${newStatus}' dilarang melalui aksi umum. Gunakan finalizeVotingRoundService atau startTiebreakService.`
    );
  }
  if (newStatus === "voting_open") {
    throw new Error(
      "Transisi langsung ke 'voting_open' dilarang. Pembukaan babak voting harus dilakukan secara otomatis oleh scheduler saat votingStartsAt tercapai."
    );
  }
  if (newStatus === "submission_locked") {
    throw new Error(
      "Transisi langsung ke 'submission_locked' dilarang. Penguncian submisi harus dilakukan secara otomatis oleh scheduler saat submissionDeadline tercapai."
    );
  }
  if (newStatus === "paused") {
    throw new Error(
      "Status 'paused' telah dinonaktifkan dalam alur operasional Blueprint 2.2.1."
    );
  }

  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .for("update")
    .limit(1);

  if (!challenge) throw new Error("Challenge tidak ditemukan.");

  const currentStatus = challenge.status;

  if (newStatus === "jury_selection_open") {
    throw new Error(
      "Transisi langsung ke 'jury_selection_open' dilarang. Sesi penjurian hanya dapat dibuka secara otomatis melalui scheduler (setelah validasi readiness juri) atau melalui layanan voting/tiebreak Gate B."
    );
  }

  if (currentStatus === "jury_selection_open") {
    throw new Error(
      "Transisi langsung dari 'jury_selection_open' dilarang. Gunakan publishJuryChallengeResultsService untuk publikasi atau cancelJuryChallengeService untuk pembatalan (Blueprint 2.2.1)."
    );
  }


  if (
    ["voting_open", "tiebreak_open", "tie_pending"].includes(currentStatus) &&
    ["finished", "jury_selection_open", "tie_pending", "tiebreak_open"].includes(newStatus)
  ) {
    throw new Error(
      `Transisi dari '${currentStatus}' ke '${newStatus}' dilarang melalui aksi umum. Gunakan finalizeVotingRoundService atau resolveTieManuallyService.`
    );
  }

  const allowedTransitions = getLegalTransitionsForChallenge(
    challenge.awardMode,
    currentStatus,
    challenge.pausedPreviousStatus
  );

  if (
    newStatus === "review" &&
    challenge.awardMode !== "showcase_only" &&
    currentStatus !== "results_revoked"
  ) {
    throw new Error(
      `Transisi langsung ke 'review' tidak diizinkan untuk mode '${challenge.awardMode}'. Gunakan computeChallengeResultsService untuk menghitung hasil.`
    );
  }

  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(
      `Transisi status ilegal: dari "${currentStatus}" ke "${newStatus}" untuk mode "${challenge.awardMode}". Transisi yang diizinkan: ${
        allowedTransitions.length > 0 ? allowedTransitions.join(", ") : "Tidak ada (status terminal)"
      }.`
    );
  }

  const now = new Date();
  const updateData: any = {
    updatedAt: now,
  };

  updateData.status = newStatus;

  if (currentStatus === "paused") {
    updateData.pausedPreviousStatus = null;
  }

  if (newStatus === "cancelled") {
    updateData.cancellationReason = options?.reason || "Dibatalkan oleh moderator/admin";
  }

  // Update Challenge
  await dbOrTx
    .update(challenges)
    .set(updateData)
    .where(eq(challenges.id, challengeId));

  // Write Audit Log
  await dbOrTx.insert(auditLogs).values({
    actorId: actor.userId,
    action: `challenge.transition_${newStatus}`,
    targetType: "challenge",
    targetId: challengeId,
    reason: options?.reason || `Transisi status dari ${currentStatus} ke ${newStatus}`,
  });

  return { success: true, newStatus };
}

/**
 * Service: Revoke Published Challenge Results (RESULTS_REVOKED)
 */
export async function revokeChallengeResultsService(
  dbOrTx: any,
  actor: ServiceContext,
  challengeId: string,
  reason: string
) {
  if (actor.role !== "admin" && actor.role !== "moderator") {
    throw new Error("Hanya administrator atau moderator yang dapat mencabut hasil challenge.");
  }

  if (!reason || reason.trim().length < 5) {
    throw new Error("Alasan pencabutan hasil resmi harus diisi dengan jelas.");
  }

  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .for("update")
    .limit(1);

  if (!challenge) throw new Error("Challenge tidak ditemukan.");
  if (challenge.status !== "finished") {
    throw new Error(`Hanya challenge berstatus "finished" yang dapat dicabut hasilnya (Status saat ini: "${challenge.status}").`);
  }

  // Snapshot existing published results into audit history before unpublishing
  const existingResults = await dbOrTx
    .select()
    .from(challengeResults)
    .where(eq(challengeResults.challengeId, challengeId));

  // 1. Transition challenge to results_revoked
  await dbOrTx
    .update(challenges)
    .set({
      status: "results_revoked",
      updatedAt: new Date(),
    })
    .where(eq(challenges.id, challengeId));

  // 2. Hide existing results from public visibility
  await dbOrTx
    .update(challengeResults)
    .set({ isPublished: false })
    .where(eq(challengeResults.challengeId, challengeId));

  // 3. Write Audit Log with Snapshot
  await dbOrTx.insert(auditLogs).values({
    actorId: actor.userId,
    action: "challenge.revoke_results",
    targetType: "challenge",
    targetId: challengeId,
    reason: `Pencabutan hasil resmi: ${reason.trim()}`,
    metadata: {
      revokedAt: new Date().toISOString(),
      reason: reason.trim(),
      previousResultsSnapshot: existingResults,
    },
  });

  return { success: true, outcome: "results_revoked" };
}

/**
 * Service: Deterministic Result Computation & Tie Detection (Stage 1 -> REVIEW)
 */
export async function computeChallengeResultsService(
  dbOrTx: any,
  actor: ServiceContext,
  challengeId: string
) {
  if (actor.role !== "admin" && actor.role !== "moderator") {
    throw new Error("Tidak memiliki izin menghitung hasil challenge.");
  }

  // 1. Lock challenge parent row
  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .for("update")
    .limit(1);

  if (!challenge) throw new Error("Challenge tidak ditemukan.");

  if (challenge.status === "finished") {
    throw new Error(
      "Challenge yang telah selesai (finished) tidak dapat dihitung ulang secara langsung. Hasil harus dicabut terlebih dahulu melalui aksi 'results_revoked'."
    );
  }

  // Strictly reject live voting/tie states - voting results are managed solely by finalizeVotingRoundService / TIE_PENDING
  if (["submission_locked", "voting_open", "tie_pending", "tiebreak_open"].includes(challenge.status)) {
    throw new Error(
      `Penghitungan hasil manual tidak diizinkan pada status "${challenge.status}". Hasil voting komunitas dikelola secara otoritatif melalui finalizeVotingRoundService dan alur TIE_PENDING.`
    );
  }

  // Hard-block legacy compute engine from Gate C live jury/revocation states
  if (["jury_selection_open", "results_revoked"].includes(challenge.status)) {
    throw new Error(
      `Operasi legacy computeChallengeResultsService dilarang pada status "${challenge.status}". Gunakan layanan penjurian dan publikasi Blueprint 2.2.1.`
    );
  }

  // Only allowed during review stage for backward compatibility
  const allowedStatuses = ["review"];
  if (!allowedStatuses.includes(challenge.status)) {
    throw new Error(`Hasil tidak dapat dihitung pada status "${challenge.status}".`);
  }

  // 2. Fetch Configured Winner Slots
  const winnerSlots = await dbOrTx
    .select()
    .from(challengeWinnerSlots)
    .where(eq(challengeWinnerSlots.challengeId, challengeId))
    .orderBy(asc(challengeWinnerSlots.displayOrder), asc(challengeWinnerSlots.rank));

  const jurySlots = winnerSlots.filter((s: any) => s.slotType === "jury_award");

  // 3. Required Jury Slots Completion Check for jury-enabled modes
  const juryAssignments = await dbOrTx
    .select()
    .from(challengeJurySlotAssignments)
    .where(eq(challengeJurySlotAssignments.challengeId, challengeId));

  if (challenge.awardMode === "jury_only" || challenge.awardMode === "vote_and_jury") {
    if (jurySlots.length > 0) {
      const assignedSlotIds = new Set(juryAssignments.map((a: any) => a.winnerSlotId));
      const unassignedSlots = jurySlots.filter((slot: any) => !assignedSlotIds.has(slot.id));
      if (unassignedSlots.length > 0) {
        throw new Error(
          `Finalisasi diblokir: Terdapat ${unassignedSlots.length} slot penghargaan dewan juri yang belum ditetapkan (${unassignedSlots.map((s: any) => s.title).join(", ")}).`
        );
      }
    }
  }

  // 4. Preserve existing authoritative Community Winner if already resolved in Gate B
  const [existingCommunityWinner] = await dbOrTx
    .select()
    .from(challengeResults)
    .where(
      and(
        eq(challengeResults.challengeId, challengeId),
        eq(challengeResults.awardType, "community_vote_winner")
      )
    )
    .limit(1);

  // 5. Snapshot previous results before update
  const previousResults = await dbOrTx
    .select()
    .from(challengeResults)
    .where(eq(challengeResults.challengeId, challengeId));

  if (previousResults.length > 0) {
    await dbOrTx.insert(auditLogs).values({
      actorId: actor.userId,
      action: "challenge.results_snapshot",
      targetType: "challenge",
      targetId: challengeId,
      reason: "Snapshot hasil sebelumnya sebelum penghitungan ulang.",
      metadata: {
        snapshottedAt: new Date().toISOString(),
        previousResults,
      },
    });
  }

  // Delete only previous results and re-insert preserved authoritative community winner + jury results
  await dbOrTx.delete(challengeResults).where(eq(challengeResults.challengeId, challengeId));

  if (existingCommunityWinner) {
    await dbOrTx.insert(challengeResults).values({
      challengeId,
      submissionId: existingCommunityWinner.submissionId,
      winnerSlotId: existingCommunityWinner.winnerSlotId,
      finalRank: 1,
      awardType: "community_vote_winner",
      resolutionMethod: existingCommunityWinner.resolutionMethod,
      sourceVotingRoundId: existingCommunityWinner.sourceVotingRoundId,
      totalCommunityStars: existingCommunityWinner.totalCommunityStars,
      isPublished: false,
    });
  }

  const championSubmissionId = existingCommunityWinner?.submissionId;

  // Persist Jury Award Slots (finalRank remains NULL)
  for (const ja of juryAssignments) {
    // Community Winner excluded from jury awards
    if (ja.submissionId !== championSubmissionId) {
      await dbOrTx.insert(challengeResults).values({
        challengeId,
        submissionId: ja.submissionId,
        winnerSlotId: ja.winnerSlotId,
        finalRank: null,
        awardType: "jury_award",
        totalCommunityStars: 0,
        isPublished: false,
      });
    }
  }

  // 6. Transition Challenge to REVIEW stage
  await dbOrTx
    .update(challenges)
    .set({ status: "review", updatedAt: new Date() })
    .where(eq(challenges.id, challengeId));

  await dbOrTx.insert(auditLogs).values({
    actorId: actor.userId,
    action: "challenge.results_computed",
    targetType: "challenge",
    targetId: challengeId,
    reason: "Hasil challenge berhasil dihitung dan siap untuk ditinjau oleh moderator/admin.",
  });

  return {
    success: true,
    outcome: "review_ready" as const,
  };
}

export interface WinnerNotificationPayload {
  userId: string;
  type: string;
  title: string;
  body: string;
  actionUrl: string;
}

/**
 * Service: Explicitly Review and Publish Results (Stage 2: REVIEW -> FINISHED)
 * Note: Returns pending winner notifications for post-commit dispatch.
 */
export async function publishChallengeResultsService(
  dbOrTx: any,
  actor: ServiceContext,
  challengeId: string
): Promise<{
  success: boolean;
  outcome: "published";
  pendingNotifications: WinnerNotificationPayload[];
}> {
  if (actor.role !== "admin" && actor.role !== "moderator") {
    throw new Error("Hanya administrator atau moderator yang dapat mempublikasikan hasil resmi.");
  }

  // 1. Lock challenge row
  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .for("update")
    .limit(1);

  if (!challenge) throw new Error("Challenge tidak ditemukan.");

  if (["jury_selection_open", "results_revoked"].includes(challenge.status)) {
    throw new Error(
      `Operasi legacy publishChallengeResultsService dilarang pada status "${challenge.status}". Gunakan publishJuryChallengeResultsService atau republishChallengeResultsService (Blueprint 2.2.1).`
    );
  }

  if (challenge.status !== "review") {
    throw new Error(`Publikasi hasil ditolak: Challenge harus berada dalam status "review" (Status saat ini: "${challenge.status}").`);
  }

  // 2. Publish Results
  await dbOrTx
    .update(challengeResults)
    .set({ isPublished: true })
    .where(eq(challengeResults.challengeId, challengeId));

  // 3. Transition Challenge to FINISHED
  await dbOrTx
    .update(challenges)
    .set({ status: "finished", updatedAt: new Date() })
    .where(eq(challenges.id, challengeId));

  // 4. Collect Transaction-Safe Notifications for Post-Commit Dispatch
  const winningResults = await dbOrTx
    .select({
      resultId: challengeResults.id,
      submissionId: challengeResults.submissionId,
      finalRank: challengeResults.finalRank,
      awardType: challengeResults.awardType,
      winnerSlotTitle: challengeWinnerSlots.title,
      artistUserId: challengeSubmissions.userId,
    })
    .from(challengeResults)
    .innerJoin(challengeSubmissions, eq(challengeSubmissions.id, challengeResults.submissionId))
    .leftJoin(challengeWinnerSlots, eq(challengeWinnerSlots.id, challengeResults.winnerSlotId))
    .where(eq(challengeResults.challengeId, challengeId));

  const pendingNotifications: WinnerNotificationPayload[] = [];
  for (const wr of winningResults) {
    const title = wr.awardType === "community_rank"
      ? `Selamat! Juara #${wr.finalRank} di ${challenge.title}`
      : `Selamat! Meraih Penghargaan "${wr.winnerSlotTitle || 'Pilihan Juri'}" di ${challenge.title}`;

    pendingNotifications.push({
      userId: wr.artistUserId,
      type: "challenge_winner",
      title,
      body: `Karya Anda resmi meraih penghargaan pada challenge "${challenge.title}".`,
      actionUrl: `/challenges/${challenge.slug}/results`,
    });
  }

  // 5. Write Audit Log
  await dbOrTx.insert(auditLogs).values({
    actorId: actor.userId,
    action: "challenge.publish_results",
    targetType: "challenge",
    targetId: challengeId,
    reason: "Hasil resmi challenge telah disetujui dan dipublikasikan.",
  });

  return {
    success: true,
    outcome: "published" as const,
    pendingNotifications,
  };
}

import { finalizeVotingRoundService } from "./votingService";

/**
 * Service: Materialize Scheduled Status Transitions (Automated Scheduler / Cron)
 * Materializes scheduled transitions and automated round handling under Blueprint 2.2.1.
 */
export async function materializeScheduledTransitionsService(
  dbOrTx: any = defaultDb,
  now: Date = new Date()
) {
  const transitions: Array<{ challengeId: string; from: string; to: string }> = [];

  // 1. Scheduled -> Submission Open
  const scheduledChallenges = await dbOrTx
    .select({
      id: challenges.id,
      submissionStartsAt: challenges.submissionStartsAt,
    })
    .from(challenges)
    .where(
      and(
        eq(challenges.status, "scheduled"),
        lte(challenges.submissionStartsAt, now)
      )
    );

  for (const ch of scheduledChallenges) {
    const performTransition = async (tx: any) => {
      const updated = await tx
        .update(challenges)
        .set({ status: "submission_open", updatedAt: now })
        .where(
          and(
            eq(challenges.id, ch.id),
            eq(challenges.status, "scheduled") // Concurrency conditional check
          )
        )
        .returning({ id: challenges.id });

      if (updated.length > 0) {
        await tx.insert(auditLogs).values({
          action: "scheduler.challenge_submission_opened",
          targetType: "challenge",
          targetId: ch.id,
          reason: `Otomatis membuka submisi karena waktu mulai (${ch.submissionStartsAt?.toISOString()}) telah tercapai.`,
        });
        return true;
      }
      return false;
    };

    const succeeded = typeof dbOrTx.transaction === "function"
      ? await dbOrTx.transaction(async (tx: any) => performTransition(tx))
      : await performTransition(dbOrTx);

    if (succeeded) {
      transitions.push({ challengeId: ch.id, from: "scheduled", to: "submission_open" });
    }
  }

  // 2. Submission Open -> Submission Locked / Mode Branching
  const openChallenges = await dbOrTx
    .select()
    .from(challenges)
    .where(
      and(
        eq(challenges.status, "submission_open"),
        lte(challenges.submissionDeadline, now)
      )
    );

  for (const ch of openChallenges) {
    const performLockTransition = async (tx: any) => {
      // Re-verify challenge is still submission_open under parent lock
      const [challenge] = await tx
        .select()
        .from(challenges)
        .where(
          and(
            eq(challenges.id, ch.id),
            eq(challenges.status, "submission_open")
          )
        )
        .for("update")
        .limit(1);

      if (!challenge) return null;

      // Count valid submissions
      const validSubmissions = await tx
        .select({
          id: challengeSubmissions.id,
          userId: challengeSubmissions.userId,
        })
        .from(challengeSubmissions)
        .where(
          and(
            eq(challengeSubmissions.challengeId, challenge.id),
            eq(challengeSubmissions.submissionStatus, "submitted")
          )
        )
        .orderBy(asc(challengeSubmissions.createdAt));

      const subCount = validSubmissions.length;
      let targetStatus: EffectiveChallengeStatus = "submission_locked";

      if (subCount === 0) {
        // Zero submissions -> Cancelled
        targetStatus = "cancelled";
        await tx
          .update(challenges)
          .set({ status: targetStatus, cancellationReason: "Otomatis dibatalkan: Tidak ada karya yang disubmit.", updatedAt: now })
          .where(eq(challenges.id, challenge.id));

        await tx.insert(auditLogs).values({
          action: "scheduler.challenge_cancelled_no_submissions",
          targetType: "challenge",
          targetId: challenge.id,
          reason: "Challenge dibatalkan otomatis karena tidak memiliki submisi valid pada batas waktu pengumpulan.",
        });
      } else if (subCount === 1) {
        if (challenge.awardMode === "vote_only" || challenge.awardMode === "vote_and_jury") {
          // Exactly 1 submission in voting-enabled mode -> automatic Community Winner -> FINISHED
          targetStatus = "finished";
          const singleSub = validSubmissions[0];

          await tx
            .delete(challengeResults)
            .where(
              and(
                eq(challengeResults.challengeId, challenge.id),
                eq(challengeResults.awardType, "community_vote_winner")
              )
            );

          await tx.insert(challengeResults).values({
            challengeId: challenge.id,
            submissionId: singleSub.id,
            finalRank: 1,
            awardType: "community_vote_winner",
            totalCommunityStars: 0,
            resolutionMethod: "automatic_single_submission",
            isPublished: true,
          });

          await tx
            .update(challenges)
            .set({ status: targetStatus, updatedAt: now })
            .where(eq(challenges.id, challenge.id));

          await tx.insert(auditLogs).values({
            action: "scheduler.challenge_single_submission_winner",
            targetType: "challenge",
            targetId: challenge.id,
            reason: "Pemenang komunitas tunggal ditetapkan secara otomatis karena hanya terdapat 1 karya submisi valid.",
          });

          await autoAddChallengeSubmissionsToPortfolioService(tx, challenge.id);
        } else if (challenge.awardMode === "jury_only") {
          const readiness = await validateJuryPhaseReadinessService(tx, challenge.id);
          if (readiness.ready) {
            targetStatus = "jury_selection_open";
            await tx
              .update(challenges)
              .set({ status: targetStatus, updatedAt: now })
              .where(eq(challenges.id, challenge.id));

            await tx.insert(auditLogs).values({
              action: "scheduler.challenge_jury_selection_opened",
              targetType: "challenge",
              targetId: challenge.id,
              reason: "Submisi ditutup, lanjut ke tahap penjurian (jury_only).",
            });
          } else {
            targetStatus = "submission_locked";
            await tx
              .update(challenges)
              .set({ status: targetStatus, updatedAt: now })
              .where(eq(challenges.id, challenge.id));

            await tx.insert(auditLogs).values({
              action: "scheduler.challenge_jury_selection_blocked_unready",
              targetType: "challenge",
              targetId: challenge.id,
              reason: `Tahap penjurian diblokir karena panel juri belum siap: ${readiness.reason}`,
            });
          }
        } else if (challenge.awardMode === "showcase_only") {
          targetStatus = "finished";
          await tx
            .update(challenges)
            .set({ status: targetStatus, updatedAt: now })
            .where(eq(challenges.id, challenge.id));

          await tx.insert(auditLogs).values({
            action: "scheduler.challenge_finished_showcase",
            targetType: "challenge",
            targetId: challenge.id,
            reason: "Submisi ditutup, challenge showcase_only otomatis selesai.",
          });

          await autoAddChallengeSubmissionsToPortfolioService(tx, challenge.id);
        }
      } else {
        // subCount >= 2
        if (challenge.awardMode === "jury_only") {
          const readiness = await validateJuryPhaseReadinessService(tx, challenge.id);
          if (readiness.ready) {
            targetStatus = "jury_selection_open";
            await tx
              .update(challenges)
              .set({ status: targetStatus, updatedAt: now })
              .where(eq(challenges.id, challenge.id));

            await tx.insert(auditLogs).values({
              action: "scheduler.challenge_jury_selection_opened",
              targetType: "challenge",
              targetId: challenge.id,
              reason: "Submisi ditutup, lanjut ke tahap penjurian (jury_only).",
            });
          } else {
            targetStatus = "submission_locked";
            await tx
              .update(challenges)
              .set({ status: targetStatus, updatedAt: now })
              .where(eq(challenges.id, challenge.id));

            await tx.insert(auditLogs).values({
              action: "scheduler.challenge_jury_selection_blocked_unready",
              targetType: "challenge",
              targetId: challenge.id,
              reason: `Tahap penjurian diblokir karena panel juri belum siap: ${readiness.reason}`,
            });
          }
        } else if (challenge.awardMode === "showcase_only") {
          targetStatus = "finished";
          await tx
            .update(challenges)
            .set({ status: targetStatus, updatedAt: now })
            .where(eq(challenges.id, challenge.id));

          await autoAddChallengeSubmissionsToPortfolioService(tx, challenge.id);
        } else {
          // vote_only or vote_and_jury with >= 2 submissions
          targetStatus = "submission_locked";
          await tx
            .update(challenges)
            .set({ status: targetStatus, updatedAt: now })
            .where(eq(challenges.id, challenge.id));

          // Create Main Voting Round & Freeze Candidates Snapshot
          const [existingRound] = await tx
            .select()
            .from(challengeVotingRounds)
            .where(
              and(
                eq(challengeVotingRounds.challengeId, challenge.id),
                eq(challengeVotingRounds.roundType, "main")
              )
            )
            .limit(1);

          let roundId = existingRound?.id;
          if (!existingRound) {
            const [newRound] = await tx
              .insert(challengeVotingRounds)
              .values({
                challengeId: challenge.id,
                roundType: "main",
                roundSequence: 1,
                status: "pending",
                startsAt: challenge.votingStartsAt || now,
                deadline: challenge.votingDeadline,
                starsPerMember: challenge.starsPerMember || 1,
              })
              .returning();
            roundId = newRound.id;
          }

          if (roundId) {
            for (const sub of validSubmissions) {
              await tx
                .insert(challengeVotingRoundCandidates)
                .values({
                  votingRoundId: roundId,
                  submissionId: sub.id,
                })
                .onConflictDoNothing();
            }
          }

          await tx.insert(auditLogs).values({
            action: "scheduler.challenge_submission_locked",
            targetType: "challenge",
            targetId: challenge.id,
            reason: `Otomatis mengunci submisi dan membekukan ${subCount} kandidat karya untuk voting.`,
          });
        }
      }

      return targetStatus;
    };

    const targetStatus = typeof dbOrTx.transaction === "function"
      ? await dbOrTx.transaction(async (tx: any) => performLockTransition(tx))
      : await performLockTransition(dbOrTx);

    if (targetStatus) {
      transitions.push({ challengeId: ch.id, from: "submission_open", to: targetStatus });
    }
  }

  // 3. Submission Locked -> Voting Open (when votingStartsAt <= now)
  const lockedChallenges = await dbOrTx
    .select()
    .from(challenges)
    .where(
      and(
        eq(challenges.status, "submission_locked"),
        lte(challenges.votingStartsAt, now)
      )
    );

  for (const ch of lockedChallenges) {
    if (ch.awardMode === "vote_only" || ch.awardMode === "vote_and_jury") {
      const performVotingOpen = async (tx: any) => {
        const [challenge] = await tx
          .select()
          .from(challenges)
          .where(
            and(
              eq(challenges.id, ch.id),
              eq(challenges.status, "submission_locked")
            )
          )
          .for("update")
          .limit(1);

        if (!challenge) return false;

        // Open main round
        await tx
          .update(challengeVotingRounds)
          .set({ status: "open", startsAt: challenge.votingStartsAt || now, updatedAt: now })
          .where(
            and(
              eq(challengeVotingRounds.challengeId, challenge.id),
              eq(challengeVotingRounds.roundType, "main")
            )
          );

        await tx
          .update(challenges)
          .set({ status: "voting_open", updatedAt: now })
          .where(eq(challenges.id, challenge.id));

        await tx.insert(auditLogs).values({
          action: "scheduler.challenge_voting_opened",
          targetType: "challenge",
          targetId: challenge.id,
          reason: "Babak voting komunitas dibuka secara otomatis sesuai jadwal.",
        });

        return true;
      };

      const succeeded = typeof dbOrTx.transaction === "function"
        ? await dbOrTx.transaction(async (tx: any) => performVotingOpen(tx))
        : await performVotingOpen(dbOrTx);

      if (succeeded) {
        transitions.push({ challengeId: ch.id, from: "submission_locked", to: "voting_open" });
      }
    }
  }

  // 4. Open Voting Rounds -> Finalize at Deadline
  const expiredOpenRounds = await dbOrTx
    .select({
      id: challengeVotingRounds.id,
      challengeId: challengeVotingRounds.challengeId,
      roundType: challengeVotingRounds.roundType,
      deadline: challengeVotingRounds.deadline,
    })
    .from(challengeVotingRounds)
    .where(
      and(
        eq(challengeVotingRounds.status, "open"),
        lte(challengeVotingRounds.deadline, now)
      )
    );

  for (const round of expiredOpenRounds) {
    const performFinalize = async (tx: any) => {
      return await finalizeVotingRoundService(
        tx,
        { userId: null, role: "system" },
        { votingRoundId: round.id }
      );
    };

    const res = typeof dbOrTx.transaction === "function"
      ? await dbOrTx.transaction(async (tx: any) => performFinalize(tx))
      : await performFinalize(dbOrTx);

    if (res?.success) {
      transitions.push({
        challengeId: round.challengeId,
        from: `round_${round.roundType}_open`,
        to: res.outcome,
      });
    }
  }

  return {
    processedCount: transitions.length,
    transitions,
  };
}

