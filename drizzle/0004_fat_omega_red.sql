CREATE TYPE "public"."award_mode" AS ENUM('vote_only', 'jury_only', 'vote_and_jury', 'showcase_only');--> statement-breakpoint
CREATE TYPE "public"."challenge_status" AS ENUM('draft', 'scheduled', 'submission_open', 'submission_locked', 'voting_open', 'tiebreak_open', 'jury_selection_open', 'review', 'finished', 'paused', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."slot_type" AS ENUM('community_vote', 'jury_award');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('draft', 'submitted', 'disqualified', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."tie_strategy" AS ENUM('tiebreak_round', 'manual');--> statement-breakpoint
CREATE TABLE "challenge_jury_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" uuid
);
--> statement-breakpoint
CREATE TABLE "challenge_kit_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_storage_key" text NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"mime_type" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_submission_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"software_used" text,
	"artwork_version_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"current_version_id" uuid,
	"submission_status" "submission_status" DEFAULT 'submitted' NOT NULL,
	"disqualification_reason" text,
	"disqualified_by" uuid,
	"disqualified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_winner_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"slot_type" "slot_type" NOT NULL,
	"rank" integer NOT NULL,
	"title" text NOT NULL,
	"badge_id" uuid,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"theme" text NOT NULL,
	"description" text NOT NULL,
	"prompt_rules" text NOT NULL,
	"banner_url" text,
	"status" "challenge_status" DEFAULT 'draft' NOT NULL,
	"paused_previous_status" "challenge_status",
	"cancellation_reason" text,
	"is_visible" boolean DEFAULT true NOT NULL,
	"award_mode" "award_mode" DEFAULT 'vote_and_jury' NOT NULL,
	"tie_strategy" "tie_strategy" DEFAULT 'tiebreak_round' NOT NULL,
	"stars_per_member" integer DEFAULT 3 NOT NULL,
	"quorum_requirement" integer DEFAULT 0 NOT NULL,
	"max_submissions_per_artist" integer DEFAULT 1 NOT NULL,
	"allow_revisions" boolean DEFAULT true NOT NULL,
	"submission_starts_at" timestamp with time zone,
	"submission_deadline" timestamp with time zone,
	"voting_starts_at" timestamp with time zone,
	"voting_deadline" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "challenges_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "challenge_jury_assignments" ADD CONSTRAINT "challenge_jury_assignments_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_jury_assignments" ADD CONSTRAINT "challenge_jury_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_jury_assignments" ADD CONSTRAINT "challenge_jury_assignments_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_jury_assignments" ADD CONSTRAINT "challenge_jury_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_kit_files" ADD CONSTRAINT "challenge_kit_files_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_submission_versions" ADD CONSTRAINT "challenge_submission_versions_submission_id_challenge_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."challenge_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_submission_versions" ADD CONSTRAINT "challenge_submission_versions_artwork_version_id_artwork_versions_id_fk" FOREIGN KEY ("artwork_version_id") REFERENCES "public"."artwork_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_submissions" ADD CONSTRAINT "challenge_submissions_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_submissions" ADD CONSTRAINT "challenge_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_submissions" ADD CONSTRAINT "challenge_submissions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_submissions" ADD CONSTRAINT "challenge_submissions_disqualified_by_users_id_fk" FOREIGN KEY ("disqualified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_winner_slots" ADD CONSTRAINT "challenge_winner_slots_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_winner_slots" ADD CONSTRAINT "challenge_winner_slots_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_jury_challenge_id" ON "challenge_jury_assignments" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "idx_jury_user_id" ON "challenge_jury_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_challenge_jury" ON "challenge_jury_assignments" USING btree ("challenge_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_challenge_kit_challenge_id" ON "challenge_kit_files" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "idx_submission_versions_submission_id" ON "challenge_submission_versions" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_submission_version" ON "challenge_submission_versions" USING btree ("submission_id","version_number");--> statement-breakpoint
CREATE INDEX "idx_submissions_challenge_id" ON "challenge_submissions" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "idx_submissions_user_id" ON "challenge_submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_submissions_status" ON "challenge_submissions" USING btree ("submission_status");--> statement-breakpoint
CREATE INDEX "idx_winner_slots_challenge_id" ON "challenge_winner_slots" USING btree ("challenge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_challenge_slot" ON "challenge_winner_slots" USING btree ("challenge_id","slot_type","rank");--> statement-breakpoint
CREATE INDEX "idx_challenges_slug" ON "challenges" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_challenges_status" ON "challenges" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_challenges_deadlines" ON "challenges" USING btree ("submission_deadline","voting_deadline");