import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const topupRequestsTable = pgTable("topup_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  rupees: integer("rupees").notNull(),
  diamonds: integer("diamonds").notNull(),
  utr: text("utr").notNull(),
  status: text("status").notNull().default("pending"),
  bharatpeData: jsonb("bharatpe_data"),
  actualPaise: integer("actual_paise"),
  sessionToken: text("session_token"),
  verifiedAt: timestamp("verified_at"),
  rejectedAt: timestamp("rejected_at"),
  rejectedReason: text("rejected_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TopupRequest = typeof topupRequestsTable.$inferSelect;
