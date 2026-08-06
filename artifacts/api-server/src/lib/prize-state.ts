/**
 * Prize state machine helpers.
 *
 * All prize state mutations MUST go through this module.
 * Every transition uses an atomic WHERE-guard UPDATE so concurrent
 * calls cannot double-apply a transition.
 *
 * State path: NOT_CREATED → PENDING → LOCKED → FINALIZED | REVERSED
 */

import { eq, sql, and } from "drizzle-orm";
import { db, quickmatchPrizesTable, walletTransactionsTable, usersTable } from "@workspace/db";
import { pushToUser } from "./sse-manager.js";
import { notify } from "./push.js";

export type PrizeState = "NOT_CREATED" | "PENDING" | "LOCKED" | "FINALIZED" | "REVERSED";

/**
 * Atomically transition a prize from `from` → `to`.
 * The UPDATE only succeeds if the current state equals `from`.
 * Returns true if the transition was applied; false if it was a no-op
 * (wrong state — likely a duplicate call or race condition).
 */
export async function transitionPrize(
  matchId: string,
  from: PrizeState,
  to: PrizeState,
): Promise<boolean> {
  const result = await db
    .update(quickmatchPrizesTable)
    .set({ state: to, stateChangedAt: new Date() })
    .where(
      and(
        eq(quickmatchPrizesTable.matchId, matchId),
        eq(quickmatchPrizesTable.state, from),
      ),
    )
    .returning({ id: quickmatchPrizesTable.id });

  return result.length > 0;
}

/**
 * Seed a NOT_CREATED prize row when a match is created.
 * Idempotent — uses ON CONFLICT DO NOTHING so safe to call multiple times.
 */
export async function seedPrize(matchId: string, prizeAmount: number): Promise<void> {
  await db
    .insert(quickmatchPrizesTable)
    .values({ matchId, prizeAmount, state: "NOT_CREATED" })
    .onConflictDoNothing()
    .catch((err: unknown) => console.error("[prize-state] Failed to seed prize:", err));
}

/**
 * Transition NOT_CREATED → PENDING and insert a pending wallet_transactions row.
 * Does NOT update diamond_balance — that only happens in finalizePrize().
 *
 * Idempotency: checks for an existing wallet_transactions row with this payoutId
 * before inserting — safe against retries.
 *
 * Returns true if the transition was applied.
 */
export async function pendingPrize(
  matchId: string,
  winnerUserId: number,
  ocrResult: Record<string, unknown>,
): Promise<boolean> {
  // Fetch prize row to get payoutId and prizeAmount
  const prize = await db.query.quickmatchPrizesTable.findFirst({
    where: (t, { eq }) => eq(t.matchId, matchId),
  });
  if (!prize) {
    console.error(`[prize-state] pendingPrize: no prize row for match ${matchId}`);
    return false;
  }

  // Atomic transition NOT_CREATED → PENDING with winner + ocr data
  const result = await db
    .update(quickmatchPrizesTable)
    .set({
      state: "PENDING",
      stateChangedAt: new Date(),
      winnerUserId,
      ocrResult,
    })
    .where(
      and(
        eq(quickmatchPrizesTable.matchId, matchId),
        eq(quickmatchPrizesTable.state, "NOT_CREATED"),
      ),
    )
    .returning({ id: quickmatchPrizesTable.id });

  if (result.length === 0) {
    console.warn(`[prize-state] pendingPrize: transition guard failed for match ${matchId} (already moved?)`);
    return false;
  }

  // Idempotency guard: only insert wallet_transactions row if none exists for this payoutId
  const payoutId = String(prize.payoutId);
  const existing = await db.query.walletTransactionsTable.findFirst({
    where: (t, { eq }) => eq(t.payoutId, payoutId),
  });

  if (!existing) {
    await db.insert(walletTransactionsTable).values({
      userId: winnerUserId,
      type: "prize",
      amount: prize.prizeAmount,
      label: `QuickMatch Prize (Pending Verification) — Match ${matchId}`,
      status: "pending",
      payoutId,
    }).catch((err: unknown) => console.error("[prize-state] Failed to insert pending transaction:", err));
  }

  return true;
}

