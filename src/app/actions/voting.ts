"use server";

import { requireAuth, requireModerator } from "@/lib/rbac";
import { db } from "@/db";
import {
  challenges,
  challengeSubmissions,
  challengeBallots,
  challengeBallotStars,
  challengeWinnerSlots,
  challengeJuryScores,
  challengeResults,
  auditLogs,
} from "@/db/schema";
import { eq, and, sql, inArray, desc, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getEffectiveChallengeStatus } from "@/lib/challenges";
import { createNotification } from "@/lib/notifications";
import { canVoteInChallenge, canSubmitJuryScore } from "@/lib/policy";

interface StarAllocationInput {
  submissionId: string;
  starsCount: number; // 1, 2, 3, etc.
}

export async function castOrUpdateBallotAction(
  challengeId: string,
  allocations: StarAllocationInput[],
  isFinalizing: boolean = false,
  roundType: "main" | "tiebreak" = "main"
) {
  const user = await requireAuth("/login");

  // 1. Verify Challenge & Authoritative Voting Window
  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (!challenge) throw new Error("Challenge tidak ditemukan.");

  const votePolicy = canVoteInChallenge(user as any, challenge as any, roundType);
  if (!votePolicy.allowed) {
    throw new Error(votePolicy.reason || "Voting tidak diizinkan saat ini.");
  }

  const now = new Date();
  if (challenge.votingDeadline && now > new Date(challenge.votingDeadline)) {
    throw new Error("Batas waktu voting telah berakhir (Authoritative Deadline Passed).");
  }

  // 2. Filter valid positive allocations
  const activeAllocations = allocations.filter((a) => a.starsCount > 0);
  const totalStarsRequested = activeAllocations.reduce((sum, a) => sum + a.starsCount, 0);

  const maxStarsAllowed = challenge.starsPerMember || 3;
  if (totalStarsRequested > maxStarsAllowed) {
    throw new Error(
      `Alokasi Stars melebihi batas maksimal (${totalStarsRequested} / ${maxStarsAllowed} Stars).`
    );
  }

  // 3. Strict Candidate Validation: Verify Challenge ID & Active Status & Anti-Self-Voting
  if (activeAllocations.length > 0) {
    const submissionIds = activeAllocations.map((a) => a.submissionId);
    const targetSubmissions = await db
      .select({
        id: challengeSubmissions.id,
        challengeId: challengeSubmissions.challengeId,
        userId: challengeSubmissions.userId,
        status: challengeSubmissions.submissionStatus,
      })
      .from(challengeSubmissions)
      .where(inArray(challengeSubmissions.id, submissionIds));

    if (targetSubmissions.length !== submissionIds.length) {
      throw new Error("Satu atau lebih karya submisi tidak ditemukan dalam sistem.");
    }

    for (const sub of targetSubmissions) {
      // Validate challenge belonging
      if (sub.challengeId !== challengeId) {
        throw new Error("Pelanggaran integritas: Karya submisi berasal dari challenge yang berbeda.");
      }

      // Validate active submission status
      if (sub.status !== "submitted") {
        throw new Error("Karya submisi yang dipilih telah didiskualifikasi atau ditarik.");
      }

      // Validate anti-self-voting
      if (sub.userId === user.id) {
        throw new Error(
          "Voting untuk karya sendiri (self-voting) dilarang dalam aturan atelier."
        );
      }
    }
  }

  // 4. Atomic Transaction: Upsert Ballot & BallotStars
  await db.transaction(async (tx) => {
    // Find or create ballot
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
      .limit(1);

    let ballotId = existingBallot?.id;

    if (!existingBallot) {
      const [newBallot] = await tx
        .insert(challengeBallots)
        .values({
          challengeId,
          userId: user.id,
          roundType,
          starsAllocated: totalStarsRequested,
          isFinalized: isFinalizing,
        })
        .returning();
      ballotId = newBallot.id;
    } else {
      await tx
        .update(challengeBallots)
        .set({
          starsAllocated: totalStarsRequested,
          isFinalized: isFinalizing,
          updatedAt: now,
        })
        .where(eq(challengeBallots.id, ballotId!));

      // Clear previous star rows
      await tx
        .delete(challengeBallotStars)
        .where(eq(challengeBallotStars.ballotId, ballotId!));
    }

    // Insert new star allocations
    if (activeAllocations.length > 0) {
      await tx.insert(challengeBallotStars).values(
        activeAllocations.map((a) => ({
          ballotId: ballotId!,
          submissionId: a.submissionId,
          starsCount: a.starsCount,
        }))
      );
    }

    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "challenge.ballot_cast",
      targetType: "challenge_ballot",
      targetId: ballotId!,
      metadata: {
        challengeId,
        roundType,
        starsCount: totalStarsRequested,
        isFinalized: isFinalizing,
      },
    });
  });

  revalidatePath(`/challenges/${challenge.slug}`);
  revalidatePath(`/challenges/${challenge.slug}/voting`);

  return {
    success: true,
    totalStarsAllocated: totalStarsRequested,
    remainingStars: maxStarsAllowed - totalStarsRequested,
  };
}

