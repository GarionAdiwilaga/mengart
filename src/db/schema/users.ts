import { pgTable, text, timestamp, uuid, bigint, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", ["member", "moderator", "admin"]);
export const membershipStatusEnum = pgEnum("membership_status", ["active", "suspended", "deleted"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    username: text("username").unique(),
    googleId: text("google_id").unique(),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    role: userRoleEnum("role").default("member").notNull(),
    membershipStatus: membershipStatusEnum("membership_status"),
    storageQuotaBytes: bigint("storage_quota_bytes", { mode: "number" })
      .default(1073741824) // 1 GB default quota
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by"),
    deletionReason: text("deletion_reason"),
  },
  (table) => [
    uniqueIndex("uniq_users_lower_email").on(sql`lower(${table.email})`),
    index("idx_users_username").on(table.username),
    index("idx_users_google_id").on(table.googleId),
    index("idx_users_membership_status").on(table.membershipStatus),
  ]
);
