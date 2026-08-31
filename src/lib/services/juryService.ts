import { db as defaultDb } from "@/db";
import {
  challenges,
  challengeSubmissions,
  artworks,
  artworkVersions,
  portfolioEntries,
  profiles,
  challengeJuryAssignments,
  challengeJuryAwards,
  challengeResults,
  challengeVotingRounds,
  challengeBallots,
  challengeBallotStars,
  auditLogs,
  users,
} from "@/db/schema";
import { eq, and, sql, desc, asc, inArray } from "drizzle-orm";
import type { EffectiveChallengeStatus } from "@/lib/challenges";
import { autoAddChallengeSubmissionsToPortfolioService } from "./portfolioService";

export interface ServiceContext {
  userId: string | null;
  role: string;
}

export interface JuryReadinessResult {
  ready: boolean;
  reason?: string;
  recorder?: {
    id: string;
    userId: string;
    profileId: string;
    isRecorder: boolean;
  };
  assignments: Array<{
    id: string;
    userId: string;
    profileId: string;
    isRecorder: boolean;
  }>;
}

/**
 * Service: Validate Jury Phase Readiness
 * Invariant: Before entering JURY_SELECTION_OPEN, a jury-enabled challenge must have >= 1 juror,
 * exactly one designated Recorder, and the Recorder must belong to the challenge jury.
 */
export async function validateJuryPhaseReadinessService(
  dbOrTx: any,
  challengeId: string
): Promise<JuryReadinessResult> {
  const assignments = await dbOrTx
    .select({
      id: challengeJuryAssignments.id,
      userId: challengeJuryAssignments.userId,
      profileId: challengeJuryAssignments.profileId,
      isRecorder: challengeJuryAssignments.isRecorder,
    })
    .from(challengeJuryAssignments)
    .where(eq(challengeJuryAssignments.challengeId, challengeId));

  if (assignments.length === 0) {
    return {
      ready: false,
      reason: "Belum ada dewan juri yang ditugaskan untuk challenge ini.",
      assignments: [],
    };
  }

  const recorders = assignments.filter((a: any) => a.isRecorder);

  if (recorders.length === 0) {
    return {
      ready: false,
      reason: "Belum ada Jury Recorder yang ditunjuk untuk dewan juri challenge ini.",
      assignments,
    };
  }

  if (recorders.length > 1) {
    return {
      ready: false,
      reason: "Terdapat lebih dari satu Jury Recorder yang ditunjuk untuk dewan juri challenge ini.",
      assignments,
    };
  }

  return {
    ready: true,
    recorder: recorders[0],
    assignments,
  };
}

/**
 * Service: Add Jury Assignment
 * Invariant: Admin or Moderator only.
 * Adds displayed juror with is_recorder = false.
 * Prevents duplicate (challenge_id, user_id) assignment.
 * Emits audit log "jury.add_member".
 */
