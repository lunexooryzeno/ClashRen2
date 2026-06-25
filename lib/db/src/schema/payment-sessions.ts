import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { topupRequestsTable } from "./topup-requests";

export const paymentSessionsTable = pgTable("payment_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  baseAmount: numeric("base_amount", { precision: 10, scale: 2 }).notNull(),
  finalAmount: numeric("final_amount", { precision: 10, scale: 2 }).notNull(),
  diamonds: integer("diamonds").notNull(),
  status: text("status").notNull().default("pending"),
  topupRequestId: integer("topup_request_id").references(() => topupRequestsTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export type PaymentSession = typeof paymentSessionsTable.$inferSelect;
