import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tournamentParticipantsTable, usersTable, tournamentsTable, loginHistoryTable } from "@workspace/db";
import { eq, desc, sql, and, gte } from "drizzle-orm";

const router: IRouter = Router();

/**
 * Points formula:
 *   1st place  → 50 pts
 *   2nd place  → 30 pts
 *   3rd place  → 15 pts
 *   4th–10th   → 5 pts
 *   Per kill   → 2 pts
 *   Per 10 diamonds won → 1 pt
 *   Distinct login days in period → 3 pts/day
 */
const POINTS_SQL = (uid: ReturnType<typeof sql>) => sql`(
  sum(case
    when ${tournamentParticipantsTable.placement} = 1 then 50
    when ${tournamentParticipantsTable.placement} = 2 then 30
    when ${tournamentParticipantsTable.placement} = 3 then 15
    when ${tournamentParticipantsTable.placement} between 4 and 10 then 5
    else 0
  end)::int
  + (coalesce(sum(${tournamentParticipantsTable.kills}), 0) * 2)::int
  + (coalesce(sum(${tournamentParticipantsTable.diamondsWon}), 0) / 10)::int
  + coalesce((
      select (count(distinct date(lh.created_at)) * 3)::int
      from login_history lh
      where lh.user_id = ${uid}
  ), 0)
)`;

router.get("/leaderboard", async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const period = (req.query.period as string) === "monthly" ? "monthly" : "weekly";
  const mode   = (req.query.mode as string | undefined);

  const periodDays = period === "monthly" ? 30 : 7;
  const cutoff     = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const modeCondition =
    mode === "clash_squad"  ? sql`lower(${tournamentsTable.gameMode}) like '%clash%'`  :
    mode === "battle_royal" ? sql`lower(${tournamentsTable.gameMode}) like '%battle%'` :
    mode === "knockout"     ? sql`lower(${tournamentsTable.gameMode}) like '%knockout%'` :
    undefined;

  const where = modeCondition
    ? and(gte(tournamentParticipantsTable.joinedAt, cutoff), modeCondition)
    : gte(tournamentParticipantsTable.joinedAt, cutoff);

  const entries = await db
    .select({
      userId:            usersTable.id,
      inGameName:        usersTable.inGameName,
      profilePicture:    usersTable.profilePicture,
      tournamentsPlayed: sql<number>`count(*)::int`,
      totalWins:         sql<number>`sum(case when ${tournamentParticipantsTable.placement} = 1 then 1 else 0 end)::int`,
      totalKills:        sql<number>`coalesce(sum(${tournamentParticipantsTable.kills}), 0)::int`,
      diamondsEarned:    sql<number>`coalesce(sum(${tournamentParticipantsTable.diamondsWon}), 0)::int`,
      points:            sql<number>`${POINTS_SQL(sql`${usersTable.id}`)}`,
    })
    .from(tournamentParticipantsTable)
    .innerJoin(usersTable, eq(usersTable.id, tournamentParticipantsTable.userId))
    .innerJoin(tournamentsTable, eq(tournamentsTable.id, tournamentParticipantsTable.tournamentId))
    .where(where)
    .groupBy(usersTable.id, usersTable.inGameName, usersTable.profilePicture)
    .orderBy(desc(sql`${POINTS_SQL(sql`${usersTable.id}`)}`))
    .limit(limit);

  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=30");
  res.json(entries.map((e, i) => ({ rank: i + 1, ...e })));
});

export default router;
