CREATE TABLE IF NOT EXISTS "site_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
ALTER TABLE "critique_comments" ADD COLUMN IF NOT EXISTS "is_edited" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "critique_comments" ADD COLUMN IF NOT EXISTS "is_hidden" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "critique_comments" ADD COLUMN IF NOT EXISTS "hidden_by" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "critique_comments" ADD CONSTRAINT "critique_comments_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "critique_comments" ADD COLUMN IF NOT EXISTS "hidden_reason" text;
--> statement-breakpoint
ALTER TABLE "critique_comments" ADD COLUMN IF NOT EXISTS "deleted_by" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "critique_comments" ADD CONSTRAINT "critique_comments_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "critique_comments" ADD COLUMN IF NOT EXISTS "deletion_reason" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_critique_is_hidden" ON "critique_comments" USING btree ("is_hidden");
--> statement-breakpoint
ALTER TABLE "monthly_spotlights" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "monthly_spotlights" ADD COLUMN IF NOT EXISTS "deleted_by" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monthly_spotlights" ADD CONSTRAINT "monthly_spotlights_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "monthly_spotlights" ADD COLUMN IF NOT EXISTS "deletion_reason" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_spotlights_deleted_at" ON "monthly_spotlights" USING btree ("deleted_at");
--> statement-breakpoint
DROP INDEX IF EXISTS "uniq_monthly_spotlight_period";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_monthly_spotlight_active_period" ON "monthly_spotlights" USING btree ("year","month") WHERE "deleted_at" IS NULL;
