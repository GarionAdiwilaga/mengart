import { pgTable, text, timestamp, uuid, boolean, integer, jsonb, index, pgEnum } from "drizzle-orm/pg-core";
import { users } from "./users";

export const profileStatusEnum = pgEnum("profile_status", [
  "incomplete",
  "active_public",
  "active_hidden",
  "suspended",
  "deleted",
]);

export const commissionStatusEnum = pgEnum("commission_status", [
  "open",
  "closed",
  "waitlist",
]);

export const contactPreferenceEnum = pgEnum("contact_preference", [
  "public_wa",
  "members_wa",
  "no_wa",
  "external_only",
]);

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    bannerUrl: text("banner_url"),
    bio: text("bio"),
    location: text("location"),
    languages: jsonb("languages").$type<string[]>().default([]).notNull(),
    specialties: jsonb("specialties").$type<string[]>().default([]).notNull(),
    software: jsonb("software").$type<string[]>().default([]).notNull(),
    
    // Commission settings
    commissionStatus: commissionStatusEnum("commission_status").default("closed").notNull(),
    waitlistCurrentSlots: integer("waitlist_current_slots").default(0).notNull(),
    waitlistMaxSlots: integer("waitlist_max_slots"),
    
    // Contact & WhatsApp consent
    contactPreference: contactPreferenceEnum("contact_preference").default("no_wa").notNull(),
    whatsappNumber: text("whatsapp_number"),
    waConsentGiven: boolean("wa_consent_given").default(false).notNull(),

    // Profile lifecycle
    profileStatus: profileStatusEnum("profile_status").default("incomplete").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_profiles_user_id").on(table.userId),
    index("idx_profiles_slug").on(table.slug),
    index("idx_profiles_status").on(table.profileStatus),
    index("idx_profiles_commission_status").on(table.commissionStatus),
  ]
);

export const profileSlugRedirects = pgTable(
  "profile_slug_redirects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    oldSlug: text("old_slug").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_slug_redirects_old_slug").on(table.oldSlug)]
);

export const externalLinks = pgTable(
  "external_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // instagram, x, pixiv, artstation, vgen, artistree, kofi, trakteer, custom
    label: text("label").notNull(),
    url: text("url").notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_external_links_profile_id").on(table.profileId)]
);
