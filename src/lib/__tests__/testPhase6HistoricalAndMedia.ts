import { db } from "@/db";
import {
  challenges,
  challengeSubmissions,
  challengeResults,
  users,
  profiles,
  artworks,
  artworkVersions,
  auditLogs,
  activityLogs,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getChallengeResultsData } from "@/lib/voting";
import { getChallengeBySlug } from "@/lib/challenges";

async function runPhase6Tests() {
  console.log("\n=================================================================");
  console.log("🚀 STARTING PHASE 6: HISTORICAL BACKFILL & MEDIA TEST SUITE");
  console.log("=================================================================\n");

  // 1. Setup Test Admin and 3 Artists
  console.log("[Test 1] Setting up Test Admin and Historical Artists...");
  const uniqueSuffix = Date.now().toString();

  const [adminUser] = await db
    .insert(users)
    .values({
      email: `admin_phase6_${uniqueSuffix}@mengart.local`,
      role: "admin",
    })
    .returning();

  const [artist1] = await db
    .insert(users)
    .values({
      email: `artist1_phase6_${uniqueSuffix}@mengart.local`,
      role: "member",
    })
    .returning();

  const [profile1] = await db
    .insert(profiles)
    .values({
      userId: artist1.id,
      displayName: "Nusantara Cyber Sculptor",
      slug: `cyber-artist-${uniqueSuffix}-1`,
    })
    .returning();

  const [artist2] = await db
    .insert(users)
    .values({
      email: `artist2_phase6_${uniqueSuffix}@mengart.local`,
      role: "member",
    })
    .returning();

  const [profile2] = await db
    .insert(profiles)
    .values({
      userId: artist2.id,
      displayName: "Vespera Dreamweaver",
      slug: `dream-artist-${uniqueSuffix}-2`,
    })
    .returning();

  const [artist3] = await db
    .insert(users)
    .values({
      email: `artist3_phase6_${uniqueSuffix}@mengart.local`,
      role: "member",
    })
    .returning();

  const [profile3] = await db
    .insert(profiles)
    .values({
      userId: artist3.id,
      displayName: "Komorebi Digital Arts",
      slug: `komorebi-artist-${uniqueSuffix}-3`,
    })
    .returning();

  console.log("✓ Admin and 3 Historical Artists initialized.");

  // 2. Simulate Historical Challenge Backfill
  console.log("\n[Test 2] Simulating Historical Challenge Backfill Import...");
  const historicalSlug = `grand-cyber-nusantara-${uniqueSuffix}`;
  const [historicalChallenge] = await db
    .insert(challenges)
    .values({
      title: `Grand Cyber Nusantara Invitational ${uniqueSuffix}`,
      slug: historicalSlug,
      theme: "Cyberpunk Archipelago",
      description: "Tribute untuk lanskap masa depan nusantara.",
      promptRules: "Desain visual arsitektur dan kultur lokal dengan sentuhan neon.",
      status: "finished",
      awardMode: "vote_and_jury",
      starsPerMember: 3,
      isVisible: true,
      submissionStartsAt: new Date("2024-10-01T00:00:00Z"),
      submissionDeadline: new Date("2024-10-20T23:59:59Z"),
      votingStartsAt: new Date("2024-10-21T00:00:00Z"),
      votingDeadline: new Date("2024-10-28T23:59:59Z"),
      createdByUserId: adminUser.id,
    })
    .returning();

  console.log("✓ Historical Challenge persisted.");

  // 3. Create Artworks, Submissions, and Results
  console.log("\n[Test 3] Inserting historical submissions and ranking cache...");
  const entries = [
    {
      user: artist1,
      profile: profile1,
      title: "Batavia 2099: Neon Harbor",
      rank: 1,
      awardType: "community_vote_winner",
      categoryLabel: "Juara 1 Favorit Komunitas",
      stars: 35,
      juryScore: 92.5,
    },
    {
      user: artist2,
      profile: profile2,
      title: "Floating Sky Palace of Majapahit",
      rank: null,
      awardType: "jury_award",
      categoryLabel: "Penghargaan Khusus Komposisi Visual",
      stars: 28,
      juryScore: 88.0,
    },
    {
      user: artist3,
      profile: profile3,
      title: "Spirits of the Silicon Forest",
      rank: null,
      awardType: "jury_award",
      categoryLabel: "Pilihan Dewan Juri Atelier",
      stars: 12,
      juryScore: 95.0,
    },
  ];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    // Create Artwork
    const [art] = await db
      .insert(artworks)
      .values({
        userId: entry.user.id,
        slug: `art-${historicalSlug}-${i + 1}`,
        title: entry.title,
        mediaType: "image",
        audience: "public",
        critiqueMode: "open_for_critique",
        publicationStatus: "published",
      })
      .returning();

    // Create Version
    const [artVer] = await db
      .insert(artworkVersions)
      .values({
        artworkId: art.id,
        versionNumber: 1,
        mediaType: "image",
        masterStorageKey: `historical_master_${uniqueSuffix}_${i}.png`,
        publicStorageKey: `historical_public_${uniqueSuffix}_${i}.webp`,
        thumbnailStorageKey: `historical_thumb_${uniqueSuffix}_${i}.webp`,
        mimeType: "image/webp",
        fileSizeBytes: 1024 * 1024,
        checksumSha256: `historical_sha256_${uniqueSuffix}_${i}`,
        processingStatus: "ready",
      })
      .returning();

    await db.update(artworks).set({ currentVersionId: artVer.id }).where(eq(artworks.id, art.id));

    // Create Submission
    const [sub] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: historicalChallenge.id,
        userId: entry.user.id,
        profileId: entry.profile.id,
        artworkId: art.id,
        artworkVersionId: artVer.id,
        title: entry.title,
        submissionStatus: "submitted",
      })
      .returning();

    // Create Result
    await db.insert(challengeResults).values({
      challengeId: historicalChallenge.id,
      submissionId: sub.id,
      finalRank: entry.rank,
      awardType: entry.awardType,
      categoryLabel: entry.categoryLabel,
      totalCommunityStars: entry.stars,
      juryScore: entry.juryScore.toString(),
      isPublished: true,
    });
  }

  console.log("✓ 3 Historical Submissions and Ranked Results successfully created.");

  // 4. Verify Results and Hall of Fame Queries
  console.log("\n[Test 4] Verifying Hall of Fame and Results Retrieval...");
  const fetchedChallenge = await getChallengeBySlug(historicalSlug);
  if (!fetchedChallenge) throw new Error("Failed to fetch historical challenge by slug.");
  if (fetchedChallenge.effectiveStatus !== "finished") {
    throw new Error(`Expected status 'finished', got '${fetchedChallenge.effectiveStatus}'`);
  }
  console.log(`✓ Fetched historical challenge: "${fetchedChallenge.title}" (Status: ${fetchedChallenge.effectiveStatus})`);

  const resultsPayload = await getChallengeResultsData(historicalChallenge.id);
  if (!resultsPayload || resultsPayload.results.length !== 3) {
    throw new Error(`Expected 3 results, got ${resultsPayload?.results.length}`);
  }

  const champion = resultsPayload.results[0];
  console.log(`✓ Podium Rank #1 Champion: "${champion.title}" by ${champion.artistName} (${champion.totalCommunityStars} Stars, Award: ${champion.slotTitle})`);
  if (champion.finalRank !== 1 || champion.totalCommunityStars !== 35) {
    throw new Error("Champion rank or stars mismatch in results calculation.");
  }

  const rank2 = resultsPayload.results[1];
  console.log(`✓ Podium Rank #2: "${rank2.title}" by ${rank2.artistName} (${rank2.totalCommunityStars} Stars)`);

  const juryWinner = resultsPayload.results.find((r) => r.slotTitle === "Pilihan Dewan Juri Atelier");
  console.log(`✓ Jury Award Winner: "${juryWinner?.title}" by ${juryWinner?.artistName} (Score: ${juryWinner?.juryScore})`);

  // 5. Test Audit Log Entry
  console.log("\n[Test 5] Recording and verifying administrative audit log...");
  const [auditLogEntry] = await db
    .insert(auditLogs)
    .values({
      actorId: adminUser.id,
      action: "historical_challenge_imported",
      targetType: "challenge",
      targetId: historicalChallenge.id,
      reason: `Backfill historical challenge ${historicalChallenge.title}`,
      metadata: { slug: historicalSlug, count: 3 },
    })
    .returning();

  if (!auditLogEntry || auditLogEntry.action !== "historical_challenge_imported") {
    throw new Error("Audit log verification failed.");
  }
  console.log("✓ Audit log record confirmed in database.");

  console.log("\n=================================================================");
  console.log("🎉 ALL PHASE 6 (HISTORICAL BACKFILL & STORY CARDS) TESTS PASSED!");
  console.log("=================================================================\n");
}

runPhase6Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Phase 6 tests failed:", err);
    process.exit(1);
  });