export async function addJuryAssignmentService(
  dbOrTx: any,
  actor: ServiceContext,
  params: { challengeId: string; userId: string }
) {
  if (actor.role !== "admin" && actor.role !== "moderator") {
    throw new Error("Hanya Administrator atau Moderator yang dapat menambah penugasan juri.");
  }

  const { challengeId, userId } = params;

  // 1. Lock parent challenge row
  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .for("update")
    .limit(1);

  if (!challenge) {
    throw new Error("Challenge tidak ditemukan.");
  }

  // 2. Validate target user & profile exist and active
  const [targetUser] = await dbOrTx
    .select({
      userId: users.id,
      profileId: profiles.id,
      displayName: profiles.displayName,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(
      and(
        eq(users.id, userId),
        eq(users.membershipStatus, "active")
      )
    )
    .limit(1);

  if (!targetUser) {
    throw new Error("Pengguna tidak ditemukan atau status keanggotaan tidak aktif.");
  }

  // 3. Prevent duplicate assignment
  const [existing] = await dbOrTx
    .select()
    .from(challengeJuryAssignments)
    .where(
      and(
        eq(challengeJuryAssignments.challengeId, challengeId),
        eq(challengeJuryAssignments.userId, userId)
      )
    )
    .limit(1);

  if (existing) {
    throw new Error("Pengguna sudah ditugaskan sebagai dewan juri pada challenge ini.");
  }

  // 4. Insert displayed juror with is_recorder = false
  const [inserted] = await dbOrTx
    .insert(challengeJuryAssignments)
    .values({
      challengeId,
      userId,
      profileId: targetUser.profileId,
      isRecorder: false,
    })
    .returning();

  // 5. Audit Log
  await dbOrTx.insert(auditLogs).values({
    actorId: actor.userId,
    action: "jury.add_member",
    targetType: "challenge",
    targetId: challengeId,
    reason: `Penambahan dewan juri ${targetUser.displayName} (${userId}) pada challenge ${challengeId}`,
    metadata: {
      targetUserId: userId,
      profileId: targetUser.profileId,
      displayName: targetUser.displayName,
    },
  });

  return { success: true, assignmentId: inserted.id };
}

/**
 * Service: Assign or Reassign Jury Recorder
 * Invariant: Parent challenge locked FOR UPDATE, atomic clear and set, audit log emitted.
 */
export async function assignJuryRecorderService(
  dbOrTx: any,
  actor: ServiceContext,
  params: { challengeId: string; userId: string }
) {
  if (actor.role !== "admin" && actor.role !== "moderator") {
    throw new Error("Hanya Administrator atau Moderator yang dapat menunjuk Jury Recorder.");
  }

  const { challengeId, userId } = params;

  // 1. Lock challenge parent row
  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .for("update")
    .limit(1);

  if (!challenge) {
    throw new Error("Challenge tidak ditemukan.");
  }

  // 2. Fetch all assignments for challenge
  const assignments = await dbOrTx
    .select()
    .from(challengeJuryAssignments)
    .where(eq(challengeJuryAssignments.challengeId, challengeId));

  const targetAssignment = assignments.find((a: any) => a.userId === userId);
  if (!targetAssignment) {
    throw new Error("Pengguna bukan anggota dewan juri yang ditugaskan pada challenge ini.");
  }

  const previousRecorder = assignments.find((a: any) => a.isRecorder);

  // 3. Atomically reset all recorders and assign target
  await dbOrTx
    .update(challengeJuryAssignments)
    .set({ isRecorder: false })
    .where(eq(challengeJuryAssignments.challengeId, challengeId));

  await dbOrTx
    .update(challengeJuryAssignments)
    .set({ isRecorder: true })
    .where(
      and(
        eq(challengeJuryAssignments.challengeId, challengeId),
        eq(challengeJuryAssignments.userId, userId)
      )
    );

  // 4. Audit Log
  await dbOrTx.insert(auditLogs).values({
    actorId: actor.userId,
    action: "jury.set_recorder",
    targetType: "challenge",
    targetId: challengeId,
    reason: `Penetapan Jury Recorder untuk pengguna ${userId}`,
    metadata: {
      previousRecorderUserId: previousRecorder?.userId || null,
      newRecorderUserId: userId,
    },
  });

  return { success: true, challengeId, recorderUserId: userId };
}

/**
 * Service: Remove Jury Assignment
 * Invariant: Cannot remove active Recorder during JURY_SELECTION_OPEN without atomic replacement.
 */
export async function removeJuryAssignmentService(
  dbOrTx: any,
  actor: ServiceContext,
  params: { challengeId: string; userId: string }
) {
  if (actor.role !== "admin" && actor.role !== "moderator") {
    throw new Error("Hanya Administrator atau Moderator yang dapat mengelola penugasan juri.");
  }

  const { challengeId, userId } = params;

  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .for("update")
    .limit(1);

  if (!challenge) throw new Error("Challenge tidak ditemukan.");

  const [assignment] = await dbOrTx
    .select()
    .from(challengeJuryAssignments)
    .where(
      and(
        eq(challengeJuryAssignments.challengeId, challengeId),
        eq(challengeJuryAssignments.userId, userId)
      )
    )
    .limit(1);

  if (!assignment) throw new Error("Penugasan juri tidak ditemukan.");

  if (assignment.isRecorder && challenge.status === "jury_selection_open") {
    throw new Error(
      "Tidak dapat menghapus Jury Recorder yang aktif selama sesi penjurian terbuka tanpa menunjuk pengganti terlebih dahulu."
    );
  }

  await dbOrTx
    .delete(challengeJuryAssignments)
    .where(eq(challengeJuryAssignments.id, assignment.id));

  await dbOrTx.insert(auditLogs).values({
    actorId: actor.userId,
    action: "jury.remove_member",
    targetType: "challenge",
    targetId: challengeId,
    reason: `Penghapusan juri ${userId} dari challenge ${challengeId}`,
  });

  return { success: true };
}

/**
 * Service: Create Dynamic Jury Award
 * Invariant: Recorder / Admin during JURY_SELECTION_OPEN; Admin/Mod during RESULTS_REVOKED.
 * Mixed mode strictly excludes Community Vote Winner.
 * Duplicate artwork requires explicit confirmation.
 */
export async function createJuryAwardService(
  dbOrTx: any,
  actor: ServiceContext,
  params: {
    challengeId: string;
    submissionId: string;
    categoryLabel?: string | null;
    confirmDuplicateSubmission?: boolean;
  }
) {
  const { challengeId, submissionId, categoryLabel, confirmDuplicateSubmission } = params;

  // 1. Lock challenge parent row
  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .for("update")
    .limit(1);

  if (!challenge) throw new Error("Challenge tidak ditemukan.");

  // 2. Lifecycle & Authorization Validation
  if (challenge.status === "jury_selection_open") {
    const readiness = await validateJuryPhaseReadinessService(dbOrTx, challengeId);
    if (!readiness.ready) {
      throw new Error(`Sesi penjurian belum siap: ${readiness.reason}`);
    }

    const isRecorder = readiness.recorder?.userId === actor.userId;
    const isAdmin = actor.role === "admin";

    if (!isRecorder && !isAdmin) {
      throw new Error("Hanya Jury Recorder yang ditunjuk atau Administrator yang dapat mencatat penghargaan juri.");
    }
  } else if (challenge.status === "results_revoked") {
    if (actor.role !== "admin" && actor.role !== "moderator") {
      throw new Error("Hanya Administrator atau Moderator yang dapat mengoreksi penghargaan juri pada status 'results_revoked'.");
    }
  } else {
    throw new Error(`Pencatatan penghargaan juri dilarang pada status "${challenge.status}".`);
  }

  // 3. Candidate Submission Validation
  const [submission] = await dbOrTx
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
    throw new Error("Karya submisi tidak valid atau telah didiskualifikasi.");
  }

  // 4. Mixed Mode Community Winner Exclusion Check
  if (challenge.awardMode === "vote_and_jury") {
    const [communityWinner] = await dbOrTx
      .select({ submissionId: challengeResults.submissionId })
      .from(challengeResults)
      .where(
        and(
          eq(challengeResults.challengeId, challengeId),
          eq(challengeResults.awardType, "community_vote_winner")
        )
      )
      .limit(1);

    if (communityWinner && communityWinner.submissionId === submissionId) {
      throw new Error("Karya pemenang voting komunitas tidak dapat dipilih untuk penghargaan dewan juri (Blueprint 2.2.1).");
    }
  }

  // 5. Duplicate Artwork Award Policy & Confirmation
  const existingAwards = await dbOrTx
    .select({ id: challengeJuryAwards.id })
    .from(challengeJuryAwards)
    .where(
      and(
        eq(challengeJuryAwards.challengeId, challengeId),
        eq(challengeJuryAwards.submissionId, submissionId)
      )
    );

  if (existingAwards.length > 0 && confirmDuplicateSubmission !== true) {
    return {
      success: false,
      requiresConfirmation: true,
      message: "Karya ini sudah menerima penghargaan dewan juri pada challenge ini. Konfirmasi jika ingin memberikan penghargaan tambahan.",
    };
  }

  // 6. Format Category Label
  const formattedCategory = categoryLabel ? categoryLabel.trim().slice(0, 100) : null;

  // 7. Insert Award
  const [newAward] = await dbOrTx
    .insert(challengeJuryAwards)
    .values({
      challengeId,
      submissionId,
      categoryLabel: formattedCategory || null,
      recordedByUserId: actor.userId || null,
    })
    .returning();

  // 8. Audit Log
  await dbOrTx.insert(auditLogs).values({
    actorId: actor.userId,
    action: "jury.create_award",
    targetType: "challenge_jury_award",
    targetId: newAward.id,
    reason: `Pencatatan penghargaan juri "${formattedCategory || 'Jury Winner'}" untuk submisi ${submissionId}`,
    metadata: {
      challengeId,
      submissionId,
      categoryLabel: formattedCategory,
      recordedByUserId: actor.userId,
    },
  });

  return { success: true, award: newAward };
}

/**
 * Service: Update Dynamic Jury Award
 */
export async function updateJuryAwardService(
  dbOrTx: any,
  actor: ServiceContext,
  params: {
    awardId: string;
    submissionId?: string;
    categoryLabel?: string | null;
    confirmDuplicateSubmission?: boolean;
  }
) {
  const { awardId, submissionId, categoryLabel, confirmDuplicateSubmission } = params;

  const [award] = await dbOrTx
    .select()
    .from(challengeJuryAwards)
    .where(eq(challengeJuryAwards.id, awardId))
    .limit(1);

  if (!award) throw new Error("Penghargaan juri tidak ditemukan.");

  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, award.challengeId))
    .for("update")
    .limit(1);

  if (!challenge) throw new Error("Challenge tidak ditemukan.");

  if (challenge.status === "jury_selection_open") {
    const readiness = await validateJuryPhaseReadinessService(dbOrTx, challenge.id);
    if (!readiness.ready) {
      throw new Error(`Sesi penjurian belum siap: ${readiness.reason}`);
    }

    const isRecorder = readiness.recorder?.userId === actor.userId;
    const isAdmin = actor.role === "admin";

    if (!isRecorder && !isAdmin) {
      throw new Error("Hanya Jury Recorder yang ditunjuk atau Administrator yang dapat mengubah penghargaan juri.");
    }
  } else if (challenge.status === "results_revoked") {
    if (actor.role !== "admin" && actor.role !== "moderator") {
      throw new Error("Hanya Administrator atau Moderator yang dapat mengoreksi penghargaan juri pada status 'results_revoked'.");
    }
  } else {
    throw new Error(`Pengubahan penghargaan juri dilarang pada status "${challenge.status}".`);
  }

  const targetSubmissionId = submissionId || award.submissionId;

  if (submissionId && submissionId !== award.submissionId) {
    const [submission] = await dbOrTx
      .select()
      .from(challengeSubmissions)
      .where(
        and(
          eq(challengeSubmissions.id, targetSubmissionId),
          eq(challengeSubmissions.challengeId, challenge.id),
          eq(challengeSubmissions.submissionStatus, "submitted")
        )
      )
      .limit(1);

    if (!submission) {
      throw new Error("Karya submisi tidak valid atau telah didiskualifikasi.");
    }

    if (challenge.awardMode === "vote_and_jury") {
      const [communityWinner] = await dbOrTx
        .select({ submissionId: challengeResults.submissionId })
        .from(challengeResults)
        .where(
          and(
            eq(challengeResults.challengeId, challenge.id),
            eq(challengeResults.awardType, "community_vote_winner")
          )
        )
        .limit(1);

      if (communityWinner && communityWinner.submissionId === targetSubmissionId) {
        throw new Error("Karya pemenang voting komunitas tidak dapat dipilih untuk penghargaan dewan juri (Blueprint 2.2.1).");
      }
    }

    const existingAwards = await dbOrTx
      .select({ id: challengeJuryAwards.id })
      .from(challengeJuryAwards)
      .where(
        and(
          eq(challengeJuryAwards.challengeId, challenge.id),
          eq(challengeJuryAwards.submissionId, targetSubmissionId)
        )
      );

    if (existingAwards.length > 0 && confirmDuplicateSubmission !== true) {
      return {
        success: false,
        requiresConfirmation: true,
        message: "Karya ini sudah menerima penghargaan dewan juri pada challenge ini. Konfirmasi jika ingin memberikan penghargaan tambahan.",
      };
    }
  }

  const formattedCategory = categoryLabel !== undefined
    ? (categoryLabel ? categoryLabel.trim().slice(0, 100) : null)
    : award.categoryLabel;

  const [updated] = await dbOrTx
    .update(challengeJuryAwards)
    .set({
      submissionId: targetSubmissionId,
      categoryLabel: formattedCategory || null,
      updatedAt: new Date(),
    })
    .where(eq(challengeJuryAwards.id, awardId))
    .returning();

  await dbOrTx.insert(auditLogs).values({
    actorId: actor.userId,
    action: "jury.update_award",
    targetType: "challenge_jury_award",
    targetId: awardId,
    reason: `Pembaruan penghargaan juri "${formattedCategory || 'Jury Winner'}"`,
    metadata: {
      challengeId: challenge.id,
      submissionId: targetSubmissionId,
      categoryLabel: formattedCategory,
    },
  });

  return { success: true, award: updated };
}

