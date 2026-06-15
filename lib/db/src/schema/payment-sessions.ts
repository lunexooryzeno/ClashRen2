import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { topupRequestsTable } from "./topup-requests";

export const paymentSessionsTable = pgTable("payment_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  baseRupees: integer("base_rupees").notNull(),
  offsetPaise: integer("offset_paise").notNull().default(0),
  expiresAt: timestamp("expires_at").notNull(),
  status: text("status").notNull().default("active"),
  topupRequestId: integer("topup_request_id").references(() => topupRequestsTable.id, { onDelete: "set null" }),
  bharatpeTxnId: text("bharatpe_txn_id").unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PaymentSession = typeof paymentSessionsTable.$inferSelect;
