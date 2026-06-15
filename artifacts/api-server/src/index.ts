import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import {
  scheduledRewardsTable,
  usersTable,
  walletTransactionsTable,
  notificationsTable,
  tournamentParticipantsTable,
  balanceChangeLogsTable,
  tournamentsTable,
  freefireApiKeysTable,
} from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";
import { processAutoReleases } from "./routes/slot-matches.js";

const rawPort = process.env["PORT"] ?? "3000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function processScheduledRewards() {
  try {
    const due = await db.query.scheduledRewardsTable.findMany({
      where: (t) => sql`${t.status} = 'pending' AND ${t.scheduledFor} <= NOW()`,
    });
    for (const sr of due) {
      try {
        const user = await db.query.usersTable.findFirst({
          where: eq(usersTable.id, sr.userId),
          columns: { id: true, diamondBalance: true },
        });
        await db.update(usersTable)
          .set({ diamondBalance: sql`diamond_balance + ${sr.amount}` })
          .where(eq(usersTable.id, sr.userId));
        await db.update(tournamentParticipantsTable)
          .set({ diamondsWon: sql`diamonds_won + ${sr.amount}` })
          .where(sql`${tournamentParticipantsTable.tournamentId} = ${sr.tournamentId} AND ${tournamentParticipantsTable.userId} = ${sr.userId}`);
        await db.insert(balanceChangeLogsTable).values({
          userId: sr.userId,
          adminId: sr.createdByAdminId,
          amount: sr.amount,
          balanceBefore: user?.diamondBalance ?? 0,
          balanceAfter: (user?.diamondBalance ?? 0) + sr.amount,
          reason: sr.reason || `Scheduled reward`,
          source: "force_payout",
        });
        const tournament = await db.query.tournamentsTable.findFirst({
          where: eq(tournamentsTable.id, sr.tournamentId),
          columns: { title: true },
        });
        await db.insert(walletTransactionsTable).values({
          userId: sr.userId,
          type: "prize",
          amount: sr.amount,
          label: sr.reason || `${tournament?.title ?? "Tournament"} Scheduled Prize`,
          tournamentId: sr.tournamentId,
        });
        await db.insert(notificationsTable).values({
          userId: sr.userId,
          type: "result",
          title: "Prize Credited",
          body: `+${sr.amount} 💎 scheduled reward credited${sr.reason ? `: ${sr.reason}` : ""}.`,
        });
        await db.update(scheduledRewardsTable)
          .set({ status: "processed", processedAt: new Date() })
          .where(eq(scheduledRewardsTable.id, sr.id));
        logger.info({ scheduledRewardId: sr.id, userId: sr.userId, amount: sr.amount }, "Scheduled reward processed");
      } catch (e) {
        logger.error({ scheduledRewardId: sr.id, err: e }, "Failed to process scheduled reward");
      }
    }
  } catch (e) {
    logger.error({ err: e }, "Error in scheduled reward processor");
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  setInterval(processScheduledRewards, 60_000);
  processScheduledRewards();

  // Seed default Gameskinbo API key if none exist
  db.select({ n: count() }).from(freefireApiKeysTable).then(([row]) => {
    if ((row?.n ?? 0) === 0) {
      db.insert(freefireApiKeysTable)
        .values({ key: "EriMWHsMRHXfx-cTvlepqW0k8fSaypfee5YzC38B7Jw", label: "Initial Key" })
        .onConflictDoNothing()
        .then(() => logger.info("Seeded default Gameskinbo API key"))
        .catch(e => logger.error({ err: e }, "Failed to seed Gameskinbo API key"));
    }
  }).catch(() => {});

  // Auto-release room credentials every 30 seconds
  setInterval(processAutoReleases, 30_000);
  processAutoReleases();
});