/**
 * Service: Delete Dynamic Jury Award
 */
export async function deleteJuryAwardService(
  dbOrTx: any,
  actor: ServiceContext,
  params: { awardId: string }
) {
  const { awardId } = params;

  const [award] = await dbOrTx
    .select()
    .from(challengeJuryAwards)
    .where(eq(challengeJuryAwards.id, awardId))
    .limit(1);

  if (!award) throw new Error("Penghargaan juri tidak ditemukan.");

  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, award.challengeId))
    .for("update")
    .limit(1);

  if (!challenge) throw new Error("Challenge tidak ditemukan.");

  if (challenge.status === "jury_selection_open") {
    const readiness = await validateJuryPhaseReadinessService(dbOrTx, challenge.id);
    if (!readiness.ready) {
      throw new Error(`Sesi penjurian belum siap: ${readiness.reason}`);
    }

    const isRecorder = readiness.recorder?.userId === actor.userId;
    const isAdmin = actor.role === "admin";

    if (!isRecorder && !isAdmin) {
      throw new Error("Hanya Jury Recorder yang ditunjuk atau Administrator yang dapat menghapus penghargaan juri.");
    }
  } else if (challenge.status === "results_revoked") {
    if (actor.role !== "admin" && actor.role !== "moderator") {
      throw new Error("Hanya Administrator atau Moderator yang dapat mengoreksi penghargaan juri pada status 'results_revoked'.");
    }
  } else {
    throw new Error(`Penghapusan penghargaan juri dilarang pada status "${challenge.status}".`);
  }

  await dbOrTx
    .delete(challengeJuryAwards)
    .where(eq(challengeJuryAwards.id, awardId));

  await dbOrTx.insert(auditLogs).values({
    actorId: actor.userId,
    action: "jury.delete_award",
    targetType: "challenge_jury_award",
    targetId: awardId,
    reason: `Penghapusan draft penghargaan juri ${awardId}`,
  });

  return { success: true };
}

export interface WinnerNotificationPayload {
  userId: string;
  type: string;
  title: string;
  body: string;
  actionUrl: string;
}

/**
 * Authoritative Helper: Query raw Community Stars strictly from the Main Voting Round.
 * Invariant: Joins challenge_ballots.voting_round_id -> challenge_voting_rounds (round_type = 'main').
 * Tiebreak stars must NOT inflate main-round community totals.
 */
export async function getAuthoritativeMainRoundStarsService(
  dbOrTx: any,
  challengeId: string,
  submissionIds?: string[]
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (submissionIds && submissionIds.length === 0) return result;

  const [mainRound] = await dbOrTx
    .select({ id: challengeVotingRounds.id })
    .from(challengeVotingRounds)
    .where(
      and(
        eq(challengeVotingRounds.challengeId, challengeId),
        eq(challengeVotingRounds.roundType, "main")
      )
    )
    .limit(1);

  if (!mainRound) return result;

  const conditions = [eq(challengeBallots.votingRoundId, mainRound.id)];
  if (submissionIds && submissionIds.length > 0) {
    conditions.push(inArray(challengeBallotStars.submissionId, submissionIds));
  }

  const rows = await dbOrTx
    .select({
      submissionId: challengeBallotStars.submissionId,
      starsCount: sql<number>`COALESCE(SUM(${challengeBallotStars.starsCount}), 0)::int`,
    })
    .from(challengeBallotStars)
    .innerJoin(challengeBallots, eq(challengeBallots.id, challengeBallotStars.ballotId))
    .where(and(...conditions))
    .groupBy(challengeBallotStars.submissionId);

  for (const r of rows) {
    result[r.submissionId] = Number(r.starsCount || 0);
  }

  return result;
}

