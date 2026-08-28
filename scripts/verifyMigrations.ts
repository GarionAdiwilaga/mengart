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
    console.log("✓ Migration executed cleanly on fresh database.");

    // Verify Blueprint 2.1 Table Existence
    console.log("-> Verifying schema tables and columns on fresh database...");
    const tablesRes = await freshClient`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('challenge_voting_rounds', 'challenge_voting_round_candidates', 'challenge_jury_slot_assignments', 'challenge_results', 'challenge_ballots');
    `;
    const tableNames = tablesRes.map((r: any) => r.table_name);
    console.log(`  Found tables: ${tableNames.join(", ")}`);
    if (tableNames.length < 5) {
      throw new Error(`Missing expected tables! Found only: ${tableNames.join(", ")}`);
    }

    // Verify nullable final_rank on challenge_results
    const colRes = await freshClient`
      SELECT column_name, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'challenge_results' AND column_name IN ('final_rank', 'award_type');
    `;
    const finalRankCol = colRes.find((c: any) => c.column_name === "final_rank");
    const awardTypeCol = colRes.find((c: any) => c.column_name === "award_type");

    if (!finalRankCol || finalRankCol.is_nullable !== "YES") {
      throw new Error(`Expected challenge_results.final_rank to be nullable YES, got: ${finalRankCol?.is_nullable}`);
    }
    if (!awardTypeCol) {
      throw new Error("Missing challenge_results.award_type column!");
    }
    console.log("✓ Verified challenge_results.final_rank is nullable and award_type exists.");

    // Verify challenge_status enum contains results_revoked
    const enumRes = await freshClient`
      SELECT e.enumlabel 
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid 
      WHERE t.typname = 'challenge_status';
    `;
    const enumLabels = enumRes.map((r: any) => r.enumlabel);
    if (!enumLabels.includes("results_revoked")) {
      throw new Error(`challenge_status enum missing 'results_revoked'! Found: ${enumLabels.join(", ")}`);
    }
    console.log("✓ Verified challenge_status enum includes 'results_revoked'.");

    await freshClient.end();
    console.log("🎉 SCENARIO 1 (FRESH DATABASE MIGRATION) PASSED!\n");

    // --------------------------------------------------------------------------
    // SCENARIO 2: UPGRADE FROM REAL MIGRATION 0006 TO 0007 VIA REAL DRIZZLE MIGRATOR
    // --------------------------------------------------------------------------
    console.log(`[Scenario 2] Creating upgrade test database: ${upgradeDbName}...`);
    await adminClient.unsafe(`CREATE DATABASE "${upgradeDbName}";`);

    const upgradeDbUrl = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/${upgradeDbName}`;
    const upgradeClient = postgres(upgradeDbUrl, { max: 1 });
    const upgradeDrizzle = drizzle(upgradeClient);

    // Prepare temporary 0000-0006 Drizzle migrations folder to simulate genuine pre-remediation database
    await fs.mkdir(path.join(temp0006Dir, "meta"), { recursive: true });
    const fullJournal = JSON.parse(await fs.readFile("./drizzle/meta/_journal.json", "utf-8"));
    const filteredJournal = {
      ...fullJournal,
      entries: fullJournal.entries.filter((e: any) => e.idx <= 6),
    };
    await fs.writeFile(
      path.join(temp0006Dir, "meta/_journal.json"),
      JSON.stringify(filteredJournal, null, 2)
    );

    const migrationFiles0006 = (await fs.readdir("./drizzle")).filter(
      (f) => f.endsWith(".sql") && !f.startsWith("0007")
    );
    for (const f of migrationFiles0006) {
      await fs.copyFile(path.join("./drizzle", f), path.join(temp0006Dir, f));
    }

    console.log("-> Applying migrations 0000 to 0006 via Drizzle migrator...");
    await migrate(upgradeDrizzle, { migrationsFolder: temp0006Dir });
    console.log(`✓ Applied ${migrationFiles0006.length} pre-remediation migrations through genuine Drizzle migrator.`);

    // Insert representative pre-remediation data
    console.log("-> Populating representative legacy data (Users, Challenges, Winner Slots, Submissions, Ballots, Results)...");
    const [userA] = await upgradeClient`
      INSERT INTO users (email, role, membership_status)
      VALUES ('legacy_artist_a@mengart.local', 'member', 'active')
      RETURNING id;
    `;
    const [userB] = await upgradeClient`
      INSERT INTO users (email, role, membership_status)
      VALUES ('legacy_artist_b@mengart.local', 'member', 'active')
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

    const [challenge] = await upgradeClient`
      INSERT INTO challenges (title, slug, theme, description, prompt_rules, status, award_mode, stars_per_member, created_by_user_id)
      VALUES ('Legacy Challenge 2026', 'legacy-challenge-2026', 'Heritage', 'Testing upgrade', 'Rules', 'finished', 'vote_and_jury', 3, ${userA.id})
      RETURNING id;
    `;

    // Pre-remediation Winner Slots: 1 community slot and 1 jury slot
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

    const [artA] = await upgradeClient`
      INSERT INTO artworks (user_id, title, slug, media_type)
      VALUES (${userA.id}, 'Artwork A', 'artwork-a', 'image')
      RETURNING id;
    `;
    const [artB] = await upgradeClient`
      INSERT INTO artworks (user_id, title, slug, media_type)
      VALUES (${userB.id}, 'Artwork B', 'artwork-b', 'image')
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

    // Legacy Ballots (pre-remediation without voting_round_id)
    const [legacyBallot1] = await upgradeClient`
      INSERT INTO challenge_ballots (challenge_id, user_id, round_type, stars_allocated, is_finalized)
      VALUES (${challenge.id}, ${userA.id}, 'main', 2, true)
      RETURNING id;
    `;
    await upgradeClient`
      INSERT INTO challenge_ballot_stars (ballot_id, submission_id, stars_count)
      VALUES (${legacyBallot1.id}, ${subB.id}, 2);
    `;

    const [legacyBallot2] = await upgradeClient`
      INSERT INTO challenge_ballots (challenge_id, user_id, round_type, stars_allocated, is_finalized)
      VALUES (${challenge.id}, ${userB.id}, 'main', 3, true)
      RETURNING id;
    `;
    await upgradeClient`
      INSERT INTO challenge_ballot_stars (ballot_id, submission_id, stars_count)
      VALUES (${legacyBallot2.id}, ${subA.id}, 3);
    `;

    // Legacy Results: 1 Community Result and 1 Jury Result
    await upgradeClient`
      INSERT INTO challenge_results (challenge_id, submission_id, winner_slot_id, final_rank, total_community_stars, is_published)
      VALUES (${challenge.id}, ${subA.id}, ${communitySlot.id}, 1, 3, true);
    `;
    await upgradeClient`
      INSERT INTO challenge_results (challenge_id, submission_id, winner_slot_id, final_rank, total_community_stars, is_published)
      VALUES (${challenge.id}, ${subB.id}, ${jurySlot.id}, 2, 2, true);
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

    const commRes = resultsRows.find((r: any) => r.submission_id === subA.id);
    const juryRes = resultsRows.find((r: any) => r.submission_id === subB.id);

    if (!commRes || commRes.award_type !== "community_rank") {
      throw new Error(`Expected subA award_type = 'community_rank', got '${commRes?.award_type}'`);
    }
    if (!juryRes || juryRes.award_type !== "jury_award") {
      throw new Error(`Expected subB award_type = 'jury_award', got '${juryRes?.award_type}'`);
    }
    console.log("✓ Invariant 1 Passed: challenge_results.award_type deterministically backfilled from slot_type.");

    // Invariant 2: Authoritative challenge_voting_rounds creation
    const rounds = await upgradeClient`
      SELECT * FROM challenge_voting_rounds WHERE challenge_id = ${challenge.id};
    `;
    if (rounds.length !== 1 || rounds[0].round_type !== "main" || rounds[0].round_sequence !== 1) {
      throw new Error(`Expected exactly 1 main voting round, found ${rounds.length}`);
    }
    const backfilledRoundId = rounds[0].id;
    console.log("✓ Invariant 2 Passed: Exactly 1 main voting round backfilled for legacy challenge.");

    // Invariant 3: Frozen candidate snapshot in challenge_voting_round_candidates
    const candidates = await upgradeClient`
      SELECT submission_id FROM challenge_voting_round_candidates WHERE voting_round_id = ${backfilledRoundId};
    `;
    const candSubmissionIds = candidates.map((c: any) => c.submission_id);
    if (!candSubmissionIds.includes(subA.id) || !candSubmissionIds.includes(subB.id)) {
      throw new Error("Candidate snapshot did not freeze all submitted entries!");
    }
    console.log(`✓ Invariant 3 Passed: Candidate snapshot contains all submitted entries (${candSubmissionIds.length} entries).`);

    // Invariant 4: Every ballot has valid voting_round_id matching challenge & candidates
    const ballots = await upgradeClient`
      SELECT b.id, b.challenge_id, b.voting_round_id, vr.challenge_id as round_challenge_id
      FROM challenge_ballots b
      INNER JOIN challenge_voting_rounds vr ON vr.id = b.voting_round_id
      WHERE b.challenge_id = ${challenge.id};
    `;
    if (ballots.length !== 2) {
      throw new Error(`Expected 2 ballots linked to voting_round_id, found ${ballots.length}`);
    }
    for (const b of ballots) {
      if (!b.voting_round_id) {
        throw new Error(`Ballot ${b.id} voting_round_id is null!`);
      }
      if (b.challenge_id !== b.round_challenge_id) {
        throw new Error(`Ballot ${b.id} challenge_id does not match voting_round challenge_id!`);
      }

      // Check all ballot stars are in candidate snapshot
      const stars = await upgradeClient`
        SELECT submission_id FROM challenge_ballot_stars WHERE ballot_id = ${b.id};
      `;
      for (const s of stars) {
        if (!candSubmissionIds.includes(s.submission_id)) {
          throw new Error(`Ballot star submission ${s.submission_id} is not present in frozen candidate set!`);
        }
      }
    }
    console.log("✓ Invariant 4 Passed: All ballots authoritatively linked to valid round and candidate snapshots.");

    await upgradeClient.end();
    console.log("🎉 SCENARIO 2 (UPGRADE, REAL DRIZZLE MIGRATOR & INVARIANT INTEGRITY) PASSED!\n");

    console.log("=================================================================");
    console.log("✅ ALL MIGRATION AND SCHEMA REPRODUCIBILITY TESTS PASSED (GATE A)");
    console.log("=================================================================\n");
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
    process.exit(0);
  }
}

runMigrationVerification().catch((err) => {
  console.error("❌ Migration verification failed:", err);
  process.exit(1);
});
