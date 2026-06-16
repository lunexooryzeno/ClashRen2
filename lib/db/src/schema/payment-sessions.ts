import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const paymentSessionsTable = pgTable("payment_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  baseRupees: integer("base_rupees").notNull(),
  paisaOffset: integer("paisa_offset").notNull().default(0),
  diamonds: integer("diamonds").notNull(),
  status: text("status").notNull().default("active"), // active | completed | expired | cancelled
  expiresAt: timestamp("expires_at").notNull(),
  matchedTxnId: text("matched_txn_id"),
  matchedAmount: text("matched_amount"),
  topupRequestId: integer("topup_request_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PaymentSession = typeof paymentSessionsTable.$inferSelect;