/**
 * Service: Manual Publication of Jury Results (JURY_SELECTION_OPEN -> FINISHED)
 * Invariant: publishCommunityOnly === true is strictly valid ONLY in vote_and_jury with Community Winner and 0 Jury Awards.
 * Invariant: Existing Gate B Community Winner explicitly set to is_published = true.
 * Invariant: Idempotent upsert by jury_award_id into challenge_results.
 */
export async function publishJuryChallengeResultsService(
  dbOrTx: any,
  actor: ServiceContext,
  params: { challengeId: string; publishCommunityOnly?: boolean }
): Promise<{
  success: boolean;
  outcome: "published";
  pendingNotifications: WinnerNotificationPayload[];
}> {
  const { challengeId, publishCommunityOnly = false } = params;

  // 1. Lock challenge parent row
  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .for("update")
    .limit(1);

  if (!challenge) throw new Error("Challenge tidak ditemukan.");

  if (challenge.status !== "jury_selection_open") {
    throw new Error(
      `Publikasi hasil juri ditolak: Challenge harus berada dalam status "jury_selection_open" (Status saat ini: "${challenge.status}").`
    );
  }

  // 2. Readiness Check (Enforced before authorization check)
  const readiness = await validateJuryPhaseReadinessService(dbOrTx, challengeId);
  if (!readiness.ready) {
    throw new Error(
      `Publikasi hasil juri ditolak: Sesi penjurian belum siap (${readiness.reason}). Panel harus memiliki tepat satu Jury Recorder.`
    );
  }

  const isRecorder = readiness.recorder?.userId === actor.userId;
  const isModOrAdmin = actor.role === "admin" || actor.role === "moderator";

  if (!isRecorder && !isModOrAdmin) {
    throw new Error("Hanya Jury Recorder yang ditunjuk, Moderator, atau Administrator yang dapat mempublikasikan hasil.");
  }

  // 3. Fetch current Jury Awards & Community Winner
  const juryAwards = await dbOrTx
    .select()
    .from(challengeJuryAwards)
    .where(eq(challengeJuryAwards.challengeId, challengeId));

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

  // Revalidate every current Jury Award
  for (const ja of juryAwards) {
    const [sub] = await dbOrTx
      .select({
        id: challengeSubmissions.id,
        challengeId: challengeSubmissions.challengeId,
        status: challengeSubmissions.submissionStatus,
      })
      .from(challengeSubmissions)
      .where(eq(challengeSubmissions.id, ja.submissionId))
      .limit(1);

    if (!sub || sub.challengeId !== challengeId || sub.status !== "submitted") {
      throw new Error(`Publikasi ditolak: Karya penghargaan juri ${ja.id} tidak valid atau telah didiskualifikasi.`);
    }

    if (
      challenge.awardMode === "vote_and_jury" &&
      existingCommunityWinner &&
      ja.submissionId === existingCommunityWinner.submissionId
    ) {
      throw new Error("Publikasi ditolak: Pemenang voting komunitas tidak boleh menerima penghargaan juri pada mode 'vote_and_jury'.");
    }
  }

  // 4. Strict publishCommunityOnly Invariant Validation
  if (publishCommunityOnly) {
    if (
      challenge.awardMode !== "vote_and_jury" ||
      !existingCommunityWinner ||
      juryAwards.length !== 0
    ) {
      throw new Error(
        "Opsi 'publishCommunityOnly' hanya valid pada mode 'vote_and_jury' ketika terdapat pemenang komunitas dan belum ada penghargaan juri yang dicatat."
      );
    }
  }

  // 5. Mode-Specific Publication Matrix
  if (challenge.awardMode === "jury_only") {
    if (juryAwards.length === 0) {
      throw new Error("Tidak dapat mempublikasikan hasil: Belum ada penghargaan juri yang dicatat pada mode 'jury_only'.");
    }
  } else if (challenge.awardMode === "vote_and_jury") {
    if (juryAwards.length === 0) {
      if (!existingCommunityWinner) {
        throw new Error("Tidak dapat mempublikasikan hasil: Tidak terdapat pemenang komunitas maupun penghargaan juri.");
      }
      if (!publishCommunityOnly) {
        throw new Error(
          "Konfirmasi diperlukan: Terdapat 0 penghargaan juri. Pilih opsi 'Publikasikan Pemenang Komunitas Saja' atau batalkan challenge."
        );
      }
    }
  }

  // 6. Idempotent Result Materialization
  // A. Explicitly publish existing Community Winner
  if (existingCommunityWinner) {
    await dbOrTx
      .update(challengeResults)
      .set({ isPublished: true })
      .where(eq(challengeResults.id, existingCommunityWinner.id));
  }

  // B. Upsert Jury Awards into challenge_results by jury_award_id
  for (const ja of juryAwards) {
    const [existingResult] = await dbOrTx
      .select({ id: challengeResults.id })
      .from(challengeResults)
      .where(
        and(
          eq(challengeResults.challengeId, challengeId),
          eq(challengeResults.juryAwardId, ja.id)
        )
      )
      .limit(1);

    if (existingResult) {
      await dbOrTx
        .update(challengeResults)
        .set({
          submissionId: ja.submissionId,
          categoryLabel: ja.categoryLabel,
          recordedByUserId: ja.recordedByUserId,
          isPublished: true,
        })
        .where(eq(challengeResults.id, existingResult.id));
    } else {
      await dbOrTx.insert(challengeResults).values({
        challengeId,
        submissionId: ja.submissionId,
        awardType: "jury_award",
        categoryLabel: ja.categoryLabel,
        juryAwardId: ja.id,
        recordedByUserId: ja.recordedByUserId,
        finalRank: null,
        totalCommunityStars: 0,
        isPublished: true,
      });
    }
  }

  // 7. Transition Challenge to FINISHED
  await dbOrTx
    .update(challenges)
    .set({ status: "finished", updatedAt: new Date() })
    .where(eq(challenges.id, challengeId));

  // Auto-add challenge submissions to portfolio with award-specific captions
  await autoAddChallengeSubmissionsToPortfolioService(dbOrTx, challengeId);

  // 8. Collect Winner Notifications
  const winningResults = await dbOrTx
    .select({
      resultId: challengeResults.id,
      submissionId: challengeResults.submissionId,
      awardType: challengeResults.awardType,
      categoryLabel: challengeResults.categoryLabel,
      artistUserId: challengeSubmissions.userId,
    })
    .from(challengeResults)
    .innerJoin(challengeSubmissions, eq(challengeSubmissions.id, challengeResults.submissionId))
    .where(
      and(
        eq(challengeResults.challengeId, challengeId),
        eq(challengeResults.isPublished, true)
      )
    );

  const pendingNotifications: WinnerNotificationPayload[] = [];
  for (const wr of winningResults) {
    const title = wr.awardType === "community_vote_winner"
      ? `Selamat! Juara Favorit Komunitas di ${challenge.title}`
      : `Selamat! Meraih Penghargaan "${wr.categoryLabel || 'Pilihan Juri'}" di ${challenge.title}`;

    pendingNotifications.push({
      userId: wr.artistUserId,
      type: "challenge_winner",
      title,
      body: `Karya Anda resmi meraih penghargaan pada challenge "${challenge.title}".`,
      actionUrl: `/challenges/${challenge.slug}/results`,
    });
  }

  // 9. Audit Log
  await dbOrTx.insert(auditLogs).values({
    actorId: actor.userId,
    action: "challenge.publish_jury_results",
    targetType: "challenge",
    targetId: challengeId,
    reason: "Hasil penjurian resmi challenge berhasil dipublikasikan.",
    metadata: {
      awardMode: challenge.awardMode,
      publishCommunityOnly,
      juryAwardCount: juryAwards.length,
      hasCommunityWinner: Boolean(existingCommunityWinner),
    },
  });

  return {
    success: true,
    outcome: "published",
    pendingNotifications,
  };
}

