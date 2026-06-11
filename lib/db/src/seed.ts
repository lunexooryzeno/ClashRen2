import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { usersTable, tournamentsTable, tournamentParticipantsTable } from "./schema";
import * as schema from "./schema";
import { getConnectionString } from "./connection";

const { Pool } = pg;

const pool = new Pool({ connectionString: getConnectionString() });
const db = drizzle(pool, { schema });

async function seed() {
  console.log("Seeding database...");

  // Insert 10 users
  const users = await db
    .insert(usersTable)
    .values([
      { phone: "+919876543210", inGameName: "FlameKing_FF", uid: "FF001234", diamondBalance: 500, isAdmin: true },
      { phone: "+919876543211", inGameName: "ShadowRift",    uid: "FF001235", diamondBalance: 300, isAdmin: false },
      { phone: "+919876543212", inGameName: "StormBlade",    uid: "FF001236", diamondBalance: 250, isAdmin: false },
      { phone: "+919876543213", inGameName: "NightHawk99",   uid: "FF001237", diamondBalance: 180, isAdmin: false },
      { phone: "+919876543214", inGameName: "BlazeFist",     uid: "FF001238", diamondBalance: 420, isAdmin: false },
      { phone: "+919876543215", inGameName: "ZenMaster_X",   uid: "FF001239", diamondBalance: 100, isAdmin: false },
      { phone: "+919876543216", inGameName: "DarkProwler",   uid: "FF001240", diamondBalance: 200, isAdmin: false },
      { phone: "+919876543217", inGameName: "ViperStrike",   uid: "FF001241", diamondBalance: 350, isAdmin: false },
      { phone: "+919876543218", inGameName: "ThunderElite",  uid: "FF001242", diamondBalance: 150, isAdmin: false },
      { phone: "+919876543219", inGameName: "GhostReaper",   uid: "FF001243", diamondBalance: 80,  isAdmin: false },
    ])
    .onConflictDoNothing()
    .returning();

  console.log(`Inserted ${users.length} users`);

  // Insert 5 tournaments
  const now = new Date();
  const tournaments = await db
    .insert(tournamentsTable)
    .values([
      {
        title: "Grand Clash Season 1",
        gameMode: "squad",
        entryFeeDiamonds: 20,
        prizePoolDiamonds: 500,
        maxSlots: 48,
        filledSlots: 12,
        startTime: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        status: "upcoming",
      },
      {
        title: "Solo Showdown",
        gameMode: "solo",
        entryFeeDiamonds: 10,
        prizePoolDiamonds: 200,
        maxSlots: 24,
        filledSlots: 24,
        startTime: new Date(now.getTime() - 30 * 60 * 1000),
        status: "ongoing",
        roomId: "ROOM123",
        roomPassword: "ZEN2024",
      },
      {
        title: "Duo Blitz Cup",
        gameMode: "duo",
        entryFeeDiamonds: 15,
        prizePoolDiamonds: 300,
        maxSlots: 32,
        filledSlots: 8,
        startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        status: "upcoming",
      },
      {
        title: "Clash Squad Royale",
        gameMode: "clash_squad",
        entryFeeDiamonds: 5,
        prizePoolDiamonds: 100,
        maxSlots: 16,
        filledSlots: 16,
        startTime: new Date(now.getTime() - 3 * 60 * 60 * 1000),
        status: "completed",
      },
      {
        title: "Weekend Warrior Cup",
        gameMode: "squad",
        entryFeeDiamonds: 30,
        prizePoolDiamonds: 800,
        maxSlots: 48,
        filledSlots: 0,
        startTime: new Date(now.getTime() + 48 * 60 * 60 * 1000),
        status: "upcoming",
      },
    ])
    .onConflictDoNothing()
    .returning();

  console.log(`Inserted ${tournaments.length} tournaments`);

  // Add some participation records for completed/ongoing tournaments
  if (tournaments.length > 0) {
    const allUsers = await db.query.usersTable.findMany({ limit: 10 });
    const allTournaments = await db.query.tournamentsTable.findMany({ limit: 5 });
    const completedOrOngoing = allTournaments.filter(t => t.status === "completed" || t.status === "ongoing");
    
    const participations = [];
    for (const tournament of completedOrOngoing) {
      const numPlayers = Math.min(allUsers.length, tournament.filledSlots);
      for (let i = 0; i < numPlayers; i++) {
        participations.push({
          tournamentId: tournament.id,
          userId: allUsers[i].id,
          kills: Math.floor(Math.random() * 8),
          placement: i + 1,
          diamondsWon: i === 0 ? Math.floor(tournament.prizePoolDiamonds * 0.5) : i === 1 ? Math.floor(tournament.prizePoolDiamonds * 0.3) : 0,
        });
      }
    }
    
    if (participations.length > 0) {
      await db.insert(tournamentParticipantsTable).values(participations).onConflictDoNothing();
      console.log(`Inserted ${participations.length} participation records`);
    }
  }

  console.log("Seeding complete!");
  await pool.end();
}

seed().catch(err => {
  console.error("Seed failed:", err);
  pool.end();
  process.exit(1);
});
