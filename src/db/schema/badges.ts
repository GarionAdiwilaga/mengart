import { pgTable, text, timestamp, uuid, index, uniqueIndex, pgEnum } from "drizzle-orm/pg-core";
import { users } from "./users";
import { profiles } from "./profiles";

export const badgeTypeEnum = pgEnum("badge_type", ["system", "admin"]);

export const badges = pgTable(
  "badges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
    description: text("description").notNull(),
    icon: text("icon").notNull(),
    badgeType: badgeTypeEnum("badge_type").default("system").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_badges_slug").on(table.slug)]
);

export const profileBadges = pgTable(
  "profile_badges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    badgeId: uuid("badge_id")
      .notNull()
      .references(() => badges.id, { onDelete: "cascade" }),
    awardedBy: uuid("awarded_by")
      .references(() => users.id, { onDelete: "set null" }),
    awardedReason: text("awarded_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_profile_badges_profile_id").on(table.profileId),
    index("idx_profile_badges_badge_id").on(table.badgeId),
    uniqueIndex("uniq_profile_badge").on(table.profileId, table.badgeId),
  ]
);
