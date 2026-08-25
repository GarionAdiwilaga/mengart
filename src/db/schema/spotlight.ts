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
  },
  (table) => [
    uniqueIndex("uniq_monthly_spotlight_period").on(table.year, table.month),
    index("idx_spotlights_artist").on(table.artistProfileId),
  ]
);
