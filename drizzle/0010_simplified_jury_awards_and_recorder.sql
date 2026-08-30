ALTER TABLE "challenge_jury_assignments" ADD COLUMN "is_recorder" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_challenge_jury_recorder" ON "challenge_jury_assignments" USING btree ("challenge_id") WHERE ("is_recorder" = true);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "challenge_jury_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"category_label" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "challenge_results" ADD COLUMN IF NOT EXISTS "category_label" text;
--> statement-breakpoint
ALTER TABLE "challenge_results" ADD COLUMN IF NOT EXISTS "jury_award_id" uuid;
--> statement-breakpoint
ALTER TABLE "challenge_results" ADD COLUMN IF NOT EXISTS "recorded_by_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "challenge_jury_awards" ADD CONSTRAINT "challenge_jury_awards_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "challenge_jury_awards" ADD CONSTRAINT "challenge_jury_awards_submission_id_challenge_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."challenge_submissions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "challenge_jury_awards" ADD CONSTRAINT "challenge_jury_awards_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "challenge_results" ADD CONSTRAINT "challenge_results_jury_award_id_challenge_jury_awards_id_fk" FOREIGN KEY ("jury_award_id") REFERENCES "public"."challenge_jury_awards"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "challenge_results" ADD CONSTRAINT "challenge_results_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jury_awards_challenge_id" ON "challenge_jury_awards" USING btree ("challenge_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jury_awards_submission_id" ON "challenge_jury_awards" USING btree ("submission_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jury_awards_recorder_id" ON "challenge_jury_awards" USING btree ("recorded_by_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_results_jury_award_id" ON "challenge_results" USING btree ("jury_award_id");
--> statement-breakpoint
DROP INDEX IF EXISTS "uniq_challenge_result";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_challenge_result_jury_award" ON "challenge_results" USING btree ("jury_award_id") WHERE ("jury_award_id" IS NOT NULL);
--> statement-breakpoint
UPDATE "challenge_results" cr
SET "category_label" = cws."title"
FROM "challenge_winner_slots" cws
WHERE cr."winner_slot_id" = cws."id"
  AND cr."award_type" = 'jury_award'
  AND cr."category_label" IS NULL;
