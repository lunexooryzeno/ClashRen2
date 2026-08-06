import { pgTable, serial, text, integer, timestamp, jsonb, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Prize state machine per match.
 * States: NOT_CREATED → PENDING → LOCKED → FINALIZED | REVERSED
 *
 * All transitions must use the atomic WHERE-guard pattern in prize-state.ts.
 * A row is seeded with state=NOT_CREATED when the match is created.
 */
export const quickmatchPrizesTable = pgTable("quickmatch_prizes", {
  id: serial("id").primaryKey(),
  /** One prize row per match — unique constraint prevents duplicates */
  matchId: text("match_id").notNull().unique(),
  /** Generated at match creation; used as idempotency key for payout */
  payoutId: uuid("payout_id").notNull().unique().defaultRandom(),
  /** Set when prize transitions to PENDING (winner confirmed by OCR) */
  winnerUserId: integer("winner_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  /** Diamond amount to be paid to winner */
  prizeAmount: integer("prize_amount").notNull().default(0),
  /**
   * Prize state machine:
   *   NOT_CREATED  — match created, no winner yet
   *   PENDING      — OCR verified, provisional credit inserted, dispute window open
   *   LOCKED       — dispute window expired, no dispute filed; awaiting finalization
   *   FINALIZED    — diamond_balance credited, wallet_transaction settled
   *   REVERSED     — dispute won by loser; pending transaction voided
   */
  state: text("state").notNull().default("NOT_CREATED"),
  stateChangedAt: timestamp("state_changed_at").notNull().defaultNow(),
  /** media_uploads.id of the winning screenshot (temp upload) */
  screenshotMediaId: text("screenshot_media_id"),
  /** Full OCR result from the verifier phone */
  ocrResult: jsonb("ocr_result"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type QuickmatchPrize = typeof quickmatchPrizesTable.$inferSelect;
