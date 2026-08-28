import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const BASE_DB_URL = process.env.DATABASE_URL || "postgres://mengart:mengart_dev_pass@localhost:5432/mengart_db";

// Derive admin connection url to postgres default db for creating/dropping test DBs
const urlObj = new URL(BASE_DB_URL);
const adminDbUrl = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/postgres`;

async function runMigrationVerification() {
  console.log("=================================================================");
  console.log("🛠️ STARTING COMPREHENSIVE PRODUCTION MIGRATION VERIFICATION SUITE");
  console.log("=================================================================\n");

  const adminClient = postgres(adminDbUrl, { max: 1 });

  const freshDbName = `mengart_test_fresh_${Date.now()}`;
  const upgradeDbName = `mengart_test_upgrade_${Date.now()}`;
  const temp0006Dir = path.resolve("./.tmp_drizzle_0006");

  try {
    // --------------------------------------------------------------------------
    // SCENARIO 1: FRESH EMPTY DATABASE -> ALL COMMITTED MIGRATIONS (0000 -> 0007)
    // --------------------------------------------------------------------------
    console.log(`[Scenario 1] Creating fresh empty database: ${freshDbName}...`);
    await adminClient.unsafe(`CREATE DATABASE "${freshDbName}";`);

    const freshDbUrl = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/${freshDbName}`;
    const freshClient = postgres(freshDbUrl, { max: 1 });
    const freshDrizzle = drizzle(freshClient);

    console.log("-> Running all committed migrations (0000 -> 0007) on fresh database via Drizzle migrator...");
    await migrate(freshDrizzle, { migrationsFolder: "./drizzle" });
    console.log("✓ Migration 0000 -> 0007 succeeded on fresh empty database!");

    // Verify critical tables exist in fresh database
    const freshTables = await freshClient`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN (
          'challenges', 
          'challenge_voting_rounds', 
          'challenge_voting_round_candidates', 
          'challenge_jury_slot_assignments', 
          'challenge_ballots', 
          'challenge_results'
        );
    `;

    if (freshTables.length !== 6) {
      throw new Error(`Expected 6 core challenge tables on fresh database, found ${freshTables.length}`);
    }
    console.log(`✓ All ${freshTables.length} core tables verified in fresh database.`);
    await freshClient.end();
    console.log("🎉 SCENARIO 1 (FRESH DATABASE MIGRATION REPRODUCIBILITY) PASSED!\n");

    // --------------------------------------------------------------------------
    // SCENARIO 2: UPGRADE REAL PRE-REMEDIATION DATABASE (0006 -> 0007) WITH DRIZZLE
    // --------------------------------------------------------------------------
    console.log(`[Scenario 2] Creating legacy pre-remediation database: ${upgradeDbName}...`);
    await adminClient.unsafe(`CREATE DATABASE "${upgradeDbName}";`);

    const upgradeDbUrl = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/${upgradeDbName}`;
    const upgradeClient = postgres(upgradeDbUrl, { max: 1 });
    const upgradeDrizzle = drizzle(upgradeClient);

    // Prepare temporary 0006-only migration folder with filtered journal
    await fs.rm(temp0006Dir, { recursive: true, force: true });
    await fs.mkdir(path.join(temp0006Dir, "meta"), { recursive: true });

    // Copy 0000..0006 migrations
    const drizzleFiles = await fs.readdir("./drizzle");
    for (const file of drizzleFiles) {
      if (file.endsWith(".sql") && !file.startsWith("0007_")) {
        await fs.copyFile(path.join("./drizzle", file), path.join(temp0006Dir, file));
      }
    }

    // Filter journal to entries up to index 6
    const journalRaw = await fs.readFile("./drizzle/meta/_journal.json", "utf-8");
    const journal = JSON.parse(journalRaw);
    const filteredJournal = {
      ...journal,
      entries: journal.entries.filter((e: any) => e.idx <= 6),
    };
    await fs.writeFile(
      path.join(temp0006Dir, "meta", "_journal.json"),
      JSON.stringify(filteredJournal, null, 2)
    );

    console.log("-> Applying pre-remediation migrations (0000 -> 0006) via genuine Drizzle migrator...");
    await migrate(upgradeDrizzle, { migrationsFolder: temp0006Dir });
    console.log("✓ Applied 7 pre-remediation migrations through genuine Drizzle migrator.");

    // Populate representative legacy data
    console.log("-> Populating representative legacy data (Finished challenge with main/tiebreak, submission_open challenge, and showcase_only challenge)...");
    const [userA] = await upgradeClient`
      INSERT INTO users (email, role, membership_status)
      VALUES ('legacy_user_a@mengart.local', 'member', 'active')
      RETURNING id;
    `;
    const [userB] = await upgradeClient`
      INSERT INTO users (email, role, membership_status)
      VALUES ('legacy_user_b@mengart.local', 'member', 'active')
      RETURNING id;
    `;
    const [userC] = await upgradeClient`
      INSERT INTO users (email, role, membership_status)
      VALUES ('legacy_user_c@mengart.local', 'member', 'active')
      RETURNING id;
    `;
    const [profA] = await upgradeClient`
      INSERT INTO profiles (user_id, display_name, slug)
      VALUES (${userA.id}, 'Legacy Artist A', 'legacy-artist-a')
      RETURNING id;
    `;
    const [profB] = await upgradeClient`
      INSERT INTO profiles (user_id, display_name, slug)
      VALUES (${userB.id}, 'Legacy Artist B', 'legacy-artist-b')
      RETURNING id;
    `;
    const [profC] = await upgradeClient`
      INSERT INTO profiles (user_id, display_name, slug)
      VALUES (${userC.id}, 'Legacy Artist C', 'legacy-artist-c')
      RETURNING id;
    `;

    // 1. Finished Challenge (has both main and tiebreak ballots)
    const [challenge] = await upgradeClient`
      INSERT INTO challenges (title, slug, theme, description, prompt_rules, status, award_mode, stars_per_member, created_by_user_id)
      VALUES ('Legacy Finished Challenge', 'legacy-finished-2026', 'Heritage', 'Testing upgrade', 'Rules', 'finished', 'vote_and_jury', 3, ${userA.id})
      RETURNING id;
    `;

    const [communitySlot] = await upgradeClient`
      INSERT INTO challenge_winner_slots (challenge_id, slot_type, rank, title, display_order)
      VALUES (${challenge.id}, 'community_vote', 1, 'Juara 1 Komunitas', 1)
      RETURNING id;
    `;
    const [jurySlot] = await upgradeClient`
      INSERT INTO challenge_winner_slots (challenge_id, slot_type, rank, title, display_order)
      VALUES (${challenge.id}, 'jury_award', 1, 'Karya Terbaik Dewan Juri', 2)
      RETURNING id;
    `;

    const [subA] = await upgradeClient`
      INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status)
      VALUES (${challenge.id}, ${userA.id}, ${profA.id}, 'submitted')
      RETURNING id;
    `;
    const [subB] = await upgradeClient`
      INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status)
      VALUES (${challenge.id}, ${userB.id}, ${profB.id}, 'submitted')
      RETURNING id;
    `;
    const [subC] = await upgradeClient`
      INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status)
      VALUES (${challenge.id}, ${userC.id}, ${profC.id}, 'submitted')
      RETURNING id;
    `;

    // Legacy MAIN ballot
    const [legacyMainBallot] = await upgradeClient`
      INSERT INTO challenge_ballots (challenge_id, user_id, round_type, stars_allocated, is_finalized)
      VALUES (${challenge.id}, ${userA.id}, 'main', 2, true)
      RETURNING id;
    `;
    await upgradeClient`
      INSERT INTO challenge_ballot_stars (ballot_id, submission_id, stars_count)
      VALUES (${legacyMainBallot.id}, ${subB.id}, 2);
    `;

    // Legacy TIEBREAK ballot
    const [legacyTiebreakBallot] = await upgradeClient`
      INSERT INTO challenge_ballots (challenge_id, user_id, round_type, stars_allocated, is_finalized)
      VALUES (${challenge.id}, ${userB.id}, 'tiebreak', 1, true)
      RETURNING id;
    `;
    await upgradeClient`
      INSERT INTO challenge_ballot_stars (ballot_id, submission_id, stars_count)
      VALUES (${legacyTiebreakBallot.id}, ${subA.id}, 1);
    `;

    // Legacy Results: 1 Community Result, 1 Jury Result, and 1 Unassigned Rank Result
    await upgradeClient`
      INSERT INTO challenge_results (challenge_id, submission_id, winner_slot_id, final_rank, total_community_stars, is_published)
      VALUES (${challenge.id}, ${subA.id}, ${communitySlot.id}, 1, 3, true);
    `;
    await upgradeClient`
      INSERT INTO challenge_results (challenge_id, submission_id, winner_slot_id, final_rank, total_community_stars, is_published)
      VALUES (${challenge.id}, ${subB.id}, ${jurySlot.id}, 2, 2, true);
    `;
    await upgradeClient`
      INSERT INTO challenge_results (challenge_id, submission_id, winner_slot_id, final_rank, total_community_stars, is_published)
      VALUES (${challenge.id}, ${subC.id}, null, 3, 0, false);
    `;

    // 2. Legacy Submission-Open Challenge (No ballots yet, 1 submission)
    const [openChallenge] = await upgradeClient`
      INSERT INTO challenges (title, slug, theme, description, prompt_rules, status, award_mode, stars_per_member, created_by_user_id)
      VALUES ('Legacy Open Challenge', 'legacy-open-2026', 'Future', 'Testing open state', 'Rules', 'submission_open', 'vote_and_jury', 3, ${userA.id})
      RETURNING id;
    `;
    const [openSub1] = await upgradeClient`
      INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status)
      VALUES (${openChallenge.id}, ${userA.id}, ${profA.id}, 'submitted')
      RETURNING id;
    `;

    // 3. Legacy Showcase-Only Challenge (Draft, no ballots)
    const [showcaseChallenge] = await upgradeClient`
      INSERT INTO challenges (title, slug, theme, description, prompt_rules, status, award_mode, stars_per_member, created_by_user_id)
      VALUES ('Legacy Showcase Challenge', 'legacy-showcase-2026', 'Art Only', 'Testing showcase', 'Rules', 'draft', 'showcase_only', 0, ${userA.id})
      RETURNING id;
    `;

    console.log("✓ Pre-remediation data populated cleanly.");

    // Now execute real Drizzle migration 0006 -> 0007 upgrade!
    console.log("-> Applying real Drizzle upgrade migration (0006 -> 0007) with automatic SQL backfill...");
    await migrate(upgradeDrizzle, { migrationsFolder: "./drizzle" });
    console.log("✓ Production Drizzle migrator successfully applied migration 0007!");

    // --------------------------------------------------------------------------
    // STRENGTHENED MIGRATION INVARIANT ASSERTIONS (QA Acceptance Gate)
    // --------------------------------------------------------------------------
    console.log("-> Verifying strengthened migration invariants on upgraded database...");

    // Invariant 1: challenge_results.award_type deterministic backfill
    const resultsRows = await upgradeClient`
      SELECT cr.id, cr.submission_id, cr.winner_slot_id, cr.final_rank, cr.award_type, ws.slot_type
      FROM challenge_results cr
      LEFT JOIN challenge_winner_slots ws ON ws.id = cr.winner_slot_id
      WHERE cr.challenge_id = ${challenge.id};
    `;

    if (resultsRows.length !== 3) {
      throw new Error(`Expected exactly 3 results, found ${resultsRows.length}`);
    }

    const commRes = resultsRows.find((r: any) => r.submission_id === subA.id && r.winner_slot_id === communitySlot.id);
    const juryRes = resultsRows.find((r: any) => r.submission_id === subB.id && r.winner_slot_id === jurySlot.id);
    const unassignedRes = resultsRows.find((r: any) => r.winner_slot_id === null && r.final_rank === 3);

    if (!commRes || commRes.award_type !== "community_rank") {
      throw new Error(`Expected subA award_type = 'community_rank', got '${commRes?.award_type}'`);
    }
    if (!juryRes || juryRes.award_type !== "jury_award") {
      throw new Error(`Expected subB award_type = 'jury_award', got '${juryRes?.award_type}'`);
    }
    if (!unassignedRes || unassignedRes.award_type !== "community_rank") {
      throw new Error(`Expected unassigned result award_type = 'community_rank', got '${unassignedRes?.award_type}'`);
    }
    console.log("✓ Invariant 1 Passed: challenge_results.award_type deterministically backfilled from slot_type & final_rank.");

    // Invariant 2: Preserved Main & Tiebreak Rounds for Finished Challenge
    const finishedRounds = await upgradeClient`
      SELECT * FROM challenge_voting_rounds 
      WHERE challenge_id = ${challenge.id}
      ORDER BY round_sequence ASC;
    `;
    if (finishedRounds.length !== 2) {
      throw new Error(`Expected 2 voting rounds (main & tiebreak) for finished challenge, found ${finishedRounds.length}`);
    }
    const [mainRound, tiebreakRound] = finishedRounds;
    if (mainRound.round_type !== "main" || mainRound.round_sequence !== 1) {
      throw new Error(`Expected Round 1 to be 'main', got '${mainRound.round_type}' seq ${mainRound.round_sequence}`);
    }
    if (tiebreakRound.round_type !== "tiebreak" || tiebreakRound.round_sequence !== 2) {
      throw new Error(`Expected Round 2 to be 'tiebreak', got '${tiebreakRound.round_type}' seq ${tiebreakRound.round_sequence}`);
    }
    console.log("✓ Invariant 2 Passed: Main and tiebreak rounds preserved with distinct sequences (seq 1: main, seq 2: tiebreak).");

    // Invariant 3: Main and Tiebreak ballots linked to their respective rounds
    const [migratedMainBallot] = await upgradeClient`
      SELECT id, challenge_id, voting_round_id, round_type 
      FROM challenge_ballots 
      WHERE id = ${legacyMainBallot.id};
    `;
    const [migratedTiebreakBallot] = await upgradeClient`
      SELECT id, challenge_id, voting_round_id, round_type 
      FROM challenge_ballots 
      WHERE id = ${legacyTiebreakBallot.id};
    `;

    if (migratedMainBallot.voting_round_id !== mainRound.id) {
      throw new Error(`Main ballot linked to ${migratedMainBallot.voting_round_id}, expected ${mainRound.id}`);
    }
    if (migratedTiebreakBallot.voting_round_id !== tiebreakRound.id) {
      throw new Error(`Tiebreak ballot linked to ${migratedTiebreakBallot.voting_round_id}, expected ${tiebreakRound.id}`);
    }
    console.log("✓ Invariant 3 Passed: Main ballots link to main round, tiebreak ballots link to tiebreak round.");

    // Invariant 4: No Premature Round Creation for submission_open or draft showcase challenges
    const openChallengeRounds = await upgradeClient`
      SELECT * FROM challenge_voting_rounds WHERE challenge_id = ${openChallenge.id};
    `;
    if (openChallengeRounds.length !== 0) {
      throw new Error(`Premature voting round created for submission_open challenge! Found ${openChallengeRounds.length}`);
    }

    const showcaseRounds = await upgradeClient`
      SELECT * FROM challenge_voting_rounds WHERE challenge_id = ${showcaseChallenge.id};
    `;
    if (showcaseRounds.length !== 0) {
      throw new Error(`Premature voting round created for draft showcase challenge! Found ${showcaseRounds.length}`);
    }
    console.log("✓ Invariant 4 Passed: No premature voting rounds created for 'submission_open' or 'showcase_only' draft challenges.");

    // Invariant 5: Regression fixture for post-migration submission and normal future voting round creation
    console.log("-> Testing post-migration submission & normal round candidate freezing on legacy open challenge...");
    
    // Add post-migration submission
    const [openSub2] = await upgradeClient`
      INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status)
      VALUES (${openChallenge.id}, ${userB.id}, ${profB.id}, 'submitted')
      RETURNING id;
    `;

    // Now transition openChallenge: submission_open -> submission_locked -> voting_open
    await upgradeClient`
      UPDATE challenges SET status = 'submission_locked', updated_at = now() WHERE id = ${openChallenge.id};
    `;

    // Transition to voting_open: simulate domain service round creation
    const newMainRoundId = "00000000-0000-0000-0000-000000000001";
    await upgradeClient`
      INSERT INTO challenge_voting_rounds (
        id, challenge_id, round_type, round_sequence, status, starts_at, stars_per_member, created_at, updated_at
      ) VALUES (
        ${newMainRoundId}, ${openChallenge.id}, 'main', 1, 'open', now(), 3, now(), now()
      );
    `;

    // Freeze all active candidates at voting_open time
    await upgradeClient`
      INSERT INTO challenge_voting_round_candidates (voting_round_id, submission_id, created_at)
      SELECT ${newMainRoundId}, id, now()
      FROM challenge_submissions
      WHERE challenge_id = ${openChallenge.id} AND submission_status = 'submitted';
    `;

    await upgradeClient`
      UPDATE challenges SET status = 'voting_open', updated_at = now() WHERE id = ${openChallenge.id};
    `;

    const openCandidates = await upgradeClient`
      SELECT submission_id FROM challenge_voting_round_candidates WHERE voting_round_id = ${newMainRoundId};
    `;
    const openCandIds = openCandidates.map((c: any) => c.submission_id);

    if (!openCandIds.includes(openSub1.id) || !openCandIds.includes(openSub2.id)) {
      throw new Error(`Future voting round failed to freeze complete candidate set! Expected both [${openSub1.id}, ${openSub2.id}], got ${JSON.stringify(openCandIds)}`);
    }
    console.log(`✓ Invariant 5 Passed: Post-migration submission (${openSub2.id}) successfully included in future round candidate freeze (${openCandIds.length} candidates).`);

    await upgradeClient.end();
    console.log("🎉 SCENARIO 2 (UPGRADE, REAL DRIZZLE MIGRATOR & INVARIANT INTEGRITY) PASSED!\n");

    console.log("=================================================================");
    console.log("✅ ALL MIGRATION AND SCHEMA REPRODUCIBILITY TESTS PASSED (GATE A)");
    console.log("=================================================================\n");
    process.exit(0);
  } finally {
    // Clean up temporary files and databases
    try {
      await fs.rm(temp0006Dir, { recursive: true, force: true });
    } catch (_e) {
      // Ignored cleanup error
    }

    try {
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${freshDbName}";`);
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${upgradeDbName}";`);
    } catch (_e) {
      // Ignored cleanup error
    }

    await adminClient.end();
  }
}

runMigrationVerification().catch((err) => {
  console.error("❌ Migration verification failed:", err);
  process.exit(1);
});
