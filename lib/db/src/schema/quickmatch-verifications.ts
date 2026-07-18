import { pgTable, serial, integer, text, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const quickmatchVerificationsTable = pgTable("quickmatch_verifications", {
  id: serial("id").primaryKey(),
  matchId: text("match_id").notNull(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  ffUid: text("ff_uid"),
  preSnapshotAt: timestamp("pre_snapshot_at"),
  preSnapshotData: text("pre_snapshot_data"),
  postSnapshotAt: timestamp("post_snapshot_at"),
  postSnapshotData: text("post_snapshot_data"),
  statDiff: text("stat_diff"),
  outcome: text("outcome"),
  rewardGranted: boolean("reward_granted").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniqVerifMatchPlayer: unique("uq_qm_verif_match_user").on(t.matchId, t.userId),
}));

export type QuickmatchVerification = typeof quickmatchVerificationsTable.$inferSelect;
