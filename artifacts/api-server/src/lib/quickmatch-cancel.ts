/**
 * cancelMatch — transitions a match to CANCELLED, refunds both players,
 * and sends push/SSE notifications.
 *
 * Safe to call multiple times (idempotent if match is already CANCELLED or missing).
 */

import { eq, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  walletTransactionsTable,
  balanceChangeLogsTable,
} from "@workspace/db";
import { pushToUser } from "./sse-manager.js";
import { notify } from "./push.js";
import {
  getMatchById,
  forceSetState,
  dismissMatch,
  type QuickMatch,
} from "./quickmatch-matches.js";
import { markWorkerFree } from "./worker-tokens.js";

export async function cancelMatch(
  matchId: string,
  reason: string,
  match?: QuickMatch,
): Promise<void> {
  const m = match ?? getMatchById(matchId);
  if (!m) return;
  if (m.currentState === "CANCELLED" || m.currentState === "FINALIZED") return;

  forceSetState(matchId, "CANCELLED");

  // Free the assigned worker
  if (m.workerId) {
    markWorkerFree(m.workerId).catch(() => {});
  }

  const resultUrl = `/#/quickmatch/result/${matchId}`;
  const [p1, p2] = m.players;

  for (const player of m.players) {
    const userId = Number(player.userId);

    // Refund entry fee
    if (m.entryFee > 0) {
      try {
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
            .set({ diamondBalance: user.diamond_balance + m.entryFee })
            .where(eq(usersTable.id, userId));
          await tx.insert(walletTransactionsTable).values({
            userId,
            type: "refund",
            amount: m.entryFee,
            label: `QuickMatch Refund: ${reason}`,
          });
          await tx.insert(balanceChangeLogsTable).values({
            userId,
            adminId: null,
            amount: m.entryFee,
            balanceBefore: user.diamond_balance,
            balanceAfter: user.diamond_balance + m.entryFee,
            reason: `QuickMatch cancelled: ${reason}`,
            source: "quickmatch_cancel_refund",
          });
        });
      } catch (err) {
        console.error(`[cancelMatch] Failed to refund player ${userId}:`, err);
      }
    }

    // Push SSE
    pushToUser(userId, "quickmatch_cancelled", {
      matchId,
      reason,
      refunded: m.entryFee,
    });

    // Push notification
    notify(userId, {
      type: "quickmatch_result",
      title: "Match Cancelled",
      body: m.entryFee > 0
        ? `Your match was cancelled (${reason}). Your ${m.entryFee} coin entry fee has been refunded.`
        : `Your match was cancelled: ${reason}.`,
      url: resultUrl,
    }).catch(() => {});
  }

  dismissMatch(matchId);
  console.log(`[cancelMatch] Match ${matchId} cancelled: ${reason}`);
}

/**
 * Apply join-window penalties when the window closes.
 *
 * Both confirmed → transition to IN_GAME (no penalty).
 * One confirmed → confirmer refunded 100%; absent player loses 50%.
 * Neither confirmed → both lose 50%.
 */
