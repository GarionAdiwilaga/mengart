export * from "./users";
export * from "./authTokens";
export * from "./invites";
export * from "./profiles";
export * from "./artworks";
export * from "./challenges";
export * from "./ballots";
export * from "./critiques";
export * from "./moderation";
export * from "./spotlight";
export * from "./commissions";
export * from "./badges";
export * from "./notifications";
export * from "./auditLogs";

import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Base system configuration / meta table
export const systemMeta = pgTable("system_meta", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
