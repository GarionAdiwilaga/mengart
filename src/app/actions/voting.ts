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

/**
 * Fetch challenge candidates and user's ballot for a specific voting round
 */
export async function getChallengeVotingData(
  challengeId: string,
  userId?: string | null,
  roundType: "main" | "tiebreak" = "main"
) {
  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (!challenge) throw new Error("Challenge tidak ditemukan.");

  // Fetch or resolve active voting round
  const [votingRound] = await db
    .select()
    .from(challengeVotingRounds)
    .where(
      and(
        eq(challengeVotingRounds.challengeId, challengeId),
        eq(challengeVotingRounds.roundType, roundType)
      )
    )
    .orderBy(desc(challengeVotingRounds.roundSequence))
    .limit(1);

  // If frozen candidates table exists for this round, load strictly from it
  let candidateSubmissions: any[] = [];
  if (votingRound) {
    const frozenCandidates = await db
      .select({
        submissionId: challengeVotingRoundCandidates.submissionId,
      })
      .from(challengeVotingRoundCandidates)
      .where(eq(challengeVotingRoundCandidates.votingRoundId, votingRound.id));

    const candidateIds = frozenCandidates.map((fc) => fc.submissionId);
    if (candidateIds.length > 0) {
      candidateSubmissions = await db
        .select({
          submissionId: challengeSubmissions.id,
          userId: challengeSubmissions.userId,
          createdAt: challengeSubmissions.createdAt,
        })
        .from(challengeSubmissions)
        .where(inArray(challengeSubmissions.id, candidateIds));
    }
  } else {
    // Fallback: all active submitted entries
    candidateSubmissions = await db
      .select({
        submissionId: challengeSubmissions.id,
        userId: challengeSubmissions.userId,
        createdAt: challengeSubmissions.createdAt,
      })
      .from(challengeSubmissions)
      .where(
        and(
          eq(challengeSubmissions.challengeId, challengeId),
          eq(challengeSubmissions.submissionStatus, "submitted")
        )
      );
  }

  // Fetch current user's ballot for this round
  let userBallot = null;
  let allocatedStars: Record<string, number> = {};

  if (userId) {
    const [existingBallot] = await db
      .select()
      .from(challengeBallots)
      .where(
        and(
          eq(challengeBallots.challengeId, challengeId),
          eq(challengeBallots.userId, userId),
          eq(challengeBallots.roundType, roundType)
        )
      )
      .limit(1);

    if (existingBallot) {
      userBallot = existingBallot;
      const starsList = await db
        .select()
        .from(challengeBallotStars)
        .where(eq(challengeBallotStars.ballotId, existingBallot.id));

      for (const item of starsList) {
        allocatedStars[item.submissionId] = item.starsCount;
      }
    }
  }

  return {
    challenge,
    votingRound,
    roundType,
    candidates: candidateSubmissions,
    userBallot,
    allocatedStars,
    starsAllowance: votingRound?.starsPerMember || challenge.starsPerMember,
  };
}

/**
 * Cast or Update Ballot for a Challenge Voting Round
 */
