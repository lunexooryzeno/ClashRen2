import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const loginHistoryTable = pgTable("login_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  ip: text("ip"),
  userAgent: text("user_agent"),
  deviceId: text("device_id"),
  fingerprint: text("fingerprint"),
  method: text("method").notNull().default("otp"),
  isNewUser: boolean("is_new_user").notNull().default(false),
  country: text("country"),
  region: text("region"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type LoginHistory = typeof loginHistoryTable.$inferSelect;
