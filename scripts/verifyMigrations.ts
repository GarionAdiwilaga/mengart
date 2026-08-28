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

  try {
    // --------------------------------------------------------------------------
    // SCENARIO 1: FRESH EMPTY DATABASE -> ALL COMMITTED MIGRATIONS
    // --------------------------------------------------------------------------
    console.log(`[Scenario 1] Creating fresh empty database: ${freshDbName}...`);
    await adminClient.unsafe(`CREATE DATABASE "${freshDbName}";`);

    const freshDbUrl = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/${freshDbName}`;
    const freshClient = postgres(freshDbUrl, { max: 1 });
    const freshDrizzle = drizzle(freshClient);

    console.log("-> Running all committed migrations (0000 -> 0007) on fresh database...");
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
    // SCENARIO 2: UPGRADE FROM PRE-REMEDIATION (0000-0006) WITH EXISTING DATA
    // --------------------------------------------------------------------------
    console.log(`[Scenario 2] Creating upgrade test database: ${upgradeDbName}...`);
    await adminClient.unsafe(`CREATE DATABASE "${upgradeDbName}";`);

    const upgradeDbUrl = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/${upgradeDbName}`;
    const upgradeClient = postgres(upgradeDbUrl, { max: 1 });

    console.log("-> Applying pre-remediation migrations (0000 to 0006)...");
    const migrationFiles = (await fs.readdir("./drizzle"))
      .filter((f) => f.endsWith(".sql") && !f.startsWith("0007"))
      .sort();

    // Create Drizzle migrations table manually for pre-remediation simulation
    await upgradeClient.unsafe(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      );
    `);

    for (const sqlFile of migrationFiles) {
      const sqlContent = await fs.readFile(path.join("./drizzle", sqlFile), "utf-8");
      // Execute each statement split by statement-breakpoint
      const statements = sqlContent.split("--> statement-breakpoint");
      for (const stmt of statements) {
        if (stmt.trim()) {
          await upgradeClient.unsafe(stmt);
        }
      }
      await upgradeClient`
        INSERT INTO "__drizzle_migrations" (hash, created_at)
        VALUES (${sqlFile}, ${Date.now()});
      `;
    }
    console.log(`✓ Applied ${migrationFiles.length} pre-remediation migrations.`);

    // Insert representative pre-remediation data
    console.log("-> Populating representative legacy data (Users, Challenges, Submissions, Ballots, Results)...");
    const [user] = await upgradeClient`
      INSERT INTO users (email, role, membership_status)
      VALUES ('legacy_artist@mengart.local', 'member', 'active')
      RETURNING id;
    `;

    const [profile] = await upgradeClient`
      INSERT INTO profiles (user_id, display_name, slug)
      VALUES (${user.id}, 'Legacy Artist', 'legacy-artist')
      RETURNING id;
    `;

    const [challenge] = await upgradeClient`
      INSERT INTO challenges (title, slug, theme, description, prompt_rules, status, award_mode, stars_per_member, created_by_user_id)
      VALUES ('Legacy Challenge 2026', 'legacy-challenge-2026', 'Heritage', 'Testing upgrade', 'Rules', 'finished', 'vote_and_jury', 3, ${user.id})
      RETURNING id;
    `;

    const [slot] = await upgradeClient`
      INSERT INTO challenge_winner_slots (challenge_id, slot_type, rank, title, display_order)
      VALUES (${challenge.id}, 'community_vote', 1, 'Juara 1 Komunitas', 1)
      RETURNING id;
    `;

    const [artwork] = await upgradeClient`
      INSERT INTO artworks (user_id, title, slug, media_type)
      VALUES (${user.id}, 'Legacy Artwork', 'legacy-artwork', 'image')
      RETURNING id;
    `;

    const [sub] = await upgradeClient`
      INSERT INTO challenge_submissions (challenge_id, user_id, profile_id, submission_status)
      VALUES (${challenge.id}, ${user.id}, ${profile.id}, 'submitted')
      RETURNING id;
    `;

    // Legacy Ballot (pre-remediation without voting_round_id)
    const [legacyBallot] = await upgradeClient`
      INSERT INTO challenge_ballots (challenge_id, user_id, round_type, stars_allocated, is_finalized)
      VALUES (${challenge.id}, ${user.id}, 'main', 3, true)
      RETURNING id;
    `;

    await upgradeClient`
      INSERT INTO challenge_ballot_stars (ballot_id, submission_id, stars_count)
      VALUES (${legacyBallot.id}, ${sub.id}, 3);
    `;

    // Legacy Result (pre-remediation with non-null final_rank)
    await upgradeClient`
      INSERT INTO challenge_results (challenge_id, submission_id, winner_slot_id, final_rank, total_community_stars, is_published)
      VALUES (${challenge.id}, ${sub.id}, ${slot.id}, 1, 3, true);
    `;

    console.log("✓ Pre-remediation data populated cleanly.");

    // Now run migration 0007 (Blueprint 2.1 Schema Upgrades)
    console.log("-> Applying migration 0007_perfect_sunspot.sql on legacy database...");
    const mig0007Content = await fs.readFile("./drizzle/0007_perfect_sunspot.sql", "utf-8");
    const stmts0007 = mig0007Content.split("--> statement-breakpoint");
    for (const stmt of stmts0007) {
      if (stmt.trim()) {
        await upgradeClient.unsafe(stmt);
      }
    }
    console.log("✓ Migration 0007 applied successfully over existing data!");

    // Execute Data Backfill Procedure
    console.log("-> Executing Data Backfill for existing ballots & voting rounds...");
    
    // 1. Backfill main voting round for legacy challenges that lacked one
    const legacyChallenges = await upgradeClient`
      SELECT c.id, c.stars_per_member, c.created_at, c.voting_deadline
      FROM challenges c
      LEFT JOIN challenge_voting_rounds vr ON vr.challenge_id = c.id AND vr.round_type = 'main'
      WHERE vr.id IS NULL;
    `;

    for (const ch of legacyChallenges) {
      const [newRound] = await upgradeClient`
        INSERT INTO challenge_voting_rounds (challenge_id, round_type, round_sequence, status, starts_at, deadline, stars_per_member, created_at)
        VALUES (${ch.id}, 'main', 1, 'closed', ${ch.created_at}, ${ch.voting_deadline}, ${ch.stars_per_member}, ${ch.created_at})
        RETURNING id;
      `;

      // Backfill ballots linking to this new round
      await upgradeClient`
        UPDATE challenge_ballots
        SET voting_round_id = ${newRound.id}
        WHERE challenge_id = ${ch.id} AND (round_type = 'main' OR round_type IS NULL);
      `;

      // Backfill frozen candidates for active submissions
      const activeSubs = await upgradeClient`
        SELECT id FROM challenge_submissions 
        WHERE challenge_id = ${ch.id} AND submission_status = 'submitted';
      `;
      for (const s of activeSubs) {
        await upgradeClient`
          INSERT INTO challenge_voting_round_candidates (voting_round_id, submission_id)
          VALUES (${newRound.id}, ${s.id})
          ON CONFLICT DO NOTHING;
        `;
      }
    }

    console.log(`✓ Backfilled voting rounds, candidates, and ballot linkages for ${legacyChallenges.length} challenges.`);

    // Verify backfilled data integrity & foreign key constraints
    const backfilledBallot = await upgradeClient`
      SELECT cb.id, cb.voting_round_id, vr.round_type, vr.challenge_id
      FROM challenge_ballots cb
      JOIN challenge_voting_rounds vr ON vr.id = cb.voting_round_id
      WHERE cb.id = ${legacyBallot.id};
    `;

    if (backfilledBallot.length === 0 || !backfilledBallot[0].voting_round_id) {
      throw new Error("Legacy ballot voting_round_id was not properly backfilled!");
    }
    console.log("✓ Verified legacy ballot is now authoritatively linked to backfilled voting round.");

    // Verify nullable jury result insertion works
    const [juryResult] = await upgradeClient`
      INSERT INTO challenge_results (challenge_id, submission_id, winner_slot_id, final_rank, award_type, total_community_stars, is_published)
      VALUES (${challenge.id}, ${sub.id}, NULL, NULL, 'jury_award', 0, true)
      ON CONFLICT (challenge_id, submission_id) 
      DO UPDATE SET final_rank = EXCLUDED.final_rank, award_type = EXCLUDED.award_type
      RETURNING id, final_rank, award_type;
    `;

    if (juryResult.final_rank !== null || juryResult.award_type !== "jury_award") {
      throw new Error("Nullable final_rank or award_type failed on updated challenge_results!");
    }
    console.log("✓ Verified nullable jury award result stored cleanly on upgraded schema.");

    await upgradeClient.end();
    console.log("🎉 SCENARIO 2 (UPGRADE & BACKFILL INTEGRITY) PASSED!\n");

  } finally {
    // Cleanup temporary databases
    console.log("-> Cleaning up temporary verification databases...");
    try {
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${freshDbName}" WITH (FORCE);`);
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${upgradeDbName}" WITH (FORCE);`);
    } catch (cleanupErr) {
      console.warn("Cleanup note:", cleanupErr);
    }
    await adminClient.end();
  }

  console.log("=================================================================");
  console.log("✅ ALL MIGRATION AND SCHEMA REPRODUCIBILITY TESTS PASSED (GATE A)");
  console.log("=================================================================\n");
}

runMigrationVerification().catch((err) => {
  console.error("❌ Migration verification failed:", err);
  process.exit(1);
});
