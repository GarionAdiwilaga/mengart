import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { profiles } from "./profiles";
import { artworks } from "./artworks";

export const critiqueAspectEnum = pgEnum("critique_aspect", [
  "general",
  "composition",
  "color_lighting",
  "anatomy_perspective",
  "technique",
]);

export const critiqueComments = pgTable(
  "critique_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artworkId: uuid("artwork_id")
      .notNull()
      .references(() => artworks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    parentCommentId: uuid("parent_comment_id"),
    critiqueAspect: critiqueAspectEnum("critique_aspect").default("general").notNull(),
    content: text("content").notNull(),
    isPinned: boolean("is_pinned").default(false).notNull(),
    isResolved: boolean("is_resolved").default(false).notNull(),
    isEdited: boolean("is_edited").default(false).notNull(),
    isHidden: boolean("is_hidden").default(false).notNull(),
    hiddenBy: uuid("hidden_by").references(() => users.id, { onDelete: "set null" }),
    hiddenReason: text("hidden_reason"),
    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
    deletionReason: text("deletion_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_critique_artwork_id").on(table.artworkId),
    index("idx_critique_user_id").on(table.userId),
    index("idx_critique_parent_id").on(table.parentCommentId),
    index("idx_critique_is_hidden").on(table.isHidden),
  ]
);
