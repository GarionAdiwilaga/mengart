CREATE TYPE "public"."order_destination" AS ENUM('whatsapp', 'vgen', 'artistree', 'kofi', 'trakteer', 'custom_url');--> statement-breakpoint
CREATE TYPE "public"."pricing_type" AS ENUM('fixed', 'starting_from', 'range', 'contact_for_quote');--> statement-breakpoint
CREATE TYPE "public"."rule_type" AS ENUM('do', 'dont', 'general');--> statement-breakpoint
CREATE TYPE "public"."service_status" AS ENUM('draft', 'published', 'unavailable', 'hidden');--> statement-breakpoint
CREATE TABLE "commission_scope_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"rule_type" "rule_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_service_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"artwork_id" uuid NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"thumbnail_storage_key" text,
	"category" text DEFAULT 'Character Illustration' NOT NULL,
	"pricing_type" "pricing_type" DEFAULT 'starting_from' NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"min_price" numeric(12, 2),
	"max_price" numeric(12, 2),
	"min_turnaround_days" integer DEFAULT 3 NOT NULL,
	"max_turnaround_days" integer DEFAULT 14 NOT NULL,
	"included_revisions" integer DEFAULT 2 NOT NULL,
	"commercial_use_available" boolean DEFAULT false NOT NULL,
	"order_destination" "order_destination" DEFAULT 'whatsapp' NOT NULL,
	"custom_destination_url" text,
	"service_status" "service_status" DEFAULT 'draft' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "commission_scope_rules" ADD CONSTRAINT "commission_scope_rules_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_service_examples" ADD CONSTRAINT "commission_service_examples_service_id_commission_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."commission_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_service_examples" ADD CONSTRAINT "commission_service_examples_artwork_id_artworks_id_fk" FOREIGN KEY ("artwork_id") REFERENCES "public"."artworks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_services" ADD CONSTRAINT "commission_services_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_scope_rules_profile_id" ON "commission_scope_rules" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_scope_rules_type" ON "commission_scope_rules" USING btree ("rule_type");--> statement-breakpoint
CREATE INDEX "idx_service_examples_service_id" ON "commission_service_examples" USING btree ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_service_example" ON "commission_service_examples" USING btree ("service_id","artwork_id");--> statement-breakpoint
CREATE INDEX "idx_comm_services_profile_id" ON "commission_services" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_comm_services_status" ON "commission_services" USING btree ("service_status");--> statement-breakpoint
CREATE INDEX "idx_comm_services_category" ON "commission_services" USING btree ("category");