export async function resetBallotAction(challengeId: string, roundType: "main" | "tiebreak" = "main") {
  const user = await requireAuth("/login");

  const [existingBallot] = await db
    .select()
    .from(challengeBallots)
    .where(
      and(
        eq(challengeBallots.challengeId, challengeId),
        eq(challengeBallots.userId, user.id),
        eq(challengeBallots.roundType, roundType)
      )
    )
    .limit(1);

  if (existingBallot) {
    await db.transaction(async (tx) => {
      await tx
        .delete(challengeBallotStars)
        .where(eq(challengeBallotStars.ballotId, existingBallot.id));

      await tx
        .update(challengeBallots)
        .set({ starsAllocated: 0, isFinalized: false, updatedAt: new Date() })
        .where(eq(challengeBallots.id, existingBallot.id));
    });
  }

  revalidatePath(`/challenges/${challengeId}`);
  return { success: true };
}

export async function submitJuryScoreAction(
  challengeId: string,
  submissionId: string,
  winnerSlotId?: string,
  score?: number,
  critiqueNotes?: string
) {
  const user = await requireAuth("/login");

  // 1. Strict Server-Side Jury Authorization via Policy
  const juryPolicy = await canSubmitJuryScore(user as any, challengeId, submissionId);
  if (!juryPolicy.allowed) {
    throw new Error(juryPolicy.reason || "Anda tidak diizinkan memberikan nilai juri untuk karya ini.");
  }

  // 2. Validate WinnerSlotId if provided
  if (winnerSlotId) {
    const [slot] = await db
      .select()
      .from(challengeWinnerSlots)
      .where(
        and(
          eq(challengeWinnerSlots.id, winnerSlotId),
          eq(challengeWinnerSlots.challengeId, challengeId),
          eq(challengeWinnerSlots.slotType, "jury_award")
        )
      )
      .limit(1);

    if (!slot) {
      throw new Error("Penetapan slot juara dewan juri tidak valid untuk challenge ini.");
    }
  }

  // 3. Validate Score bounds if provided
  if (score !== undefined && score !== null) {
    if (score < 1 || score > 100) {
      throw new Error("Skor juri harus berada di antara 1 dan 100.");
    }
  }

  // 4. Upsert Jury Score
  const [existingScore] = await db
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
    await db
      .update(challengeJuryScores)
      .set({
        winnerSlotId: winnerSlotId || null,
        score: score !== undefined ? Math.round(score) : null,
        critiqueNotes: critiqueNotes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(challengeJuryScores.id, existingScore.id));
  } else {
    await db.insert(challengeJuryScores).values({
      challengeId,
      juryUserId: user.id,
      submissionId,
      winnerSlotId: winnerSlotId || null,
      score: score !== undefined ? Math.round(score) : null,
      critiqueNotes: critiqueNotes?.trim() || null,
    });
  }

  revalidatePath(`/challenges/${challengeId}/jury`);
  return { success: true };
}

/**
 * Deterministic Challenge Finalization Algorithm
 */
