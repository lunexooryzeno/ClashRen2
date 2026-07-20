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
import { getSystemSettings } from "./systemSettings.js";

export const SNAPSHOT_DELAY_MS = 20_000;
// Read join window from system settings so admins can tune it live
function getJoinWindowMs(): number {
  return (getSystemSettings().joinWindowSeconds ?? 30) * 1000;
}
// Duration of leak-detection suspension
const LEAK_BAN_HOURS = 12;

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
          .catch((err: unknown) => console.error("[settlement] Failed to persist pre-snapshot:", err));
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
  // join-window deadline (from when credentials became available)
  const joinWindowMs = getJoinWindowMs();
  const windowDeadline = match.credentialsReadyAt
    ? new Date(match.credentialsReadyAt).getTime() + joinWindowMs
    : null;

  const actedInTime = (userId: string): boolean => {
    const at = match.actionTaken[userId];
    if (!at) return false;
    if (!windowDeadline) return true;
    return new Date(at).getTime() <= windowDeadline;
  };

  // Outcome classification:
  //   "winner"  — acted in time + stat-verified win
  //   "loser"   — acted in time + played but did not win
  //   "no_show" — did NOT act in time, or no stat change detected
  //   "leaker"  — stats changed but player did NOT act in-app within window
  //               (credentials were shared externally)
  type Outcome = "winner" | "loser" | "no_show" | "leaker";
  const outcomes: Record<string, Outcome> = {};

  for (const player of match.players) {
    const pre  = match.preSnapshots[player.userId];
    const post = postSnaps[player.userId];
    const statsChanged = pre && post && post.gamesPlayed > pre.gamesPlayed;
    const inTime = actedInTime(player.userId);

    if (!statsChanged) {
      // No stat movement — player did not play (no-show regardless of action)
      outcomes[player.userId] = "no_show";
    } else if (!inTime) {
      // Stats changed but player never used in-app credentials within 20s
      // → credentials were shared externally (leak)
      outcomes[player.userId] = "leaker";
    } else {
      // Acted in time + played
      const winsDelta = (post?.wins ?? 0) - (pre?.wins ?? 0);
      outcomes[player.userId] = winsDelta >= 1 ? "winner" : "loser";
    }
  }

  console.log(`[settlement] Raw outcomes:`, outcomes);

  // ── Determine settlement scenario (must be done before upsert) ───────────
  // Deep-link to the per-match result page
  const resultUrl = `/#/quickmatch/result/${match.id}`;

  const leakers  = match.players.filter((p) => outcomes[p.userId] === "leaker");
  const victims  = match.players.filter((p) => outcomes[p.userId] !== "leaker");
  const hasLeaker = leakers.length > 0;
  const allNoShow = !hasLeaker && match.players.every((p) => outcomes[p.userId] === "no_show");
  const anyNoShow = !hasLeaker && match.players.some((p) => outcomes[p.userId] === "no_show");

  // Canonical per-player result (what the result page shows)
  // "win"       → beat opponent, prize credited
  // "loss"      → lost, entry fee forfeited
  // "refund"    → match invalid (opponent no-showed or credential leak victim), entry returned
  // "no_show"   → this player didn't join, entry fee forfeited
  // "suspended" → credential leak detected, player banned
  type ResultType = "win" | "loss" | "refund" | "no_show" | "suspended";
  const resultTypes: Record<string, ResultType> = {};
  const coinsEarnedMap: Record<string, number>  = {};

  for (const player of match.players) {
    const outcome = outcomes[player.userId];
    if (hasLeaker) {
      if (outcome === "leaker") {
        resultTypes[player.userId]   = "suspended";
        coinsEarnedMap[player.userId] = 0;
      } else {
        resultTypes[player.userId]   = "refund";
        coinsEarnedMap[player.userId] = match.entryFee;
      }
    } else if (allNoShow) {
      resultTypes[player.userId]   = "no_show";
      coinsEarnedMap[player.userId] = 0;
    } else if (anyNoShow) {
      if (outcome === "no_show") {
        resultTypes[player.userId]   = "no_show";
        coinsEarnedMap[player.userId] = 0;
      } else {
        // This player showed but opponent didn't → refund
        resultTypes[player.userId]   = "refund";
        coinsEarnedMap[player.userId] = match.entryFee;
      }
    } else {
      // Both played normally
      if (outcome === "winner") {
        resultTypes[player.userId]   = "win";
        coinsEarnedMap[player.userId] = match.prizeAmount;
      } else {
        resultTypes[player.userId]   = "loss";
        coinsEarnedMap[player.userId] = 0;
      }
    }
  }

  console.log(`[settlement] Result types:`, resultTypes);

  // ── Upsert verification records (update pre rows created in pre-snapshot) ─
  for (const player of match.players) {
    const pre        = match.preSnapshots[player.userId];
    const post       = postSnaps[player.userId];
    const outcome    = outcomes[player.userId];
    const resultType = resultTypes[player.userId];
    const coinsEarned = coinsEarnedMap[player.userId] ?? 0;
    const opponent   = match.players.find((p) => p.userId !== player.userId);

    const statDiff = JSON.stringify({
      ...(pre && post
        ? {
            gamesPlayedDelta: post.gamesPlayed - pre.gamesPlayed,
            winsDelta:        post.wins        - pre.wins,
            killsDelta:       post.kills       - pre.kills,
            damageDelta:      post.damage      - pre.damage,
            deathsDelta:      post.deaths      - pre.deaths,
          }
        : {}),
      // Result page context — authoritative, derived before any payment
      resultType,
      coinsEarned,
      entryFee:       match.entryFee,
      prizeAmount:    match.prizeAmount,
      opponentUserId: opponent?.userId ?? null,
      opponentName:   opponent?.inGameName ?? null,
    });

    // Store "suspended" for credential-leak players so the result page can
    // show the correct state. All other outcome values pass through as-is.
    const dbOutcome = outcome === "leaker" ? "suspended" : outcome;

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
        outcome:       dbOutcome,
        rewardGranted: outcome === "winner",
      })
      .onConflictDoUpdate({
        target: [quickmatchVerificationsTable.matchId, quickmatchVerificationsTable.userId],
        set: {
          postSnapshotAt:   post ? new Date(post.fetchedAt) : null,
          postSnapshotData: post ? JSON.stringify(post)      : null,
          statDiff,
          outcome:       dbOutcome,
          rewardGranted: outcome === "winner",
        },
      })
      .catch((err: unknown) => console.error("[settlement] Failed to upsert verification:", err));
  }

  // ── Leak detection: suspend leaker, cancel, refund victim ─────────────────
  if (leakers.length > 0) {
    const banUntil = new Date(Date.now() + LEAK_BAN_HOURS * 60 * 60 * 1000);

    for (const leaker of leakers) {
      const leakerId = Number(leaker.userId);
      console.log(`[settlement] Credential leak detected: player=${leakerId}. Suspending until ${banUntil.toISOString()}`);

      // 1. Apply 12-hour QuickMatch suspension
      await db
        .update(usersTable)
        .set({ quickmatchBannedUntil: banUntil })
        .where(eq(usersTable.id, leakerId))
        .catch((err: unknown) => console.error("[settlement] Failed to set ban:", err));

      // 2. Insert security flag
      db.insert(securityFlagsTable)
        .values({
          userId:     leakerId,
          type:       "quickmatch_credential_leak",
          severity:   "high",
          details:    `Stats changed but no in-app credential action recorded within ${getJoinWindowMs() / 1000}s. Room credentials likely shared externally. Match ID: ${match.id}. Suspended until ${banUntil.toISOString()}.`,
          autoAction: "suspended_12h",
        })
        .catch(() => {});

      // 3. Notify leaker
      await notify(leakerId, {
        type:  "quickmatch_result",
        title: "Credential Leak — Suspended",
        body:  `You shared room credentials outside the app. Your QuickMatch access is suspended for ${LEAK_BAN_HOURS} hours.`,
        url:   resultUrl,
      }).catch(() => {});
    }

    // 4. Refund and notify victims (players who did not leak)
    for (const victim of victims) {
      const victimId = Number(victim.userId);
      if (match.entryFee > 0) {
        await creditPlayer(
          victimId,
          match.entryFee,
          "QuickMatch Credential Leak Refund",
          "quickmatch_leak_refund",
          "withdraw_refund",
        ).catch((err: unknown) => console.error("[settlement] Failed to refund victim:", err));
      }
      await notify(victimId, {
        type:  "quickmatch_result",
        title: "Match Cancelled — Opponent Suspended",
        body:  `Your opponent shared room credentials externally. They've been suspended and your ${match.entryFee > 0 ? `${match.entryFee} coin entry fee has been refunded` : "match has been cancelled"}.`,
        url:   resultUrl,
      }).catch(() => {});
    }

    dismissMatch(match.id);
    console.log(`[settlement] Match ${match.id} cancelled due to credential leak.`);
    return;
  }

  // ── Standard settlement (no leakers) ─────────────────────────────────────
  //
  // Decision tree:
  //   allNoShow          → both forfeit entry fee (neither played, no refund)
  //   anyNoShow (not all)→ one played, one didn't:
  //                          • no-show player  : forfeits entry fee
  //                          • player who played: refunded entry fee (match invalid)
  //   neither no-shows   → both played: winner earns prize, loser keeps nothing
  // (allNoShow / anyNoShow already computed above before upsert)

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
          url:   resultUrl,
        });

      } else if (anyNoShow) {
        if (outcome === "no_show") {
          // This player didn't show — forfeits entry fee
          await notify(userId, {
            type:  "quickmatch_result",
            title: "No-Show",
            body:  "You didn't join the room in time. Entry fee forfeited.",
            url:   resultUrl,
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
            url:   resultUrl,
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
            url:   resultUrl,
          });
        } else {
          await notify(userId, {
            type:  "quickmatch_result",
            title: "Match Complete",
            body:  "Good game! Better luck next time.",
            url:   resultUrl,
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
