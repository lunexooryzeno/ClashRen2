import { pgTable, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

export const topupSessionsTable = pgTable("topup_sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  baseRupees: integer("base_rupees").notNull(),
  actualPaise: integer("actual_paise").notNull(),
  diamonds: integer("diamonds").notNull(),
  paisaOffset: integer("paisa_offset").notNull().default(0),
  expiresAt: timestamp("expires_at").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  activePaiseUnique: uniqueIndex("topup_sessions_active_paise_unique")
    .on(table.actualPaise)
    .where(sql`status = 'active'`),
}));

export type TopupSession = typeof topupSessionsTable.$inferSelect;
