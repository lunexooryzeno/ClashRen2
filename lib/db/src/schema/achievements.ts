import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const achievementsTable = pgTable("achievements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  icon: text("icon").notNull().default("🏆"),
  bgColor: text("bg_color").notNull().default("#f59e0b"),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  description: text("description").notNull().default(""),
  isUnlocked: boolean("is_unlocked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Achievement = typeof achievementsTable.$inferSelect;
export type InsertAchievement = typeof achievementsTable.$inferInsert;
