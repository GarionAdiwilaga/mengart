import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { profiles } from "./profiles";
import { artworks } from "./artworks";

export const monthlySpotlights = pgTable(
  "monthly_spotlights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    year: integer("year").notNull(),
    month: integer("month").notNull(), // 1 - 12
    artistProfileId: uuid("artist_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    featuredArtworkId: uuid("featured_artwork_id").references(() => artworks.id, {
      onDelete: "set null",
    }),
    curatorQuote: text("curator_quote").notNull(),
    isPublished: boolean("is_published").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
    deletionReason: text("deletion_reason"),
  },
  (table) => [
    uniqueIndex("uniq_monthly_spotlight_active_period")
      .on(table.year, table.month)
      .where(sql`"deleted_at" IS NULL`),
    index("idx_spotlights_artist").on(table.artistProfileId),
    index("idx_spotlights_deleted_at").on(table.deletedAt),
  ]
);