export async function applyJoinWindowPenalties(match: QuickMatch): Promise<void> {
  if (match.currentState === "CANCELLED" || match.noShowHandled) return;

  const [p1, p2] = match.players;
  if (!p1 || !p2) return;

  const p1Confirmed = match.joinConfirmed[p1.userId] ?? false;
  const p2Confirmed = match.joinConfirmed[p2.userId] ?? false;

  // Both confirmed — advance to IN_GAME, no penalties
  if (p1Confirmed && p2Confirmed) {
    try {
      forceSetState(match.id, "IN_GAME");
    } catch {}
    pushToUser(Number(p1.userId), "quickmatch_join_window", { matchId: match.id, state: "IN_GAME", p1Confirmed, p2Confirmed });
    pushToUser(Number(p2.userId), "quickmatch_join_window", { matchId: match.id, state: "IN_GAME", p1Confirmed, p2Confirmed });
    return;
  }

  match.noShowHandled = true;
  forceSetState(match.id, "CANCELLED");

  const resultUrl = `/#/quickmatch/result/${match.id}`;

  if (!p1Confirmed && !p2Confirmed) {
    // Neither confirmed — both lose 50%
    console.log(`[joinWindow] Match ${match.id}: neither confirmed — both lose 50%`);
    for (const player of match.players) {
      const userId = Number(player.userId);
      const penalty = Math.floor(match.entryFee * 0.5);
      if (match.entryFee > 0 && penalty > 0) {
        const refundAmount = match.entryFee - penalty; // return 50%
        if (refundAmount > 0) {
          await db.transaction(async (tx: any) => {
            const uRes = await tx.execute(
              sql`SELECT id, diamond_balance FROM users WHERE id = ${userId} FOR UPDATE`,
            );
            const user = ((uRes as any).rows ?? uRes)[0] as { id: number; diamond_balance: number } | undefined;
            if (!user) return;
            await tx.update(usersTable).set({ diamondBalance: user.diamond_balance + refundAmount }).where(eq(usersTable.id, userId));
            await tx.insert(walletTransactionsTable).values({ userId, type: "refund", amount: refundAmount, label: "QuickMatch: Partial Refund (Neither Joined)" });
            await tx.insert(balanceChangeLogsTable).values({ userId, adminId: null, amount: refundAmount, balanceBefore: user.diamond_balance, balanceAfter: user.diamond_balance + refundAmount, reason: "QuickMatch join window: neither confirmed", source: "quickmatch_join_penalty" });
          }).catch((err: unknown) => console.error("[joinWindow] Refund failed:", err));
        }
      }
      pushToUser(userId, "quickmatch_join_window", { matchId: match.id, state: "NO_SHOW", refunded: match.entryFee > 0 ? Math.floor(match.entryFee * 0.5) : 0 });
      notify(userId, { type: "quickmatch_result", title: "Match Penalty", body: `Neither player confirmed joining. ${match.entryFee > 0 ? `You forfeit 50% of your entry fee.` : "Match cancelled."}`, url: resultUrl }).catch(() => {});
    }
  } else {
    // One confirmed — confirmer gets full refund, absent loses 50%
    const confirmedPlayer = p1Confirmed ? p1 : p2;
    const absentPlayer   = p1Confirmed ? p2 : p1;
    console.log(`[joinWindow] Match ${match.id}: ${confirmedPlayer.userId} confirmed, ${absentPlayer.userId} absent`);

    // Refund the confirmer
    if (match.entryFee > 0) {
      const cId = Number(confirmedPlayer.userId);
      await db.transaction(async (tx: any) => {
        const uRes = await tx.execute(sql`SELECT id, diamond_balance FROM users WHERE id = ${cId} FOR UPDATE`);
        const user = ((uRes as any).rows ?? uRes)[0] as { id: number; diamond_balance: number } | undefined;
        if (!user) return;
        await tx.update(usersTable).set({ diamondBalance: user.diamond_balance + match.entryFee }).where(eq(usersTable.id, cId));
        await tx.insert(walletTransactionsTable).values({ userId: cId, type: "refund", amount: match.entryFee, label: "QuickMatch Refund: Opponent No-Show" });
        await tx.insert(balanceChangeLogsTable).values({ userId: cId, adminId: null, amount: match.entryFee, balanceBefore: user.diamond_balance, balanceAfter: user.diamond_balance + match.entryFee, reason: "QuickMatch: opponent no-show refund", source: "quickmatch_join_penalty" });
      }).catch((err: unknown) => console.error("[joinWindow] Confirmer refund failed:", err));

      // Deduct 50% from absent player (they already paid — we just don't refund 50%)
      const aId = Number(absentPlayer.userId);
      const absentRefund = Math.floor(match.entryFee * 0.5);
      if (absentRefund > 0) {
        await db.transaction(async (tx: any) => {
          const uRes = await tx.execute(sql`SELECT id, diamond_balance FROM users WHERE id = ${aId} FOR UPDATE`);
          const user = ((uRes as any).rows ?? uRes)[0] as { id: number; diamond_balance: number } | undefined;
          if (!user) return;
          await tx.update(usersTable).set({ diamondBalance: user.diamond_balance + absentRefund }).where(eq(usersTable.id, aId));
          await tx.insert(walletTransactionsTable).values({ userId: aId, type: "refund", amount: absentRefund, label: "QuickMatch Partial Refund: No-Show Penalty" });
          await tx.insert(balanceChangeLogsTable).values({ userId: aId, adminId: null, amount: absentRefund, balanceBefore: user.diamond_balance, balanceAfter: user.diamond_balance + absentRefund, reason: "QuickMatch: no-show 50% penalty applied", source: "quickmatch_join_penalty" });
        }).catch((err: unknown) => console.error("[joinWindow] Absent refund failed:", err));
      }
    }

    pushToUser(Number(confirmedPlayer.userId), "quickmatch_join_window", { matchId: match.id, state: "REFUNDED", reason: "opponent_no_show", refunded: match.entryFee });
    pushToUser(Number(absentPlayer.userId),    "quickmatch_join_window", { matchId: match.id, state: "NO_SHOW",  reason: "you_didnt_join",  refunded: match.entryFee > 0 ? Math.floor(match.entryFee * 0.5) : 0 });

    notify(Number(confirmedPlayer.userId), { type: "quickmatch_result", title: "Opponent No-Show — Refunded", body: `Your opponent didn't join.${match.entryFee > 0 ? ` Your ${match.entryFee} coin entry fee has been refunded.` : ""}`, url: resultUrl }).catch(() => {});
    notify(Number(absentPlayer.userId),    { type: "quickmatch_result", title: "Join Penalty Applied", body: `You didn't confirm joining.${match.entryFee > 0 ? ` You forfeit 50% of your entry fee.` : ""}`, url: resultUrl }).catch(() => {});
  }

  dismissMatch(match.id);
}
