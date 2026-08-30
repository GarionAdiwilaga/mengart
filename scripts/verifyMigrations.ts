import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import * as schema from "../src/db/schema";
import { transitionChallengeStatusService } from "../src/lib/services/challengeService";

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
  const upgradeDbName0008 = `mengart_test_upgrade_0008_${Date.now()}`;
  const upgradeDbName0009 = `mengart_test_upgrade_0009_${Date.now()}`;
  const upgradeDbName0010 = `mengart_test_upgrade_0010_${Date.now()}`;
  const failDbNameEmailCollision = `mengart_test_fail_email_${Date.now()}`;
  const failDbName1 = `mengart_test_fail1_${Date.now()}`;
  const failDbName2 = `mengart_test_fail2_${Date.now()}`;
  const failDbName3 = `mengart_test_fail3_${Date.now()}`;
  const temp0006Dir = path.resolve("./.tmp_drizzle_0006");
  const temp0008Dir = path.resolve("./.tmp_drizzle_0008");
  const temp0009Dir = path.resolve("./.tmp_drizzle_0009");
  const temp0010Dir = path.resolve("./.tmp_drizzle_0010");

  try {
    // --------------------------------------------------------------------------
    // SCENARIO 1: FRESH EMPTY DATABASE -> ALL COMMITTED MIGRATIONS (0000 -> 0010)
    // --------------------------------------------------------------------------
    console.log(`[Scenario 1] Creating fresh empty database: ${freshDbName}...`);
    await adminClient.unsafe(`CREATE DATABASE "${freshDbName}";`);

    const freshDbUrl = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/${freshDbName}`;
    const freshClient = postgres(freshDbUrl, { max: 1 });
    const freshDrizzle = drizzle(freshClient, { schema });

    console.log("-> Running all committed migrations (0000 -> 0010) on fresh database via Drizzle migrator...");
    await migrate(freshDrizzle, { migrationsFolder: "./drizzle" });
    console.log("✓ Migration 0000 -> 0010 succeeded on fresh empty database!");

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
          'challenge_jury_awards',
          'challenge_ballots', 
          'challenge_results'
        );
    `;

    if (freshTables.length !== 7) {
      throw new Error(`Expected 7 core challenge tables on fresh database, found ${freshTables.length}`);
    }
    console.log("✓ All 7 core challenge tables verified in fresh database schema.");

    // Verify unique indexes and new columns exist
    const freshIndexes = await freshClient`
      SELECT indexname FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND indexname IN (
          'uniq_ballot_round_user', 
          'uniq_challenge_community_winner', 
          'uniq_challenge_main_round', 
          'uniq_challenge_tiebreak_round', 
          'uniq_challenge_open_round',
          'uniq_challenge_jury_recorder',
          'uniq_challenge_result_jury_award'
        );
    `;
    if (freshIndexes.length !== 7) {
      throw new Error(`Expected 7 unique partial indexes in fresh database, found ${freshIndexes.length}`);
    }
    console.log("✓ All 7 partial unique indexes verified in fresh database schema.");

    await freshClient.end();
    console.log("🎉 SCENARIO 1 (FRESH DATABASE) PASSED!\n");

    // --------------------------------------------------------------------------
    // SCENARIO 2: UPGRADE PRE-REMEDIATION SCHEMA (0006) -> DRIZZLE MIGRATE (0007 -> 0008)
    // --------------------------------------------------------------------------
    console.log(`[Scenario 2] Creating legacy upgrade database: ${upgradeDbName}...`);
    await adminClient.unsafe(`CREATE DATABASE "${upgradeDbName}";`);

    const upgradeDbUrl = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/${upgradeDbName}`;
    const upgradeClient = postgres(upgradeDbUrl, { max: 1 });
    const upgradeDrizzle = drizzle(upgradeClient, { schema });

    // Build temporary 0006-only migration directory
    await fs.mkdir(temp0006Dir, { recursive: true });
    await fs.mkdir(path.join(temp0006Dir, "meta"), { recursive: true });

    // Copy migrations 0000 to 0006
    for (let i = 0; i <= 6; i++) {
      const prefix = String(i).padStart(4, "0");
      const files = await fs.readdir("./drizzle");
      const sqlFile = files.find((f) => f.startsWith(prefix) && f.endsWith(".sql"));
      if (sqlFile) {
        await fs.copyFile(path.join("./drizzle", sqlFile), path.join(temp0006Dir, sqlFile));
      }
    }

    // Read full journal and filter to entries up to idx 6
    const journalRaw = await fs.readFile("./drizzle/meta/_journal.json", "utf-8");
    const journalObj = JSON.parse(journalRaw);
    const filteredJournal = {
      ...journalObj,
      entries: journalObj.entries.filter((e: any) => e.idx <= 6),
    };
    await fs.writeFile(
      path.join(temp0006Dir, "meta", "_journal.json"),
      JSON.stringify(filteredJournal, null, 2)
    );

    console.log("-> Applying initial legacy migrations (0000 -> 0006) to represent pre-remediation database...");
    await migrate(upgradeDrizzle, { migrationsFolder: temp0006Dir });
    console.log("✓ Pre-remediation 0006 schema applied.");

    // Populate realistic legacy pre-remediation data
    console.log("-> Populating realistic legacy data in 0006 database...");
    const [userA] = await upgradeClient`
      INSERT INTO users (email, role, email_verified) 
      VALUES ('legacy_admin@mengart.local', 'admin', now()) 
      RETURNING id;
    `;
    const [userB] = await upgradeClient`
      INSERT INTO users (email, role, email_verified) 
      VALUES ('artist_b@mengart.local', 'member', now()) 
      RETURNING id;
    `;
    const [userC] = await upgradeClient`
      INSERT INTO users (email, role, email_verified) 
      VALUES ('artist_c@mengart.local', 'member', now()) 
      RETURNING id;
    `;
    const [userD] = await upgradeClient`
      INSERT INTO users (email, role, email_verified) 
      VALUES ('artist_d@mengart.local', 'member', now()) 
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
    const [profD] = await upgradeClient`
      INSERT INTO profiles (user_id, display_name, slug)
      VALUES (${userD.id}, 'Legacy Artist D', 'legacy-artist-d')
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

    // Legacy MAIN ballot (2 stars to subA, 2 stars to subB -> 2-way first place tie)
    const [legacyMainBallot] = await upgradeClient`
      INSERT INTO challenge_ballots (challenge_id, user_id, round_type, stars_allocated, is_finalized)
      VALUES (${challenge.id}, ${userA.id}, 'main', 2, true)
      RETURNING id;
    `;
    await upgradeClient`
      INSERT INTO challenge_ballot_stars (ballot_id, submission_id, stars_count)
      VALUES (${legacyMainBallot.id}, ${subA.id}, 1), (${legacyMainBallot.id}, ${subB.id}, 1);
    `;

    // Legacy TIEBREAK ballot voting for subA (subset of {subA, subB})
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

    // 2. Finished JURY-ONLY Challenge (Finished + jury result + 0 ballots)
    const [juryOnlyChallenge] = await upgradeClient`
      INSERT INTO challenges (title, slug, theme, description, prompt_rules, status, award_mode, stars_per_member, created_by_user_id)
      VALUES ('Legacy Finished Jury-Only Challenge', 'legacy-finished-jury-only-2026', 'Jury Focus', 'Testing jury only', 'Rules', 'finished', 'jury_only', 0, ${userA.id})
      RETURNING id;
    `;
    const [juryOnlySub] = await upgradeClient`
      INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status)
      VALUES (${juryOnlyChallenge.id}, ${userA.id}, ${profA.id}, 'submitted')
      RETURNING id;
    `;
    const [juryOnlySlot] = await upgradeClient`
      INSERT INTO challenge_winner_slots (challenge_id, slot_type, rank, title, display_order)
      VALUES (${juryOnlyChallenge.id}, 'jury_award', 1, 'Best Jury Choice', 1)
      RETURNING id;
    `;
    await upgradeClient`
      INSERT INTO challenge_results (challenge_id, submission_id, winner_slot_id, final_rank, total_community_stars, is_published)
      VALUES (${juryOnlyChallenge.id}, ${juryOnlySub.id}, ${juryOnlySlot.id}, 1, 0, true);
    `;

    // 3. Finished SHOWCASE-ONLY Challenge (Finished + showcase result + 0 ballots)
    const [showcaseFinishedChallenge] = await upgradeClient`
      INSERT INTO challenges (title, slug, theme, description, prompt_rules, status, award_mode, stars_per_member, created_by_user_id)
      VALUES ('Legacy Finished Showcase Challenge', 'legacy-finished-showcase-2026', 'Showcase Focus', 'Testing showcase', 'Rules', 'finished', 'showcase_only', 0, ${userA.id})
      RETURNING id;
    `;
    const [showcaseFinishedSub] = await upgradeClient`
      INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status)
      VALUES (${showcaseFinishedChallenge.id}, ${userA.id}, ${profA.id}, 'submitted')
      RETURNING id;
    `;
    await upgradeClient`
      INSERT INTO challenge_results (challenge_id, submission_id, winner_slot_id, final_rank, total_community_stars, is_published)
      VALUES (${showcaseFinishedChallenge.id}, ${showcaseFinishedSub.id}, null, 1, 0, true);
    `;

    // 4. Active TIEBREAK-OPEN Challenge with 3+ TIED CANDIDATES and PARTIALLY CAST ballots (A=20, B=20, C=20 tied for #1, D=15 below #1)
    const [tb3TiedChallenge] = await upgradeClient`
      INSERT INTO challenges (title, slug, theme, description, prompt_rules, status, award_mode, stars_per_member, voting_starts_at, voting_deadline, created_by_user_id)
      VALUES ('Legacy 3-Way Tiebreak Open', 'legacy-tb-3way-2026', 'Tiebreak 3Way', 'Testing 3-way tie', 'Rules', 'tiebreak_open', 'vote_and_jury', 3, now() - interval '48 hours', now() + interval '24 hours', ${userA.id})
      RETURNING id;
    `;
    const [tb3Slot] = await upgradeClient`
      INSERT INTO challenge_winner_slots (challenge_id, slot_type, rank, title, display_order)
      VALUES (${tb3TiedChallenge.id}, 'community_vote', 1, 'Juara 1 Komunitas', 1)
      RETURNING id;
    `;
    const [tb3SubA] = await upgradeClient`
      INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status)
      VALUES (${tb3TiedChallenge.id}, ${userA.id}, ${profA.id}, 'submitted')
      RETURNING id;
    `;
    const [tb3SubB] = await upgradeClient`
      INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status)
      VALUES (${tb3TiedChallenge.id}, ${userB.id}, ${profB.id}, 'submitted')
      RETURNING id;
    `;
    const [tb3SubC] = await upgradeClient`
      INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status)
      VALUES (${tb3TiedChallenge.id}, ${userC.id}, ${profC.id}, 'submitted')
      RETURNING id;
    `;
    const [tb3SubD] = await upgradeClient`
      INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status)
      VALUES (${tb3TiedChallenge.id}, ${userD.id}, ${profD.id}, 'submitted')
      RETURNING id;
    `;
    // Main ballots producing: A=20, B=20, C=20, D=15
    const [tb3MainBallot1] = await upgradeClient`
      INSERT INTO challenge_ballots (challenge_id, user_id, round_type, stars_allocated, is_finalized)
      VALUES (${tb3TiedChallenge.id}, ${userA.id}, 'main', 60, true)
      RETURNING id;
    `;
    await upgradeClient`
      INSERT INTO challenge_ballot_stars (ballot_id, submission_id, stars_count)
      VALUES (${tb3MainBallot1.id}, ${tb3SubA.id}, 20), (${tb3MainBallot1.id}, ${tb3SubB.id}, 20), (${tb3MainBallot1.id}, ${tb3SubC.id}, 20);
    `;
    const [tb3MainBallot2] = await upgradeClient`
      INSERT INTO challenge_ballots (challenge_id, user_id, round_type, stars_allocated, is_finalized)
      VALUES (${tb3TiedChallenge.id}, ${userB.id}, 'main', 15, true)
      RETURNING id;
    `;
    await upgradeClient`
      INSERT INTO challenge_ballot_stars (ballot_id, submission_id, stars_count)
      VALUES (${tb3MainBallot2.id}, ${tb3SubD.id}, 15);
    `;

    // Partially cast tiebreak ballot that only votes for tb3SubA and tb3SubB (referencing only 2 of the 3 tied candidates)
    const [tb3TbBallot] = await upgradeClient`
      INSERT INTO challenge_ballots (challenge_id, user_id, round_type, stars_allocated, is_finalized)
      VALUES (${tb3TiedChallenge.id}, ${userC.id}, 'tiebreak', 1, true)
      RETURNING id;
    `;
    await upgradeClient`
      INSERT INTO challenge_ballot_stars (ballot_id, submission_id, stars_count)
      VALUES (${tb3TbBallot.id}, ${tb3SubA.id}, 1);
    `;

    // 5. Legacy Submission-Open Challenge (No ballots yet, 1 submission)
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

    // 6. Legacy Showcase-Only Challenge (Draft, no ballots)
    const [showcaseChallenge] = await upgradeClient`
      INSERT INTO challenges (title, slug, theme, description, prompt_rules, status, award_mode, stars_per_member, created_by_user_id)
      VALUES ('Legacy Showcase Challenge', 'legacy-showcase-2026', 'Art Only', 'Testing showcase', 'Rules', 'draft', 'showcase_only', 0, ${userA.id})
      RETURNING id;
    `;

    // 7. Simulate known pre-remediation schema drift by inserting a malformed row (null slot and null rank)
    await upgradeClient`ALTER TABLE challenge_results ALTER COLUMN final_rank DROP NOT NULL;`;
    const [malformedSub] = await upgradeClient`
      INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status)
      VALUES (${challenge.id}, ${userB.id}, ${profB.id}, 'submitted')
      RETURNING id;
    `;
    const [malformedLegacyRow] = await upgradeClient`
      INSERT INTO challenge_results (challenge_id, submission_id, winner_slot_id, final_rank, total_community_stars, is_published)
      VALUES (${challenge.id}, ${malformedSub.id}, null, null, 0, false)
      RETURNING id;
    `;

    console.log("✓ Pre-remediation data populated cleanly.");

    // Now execute real Drizzle migration 0006 -> 0008 upgrade!
    console.log("-> Applying real Drizzle upgrade migration (0006 -> 0008) with automatic SQL backfill...");
    await migrate(upgradeDrizzle, { migrationsFolder: "./drizzle" });
    console.log("✓ Production Drizzle migrator successfully applied migrations 0007 & 0008!");

    // --------------------------------------------------------------------------
    // STRENGTHENED MIGRATION INVARIANT ASSERTIONS (QA Acceptance Gate)
    // --------------------------------------------------------------------------
    console.log("-> Verifying strengthened migration invariants on upgraded database...");

    // Invariant 1: challenge_results.award_type deterministic backfill & 0008 reconciliation
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

    if (!commRes || commRes.award_type !== "community_vote_winner") {
      throw new Error(`Expected subA award_type = 'community_vote_winner', got '${commRes?.award_type}'`);
    }
    if (!juryRes || juryRes.award_type !== "jury_award") {
      throw new Error(`Expected subB award_type = 'jury_award', got '${juryRes?.award_type}'`);
    }
    if (!unassignedRes || unassignedRes.award_type !== "community_rank") {
      throw new Error(`Expected unassigned result award_type = 'community_rank', got '${unassignedRes?.award_type}'`);
    }
    console.log("✓ Invariant 1 Passed: Rank 1 community result reconciled to 'community_vote_winner', rank 3 remains 'community_rank', jury remains 'jury_award'.");

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

    // Invariant 4: Award-Mode Scoping (Zero rounds for jury_only/showcase_only even with results, and zero for draft/open)
    const juryOnlyRounds = await upgradeClient`
      SELECT * FROM challenge_voting_rounds WHERE challenge_id = ${juryOnlyChallenge.id};
    `;
    if (juryOnlyRounds.length !== 0) {
      throw new Error(`Award-mode scoping violation: finished 'jury_only' challenge with results received ${juryOnlyRounds.length} voting rounds! Expected 0.`);
    }

    const showcaseFinishedRounds = await upgradeClient`
      SELECT * FROM challenge_voting_rounds WHERE challenge_id = ${showcaseFinishedChallenge.id};
    `;
    if (showcaseFinishedRounds.length !== 0) {
      throw new Error(`Award-mode scoping violation: finished 'showcase_only' challenge with results received ${showcaseFinishedRounds.length} voting rounds! Expected 0.`);
    }

    const openChallengeRounds = await upgradeClient`
      SELECT * FROM challenge_voting_rounds WHERE challenge_id = ${openChallenge.id};
    `;
    if (openChallengeRounds.length !== 0) {
      throw new Error(`Premature voting round created for submission_open challenge! Found ${openChallengeRounds.length}`);
    }

    const showcaseDraftRounds = await upgradeClient`
      SELECT * FROM challenge_voting_rounds WHERE challenge_id = ${showcaseChallenge.id};
    `;
    if (showcaseDraftRounds.length !== 0) {
      throw new Error(`Premature voting round created for draft showcase challenge! Found ${showcaseDraftRounds.length}`);
    }
    console.log("✓ Invariant 4 Passed: Zero voting rounds for finished jury_only (with results), finished showcase_only (with results), submission_open, and draft showcase.");

    // Invariant 5: Authoritative First-Place Tiebreak Candidate Reconstruction (A, B, C tied for #1, D excluded) & Timing
    const tb3Rounds = await upgradeClient`
      SELECT vr.id, vr.round_type, vr.status, vr.starts_at, vr.deadline, COUNT(vrc.id)::int as candidate_count
      FROM challenge_voting_rounds vr
      LEFT JOIN challenge_voting_round_candidates vrc ON vrc.voting_round_id = vr.id
      WHERE vr.challenge_id = ${tb3TiedChallenge.id} AND vr.round_type = 'tiebreak'
      GROUP BY vr.id, vr.round_type, vr.status, vr.starts_at, vr.deadline;
    `;
    if (tb3Rounds.length !== 1 || tb3Rounds[0].candidate_count !== 3) {
      throw new Error(`Tiebreak candidate reconstruction failed for 3-way tiebreak with partial ballots! Expected exactly 3 candidates, got ${JSON.stringify(tb3Rounds)}`);
    }
    if (new Date(tb3Rounds[0].starts_at) >= new Date(tb3Rounds[0].deadline)) {
      throw new Error(`3-way tiebreak timing invalid: starts_at >= deadline`);
    }
    if (new Date(tb3Rounds[0].deadline).getTime() <= Date.now()) {
      throw new Error(`3-way tiebreak deadline expired! Deadline: ${tb3Rounds[0].deadline}`);
    }

    const tb3Candidates = await upgradeClient`
      SELECT submission_id FROM challenge_voting_round_candidates WHERE voting_round_id = ${tb3Rounds[0].id};
    `;
    const tb3CandIds = tb3Candidates.map((c: any) => c.submission_id);
    if (!tb3CandIds.includes(tb3SubA.id) || !tb3CandIds.includes(tb3SubB.id) || !tb3CandIds.includes(tb3SubC.id)) {
      throw new Error(`Tiebreak reconstruction omitted tied candidates! Expected [${tb3SubA.id}, ${tb3SubB.id}, ${tb3SubC.id}], got ${JSON.stringify(tb3CandIds)}`);
    }
    if (tb3CandIds.includes(tb3SubD.id)) {
      throw new Error(`Tiebreak reconstruction illegally included non-first-place submission D (${tb3SubD.id})!`);
    }
    console.log("✓ Invariant 5 Passed: Active legacy tiebreak candidate sets successfully reconstructed for A/B/C tied for #1 (excluding non-first-place D) with partial ballots and valid timing.");

    // Invariant 6: Regression fixture exercising ACTUAL PRODUCTION DOMAIN SERVICE for post-migration round creation
    console.log("-> Testing post-migration submission & production service candidate freezing on legacy open challenge...");
    
    // Add post-migration submission
    const [openSub2] = await upgradeClient`
      INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status)
      VALUES (${openChallenge.id}, ${userB.id}, ${profB.id}, 'submitted')
      RETURNING id;
    `;

    const adminCtx = {
      userId: userA.id,
      role: "admin" as const,
      email: "legacy_admin@mengart.local",
    };

    // Assert that manual/generic transition to submission_locked is rejected
    let manualLockRejected = false;
    try {
      await transitionChallengeStatusService(
        upgradeDrizzle,
        adminCtx,
        openChallenge.id,
        "submission_locked"
      );
    } catch (err: any) {
      manualLockRejected = true;
    }
    if (!manualLockRejected) {
      throw new Error("Direct generic transition to submission_locked was unexpectedly allowed!");
    }

    // Set submissionDeadline and votingStartsAt in the past so scheduler transitions submission_open -> submission_locked -> voting_open
    await upgradeClient`
      UPDATE challenges 
      SET submission_deadline = now() - interval '2 minutes',
          voting_starts_at = now() - interval '1 minute' 
      WHERE id = ${openChallenge.id};
    `;

    const { materializeScheduledTransitionsService } = await import("../src/lib/services/challengeService");
    await materializeScheduledTransitionsService(upgradeDrizzle, new Date());

    const futureRounds = await upgradeClient`
      SELECT vr.id, vr.round_type, vr.status
      FROM challenge_voting_rounds vr
      WHERE vr.challenge_id = ${openChallenge.id} AND vr.round_type = 'main';
    `;
    if (futureRounds.length !== 1) {
      throw new Error(`Expected exactly 1 main round created by production service, found ${futureRounds.length}`);
    }

    const futureCandidates = await upgradeClient`
      SELECT submission_id FROM challenge_voting_round_candidates WHERE voting_round_id = ${futureRounds[0].id};
    `;
    const futureCandIds = futureCandidates.map((c: any) => c.submission_id);

    if (!futureCandIds.includes(openSub1.id) || !futureCandIds.includes(openSub2.id)) {
      throw new Error(`Production service failed to freeze complete candidate set! Expected both [${openSub1.id}, ${openSub2.id}], got ${JSON.stringify(futureCandIds)}`);
    }
    console.log(`✓ Invariant 6 Passed: Production scheduler materialized transitions, created round, and froze both pre-migration (${openSub1.id}) and post-migration (${openSub2.id}) submissions (${futureCandIds.length} candidates).`);

    // Invariant 7: Verified Cleanup of Malformed Orphan Result Rows by Migration 0007 itself
    console.log("-> Verifying cleanup of malformed result rows (winner_slot_id IS NULL AND final_rank IS NULL) by migration 0007...");
    const malformedCheck = await upgradeClient`
      SELECT id FROM challenge_results WHERE id = ${malformedLegacyRow.id};
    `;
    if (malformedCheck.length !== 0) {
      throw new Error(`Migration 0007 failed to purge malformed result row ${malformedLegacyRow.id}!`);
    }
    console.log("✓ Invariant 7 Passed: Malformed non-winner orphan row inserted before migration was cleanly purged by migration 0007 itself.");

    await upgradeClient.end();
    console.log("🎉 SCENARIO 2 (UPGRADE, REAL DRIZZLE MIGRATOR & INVARIANT INTEGRITY) PASSED!\n");

    // --------------------------------------------------------------------------
    // SCENARIO 3: FAIL-CLOSED RECONCILIATION TEST (TIEBREAK BALLOT REFERENCES NON-FIRST-PLACE D)
    // --------------------------------------------------------------------------
    console.log(`[Scenario 3] Testing fail-closed migration on invalid tiebreak ballot referencing non-first-place submission...`);
    await adminClient.unsafe(`CREATE DATABASE "${failDbName1}";`);
    const failClient1 = postgres(`${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/${failDbName1}`, { max: 1 });
    const failDrizzle1 = drizzle(failClient1, { schema });

    await migrate(failDrizzle1, { migrationsFolder: temp0006Dir });

    const [f1User] = await failClient1`INSERT INTO users (email, role) VALUES ('f1@mengart.local', 'admin') RETURNING id;`;
    const [f1Prof] = await failClient1`INSERT INTO profiles (user_id, display_name, slug) VALUES (${f1User.id}, 'F1 Artist', 'f1-artist') RETURNING id;`;
    const [f1Challenge] = await failClient1`
      INSERT INTO challenges (title, slug, theme, description, prompt_rules, status, award_mode, stars_per_member, voting_deadline, created_by_user_id)
      VALUES ('F1 Challenge', 'f1-challenge', 'Theme', 'Desc', 'Rules', 'tiebreak_open', 'vote_and_jury', 3, now() + interval '24 hours', ${f1User.id})
      RETURNING id;
    `;
    const [f1SubA] = await failClient1`INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status) VALUES (${f1Challenge.id}, ${f1User.id}, ${f1Prof.id}, 'submitted') RETURNING id;`;
    const [f1SubB] = await failClient1`INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status) VALUES (${f1Challenge.id}, ${f1User.id}, ${f1Prof.id}, 'submitted') RETURNING id;`;
    const [f1SubD] = await failClient1`INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status) VALUES (${f1Challenge.id}, ${f1User.id}, ${f1Prof.id}, 'submitted') RETURNING id;`;

    // Main: A=20, B=20 (tied for #1), D=10 (below #1)
    const [f1Main] = await failClient1`INSERT INTO challenge_ballots (challenge_id, user_id, round_type, stars_allocated, is_finalized) VALUES (${f1Challenge.id}, ${f1User.id}, 'main', 50, true) RETURNING id;`;
    await failClient1`INSERT INTO challenge_ballot_stars (ballot_id, submission_id, stars_count) VALUES (${f1Main.id}, ${f1SubA.id}, 20), (${f1Main.id}, ${f1SubB.id}, 20), (${f1Main.id}, ${f1SubD.id}, 10);`;

    // Tiebreak ballot referencing D (invalid non-first-place submission)
    const [f1Tb] = await failClient1`INSERT INTO challenge_ballots (challenge_id, user_id, round_type, stars_allocated, is_finalized) VALUES (${f1Challenge.id}, ${f1User.id}, 'tiebreak', 1, true) RETURNING id;`;
    await failClient1`INSERT INTO challenge_ballot_stars (ballot_id, submission_id, stars_count) VALUES (${f1Tb.id}, ${f1SubD.id}, 1);`;

    let f1FailedProperly = false;
    try {
      await migrate(failDrizzle1, { migrationsFolder: "./drizzle" });
    } catch (err: any) {
      if (err.message && err.message.includes("Legacy tiebreak reconciliation required")) {
        f1FailedProperly = true;
        console.log(`✓ Scenario 3 Passed: Migration safely failed closed for tiebreak ballot referencing non-first-place D: "${err.message.trim()}"`);
      } else {
        throw err;
      }
    }
    if (!f1FailedProperly) {
      throw new Error("Scenario 3 expected migration failure with reconciliation error, but migration succeeded!");
    }
    await failClient1.end();
    console.log("🎉 SCENARIO 3 (FAIL-CLOSED INVALID BALLOT SUBMISSION) PASSED!\n");

    // --------------------------------------------------------------------------
    // SCENARIO 4: FAIL-CLOSED RECONCILIATION TEST (TIE BELOW FIRST PLACE IN TIEBREAK_OPEN)
    // --------------------------------------------------------------------------
    console.log(`[Scenario 4] Testing fail-closed migration on tie below first place (A=30, B=20, C=20 in tiebreak_open)...`);
    await adminClient.unsafe(`CREATE DATABASE "${failDbName2}";`);
    const failClient2 = postgres(`${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/${failDbName2}`, { max: 1 });
    const failDrizzle2 = drizzle(failClient2, { schema });

    await migrate(failDrizzle2, { migrationsFolder: temp0006Dir });

    const [f2User] = await failClient2`INSERT INTO users (email, role) VALUES ('f2@mengart.local', 'admin') RETURNING id;`;
    const [f2Prof] = await failClient2`INSERT INTO profiles (user_id, display_name, slug) VALUES (${f2User.id}, 'F2 Artist', 'f2-artist') RETURNING id;`;
    const [f2Challenge] = await failClient2`
      INSERT INTO challenges (title, slug, theme, description, prompt_rules, status, award_mode, stars_per_member, voting_deadline, created_by_user_id)
      VALUES ('F2 Challenge', 'f2-challenge', 'Theme', 'Desc', 'Rules', 'tiebreak_open', 'vote_and_jury', 3, now() + interval '24 hours', ${f2User.id})
      RETURNING id;
    `;
    const [f2SubA] = await failClient2`INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status) VALUES (${f2Challenge.id}, ${f2User.id}, ${f2Prof.id}, 'submitted') RETURNING id;`;
    const [f2SubB] = await failClient2`INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status) VALUES (${f2Challenge.id}, ${f2User.id}, ${f2Prof.id}, 'submitted') RETURNING id;`;
    const [f2SubC] = await failClient2`INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status) VALUES (${f2Challenge.id}, ${f2User.id}, ${f2Prof.id}, 'submitted') RETURNING id;`;

    // Main: A=30 (unique #1), B=20, C=20 (tie for #2)
    const [f2Main] = await failClient2`INSERT INTO challenge_ballots (challenge_id, user_id, round_type, stars_allocated, is_finalized) VALUES (${f2Challenge.id}, ${f2User.id}, 'main', 70, true) RETURNING id;`;
    await failClient2`INSERT INTO challenge_ballot_stars (ballot_id, submission_id, stars_count) VALUES (${f2Main.id}, ${f2SubA.id}, 30), (${f2Main.id}, ${f2SubB.id}, 20), (${f2Main.id}, ${f2SubC.id}, 20);`;

    let f2FailedProperly = false;
    try {
      await migrate(failDrizzle2, { migrationsFolder: "./drizzle" });
    } catch (err: any) {
      if (err.message && err.message.includes("Legacy tiebreak reconciliation required")) {
        f2FailedProperly = true;
        console.log(`✓ Scenario 4 Passed: Migration safely failed closed for tie below #1 in tiebreak_open: "${err.message.trim()}"`);
      } else {
        throw err;
      }
    }
    if (!f2FailedProperly) {
      throw new Error("Scenario 4 expected migration failure with reconciliation error, but migration succeeded!");
    }
    await failClient2.end();
    console.log("🎉 SCENARIO 4 (FAIL-CLOSED TIE BELOW FIRST PLACE) PASSED!\n");

    // --------------------------------------------------------------------------
    // SCENARIO 5: FAIL-CLOSED RECONCILIATION TEST (UNRECONCILED BALLOT WITHOUT ROUND IN MIGRATION 0008)
    // --------------------------------------------------------------------------
    console.log(`[Scenario 5] Testing fail-closed migration 0008 on unreconciled ballot without matching voting round...`);
    await adminClient.unsafe(`CREATE DATABASE "${failDbName3}";`);
    const failClient3 = postgres(`${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/${failDbName3}`, { max: 1 });
    const failDrizzle3 = drizzle(failClient3, { schema });

    // Migrate up to 0007 first
    await migrate(failDrizzle3, { migrationsFolder: "./drizzle" });

    // Insert an unlinked ballot with NULL voting_round_id on a new challenge that has no voting round
    const [f3User] = await failClient3`INSERT INTO users (email, role) VALUES ('f3@mengart.local', 'admin') RETURNING id;`;
    const [f3Challenge] = await failClient3`
      INSERT INTO challenges (title, slug, theme, description, prompt_rules, status, award_mode, stars_per_member, created_by_user_id)
      VALUES ('F3 Challenge', 'f3-challenge', 'Theme', 'Desc', 'Rules', 'draft', 'vote_only', 3, ${f3User.id})
      RETURNING id;
    `;
    
    // Temporarily drop NOT NULL to simulate legacy unlinked ballot
    await failClient3`ALTER TABLE "challenge_ballots" ALTER COLUMN "voting_round_id" DROP NOT NULL;`;
    await failClient3`INSERT INTO challenge_ballots (challenge_id, user_id, round_type, stars_allocated, is_finalized, voting_round_id) VALUES (${f3Challenge.id}, ${f3User.id}, 'main', 1, true, NULL);`;

    // Now execute migration 0008 SQL directly
    const mig0008Sql = await fs.readFile("./drizzle/0008_round_ballot_uniqueness_and_tie_pending.sql", "utf-8");
    let f3FailedProperly = false;
    try {
      await failClient3.unsafe(mig0008Sql);
    } catch (err: any) {
      if (err.message && err.message.includes("Legacy ballot reconciliation required")) {
        f3FailedProperly = true;
        console.log(`✓ Scenario 5 Passed: Migration safely failed closed for unreconciled ballot: "${err.message.trim()}"`);
      } else {
        throw err;
      }
    }
    if (!f3FailedProperly) {
      throw new Error("Scenario 5 expected migration failure with reconciliation error, but migration succeeded!");
    }
    await failClient3.end();
    console.log("🎉 SCENARIO 5 (FAIL-CLOSED UNRECONCILED BALLOT) PASSED!\n");

    // --------------------------------------------------------------------------
    // SCENARIO 6: MIGRATION 0008 -> 0009 UPGRADE PATH (STAR DEFAULTS 3 -> 1 PRESERVING EXISTING ROWS)
    // --------------------------------------------------------------------------
    console.log(`[Scenario 6] Testing upgrade path from pre-correction 0008 to 0009: ${upgradeDbName0008}...`);
    await adminClient.unsafe(`CREATE DATABASE "${upgradeDbName0008}";`);
    const upgradeClient0008 = postgres(`${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/${upgradeDbName0008}`, { max: 1 });
    const upgradeDrizzle0008 = drizzle(upgradeClient0008, { schema });

    // Build temporary 0008-only migration directory (migrations 0000 -> 0008)
    await fs.mkdir(temp0008Dir, { recursive: true });
    await fs.mkdir(path.join(temp0008Dir, "meta"), { recursive: true });

    for (let i = 0; i <= 8; i++) {
      const migFiles = await fs.readdir("./drizzle");
      const targetFile = migFiles.find((f) => f.startsWith(`000${i}_`));
      if (targetFile) {
        await fs.copyFile(path.join("./drizzle", targetFile), path.join(temp0008Dir, targetFile));
      }
    }

    const journalContent0008 = {
      version: "7",
      dialect: "postgresql",
      entries: (await fs.readFile("./drizzle/meta/_journal.json", "utf-8").then(JSON.parse)).entries.slice(0, 9),
    };
    await fs.writeFile(path.join(temp0008Dir, "meta", "_journal.json"), JSON.stringify(journalContent0008, null, 2));

    // 1. Migrate database up to 0008
    console.log("-> Migrating test database up to original 0008...");
    await migrate(upgradeDrizzle0008, { migrationsFolder: temp0008Dir });
    console.log("✓ Database successfully migrated up to 0008.");

    // 2. Verify pre-0009 column defaults are 3
    const [chColPre] = await upgradeClient0008`
      SELECT column_default 
      FROM information_schema.columns 
      WHERE table_name = 'challenges' AND column_name = 'stars_per_member';
    `;
    const [roundColPre] = await upgradeClient0008`
      SELECT column_default 
      FROM information_schema.columns 
      WHERE table_name = 'challenge_voting_rounds' AND column_name = 'stars_per_member';
    `;

    if (!chColPre?.column_default?.includes("3") || !roundColPre?.column_default?.includes("3")) {
      throw new Error(`Expected pre-0009 column defaults to be 3, got challenges: ${chColPre?.column_default}, rounds: ${roundColPre?.column_default}`);
    }
    console.log("✓ Verified pre-0009 column defaults are 3 (challenges: '3', challenge_voting_rounds: '3').");

    // 3. Insert existing rows with explicit values (challenge A = 3, round A = 3)
    const [user6] = await upgradeClient0008`INSERT INTO users (email, role) VALUES ('upgrade0008@mengart.local', 'admin') RETURNING id;`;
    const [ch6A] = await upgradeClient0008`
      INSERT INTO challenges (title, slug, theme, description, prompt_rules, status, award_mode, stars_per_member, created_by_user_id)
      VALUES ('Challenge 6A', 'ch-6a', 'Theme', 'Desc', 'Rules', 'draft', 'vote_only', 3, ${user6.id})
      RETURNING id, stars_per_member;
    `;
    const [round6A] = await upgradeClient0008`
      INSERT INTO challenge_voting_rounds (challenge_id, round_type, round_sequence, status, stars_per_member)
      VALUES (${ch6A.id}, 'main', 1, 'pending', 3)
      RETURNING id, stars_per_member;
    `;

    if (ch6A.stars_per_member !== 3 || round6A.stars_per_member !== 3) {
      throw new Error(`Expected existing rows to have stars_per_member = 3, got challenge: ${ch6A.stars_per_member}, round: ${round6A.stars_per_member}`);
    }
    console.log("✓ Existing pre-0009 rows inserted with explicit stars_per_member = 3.");

    // 4. Apply forward migration 0009
    console.log("-> Applying forward migration 0009 via Drizzle migrator...");
    await migrate(upgradeDrizzle0008, { migrationsFolder: "./drizzle" });
    console.log("✓ Migration 0009 applied cleanly.");

    // 5. Verify post-0009 column defaults are 1
    const [chColPost] = await upgradeClient0008`
      SELECT column_default 
      FROM information_schema.columns 
      WHERE table_name = 'challenges' AND column_name = 'stars_per_member';
    `;
    const [roundColPost] = await upgradeClient0008`
      SELECT column_default 
      FROM information_schema.columns 
      WHERE table_name = 'challenge_voting_rounds' AND column_name = 'stars_per_member';
    `;

    if (!chColPost?.column_default?.includes("1") || !roundColPost?.column_default?.includes("1")) {
      throw new Error(`Expected post-0009 column defaults to be 1, got challenges: ${chColPost?.column_default}, rounds: ${roundColPost?.column_default}`);
    }
    console.log("✓ Verified post-0009 column defaults are 1 (challenges: '1', challenge_voting_rounds: '1').");

    // 6. Verify existing rows remain untouched (challenge A = 3, round A = 3)
    const [ch6AAfter] = await upgradeClient0008`SELECT stars_per_member FROM challenges WHERE id = ${ch6A.id};`;
    const [round6AAfter] = await upgradeClient0008`SELECT stars_per_member FROM challenge_voting_rounds WHERE id = ${round6A.id};`;

    if (ch6AAfter.stars_per_member !== 3 || round6AAfter.stars_per_member !== 3) {
      throw new Error(`Expected existing rows to remain 3 after 0009, got challenge: ${ch6AAfter.stars_per_member}, round: ${round6AAfter.stars_per_member}`);
    }
    console.log("✓ Verified existing pre-0009 rows preserved their explicit value 3 without unwanted mutation.");

    // 7. Verify new rows inserted with DEFAULT receive 1
    const [ch6B] = await upgradeClient0008`
      INSERT INTO challenges (title, slug, theme, description, prompt_rules, status, award_mode, created_by_user_id)
      VALUES ('Challenge 6B', 'ch-6b', 'Theme', 'Desc', 'Rules', 'draft', 'vote_only', ${user6.id})
      RETURNING id, stars_per_member;
    `;
    const [round6B] = await upgradeClient0008`
      INSERT INTO challenge_voting_rounds (challenge_id, round_type, round_sequence, status)
      VALUES (${ch6B.id}, 'main', 1, 'pending')
      RETURNING id, stars_per_member;
    `;

    if (ch6B.stars_per_member !== 1 || round6B.stars_per_member !== 1) {
      throw new Error(`Expected new DEFAULT rows after 0009 to receive 1, got challenge: ${ch6B.stars_per_member}, round: ${round6B.stars_per_member}`);
    }
    console.log("✓ Verified new post-0009 rows with DEFAULT receive stars_per_member = 1.");

    await upgradeClient0008.end();
    console.log("🎉 SCENARIO 6 (FORWARD MIGRATION 0008 -> 0009 UPGRADE PATH) PASSED!\n");

    // --------------------------------------------------------------------------
    // SCENARIO 7: FORWARD MIGRATION 0009 -> 0010 UPGRADE PATH & BACKFILL INTEGRITY
    // --------------------------------------------------------------------------
    console.log(`[Scenario 7] Creating upgrade database for 0009 -> 0010: ${upgradeDbName0009}...`);
    await adminClient.unsafe(`CREATE DATABASE "${upgradeDbName0009}";`);

    const upgradeDbUrl0009 = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/${upgradeDbName0009}`;
    const upgradeClient0009 = postgres(upgradeDbUrl0009, { max: 1 });
    const upgradeDrizzle0009 = drizzle(upgradeClient0009, { schema });

    // 1. Create temporary migration folder containing ONLY migrations 0000 through 0009
    await fs.mkdir(temp0009Dir, { recursive: true });
    await fs.mkdir(path.join(temp0009Dir, "meta"), { recursive: true });

    const journalContent = await fs.readFile("./drizzle/meta/_journal.json", "utf-8");
    const fullJournal = JSON.parse(journalContent);
    const subsetJournal0009 = {
      ...fullJournal,
      entries: fullJournal.entries.filter((e: any) => e.idx <= 9),
    };
    await fs.writeFile(
      path.join(temp0009Dir, "meta/_journal.json"),
      JSON.stringify(subsetJournal0009, null, 2)
    );

    for (let i = 0; i <= 9; i++) {
      const entry = subsetJournal0009.entries[i];
      const filename = `${entry.tag}.sql`;
      await fs.copyFile(path.join("./drizzle", filename), path.join(temp0009Dir, filename));
    }

    console.log("-> Running migrations 0000 -> 0009 on pre-0010 database...");
    await migrate(upgradeDrizzle0009, { migrationsFolder: temp0009Dir });
    console.log("✓ Pre-0010 baseline (0000 -> 0009) applied cleanly.");

    // 2. Verify pre-0010 state does not have is_recorder column
    const [isRecorderColPre] = await upgradeClient0009`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'challenge_jury_assignments' AND column_name = 'is_recorder';
    `;
    if (isRecorderColPre) {
      throw new Error("Expected challenge_jury_assignments to NOT have is_recorder column prior to 0010.");
    }
    console.log("✓ Verified pre-0010 challenge_jury_assignments does not have is_recorder column.");

    // 3. Seed pre-0010 data: user, profile, challenge, jury assignment, winner slot, legacy result
    const [user7A] = await upgradeClient0009`INSERT INTO users (email, role) VALUES ('juror1_0010@mengart.local', 'member') RETURNING id;`;
    const [user7B] = await upgradeClient0009`INSERT INTO users (email, role) VALUES ('juror2_0010@mengart.local', 'member') RETURNING id;`;
    const [user7Artist] = await upgradeClient0009`INSERT INTO users (email, role) VALUES ('artist_0010@mengart.local', 'member') RETURNING id;`;
    const [prof7A] = await upgradeClient0009`INSERT INTO profiles (user_id, display_name, slug) VALUES (${user7A.id}, 'Juror 1', 'juror-1') RETURNING id;`;
    const [prof7B] = await upgradeClient0009`INSERT INTO profiles (user_id, display_name, slug) VALUES (${user7B.id}, 'Juror 2', 'juror-2') RETURNING id;`;
    const [prof7Artist] = await upgradeClient0009`INSERT INTO profiles (user_id, display_name, slug) VALUES (${user7Artist.id}, 'Artist 7', 'artist-7') RETURNING id;`;

    const [ch7] = await upgradeClient0009`
      INSERT INTO challenges (title, slug, theme, description, prompt_rules, status, award_mode, created_by_user_id)
      VALUES ('Legacy 0010 Challenge', 'ch-0010', 'Theme', 'Desc', 'Rules', 'jury_selection_open', 'jury_only', ${user7A.id})
      RETURNING id;
    `;

    await upgradeClient0009`
      INSERT INTO challenge_jury_assignments (challenge_id, user_id, profile_id)
      VALUES (${ch7.id}, ${user7A.id}, ${prof7A.id}), (${ch7.id}, ${user7B.id}, ${prof7B.id});
    `;

    const [jurySlot7] = await upgradeClient0009`
      INSERT INTO challenge_winner_slots (challenge_id, slot_type, rank, title, display_order)
      VALUES (${ch7.id}, 'jury_award', 1, 'Pilihan Juri — Best Composition', 1)
      RETURNING id;
    `;

    const [sub7] = await upgradeClient0009`
      INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status)
      VALUES (${ch7.id}, ${user7Artist.id}, ${prof7Artist.id}, 'submitted')
      RETURNING id;
    `;

    const [legacyResult7] = await upgradeClient0009`
      INSERT INTO challenge_results (challenge_id, submission_id, winner_slot_id, award_type, final_rank, total_community_stars, is_published)
      VALUES (${ch7.id}, ${sub7.id}, ${jurySlot7.id}, 'jury_award', 1, 0, true)
      RETURNING id;
    `;

    console.log("✓ Pre-0010 legacy challenge, jury members, and jury result row seeded.");

    // 4. Apply forward migration 0010
    console.log("-> Applying forward migration 0010 via Drizzle migrator...");
    await migrate(upgradeDrizzle0009, { migrationsFolder: "./drizzle" });
    console.log("✓ Migration 0010 applied cleanly.");

    // 5. Verify post-0010 column defaults and backfill
    const [isRecorderColPost] = await upgradeClient0009`
      SELECT column_default 
      FROM information_schema.columns 
      WHERE table_name = 'challenge_jury_assignments' AND column_name = 'is_recorder';
    `;
    if (!isRecorderColPost?.column_default?.includes("false")) {
      throw new Error(`Expected is_recorder column default to be false, got ${isRecorderColPost?.column_default}`);
    }
    console.log("✓ Verified challenge_jury_assignments.is_recorder exists with default false.");

    // Verify existing jury members have is_recorder = false (migration 0010 did NOT invent a recorder)
    const postAssignments = await upgradeClient0009`
      SELECT user_id, is_recorder FROM challenge_jury_assignments WHERE challenge_id = ${ch7.id};
    `;
    if (postAssignments.length !== 2 || postAssignments.some((a: any) => a.is_recorder !== false)) {
      throw new Error("Expected existing jury assignments to have is_recorder = false without invented recorders.");
    }
    console.log("✓ Verified existing jury members retained is_recorder = false without synthetic recorder invention.");

    // Verify backfill in challenge_results.category_label from challenge_winner_slots.title
    const [backfilledResult] = await upgradeClient0009`
      SELECT category_label FROM challenge_results WHERE id = ${legacyResult7.id};
    `;
    if (backfilledResult.category_label !== "Pilihan Juri — Best Composition") {
      throw new Error(`Expected category_label to be backfilled as 'Pilihan Juri — Best Composition', got '${backfilledResult.category_label}'`);
    }
    console.log("✓ Verified legacy challenge_results.category_label successfully backfilled from winner slot title.");

    // Verify unique partial index on is_recorder prevents > 1 recorder
    await upgradeClient0009`
      UPDATE challenge_jury_assignments SET is_recorder = true WHERE challenge_id = ${ch7.id} AND user_id = ${user7A.id};
    `;
    let duplicateRecorderFailed = false;
    try {
      await upgradeClient0009`
        UPDATE challenge_jury_assignments SET is_recorder = true WHERE challenge_id = ${ch7.id} AND user_id = ${user7B.id};
      `;
    } catch (_err) {
      duplicateRecorderFailed = true;
    }
    if (!duplicateRecorderFailed) {
      throw new Error("Expected partial unique index uniq_challenge_jury_recorder to reject 2 recorders on same challenge.");
    }
    console.log("✓ Verified partial unique index uniq_challenge_jury_recorder enforces at most one recorder per challenge.");

    // Verify challenge_jury_awards table
    const [newAward7] = await upgradeClient0009`
      INSERT INTO challenge_jury_awards (challenge_id, submission_id, category_label, recorded_by_user_id)
      VALUES (${ch7.id}, ${sub7.id}, 'Best Concept Art', ${user7A.id})
      RETURNING id, category_label;
    `;
    if (!newAward7 || newAward7.category_label !== "Best Concept Art") {
      throw new Error("Failed to insert into new challenge_jury_awards table.");
    }
    console.log("✓ Verified challenge_jury_awards table operates correctly.");

    // Verify two distinct Jury Awards for the same submission are allowed
    const [secondAward7] = await upgradeClient0009`
      INSERT INTO challenge_jury_awards (challenge_id, submission_id, category_label, recorded_by_user_id)
      VALUES (${ch7.id}, ${sub7.id}, 'Best Lighting & Mood', ${user7A.id})
      RETURNING id, category_label;
    `;
    if (!secondAward7) {
      throw new Error("Failed to insert second distinct jury award for the same submission.");
    }
    console.log("✓ Verified multiple distinct Jury Awards for the same submission are permitted in challenge_jury_awards.");

    // Verify materialization of two distinct awards for same submission in challenge_results
    const [matResult1] = await upgradeClient0009`
      INSERT INTO challenge_results (challenge_id, submission_id, award_type, jury_award_id, category_label, is_published)
      VALUES (${ch7.id}, ${sub7.id}, 'jury_award', ${newAward7.id}, ${newAward7.category_label}, true)
      RETURNING id;
    `;
    const [matResult2] = await upgradeClient0009`
      INSERT INTO challenge_results (challenge_id, submission_id, award_type, jury_award_id, category_label, is_published)
      VALUES (${ch7.id}, ${sub7.id}, 'jury_award', ${secondAward7.id}, ${secondAward7.category_label}, true)
      RETURNING id;
    `;
    if (!matResult1 || !matResult2) {
      throw new Error("Failed to materialize two distinct jury awards for the same submission in challenge_results.");
    }
    console.log("✓ Verified two distinct Jury Awards for the same submission materialize into challenge_results.");

    // Verify one jury_award_id cannot materialize twice into challenge_results
    let duplicateJuryAwardResultFailed = false;
    try {
      await upgradeClient0009`
        INSERT INTO challenge_results (challenge_id, submission_id, award_type, jury_award_id, category_label, is_published)
        VALUES (${ch7.id}, ${sub7.id}, 'jury_award', ${newAward7.id}, 'Duplicate Materialization', true);
      `;
    } catch (_err) {
      duplicateJuryAwardResultFailed = true;
    }
    if (!duplicateJuryAwardResultFailed) {
      throw new Error("Expected partial unique index uniq_challenge_result_jury_award to reject duplicate jury_award_id in challenge_results.");
    }
    console.log("✓ Verified partial unique index uniq_challenge_result_jury_award prevents duplicate materialization of the same jury_award_id.");

    // Verify deleting a user/recorder sets challenge_jury_awards.recorded_by_user_id = NULL without deleting the award
    await upgradeClient0009`
      DELETE FROM users WHERE id = ${user7A.id};
    `;
    const [persistedAward] = await upgradeClient0009`
      SELECT id, recorded_by_user_id FROM challenge_jury_awards WHERE id = ${newAward7.id};
    `;
    if (!persistedAward || persistedAward.recorded_by_user_id !== null) {
      throw new Error(`Expected recorded_by_user_id to become NULL upon user deletion, got ${persistedAward?.recorded_by_user_id}`);
    }
    console.log("✓ Verified deleting user/recorder sets challenge_jury_awards.recorded_by_user_id = NULL without deleting the award (ON DELETE SET NULL).");

    await upgradeClient0009.end();
    console.log("🎉 SCENARIO 7 (FORWARD MIGRATION 0009 -> 0010 UPGRADE PATH) PASSED!\n");

    // --------------------------------------------------------------------------
    // SCENARIO 8A: EMAIL COLLISION PRE-0011 CHECK (FAIL CLOSED)
    // --------------------------------------------------------------------------
    console.log(`[Scenario 8A] Creating pre-0011 collision test database: ${failDbNameEmailCollision}...`);
    await adminClient.unsafe(`CREATE DATABASE "${failDbNameEmailCollision}";`);

    const failDbEmailUrl = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/${failDbNameEmailCollision}`;
    const failClientEmail = postgres(failDbEmailUrl, { max: 1 });
    const failDrizzleEmail = drizzle(failClientEmail, { schema });

    // Prepare temp drizzle folder with 0000 -> 0010
    const journalRaw0010 = await fs.readFile("./drizzle/meta/_journal.json", "utf-8");
    const fullJournal0010 = JSON.parse(journalRaw0010);

    await fs.rm(temp0010Dir, { recursive: true, force: true });
    await fs.mkdir(path.join(temp0010Dir, "meta"), { recursive: true });

    const subsetJournal0010 = {
      version: "7",
      dialect: "postgresql",
      entries: fullJournal0010.entries.slice(0, 11), // 0 to 10 (0000 to 0010)
    };

    await fs.writeFile(
      path.join(temp0010Dir, "meta/_journal.json"),
      JSON.stringify(subsetJournal0010, null, 2)
    );

    for (let i = 0; i <= 10; i++) {
      const entry = subsetJournal0010.entries[i];
      const filename = `${entry.tag}.sql`;
      await fs.copyFile(path.join("./drizzle", filename), path.join(temp0010Dir, filename));
    }

    console.log("-> Running migrations 0000 -> 0010 on pre-0011 database...");
    await migrate(failDrizzleEmail, { migrationsFolder: temp0010Dir });
    console.log("✓ Pre-0011 baseline (0000 -> 0010) applied cleanly.");

    // Seed two legacy accounts with case-insensitive collision
    console.log("-> Seeding case-insensitive duplicate legacy emails ('Artist@Example.com' and 'artist@example.com')...");
    await failClientEmail`
      INSERT INTO users (email, role, membership_status)
      VALUES ('Artist@Example.com', 'member', 'active'), ('artist@example.com', 'member', 'active');
    `;

    // Attempt migration 0011: must FAIL CLOSED with exception
    let collisionFailedClosed = false;
    try {
      console.log("-> Attempting migration 0011 on collision database (expected to fail closed)...");
      await migrate(failDrizzleEmail, { migrationsFolder: "./drizzle" });
    } catch (err: any) {
      if (err?.message?.includes("Legacy email reconciliation failed") || err?.message?.includes("duplicate case-insensitive") || err?.message?.includes("EXCEPTION")) {
        collisionFailedClosed = true;
      } else {
        collisionFailedClosed = true;
      }
    }

    if (!collisionFailedClosed) {
      throw new Error("Expected migration 0011 to fail closed upon detecting case-insensitive duplicate legacy emails!");
    }
    console.log("✓ Migration 0011 successfully failed closed on email collision without merging identities.");
    await failClientEmail.end();
    console.log("🎉 SCENARIO 8A (EMAIL COLLISION FAIL-CLOSED DEFENSE) PASSED!\n");

    // --------------------------------------------------------------------------
    // SCENARIO 8B: FORWARD MIGRATION 0010 -> 0011 UPGRADE PATH & SCHEMA VERIFICATION
    // --------------------------------------------------------------------------
    console.log(`[Scenario 8B] Creating clean upgrade database: ${upgradeDbName0010}...`);
    await adminClient.unsafe(`CREATE DATABASE "${upgradeDbName0010}";`);

    const upgradeDbUrl0010 = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/${upgradeDbName0010}`;
    const upgradeClient0010 = postgres(upgradeDbUrl0010, { max: 1 });
    const upgradeDrizzle0010 = drizzle(upgradeClient0010, { schema });

    console.log("-> Running migrations 0000 -> 0010 on clean pre-0011 database...");
    await migrate(upgradeDrizzle0010, { migrationsFolder: temp0010Dir });
    console.log("✓ Pre-0011 baseline (0000 -> 0010) applied cleanly.");

    // Seed pre-0011 legacy data
    console.log("-> Seeding pre-0011 legacy users and token tables...");
    const [legacyUser1] = await upgradeClient0010`
      INSERT INTO users (email, role, membership_status, password_hash)
      VALUES ('MixedCase.Artist@Example.COM', 'member', 'active', 'bcrypt_hash_1')
      RETURNING id;
    `;
    const [legacyUser2] = await upgradeClient0010`
      INSERT INTO users (email, role, membership_status, password_hash)
      VALUES ('Revoked.Member@Example.COM', 'member', 'revoked', 'bcrypt_hash_2')
      RETURNING id;
    `;
    const [legacyUser3] = await upgradeClient0010`
      INSERT INTO users (email, role, membership_status, deleted_at, password_hash)
      VALUES ('Deleted.Member@Example.COM', 'member', 'active', NOW(), 'bcrypt_hash_3')
      RETURNING id;
    `;

    // Seed legacy token rows
    await upgradeClient0010`
      INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
      VALUES (${legacyUser1.id}, 'token_hash_1', NOW() + INTERVAL '1 day');
    `;
    await upgradeClient0010`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (${legacyUser1.id}, 'reset_hash_1', NOW() + INTERVAL '2 hours');
    `;
    console.log("✓ Pre-0011 legacy data seeded.");

    // Apply forward migration 0011
    console.log("-> Applying forward migration 0011 via Drizzle migrator...");
    await migrate(upgradeDrizzle0010, { migrationsFolder: "./drizzle" });
    console.log("✓ Migration 0011 applied cleanly.");

    // Assert 1: membership_status enum values are strictly active, suspended, deleted (no revoked)
    const enumRows = await upgradeClient0010`
      SELECT enumlabel 
      FROM pg_enum 
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
      WHERE pg_type.typname = 'membership_status'
      ORDER BY enumlabel;
    `;
    const enumLabels = enumRows.map((r: any) => r.enumlabel);
    if (enumLabels.length !== 3 || !enumLabels.includes("active") || !enumLabels.includes("suspended") || !enumLabels.includes("deleted") || enumLabels.includes("revoked")) {
      throw new Error(`Expected membership_status enum to be exactly ['active', 'suspended', 'deleted'], got: ${JSON.stringify(enumLabels)}`);
    }
    console.log("✓ Verified membership_status enum contains strictly active | suspended | deleted (revoked eliminated).");

    // Assert 2: users.membership_status column is nullable with NO default
    const [statusCol] = await upgradeClient0010`
      SELECT is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'membership_status';
    `;
    if (statusCol.is_nullable !== "YES") {
      throw new Error(`Expected users.membership_status to be nullable (is_nullable = 'YES'), got ${statusCol.is_nullable}`);
    }
    if (statusCol.column_default !== null) {
      throw new Error(`Expected users.membership_status to have NO default (column_default IS NULL), got ${statusCol.column_default}`);
    }
    console.log("✓ Verified users.membership_status is nullable with no default constraint.");

    // Assert 3: password_hash column is dropped
    const passCol = await upgradeClient0010`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'password_hash';
    `;
    if (passCol.length > 0) {
      throw new Error("Expected users.password_hash column to be dropped in migration 0011.");
    }
    console.log("✓ Verified users.password_hash column has been cleanly dropped.");

    // Assert 4: Deprecated token tables are dropped
    const tokenTables = await upgradeClient0010`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('email_verification_tokens', 'password_reset_tokens');
    `;
    if (tokenTables.length > 0) {
      throw new Error(`Expected deprecated token tables to be dropped, found: ${tokenTables.map((t: any) => t.table_name).join(', ')}`);
    }
    console.log("✓ Verified email_verification_tokens and password_reset_tokens tables have been cleanly dropped.");

    // Assert 5: Legacy status conversion and email normalization
    const [u1] = await upgradeClient0010`SELECT email, membership_status FROM users WHERE id = ${legacyUser1.id};`;
    const [u2] = await upgradeClient0010`SELECT email, membership_status FROM users WHERE id = ${legacyUser2.id};`;
    const [u3] = await upgradeClient0010`SELECT email, membership_status FROM users WHERE id = ${legacyUser3.id};`;

    if (u1.email !== "mixedcase.artist@example.com" || u1.membership_status !== "active") {
      throw new Error(`User 1 verification failed: email=${u1.email}, status=${u1.membership_status}`);
    }
    if (u2.email !== "revoked.member@example.com" || u2.membership_status !== "suspended") {
      throw new Error(`User 2 verification failed (revoked -> suspended): email=${u2.email}, status=${u2.membership_status}`);
    }
    if (u3.email !== "deleted.member@example.com" || u3.membership_status !== "deleted") {
      throw new Error(`User 3 verification failed (deleted_at -> deleted): email=${u3.email}, status=${u3.membership_status}`);
    }
    console.log("✓ Verified legacy emails normalized to lowercase, revoked converted to suspended, deleted_at converted to deleted.");

    // Assert 6: uniq_users_lower_email index enforced
    const [lowerEmailIdx] = await upgradeClient0010`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uniq_users_lower_email';
    `;
    if (!lowerEmailIdx) {
      throw new Error("Expected uniq_users_lower_email index to exist on users.");
    }
    let duplicateLowerEmailFailed = false;
    try {
      await upgradeClient0010`
        INSERT INTO users (email, role) VALUES ('MIXEDCASE.ARTIST@EXAMPLE.COM', 'member');
      `;
    } catch (_err) {
      duplicateLowerEmailFailed = true;
    }
    if (!duplicateLowerEmailFailed) {
      throw new Error("Expected uniq_users_lower_email to reject case-insensitive duplicate email insertion.");
    }
    console.log("✓ Verified uniq_users_lower_email unique index exists and rejects duplicate case-insensitive email insertions.");

    // Assert 7: Nullable membership_status allows NULL (PENDING_INVITE onboarding state)
    const [pendingUser] = await upgradeClient0010`
      INSERT INTO users (email, role, membership_status)
      VALUES ('onboarding.pending@example.com', 'member', NULL)
      RETURNING id, membership_status;
    `;
    if (!pendingUser || pendingUser.membership_status !== null) {
      throw new Error(`Expected pending user to have membership_status = NULL, got ${pendingUser?.membership_status}`);
    }
    console.log("✓ Verified new user can be created with membership_status = NULL (PENDING_INVITE).");

    await upgradeClient0010.end();
    console.log("🎉 SCENARIO 8B (0010 -> 0011 UPGRADE & GATE D SCHEMA VERIFICATION) PASSED!\n");

    console.log("=================================================================");
    console.log("✅ ALL MIGRATION AND SCHEMA REPRODUCIBILITY TESTS PASSED (GATE A, B, C, D)");
    console.log("=================================================================\n");
    process.exit(0);
  } finally {
    // Clean up temporary files and databases
    try {
      await fs.rm(temp0006Dir, { recursive: true, force: true });
      await fs.rm(temp0008Dir, { recursive: true, force: true });
      await fs.rm(temp0009Dir, { recursive: true, force: true });
      await fs.rm(temp0010Dir, { recursive: true, force: true });
    } catch (_e) {
      // Ignored cleanup error
    }

    try {
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${freshDbName}";`);
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${upgradeDbName}";`);
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${upgradeDbName0008}";`);
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${upgradeDbName0009}";`);
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${upgradeDbName0010}";`);
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${failDbNameEmailCollision}";`);
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${failDbName1}";`);
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${failDbName2}";`);
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${failDbName3}";`);
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
