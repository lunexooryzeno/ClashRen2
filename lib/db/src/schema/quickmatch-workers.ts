import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";

export const quickmatchWorkersTable = pgTable("quickmatch_workers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  webhookUrl: text("webhook_url").notNull(),
  webhookSecret: text("webhook_secret").notNull(),
  supportedGameModes: text("supported_game_modes").notNull().default("duel,healing,knife"),
  status: text("status").notNull().default("active"), // "active" | "disabled" | "busy"
  priority: integer("priority").notNull().default(0),
  lastHeartbeatAt: timestamp("last_heartbeat_at"),
  currentJobMatchId: text("current_job_match_id"),
  /** "room_creator" phones create rooms; "verifier" phones run screenshot OCR */
  workerType: text("worker_type").notNull().default("room_creator"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workerAccessTokensTable = pgTable("worker_access_tokens", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  matchId: text("match_id").notNull(),
  workerId: integer("worker_id").notNull(),
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  completed: boolean("completed").notNull().default(false),
});

export const workerResponseLogsTable = pgTable("worker_response_logs", {
  id: serial("id").primaryKey(),
  tokenId: integer("token_id"),
  matchId: text("match_id").notNull(),
  workerId: integer("worker_id"),
  phoneStatus: text("phone_status"),
  msgCode: text("msg_code"),
  responseCode: text("response_code"),
  payload: text("payload"),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
});

export const quickmatchesTable = pgTable("quickmatches", {
  id: text("id").primaryKey(),
  gameType: text("game_type").notNull(),
  modeId: text("mode_id").notNull(),
  playerIds: text("player_ids").notNull(), // JSON array of user IDs
  entryFee: integer("entry_fee").notNull().default(0),
  prizeAmount: integer("prize_amount").notNull().default(0),
  currentState: text("current_state").notNull().default("QUEUEING"),
  workerId: integer("worker_id"),
  joinConfirmedA: boolean("join_confirmed_a").notNull().default(false),
  joinConfirmedB: boolean("join_confirmed_b").notNull().default(false),
  roomId: text("room_id"),
  roomPassword: text("room_password"),
  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type QuickmatchWorker = typeof quickmatchWorkersTable.$inferSelect;
export type WorkerAccessToken = typeof workerAccessTokensTable.$inferSelect;
export type WorkerResponseLog = typeof workerResponseLogsTable.$inferSelect;
export type Quickmatch = typeof quickmatchesTable.$inferSelect;
