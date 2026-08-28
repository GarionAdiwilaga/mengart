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

export interface ServiceContext {
  userId: string;
  role: string;
}

/**
 * Blueprint 2.1 Configuration-Aware Legal Transition Matrix
 */
export const LEGAL_TRANSITIONS: Record<string, Record<string, string[]>> = {
  // Mode: vote_and_jury (Standard Community Voting + Jury Awards)
  vote_and_jury: {
    draft: ["scheduled", "cancelled"],
    scheduled: ["submission_open", "cancelled", "paused"],
    submission_open: ["submission_locked", "cancelled", "paused"],
    submission_locked: ["voting_open", "cancelled", "paused"],
    voting_open: ["tiebreak_open", "jury_selection_open", "review", "cancelled", "paused"],
    tiebreak_open: ["jury_selection_open", "review", "cancelled", "paused"],
    jury_selection_open: ["review", "cancelled", "paused"],
    review: ["finished", "cancelled", "paused"],
    finished: ["results_revoked"],
    results_revoked: ["review", "cancelled"],
    paused: [], // Handled dynamically from pausedPreviousStatus
    cancelled: [],
  },

  // Mode: vote_only (Community Voting Only)
  vote_only: {
    draft: ["scheduled", "cancelled"],
    scheduled: ["submission_open", "cancelled", "paused"],
    submission_open: ["submission_locked", "cancelled", "paused"],
    submission_locked: ["voting_open", "cancelled", "paused"],
    voting_open: ["tiebreak_open", "review", "cancelled", "paused"],
    tiebreak_open: ["review", "cancelled", "paused"],
    review: ["finished", "cancelled", "paused"],
    finished: ["results_revoked"],
    results_revoked: ["review", "cancelled"],
    paused: [],
    cancelled: [],
  },

  // Mode: jury_only (Jury Selection Only)
  jury_only: {
    draft: ["scheduled", "cancelled"],
    scheduled: ["submission_open", "cancelled", "paused"],
    submission_open: ["submission_locked", "cancelled", "paused"],
    submission_locked: ["jury_selection_open", "cancelled", "paused"],
    jury_selection_open: ["review", "cancelled", "paused"],
    review: ["finished", "cancelled", "paused"],
    finished: ["results_revoked"],
    results_revoked: ["review", "cancelled"],
    paused: [],
    cancelled: [],
  },

  // Mode: showcase_only (Showcase / Curated Portfolio Submissions)
  showcase_only: {
    draft: ["scheduled", "cancelled"],
    scheduled: ["submission_open", "cancelled", "paused"],
    submission_open: ["submission_locked", "cancelled", "paused"],
    submission_locked: ["review", "cancelled", "paused"],
    review: ["finished", "cancelled", "paused"],
    finished: ["results_revoked"],
    results_revoked: ["review", "cancelled"],
    paused: [],
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
      "Transisi langsung ke 'finished' dilarang. Gunakan layanan publishChallengeResultsService untuk mempublikasikan hasil secara resmi."
    );
  }
  if (newStatus === "results_revoked") {
    throw new Error(
      "Transisi langsung ke 'results_revoked' dilarang. Gunakan layanan revokeChallengeResultsService untuk mencabut hasil dengan alasan dan audit log yang valid."
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
  const allowedTransitions = getLegalTransitionsForChallenge(
    challenge.awardMode,
    currentStatus,
    challenge.pausedPreviousStatus
  );

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

  // If pausing, store current status in pausedPreviousStatus
  if (newStatus === "paused") {
    updateData.status = "paused";
    updateData.pausedPreviousStatus = currentStatus;
  } else if (currentStatus === "paused") {
    // If resuming, validate that deadlines remain viable or have been updated
    updateData.status = newStatus;
    updateData.pausedPreviousStatus = null;

    if (newStatus === "submission_open") {
      const activeDeadline = options?.submissionDeadline
        ? new Date(options.submissionDeadline)
        : challenge.submissionDeadline
        ? new Date(challenge.submissionDeadline)
        : null;

      if (activeDeadline && activeDeadline <= now) {
        throw new Error(
          "Tidak dapat melanjutkan challenge ke 'submission_open': Batas waktu submisi telah terlewati saat challenge dijeda. Harap perbarui deadline submisi sebelum melanjutkan."
        );
      }
      if (options?.submissionDeadline) {
        updateData.submissionDeadline = new Date(options.submissionDeadline);
      }
    }

    if (newStatus === "voting_open" || newStatus === "tiebreak_open") {
      // Look up active voting round deadline
      const [activeRound] = await dbOrTx
        .select()
        .from(challengeVotingRounds)
        .where(
          and(
            eq(challengeVotingRounds.challengeId, challengeId),
            eq(challengeVotingRounds.roundType, newStatus === "tiebreak_open" ? "tiebreak" : "main")
          )
        )
        .orderBy(desc(challengeVotingRounds.roundSequence))
        .limit(1);

      const activeDeadline = options?.votingDeadline
        ? new Date(options.votingDeadline)
        : activeRound?.deadline
        ? new Date(activeRound.deadline)
        : challenge.votingDeadline
        ? new Date(challenge.votingDeadline)
        : null;

      if (activeDeadline && activeDeadline <= now) {
        throw new Error(
          `Tidak dapat melanjutkan challenge ke sesi voting (${newStatus}): Batas waktu voting ronde telah terlewati saat challenge dijeda. Harap perbarui deadline voting sebelum melanjutkan.`
        );
      }
      if (options?.votingDeadline) {
        updateData.votingDeadline = new Date(options.votingDeadline);
        if (activeRound) {
          await dbOrTx
            .update(challengeVotingRounds)
            .set({ deadline: new Date(options.votingDeadline), updatedAt: now })
            .where(eq(challengeVotingRounds.id, activeRound.id));
        }
      }
    }
  } else {
    updateData.status = newStatus;
  }

  if (newStatus === "cancelled") {
    updateData.cancellationReason = options?.reason || "Dibatalkan oleh moderator/admin";
  }

  // Entering VOTING_OPEN: Automatically Create & Freeze Main Voting Round Candidates if not present
  if (newStatus === "voting_open") {
    const existingRounds = await dbOrTx
      .select()
      .from(challengeVotingRounds)
      .where(
        and(
          eq(challengeVotingRounds.challengeId, challengeId),
          eq(challengeVotingRounds.roundType, "main")
        )
      );

    if (existingRounds.length === 0) {
      const activeSubmissions = await dbOrTx
        .select({ id: challengeSubmissions.id })
        .from(challengeSubmissions)
        .where(
          and(
            eq(challengeSubmissions.challengeId, challengeId),
            eq(challengeSubmissions.submissionStatus, "submitted")
          )
        );

      const [mainRound] = await dbOrTx
        .insert(challengeVotingRounds)
        .values({
          challengeId,
          roundType: "main",
          roundSequence: 1,
          status: "open",
          startsAt: now,
          deadline: options?.votingDeadline ? new Date(options.votingDeadline) : challenge.votingDeadline,
          starsPerMember: challenge.starsPerMember,
        })
        .returning();

      if (activeSubmissions.length > 0) {
        await dbOrTx.insert(challengeVotingRoundCandidates).values(
          activeSubmissions.map((sub: any) => ({
            votingRoundId: mainRound.id,
            submissionId: sub.id,
          }))
        );
      }
    }
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

  // Allow computation from voting_open, tiebreak_open, jury_selection_open, submission_locked, review, or results_revoked
  const allowedStatuses = [
    "voting_open",
    "tiebreak_open",
    "jury_selection_open",
    "submission_locked",
    "review",
    "results_revoked",
  ];
  if (!allowedStatuses.includes(challenge.status)) {
    throw new Error(`Hasil tidak dapat dihitung pada status "${challenge.status}".`);
  }

  // 2. Fetch Configured Winner Slots
  const winnerSlots = await dbOrTx
    .select()
    .from(challengeWinnerSlots)
    .where(eq(challengeWinnerSlots.challengeId, challengeId))
    .orderBy(asc(challengeWinnerSlots.displayOrder), asc(challengeWinnerSlots.rank));

  const communitySlots = winnerSlots.filter((s: any) => s.slotType === "community_vote");
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

  // 4. Tabulate Main & Tiebreak Stars Deterministically
  const starTallies = await dbOrTx
    .select({
      submissionId: challengeSubmissions.id,
      artistUserId: challengeSubmissions.userId,
      createdAt: challengeSubmissions.createdAt,
      totalMainStars: sql<number>`COALESCE(SUM(CASE WHEN ${challengeBallots.roundType} = 'main' THEN ${challengeBallotStars.starsCount} ELSE 0 END), 0)::int`,
      totalTiebreakStars: sql<number>`COALESCE(SUM(CASE WHEN ${challengeBallots.roundType} = 'tiebreak' THEN ${challengeBallotStars.starsCount} ELSE 0 END), 0)::int`,
    })
    .from(challengeSubmissions)
    .leftJoin(challengeBallotStars, eq(challengeBallotStars.submissionId, challengeSubmissions.id))
    .leftJoin(challengeBallots, eq(challengeBallots.id, challengeBallotStars.ballotId))
    .where(
      and(
        eq(challengeSubmissions.challengeId, challengeId),
        eq(challengeSubmissions.submissionStatus, "submitted")
      )
    )
    .groupBy(challengeSubmissions.id, challengeSubmissions.userId, challengeSubmissions.createdAt)
    .orderBy(
      desc(sql`COALESCE(SUM(CASE WHEN ${challengeBallots.roundType} = 'main' THEN ${challengeBallotStars.starsCount} ELSE 0 END), 0)::int`),
      desc(sql`COALESCE(SUM(CASE WHEN ${challengeBallots.roundType} = 'tiebreak' THEN ${challengeBallotStars.starsCount} ELSE 0 END), 0)::int`),
      asc(challengeSubmissions.createdAt),
      asc(challengeSubmissions.id)
    );

  // 5. Detect Cutoff Ties for Community Vote Challenges
  const communityCutoffCount = communitySlots.length;
  if (
    communityCutoffCount > 0 &&
    starTallies.length > communityCutoffCount &&
    challenge.tieStrategy === "tiebreak_round" &&
    challenge.status !== "tiebreak_open" &&
    challenge.status !== "review"
  ) {
    const cutoffSub = starTallies[communityCutoffCount - 1];
    const nextSub = starTallies[communityCutoffCount];

    if (cutoffSub.totalMainStars === nextSub.totalMainStars && cutoffSub.totalMainStars > 0) {
      // Find all tied entries at this exact cutoff score
      const tiedScore = cutoffSub.totalMainStars;
      const tiedCandidates = starTallies.filter((s: any) => s.totalMainStars === tiedScore);

      // Close the main round
      await dbOrTx
        .update(challengeVotingRounds)
        .set({ status: "closed", finalizedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(challengeVotingRounds.challengeId, challengeId),
            eq(challengeVotingRounds.roundType, "main")
          )
        );

      // Determine next sequence number
      const existingRounds = await dbOrTx
        .select()
        .from(challengeVotingRounds)
        .where(eq(challengeVotingRounds.challengeId, challengeId));

      const maxSeq = existingRounds.reduce((max: number, r: any) => Math.max(max, r.roundSequence), 1);
      const nextSeq = maxSeq + 1;

      // Create Tiebreak Voting Round
      const tiebreakDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours default
      const [tiebreakRound] = await dbOrTx
        .insert(challengeVotingRounds)
        .values({
          challengeId,
          roundType: "tiebreak",
          roundSequence: nextSeq,
          status: "open",
          startsAt: new Date(),
          deadline: tiebreakDeadline,
          starsPerMember: 1,
        })
        .returning();

      // Freeze Tied Candidates
      await dbOrTx.insert(challengeVotingRoundCandidates).values(
        tiedCandidates.map((tc: any) => ({
          votingRoundId: tiebreakRound.id,
          submissionId: tc.submissionId,
        }))
      );

      // Transition challenge to tiebreak_open cleanly and COMMIT transaction
      await dbOrTx
        .update(challenges)
        .set({ status: "tiebreak_open", updatedAt: new Date() })
        .where(eq(challenges.id, challengeId));

      await dbOrTx.insert(auditLogs).values({
        actorId: actor.userId,
        action: "challenge.tiebreak_created",
        targetType: "challenge",
        targetId: challengeId,
        reason: `Tiebreak round #${nextSeq} dibuat untuk ${tiedCandidates.length} karya dengan skor sama (${tiedScore} Stars).`,
      });

      return {
        success: true,
        outcome: "tiebreak_created" as const,
        votingRoundId: tiebreakRound.id,
        tiedCandidatesCount: tiedCandidates.length,
      };
    }
  }

  // 6. Snapshot and Persist Calculated Results (ONLY for Configured Winner Slots)
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

  await dbOrTx.delete(challengeResults).where(eq(challengeResults.challengeId, challengeId));

  const championSubmissionId = starTallies[0]?.submissionId;

  // A. Persist Community Podium Ranks
  for (let i = 0; i < communitySlots.length; i++) {
    const slot = communitySlots[i];
    const sub = starTallies[i];
    if (sub) {
      await dbOrTx.insert(challengeResults).values({
        challengeId,
        submissionId: sub.submissionId,
        winnerSlotId: slot.id,
        finalRank: slot.rank || (i + 1),
        awardType: "community_rank",
        totalCommunityStars: sub.totalMainStars + sub.totalTiebreakStars,
        isPublished: false, // Hidden until explicit review publication
      });
    }
  }

  // B. Persist Jury Award Slots (finalRank remains NULL)
  for (const ja of juryAssignments) {
    const sub = starTallies.find((s: any) => s.submissionId === ja.submissionId);
    // Anti-Champion rule: Champion cannot take a jury award
    if (ja.submissionId !== championSubmissionId) {
      await dbOrTx.insert(challengeResults).values({
        challengeId,
        submissionId: ja.submissionId,
        winnerSlotId: ja.winnerSlotId,
        finalRank: null, // Nullable for non-ranked jury award winners
        awardType: "jury_award",
        totalCommunityStars: sub ? sub.totalMainStars + sub.totalTiebreakStars : 0,
        isPublished: false,
      });
    }
  }

  // 7. Transition Challenge to REVIEW stage (Stage 1 Complete)
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

/**
 * Service: Materialize Scheduled Status Transitions (Automated Scheduler / Cron)
 * Materializes SCHEDULED -> SUBMISSION_OPEN and SUBMISSION_OPEN -> SUBMISSION_LOCKED based on persisted timestamps.
 */
export async function materializeScheduledTransitionsService(
  dbOrTx: any = defaultDb,
  now: Date = new Date()
) {
  const transitions: Array<{ challengeId: string; from: string; to: string }> = [];

  // 1. Scheduled -> Submission Open
  const scheduledChallenges = await dbOrTx
    .select()
    .from(challenges)
    .where(
      and(
        eq(challenges.status, "scheduled"),
        lte(challenges.submissionStartsAt, now)
      )
    );

  for (const ch of scheduledChallenges) {
    await dbOrTx
      .update(challenges)
      .set({ status: "submission_open", updatedAt: now })
      .where(eq(challenges.id, ch.id));

    await dbOrTx.insert(auditLogs).values({
      action: "scheduler.challenge_submission_opened",
      targetType: "challenge",
      targetId: ch.id,
      reason: `Otomatis membuka submisi karena waktu mulai (${ch.submissionStartsAt?.toISOString()}) telah tercapai.`,
    });

    transitions.push({ challengeId: ch.id, from: "scheduled", to: "submission_open" });
  }

  // 2. Submission Open -> Submission Locked
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
    await dbOrTx
      .update(challenges)
      .set({ status: "submission_locked", updatedAt: now })
      .where(eq(challenges.id, ch.id));

    await dbOrTx.insert(auditLogs).values({
      action: "scheduler.challenge_submission_locked",
      targetType: "challenge",
      targetId: ch.id,
      reason: `Otomatis mengunci submisi karena deadline (${ch.submissionDeadline?.toISOString()}) telah terlewati.`,
    });

    transitions.push({ challengeId: ch.id, from: "submission_open", to: "submission_locked" });
  }

  return {
    processedCount: transitions.length,
    transitions,
  };
}