export async function castOrUpdateBallotAction(
  challengeId: string,
  votes: Array<{ submissionId: string; starsCount: number }>,
  roundType: "main" | "tiebreak" = "main"
) {
  const user = await requireAuth("/login");

  // Rate Limiting on voting actions
  const rl = await checkRateLimit(`vote:${user.id}`, { limit: 20, windowSeconds: 60 });
  if (!rl.success) {
    throw new Error("Terlalu banyak permintaan pemungutan suara. Harap tunggu beberapa saat.");
  }

  return db.transaction(async (tx) => {
    // 1. Lock challenge parent row
    const [challenge] = await tx
      .select()
      .from(challenges)
      .where(eq(challenges.id, challengeId))
      .for("update")
      .limit(1);

    if (!challenge) throw new Error("Challenge tidak ditemukan.");

    // 2. Authoritative Policy Verification
    const votePolicy = canVoteInChallenge(user as any, challenge as any, roundType);
    if (!votePolicy.allowed) {
      throw new Error(votePolicy.reason || "Pemungutan suara tidak diizinkan saat ini.");
    }

    // 3. Resolve active voting round
    const [votingRound] = await tx
      .select()
      .from(challengeVotingRounds)
      .where(
        and(
          eq(challengeVotingRounds.challengeId, challengeId),
          eq(challengeVotingRounds.roundType, roundType)
        )
      )
      .for("update")
      .limit(1);

    const maxStars = votingRound?.starsPerMember || challenge.starsPerMember;
    const totalAllocated = votes.reduce((sum, v) => sum + v.starsCount, 0);

    if (totalAllocated > maxStars) {
      throw new Error(`Total Stars melebihi alokasi maksimal (${maxStars} Stars).`);
    }

    // 4. Validate Candidate Eligibility & Anti-Self Voting
    const activeSubmissions = await tx
      .select()
      .from(challengeSubmissions)
      .where(
        and(
          eq(challengeSubmissions.challengeId, challengeId),
          eq(challengeSubmissions.submissionStatus, "submitted")
        )
      );

    const validSubmissionMap = new Map(activeSubmissions.map((s) => [s.id, s]));

    for (const vote of votes) {
      if (vote.starsCount <= 0) continue;
      const sub = validSubmissionMap.get(vote.submissionId);
      if (!sub) {
        throw new Error("Submisi karya tidak valid atau tidak terdaftar pada challenge ini.");
      }
      if (sub.userId === user.id) {
        throw new Error("Self-voting dilarang dalam aturan atelier.");
      }
    }

    // 5. Upsert Ballot with Parent Lock
    const [existingBallot] = await tx
      .select()
      .from(challengeBallots)
      .where(
        and(
          eq(challengeBallots.challengeId, challengeId),
          eq(challengeBallots.userId, user.id),
          eq(challengeBallots.roundType, roundType)
        )
      )
      .for("update")
      .limit(1);

    let ballotId = existingBallot?.id;

    if (!existingBallot) {
      const [newBallot] = await tx
        .insert(challengeBallots)
        .values({
          challengeId,
          votingRoundId: votingRound?.id || null,
          userId: user.id,
          roundType,
          starsAllocated: totalAllocated,
          isFinalized: false,
        })
        .returning();
      ballotId = newBallot.id;
    } else {
      await tx
        .update(challengeBallots)
        .set({
          votingRoundId: votingRound?.id || existingBallot.votingRoundId,
          starsAllocated: totalAllocated,
          updatedAt: new Date(),
        })
        .where(eq(challengeBallots.id, ballotId!));

      await tx
        .delete(challengeBallotStars)
        .where(eq(challengeBallotStars.ballotId, ballotId!));
    }

    // 6. Insert new star allocations
    const activeStars = votes.filter((v) => v.starsCount > 0);
    if (activeStars.length > 0) {
      await tx.insert(challengeBallotStars).values(
        activeStars.map((v) => ({
          ballotId: ballotId!,
          submissionId: v.submissionId,
          starsCount: v.starsCount,
        }))
      );
    }

    revalidatePath(`/challenges/${challenge.slug}/voting`);
    return { success: true, ballotId };
  });
}

/**
 * Reset Ballot Action
 */
