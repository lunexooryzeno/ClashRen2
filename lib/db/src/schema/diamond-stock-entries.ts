import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const diamondStockEntriesTable = pgTable("diamond_stock_entries", {
  id: serial("id").primaryKey(),
  diamonds: integer("diamonds").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DiamondStockEntry = typeof diamondStockEntriesTable.$inferSelect;