/**
 * Service: Protected Cancellation during JURY_SELECTION_OPEN
 * Invariant: Mandatory staff reason (>= 5 chars), transactional, audited.
 */
export async function cancelJuryChallengeService(
  dbOrTx: any,
  actor: ServiceContext,
  params: { challengeId: string; reason: string }
) {
  const { challengeId, reason } = params;

  if (!reason || reason.trim().length < 5) {
    throw new Error("Alasan pembatalan challenge harus diisi minimal 5 karakter.");
  }

  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .for("update")
    .limit(1);

  if (!challenge) throw new Error("Challenge tidak ditemukan.");

  if (challenge.status !== "jury_selection_open") {
    throw new Error(
      `Pembatalan juri ditolak: Challenge harus berada dalam status "jury_selection_open" (Status saat ini: "${challenge.status}").`
    );
  }

  const readiness = await validateJuryPhaseReadinessService(dbOrTx, challengeId);
  const isRecorder = readiness.recorder?.userId === actor.userId;
  const isModOrAdmin = actor.role === "admin" || actor.role === "moderator";

  if (!isRecorder && !isModOrAdmin) {
    throw new Error("Hanya Jury Recorder, Moderator, atau Administrator yang dapat membatalkan challenge.");
  }

  // Verify zero awards invariant (cancellation allowed only when zero awards recorded)
  const juryAwards = await dbOrTx
    .select()
    .from(challengeJuryAwards)
    .where(eq(challengeJuryAwards.challengeId, challengeId));

  if (juryAwards.length > 0) {
    throw new Error(
      `Pembatalan challenge ditolak: Terdapat ${juryAwards.length} penghargaan juri yang telah dicatat. Hapus seluruh penghargaan terlebih dahulu atau lanjutkan ke alur publikasi hasil.`
    );
  }

  await dbOrTx
    .update(challenges)
    .set({
      status: "cancelled",
      cancellationReason: reason.trim(),
      updatedAt: new Date(),
    })
    .where(eq(challenges.id, challengeId));

  await dbOrTx.insert(auditLogs).values({
    actorId: actor.userId,
    action: "challenge.cancel_jury_phase",
    targetType: "challenge",
    targetId: challengeId,
    reason: reason.trim(),
  });

  return { success: true, outcome: "cancelled" as const };
}

/**
 * Service: Revoke Challenge Results (FINISHED -> RESULTS_REVOKED)
 * Invariant: Audit snapshot of previous results, sets is_published = false.
 */
export async function revokeChallengeResultsService(
  dbOrTx: any,
  actor: ServiceContext,
  challengeId: string,
  reason: string
) {
  if (actor.role !== "admin" && actor.role !== "moderator") {
    throw new Error("Hanya Administrator atau Moderator yang dapat mencabut hasil resmi challenge.");
  }

  if (!reason || reason.trim().length < 5) {
    throw new Error("Alasan pencabutan hasil challenge harus diisi minimal 5 karakter.");
  }

  // 1. Lock challenge parent row
  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .for("update")
    .limit(1);

  if (!challenge) throw new Error("Challenge tidak ditemukan.");

  if (challenge.status !== "finished") {
    throw new Error(`Pencabutan hasil hanya diizinkan pada status "finished" (Status saat ini: "${challenge.status}").`);
  }

  // 2. Snapshot current published results for audit trail
  const publishedResults = await dbOrTx
    .select()
    .from(challengeResults)
    .where(
      and(
        eq(challengeResults.challengeId, challengeId),
        eq(challengeResults.isPublished, true)
      )
    );

  // 3. Mark all results as unpublished (is_published = false)
  await dbOrTx
    .update(challengeResults)
    .set({ isPublished: false })
    .where(eq(challengeResults.challengeId, challengeId));

  // 4. Transition challenge to results_revoked
  await dbOrTx
    .update(challenges)
    .set({
      status: "results_revoked",
      updatedAt: new Date(),
    })
    .where(eq(challenges.id, challengeId));

  // 4b. Revert portfolio system_caption to participant text for all valid challenge submissions
  const validSubmissions = await dbOrTx
    .select({ artworkId: challengeSubmissions.artworkId })
    .from(challengeSubmissions)
    .where(
      and(
        eq(challengeSubmissions.challengeId, challengeId),
        eq(challengeSubmissions.submissionStatus, "submitted")
      )
    );

  const participantCaption = `Peserta Challenge — ${challenge.title}`;
  for (const sub of validSubmissions) {
    await dbOrTx
      .update(portfolioEntries)
      .set({
        systemCaption: participantCaption,
        updatedAt: new Date(),
      })
      .where(eq(portfolioEntries.artworkId, sub.artworkId));
  }

  // 5. Audit Log with Snapshot Metadata
  await dbOrTx.insert(auditLogs).values({
    actorId: actor.userId,
    action: "challenge.results_revoked",
    targetType: "challenge",
    targetId: challengeId,
    reason: reason.trim(),
    metadata: {
      revokedAt: new Date().toISOString(),
      previousResultsSnapshot: publishedResults,
    },
  });

  return { success: true, outcome: "results_revoked" as const };
}

/**
 * Service: Governed Community Winner Correction under RESULTS_REVOKED
 * Actions: 'replace' (replaces winner with authoritative raw Stars) OR 'clear' (removes winner)
 */
