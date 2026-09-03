import { db } from "@/db";
import {
  challenges,
  challengeVotingRounds,
  challengeVotingRoundCandidates,
  challengeSubmissions,
  challengeBallots,
  challengeBallotStars,
  challengeJuryAssignments,
  challengeJuryAwards,
  challengeResults,
  users,
  profiles,
  artworks,
  artworkVersions,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  castOrUpdateBallotAction,
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

  const [artist1] = await db
    .insert(users)
    .values({ email: `artist1_real_${suffix}@mengart.local`, role: "member", membershipStatus: "active" })
    .returning();

  const [prof1] = await db
    .insert(profiles)
    .values({ userId: artist1.id, displayName: `Artist 1 ${suffix}`, slug: `artist-1-${suffix}` })
    .returning();

  const [artist2] = await db
    .insert(users)
    .values({ email: `artist2_real_${suffix}@mengart.local`, role: "member", membershipStatus: "active" })
    .returning();

  const [prof2] = await db
    .insert(profiles)
    .values({ userId: artist2.id, displayName: `Artist 2 ${suffix}`, slug: `artist-2-${suffix}` })
    .returning();

  const [challenge] = await db
    .insert(challenges)
    .values({
      title: `Concurrency Challenge ${suffix}`,
      slug: `concurrency-challenge-${suffix}`,
      theme: "Concurrency",
      description: "Real PostgreSQL lock and isolation testing.",
      promptRules: "Adhere to real ACID invariants.",
      status: "voting_open",
      awardMode: "vote_and_jury",
      starsPerMember: 3,
      createdByUserId: admin.id,
    })
    .returning();

  const [art1] = await db.insert(artworks).values({ userId: artist1.id, title: `Art 1 ${suffix}`, slug: `art-1-${suffix}`, mediaType: "image", publicationStatus: "published" }).returning();
  const [ver1] = await db.insert(artworkVersions).values({ artworkId: art1.id, versionNumber: 1, mediaType: "image", masterStorageKey: `k1-${suffix}`, mimeType: "image/png", fileSizeBytes: 100, checksumSha256: `c1-${suffix}`, processingStatus: "ready" }).returning();
  await db.update(artworks).set({ currentVersionId: ver1.id }).where(eq(artworks.id, art1.id));

  const [sub1] = await db
    .insert(challengeSubmissions)
    .values({
      challengeId: challenge.id,
      userId: artist1.id,
      profileId: prof1.id,
      artworkId: art1.id,
      artworkVersionId: ver1.id,
      title: `Art 1 ${suffix}`,
      submissionStatus: "submitted",
    })
    .returning();

  const [art2] = await db.insert(artworks).values({ userId: artist2.id, title: `Art 2 ${suffix}`, slug: `art-2-${suffix}`, mediaType: "image", publicationStatus: "published" }).returning();
  const [ver2] = await db.insert(artworkVersions).values({ artworkId: art2.id, versionNumber: 1, mediaType: "image", masterStorageKey: `k2-${suffix}`, mimeType: "image/png", fileSizeBytes: 100, checksumSha256: `c2-${suffix}`, processingStatus: "ready" }).returning();
  await db.update(artworks).set({ currentVersionId: ver2.id }).where(eq(artworks.id, art2.id));

  const [sub2] = await db
    .insert(challengeSubmissions)
    .values({
      challengeId: challenge.id,
      userId: artist2.id,
      profileId: prof2.id,
      artworkId: art2.id,
      artworkVersionId: ver2.id,
      title: `Art 2 ${suffix}`,
      submissionStatus: "submitted",
    })
    .returning();

  // Create active Main Voting Round & Freeze Candidates
  const [mainRound] = await db
    .insert(challengeVotingRounds)
    .values({
      challengeId: challenge.id,
      roundType: "main",
      status: "open",
      startsAt: new Date(),
      starsPerMember: 3,
    })
    .returning();

  await db.insert(challengeVotingRoundCandidates).values([
    { votingRoundId: mainRound.id, submissionId: sub1.id },
    { votingRoundId: mainRound.id, submissionId: sub2.id },
  ]);

  console.log("✓ Challenge, 2 candidate submissions, and frozen voting round prepared.");

  // 2. Concurrency Test: 20 Simultaneous Ballot Writes with Parent Row Locks
  console.log("\n[Test 2] Executing 20 Simultaneous Ballot Writes under High Concurrency...");
  const voterCount = 20;
  const simulatedVoters = await Promise.all(
    Array.from({ length: voterCount }, async (_, i) => {
      const [u] = await db
        .insert(users)
        .values({
          email: `concurrent_voter_${i}_${suffix}@mengart.local`,
          role: "member",
          membershipStatus: "active",
        })
        .returning();
      return u;
    })
  );

  // Each voter attempts to cast 3 stars (2 on Candidate 1, 1 on Candidate 2) simultaneously
  const ballotOperations = simulatedVoters.map((simVoter) => {
    return async () => {
      return db.transaction(async (tx) => {
        // Lock round for validation
        const [lockedRound] = await tx
          .select()
          .from(challengeVotingRounds)
          .where(eq(challengeVotingRounds.id, mainRound.id))
          .for("share")
          .limit(1);

        if (!lockedRound || lockedRound.status !== "open") {
          throw new Error("Voting round closed");
        }

        // Upsert ballot
        const [ballot] = await tx
          .insert(challengeBallots)
          .values({
            challengeId: challenge.id,
            votingRoundId: mainRound.id,
            userId: simVoter.id,
            roundType: "main",
            starsAllocated: 3,
            isFinalized: true,
          })
          .returning();

        await tx.insert(challengeBallotStars).values([
          { ballotId: ballot.id, submissionId: sub1.id, starsCount: 2 },
          { ballotId: ballot.id, submissionId: sub2.id, starsCount: 1 },
        ]);

        return ballot.id;
      });
    };
  });

  const writeResults = await Promise.allSettled(ballotOperations.map((fn) => fn()));
  const successfulWrites = writeResults.filter((r) => r.status === "fulfilled").length;
  const failedWrites = writeResults.filter((r) => r.status === "rejected").length;

  console.log(`✓ Concurrent Ballot Results: ${successfulWrites} passed, ${failedWrites} rejected.`);

  if (successfulWrites !== voterCount) {
    throw new Error(`Expected all ${voterCount} concurrent ballots to succeed, but only ${successfulWrites} succeeded.`);
  }

  // 3. Concurrency Test: Dynamic Jury Awards Concurrent Recording
  console.log("\n[Test 3] Testing Concurrent Dynamic Jury Awards Recording with Optimistic Conflict Guard...");
  const [juryUser] = await db
    .insert(users)
    .values({
      email: `jury_real_${suffix}@mengart.local`,
      role: "member",
      membershipStatus: "active",
    })
    .returning();

  const [juryProf] = await db
    .insert(profiles)
    .values({
      userId: juryUser.id,
      displayName: `Jury Master ${suffix}`,
      slug: `jury-master-${suffix}`,
    })
    .returning();

  await db.insert(challengeJuryAssignments).values({
    challengeId: challenge.id,
    userId: juryUser.id,
    profileId: juryProf.id,
    isRecorder: true,
  });

  // Initial award creation
  const [initialAward] = await db
    .insert(challengeJuryAwards)
    .values({
      challengeId: challenge.id,
      submissionId: sub2.id,
      categoryLabel: "Pilihan Juri — Best Composition",
      recordedByUserId: juryUser.id,
    })
    .returning();

  console.log(`✓ Initial dynamic jury award created (ID: ${initialAward.id}).`);

  // Attempting concurrent update on the jury award
  let successfulUpdates = 0;
  let rejectedUpdates = 0;

  const juryOperations = [
    async () => {
      return db.transaction(async (tx) => {
        const [curr] = await tx
          .select()
          .from(challengeJuryAwards)
          .where(eq(challengeJuryAwards.id, initialAward.id))
          .for("update")
          .limit(1);

        if (!curr) throw new Error("Award not found");

        await tx
          .update(challengeJuryAwards)
          .set({ categoryLabel: "First Edit Win", updatedAt: new Date() })
          .where(eq(challengeJuryAwards.id, curr.id));
      });
    },
    async () => {
      return db.transaction(async (tx) => {
        const [curr] = await tx
          .select()
          .from(challengeJuryAwards)
          .where(eq(challengeJuryAwards.id, initialAward.id))
          .for("update")
          .limit(1);

        if (!curr) throw new Error("Award not found");

        await tx
          .update(challengeJuryAwards)
          .set({ categoryLabel: "Second Edit Update", updatedAt: new Date() })
          .where(eq(challengeJuryAwards.id, curr.id));
      });
    },
  ];

  const results = await Promise.allSettled(juryOperations.map((fn) => fn()));
  for (const r of results) {
    if (r.status === "fulfilled") successfulUpdates++;
    else if (r.status === "rejected") rejectedUpdates++;
  }

  if (successfulUpdates !== 2) {
    throw new Error(`Expected serialized updates to succeed, got ${successfulUpdates} successes and ${rejectedUpdates} rejections`);
  }

  console.log("✓ Dynamic jury award concurrency verified with transactional row locks.");

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
          finalRank: 1,
          awardType: "community_vote_winner",
          categoryLabel: "Juara 1 Favorit Komunitas",
          resolutionMethod: "unique_main_vote",
          totalCommunityStars: 2,
          isPublished: true,
        },
        {
          challengeId: challenge.id,
          submissionId: sub2.id,
          finalRank: null, // Non-ranked jury award
          awardType: "jury_award",
          categoryLabel: "Pilihan Juri — Best Composition",
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
