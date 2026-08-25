import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Base system settings table as Phase 0 verification schema
export const systemMeta = pgTable("system_meta", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