export async function correctCommunityWinnerService(
  dbOrTx: any,
  actor: ServiceContext,
  params: {
    challengeId: string;
    action: "replace" | "clear";
    replacementSubmissionId?: string;
    reason: string;
  }
) {
  const { challengeId, action, replacementSubmissionId, reason } = params;

  if (actor.role !== "admin" && actor.role !== "moderator") {
    throw new Error("Hanya Administrator atau Moderator yang dapat mengoreksi pemenang komunitas.");
  }

  if (!reason || reason.trim().length < 5) {
    throw new Error("Alasan koreksi pemenang komunitas harus diisi minimal 5 karakter.");
  }

  // Lock challenge row
  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .for("update")
    .limit(1);

  if (!challenge) throw new Error("Challenge tidak ditemukan.");
  if (challenge.status !== "results_revoked") {
    throw new Error(`Koreksi pemenang komunitas hanya diizinkan pada status "results_revoked" (Status saat ini: "${challenge.status}").`);
  }

  if (challenge.awardMode !== "vote_only" && challenge.awardMode !== "vote_and_jury") {
    throw new Error(
      `Koreksi pemenang komunitas tidak didukung untuk mode '${challenge.awardMode}'. Hanya mode 'vote_only' dan 'vote_and_jury' yang memiliki Pemenang Komunitas.`
    );
  }

  const [existingCommWinner] = await dbOrTx
    .select()
    .from(challengeResults)
    .where(
      and(
        eq(challengeResults.challengeId, challengeId),
        eq(challengeResults.awardType, "community_vote_winner")
      )
    )
    .limit(1);

  if (action === "replace") {
    if (!replacementSubmissionId) {
      throw new Error("ID karya pengganti harus ditentukan.");
    }

    const [submission] = await dbOrTx
      .select()
      .from(challengeSubmissions)
      .where(
        and(
          eq(challengeSubmissions.id, replacementSubmissionId),
          eq(challengeSubmissions.challengeId, challengeId),
          eq(challengeSubmissions.submissionStatus, "submitted")
        )
      )
      .limit(1);

    if (!submission) {
      throw new Error("Karya submisi pengganti tidak valid atau telah didiskualifikasi.");
    }

    // In mixed mode (vote_and_jury), candidate cannot already hold a Jury Award
    if (challenge.awardMode === "vote_and_jury") {
      const [existingJuryAward] = await dbOrTx
        .select()
        .from(challengeJuryAwards)
        .where(
          and(
            eq(challengeJuryAwards.challengeId, challengeId),
            eq(challengeJuryAwards.submissionId, replacementSubmissionId)
          )
        )
        .limit(1);

      if (existingJuryAward) {
        throw new Error(
          "Karya ini telah menerima Penghargaan Juri. Dalam mode vote_and_jury, Pemenang Komunitas tidak boleh menerima Penghargaan Juri. Selesaikan konflik Penghargaan Juri terlebih dahulu sebelum menetapkan sebagai Pemenang Komunitas."
        );
      }
    }

    // Query actual authoritative raw Stars for replacement submission strictly from Main Round
    const rawStarsMap = await getAuthoritativeMainRoundStarsService(dbOrTx, challengeId, [replacementSubmissionId]);
    const actualRawStars = rawStarsMap[replacementSubmissionId] || 0;

    if (existingCommWinner) {
      await dbOrTx
        .update(challengeResults)
        .set({
          submissionId: replacementSubmissionId,
          totalCommunityStars: actualRawStars,
          resolutionMethod: "governance_correction",
          finalRank: 1,
        })
        .where(eq(challengeResults.id, existingCommWinner.id));
    } else {
      await dbOrTx.insert(challengeResults).values({
        challengeId,
        submissionId: replacementSubmissionId,
        awardType: "community_vote_winner",
        totalCommunityStars: actualRawStars,
        resolutionMethod: "governance_correction",
        finalRank: 1,
        isPublished: false,
      });
    }

    await dbOrTx.insert(auditLogs).values({
      actorId: actor.userId,
      action: "challenge.correct_community_winner",
      targetType: "challenge",
      targetId: challengeId,
      reason: reason.trim(),
      metadata: {
        action: "replace",
        previousWinnerSubmissionId: existingCommWinner?.submissionId || null,
        replacementSubmissionId,
        actualRawStars,
      },
    });
  } else if (action === "clear") {
    if (existingCommWinner) {
      await dbOrTx
        .delete(challengeResults)
        .where(eq(challengeResults.id, existingCommWinner.id));
    }

    await dbOrTx.insert(auditLogs).values({
      actorId: actor.userId,
      action: "challenge.clear_community_winner",
      targetType: "challenge",
      targetId: challengeId,
      reason: reason.trim(),
      metadata: {
        action: "clear",
        previousWinnerSubmissionId: existingCommWinner?.submissionId || null,
      },
    });
  }

  return { success: true };
}

/**
 * Service: Mode-Specific Republishing via Reconciliation (RESULTS_REVOKED -> FINISHED)
 * Invariant: Reconciles active awards and suppresses removed awards (never blanket-republishes stale rows).
 */
