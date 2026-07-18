import { eq, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  walletTransactionsTable,
  balanceChangeLogsTable,
  securityFlagsTable,
  quickmatchVerificationsTable,
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
// Join-window: players must act within this many ms of credentials arriving
const JOIN_WINDOW_MS = 20_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Credit a player's wallet with the given amount.
 * Use txType "prize" for winnings, "withdraw_refund" for any refund.
 */
export async function creditPlayer(
  userId: number,
  amount: number,
  label: string,
  source: string,
  txType: "prize" | "withdraw_refund" = "prize",
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
      type: txType,
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
            `[settlement] Pre-snapshot: player=${player.userId} uid=${player.uid} ` +
            `games=${snap.gamesPlayed} wins=${snap.wins}`,
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

  // Fetch post-snapshots
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

  // ── 20-second join-window deadline ───────────────────────────────────────
  const windowDeadline = match.credentialsReadyAt
    ? new Date(match.credentialsReadyAt).getTime() + JOIN_WINDOW_MS
    : null;

  // Returns true only if the player acted within the join window
  const withinWindow = (userId: string): boolean => {
    const at = match.actionTaken[userId];
    if (!at) return false;
    if (!windowDeadline) return true;
    return new Date(at).getTime() <= windowDeadline;
  };

  // ── Determine raw outcomes ────────────────────────────────────────────────
  type Outcome = "winner" | "loser" | "no_show" | "leaker";
  const outcomes: Record<string, Outcome> = {};

  for (const player of match.players) {
    const pre         = match.preSnapshots[player.userId];
    const post        = postSnaps[player.userId];
    const actedInTime = withinWindow(player.userId);

    if (!pre || !post) {
      outcomes[player.userId] = "no_show";
      continue;
    }

    const gamesPlayedDelta = post.gamesPlayed - pre.gamesPlayed;
    const winsDelta        = post.wins - pre.wins;

    if (gamesPlayedDelta <= 0) {
      outcomes[player.userId] = "no_show";
    } else if (!actedInTime) {
      // Stats moved but player never used in-app credentials within the window
      outcomes[player.userId] = "leaker";
    } else if (winsDelta >= 1) {
      outcomes[player.userId] = "winner";
    } else {
      outcomes[player.userId] = "loser";
    }
  }

  console.log(`[settlement] Raw outcomes:`, outcomes);

  const allNoShow = match.players.every((p) => outcomes[p.userId] === "no_show");

  // ── Persist verification records ──────────────────────────────────────────
  for (const player of match.players) {
    const pre     = match.preSnapshots[player.userId];
    const post    = postSnaps[player.userId];
    const outcome = outcomes[player.userId];

    const statDiff = pre && post ? JSON.stringify({
      gamesPlayedDelta: post.gamesPlayed - pre.gamesPlayed,
      winsDelta:        post.wins - pre.wins,
      killsDelta:       post.kills - pre.kills,
      damageDelta:      post.damage - pre.damage,
      deathsDelta:      post.deaths - pre.deaths,
    }) : null;

    await db.insert(quickmatchVerificationsTable).values({
      matchId:          match.id,
      userId:           Number(player.userId),
      ffUid:            player.uid ?? null,
      preSnapshotAt:    pre  ? new Date(pre.fetchedAt)  : null,
      preSnapshotData:  pre  ? JSON.stringify(pre)       : null,
      postSnapshotAt:   post ? new Date(post.fetchedAt) : null,
      postSnapshotData: post ? JSON.stringify(post)      : null,
      statDiff,
      outcome,
      rewardGranted: outcome === "winner",
    }).catch((err) => console.error("[settlement] Failed to persist verification:", err));
  }

  // ── Process outcomes per player ───────────────────────────────────────────
  for (const player of match.players) {
    const outcome         = outcomes[player.userId] ?? "no_show";
    const opponentObj     = match.players.find((p) => p.userId !== player.userId);
    const opponentOutcome = opponentObj ? outcomes[opponentObj.userId] : null;
    const userId          = Number(player.userId);

    try {
      if (outcome === "leaker") {
        // Suspend for 12 hours
        const suspendedUntil = new Date(Date.now() + 12 * 60 * 60 * 1000);
        await db
          .update(usersTable)
          .set({ tournamentBanned: true, tournamentBannedUntil: suspendedUntil })
          .where(eq(usersTable.id, userId));
        await db.insert(securityFlagsTable).values({
          userId,
          type: "quickmatch_credential_leak",
          severity: "high",
          details: `Stats changed without in-app action within join window. Match ID: ${match.id}`,
          autoAction: "suspended_12h",
        });
        await notify(userId, {
          type: "quickmatch_suspension",
          title: "Account Suspended 12h",
          body: "Credential leak detected. You are suspended from QuickMatch for 12 hours.",
          url: "/#/quickmatch",
        });

      } else if (opponentOutcome === "leaker") {
        // Opponent leaked → refund this player's entry fee
        await creditPlayer(userId, match.entryFee, "QuickMatch Leak Cancel Refund", "quickmatch_leakrefund", "withdraw_refund");
        await notify(userId, {
          type: "quickmatch_result",
          title: "Match Refunded",
          body: `Opponent credential leak detected. Your ${match.entryFee} coin entry fee is refunded.`,
          url: "/#/quickmatch",
        });

      } else if (outcome === "winner") {
        // Prize payout — use "prize" transaction type
        await creditPlayer(userId, match.prizeAmount, "QuickMatch Prize", "quickmatch_prize", "prize");
        await notify(userId, {
          type: "quickmatch_result",
          title: "🏆 You Won!",
          body: `+${match.prizeAmount} coins! Great game.`,
          url: "/#/quickmatch",
        });

      } else if (outcome === "loser") {
        if (opponentOutcome === "no_show") {
          // Opponent no-showed → match cancelled → refund
          await creditPlayer(userId, match.entryFee, "QuickMatch Opponent No-Show Refund", "quickmatch_noshowrefund", "withdraw_refund");
          await notify(userId, {
            type: "quickmatch_result",
            title: "Match Refunded",
            body: `Your opponent didn't join the room. Your ${match.entryFee} coin entry fee is refunded.`,
            url: "/#/quickmatch",
          });
        } else {
          // Both played — clean loss, entry forfeited
          await notify(userId, {
            type: "quickmatch_result",
            title: "Match Complete",
            body: "Good game! Better luck next time.",
            url: "/#/quickmatch",
          });
        }

      } else if (outcome === "no_show") {
        if (allNoShow) {
          // Both no-showed — both forfeit, no refund
          await notify(userId, {
            type: "quickmatch_result",
            title: "Match Cancelled",
            body: "Neither player joined the room. Entry fee forfeited.",
            url: "/#/quickmatch",
          });
        } else {
          // Only this player no-showed
          await notify(userId, {
            type: "quickmatch_result",
            title: "No-Show Detected",
            body: "You didn't join the room in time. Entry fee forfeited.",
            url: "/#/quickmatch",
          });
        }
      }
    } catch (err) {
      console.error(`[settlement] Failed to process outcome for player ${userId}:`, err);
    }
  }

  dismissMatch(match.id);
  console.log(`[settlement] Match ${match.id} settled. Outcomes:`, outcomes);
}
