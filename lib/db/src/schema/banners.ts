import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const bannersTable = pgTable("banners", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  tag: text("tag"),
  subtitle: text("subtitle"),
  buttonText: text("button_text"),
  buttonUrl: text("button_url"),
  imageUrl: text("image_url"),
  accentColor: text("accent_color").notNull().default("#a855f7"),
  placement: text("placement").notNull().default("home"),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Banner = typeof bannersTable.$inferSelect;
export type InsertBanner = typeof bannersTable.$inferInsert;
