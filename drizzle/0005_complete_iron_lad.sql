CREATE TYPE "public"."ballot_round_type" AS ENUM('main', 'tiebreak');--> statement-breakpoint
CREATE TABLE "challenge_ballot_stars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ballot_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"stars_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_ballots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"round_type" "ballot_round_type" DEFAULT 'main' NOT NULL,
	"stars_allocated" integer DEFAULT 0 NOT NULL,
	"is_finalized" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_jury_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"jury_user_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"winner_slot_id" uuid,
	"score" integer,
	"critique_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"winner_slot_id" uuid,
	"final_rank" integer NOT NULL,
	"total_community_stars" integer DEFAULT 0 NOT NULL,
	"jury_score" numeric(5, 2),
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "challenge_ballot_stars" ADD CONSTRAINT "challenge_ballot_stars_ballot_id_challenge_ballots_id_fk" FOREIGN KEY ("ballot_id") REFERENCES "public"."challenge_ballots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_ballot_stars" ADD CONSTRAINT "challenge_ballot_stars_submission_id_challenge_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."challenge_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_ballots" ADD CONSTRAINT "challenge_ballots_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_ballots" ADD CONSTRAINT "challenge_ballots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_jury_scores" ADD CONSTRAINT "challenge_jury_scores_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_jury_scores" ADD CONSTRAINT "challenge_jury_scores_jury_user_id_users_id_fk" FOREIGN KEY ("jury_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_jury_scores" ADD CONSTRAINT "challenge_jury_scores_submission_id_challenge_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."challenge_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_jury_scores" ADD CONSTRAINT "challenge_jury_scores_winner_slot_id_challenge_winner_slots_id_fk" FOREIGN KEY ("winner_slot_id") REFERENCES "public"."challenge_winner_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_results" ADD CONSTRAINT "challenge_results_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_results" ADD CONSTRAINT "challenge_results_submission_id_challenge_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."challenge_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_results" ADD CONSTRAINT "challenge_results_winner_slot_id_challenge_winner_slots_id_fk" FOREIGN KEY ("winner_slot_id") REFERENCES "public"."challenge_winner_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ballot_stars_ballot_id" ON "challenge_ballot_stars" USING btree ("ballot_id");--> statement-breakpoint
CREATE INDEX "idx_ballot_stars_submission_id" ON "challenge_ballot_stars" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_ballot_submission_stars" ON "challenge_ballot_stars" USING btree ("ballot_id","submission_id");--> statement-breakpoint
CREATE INDEX "idx_ballots_challenge_id" ON "challenge_ballots" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "idx_ballots_user_id" ON "challenge_ballots" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_challenge_user_ballot" ON "challenge_ballots" USING btree ("challenge_id","user_id","round_type");--> statement-breakpoint
CREATE INDEX "idx_jury_scores_challenge_id" ON "challenge_jury_scores" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "idx_jury_scores_jury_user_id" ON "challenge_jury_scores" USING btree ("jury_user_id");--> statement-breakpoint
CREATE INDEX "idx_jury_scores_submission_id" ON "challenge_jury_scores" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_jury_submission_evaluation" ON "challenge_jury_scores" USING btree ("challenge_id","jury_user_id","submission_id");--> statement-breakpoint
CREATE INDEX "idx_results_challenge_id" ON "challenge_results" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "idx_results_submission_id" ON "challenge_results" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_challenge_result" ON "challenge_results" USING btree ("challenge_id","submission_id");