export async function republishChallengeResultsService(
  dbOrTx: any,
  actor: ServiceContext,
  challengeId: string,
  reason: string
) {
  if (actor.role !== "admin" && actor.role !== "moderator") {
    throw new Error("Hanya Administrator atau Moderator yang dapat mempublikasikan ulang hasil challenge.");
  }

  if (!reason || reason.trim().length < 5) {
    throw new Error("Alasan publikasi ulang hasil harus diisi minimal 5 karakter.");
  }

  // 1. Lock challenge parent row
  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .for("update")
    .limit(1);

  if (!challenge) throw new Error("Challenge tidak ditemukan.");
  if (challenge.status !== "results_revoked") {
    throw new Error(`Publikasi ulang hanya diizinkan pada status "results_revoked" (Status saat ini: "${challenge.status}").`);
  }

  // 2. Fetch current draft Jury Awards & Community Winner
  const currentJuryAwards = await dbOrTx
    .select()
    .from(challengeJuryAwards)
    .where(eq(challengeJuryAwards.challengeId, challengeId));

  const [activeCommWinner] = await dbOrTx
    .select()
    .from(challengeResults)
    .where(
      and(
        eq(challengeResults.challengeId, challengeId),
        eq(challengeResults.awardType, "community_vote_winner")
      )
    )
    .limit(1);

  // Revalidate every current Jury Award
  for (const ja of currentJuryAwards) {
    const [sub] = await dbOrTx
      .select({
        id: challengeSubmissions.id,
        challengeId: challengeSubmissions.challengeId,
        status: challengeSubmissions.submissionStatus,
      })
      .from(challengeSubmissions)
      .where(eq(challengeSubmissions.id, ja.submissionId))
      .limit(1);

    if (!sub || sub.challengeId !== challengeId || sub.status !== "submitted") {
      throw new Error(`Publikasi ulang ditolak: Karya penghargaan juri ${ja.id} tidak valid atau telah didiskualifikasi.`);
    }

    if (
      challenge.awardMode === "vote_and_jury" &&
      activeCommWinner &&
      ja.submissionId === activeCommWinner.submissionId
    ) {
      throw new Error(
        "Publikasi ulang ditolak: Pemenang komunitas terdaftar menerima penghargaan juri pada mode 'vote_and_jury'."
      );
    }
  }

  // 3. Mode-Specific Republish Validation
  if (challenge.awardMode === "jury_only") {
    if (currentJuryAwards.length === 0) {
      throw new Error("Publikasi ulang ditolak: Mode 'jury_only' memerlukan minimal 1 penghargaan juri yang valid.");
    }
  } else if (challenge.awardMode === "vote_and_jury") {
    if (!activeCommWinner && currentJuryAwards.length === 0) {
      throw new Error(
        "Publikasi ulang ditolak: Tidak terdapat pemenang komunitas maupun penghargaan juri yang valid. Koreksi hasil atau batalkan challenge."
      );
    }
  } else if (challenge.awardMode === "vote_only") {
    if (activeCommWinner) {
      const [sub] = await dbOrTx
        .select({
          id: challengeSubmissions.id,
          challengeId: challengeSubmissions.challengeId,
          status: challengeSubmissions.submissionStatus,
        })
        .from(challengeSubmissions)
        .where(eq(challengeSubmissions.id, activeCommWinner.submissionId))
        .limit(1);

      if (!sub || sub.challengeId !== challengeId || sub.status !== "submitted") {
        throw new Error("Publikasi ulang ditolak: Karya pemenang komunitas tidak valid atau telah didiskualifikasi.");
      }
    } else {
      // Winnerless vote_only check: verify main round had 0 stars
      const [mainRound] = await dbOrTx
        .select({ id: challengeVotingRounds.id })
        .from(challengeVotingRounds)
        .where(
          and(
            eq(challengeVotingRounds.challengeId, challengeId),
            eq(challengeVotingRounds.roundType, "main")
          )
        )
        .limit(1);

      if (mainRound) {
        const starSum = await dbOrTx
          .select({ total: sql<number>`COALESCE(SUM(${challengeBallotStars.starsCount}), 0)::int` })
          .from(challengeBallots)
          .innerJoin(challengeBallotStars, eq(challengeBallotStars.ballotId, challengeBallots.id))
          .where(eq(challengeBallots.votingRoundId, mainRound.id));

        const totalMainStars = Number(starSum[0]?.total || 0);
        if (totalMainStars > 0) {
          throw new Error(
            "Publikasi ulang ditolak: Mode 'vote_only' dengan suara positif memerlukan pemenang komunitas yang sah (ganti pemenang sebelum mempublikasikan ulang)."
          );
        }
      }
    }
  }

  // 4. Reconciliation of challenge_results
  // A. Community Winner
  if (activeCommWinner) {
    await dbOrTx
      .update(challengeResults)
      .set({ isPublished: true })
      .where(eq(challengeResults.id, activeCommWinner.id));
  }

  // B. Jury Awards: Upsert current awards
  const currentAwardIds = new Set(currentJuryAwards.map((a: any) => a.id));

  for (const ja of currentJuryAwards) {
    const [existingResult] = await dbOrTx
      .select({ id: challengeResults.id })
      .from(challengeResults)
      .where(
        and(
          eq(challengeResults.challengeId, challengeId),
          eq(challengeResults.juryAwardId, ja.id)
        )
      )
      .limit(1);

    if (existingResult) {
      await dbOrTx
        .update(challengeResults)
        .set({
          submissionId: ja.submissionId,
          categoryLabel: ja.categoryLabel,
          recordedByUserId: ja.recordedByUserId,
          isPublished: true,
        })
        .where(eq(challengeResults.id, existingResult.id));
    } else {
      await dbOrTx.insert(challengeResults).values({
        challengeId,
        submissionId: ja.submissionId,
        awardType: "jury_award",
        categoryLabel: ja.categoryLabel,
        juryAwardId: ja.id,
        recordedByUserId: ja.recordedByUserId,
        finalRank: null,
        totalCommunityStars: 0,
        isPublished: true,
      });
    }
  }

  // C. Unpublish / Delete any stale jury result rows whose jury_award_id was removed
  const allJuryResults = await dbOrTx
    .select({ id: challengeResults.id, juryAwardId: challengeResults.juryAwardId })
    .from(challengeResults)
    .where(
      and(
        eq(challengeResults.challengeId, challengeId),
        eq(challengeResults.awardType, "jury_award")
      )
    );

  for (const jr of allJuryResults) {
    if (!jr.juryAwardId || !currentAwardIds.has(jr.juryAwardId)) {
      await dbOrTx
        .update(challengeResults)
        .set({ isPublished: false })
        .where(eq(challengeResults.id, jr.id));
    }
  }

  // 5. Transition Challenge to FINISHED
  await dbOrTx
    .update(challenges)
    .set({ status: "finished", updatedAt: new Date() })
    .where(eq(challenges.id, challengeId));

  // Reconcile and auto-add challenge submissions to portfolio with award-specific captions
  await autoAddChallengeSubmissionsToPortfolioService(dbOrTx, challengeId);

  // 6. Audit Log
  await dbOrTx.insert(auditLogs).values({
    actorId: actor.userId,
    action: "challenge.results_republished",
    targetType: "challenge",
    targetId: challengeId,
    reason: reason.trim(),
    metadata: {
      republishedAt: new Date().toISOString(),
      awardMode: challenge.awardMode,
      activeJuryAwardCount: currentJuryAwards.length,
      hasCommunityWinner: Boolean(activeCommWinner),
    },
  });

  return { success: true, outcome: "republished" as const };
}

/**
 * Service: Cancel Revoked Challenge (RESULTS_REVOKED -> CANCELLED)
 */
export async function cancelRevokedChallengeService(
  dbOrTx: any,
  actor: ServiceContext,
  challengeId: string,
  reason: string
) {
  if (actor.role !== "admin" && actor.role !== "moderator") {
    throw new Error("Hanya Administrator atau Moderator yang dapat membatalkan challenge.");
  }

  if (!reason || reason.trim().length < 5) {
    throw new Error("Alasan pembatalan harus diisi minimal 5 karakter.");
  }

  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .for("update")
    .limit(1);

  if (!challenge) throw new Error("Challenge tidak ditemukan.");
  if (challenge.status !== "results_revoked") {
    throw new Error(`Pembatalan dari status dicabut hanya diizinkan pada "results_revoked" (Status saat ini: "${challenge.status}").`);
  }

  await dbOrTx
    .update(challenges)
    .set({
      status: "cancelled",
      cancellationReason: reason.trim(),
      updatedAt: new Date(),
    })
    .where(eq(challenges.id, challengeId));

  await dbOrTx.insert(auditLogs).values({
    actorId: actor.userId,
    action: "challenge.cancel_revoked_challenge",
    targetType: "challenge",
    targetId: challengeId,
    reason: reason.trim(),
  });

  return { success: true, outcome: "cancelled" as const };
}

