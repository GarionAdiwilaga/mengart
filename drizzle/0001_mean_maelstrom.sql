CREATE TYPE "public"."membership_status" AS ENUM('active', 'suspended', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('member', 'moderator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('open', 'closed', 'waitlist');--> statement-breakpoint
CREATE TYPE "public"."contact_preference" AS ENUM('public_wa', 'members_wa', 'no_wa', 'external_only');--> statement-breakpoint
CREATE TYPE "public"."profile_status" AS ENUM('incomplete', 'active_public', 'active_hidden', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."audience" AS ENUM('public', 'members_only', 'unlisted', 'private');--> statement-breakpoint
CREATE TYPE "public"."critique_mode" AS ENUM('showcase_only', 'open_for_critique');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('image', 'gif', 'video');--> statement-breakpoint
CREATE TYPE "public"."processing_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('draft', 'processing', 'ready', 'published', 'hidden', 'processing_failed');--> statement-breakpoint
CREATE TYPE "public"."badge_type" AS ENUM('system', 'admin');--> statement-breakpoint
CREATE TYPE "public"."notification_priority" AS ENUM('normal', 'high', 'critical');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"google_id" text,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"membership_status" "membership_status" DEFAULT 'active' NOT NULL,
	"storage_quota_bytes" bigint DEFAULT 1073741824 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deletion_reason" text,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
CREATE TABLE "invite_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invite_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "membership_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"label" text,
	"expires_at" timestamp with time zone,
	"max_uses" integer,
	"uses_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "external_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_slug_redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"old_slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_slug_redirects_old_slug_unique" UNIQUE("old_slug")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"banner_url" text,
	"bio" text,
	"location" text,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"specialties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"software" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"commission_status" "commission_status" DEFAULT 'closed' NOT NULL,
	"waitlist_current_slots" integer DEFAULT 0 NOT NULL,
	"waitlist_max_slots" integer,
	"contact_preference" "contact_preference" DEFAULT 'no_wa' NOT NULL,
	"whatsapp_number" text,
	"wa_consent_given" boolean DEFAULT false NOT NULL,
	"profile_status" "profile_status" DEFAULT 'incomplete' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "profiles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "artwork_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artwork_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artwork_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artwork_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"media_type" "media_type" NOT NULL,
	"master_storage_key" text NOT NULL,
	"public_storage_key" text,
	"thumbnail_storage_key" text,
	"poster_storage_key" text,
	"mime_type" text NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"duration_seconds" numeric(8, 2),
	"frame_count" integer,
	"checksum_sha256" text NOT NULL,
	"processing_status" "processing_status" DEFAULT 'pending' NOT NULL,
	"processing_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artworks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"media_type" "media_type" NOT NULL,
	"critique_mode" "critique_mode" DEFAULT 'showcase_only' NOT NULL,
	"audience" "audience" DEFAULT 'public' NOT NULL,
	"publication_status" "publication_status" DEFAULT 'draft' NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deletion_reason" text,
	CONSTRAINT "artworks_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "portfolio_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"artwork_id" uuid NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"custom_caption" text,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category" text DEFAULT 'custom' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name"),
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"icon" text NOT NULL,
	"badge_type" "badge_type" DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "badges_name_unique" UNIQUE("name"),
	CONSTRAINT "badges_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "profile_badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"badge_id" uuid NOT NULL,
	"awarded_by" uuid,
	"awarded_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"allow_appreciation_comments" boolean DEFAULT true NOT NULL,
	"allow_critique" boolean DEFAULT true NOT NULL,
	"allow_challenge_updates" boolean DEFAULT true NOT NULL,
	"allow_jury_updates" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"action_url" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"priority" "notification_priority" DEFAULT 'normal' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_ip" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_invite_id_membership_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."membership_invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_invites" ADD CONSTRAINT "membership_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_invites" ADD CONSTRAINT "membership_invites_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_links" ADD CONSTRAINT "external_links_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_slug_redirects" ADD CONSTRAINT "profile_slug_redirects_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artwork_tags" ADD CONSTRAINT "artwork_tags_artwork_id_artworks_id_fk" FOREIGN KEY ("artwork_id") REFERENCES "public"."artworks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artwork_tags" ADD CONSTRAINT "artwork_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artwork_versions" ADD CONSTRAINT "artwork_versions_artwork_id_artworks_id_fk" FOREIGN KEY ("artwork_id") REFERENCES "public"."artworks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artworks" ADD CONSTRAINT "artworks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_entries" ADD CONSTRAINT "portfolio_entries_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_entries" ADD CONSTRAINT "portfolio_entries_artwork_id_artworks_id_fk" FOREIGN KEY ("artwork_id") REFERENCES "public"."artworks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_badges" ADD CONSTRAINT "profile_badges_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_badges" ADD CONSTRAINT "profile_badges_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_badges" ADD CONSTRAINT "profile_badges_awarded_by_users_id_fk" FOREIGN KEY ("awarded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_redemptions_invite_id" ON "invite_redemptions" USING btree ("invite_id");--> statement-breakpoint
CREATE INDEX "idx_redemptions_user_id" ON "invite_redemptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_invites_token_hash" ON "membership_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_invites_created_by" ON "membership_invites" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_external_links_profile_id" ON "external_links" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_slug_redirects_old_slug" ON "profile_slug_redirects" USING btree ("old_slug");--> statement-breakpoint
CREATE INDEX "idx_profiles_user_id" ON "profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_profiles_slug" ON "profiles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_profiles_status" ON "profiles" USING btree ("profile_status");--> statement-breakpoint
CREATE INDEX "idx_profiles_commission_status" ON "profiles" USING btree ("commission_status");--> statement-breakpoint
CREATE INDEX "idx_artwork_tags_artwork_id" ON "artwork_tags" USING btree ("artwork_id");--> statement-breakpoint
CREATE INDEX "idx_artwork_tags_tag_id" ON "artwork_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_artwork_tag" ON "artwork_tags" USING btree ("artwork_id","tag_id");--> statement-breakpoint
CREATE INDEX "idx_artwork_versions_artwork_id" ON "artwork_versions" USING btree ("artwork_id");--> statement-breakpoint
CREATE INDEX "idx_artwork_versions_status" ON "artwork_versions" USING btree ("processing_status");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_artwork_version" ON "artwork_versions" USING btree ("artwork_id","version_number");--> statement-breakpoint
CREATE INDEX "idx_artworks_user_id" ON "artworks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_artworks_slug" ON "artworks" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_artworks_status" ON "artworks" USING btree ("publication_status");--> statement-breakpoint
CREATE INDEX "idx_artworks_audience" ON "artworks" USING btree ("audience");--> statement-breakpoint
CREATE INDEX "idx_artworks_created_at" ON "artworks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_portfolio_profile_id" ON "portfolio_entries" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_portfolio_artwork_id" ON "portfolio_entries" USING btree ("artwork_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_profile_artwork" ON "portfolio_entries" USING btree ("profile_id","artwork_id");--> statement-breakpoint
CREATE INDEX "idx_tags_slug" ON "tags" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_tags_category" ON "tags" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_badges_slug" ON "badges" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_profile_badges_profile_id" ON "profile_badges" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_profile_badges_badge_id" ON "profile_badges" USING btree ("badge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_profile_badge" ON "profile_badges" USING btree ("profile_id","badge_id");--> statement-breakpoint
CREATE INDEX "idx_notification_prefs_user_id" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_id" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_is_read" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "idx_notifications_created_at" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_activity_logs_event_type" ON "activity_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_activity_logs_is_public" ON "activity_logs" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "idx_activity_logs_created_at" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_actor_id" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_action" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_target" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" USING btree ("created_at");