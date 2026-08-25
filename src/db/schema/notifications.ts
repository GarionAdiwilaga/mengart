import { pgTable, text, timestamp, uuid, boolean, index, pgEnum } from "drizzle-orm/pg-core";
import { users } from "./users";

export const notificationPriorityEnum = pgEnum("notification_priority", ["normal", "high", "critical"]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // comment, critique, moderation, star_returned, challenge_deadline, jury_assigned, spotlight
    title: text("title").notNull(),
    body: text("body").notNull(),
    targetType: text("target_type"), // artwork, submission, challenge, report, comment
    targetId: text("target_id"),
    actionUrl: text("action_url"),
    isRead: boolean("is_read").default(false).notNull(),
    priority: notificationPriorityEnum("priority").default("normal").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_notifications_user_id").on(table.userId),
    index("idx_notifications_is_read").on(table.isRead),
    index("idx_notifications_created_at").on(table.createdAt),
  ]
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    allowAppreciationComments: boolean("allow_appreciation_comments").default(true).notNull(),
    allowCritique: boolean("allow_critique").default(true).notNull(),
    allowChallengeUpdates: boolean("allow_challenge_updates").default(true).notNull(),
    allowJuryUpdates: boolean("allow_jury_updates").default(true).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_notification_prefs_user_id").on(table.userId)]
);