/**
 * PENDING → LOCKED.
 * Called when the dispute window opens (immediately after PROVISIONAL_WIN).
 */
export async function lockPrize(matchId: string): Promise<boolean> {
  return transitionPrize(matchId, "PENDING", "LOCKED");
}

/**
 * LOCKED → FINALIZED.
 * Adds the prize amount to the winner's diamond_balance and marks
 * the wallet_transactions row as settled.
 *
 * Returns true if the transition was applied.
 */
export async function finalizePrize(matchId: string): Promise<boolean> {
  const prize = await db.query.quickmatchPrizesTable.findFirst({
    where: (t, { eq }) => eq(t.matchId, matchId),
  });
  if (!prize || !prize.winnerUserId) {
    console.error(`[prize-state] finalizePrize: missing prize or winner for match ${matchId}`);
    return false;
  }

  const applied = await db.transaction(async (tx: any) => {
    // Atomic transition guard
    const updated = await tx
      .update(quickmatchPrizesTable)
      .set({ state: "FINALIZED", stateChangedAt: new Date() })
      .where(
        and(
          eq(quickmatchPrizesTable.matchId, matchId),
          eq(quickmatchPrizesTable.state, "LOCKED"),
        ),
      )
      .returning({ id: quickmatchPrizesTable.id });

    if (updated.length === 0) return false;

    // Increment winner's diamond_balance
    const uRes = await tx.execute(
      sql`SELECT id, diamond_balance FROM users WHERE id = ${prize.winnerUserId} FOR UPDATE`,
    );
    const user = ((uRes as any).rows ?? uRes)[0] as { id: number; diamond_balance: number } | undefined;
    if (user) {
      await tx
        .update(usersTable)
        .set({ diamondBalance: user.diamond_balance + prize.prizeAmount })
        .where(eq(usersTable.id, prize.winnerUserId!));
    }

    // Settle the pending wallet_transactions row
    const payoutId = String(prize.payoutId);
    await tx
      .update(walletTransactionsTable)
      .set({ status: "settled" })
      .where(eq(walletTransactionsTable.payoutId, payoutId));

    return true;
  });

  if (applied) {
    // Push notification to winner
    pushToUser(prize.winnerUserId, "quickmatch_prize_finalized", {
      matchId,
      prizeAmount: prize.prizeAmount,
    });
    notify(prize.winnerUserId, {
      type: "quickmatch_result",
      title: "Prize Credited! 💎",
      body: `${prize.prizeAmount} diamonds have been added to your wallet.`,
      url: `/#/quickmatch/result/${matchId}`,
    }).catch(() => {});
  }

  return applied;
}

/**
 * LOCKED → REVERSED.
 * Voids the pending wallet_transactions row (does NOT add to balance).
 * Caller is responsible for crediting the actual winner separately (Task 16).
 *
 * Returns true if the transition was applied.
 */
export async function reversePrize(matchId: string): Promise<boolean> {
  const prize = await db.query.quickmatchPrizesTable.findFirst({
    where: (t, { eq }) => eq(t.matchId, matchId),
  });
  if (!prize) {
    console.error(`[prize-state] reversePrize: no prize row for match ${matchId}`);
    return false;
  }

  const applied = await db.transaction(async (tx: any) => {
    const updated = await tx
      .update(quickmatchPrizesTable)
      .set({ state: "REVERSED", stateChangedAt: new Date() })
      .where(
        and(
          eq(quickmatchPrizesTable.matchId, matchId),
          eq(quickmatchPrizesTable.state, "LOCKED"),
        ),
      )
      .returning({ id: quickmatchPrizesTable.id });

    if (updated.length === 0) return false;

    // Remove the pending wallet_transactions row so the balance is clean
    const payoutId = String(prize.payoutId);
    await tx
      .delete(walletTransactionsTable)
      .where(eq(walletTransactionsTable.payoutId, payoutId));

    return true;
  });

  return applied;
}

/**
 * Get the current prize row for a match.
 */
export async function getPrize(matchId: string) {
  return db.query.quickmatchPrizesTable.findFirst({
    where: (t, { eq }) => eq(t.matchId, matchId),
  });
}
