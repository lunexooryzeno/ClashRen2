import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * One row per active dispute. Unique on match_id — only one open dispute
 * can exist per match at a time. Evidence is stored as an array of
 * media_uploads IDs.
 *
 * Status flow: OPEN → RESOLVED_ORIGINAL_WINS | RESOLVED_CHALLENGER_WINS
 */
export const quickmatchDisputesTable = pgTable("quickmatch_disputes", {
  id: serial("id").primaryKey(),
  /** One dispute per match (enforced by unique constraint) */
  matchId: text("match_id").notNull().unique(),
  /** The player who is challenging the provisional win */
  challengerUserId: integer("challenger_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  /** The player who was declared provisional winner */
  claimedWinnerUserId: integer("claimed_winner_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  /** Array of media_uploads.id for submitted evidence files */
  evidenceMediaIds: text("evidence_media_ids").array().notNull().default([]),
  /** Player's written explanation of why they are disputing */
  explanation: text("explanation"),
  /**
   * OPEN               — awaiting admin review
   * RESOLVED_ORIGINAL_WINS  — original winner confirmed; challenger penalized
   * RESOLVED_CHALLENGER_WINS — dispute valid; original claimant was faking
   */
  status: text("status").notNull().default("OPEN"),
  /** Admin who resolved this dispute */
  resolvedByAdminId: integer("resolved_by_admin_id")
    .references(() => usersTable.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type QuickmatchDispute = typeof quickmatchDisputesTable.$inferSelect;
