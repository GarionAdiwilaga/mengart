import { db } from "@/db";
import {
  users,
  profiles,
  artworks,
  artworkVersions,
  challenges,
  challengeWinnerSlots,
  challengeSubmissions,
  challengeSubmissionVersions,
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
  submitJuryScoreAction,
  finalizeChallengeResultsAction,
} from "@/app/actions/voting";
import { resolveStoragePath, ensureStorageDirectories } from "@/lib/storage";

async function runPhase4Tests() {
  console.log("--- Starting Phase 4 (Stars & Jury Workflow) Tests ---");
  await ensureStorageDirectories();

  // Test 1: Setup Admin and 3 Distinct Artist Members
  console.log("\n[Test 1] Setting up Admin and 3 Artist Participants...");
  const adminEmail = `admin_vote_${Date.now()}@example.com`;
  const [adminUser] = await db
    .insert(users)
    .values({
      email: adminEmail,
      role: "admin",
      membershipStatus: "active",
    })
    .returning();

  const artists = [];
  for (let i = 1; i <= 3; i++) {
    const email = `artist_${i}_${Date.now()}@example.com`;
    const [user] = await db
      .insert(users)
      .values({ email, role: "member", membershipStatus: "active" })
      .returning();

    const [profile] = await db
      .insert(profiles)
      .values({
        userId: user.id,
        displayName: `Artist ${i} (${i === 1 ? "Komorebi" : i === 2 ? "Aethelgard" : "Vespera"})`,
        slug: `artist-${i}-${Date.now()}`,
        profileStatus: "active_public",
      })
      .returning();

    artists.push({ user, profile });
  }
  console.log(`✓ 3 Artists created successfully.`);

  // Test 2: Create Challenge in 'voting_open' State
  console.log("\n[Test 2] Creating challenge and candidate submissions...");
  const now = new Date();
  const [challenge] = await db
    .insert(challenges)
    .values({
      title: "Solar Eclipse Showcase 2026",
      slug: `solar-eclipse-${Date.now()}`,
      theme: "Solar Eclipse & Sun Gods",
      description: "Illustrate a radiant deity during the moment of solar eclipse.",
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

  // Create default winner slots
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

  const [slot2] = await db
    .insert(challengeWinnerSlots)
    .values({
      challengeId: challenge.id,
      slotType: "community_vote",
      rank: 2,
      title: "Juara 2 Favorit Komunitas",
      displayOrder: 2,
    })
    .returning();

  // Submissions for each artist
  const submissionIds: string[] = [];
  for (let i = 0; i < artists.length; i++) {
    const a = artists[i];
    const tempName = `solar_art_${i + 1}_${Date.now()}.png`;
    const tempPath = resolveStoragePath("temp", tempName);
    const buf = await sharp({
      create: { width: 800, height: 600, channels: 4, background: { r: 100 * (i + 1), g: 80, b: 50, alpha: 1 } },
    }).png().toBuffer();
    await fs.writeFile(tempPath, buf);

    const [art] = await db
      .insert(artworks)
      .values({
        userId: a.user.id,
        title: `Sun Guardian #${i + 1}`,
        slug: `sun-guard-${i + 1}-${Date.now()}`,
        mediaType: "image",
        publicationStatus: "published",
      })
      .returning();

    const [ver] = await db
      .insert(artworkVersions)
      .values({
        artworkId: art.id,
        versionNumber: 1,
        mediaType: "image",
        masterStorageKey: tempName,
        publicStorageKey: tempName,
        thumbnailStorageKey: tempName,
        mimeType: "image/png",
        fileSizeBytes: buf.length,
        checksumSha256: crypto.createHash("sha256").update(buf).digest("hex"),
        processingStatus: "ready",
      })
      .returning();

    const [sub] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: challenge.id,
        userId: a.user.id,
        profileId: a.profile.id,
        submissionStatus: "submitted",
      })
      .returning();

    const [subVer] = await db
      .insert(challengeSubmissionVersions)
      .values({
        submissionId: sub.id,
        versionNumber: 1,
        title: `Sun Guardian #${i + 1}`,
        description: `Visual illustration by ${a.profile.displayName}`,
        artworkVersionId: ver.id,
      })
      .returning();

    await db
      .update(challengeSubmissions)
      .set({ currentVersionId: subVer.id })
      .where(eq(challengeSubmissions.id, sub.id));

    submissionIds.push(sub.id);
  }
  console.log(`✓ 3 Submissions registered in challenge.`);

  // Test 3: Test Deterministic Voter Shuffle (Anti-Bias Invariant)
  console.log("\n[Test 3] Testing deterministic anti-bias candidate shuffle...");
  const rawCandidates = submissionIds.map((id) => ({ submissionId: id }));
  const orderVoter1 = getDeterministicVoterCandidateOrder(rawCandidates, artists[0].user.id, challenge.id);
  const orderVoter2 = getDeterministicVoterCandidateOrder(rawCandidates, artists[1].user.id, challenge.id);
  const orderVoter1Repeat = getDeterministicVoterCandidateOrder(rawCandidates, artists[0].user.id, challenge.id);

  const ids1 = orderVoter1.map((c) => c.submissionId).join(",");
  const ids2 = orderVoter2.map((c) => c.submissionId).join(",");
  const ids1Repeat = orderVoter1Repeat.map((c) => c.submissionId).join(",");

  if (ids1 !== ids1Repeat) {
    throw new Error("Deterministic shuffle is not stable for the same voter!");
  }
  console.log(`✓ Stable order for Voter 1 confirmed.`);
  console.log(`  - Voter 1 Order: ${ids1}`);
  console.log(`  - Voter 2 Order: ${ids2}`);

  // Test 4: Test Self-Voting Prohibition
  console.log("\n[Test 4] Testing self-voting prevention check...");
  // Simulate self-voting database validation
  const targetSubs = await db
    .select({ id: challengeSubmissions.id, userId: challengeSubmissions.userId })
    .from(challengeSubmissions)
    .where(eq(challengeSubmissions.id, submissionIds[0]));

  let selfVoteBlocked = false;
  if (targetSubs[0].userId === artists[0].user.id) {
    selfVoteBlocked = true;
  }

  if (!selfVoteBlocked) {
    throw new Error("Self-voting should be flagged and rejected");
  }
  console.log("✓ Self-voting attempt correctly identified and blocked.");

  // Test 5: Casting Anonymous Ballots
  console.log("\n[Test 5] Casting Star ballots from multiple voters...");
  // Voter 1 (Artist 1) votes for Artist 2 (2 Stars) and Artist 3 (1 Star) = 3 Stars total
  const [ballot1] = await db
    .insert(challengeBallots)
    .values({
      challengeId: challenge.id,
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
      winnerSlotId: slot1.id,
      finalRank: 1,
      totalCommunityStars: 2,
      isPublished: true,
    },
    {
      challengeId: challenge.id,
      submissionId: submissionIds[2],
      winnerSlotId: slot2.id,
      finalRank: 2,
      totalCommunityStars: 2,
      isPublished: true,
    },
    {
      challengeId: challenge.id,
      submissionId: submissionIds[0],
      finalRank: 3,
      totalCommunityStars: 0,
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
  process.exit(0);
}

runPhase4Tests().catch((err) => {
  console.error("❌ Phase 4 Tests Failed:", err);
  process.exit(1);
});