/**
 * Service: Query Jury Workspace Data
 */
export async function getJuryWorkspaceData(
  dbOrChallengeId: any,
  challengeIdOrUserId?: string,
  maybeUserId?: string
) {
  let dbOrTx = defaultDb;
  let challengeId: string;
  let userId: string | undefined;

  if (typeof dbOrChallengeId === "string") {
    challengeId = dbOrChallengeId;
    userId = challengeIdOrUserId;
  } else {
    dbOrTx = dbOrChallengeId;
    challengeId = challengeIdOrUserId!;
    userId = maybeUserId;
  }

  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (!challenge) return null;

  // 1. Fetch Jury Assignments with Profiles
  const rawAssignments = await dbOrTx
    .select({
      id: challengeJuryAssignments.id,
      userId: challengeJuryAssignments.userId,
      profileId: challengeJuryAssignments.profileId,
      isRecorder: challengeJuryAssignments.isRecorder,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
      slug: profiles.slug,
    })
    .from(challengeJuryAssignments)
    .innerJoin(profiles, eq(profiles.id, challengeJuryAssignments.profileId))
    .where(eq(challengeJuryAssignments.challengeId, challengeId));

  const readiness = await validateJuryPhaseReadinessService(dbOrTx, challengeId);

  // 2. Fetch Resolved Community Winner (if any)
  const [communityWinner] = await dbOrTx
    .select({
      resultId: challengeResults.id,
      submissionId: challengeResults.submissionId,
      awardType: challengeResults.awardType,
      totalCommunityStars: challengeResults.totalCommunityStars,
      resolutionMethod: challengeResults.resolutionMethod,
      title: challengeSubmissions.title,
      isSpoiler: artworks.isSpoiler,
      artistName: profiles.displayName,
      artistSlug: profiles.slug,
      thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
    })
    .from(challengeResults)
    .innerJoin(challengeSubmissions, eq(challengeSubmissions.id, challengeResults.submissionId))
    .innerJoin(artworks, eq(artworks.id, challengeSubmissions.artworkId))
    .leftJoin(profiles, eq(profiles.id, challengeSubmissions.profileId))
    .leftJoin(artworkVersions, eq(artworkVersions.id, challengeSubmissions.artworkVersionId))
    .where(
      and(
        eq(challengeResults.challengeId, challengeId),
        eq(challengeResults.awardType, "community_vote_winner")
      )
    )
    .limit(1);

  // 3. Fetch Submissions with Raw Stars and Artist Info
  const submissions = await dbOrTx
    .select({
      submissionId: challengeSubmissions.id,
      userId: challengeSubmissions.userId,
      submissionStatus: challengeSubmissions.submissionStatus,
      title: challengeSubmissions.title,
      description: challengeSubmissions.description,
      softwareUsed: challengeSubmissions.softwareUsed,
      artworkId: challengeSubmissions.artworkId,
      artworkVersionId: challengeSubmissions.artworkVersionId,
      isSpoiler: artworks.isSpoiler,
      thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
      publicStorageKey: artworkVersions.publicStorageKey,
      artistName: profiles.displayName,
      artistSlug: profiles.slug,
      artistAvatar: profiles.avatarUrl,
    })
    .from(challengeSubmissions)
    .innerJoin(artworks, eq(artworks.id, challengeSubmissions.artworkId))
    .innerJoin(profiles, eq(profiles.id, challengeSubmissions.profileId))
    .leftJoin(artworkVersions, eq(artworkVersions.id, challengeSubmissions.artworkVersionId))
    .where(
      and(
        eq(challengeSubmissions.challengeId, challengeId),
        eq(challengeSubmissions.submissionStatus, "submitted")
      )
    )
    .orderBy(asc(challengeSubmissions.createdAt));

  // Compute authoritative raw Star totals strictly from the Main Round
  const subIds = submissions.map((s) => s.submissionId);
  const starsBySub = await getAuthoritativeMainRoundStarsService(dbOrTx, challengeId, subIds);

  const candidateEntries = submissions.map((s) => ({
    ...s,
    communityStars: starsBySub[s.submissionId] || 0,
    isCommunityWinner: communityWinner?.submissionId === s.submissionId,
  }));

  // 4. Fetch Current Draft Jury Awards
  const draftAwards = await dbOrTx
    .select({
      id: challengeJuryAwards.id,
      submissionId: challengeJuryAwards.submissionId,
      categoryLabel: challengeJuryAwards.categoryLabel,
      recordedByUserId: challengeJuryAwards.recordedByUserId,
      createdAt: challengeJuryAwards.createdAt,
      title: challengeSubmissions.title,
      isSpoiler: artworks.isSpoiler,
      artistName: profiles.displayName,
      artistSlug: profiles.slug,
      thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
    })
    .from(challengeJuryAwards)
    .innerJoin(challengeSubmissions, eq(challengeSubmissions.id, challengeJuryAwards.submissionId))
    .innerJoin(artworks, eq(artworks.id, challengeSubmissions.artworkId))
    .leftJoin(profiles, eq(profiles.id, challengeSubmissions.profileId))
    .leftJoin(artworkVersions, eq(artworkVersions.id, challengeSubmissions.artworkVersionId))
    .where(eq(challengeJuryAwards.challengeId, challengeId))
    .orderBy(asc(challengeJuryAwards.createdAt));

  // 5. User Authority Calculation
  const isAssignedJury = rawAssignments.some((a) => a.userId === userId);
  const isRecorder = readiness.recorder?.userId === userId;

  // 6. Fetch Available Members for Panel Assignment (Active members not yet assigned)
  const assignedUserIds = rawAssignments.map((a) => a.userId);
  const availableMembers = await dbOrTx
    .select({
      userId: users.id,
      profileId: profiles.id,
      displayName: profiles.displayName,
      slug: profiles.slug,
      avatarUrl: profiles.avatarUrl,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(
      and(
        eq(users.membershipStatus, "active"),
        assignedUserIds.length > 0 ? sql`${users.id} NOT IN ${assignedUserIds}` : sql`TRUE`
      )
    )
    .orderBy(asc(profiles.displayName));

  return {
    challenge,
    juryAssignments: rawAssignments,
    readiness,
    communityWinner,
    candidates: candidateEntries,
    draftAwards,
    isAssignedJury,
    isRecorder,
    availableMembers,
  };
}
