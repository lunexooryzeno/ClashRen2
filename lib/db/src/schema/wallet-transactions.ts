import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { tournamentsTable } from "./tournaments";

export const walletTransactionsTable = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "topup" | "entry" | "prize" | "withdraw_refund"
  amount: integer("amount").notNull(), // positive = credit, negative = debit
  label: text("label").notNull(),
  /** "settled" = applied to balance; "pending" = locked prize awaiting finalization */
  status: text("status").notNull().default("settled"),
  /** Unique payout reference — used to enforce idempotent prize credits */
  payoutId: text("payout_id"),
  tournamentId: integer("tournament_id").references(() => tournamentsTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type WalletTransaction = typeof walletTransactionsTable.$inferSelect;
