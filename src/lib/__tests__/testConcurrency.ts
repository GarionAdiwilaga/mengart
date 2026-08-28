import { db } from "@/db";
import {
  challenges,
  challengeWinnerSlots,
  challengeSubmissions,
  challengeBallots,
  challengeBallotStars,
  challengeJuryAssignments,
  challengeJuryScores,
  challengeResults,
  users,
  profiles,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { finalizeChallengeResultsAction } from "@/app/actions/voting";

async function runConcurrencyTests() {
  console.log("\n=================================================================");
  console.log("⚡ STARTING CONCURRENCY & RACE CONDITION TEST SUITE");
  console.log("=================================================================\n");

  const suffix = Date.now().toString();

  // 1. Setup Test Challenge & Submissions
  console.log("[Test 1] Provisioning Concurrency Challenge & Artists...");
  const [admin] = await db
    .insert(users)
    .values({ email: `admin_conc_${suffix}@mengart.local`, role: "admin", membershipStatus: "active" })
    .returning();

  const [voter] = await db
    .insert(users)
    .values({ email: `voter_conc_${suffix}@mengart.local`, role: "member", membershipStatus: "active" })
    .returning();

  const [voterProfile] = await db
    .insert(profiles)
    .values({ userId: voter.id, displayName: "Voter Conc", slug: `voter-conc-${suffix}` })
    .returning();

  const [artist1] = await db
    .insert(users)
    .values({ email: `art1_${suffix}@mengart.local`, role: "member", membershipStatus: "active" })
    .returning();

  const [prof1] = await db
    .insert(profiles)
    .values({ userId: artist1.id, displayName: "Artist 1", slug: `art1-${suffix}` })
    .returning();

  const [artist2] = await db
    .insert(users)
    .values({ email: `art2_${suffix}@mengart.local`, role: "member", membershipStatus: "active" })
    .returning();

  const [prof2] = await db
    .insert(profiles)
    .values({ userId: artist2.id, displayName: "Artist 2", slug: `art2-${suffix}` })
    .returning();

  const [challenge] = await db
    .insert(challenges)
    .values({
      title: `Concurrency Challenge ${suffix}`,
      slug: `concurrency-challenge-${suffix}`,
      theme: "High Concurrency",
      description: "Testing 20 concurrent ballot updates",
      promptRules: "Rules",
      status: "voting_open",
      starsPerMember: 3,
      createdByUserId: admin.id,
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

  // Pre-provision voter's ballot
  const [initialBallot] = await db
    .insert(challengeBallots)
    .values({
      challengeId: challenge.id,
      userId: voter.id,
      roundType: "main",
      starsAllocated: 0,
      isFinalized: false,
    })
    .returning();

  console.log("✓ Challenge, 2 candidate submissions, and voter ballot prepared.");

  // 2. Concurrency Test: 20 Simultaneous Ballot Writes
  console.log("\n[Test 2] Simulating 20 Concurrent Ballot Writes against same ballot...");
  
  const concurrentWrites = Array.from({ length: 20 }, async (_, i) => {
    const starsForSub1 = (i % 2 === 0) ? 2 : 1;
    const starsForSub2 = 3 - starsForSub1;

    return db.transaction(async (tx) => {
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

      const ballotId = existingBallot.id;

      await tx
        .update(challengeBallots)
        .set({
          starsAllocated: 3,
          updatedAt: new Date(),
        })
        .where(eq(challengeBallots.id, ballotId));

      await tx
        .delete(challengeBallotStars)
        .where(eq(challengeBallotStars.ballotId, ballotId));

      await tx.insert(challengeBallotStars).values([
        { ballotId, submissionId: sub1.id, starsCount: starsForSub1 },
        { ballotId, submissionId: sub2.id, starsCount: starsForSub2 },
      ]);
    });
  });

  await Promise.all(concurrentWrites);
  console.log("✓ 20 concurrent ballot writes completed successfully.");

  // Verify Final Ballot Invariant
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

  // 3. Concurrency Test: Concurrent Jury Writes with Row-Level Locks
  console.log("\n[Test 3] Simulating 10 Concurrent Jury Writes for same submission...");
  const [juryUser] = await db
    .insert(users)
    .values({ email: `jury_conc_${suffix}@mengart.local`, role: "member", membershipStatus: "active" })
    .returning();

  const [juryProf] = await db
    .insert(profiles)
    .values({ userId: juryUser.id, displayName: "Jury Conc", slug: `jury-conc-${suffix}` })
    .returning();

  await db.insert(challengeJuryAssignments).values({
    challengeId: challenge.id,
    userId: juryUser.id,
    profileId: juryProf.id,
  });

  // Pre-insert initial jury score
  const [initialJuryScore] = await db
    .insert(challengeJuryScores)
    .values({
      challengeId: challenge.id,
      juryUserId: juryUser.id,
      submissionId: sub1.id,
      score: 50,
      critiqueNotes: "Initial evaluation",
    })
    .returning();

  const concurrentJuryWrites = Array.from({ length: 10 }, async (_, idx) => {
    const assignedScore = 80 + idx; // e.g. 80..89
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(challengeJuryScores)
        .where(
          and(
            eq(challengeJuryScores.challengeId, challenge.id),
            eq(challengeJuryScores.juryUserId, juryUser.id),
            eq(challengeJuryScores.submissionId, sub1.id)
          )
        )
        .for("update")
        .limit(1);

      await tx
        .update(challengeJuryScores)
        .set({
          score: assignedScore,
          critiqueNotes: `Updated evaluation iteration ${idx}`,
          updatedAt: new Date(),
        })
        .where(eq(challengeJuryScores.id, existing.id));
    });
  });

  await Promise.all(concurrentJuryWrites);
  console.log("✓ 10 concurrent jury writes completed cleanly under row-level locking.");

  const finalJuryScores = await db
    .select()
    .from(challengeJuryScores)
    .where(
      and(
        eq(challengeJuryScores.challengeId, challenge.id),
        eq(challengeJuryScores.juryUserId, juryUser.id),
        eq(challengeJuryScores.submissionId, sub1.id)
      )
    );

  if (finalJuryScores.length !== 1) {
    throw new Error(`Duplicate jury scores detected! Expected 1, found ${finalJuryScores.length}`);
  }
  console.log(`✓ Invariant preserved: Exactly 1 jury score record maintained (Final Score: ${finalJuryScores[0].score}).`);

  // 4. Concurrency Test: Simultaneous Challenge Finalization Idempotence
  console.log("\n[Test 4] Simulating Simultaneous Challenge Finalizations...");
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
          finalRank: 1,
          totalCommunityStars: 2,
          isPublished: true,
        },
        {
          challengeId: challenge.id,
          submissionId: sub2.id,
          finalRank: 2,
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

  const results = await db
    .select()
    .from(challengeResults)
    .where(eq(challengeResults.challengeId, challenge.id));

  if (results.length !== 2) {
    throw new Error(`Expected exactly 2 result records, found ${results.length}`);
  }

  console.log("✓ Final results idempotent: Exactly 2 podium positions persisted.");

  console.log("\n=================================================================");
  console.log("🎉 ALL CONCURRENCY & RACE CONDITION TESTS PASSED!");
  console.log("=================================================================\n");
}

runConcurrencyTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Concurrency Test Failed:", err);
    process.exit(1);
  });
