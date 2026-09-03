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
  challengeJuryAwards,
  challengeResults,
  critiqueComments,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { generateMediaDerivatives } from "@/lib/services/mediaValidation";
import { startTiebreakService } from "@/lib/services/votingService";
import { resolveStoragePath, ensureStorageDirectories } from "@/lib/storage";
import sharp from "sharp";
import fs from "fs/promises";
import crypto from "crypto";

async function runPhase9Tests() {
  console.log("\n=================================================================");
  console.log("🧹 STARTING PHASE 9: POST-GATE-H LEGACY CLEANUP & HARDENING SUITE");
  console.log("=================================================================\n");

  await ensureStorageDirectories();
  const suffix = Date.now().toString();

  // Scenario 1: Database Schema Cleanliness (Zero deprecated columns/tables/types)
  console.log("[Scenario 1] Verifying schema cleanliness on active database...");
  const deprecatedCols = await db.execute<{ table_name: string; column_name: string }>(sql`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND (
        (table_name = 'challenges' AND column_name IN ('quorum_requirement', 'allow_revisions'))
        OR (table_name = 'challenge_voting_rounds' AND column_name = 'round_sequence')
        OR (table_name = 'critique_comments' AND column_name = 'critique_aspect')
        OR (table_name = 'challenge_results' AND column_name = 'winner_slot_id')
      );
  `);

  if (deprecatedCols.length > 0) {
    throw new Error(`Scenario 1 Failed: Found deprecated columns: ${JSON.stringify(deprecatedCols)}`);
  }

  const deprecatedTables = await db.execute<{ table_name: string }>(sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name IN ('challenge_winner_slots', 'challenge_jury_slot_assignments', 'challenge_jury_scores');
  `);

  if (deprecatedTables.length > 0) {
    throw new Error(`Scenario 1 Failed: Found deprecated tables: ${JSON.stringify(deprecatedTables)}`);
  }

  const deprecatedEnums = await db.execute<{ typname: string }>(sql`
    SELECT typname FROM pg_type WHERE typname IN ('critique_aspect', 'slot_type');
  `);

  if (deprecatedEnums.length > 0) {
    throw new Error(`Scenario 1 Failed: Found deprecated enums: ${JSON.stringify(deprecatedEnums)}`);
  }

  console.log("✓ Scenario 1 Passed: Database schema is 100% clean with zero deprecated columns, tables, or types.");

  // Scenario 2: Challenge creation and updating without allowRevisions
  console.log("\n[Scenario 2] Verifying challenge lifecycle without allowRevisions...");
  const [adminUser] = await db
    .insert(users)
    .values({ email: `admin_p9_${suffix}@mengart.local`, role: "admin" })
    .returning();

  const [ch] = await db
    .insert(challenges)
    .values({
      title: `Clean Challenge ${suffix}`,
      slug: `clean-challenge-${suffix}`,
      theme: "Clean Architecture",
      description: "Testing challenge lifecycle with pruned schema.",
      promptRules: "Digital medium only.",
      status: "scheduled",
      awardMode: "vote_and_jury",
      starsPerMember: 1,
      createdByUserId: adminUser.id,
    })
    .returning();

  const [updatedCh] = await db
    .update(challenges)
    .set({ title: `Clean Challenge ${suffix} (Updated)`, status: "submission_open" })
    .where(eq(challenges.id, ch.id))
    .returning();

  if (!updatedCh || updatedCh.status !== "submission_open") {
    throw new Error("Scenario 2 Failed: Challenge update failed");
  }
  console.log("✓ Scenario 2 Passed: Challenge created and transitioned cleanly without allowRevisions or quorum.");

  // Scenario 3: Star voting and tiebreak round creation without roundSequence
  console.log("\n[Scenario 3] Verifying voting round & tiebreak creation without roundSequence...");
  const [artistA] = await db.insert(users).values({ email: `artistA_p9_${suffix}@mengart.local`, role: "member" }).returning();
  const [profA] = await db.insert(profiles).values({ userId: artistA.id, displayName: "Artist A", slug: `artist-a-${suffix}` }).returning();
  const [artA] = await db.insert(artworks).values({ userId: artistA.id, title: "Art A", slug: `art-a-${suffix}`, mediaType: "image", publicationStatus: "published" }).returning();
  const [verA] = await db.insert(artworkVersions).values({ artworkId: artA.id, versionNumber: 1, mediaType: "image", masterStorageKey: `mA-${suffix}`, mimeType: "image/png", fileSizeBytes: 100, checksumSha256: `cA-${suffix}`, processingStatus: "ready" }).returning();
  await db.update(artworks).set({ currentVersionId: verA.id }).where(eq(artworks.id, artA.id));
  const [subA] = await db.insert(challengeSubmissions).values({ challengeId: ch.id, userId: artistA.id, profileId: profA.id, artworkId: artA.id, artworkVersionId: verA.id, title: "Art A", submissionStatus: "submitted" }).returning();

  const [artistB] = await db.insert(users).values({ email: `artistB_p9_${suffix}@mengart.local`, role: "member" }).returning();
  const [profB] = await db.insert(profiles).values({ userId: artistB.id, displayName: "Artist B", slug: `artist-b-${suffix}` }).returning();
  const [artB] = await db.insert(artworks).values({ userId: artistB.id, title: "Art B", slug: `art-b-${suffix}`, mediaType: "image", publicationStatus: "published" }).returning();
  const [verB] = await db.insert(artworkVersions).values({ artworkId: artB.id, versionNumber: 1, mediaType: "image", masterStorageKey: `mB-${suffix}`, mimeType: "image/png", fileSizeBytes: 100, checksumSha256: `cB-${suffix}`, processingStatus: "ready" }).returning();
  await db.update(artworks).set({ currentVersionId: verB.id }).where(eq(artworks.id, artB.id));
  const [subB] = await db.insert(challengeSubmissions).values({ challengeId: ch.id, userId: artistB.id, profileId: profB.id, artworkId: artB.id, artworkVersionId: verB.id, title: "Art B", submissionStatus: "submitted" }).returning();

  // Create main round
  const [mainRound] = await db
    .insert(challengeVotingRounds)
    .values({
      challengeId: ch.id,
      roundType: "main",
      status: "closed",
      startsAt: new Date(Date.now() - 7200000),
      deadline: new Date(Date.now() - 3600000),
      starsPerMember: 1,
    })
    .returning();

  await db.insert(challengeVotingRoundCandidates).values([
    { votingRoundId: mainRound.id, submissionId: subA.id },
    { votingRoundId: mainRound.id, submissionId: subB.id },
  ]);

  // Voter votes 1 star for subA and 1 for subB (tied 1-1)
  const [voter1] = await db.insert(users).values({ email: `voter1_p9_${suffix}@mengart.local`, role: "member" }).returning();
  const [voter2] = await db.insert(users).values({ email: `voter2_p9_${suffix}@mengart.local`, role: "member" }).returning();
  const [b1] = await db.insert(challengeBallots).values({ challengeId: ch.id, votingRoundId: mainRound.id, userId: voter1.id, roundType: "main", starsAllocated: 1, isFinalized: true }).returning();
  await db.insert(challengeBallotStars).values({ ballotId: b1.id, submissionId: subA.id, starsCount: 1 });
  const [b2] = await db.insert(challengeBallots).values({ challengeId: ch.id, votingRoundId: mainRound.id, userId: voter2.id, roundType: "main", starsAllocated: 1, isFinalized: true }).returning();
  await db.insert(challengeBallotStars).values({ ballotId: b2.id, submissionId: subB.id, starsCount: 1 });

  // Update challenge status to tie_pending
  await db.update(challenges).set({ status: "tie_pending" }).where(eq(challenges.id, ch.id));

  // Trigger startTiebreakService
  const tiebreakRes = await startTiebreakService(
    db,
    { userId: adminUser.id, role: "admin" },
    { challengeId: ch.id, deadline: new Date(Date.now() + 86400000) }
  );

  if (!tiebreakRes || !tiebreakRes.votingRoundId) {
    throw new Error("Scenario 3 Failed: startTiebreakService failed");
  }

  const [tbRound] = await db
    .select()
    .from(challengeVotingRounds)
    .where(eq(challengeVotingRounds.id, tiebreakRes.votingRoundId))
    .limit(1);

  if (!tbRound || tbRound.roundType !== "tiebreak" || tbRound.status !== "open") {
    throw new Error("Scenario 3 Failed: Tiebreak voting round invalid");
  }
  console.log("✓ Scenario 3 Passed: Tiebreak round created and candidate tie handled cleanly without roundSequence.");

  // Scenario 4: Dynamic jury award assignment without challenge_winner_slots
  console.log("\n[Scenario 4] Verifying dynamic jury award assignment without challenge_winner_slots...");
  const [award] = await db
    .insert(challengeJuryAwards)
    .values({
      challengeId: ch.id,
      submissionId: subA.id,
      categoryLabel: "Karya Terfavorit Kurator Atelier",
      recordedByUserId: adminUser.id,
    })
    .returning();

  const [juryResult] = await db
    .insert(challengeResults)
    .values({
      challengeId: ch.id,
      submissionId: subA.id,
      finalRank: null,
      awardType: "jury_award",
      categoryLabel: award.categoryLabel,
      juryAwardId: award.id,
      recordedByUserId: adminUser.id,
      totalCommunityStars: 0,
      isPublished: true,
    })
    .returning();

  if (!juryResult || juryResult.awardType !== "jury_award" || juryResult.categoryLabel !== "Karya Terfavorit Kurator Atelier") {
    throw new Error("Scenario 4 Failed: Dynamic jury award result insertion failed");
  }
  console.log("✓ Scenario 4 Passed: Dynamic jury award assigned and linked to challengeResults without winner slots.");

  // Scenario 5: Unified comment creation without critique_aspect
  console.log("\n[Scenario 5] Verifying unified comments without critique_aspect...");
  const [comment] = await db
    .insert(critiqueComments)
    .values({
      artworkId: artA.id,
      userId: artistB.id,
      profileId: profB.id,
      content: "Eksplorasi palet warna dan komposisinya luar biasa!",
    })
    .returning();

  if (!comment || comment.content !== "Eksplorasi palet warna dan komposisinya luar biasa!") {
    throw new Error("Scenario 5 Failed: Unified comment insert failed");
  }
  console.log("✓ Scenario 5 Passed: Unified comment created and persisted cleanly without critique_aspect.");

  // Scenario 6: Media pipeline execution with canonical generateMediaDerivatives
  console.log("\n[Scenario 6] Verifying media pipeline execution with generateMediaDerivatives...");
  const testBuf = await sharp({
    create: {
      width: 400,
      height: 400,
      channels: 4,
      background: { r: 100, g: 150, b: 200, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  const masterPath = resolveStoragePath("master", `test_p9_master_${suffix}.png`);
  const publicPath = resolveStoragePath("public", `test_p9_public_${suffix}.webp`);
  const thumbPath = resolveStoragePath("public", `test_p9_thumb_${suffix}.webp`);
  const posterTempPath = resolveStoragePath("temp", `test_p9_poster_${suffix}.png`);

  const mediaResult = await generateMediaDerivatives({
    buffer: testBuf,
    mediaType: "image",
    masterPath,
    publicPath,
    thumbPath,
    posterTempPath,
  });

  if (!mediaResult || mediaResult.width !== 400 || mediaResult.height !== 400) {
    throw new Error("Scenario 6 Failed: generateMediaDerivatives transform failed");
  }

  const [masterExists, publicExists, thumbExists] = await Promise.all([
    fs.stat(masterPath).then(() => true).catch(() => false),
    fs.stat(publicPath).then(() => true).catch(() => false),
    fs.stat(thumbPath).then(() => true).catch(() => false),
  ]);

  if (!masterExists || !publicExists || !thumbExists) {
    throw new Error("Scenario 6 Failed: Generated media derivative files missing on disk");
  }

  // Cleanup test files
  await Promise.all([
    fs.unlink(masterPath).catch(() => {}),
    fs.unlink(publicPath).catch(() => {}),
    fs.unlink(thumbPath).catch(() => {}),
  ]);

  console.log("✓ Scenario 6 Passed: Media processing pipeline operates cleanly with generateMediaDerivatives.");

  console.log("\n=================================================================");
  console.log("🎉 ALL 6 PHASE 9 LEGACY CLEANUP SCENARIOS PASSED (100% SUCCESS)!");
  console.log("=================================================================\n");
}

runPhase9Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Phase 9 tests failed:", err);
    process.exit(1);
  });
