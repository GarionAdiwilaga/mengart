import { pgTable, text, timestamp, uuid, bigint, pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["member", "moderator", "admin"]);
export const membershipStatusEnum = pgEnum("membership_status", ["active", "suspended", "revoked"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  googleId: text("google_id").unique(),
  role: userRoleEnum("role").default("member").notNull(),
  membershipStatus: membershipStatusEnum("membership_status").default("active").notNull(),
  storageQuotaBytes: bigint("storage_quota_bytes", { mode: "number" })
    .default(1073741824) // 1 GB default quota
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: uuid("deleted_by"),
  deletionReason: text("deletion_reason"),
});