export async function finalizeChallengeResultsAction(challengeId: string) {
  const user = await requireModerator("/dashboard");

  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (!challenge) throw new Error("Challenge tidak ditemukan.");

  const dynamicStatus = getEffectiveChallengeStatus(challenge);
  if (
    dynamicStatus !== "review" &&
    dynamicStatus !== "voting_open" &&
    dynamicStatus !== "jury_selection_open" &&
    challenge.status !== "finished"
  ) {
    throw new Error(`Challenge tidak dapat difinalisasi pada status "${dynamicStatus}".`);
  }

  // 1. Fetch configured winner slots
  const winnerSlots = await db
    .select()
    .from(challengeWinnerSlots)
    .where(eq(challengeWinnerSlots.challengeId, challengeId))
    .orderBy(asc(challengeWinnerSlots.displayOrder), asc(challengeWinnerSlots.rank));

  const communitySlots = winnerSlots.filter((s) => s.slotType === "community_vote");
  const jurySlots = winnerSlots.filter((s) => s.slotType === "jury_award");

  // 2. Fetch Jury Evaluations
  const juryScores = await db
    .select()
    .from(challengeJuryScores)
    .where(eq(challengeJuryScores.challengeId, challengeId));

  // If awardMode requires jury, check that jury evaluations exist
  if (challenge.awardMode === "jury_only" || challenge.awardMode === "vote_and_jury") {
    if (jurySlots.length > 0 && juryScores.length === 0) {
      console.warn("Peringatan: Finalisasi challenge dilakukan tanpa penilaian juri yang lengkap.");
    }
  }

  // 3. Tabulate total community stars for all active submissions
  const submissionStars = await db
    .select({
      submissionId: challengeSubmissions.id,
      artistUserId: challengeSubmissions.userId,
      submissionCreatedAt: challengeSubmissions.createdAt,
      totalStars: sql<number>`COALESCE(SUM(${challengeBallotStars.starsCount}), 0)::int`,
    })
    .from(challengeSubmissions)
    .leftJoin(
      challengeBallotStars,
      eq(challengeBallotStars.submissionId, challengeSubmissions.id)
    )
    .where(
      and(
        eq(challengeSubmissions.challengeId, challengeId),
        eq(challengeSubmissions.submissionStatus, "submitted")
      )
    )
    .groupBy(challengeSubmissions.id, challengeSubmissions.userId, challengeSubmissions.createdAt)
    .orderBy(
      desc(sql`COALESCE(SUM(${challengeBallotStars.starsCount}), 0)::int`),
      asc(challengeSubmissions.createdAt),
      asc(challengeSubmissions.id)
    );

  // 4. Map Jury Scores per submission
  const juryScoresBySubmission = new Map<string, { avgScore: number; count: number; designatedSlotId?: string }>();
  for (const js of juryScores) {
    const prev = juryScoresBySubmission.get(js.submissionId) || { avgScore: 0, count: 0 };
    const scoreVal = js.score || 0;
    const newCount = prev.count + 1;
    const newAvg = (prev.avgScore * prev.count + scoreVal) / newCount;
    juryScoresBySubmission.set(js.submissionId, {
      avgScore: newAvg,
      count: newCount,
      designatedSlotId: js.winnerSlotId || prev.designatedSlotId,
    });
  }

  // 5. Detect Cutoff Ties BEFORE concluding finalization
  const communityCutoffCount = communitySlots.length;
  if (
    communityCutoffCount > 0 &&
    submissionStars.length > communityCutoffCount &&
    challenge.tieStrategy === "tiebreak_round" &&
    challenge.status !== "finished"
  ) {
    const cutoffSubmission = submissionStars[communityCutoffCount - 1];
    const nextSubmission = submissionStars[communityCutoffCount];

    if (cutoffSubmission.totalStars === nextSubmission.totalStars && cutoffSubmission.totalStars > 0) {
      // Transition challenge to tiebreak_open so community can vote in tiebreak round
      await db
        .update(challenges)
        .set({ status: "tiebreak_open", updatedAt: new Date() })
        .where(eq(challenges.id, challengeId));

      revalidatePath(`/challenges/${challenge.slug}`);
      revalidatePath("/challenges");
      throw new Error(
        `Tiebreak terdeteksi pada batas kuota juara (Peringkat #${communityCutoffCount} dan #${communityCutoffCount + 1} sama-sama meraih ${cutoffSubmission.totalStars} Stars). Status challenge dialihkan ke putaran tiebreak.`
      );
    }
  }

  // 6. Transactional Result Persistence & Slot Mapping
  await db.transaction(async (tx) => {
    await tx.delete(challengeResults).where(eq(challengeResults.challengeId, challengeId));

    const assignedJurySlotIds = new Set<string>();

    for (let i = 0; i < submissionStars.length; i++) {
      const sub = submissionStars[i];
      const rank = i + 1;
      const matchingCommunitySlot = communitySlots.find((s) => s.rank === rank);
      const juryInfo = juryScoresBySubmission.get(sub.submissionId);

      let winnerSlotId: string | null = null;
      if (matchingCommunitySlot) {
        winnerSlotId = matchingCommunitySlot.id;
      } else if (juryInfo?.designatedSlotId && !assignedJurySlotIds.has(juryInfo.designatedSlotId)) {
        winnerSlotId = juryInfo.designatedSlotId;
        assignedJurySlotIds.add(juryInfo.designatedSlotId);
      }

      await tx.insert(challengeResults).values({
        challengeId,
        submissionId: sub.submissionId,
        winnerSlotId,
        finalRank: rank,
        totalCommunityStars: sub.totalStars,
        juryScore: juryInfo?.avgScore ? juryInfo.avgScore.toFixed(2) : null,
        isPublished: true,
      });

      // Send winner notification to top podium artists
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

    // Authoritatively mark challenge finished
    await tx
      .update(challenges)
      .set({ status: "finished", updatedAt: new Date() })
      .where(eq(challenges.id, challengeId));

    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "challenge.results_finalized",
      targetType: "challenge",
      targetId: challengeId,
      metadata: { totalSubmissionsRanked: submissionStars.length },
    });
  });

  revalidatePath(`/challenges/${challenge.slug}`);
  revalidatePath(`/challenges/${challenge.slug}/results`);
  revalidatePath("/challenges");

  return { success: true };
}
