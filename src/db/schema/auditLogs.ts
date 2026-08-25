import { pgTable, text, timestamp, uuid, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorIp: text("actor_ip"),
    action: text("action").notNull(), // invite_created, invite_revoked, submission_disqualified, star_invalidated, jury_assigned, results_revoked, role_changed
    targetType: text("target_type").notNull(), // invite, submission, ballot, challenge, user, artwork
    targetId: text("target_id").notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_audit_logs_actor_id").on(table.actorId),
    index("idx_audit_logs_action").on(table.action),
    index("idx_audit_logs_target").on(table.targetType, table.targetId),
    index("idx_audit_logs_created_at").on(table.createdAt),
  ]
);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: text("event_type").notNull(), // artwork_published, commission_opened, challenge_opened, challenge_results_published, spotlight_published
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    isPublic: boolean("is_public").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_activity_logs_event_type").on(table.eventType),
    index("idx_activity_logs_is_public").on(table.isPublic),
    index("idx_activity_logs_created_at").on(table.createdAt),
  ]
);
