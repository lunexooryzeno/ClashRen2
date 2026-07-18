import { eq, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  walletTransactionsTable,
  balanceChangeLogsTable,
  securityFlagsTable,
} from "@workspace/db";
import { notify } from "./push.js";
import { fetchCsCareerSnapshot } from "./quickmatch-hlgaming.js";
import {
  setPreSnapshot,
  markNoShowHandled,
  dismissMatch,
  type QuickMatch,
} from "./quickmatch-matches.js";

export const SNAPSHOT_DELAY_MS = 20_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function creditPlayer(
  userId: number,
  amount: number,
  label: string,
  source: string,
): Promise<void> {
  if (amount <= 0) return;
  await db.transaction(async (tx: any) => {
    const uRes = await tx.execute(
      sql`SELECT id, diamond_balance FROM users WHERE id = ${userId} FOR UPDATE`,
    );
    const user = ((uRes as any).rows ?? uRes)[0] as
      | { id: number; diamond_balance: number }
      | undefined;
    if (!user) return;
    await tx
      .update(usersTable)
      .set({ diamondBalance: user.diamond_balance + amount })
      .where(eq(usersTable.id, userId));
    await tx.insert(walletTransactionsTable).values({
      userId,
      type: "prize",
      amount,
      label,
    });
    await tx.insert(balanceChangeLogsTable).values({
      userId,
      adminId: null,
      amount,
      balanceBefore: user.diamond_balance,
      balanceAfter: user.diamond_balance + amount,
      reason: label,
      source,
    });
  });
}

// ─── Pre-snapshot (called when credentials arrive) ────────────────────────────

export async function fetchAndStorePreSnapshots(match: QuickMatch): Promise<void> {
  await Promise.allSettled(
    match.players
      .filter((p) => !!p.uid)
      .map(async (player) => {
        const snap = await fetchCsCareerSnapshot(player.uid!);
        if (snap) {
          setPreSnapshot(match.id, player.userId, snap);
          console.log(
            `[settlement] Pre-snapshot: player=${player.userId} uid=${player.uid} games=${snap.gamesPlayed} wins=${snap.wins}`,
          );
        }
      }),
  );
}

// ─── Post-snapshot + settlement (called after SNAPSHOT_DELAY_MS) ─────────────

export async function settleQuickMatch(match: QuickMatch): Promise<void> {
  if (match.noShowHandled) return;
  markNoShowHandled(match.id);

  console.log(
    `[settlement] Settling match ${match.id} entry=${match.entryFee} prize=${match.prizeAmount}`,
  );

  // Fetch post-snapshots for all players who have a UID
  const postSnaps: Record<string, Awaited<ReturnType<typeof fetchCsCareerSnapshot>>> = {};
  await Promise.allSettled(
    match.players
      .filter((p) => !!p.uid)
      .map(async (player) => {
        const snap = await fetchCsCareerSnapshot(player.uid!);
        postSnaps[player.userId] = snap;
        if (snap) {
          console.log(
            `[settlement] Post-snapshot: player=${player.userId} games=${snap.gamesPlayed} wins=${snap.wins}`,
          );
        }
      }),
  );

  type Outcome = "winner" | "loser" | "no_show" | "leaker";
  const outcomes: Record<string, Outcome> = {};

  for (const player of match.players) {
    const pre         = match.preSnapshots[player.userId];
    const post        = postSnaps[player.userId];
    const actionTaken = !!match.actionTaken[player.userId];

    if (!pre || !post) {
      outcomes[player.userId] = "no_show";
      continue;
    }

    const gamesPlayedDelta = post.gamesPlayed - pre.gamesPlayed;
    const winsDelta        = post.wins - pre.wins;

    if (gamesPlayedDelta <= 0) {
      outcomes[player.userId] = "no_show";
    } else if (!actionTaken) {
      // Stats changed but player never used credentials in-app → credential leak
      outcomes[player.userId] = "leaker";
    } else if (winsDelta >= 1) {
      outcomes[player.userId] = "winner";
    } else {
      outcomes[player.userId] = "loser";
    }
  }

  console.log(`[settlement] Match ${match.id} outcomes:`, outcomes);

  const allNoShow = match.players.every((p) => outcomes[p.userId] === "no_show");
  const hasWinner = match.players.some((p) => outcomes[p.userId] === "winner");

  for (const player of match.players) {
    const outcome   = outcomes[player.userId] ?? "no_show";
    const userIdNum = Number(player.userId);

    try {
      switch (outcome) {
        case "winner":
          await creditPlayer(userIdNum, match.prizeAmount, "QuickMatch Prize", "quickmatch_prize");
          await notify(userIdNum, {
            type: "quickmatch_result",
            title: "🏆 You Won!",
            body: `You won ${match.prizeAmount} coins in QuickMatch. GG!`,
            url: "/#/quickmatch",
          });
          break;

        case "loser":
          await notify(userIdNum, {
            type: "quickmatch_result",
            title: "Match Complete",
            body: "Good game! Better luck next time.",
            url: "/#/quickmatch",
          });
          break;

        case "no_show":
          if (allNoShow) {
            // Both players no-showed — full refund
            await creditPlayer(
              userIdNum,
              match.entryFee,
              "QuickMatch No-Show Refund",
              "quickmatch_noshowrefund",
            );
            await notify(userIdNum, {
              type: "quickmatch_result",
              title: "Match Refunded",
              body: `Both players didn't show. Your ${match.entryFee} coin entry fee was refunded.`,
              url: "/#/quickmatch",
            });
          } else if (hasWinner) {
            // Opponent played — no-show's entry is forfeited
            await notify(userIdNum, {
              type: "quickmatch_result",
              title: "No-Show Detected",
              body: "You didn't join the room in time. Your entry fee was forfeited.",
              url: "/#/quickmatch",
            });
          }
          break;

        case "leaker": {
          const suspendedUntil = new Date(Date.now() + 12 * 60 * 60 * 1000);
          await db
            .update(usersTable)
            .set({ tournamentBanned: true, tournamentBannedUntil: suspendedUntil })
            .where(eq(usersTable.id, userIdNum));
          await db.insert(securityFlagsTable).values({
            userId: userIdNum,
            type: "quickmatch_credential_leak",
            severity: "high",
            details: `Stats changed but no in-app action recorded. Match ID: ${match.id}`,
            autoAction: "suspended_12h",
          });
          await notify(userIdNum, {
            type: "quickmatch_suspension",
            title: "Account Suspended 12h",
            body: "Credential leak detected. Suspended from QuickMatch for 12 hours.",
            url: "/#/quickmatch",
          });
          break;
        }
      }
    } catch (err) {
      console.error(`[settlement] Failed to process outcome for player ${userIdNum}:`, err);
    }
  }

  dismissMatch(match.id);
}
