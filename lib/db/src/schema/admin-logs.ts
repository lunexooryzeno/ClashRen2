import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const adminLogsTable = pgTable("admin_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  category: text("category").notNull().default("general"),
  details: text("details"),
  targetId: text("target_id"),
  targetType: text("target_type"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AdminLog = typeof adminLogsTable.$inferSelect;
