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
import { eq, and, sql, inArray, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getEffectiveChallengeStatus } from "@/lib/challenges";
import { createNotification } from "@/lib/notifications";

interface StarAllocationInput {
  submissionId: string;
  starsCount: number; // 1, 2, 3, etc.
}

export async function castOrUpdateBallotAction(
  challengeId: string,
  allocations: StarAllocationInput[],
  isFinalizing: boolean = false
) {
  const user = await requireAuth("/login");

  // 1. Verify Challenge & Authoritative Voting Window
  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (!challenge) throw new Error("Challenge tidak ditemukan.");

  const effectiveStatus = getEffectiveChallengeStatus(challenge);
  if (effectiveStatus !== "voting_open" && effectiveStatus !== "tiebreak_open") {
    throw new Error("Babak voting untuk challenge ini sedang tidak dibuka.");
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

  // 3. Prevent Self-Voting Check
  if (activeAllocations.length > 0) {
    const submissionIds = activeAllocations.map((a) => a.submissionId);
    const targetSubmissions = await db
      .select({ id: challengeSubmissions.id, userId: challengeSubmissions.userId })
      .from(challengeSubmissions)
      .where(inArray(challengeSubmissions.id, submissionIds));

    for (const sub of targetSubmissions) {
      if (sub.userId === user.id) {
        throw new Error(
          "Voting untuk karya sendiri (self-voting) tidak diperbolehkan dalam aturan atelier."
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
          eq(challengeBallots.roundType, "main")
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
          roundType: "main",
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

export async function resetBallotAction(challengeId: string) {
  const user = await requireAuth("/login");

  const [existingBallot] = await db
    .select()
    .from(challengeBallots)
    .where(
      and(
        eq(challengeBallots.challengeId, challengeId),
        eq(challengeBallots.userId, user.id),
        eq(challengeBallots.roundType, "main")
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

  // Verify jury assignment or moderator/admin role
  const isModOrAdmin = user.role === "moderator" || user.role === "admin";

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
        score: score || null,
        critiqueNotes: critiqueNotes || null,
        updatedAt: new Date(),
      })
      .where(eq(challengeJuryScores.id, existingScore.id));
  } else {
    await db.insert(challengeJuryScores).values({
      challengeId,
      juryUserId: user.id,
      submissionId,
      winnerSlotId: winnerSlotId || null,
      score: score || null,
      critiqueNotes: critiqueNotes || null,
    });
  }

  revalidatePath(`/challenges/${challengeId}/jury`);
  return { success: true };
}

export async function finalizeChallengeResultsAction(challengeId: string) {
  const user = await requireModerator("/dashboard");

  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (!challenge) throw new Error("Challenge tidak ditemukan.");

  // 1. Tabulate total community stars for all submissions
  const submissionStars = await db
    .select({
      submissionId: challengeSubmissions.id,
      artistUserId: challengeSubmissions.userId,
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
    .groupBy(challengeSubmissions.id, challengeSubmissions.userId)
    .orderBy(desc(sql`COALESCE(SUM(${challengeBallotStars.starsCount}), 0)::int`));

  // 2. Fetch configured winner slots
  const winnerSlots = await db
    .select()
    .from(challengeWinnerSlots)
    .where(eq(challengeWinnerSlots.challengeId, challengeId));

  const voteSlots = winnerSlots.filter((s) => s.slotType === "community_vote");

  // 3. Clear previous results & Insert finalized rankings
  await db.transaction(async (tx) => {
    await tx.delete(challengeResults).where(eq(challengeResults.challengeId, challengeId));

    for (let i = 0; i < submissionStars.length; i++) {
      const sub = submissionStars[i];
      const rank = i + 1;
      const matchingSlot = voteSlots.find((s) => s.rank === rank);

      await tx.insert(challengeResults).values({
        challengeId,
        submissionId: sub.submissionId,
        winnerSlotId: matchingSlot?.id || null,
        finalRank: rank,
        totalCommunityStars: sub.totalStars,
        isPublished: true,
      });

      // Send winner notification to top rank artists
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

    // Transition challenge to finished
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
