import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const otpSessionsTable = pgTable("otp_sessions", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull(),
  otpCode: text("otp_code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  verified: integer("verified").notNull().default(0),
  antcloudSession: text("antcloud_session"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type OtpSession = typeof otpSessionsTable.$inferSelect;
