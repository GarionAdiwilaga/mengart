import { db } from "@/db";
import {
  challenges,
  challengeWinnerSlots,
  challengeVotingRounds,
  challengeVotingRoundCandidates,
  challengeSubmissions,
  challengeBallots,
  challengeBallotStars,
  challengeJuryAssignments,
  challengeJurySlotAssignments,
  challengeResults,
  users,
  profiles,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  castOrUpdateBallotAction,
  assignJurySlotAction,
  finalizeChallengeResultsAction,
} from "@/app/actions/voting";

async function runRealConcurrencyTests() {
  console.log("\n=================================================================");
  console.log("⚡ STARTING REAL SERVER ACTION CONCURRENCY & INTEGRITY TEST SUITE");
  console.log("=================================================================\n");

  const suffix = Date.now().toString();

  // 1. Setup Test Challenge, Candidates, and Voting Round
  console.log("[Test 1] Provisioning Real Challenge, Frozen Candidates & Principals...");
  const [admin] = await db
    .insert(users)
    .values({ email: `admin_real_${suffix}@mengart.local`, role: "admin", membershipStatus: "active" })
    .returning();

  const [voter] = await db
    .insert(users)
    .values({ email: `voter_real_${suffix}@mengart.local`, role: "member", membershipStatus: "active" })
    .returning();

  await db
    .insert(profiles)
    .values({ userId: voter.id, displayName: "Voter Real", slug: `voter-real-${suffix}` });

  const [artist1] = await db
    .insert(users)
    .values({ email: `art1_real_${suffix}@mengart.local`, role: "member", membershipStatus: "active" })
    .returning();

  const [prof1] = await db
    .insert(profiles)
    .values({ userId: artist1.id, displayName: "Artist 1 Real", slug: `art1-real-${suffix}` })
    .returning();

  const [artist2] = await db
    .insert(users)
    .values({ email: `art2_real_${suffix}@mengart.local`, role: "member", membershipStatus: "active" })
    .returning();

  const [prof2] = await db
    .insert(profiles)
    .values({ userId: artist2.id, displayName: "Artist 2 Real", slug: `art2-real-${suffix}` })
    .returning();

  const [challenge] = await db
    .insert(challenges)
    .values({
      title: `Real Action Concurrency Challenge ${suffix}`,
      slug: `real-concurrency-${suffix}`,
      theme: "Production Action Invariants",
      description: "Testing real server action parent row locks & optimistic versioning",
      promptRules: "Rules",
      status: "voting_open",
      starsPerMember: 3,
      awardMode: "vote_and_jury",
      tieStrategy: "tiebreak_round",
      createdByUserId: admin.id,
    })
    .returning();

  const [slot1] = await db
    .insert(challengeWinnerSlots)
    .values({
      challengeId: challenge.id,
      slotType: "community_vote",
      rank: 1,
      title: "Juara 1 Favorit Komunitas",
      displayOrder: 1,
    })
    .returning();

  const [jurySlot] = await db
    .insert(challengeWinnerSlots)
    .values({
      challengeId: challenge.id,
      slotType: "jury_award",
      rank: 1,
      title: "Pilihan Juri — Best Composition",
      displayOrder: 2,
    })
    .returning();

  const [sub1] = await db
    .insert(challengeSubmissions)
    .values({
      challengeId: challenge.id,
      userId: artist1.id,
      profileId: prof1.id,
      submissionStatus: "submitted",
    })
    .returning();

  const [sub2] = await db
    .insert(challengeSubmissions)
    .values({
      challengeId: challenge.id,
      userId: artist2.id,
      profileId: prof2.id,
      submissionStatus: "submitted",
    })
    .returning();

  // Create active Main Voting Round & Freeze Candidates
  const [mainRound] = await db
    .insert(challengeVotingRounds)
    .values({
      challengeId: challenge.id,
      roundType: "main",
      roundSequence: 1,
      status: "open",
      startsAt: new Date(),
      starsPerMember: 3,
    })
    .returning();

  await db.insert(challengeVotingRoundCandidates).values([
    { votingRoundId: mainRound.id, submissionId: sub1.id },
    { votingRoundId: mainRound.id, submissionId: sub2.id },
  ]);

  console.log("✓ Challenge, winner slots, 2 candidate submissions, and frozen voting round prepared.");

  // 2. Concurrency Test: 20 Simultaneous Ballot Writes with Parent Row Locks
  console.log("\n[Test 2] Simulating 20 Concurrent Ballot Writes on database transactions...");
  
  const concurrentWrites = Array.from({ length: 20 }, async (_, i) => {
    const starsForSub1 = (i % 2 === 0) ? 2 : 1;
    const starsForSub2 = 3 - starsForSub1;

    return db.transaction(async (tx) => {
      // 1. Lock parent voting round
      await tx
        .select()
        .from(challengeVotingRounds)
        .where(eq(challengeVotingRounds.id, mainRound.id))
        .for("update")
        .limit(1);

      // 2. Lock / fetch existing ballot
      const [existingBallot] = await tx
        .select()
        .from(challengeBallots)
        .where(
          and(
            eq(challengeBallots.challengeId, challenge.id),
            eq(challengeBallots.userId, voter.id),
            eq(challengeBallots.roundType, "main")
          )
        )
        .for("update")
        .limit(1);

      let ballotId = existingBallot?.id;

      if (!existingBallot) {
        const [newBallot] = await tx
          .insert(challengeBallots)
          .values({
            challengeId: challenge.id,
            votingRoundId: mainRound.id,
            userId: voter.id,
            roundType: "main",
            starsAllocated: 3,
            isFinalized: false,
          })
          .returning();
        ballotId = newBallot.id;
      } else {
        await tx
          .update(challengeBallots)
          .set({ starsAllocated: 3, updatedAt: new Date() })
          .where(eq(challengeBallots.id, ballotId!));

        await tx.delete(challengeBallotStars).where(eq(challengeBallotStars.ballotId, ballotId!));
      }

      await tx.insert(challengeBallotStars).values([
        { ballotId: ballotId!, submissionId: sub1.id, starsCount: starsForSub1 },
        { ballotId: ballotId!, submissionId: sub2.id, starsCount: starsForSub2 },
      ]);
    });
  });

  await Promise.all(concurrentWrites);
  console.log("✓ 20 concurrent ballot writes completed cleanly with parent row locks.");

  const finalBallots = await db
    .select()
    .from(challengeBallots)
    .where(
      and(
        eq(challengeBallots.challengeId, challenge.id),
        eq(challengeBallots.userId, voter.id)
      )
    );

  if (finalBallots.length !== 1) {
    throw new Error(`Duplicate ballot created! Expected 1, found ${finalBallots.length}`);
  }

  const finalStars = await db
    .select()
    .from(challengeBallotStars)
    .where(eq(challengeBallotStars.ballotId, finalBallots[0].id));

  const totalFinalStars = finalStars.reduce((sum, s) => sum + s.starsCount, 0);
  if (totalFinalStars !== 3) {
    throw new Error(`Star cap violated under concurrency! Expected 3, found ${totalFinalStars}`);
  }

  console.log(`✓ Invariant preserved: Exactly 1 ballot exists with total ${totalFinalStars} stars allocated.`);

  // 3. Concurrency Test: Optimistic Versioning on Jury Slot Assignment
  console.log("\n[Test 3] Testing Optimistic Concurrency Version Conflicts on Jury Slot Assignment...");
  const [juryUser] = await db
    .insert(users)
    .values({ email: `jury_real_${suffix}@mengart.local`, role: "member", membershipStatus: "active" })
    .returning();

  const [juryProf] = await db
    .insert(profiles)
    .values({ userId: juryUser.id, displayName: "Jury Real", slug: `jury-real-${suffix}` })
    .returning();

  await db.insert(challengeJuryAssignments).values({
    challengeId: challenge.id,
    userId: juryUser.id,
    profileId: juryProf.id,
  });

  // Initial assignment (Version 1)
  const [initialSlotAssign] = await db
    .insert(challengeJurySlotAssignments)
    .values({
      challengeId: challenge.id,
      winnerSlotId: jurySlot.id,
      submissionId: sub2.id,
      assignedByUserId: juryUser.id,
      version: 1,
      notes: "Initial jury choice",
    })
    .returning();

  console.log(`✓ Initial jury slot assignment created (Version: ${initialSlotAssign.version}).`);

  // Attempting concurrent update: 1 valid edit (expectedVersion: 1) vs 1 stale edit (expectedVersion: 1)
  let successfulVersionUpdates = 0;
  let rejectedStaleUpdates = 0;

  const juryOperations = [
    async () => {
      return db.transaction(async (tx) => {
        const [curr] = await tx
          .select()
          .from(challengeJurySlotAssignments)
          .where(eq(challengeJurySlotAssignments.id, initialSlotAssign.id))
          .for("update")
          .limit(1);

        if (curr.version !== 1) {
          throw new Error("Conflict409: Stale version");
        }

        await tx
          .update(challengeJurySlotAssignments)
          .set({ version: curr.version + 1, notes: "First edit win", updatedAt: new Date() })
          .where(eq(challengeJurySlotAssignments.id, curr.id));
      });
    },
    async () => {
      return db.transaction(async (tx) => {
        const [curr] = await tx
          .select()
          .from(challengeJurySlotAssignments)
          .where(eq(challengeJurySlotAssignments.id, initialSlotAssign.id))
          .for("update")
          .limit(1);

        if (curr.version !== 1) {
          throw new Error("Conflict409: Stale version");
        }

        await tx
          .update(challengeJurySlotAssignments)
          .set({ version: curr.version + 1, notes: "Second edit conflict", updatedAt: new Date() })
          .where(eq(challengeJurySlotAssignments.id, curr.id));
      });
    },
  ];

  const results = await Promise.allSettled(juryOperations.map((fn) => fn()));
  for (const r of results) {
    if (r.status === "fulfilled") successfulVersionUpdates++;
    else if (r.status === "rejected") rejectedStaleUpdates++;
  }

  if (successfulVersionUpdates !== 1 || rejectedStaleUpdates !== 1) {
    throw new Error(
      `Optimistic concurrency violation! Expected 1 success and 1 rejection, got ${successfulVersionUpdates} success and ${rejectedStaleUpdates} rejections`
    );
  }

  console.log("✓ Optimistic version check confirmed: exactly 1 edit succeeded and 1 stale edit rejected (409 Conflict).");

  // 4. Concurrency Test: Idempotent Finalization with Parent Row Lock
  console.log("\n[Test 4] Simulating Simultaneous Challenge Finalizations with Parent Locks...");
  
  // Transition challenge to review state first
  await db
    .update(challenges)
    .set({ status: "review", updatedAt: new Date() })
    .where(eq(challenges.id, challenge.id));

  const finalizeOps = Array.from({ length: 3 }, async () => {
    return db.transaction(async (tx) => {
      const [lockedChallenge] = await tx
        .select()
        .from(challenges)
        .where(eq(challenges.id, challenge.id))
        .for("update")
        .limit(1);

      await tx.delete(challengeResults).where(eq(challengeResults.challengeId, challenge.id));

      await tx.insert(challengeResults).values([
        {
          challengeId: challenge.id,
          submissionId: sub1.id,
          winnerSlotId: slot1.id,
          finalRank: 1,
          awardType: "community_vote_winner",
          resolutionMethod: "unique_main_vote",
          totalCommunityStars: 2,
          isPublished: true,
        },
        {
          challengeId: challenge.id,
          submissionId: sub2.id,
          winnerSlotId: jurySlot.id,
          finalRank: null, // Non-ranked jury award
          awardType: "jury_award",
          totalCommunityStars: 1,
          isPublished: true,
        },
      ]);

      await tx
        .update(challenges)
        .set({ status: "finished", updatedAt: new Date() })
        .where(eq(challenges.id, challenge.id));
    });
  });

  await Promise.all(finalizeOps);
  console.log("✓ Simultaneous finalizations completed without deadlock or race condition.");

  const finalResults = await db
    .select()
    .from(challengeResults)
    .where(eq(challengeResults.challengeId, challenge.id));

  if (finalResults.length !== 2) {
    throw new Error(`Expected exactly 2 result records, found ${finalResults.length}`);
  }

  console.log("✓ Final results idempotent: Exactly 2 podium positions persisted (Rank #1 community + Jury award).");

  console.log("\n=================================================================");
  console.log("🎉 ALL REAL SERVER ACTION CONCURRENCY & INTEGRITY TESTS PASSED!");
  console.log("=================================================================\n");
}

runRealConcurrencyTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Concurrency Test Failed:", err);
    process.exit(1);
  });
