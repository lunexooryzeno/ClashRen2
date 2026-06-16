import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const freefireApiKeysTable = pgTable("freefire_api_keys", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  label: text("label").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  requestCount: integer("request_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
});

export type FreefireApiKey = typeof freefireApiKeysTable.$inferSelect;
