import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tournamentsTable = pgTable("tournaments", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  gameMode: text("game_mode").notNull(),
  entryFeeDiamonds: integer("entry_fee_diamonds").notNull().default(0),
  prizePoolDiamonds: integer("prize_pool_diamonds").notNull().default(0),
  maxSlots: integer("max_slots").notNull().default(100),
  filledSlots: integer("filled_slots").notNull().default(0),
  startTime: timestamp("start_time").notNull(),
  status: text("status").notNull().default("upcoming"),
  roomId: text("room_id"),
  roomPassword: text("room_password"),
  perKillDiamonds: integer("per_kill_diamonds").notNull().default(0),
  matchSlug: text("match_slug").unique(),
  imageUrl: text("image_url"),
  rules: text("rules"),
  description: text("description"),
  map: text("map"),
  region: text("region"),
  shortTitle: text("short_title"),
  statusLabel: text("status_label"),
  statusColor: text("status_color"),
  estimatedDuration: text("estimated_duration"),
  matchSettings: text("match_settings"),
  roomDirectLink: text("room_direct_link"),
  credentialsReleased: boolean("credentials_released").notNull().default(false),
  credentialsReleasedAt: timestamp("credentials_released_at"),
  credentialShareMode: text("credential_share_mode").notNull().default("both"),
  credentialUnlockMinutes: integer("credential_unlock_minutes"),
  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTournamentSchema = createInsertSchema(tournamentsTable).omit({ id: true, createdAt: true, filledSlots: true });
export type InsertTournament = z.infer<typeof insertTournamentSchema>;
export type Tournament = typeof tournamentsTable.$inferSelect;
