DO $$ BEGIN
  CREATE TYPE "public"."voting_round_status" AS ENUM('pending', 'open', 'closed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."voting_round_type" AS ENUM('main', 'tiebreak');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TYPE "public"."challenge_status" ADD VALUE IF NOT EXISTS 'results_revoked';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "challenge_jury_slot_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"winner_slot_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"assigned_by_user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "challenge_voting_round_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voting_round_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "challenge_voting_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"round_type" "voting_round_type" DEFAULT 'main' NOT NULL,
	"round_sequence" integer DEFAULT 1 NOT NULL,
	"status" "voting_round_status" DEFAULT 'pending' NOT NULL,
	"starts_at" timestamp with time zone,
	"deadline" timestamp with time zone,
	"stars_per_member" integer DEFAULT 3 NOT NULL,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "challenge_results" ALTER COLUMN "final_rank" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "challenge_ballots" ADD COLUMN IF NOT EXISTS "voting_round_id" uuid;--> statement-breakpoint
ALTER TABLE "challenge_results" ADD COLUMN IF NOT EXISTS "award_type" text DEFAULT 'community_rank' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "challenge_jury_slot_assignments" ADD CONSTRAINT "challenge_jury_slot_assignments_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "challenge_jury_slot_assignments" ADD CONSTRAINT "challenge_jury_slot_assignments_winner_slot_id_challenge_winner_slots_id_fk" FOREIGN KEY ("winner_slot_id") REFERENCES "public"."challenge_winner_slots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "challenge_jury_slot_assignments" ADD CONSTRAINT "challenge_jury_slot_assignments_submission_id_challenge_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."challenge_submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "challenge_jury_slot_assignments" ADD CONSTRAINT "challenge_jury_slot_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "challenge_voting_round_candidates" ADD CONSTRAINT "challenge_voting_round_candidates_voting_round_id_challenge_voting_rounds_id_fk" FOREIGN KEY ("voting_round_id") REFERENCES "public"."challenge_voting_rounds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "challenge_voting_round_candidates" ADD CONSTRAINT "challenge_voting_round_candidates_submission_id_challenge_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."challenge_submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "challenge_voting_rounds" ADD CONSTRAINT "challenge_voting_rounds_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jury_slot_assignments_challenge_id" ON "challenge_jury_slot_assignments" USING btree ("challenge_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_jury_slot_winner_slot" ON "challenge_jury_slot_assignments" USING btree ("challenge_id","winner_slot_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_jury_slot_submission" ON "challenge_jury_slot_assignments" USING btree ("challenge_id","submission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_round_candidates_round_id" ON "challenge_voting_round_candidates" USING btree ("voting_round_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_round_submission_candidate" ON "challenge_voting_round_candidates" USING btree ("voting_round_id","submission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_voting_rounds_challenge_id" ON "challenge_voting_rounds" USING btree ("challenge_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_challenge_round_sequence" ON "challenge_voting_rounds" USING btree ("challenge_id","round_sequence");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "challenge_ballots" ADD CONSTRAINT "challenge_ballots_voting_round_id_challenge_voting_rounds_id_fk" FOREIGN KEY ("voting_round_id") REFERENCES "public"."challenge_voting_rounds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ballots_voting_round_id" ON "challenge_ballots" USING btree ("voting_round_id");--> statement-breakpoint
-- ==============================================================================
-- AUTHORITATIVE DATA BACKFILL FOR BLUEPRINT 2.1 (VOTING ROUNDS, BALLOTS, RESULTS)
-- ==============================================================================

DO $$
DECLARE
  ch RECORD;
  main_round_id uuid;
  tiebreak_round_id uuid;
  sub RECORD;
  tb_sub RECORD;
BEGIN
  -- Backfill rounds ONLY for challenges that have legacy voting history or are in active/concluded voting stages
  FOR ch IN 
    SELECT c.id, c.status, c.stars_per_member, c.created_at, c.voting_deadline, c.voting_starts_at, c.award_mode
    FROM "challenges" c
    WHERE (
      -- Has existing legacy ballots
      EXISTS (SELECT 1 FROM "challenge_ballots" b WHERE b.challenge_id = c.id)
      -- Or has existing legacy results
      OR EXISTS (SELECT 1 FROM "challenge_results" r WHERE r.challenge_id = c.id)
      -- Or is currently in an active or post-voting lifecycle state (and not jury_only/showcase_only)
      OR (
        c.status::text IN ('voting_open', 'tiebreak_open', 'review', 'finished', 'results_revoked')
        AND COALESCE(c.award_mode, 'vote_and_jury') NOT IN ('jury_only', 'showcase_only')
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM "challenge_voting_rounds" vr WHERE vr.challenge_id = c.id AND vr.round_type = 'main'
    )
  LOOP
    main_round_id := gen_random_uuid();
    
    INSERT INTO "challenge_voting_rounds" (
      "id",
      "challenge_id",
      "round_type",
      "round_sequence",
      "status",
      "starts_at",
      "deadline",
      "stars_per_member",
      "created_at",
      "updated_at"
    ) VALUES (
      main_round_id,
      ch.id,
      'main',
      1,
      CASE WHEN ch.status::text = 'voting_open' THEN 'open'::voting_round_status ELSE 'closed'::voting_round_status END,
      COALESCE(ch.voting_starts_at, ch.created_at),
      ch.voting_deadline,
      COALESCE(ch.stars_per_member, 3),
      ch.created_at,
      now()
    );

    -- Link legacy MAIN ballots of this challenge to the main round
    UPDATE "challenge_ballots"
    SET "voting_round_id" = main_round_id
    WHERE "challenge_id" = ch.id 
      AND ("voting_round_id" IS NULL)
      AND ("round_type" = 'main' OR "round_type" IS NULL);

    -- Freeze submitted candidate entries into challenge_voting_round_candidates for main round
    FOR sub IN 
      SELECT id FROM "challenge_submissions" 
      WHERE "challenge_id" = ch.id AND "submission_status" = 'submitted'
    LOOP
      INSERT INTO "challenge_voting_round_candidates" ("id", "voting_round_id", "submission_id", "created_at")
      VALUES (gen_random_uuid(), main_round_id, sub.id, now())
      ON CONFLICT ("voting_round_id", "submission_id") DO NOTHING;
    END LOOP;

    -- Check if this challenge also has legacy TIEBREAK ballots or is currently in tiebreak_open
    IF EXISTS (
      SELECT 1 FROM "challenge_ballots" b 
      WHERE b.challenge_id = ch.id AND b.round_type = 'tiebreak'
    ) OR ch.status::text = 'tiebreak_open' THEN
      tiebreak_round_id := gen_random_uuid();

      INSERT INTO "challenge_voting_rounds" (
        "id",
        "challenge_id",
        "round_type",
        "round_sequence",
        "status",
        "starts_at",
        "deadline",
        "stars_per_member",
        "created_at",
        "updated_at"
      ) VALUES (
        tiebreak_round_id,
        ch.id,
        'tiebreak',
        2,
        CASE WHEN ch.status::text = 'tiebreak_open' THEN 'open'::voting_round_status ELSE 'closed'::voting_round_status END,
        COALESCE(ch.voting_deadline, now()),
        ch.voting_deadline,
        1,
        now(),
        now()
      );

      -- Link legacy TIEBREAK ballots of this challenge to the tiebreak round
      UPDATE "challenge_ballots"
      SET "voting_round_id" = tiebreak_round_id
      WHERE "challenge_id" = ch.id 
        AND ("voting_round_id" IS NULL)
        AND ("round_type" = 'tiebreak');

      -- Freeze candidate entries voted on in tiebreak ballots (or all submissions if none yet)
      FOR tb_sub IN 
        SELECT DISTINCT bs.submission_id 
        FROM "challenge_ballot_stars" bs
        INNER JOIN "challenge_ballots" b ON b.id = bs.ballot_id
        WHERE b.challenge_id = ch.id AND b.voting_round_id = tiebreak_round_id
      LOOP
        INSERT INTO "challenge_voting_round_candidates" ("id", "voting_round_id", "submission_id", "created_at")
        VALUES (gen_random_uuid(), tiebreak_round_id, tb_sub.submission_id, now())
        ON CONFLICT ("voting_round_id", "submission_id") DO NOTHING;
      END LOOP;
    END IF;

  END LOOP;
END $$;--> statement-breakpoint

-- Deterministically backfill award_type on challenge_results based on authoritative winner_slot_type
UPDATE "challenge_results" cr
SET "award_type" = CASE 
  WHEN ws.slot_type = 'jury_award' THEN 'jury_award'
  ELSE 'community_rank'
END
FROM "challenge_winner_slots" ws
WHERE cr.winner_slot_id = ws.id;--> statement-breakpoint

-- For results without winner_slot_id but having valid final_rank: community_rank
UPDATE "challenge_results"
SET "award_type" = 'community_rank'
WHERE "winner_slot_id" IS NULL AND "final_rank" IS NOT NULL;--> statement-breakpoint

-- Clean verified invalid legacy orphan rows where both winner_slot_id and final_rank are null
DELETE FROM "challenge_results"
WHERE "winner_slot_id" IS NULL AND "final_rank" IS NULL;