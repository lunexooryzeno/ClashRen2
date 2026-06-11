import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  inGameName: text("in_game_name"),
  uid: text("uid"),
  profilePicture: text("profile_picture"),
  diamondBalance: integer("diamond_balance").notNull().default(100),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  status: text("status").notNull().default("active"),
  blockedAt: timestamp("blocked_at"),
  blockedReason: text("blocked_reason"),
  blockedUntil: timestamp("blocked_until"),
  deletedAt: timestamp("deleted_at"),
  deleteReason: text("delete_reason"),
  lastSeenAt: timestamp("last_seen_at"),
  sessionVersion: integer("session_version").notNull().default(1),
  theme: text("theme"),
  twoFaEnabled: boolean("two_fa_enabled").notNull().default(false),
  twoFaEmail: text("two_fa_email"),
  twoFaPassword: text("two_fa_password"),
  twoFaPending: boolean("two_fa_pending").notNull().default(false),
  twoFaPendingPassword: text("two_fa_pending_password"),
  twoFaPendingAt: timestamp("two_fa_pending_at"),
  tournamentBanned: boolean("tournament_banned").notNull().default(false),
  tournamentBannedAt: timestamp("tournament_banned_at"),
  tournamentBannedUntil: timestamp("tournament_banned_until"),
  withdrawalBanned: boolean("withdrawal_banned").notNull().default(false),
  withdrawalBannedAt: timestamp("withdrawal_banned_at"),
  topupBanned: boolean("topup_banned").notNull().default(false),
  topupBannedAt: timestamp("topup_banned_at"),
  chatMuted: boolean("chat_muted").notNull().default(false),
  chatMutedAt: timestamp("chat_muted_at"),
  chatMutedUntil: timestamp("chat_muted_until"),
  walletFrozen: boolean("wallet_frozen").notNull().default(false),
  walletFrozenAt: timestamp("wallet_frozen_at"),
  allowDepositWithdrawal: boolean("allow_deposit_withdrawal").notNull().default(false),
  minWithdrawal: integer("min_withdrawal"),
  minTopup: integer("min_topup"),
  nameChangedAt: timestamp("name_changed_at"),
  nameChangeAllowed: boolean("name_change_allowed").notNull().default(false),
  twoFaResetAt: timestamp("two_fa_reset_at"),
  twoFaWithdrawalBypass: boolean("two_fa_withdrawal_bypass").notNull().default(false),
  platformId: text("platform_id").unique(),
  adminRole: text("admin_role"),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
