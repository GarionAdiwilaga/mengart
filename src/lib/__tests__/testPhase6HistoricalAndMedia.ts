import { db } from "@/db";
import {
  challenges,
  challengeSubmissions,
  challengeResults,
  challengeJuryAwards,
  challengeVotingRounds,
  challengeVotingRoundCandidates,
  portfolioEntries,
  users,
  profiles,
  auditLogs,
  activityLogs,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getChallengeResultsData } from "@/lib/voting";
import { getChallengeBySlug } from "@/lib/challenges";
import { importHistoricalChallengeAction } from "@/app/actions/historicalBackfill";

async function runPhase6Tests() {
  console.log("\n=================================================================");
  console.log("🚀 STARTING PHASE 6: HISTORICAL BACKFILL & MEDIA TEST SUITE");
  console.log("=================================================================\n");

  const uniqueSuffix = Date.now().toString();

  // 1. Setup Test Admin and 4 Artists
  console.log("[Test 1] Setting up Test Admin and Historical Artists...");
  const [adminUser] = await db
    .insert(users)
    .values({
      email: `admin_phase6_${uniqueSuffix}@mengart.local`,
      role: "admin",
      membershipStatus: "active",
    })
    .returning();

  const [artist1] = await db
    .insert(users)
    .values({
      email: `artist1_phase6_${uniqueSuffix}@mengart.local`,
      role: "member",
      membershipStatus: "active",
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
      membershipStatus: "active",
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
      membershipStatus: "active",
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

  const [artist4] = await db
    .insert(users)
    .values({
      email: `artist4_phase6_${uniqueSuffix}@mengart.local`,
      role: "member",
      membershipStatus: "active",
    })
    .returning();
  const [profile4] = await db
    .insert(profiles)
    .values({
      userId: artist4.id,
      displayName: "Lumina Scribe",
      slug: `lumina-artist-${uniqueSuffix}-4`,
    })
    .returning();

  console.log("✓ Admin and 4 Historical Artists initialized.");

  // 2. Scenario A: Execute Production importHistoricalChallengeAction
  console.log("\n[Test 2] Executing importHistoricalChallengeAction (1 Community Winner, 2 Jury Awards, 1 Participant)...");
  const historicalSlug = `grand-cyber-nusantara-${uniqueSuffix}`;
  const challengeTitle = `Grand Cyber Nusantara Invitational ${uniqueSuffix}`;

  const importResult = await importHistoricalChallengeAction(
    {
      title: challengeTitle,
      slug: historicalSlug,
      theme: "Cyberpunk Archipelago",
      description: "Tribute untuk lanskap masa depan nusantara.",
      promptRules: "Desain visual arsitektur dan kultur lokal dengan sentuhan neon.",
      awardMode: "vote_and_jury",
      starsPerMember: 3,
      submissionStartsAt: "2024-10-01T00:00:00Z",
      submissionDeadline: "2024-10-20T23:59:59Z",
      votingStartsAt: "2024-10-21T00:00:00Z",
      votingDeadline: "2024-10-28T23:59:59Z",
      entries: [
        {
          userId: artist1.id,
          artworkTitle: "Batavia 2099: Neon Harbor",
          artworkDescription: "Pelabuhan masa depan Batavia.",
          softwareUsed: "Photoshop, Blender",
          mediaType: "image",
          masterStorageKey: `hist_master_${uniqueSuffix}_1.png`,
          publicStorageKey: `hist_public_${uniqueSuffix}_1.webp`,
          thumbnailStorageKey: `hist_thumb_${uniqueSuffix}_1.webp`,
          finalRank: 1,
          totalCommunityStars: 35,
          winnerSlotType: "community_vote_winner",
          categoryLabel: "Juara 1 Favorit Komunitas",
        },
        {
          userId: artist2.id,
          artworkTitle: "Floating Sky Palace of Majapahit",
          artworkDescription: "Istana megah di atas awan.",
          softwareUsed: "Clip Studio Paint",
          mediaType: "image",
          masterStorageKey: `hist_master_${uniqueSuffix}_2.png`,
          publicStorageKey: `hist_public_${uniqueSuffix}_2.webp`,
          thumbnailStorageKey: `hist_thumb_${uniqueSuffix}_2.webp`,
          finalRank: null,
          totalCommunityStars: 28,
          winnerSlotType: "jury_award",
          categoryLabel: "Penghargaan Khusus Komposisi Visual",
        },
        {
          userId: artist3.id,
          artworkTitle: "Spirits of the Silicon Forest",
          artworkDescription: "Hutan silikon berpenghuni roh digital.",
          softwareUsed: "Procreate",
          mediaType: "image",
          masterStorageKey: `hist_master_${uniqueSuffix}_3.png`,
          publicStorageKey: `hist_public_${uniqueSuffix}_3.webp`,
          thumbnailStorageKey: `hist_thumb_${uniqueSuffix}_3.webp`,
          finalRank: null,
          totalCommunityStars: 12,
          winnerSlotType: "jury_award",
          categoryLabel: "Pilihan Dewan Juri Atelier",
        },
        {
          userId: artist4.id,
          artworkTitle: "Cyber Wayang Chronicle",
          artworkDescription: "Pentas wayang futuristik.",
          softwareUsed: "Blender",
          mediaType: "image",
          masterStorageKey: `hist_master_${uniqueSuffix}_4.png`,
          publicStorageKey: `hist_public_${uniqueSuffix}_4.webp`,
          thumbnailStorageKey: `hist_thumb_${uniqueSuffix}_4.webp`,
          finalRank: null,
          totalCommunityStars: 5,
          winnerSlotType: "none",
        },
      ],
    },
    { id: adminUser.id, role: "admin" }
  );

  if (!importResult.success || !importResult.challengeId) {
    throw new Error("importHistoricalChallengeAction failed to return success.");
  }
  console.log(`✓ Historical Challenge imported: ID=${importResult.challengeId}, Entries=${importResult.entriesImported}`);

  // 3. Verify Challenge Entity, Voting Rounds & Frozen Candidates
  console.log("\n[Test 3] Verifying Challenge, Archived Voting Round & Frozen Candidates...");
  const [createdChallenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, importResult.challengeId));

  if (!createdChallenge || createdChallenge.status !== "finished" || createdChallenge.awardMode !== "vote_and_jury") {
    throw new Error("Challenge entity verification failed.");
  }

  const rounds = await db
    .select()
    .from(challengeVotingRounds)
    .where(eq(challengeVotingRounds.challengeId, createdChallenge.id));

  if (rounds.length !== 1 || rounds[0].roundType !== "main" || rounds[0].status !== "closed") {
    throw new Error(`Expected 1 closed main round, got: ${JSON.stringify(rounds)}`);
  }

  const candidates = await db
    .select()
    .from(challengeVotingRoundCandidates)
    .where(eq(challengeVotingRoundCandidates.votingRoundId, rounds[0].id));

  if (candidates.length !== 4) {
    throw new Error(`Expected 4 frozen candidates in main round, got ${candidates.length}`);
  }
  console.log("✓ Challenge status finished, 1 closed main voting round, and all 4 candidates frozen.");

  // 4. Verify Challenge Results & Jury Awards Invariants
  console.log("\n[Test 4] Verifying Challenge Results, Dynamic Jury Awards & Zero Empty Slots...");
  const results = await db
    .select()
    .from(challengeResults)
    .where(eq(challengeResults.challengeId, createdChallenge.id));

  if (results.length !== 3) {
    throw new Error(`Expected exactly 3 winning result rows (1 community winner, 2 jury awards), got ${results.length}`);
  }

  const communityWinnerRes = results.find((r) => r.awardType === "community_vote_winner");
  if (!communityWinnerRes || communityWinnerRes.finalRank !== 1 || communityWinnerRes.totalCommunityStars !== 35) {
    throw new Error("Community winner result row mismatch.");
  }

  const juryAwards = await db
    .select()
    .from(challengeJuryAwards)
    .where(eq(challengeJuryAwards.challengeId, createdChallenge.id));

  if (juryAwards.length !== 2) {
    throw new Error(`Expected exactly 2 rows in challenge_jury_awards, got ${juryAwards.length}`);
  }

  const juryResultRows = results.filter((r) => r.awardType === "jury_award");
  for (const jr of juryResultRows) {
    if (jr.finalRank !== null) {
      throw new Error(`Jury award must be strictly unranked (finalRank=null), got ${jr.finalRank}`);
    }
    const matchingAward = juryAwards.find((a) => a.id === jr.juryAwardId);
    if (!matchingAward) {
      throw new Error(`Jury award result row ${jr.id} lacks valid FK to challenge_jury_awards`);
    }
  }
  console.log("✓ Single Community Winner (Rank 1), 2 Unranked Dynamic Jury Awards with valid FKs, and 0 participant rows verified.");

  // 5. Verify Portfolio Auto-Promotion
  console.log("\n[Test 5] Verifying Portfolio Auto-Promotion & System Captions...");
  const submissions = await db
    .select()
    .from(challengeSubmissions)
    .where(eq(challengeSubmissions.challengeId, createdChallenge.id));

  for (const sub of submissions) {
    const [pEntry] = await db
      .select()
      .from(portfolioEntries)
      .where(and(eq(portfolioEntries.profileId, sub.profileId), eq(portfolioEntries.artworkId, sub.artworkId)));

    if (!pEntry) {
      throw new Error(`Missing portfolio entry for submission ${sub.id}`);
    }

    if (sub.userId === artist1.id) {
      if (!pEntry.systemCaption?.startsWith("Juara Favorit Komunitas")) {
        throw new Error(`Unexpected caption for community winner: ${pEntry.systemCaption}`);
      }
    } else if (sub.userId === artist2.id) {
      if (!pEntry.systemCaption?.includes("Penghargaan Khusus Komposisi Visual")) {
        throw new Error(`Unexpected caption for jury winner 1: ${pEntry.systemCaption}`);
      }
    } else if (sub.userId === artist3.id) {
      if (!pEntry.systemCaption?.includes("Pilihan Dewan Juri Atelier")) {
        throw new Error(`Unexpected caption for jury winner 2: ${pEntry.systemCaption}`);
      }
    } else if (sub.userId === artist4.id) {
      if (!pEntry.systemCaption?.startsWith("Peserta Challenge")) {
        throw new Error(`Unexpected caption for regular participant: ${pEntry.systemCaption}`);
      }
    }
  }
  console.log("✓ All 4 submissions auto-promoted to artist portfolios with resolved contextual captions.");

  // 6. Verify Hall of Fame Retrieval
  console.log("\n[Test 6] Verifying Hall of Fame and Results Query Data...");
  const resultsPayload = await getChallengeResultsData(createdChallenge.id);
  if (!resultsPayload || resultsPayload.results.length !== 3) {
    throw new Error(`Expected 3 results from getChallengeResultsData, got ${resultsPayload?.results.length}`);
  }

  const champion = resultsPayload.results[0];
  console.log(`✓ Champion: "${champion.title}" (${champion.totalCommunityStars} Stars, Award: ${champion.slotTitle})`);
  if (champion.finalRank !== 1 || champion.totalCommunityStars !== 35) {
    throw new Error("Champion rank or stars mismatch in results calculation.");
  }

  // 7. Verify Audit & Activity Logs
  console.log("\n[Test 7] Verifying Administrative Audit & Activity Logs...");
  const [auditLog] = await db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.targetId, createdChallenge.id), eq(auditLogs.action, "historical_challenge_imported")));

  if (!auditLog) {
    throw new Error("Audit log for historical import not found.");
  }

  const [activityLog] = await db
    .select()
    .from(activityLogs)
    .where(and(eq(activityLogs.targetId, createdChallenge.id), eq(activityLogs.eventType, "challenge_results_published")));

  if (!activityLog) {
    throw new Error("Activity log for historical import not found.");
  }
  console.log("✓ Audit log and activity log successfully recorded.");

  // 8. Scenario B: Defense against multiple Community Winners
  console.log("\n[Test 8] Testing Defense against Multiple Community Winners...");
  let constraintViolationBlocked = false;
  try {
    await importHistoricalChallengeAction(
      {
        title: `Invalid Challenge ${uniqueSuffix}`,
        slug: `invalid-challenge-${uniqueSuffix}`,
        theme: "Test",
        description: "Test",
        promptRules: "Test",
        submissionStartsAt: "2024-10-01T00:00:00Z",
        submissionDeadline: "2024-10-20T23:59:59Z",
        votingStartsAt: "2024-10-21T00:00:00Z",
        votingDeadline: "2024-10-28T23:59:59Z",
        entries: [
          {
            userId: artist1.id,
            artworkTitle: "Entry 1",
            mediaType: "image",
            masterStorageKey: "m1.png",
            publicStorageKey: "p1.webp",
            winnerSlotType: "community_vote_winner",
          },
          {
            userId: artist2.id,
            artworkTitle: "Entry 2",
            mediaType: "image",
            masterStorageKey: "m2.png",
            publicStorageKey: "p2.webp",
            winnerSlotType: "community_vote_winner", // ILLEGAL SECOND COMMUNITY WINNER
          },
        ],
      },
      { id: adminUser.id, role: "admin" }
    );
  } catch (err: any) {
    if (err.message.includes("Hanya boleh ada maksimal satu (1) Juara Favorit Komunitas")) {
      constraintViolationBlocked = true;
    }
  }

  if (!constraintViolationBlocked) {
    throw new Error("Failed to block multiple Community Winners!");
  }
  console.log("✓ Multiple Community Winners correctly blocked with friendly error message.");

  console.log("\n=================================================================");
  console.log("🎉 ALL PHASE 6 (HISTORICAL BACKFILL & MEDIA RECONCILIATION) TESTS PASSED!");
  console.log("=================================================================\n");
  process.exit(0);
}

runPhase6Tests().catch((err) => {
  console.error("\n❌ Phase 6 Test Suite Failed:", err);
  process.exit(1);
});
