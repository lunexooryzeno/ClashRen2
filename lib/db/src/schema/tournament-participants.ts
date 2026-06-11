import { pgTable, serial, integer, timestamp, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { tournamentsTable } from "./tournaments";

export const tournamentParticipantsTable = pgTable("tournament_participants", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull().references(() => tournamentsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  slotIndex: integer("slot_index").notNull().default(0),
  kills: integer("kills").notNull().default(0),
  placement: integer("placement"),
  diamondsWon: integer("diamonds_won").notNull().default(0),
  isReady: boolean("is_ready").notNull().default(false),
  readyAt: timestamp("ready_at"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  waveNumber: integer("wave_number"),
  matchNumber: integer("match_number"),
  seatNumber: integer("seat_number"),
}, (table) => [
  uniqueIndex("tournament_participants_tournament_user_slot_idx").on(table.tournamentId, table.userId, table.slotIndex),
]);

export const insertTournamentParticipantSchema = createInsertSchema(tournamentParticipantsTable).omit({ id: true, joinedAt: true });
export type InsertTournamentParticipant = z.infer<typeof insertTournamentParticipantSchema>;
export type TournamentParticipant = typeof tournamentParticipantsTable.$inferSelect;
