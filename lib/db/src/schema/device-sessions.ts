import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const deviceSessionsTable = pgTable("device_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  ip: text("ip"),
  userAgent: text("user_agent"),
  fingerprint: text("fingerprint"),
  deviceId: text("device_id"),
  isEmulator: boolean("is_emulator").notNull().default(false),
  emulatorSignals: text("emulator_signals"),
  androidVersion: text("android_version"),
  deviceType: text("device_type"),
  appVersion: text("app_version"),
  networkType: text("network_type"),
  country: text("country"),
  region: text("region"),
  language: text("language"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
});

export type DeviceSession = typeof deviceSessionsTable.$inferSelect;
