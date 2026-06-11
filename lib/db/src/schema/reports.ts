import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { tournamentsTable } from "./tournaments";

export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  reporterId: integer("reporter_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  accusedId: integer("accused_id").references(() => usersTable.id, { onDelete: "set null" }),
  accusedName: text("accused_name"),
  category: text("category").notNull(),
  evidence: text("evidence").notNull(),
  tournamentId: integer("tournament_id").references(() => tournamentsTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Report = typeof reportsTable.$inferSelect;
