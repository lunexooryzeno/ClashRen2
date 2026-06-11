import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const withdrawalRequestsTable = pgTable("withdrawal_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  rupees: integer("rupees").notNull(),
  diamondsRedeemed: integer("diamonds_redeemed").notNull(),
  upiId: text("upi_id").notNull(),
  status: text("status").notNull().default("pending"),
  rejectedReason: text("rejected_reason"),
  note: text("note"),
  paidAt: timestamp("paid_at"),
  rejectedAt: timestamp("rejected_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type WithdrawalRequest = typeof withdrawalRequestsTable.$inferSelect;
