import { pgTable, serial, integer, text, boolean, timestamp, unique, jsonb } from "drizzle-orm/pg-core";
import { tournamentsTable } from "./tournaments";
import { usersTable } from "./users";

export const slotMatchesTable = pgTable("slot_matches", {
  id: serial("id").primaryKey(),
  displayId: text("display_id"),
  slotId: integer("slot_id").notNull().references(() => tournamentsTable.id),
  slotIndex: integer("slot_index").notNull().default(0),
  waveNumber: integer("wave_number").notNull(),
  matchNumber: integer("match_number").notNull(),
  player1Id: integer("player1_id").notNull().references(() => usersTable.id),
  player2Id: integer("player2_id").references(() => usersTable.id),
  player1Seat: text("player1_seat"),
  player2Seat: text("player2_seat"),
  roomId: text("room_id"),
  roomPassword: text("room_password"),
  roomUnlockAt: timestamp("room_unlock_at"),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: text("status").notNull().default("upcoming"),
  winnerId: integer("winner_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  releaseMode: text("release_mode").notNull().default("manual"),
  credentialsHidden: boolean("credentials_hidden").notNull().default(false),
  credentialsReleasedAt: timestamp("credentials_released_at"),
  releaseOffsetMinutes: integer("release_offset_minutes").default(5),
  roomDirectLink: text("room_direct_link"),
  credentialShareMode: text("credential_share_mode").notNull().default("both"),
  verificationStatus: text("verification_status").notNull().default("pending"),
  gameMode: text("game_mode"),
  matchMode: text("match_mode"),
  prizeAmountDiamonds: integer("prize_amount_diamonds").notNull().default(0),
  rewardDistributedAt: timestamp("reward_distributed_at"),
});

export const slotMatchEventsTable = pgTable("slot_match_events", {
  id: serial("id").primaryKey(),
  slotMatchId: integer("slot_match_id").notNull().references(() => slotMatchesTable.id, { onDelete: "cascade" }),
  actor: text("actor").notNull().default("system"),
  eventType: text("event_type").notNull(),
  payload: text("payload"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const slotMatchPlayerStatusTable = pgTable("slot_match_player_status", {
  id: serial("id").primaryKey(),
  slotMatchId: integer("slot_match_id").notNull().references(() => slotMatchesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  viewedAt: timestamp("viewed_at"),
  gameOpenedAt: timestamp("game_opened_at"),
  confirmedAt: timestamp("confirmed_at"),
  notifiedAt: timestamp("notified_at"),
}, (t) => ({
  uniqMatchPlayer: unique("uniq_slot_match_player").on(t.slotMatchId, t.userId),
}));

export const slotMatchVerificationsTable = pgTable("slot_match_verifications", {
  id: serial("id").primaryKey(),
  slotMatchId: integer("slot_match_id").notNull().references(() => slotMatchesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  ffUid: text("ff_uid"),
  preSnapshotAt: timestamp("pre_snapshot_at"),
  preSnapshotData: text("pre_snapshot_data"),
  postSnapshotAt: timestamp("post_snapshot_at"),
  postSnapshotData: text("post_snapshot_data"),
  statDiff: text("stat_diff"),
  isWinner: boolean("is_winner"),
  rewardGranted: boolean("reward_granted").notNull().default(false),
}, (t) => ({
  uniqVerifMatchPlayer: unique("uniq_verif_match_player").on(t.slotMatchId, t.userId),
}));

export const composedSlotMatchesTable = pgTable("composed_slot_matches", {
  id: serial("id").primaryKey(),
  slotId: integer("slot_id").notNull().references(() => tournamentsTable.id, { onDelete: "cascade" }),
  slotIndex: integer("slot_index").notNull().default(0),
  matchType: text("match_type").notNull().default("1v1"),
  rowOrder: integer("row_order").notNull().default(0),
  teamAPlayerIds: jsonb("team_a_player_ids").notNull().$type<number[]>(),
  teamBPlayerIds: jsonb("team_b_player_ids").notNull().$type<number[]>(),
  scheduledTime: timestamp("scheduled_time"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SlotMatch = typeof slotMatchesTable.$inferSelect;
export type SlotMatchEvent = typeof slotMatchEventsTable.$inferSelect;
export type SlotMatchPlayerStatus = typeof slotMatchPlayerStatusTable.$inferSelect;
export type SlotMatchVerification = typeof slotMatchVerificationsTable.$inferSelect;
export type ComposedSlotMatch = typeof composedSlotMatchesTable.$inferSelect;
