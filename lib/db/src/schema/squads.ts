import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const squadsTable = pgTable("squads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  uid: text("uid").notNull(),
  leaderId: integer("leader_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  avatar: text("avatar"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const squadMembersTable = pgTable(
  "squad_members",
  {
    id: serial("id").primaryKey(),
    squadId: integer("squad_id")
      .notNull()
      .references(() => squadsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("primary"), // "primary" | "secondary"
    status: text("status").notNull().default("active"), // "active" | "pending_invite" | "pending_request"
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("squad_members_squad_user_idx").on(t.squadId, t.userId)],
);

export type Squad = typeof squadsTable.$inferSelect;
export type SquadMember = typeof squadMembersTable.$inferSelect;
