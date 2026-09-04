import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  bigint,
  numeric,
  index,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { profiles } from "./profiles";

export const mediaTypeEnum = pgEnum("media_type", ["image", "video"]);
export const critiqueModeEnum = pgEnum("critique_mode", ["showcase_only", "open_for_critique"]);
export const audienceEnum = pgEnum("audience", ["public", "members_only", "unlisted", "private"]);
export const publicationStatusEnum = pgEnum("publication_status", [
  "draft",
  "processing",
  "ready",
  "published",
  "hidden",
  "processing_failed",
]);
export const processingStatusEnum = pgEnum("processing_status", [
  "pending",
  "processing",
  "ready",
  "failed",
]);

export const artworks = pgTable(
  "artworks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    mediaType: mediaTypeEnum("media_type").notNull(),
    critiqueMode: critiqueModeEnum("critique_mode").default("showcase_only").notNull(),
    audience: audienceEnum("audience").default("public").notNull(),
    publicationStatus: publicationStatusEnum("publication_status").default("draft").notNull(),
    isSpoiler: boolean("is_spoiler").default(false).notNull(),
    currentVersionId: uuid("current_version_id"),
    
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by"),
    deletionReason: text("deletion_reason"),
  },
  (table) => [
    index("idx_artworks_user_id").on(table.userId),
    index("idx_artworks_slug").on(table.slug),
    index("idx_artworks_status").on(table.publicationStatus),
    index("idx_artworks_audience").on(table.audience),
    index("idx_artworks_created_at").on(table.createdAt),
  ]
);

export const artworkVersions = pgTable(
  "artwork_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artworkId: uuid("artwork_id")
      .notNull()
      .references(() => artworks.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    mediaType: mediaTypeEnum("media_type").notNull(),
    
    // Storage keys
    masterStorageKey: text("master_storage_key").notNull(), // Protected clean version
    publicStorageKey: text("public_storage_key"), // Resolution-limited public WebP/MP4 derivative (no watermark)
    thumbnailStorageKey: text("thumbnail_storage_key"), // Grid thumbnail
    posterStorageKey: text("poster_storage_key"), // Video poster frame
    
    // File metadata
    mimeType: text("mime_type").notNull(),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).notNull(),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: numeric("duration_seconds", { precision: 8, scale: 2 }),
    frameCount: integer("frame_count"),
    checksumSha256: text("checksum_sha256").notNull(),
    
    // Async Worker processing status
    processingStatus: processingStatusEnum("processing_status").default("pending").notNull(),
    processingError: text("processing_error"),
    
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_artwork_versions_artwork_id").on(table.artworkId),
    index("idx_artwork_versions_status").on(table.processingStatus),
    uniqueIndex("uniq_artwork_version").on(table.artworkId, table.versionNumber),
  ]
);

export const portfolioEntries = pgTable(
  "portfolio_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    artworkId: uuid("artwork_id")
      .notNull()
      .references(() => artworks.id, { onDelete: "cascade" }),
    displayOrder: integer("display_order").default(0).notNull(),
    isPinned: boolean("is_pinned").default(false).notNull(),
    systemCaption: text("system_caption"),
    customCaption: text("custom_caption"),
    isVisible: boolean("is_visible").default(true).notNull(),
    
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_portfolio_profile_id").on(table.profileId),
    index("idx_portfolio_artwork_id").on(table.artworkId),
    uniqueIndex("uniq_profile_artwork").on(table.profileId, table.artworkId),
  ]
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
    category: text("category").default("custom").notNull(), // specialty, medium, software, genre, custom
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_tags_slug").on(table.slug), index("idx_tags_category").on(table.category)]
);

export const artworkTags = pgTable(
  "artwork_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artworkId: uuid("artwork_id")
      .notNull()
      .references(() => artworks.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_artwork_tags_artwork_id").on(table.artworkId),
    index("idx_artwork_tags_tag_id").on(table.tagId),
    uniqueIndex("uniq_artwork_tag").on(table.artworkId, table.tagId),
  ]
);
