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
  new_round_id uuid;
  sub RECORD;
BEGIN
  FOR ch IN 
    SELECT c.id, c.status, c.stars_per_member, c.created_at, c.voting_deadline, c.voting_starts_at
    FROM "challenges" c
    LEFT JOIN "challenge_voting_rounds" vr ON vr.challenge_id = c.id AND vr.round_type = 'main'
    WHERE vr.id IS NULL
  LOOP
    new_round_id := gen_random_uuid();
    
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
      new_round_id,
      ch.id,
      'main',
      1,
      CASE WHEN ch.status = 'voting_open' THEN 'open'::voting_round_status ELSE 'closed'::voting_round_status END,
      COALESCE(ch.voting_starts_at, ch.created_at),
      ch.voting_deadline,
      COALESCE(ch.stars_per_member, 3),
      ch.created_at,
      now()
    );

    -- Link existing legacy ballots of this challenge to the newly created round
    UPDATE "challenge_ballots"
    SET "voting_round_id" = new_round_id
    WHERE "challenge_id" = ch.id AND ("voting_round_id" IS NULL);

    -- Freeze submitted candidate entries into challenge_voting_round_candidates
    FOR sub IN 
      SELECT id FROM "challenge_submissions" 
      WHERE "challenge_id" = ch.id AND "submission_status" = 'submitted'
    LOOP
      INSERT INTO "challenge_voting_round_candidates" ("id", "voting_round_id", "submission_id", "created_at")
      VALUES (gen_random_uuid(), new_round_id, sub.id, now())
      ON CONFLICT ("voting_round_id", "submission_id") DO NOTHING;
    END LOOP;
  END LOOP;
END $$;--> statement-breakpoint

-- Deterministically backfill award_type on challenge_results based on winner_slot_type
UPDATE "challenge_results" cr
SET "award_type" = CASE 
  WHEN ws.slot_type = 'jury_award' THEN 'jury_award'
  ELSE 'community_rank'
END
FROM "challenge_winner_slots" ws
WHERE cr.winner_slot_id = ws.id;--> statement-breakpoint

UPDATE "challenge_results"
SET "award_type" = 'jury_award'
WHERE "winner_slot_id" IS NULL AND "final_rank" IS NULL;