export async function resetBallotAction(
  challengeId: string,
  roundType: "main" | "tiebreak" = "main"
) {
  const user = await requireAuth("/login");

  return db.transaction(async (tx) => {
    const [challenge] = await tx
      .select()
      .from(challenges)
      .where(eq(challenges.id, challengeId))
      .for("update")
      .limit(1);

    if (!challenge) throw new Error("Challenge tidak ditemukan.");

    const votePolicy = canVoteInChallenge(user as any, challenge as any, roundType);
    if (!votePolicy.allowed) {
      throw new Error(votePolicy.reason || "Reset suara tidak diizinkan.");
    }

    const [ballot] = await tx
      .select()
      .from(challengeBallots)
      .where(
        and(
          eq(challengeBallots.challengeId, challengeId),
          eq(challengeBallots.userId, user.id),
          eq(challengeBallots.roundType, roundType)
        )
      )
      .for("update")
      .limit(1);

    if (ballot) {
      await tx.delete(challengeBallotStars).where(eq(challengeBallotStars.ballotId, ballot.id));
      await tx
        .update(challengeBallots)
        .set({ starsAllocated: 0, updatedAt: new Date() })
        .where(eq(challengeBallots.id, ballot.id));
    }

    revalidatePath(`/challenges/${challenge.slug}/voting`);
    return { success: true };
  });
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

/**
 * Deterministic Challenge Finalization with Parent Row Lock & Slot Completion Check
 */
export async function finalizeChallengeResultsAction(challengeId: string) {
  const user = await requireModerator("/dashboard");

  return db.transaction(async (tx) => {
    // 1. Lock challenge parent row
    const [challenge] = await tx
      .select()
      .from(challenges)
      .where(eq(challenges.id, challengeId))
      .for("update")
      .limit(1);

    if (!challenge) throw new Error("Challenge tidak ditemukan.");

    const dynamicStatus = getEffectiveChallengeStatus(challenge);
    if (dynamicStatus === "voting_open" || dynamicStatus === "tiebreak_open") {
      throw new Error(
        `Finalisasi ditolak: Sesi pemungutan suara ("${dynamicStatus}") masih aktif. Finalisasi hanya dapat dilakukan setelah pemungutan suara ditutup.`
      );
    }

    if (dynamicStatus !== "review" && dynamicStatus !== "jury_selection_open" && challenge.status !== "finished") {
      throw new Error(`Challenge tidak dapat difinalisasi pada status "${dynamicStatus}".`);
    }

    // 2. Fetch Configured Winner Slots
    const winnerSlots = await tx
      .select()
      .from(challengeWinnerSlots)
      .where(eq(challengeWinnerSlots.challengeId, challengeId))
      .orderBy(asc(challengeWinnerSlots.displayOrder), asc(challengeWinnerSlots.rank));

    const communitySlots = winnerSlots.filter((s) => s.slotType === "community_vote");
    const jurySlots = winnerSlots.filter((s) => s.slotType === "jury_award");

    // 3. Required Jury Slots Completion Check
    const juryAssignments = await tx
      .select()
      .from(challengeJurySlotAssignments)
      .where(eq(challengeJurySlotAssignments.challengeId, challengeId));

    if (challenge.awardMode === "jury_only" || challenge.awardMode === "vote_and_jury") {
      if (jurySlots.length > 0) {
        const assignedSlotIds = new Set(juryAssignments.map((a) => a.winnerSlotId));
        const unassignedSlots = jurySlots.filter((slot) => !assignedSlotIds.has(slot.id));
        if (unassignedSlots.length > 0) {
          throw new Error(
            `Finalisasi diblokir: Terdapat ${unassignedSlots.length} slot penghargaan dewan juri yang belum ditetapkan (${unassignedSlots.map((s) => s.title).join(", ")}).`
          );
        }
      }
    }

    // 4. Tabulate Main Round Stars Deterministically
    const mainRoundStars = await tx
      .select({
        submissionId: challengeSubmissions.id,
        artistUserId: challengeSubmissions.userId,
        createdAt: challengeSubmissions.createdAt,
        totalStars: sql<number>`COALESCE(SUM(CASE WHEN ${challengeBallots.roundType} = 'main' THEN ${challengeBallotStars.starsCount} ELSE 0 END), 0)::int`,
        tiebreakStars: sql<number>`COALESCE(SUM(CASE WHEN ${challengeBallots.roundType} = 'tiebreak' THEN ${challengeBallotStars.starsCount} ELSE 0 END), 0)::int`,
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

    // 5. Detect Cutoff Ties BEFORE Concluding Finalization
    const communityCutoffCount = communitySlots.length;
    if (
      communityCutoffCount > 0 &&
      mainRoundStars.length > communityCutoffCount &&
      challenge.tieStrategy === "tiebreak_round" &&
      challenge.status !== "finished" &&
      challenge.status !== "tiebreak_open"
    ) {
      const cutoffSub = mainRoundStars[communityCutoffCount - 1];
      const nextSub = mainRoundStars[communityCutoffCount];

      if (cutoffSub.totalStars === nextSub.totalStars && cutoffSub.totalStars > 0) {
        // Collect all tied candidates at this exact score
        const tiedScore = cutoffSub.totalStars;
        const tiedCandidates = mainRoundStars.filter((s) => s.totalStars === tiedScore);

        // Create and Freeze Tiebreak Round
        const [tiebreakRound] = await tx
          .insert(challengeVotingRounds)
          .values({
            challengeId,
            roundType: "tiebreak",
            roundSequence: 2,
            status: "open",
            startsAt: new Date(),
            starsPerMember: 1,
          })
          .returning();

        await tx.insert(challengeVotingRoundCandidates).values(
          tiedCandidates.map((tc) => ({
            votingRoundId: tiebreakRound.id,
            submissionId: tc.submissionId,
          }))
        );

        // Transition challenge to tiebreak_open
        await tx
          .update(challenges)
          .set({ status: "tiebreak_open", updatedAt: new Date() })
          .where(eq(challenges.id, challengeId));

        revalidatePath(`/challenges/${challenge.slug}`);
        throw new Error(
          `Tiebreak terdeteksi pada batas kuota juara (${tiedCandidates.length} karya memiliki ${tiedScore} Stars). Putaran tiebreak telah diaktifkan.`
        );
      }
    }

    // 6. Persist Final Results
    await tx.delete(challengeResults).where(eq(challengeResults.challengeId, challengeId));

    // Map Community Podium Winners
    const championSubmissionId = mainRoundStars[0]?.submissionId;
    const assignedJurySlotMap = new Map(juryAssignments.map((ja) => [ja.submissionId, ja.winnerSlotId]));

    for (let i = 0; i < mainRoundStars.length; i++) {
      const sub = mainRoundStars[i];
      const rank = i + 1;
      const matchingCommunitySlot = communitySlots.find((s) => s.rank === rank);
      const assignedJurySlotId = assignedJurySlotMap.get(sub.submissionId);

      // Community Champion cannot receive a Jury Award Slot per Blueprint
      let winnerSlotId: string | null = null;
      let awardType = "community_rank";

      if (matchingCommunitySlot) {
        winnerSlotId = matchingCommunitySlot.id;
      } else if (assignedJurySlotId && sub.submissionId !== championSubmissionId) {
        winnerSlotId = assignedJurySlotId;
        awardType = "jury_award";
      }

      await tx.insert(challengeResults).values({
        challengeId,
        submissionId: sub.submissionId,
        winnerSlotId,
        finalRank: matchingCommunitySlot ? rank : null,
        awardType,
        totalCommunityStars: sub.totalStars,
        isPublished: true,
      });

      if (rank <= 3) {
        await createNotification({
          userId: sub.artistUserId,
          type: "challenge_winner",
          title: `Selamat! Juara #${rank} di ${challenge.title}`,
          body: `Karya Anda meraih peringkat #${rank} dengan total ${sub.totalStars} Stars komunitas.`,
          actionUrl: `/challenges/${challenge.slug}/results`,
        });
      }
    }

    // 7. Authoritatively Finish Challenge
    await tx
      .update(challenges)
      .set({ status: "finished", updatedAt: new Date() })
      .where(eq(challenges.id, challengeId));

    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "challenge.finalize",
      targetType: "challenge",
      targetId: challengeId,
      reason: "Hasil resmi challenge berhasil difinalisasi.",
    });

    revalidatePath(`/challenges/${challenge.slug}/results`);
    revalidatePath(`/challenges/${challenge.slug}`);
    revalidatePath("/challenges");

    return { success: true };
  });
}
