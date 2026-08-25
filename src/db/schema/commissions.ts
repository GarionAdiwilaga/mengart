import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  numeric,
  index,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { artworks } from "./artworks";

export const pricingTypeEnum = pgEnum("pricing_type", [
  "fixed",
  "starting_from",
  "range",
  "contact_for_quote",
]);

export const orderDestinationEnum = pgEnum("order_destination", [
  "whatsapp",
  "vgen",
  "artistree",
  "kofi",
  "trakteer",
  "custom_url",
]);

export const serviceStatusEnum = pgEnum("service_status", [
  "draft",
  "published",
  "unavailable",
  "hidden",
]);

export const ruleTypeEnum = pgEnum("rule_type", ["do", "dont", "general"]);

export const commissionServices = pgTable(
  "commission_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    thumbnailStorageKey: text("thumbnail_storage_key"),
    category: text("category").default("Character Illustration").notNull(),
    
    // Pricing
    pricingType: pricingTypeEnum("pricing_type").default("starting_from").notNull(),
    currency: text("currency").default("IDR").notNull(),
    minPrice: numeric("min_price", { precision: 12, scale: 2 }),
    maxPrice: numeric("max_price", { precision: 12, scale: 2 }),
    
    // Turnaround & terms
    minTurnaroundDays: integer("min_turnaround_days").default(3).notNull(),
    maxTurnaroundDays: integer("max_turnaround_days").default(14).notNull(),
    includedRevisions: integer("included_revisions").default(2).notNull(),
    commercialUseAvailable: boolean("commercial_use_available").default(false).notNull(),
    
    // Order Destination & Referral
    orderDestination: orderDestinationEnum("order_destination").default("whatsapp").notNull(),
    customDestinationUrl: text("custom_destination_url"),
    
    // Service state
    serviceStatus: serviceStatusEnum("service_status").default("draft").notNull(),
    displayOrder: integer("display_order").default(0).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_comm_services_profile_id").on(table.profileId),
    index("idx_comm_services_status").on(table.serviceStatus),
    index("idx_comm_services_category").on(table.category),
  ]
);

export const commissionServiceExamples = pgTable(
  "commission_service_examples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => commissionServices.id, { onDelete: "cascade" }),
    artworkId: uuid("artwork_id")
      .notNull()
      .references(() => artworks.id, { onDelete: "cascade" }),
    displayOrder: integer("display_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_service_examples_service_id").on(table.serviceId),
    uniqueIndex("uniq_service_example").on(table.serviceId, table.artworkId),
  ]
);

export const commissionScopeRules = pgTable(
  "commission_scope_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    ruleType: ruleTypeEnum("rule_type").notNull(), // 'do', 'dont', 'general'
    title: text("title").notNull(),
    description: text("description"),
    displayOrder: integer("display_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_scope_rules_profile_id").on(table.profileId),
    index("idx_scope_rules_type").on(table.ruleType),
  ]
);
