import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { tournamentsTable } from "./tournaments";

export const scheduledRewardsTable = pgTable("scheduled_rewards", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull().references(() => tournamentsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  reason: text("reason"),
  scheduledFor: timestamp("scheduled_for").notNull(),
  status: text("status").notNull().default("pending"),
  processedAt: timestamp("processed_at"),
  createdByAdminId: integer("created_by_admin_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ScheduledReward = typeof scheduledRewardsTable.$inferSelect;
