CREATE TYPE "public"."critique_aspect" AS ENUM('general', 'composition', 'color_lighting', 'anatomy_perspective', 'technique');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('ai_generated', 'nsfw_unmarked', 'harassment', 'copyright_infringement', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."report_target_type" AS ENUM('artwork', 'comment', 'user', 'challenge_submission');--> statement-breakpoint
CREATE TABLE "critique_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artwork_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"critique_aspect" "critique_aspect" DEFAULT 'general' NOT NULL,
	"content" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"target_type" "report_target_type" NOT NULL,
	"target_id" text NOT NULL,
	"reason" "report_reason" NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"resolved_by_user_id" uuid,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "monthly_spotlights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"artist_profile_id" uuid NOT NULL,
	"featured_artwork_id" uuid,
	"curator_quote" text NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "critique_comments" ADD CONSTRAINT "critique_comments_artwork_id_artworks_id_fk" FOREIGN KEY ("artwork_id") REFERENCES "public"."artworks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "critique_comments" ADD CONSTRAINT "critique_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "critique_comments" ADD CONSTRAINT "critique_comments_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_spotlights" ADD CONSTRAINT "monthly_spotlights_artist_profile_id_profiles_id_fk" FOREIGN KEY ("artist_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_spotlights" ADD CONSTRAINT "monthly_spotlights_featured_artwork_id_artworks_id_fk" FOREIGN KEY ("featured_artwork_id") REFERENCES "public"."artworks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_critique_artwork_id" ON "critique_comments" USING btree ("artwork_id");--> statement-breakpoint
CREATE INDEX "idx_critique_user_id" ON "critique_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_critique_parent_id" ON "critique_comments" USING btree ("parent_comment_id");--> statement-breakpoint
CREATE INDEX "idx_reports_target" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_reports_status" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_monthly_spotlight_period" ON "monthly_spotlights" USING btree ("year","month");--> statement-breakpoint
CREATE INDEX "idx_spotlights_artist" ON "monthly_spotlights" USING btree ("artist_profile_id");