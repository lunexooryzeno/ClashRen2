import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const tournamentCredentialViewsTable = pgTable("tournament_credential_views", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull(),
  userId: integer("user_id").notNull(),
  viewedAt: timestamp("viewed_at").notNull().defaultNow(),
});
