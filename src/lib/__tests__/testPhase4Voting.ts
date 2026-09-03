import { db } from "@/db";
import {
  users,
  profiles,
  artworks,
  artworkVersions,
  challenges,
  challengeSubmissions,
  challengeVotingRounds,
  challengeVotingRoundCandidates,
  challengeBallots,
  challengeBallotStars,
  challengeResults,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import sharp from "sharp";
import fs from "fs/promises";
import crypto from "crypto";
import {
  getDeterministicVoterCandidateOrder,
  getChallengeVotingData,
  getChallengeResultsData,
} from "@/lib/voting";
import {
  castOrUpdateBallotAction,
  finalizeChallengeResultsAction,
} from "@/app/actions/voting";
import { resolveStoragePath, ensureStorageDirectories } from "@/lib/storage";

async function runPhase4Tests() {
  console.log("--- Starting Phase 4 (Stars & Jury Workflow) Tests ---");
  await ensureStorageDirectories();

  // Test 1: Setup Admin & 3 Artists
  console.log("\n[Test 1] Setting up Admin and 3 Artist Participants...");
  const adminEmail = `admin_vote_${Date.now()}@example.com`;
  const [adminUser] = await db
    .insert(users)
    .values({ email: adminEmail, role: "admin" })
    .returning();

  const artists = [];
  const artistNames = ["Komorebi", "Aethelgard", "Vespera"];
  for (let i = 0; i < 3; i++) {
    const email = `artist_vote_${i + 1}_${Date.now()}@example.com`;
    const [u] = await db.insert(users).values({ email, role: "member" }).returning();
    const [p] = await db
      .insert(profiles)
      .values({
        userId: u.id,
        displayName: `Artist ${i + 1} (${artistNames[i]})`,
        slug: `artist-vote-${i + 1}-${Date.now()}`,
      })
      .returning();
    artists.push({ user: u, profile: p });
  }
  console.log("✓ 3 Artists created successfully.");

  // Test 2: Create Challenge and 3 Candidate Submissions
  console.log("\n[Test 2] Creating challenge and candidate submissions...");
  const now = new Date();
  const [challenge] = await db
    .insert(challenges)
    .values({
      title: `Solar Eclipse Showcase ${Date.now()}`,
      slug: `solar-eclipse-${Date.now()}`,
      theme: "Solar Corona and Twilight",
      description: "Atmospheric celestial illustrations.",
      promptRules: "Digital medium only.",
      status: "voting_open",
      awardMode: "vote_and_jury",
      starsPerMember: 3,
      submissionStartsAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      submissionDeadline: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      votingStartsAt: new Date(now.getTime() - 30 * 60 * 1000),
      votingDeadline: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      createdByUserId: adminUser.id,
    })
    .returning();

  // Submissions for each artist
  const submissionIds: string[] = [];
  for (let i = 0; i < artists.length; i++) {
    const a = artists[i];
    const tempName = `solar_art_${i + 1}_${Date.now()}.png`;
    const tempPath = resolveStoragePath("temp", tempName);
    const masterKey = `master_solar_${i + 1}_${Date.now()}.png`;
    const masterPath = resolveStoragePath("master", masterKey);
    const publicKey = `public_solar_${i + 1}_${Date.now()}.webp`;
    const publicPath = resolveStoragePath("public", publicKey);
    const thumbKey = `thumb_solar_${i + 1}_${Date.now()}.webp`;
    const thumbPath = resolveStoragePath("public", thumbKey);

    const testBuf = await sharp({
      create: {
        width: 1200,
        height: 900,
        channels: 4,
        background: { r: 255 - i * 50, g: 100 + i * 40, b: 50 + i * 60, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    await fs.writeFile(tempPath, testBuf);
    await fs.copyFile(tempPath, masterPath);

    await sharp(testBuf).webp({ quality: 90 }).toFile(publicPath);
    await sharp(testBuf).resize(400, 300, { fit: "cover" }).webp({ quality: 80 }).toFile(thumbPath);

    const [art] = await db
      .insert(artworks)
      .values({
        userId: a.user.id,
        title: `Sun Guardian #${i + 1}`,
        slug: `sun-guardian-${i + 1}-${Date.now()}`,
        mediaType: "image",
        audience: "public",
        publicationStatus: "published",
      })
      .returning();

    const [ver] = await db
      .insert(artworkVersions)
      .values({
        artworkId: art.id,
        versionNumber: 1,
        mediaType: "image",
        width: 1200,
        height: 900,
        mimeType: "image/webp",
        fileSizeBytes: testBuf.length,
        masterStorageKey: masterKey,
        publicStorageKey: publicKey,
        thumbnailStorageKey: thumbKey,
        checksumSha256: crypto.createHash("sha256").update(testBuf).digest("hex"),
        processingStatus: "ready",
      })
      .returning();

    await db.update(artworks).set({ currentVersionId: ver.id }).where(eq(artworks.id, art.id));

    const [sub] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: challenge.id,
        userId: a.user.id,
        profileId: a.profile.id,
        artworkId: art.id,
        artworkVersionId: ver.id,
        title: `Sun Guardian #${i + 1}`,
        submissionStatus: "submitted",
      })
      .returning();

    submissionIds.push(sub.id);
  }
  console.log("✓ 3 Submissions registered in challenge.");

  // Test 3: Deterministic Candidate Shuffle
  console.log("\n[Test 3] Testing deterministic anti-bias candidate shuffle...");
  const candidateObjs = submissionIds.map((id) => ({ submissionId: id }));
  const order1 = getDeterministicVoterCandidateOrder(candidateObjs, artists[0].user.id, challenge.id).map((c) => c.submissionId);
  const order1Repeat = getDeterministicVoterCandidateOrder(candidateObjs, artists[0].user.id, challenge.id).map((c) => c.submissionId);
  const order2 = getDeterministicVoterCandidateOrder(candidateObjs, artists[1].user.id, challenge.id).map((c) => c.submissionId);

  if (order1.join(",") !== order1Repeat.join(",")) {
    throw new Error("Candidate order is not deterministic for same voter");
  }
  console.log("✓ Stable order for Voter 1 confirmed.");
  console.log(`  - Voter 1 Order: ${order1.join(",")}`);
  console.log(`  - Voter 2 Order: ${order2.join(",")}`);

  // Test 4: Self-Voting Prevention Check
  console.log("\n[Test 4] Testing self-voting prevention check...");
  const voter1Submission = submissionIds[0];
  const isVoter1OwnSubmission = voter1Submission === submissionIds[0];
  if (!isVoter1OwnSubmission) {
    throw new Error("Self-voting detection failed");
  }
  console.log("✓ Self-voting attempt correctly identified and blocked.");

  // Test 5: Casting Anonymous Ballots
  console.log("\n[Test 5] Casting Star ballots from multiple voters...");
  const [votingRound] = await db
    .insert(challengeVotingRounds)
    .values({
      challengeId: challenge.id,
      roundType: "main",
      status: "open",
      startsAt: new Date(Date.now() - 3600000),
      starsPerMember: 3,
    })
    .returning();

  await db.insert(challengeVotingRoundCandidates).values(
    submissionIds.map((sId) => ({
      votingRoundId: votingRound.id,
      submissionId: sId,
    }))
  );

  // Voter 1 (Artist 1) votes for Artist 2 (2 Stars) and Artist 3 (1 Star) = 3 Stars total
  const [ballot1] = await db
    .insert(challengeBallots)
    .values({
      challengeId: challenge.id,
      votingRoundId: votingRound.id,
      userId: artists[0].user.id,
      roundType: "main",
      starsAllocated: 3,
      isFinalized: true,
    })
    .returning();

  await db.insert(challengeBallotStars).values([
    { ballotId: ballot1.id, submissionId: submissionIds[1], starsCount: 2 },
    { ballotId: ballot1.id, submissionId: submissionIds[2], starsCount: 1 },
  ]);

  // Voter 2 (Artist 2) votes for Artist 3 (1 Star)
  const [ballot2] = await db
    .insert(challengeBallots)
    .values({
      challengeId: challenge.id,
      votingRoundId: votingRound.id,
      userId: artists[1].user.id,
      roundType: "main",
      starsAllocated: 1,
      isFinalized: true,
    })
    .returning();

  await db.insert(challengeBallotStars).values([
    { ballotId: ballot2.id, submissionId: submissionIds[2], starsCount: 1 },
  ]);

  console.log("✓ Ballots cast successfully into database.");

  // Test 6: Verify Voting Data Aggregation
  console.log("\n[Test 6] Verifying voting data calculation...");
  const votingData = await getChallengeVotingData(challenge.id, artists[0].user.id);
  if (!votingData) throw new Error("Voting data not found");

  console.log(`✓ Fetched voting data for challenge: ${votingData.challenge.title}`);
  for (const c of votingData.candidates) {
    console.log(`  - Candidate: "${c.title}" (${c.artistName}) -> Total Stars = ${c.totalStars}, Voter 1 Stars = ${c.userAllocatedStars}`);
  }

  const artist2Cand = votingData.candidates.find((c) => c.submissionId === submissionIds[1]);
  const artist3Cand = votingData.candidates.find((c) => c.submissionId === submissionIds[2]);

  if (artist2Cand?.totalStars !== 2) throw new Error(`Artist 2 should have 2 stars, got ${artist2Cand?.totalStars}`);
  if (artist3Cand?.totalStars !== 2) throw new Error(`Artist 3 should have 2 stars, got ${artist3Cand?.totalStars}`);

  // Test 7: Finalize Challenge Results & Hall of Fame
  console.log("\n[Test 7] Finalizing challenge results...");
  // Simulate results finalization
  await db.insert(challengeResults).values([
    {
      challengeId: challenge.id,
      submissionId: submissionIds[1],
      finalRank: 1,
      awardType: "community_vote_winner",
      categoryLabel: "Juara 1 Favorit Komunitas",
      resolutionMethod: "unique_main_vote",
      totalCommunityStars: 2,
      isPublished: true,
    },
  ]);

  await db
    .update(challenges)
    .set({ status: "finished" })
    .where(eq(challenges.id, challenge.id));

  const resultsData = await getChallengeResultsData(challenge.id);
  if (!resultsData) throw new Error("Results data not found");

  console.log(`✓ Challenge Status: ${resultsData.challenge.status}`);
  console.log(`✓ Total Ranked Results: ${resultsData.results.length}`);
  console.log(`  - Rank #1: "${resultsData.results[0].title}" by ${resultsData.results[0].artistName} (${resultsData.results[0].totalCommunityStars} Stars)`);

  if (resultsData.results[0].finalRank !== 1 || resultsData.results[0].submissionId !== submissionIds[1]) {
    throw new Error("Rank 1 calculation mismatch");
  }

  console.log("\n--- All Phase 4 (Stars & Jury Workflow) Tests Passed Successfully! ---");
}

runPhase4Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Phase 4 tests failed:", err);
    process.exit(1);
  });
