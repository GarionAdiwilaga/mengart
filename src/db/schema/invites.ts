import { pgTable, text, timestamp, uuid, integer, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const membershipInvites = pgTable(
  "membership_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    tokenPrefix: text("token_prefix").notNull(), // Short preview for admin dashboard (e.g. "inv_8f9a..")
    label: text("label"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    maxUses: integer("max_uses"), // null = unlimited uses
    usesCount: integer("uses_count").default(0).notNull(),
    createdBy: uuid("created_by")
      .references(() => users.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by")
      .references(() => users.id, { onDelete: "set null" }),
    revocationReason: text("revocation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_invites_token_hash").on(table.tokenHash),
    index("idx_invites_created_by").on(table.createdBy),
  ]
);

export const inviteRedemptions = pgTable(
  "invite_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inviteId: uuid("invite_id")
      .notNull()
      .references(() => membershipInvites.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("idx_redemptions_invite_id").on(table.inviteId),
    index("idx_redemptions_user_id").on(table.userId),
  ]
);
