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
// Players must take an in-app action within this many ms of credentials arriving
const JOIN_WINDOW_MS = 20_000;

// ─── Wallet helper ────────────────────────────────────────────────────────────

/**
 * Credit a player's wallet.
 * txType "prize" = winnings; "withdraw_refund" = any refund.
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

// ─── Pre-snapshot: inserted to DB immediately when credentials arrive ─────────

export async function fetchAndStorePreSnapshots(match: QuickMatch): Promise<void> {
  await Promise.allSettled(
    match.players
      .filter((p) => !!p.uid)
      .map(async (player) => {
        const snap = await fetchCsCareerSnapshot(player.uid!);
        if (!snap) return;

        setPreSnapshot(match.id, player.userId, snap);
        console.log(
          `[settlement] Pre-snapshot: player=${player.userId} uid=${player.uid} ` +
          `games=${snap.gamesPlayed} wins=${snap.wins}`,
        );

        // Persist immediately — upsert so re-attach is idempotent
        await db
          .insert(quickmatchVerificationsTable)
          .values({
            matchId:         match.id,
            userId:          Number(player.userId),
            ffUid:           player.uid ?? null,
            preSnapshotAt:   new Date(snap.fetchedAt),
            preSnapshotData: JSON.stringify(snap),
          })
          .onConflictDoUpdate({
            target: [quickmatchVerificationsTable.matchId, quickmatchVerificationsTable.userId],
            set: {
              preSnapshotAt:   new Date(snap.fetchedAt),
              preSnapshotData: JSON.stringify(snap),
            },
          })
          .catch((err) => console.error("[settlement] Failed to persist pre-snapshot:", err));
      }),
  );
}

// ─── Post-snapshot + settlement ───────────────────────────────────────────────

export async function settleQuickMatch(match: QuickMatch): Promise<void> {
  if (match.noShowHandled) return;
  markNoShowHandled(match.id);

  console.log(
    `[settlement] Settling match ${match.id} entry=${match.entryFee} prize=${match.prizeAmount}`,
  );

  // ── Fetch post-snapshots ──────────────────────────────────────────────────
  const postSnaps: Record<string, Awaited<ReturnType<typeof fetchCsCareerSnapshot>>> = {};
  await Promise.allSettled(
    match.players
      .filter((p) => !!p.uid)
      .map(async (player) => {
        const snap = await fetchCsCareerSnapshot(player.uid!);
        postSnaps[player.userId] = snap;
        if (snap) {
          console.log(
            `[settlement] Post-snapshot: player=${player.userId}` +
            ` games=${snap.gamesPlayed} wins=${snap.wins}`,
          );
        }
      }),
  );

  // ── Derive outcomes ───────────────────────────────────────────────────────
  // "winner"  — stat-verified win within join window
  // "loser"   — played but did not win
  // "no_show" — no stat change detected (did not enter the room)
  type Outcome = "winner" | "loser" | "no_show";
  const outcomes: Record<string, Outcome> = {};

  // 20-second join-window deadline
  const windowDeadline = match.credentialsReadyAt
    ? new Date(match.credentialsReadyAt).getTime() + JOIN_WINDOW_MS
    : null;

  const actedInTime = (userId: string): boolean => {
    const at = match.actionTaken[userId];
    if (!at) return false;
    if (!windowDeadline) return true;
    return new Date(at).getTime() <= windowDeadline;
  };

  for (const player of match.players) {
    const pre  = match.preSnapshots[player.userId];
    const post = postSnaps[player.userId];

    if (!pre || !post || post.gamesPlayed <= pre.gamesPlayed) {
      // No stat movement — player did not play
      outcomes[player.userId] = "no_show";
      continue;
    }

    const winsDelta = post.wins - pre.wins;
    outcomes[player.userId] = winsDelta >= 1 ? "winner" : "loser";

    // Security flag: stats moved but player never used in-app credentials.
    // NOTE: detecting external credential sharing requires room-participant
    // data not currently available; flag for manual admin review only.
    if (!actedInTime(player.userId)) {
      db.insert(securityFlagsTable)
        .values({
          userId:     Number(player.userId),
          type:       "quickmatch_action_outside_window",
          severity:   "medium",
          details:    `Stats changed but in-app action not recorded within ${JOIN_WINDOW_MS / 1000}s window. Match ID: ${match.id}`,
          autoAction: "flagged",
        })
        .catch(() => {});
    }
  }

  console.log(`[settlement] Raw outcomes:`, outcomes);

  const allNoShow = match.players.every((p) => outcomes[p.userId] === "no_show");
  const anyNoShow = match.players.some((p)  => outcomes[p.userId] === "no_show");

  // ── Upsert verification records (update pre rows created in pre-snapshot) ─
  for (const player of match.players) {
    const pre     = match.preSnapshots[player.userId];
    const post    = postSnaps[player.userId];
    const outcome = outcomes[player.userId];

    const statDiff =
      pre && post
        ? JSON.stringify({
            gamesPlayedDelta: post.gamesPlayed - pre.gamesPlayed,
            winsDelta:        post.wins        - pre.wins,
            killsDelta:       post.kills       - pre.kills,
            damageDelta:      post.damage      - pre.damage,
            deathsDelta:      post.deaths      - pre.deaths,
          })
        : null;

    await db
      .insert(quickmatchVerificationsTable)
      .values({
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
      })
      .onConflictDoUpdate({
        target: [quickmatchVerificationsTable.matchId, quickmatchVerificationsTable.userId],
        set: {
          postSnapshotAt:   post ? new Date(post.fetchedAt) : null,
          postSnapshotData: post ? JSON.stringify(post)      : null,
          statDiff,
          outcome,
          rewardGranted: outcome === "winner",
        },
      })
      .catch((err) => console.error("[settlement] Failed to upsert verification:", err));
  }

  // ── Coin settlement + notifications ───────────────────────────────────────
  //
  // Decision tree:
  //   allNoShow          → both forfeit entry fee (neither played, no refund)
  //   anyNoShow (not all)→ one played, one didn't:
  //                          • no-show player  : forfeits entry fee
  //                          • player who played: refunded entry fee (match invalid)
  //   neither no-shows   → both played: winner earns prize, loser keeps nothing

  for (const player of match.players) {
    const outcome = outcomes[player.userId] ?? "no_show";
    const userId  = Number(player.userId);

    try {
      if (allNoShow) {
        // Both missed — both forfeit, no coin movement needed
        await notify(userId, {
          type:  "quickmatch_result",
          title: "Match Cancelled",
          body:  "Neither player joined the room. Entry fee forfeited.",
          url:   "/#/quickmatch",
        });

      } else if (anyNoShow) {
        if (outcome === "no_show") {
          // This player didn't show — forfeits entry fee
          await notify(userId, {
            type:  "quickmatch_result",
            title: "No-Show",
            body:  "You didn't join the room in time. Entry fee forfeited.",
            url:   "/#/quickmatch",
          });
        } else {
          // This player showed but opponent didn't — refund entry fee
          if (match.entryFee > 0) {
            await creditPlayer(
              userId,
              match.entryFee,
              "QuickMatch Opponent No-Show Refund",
              "quickmatch_noshowrefund",
              "withdraw_refund",
            );
          }
          await notify(userId, {
            type:  "quickmatch_result",
            title: "Match Cancelled — Opponent No-Show",
            body:  `Your opponent didn't join the room. Your ${match.entryFee} coin entry fee has been refunded.`,
            url:   "/#/quickmatch",
          });
        }

      } else {
        // Both played
        if (outcome === "winner") {
          await creditPlayer(
            userId,
            match.prizeAmount,
            "QuickMatch Prize",
            "quickmatch_prize",
            "prize",
          );
          await notify(userId, {
            type:  "quickmatch_result",
            title: "You Won!",
            body:  `+${match.prizeAmount} coins! Great game.`,
            url:   "/#/quickmatch",
          });
        } else {
          await notify(userId, {
            type:  "quickmatch_result",
            title: "Match Complete",
            body:  "Good game! Better luck next time.",
            url:   "/#/quickmatch",
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
