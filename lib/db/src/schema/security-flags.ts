import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const securityFlagsTable = pgTable("security_flags", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  severity: text("severity").notNull().default("medium"),
  details: text("details"),
  relatedUserId: integer("related_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  ip: text("ip"),
  fingerprint: text("fingerprint"),
  autoAction: text("auto_action").notNull().default("none"),
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at"),
  resolvedByAdminId: integer("resolved_by_admin_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SecurityFlag = typeof securityFlagsTable.$inferSelect;
