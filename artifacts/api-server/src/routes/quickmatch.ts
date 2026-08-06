import { Router, type IRouter } from "express";
import { and, eq, isNull, isNotNull, or, sql } from "drizzle-orm";
import { db, usersTable, walletTransactionsTable, balanceChangeLogsTable, quickmatchVerificationsTable } from "@workspace/db";
import { sweepExpiredDisputeWindows } from "./quickmatch-disputes.js";
import {
  getQueueStats,
  joinQueue,
  leaveQueue,
  tryMatch,
  getQueueEntryFee,
  isInQueue,
  sweepExpiredEntries,
  getQueuePosition,
} from "../lib/quickmatch-queue.js";
import {
  createMatch,
  getMatchForPlayer,
  getMatchById,
  getActiveMatches,
  dismissMatch,
  hasPendingRoomRequest,
  getRoomStatus,
  markWebhookFired,
  markActionTaken,
  transitionState,
  recordJoinConfirmed,
  type PlayerProfile,
} from "../lib/quickmatch-matches.js";
import { creditPlayer, checkAndSettleIfEnded, type CheckEndResult } from "../lib/quickmatch-settlement.js";
import { seedPrize } from "../lib/prize-state.js";
import { cancelMatch } from "../lib/quickmatch-cancel.js";
import { dispatchMatchToWorker } from "./quickmatch-workers.js";
import { pushToUser, pushBroadcast } from "../lib/sse-manager.js";
import { notify } from "../lib/push.js";
import { requireAuth } from "../middlewares/auth.js";
import type { QuickMatch } from "../lib/quickmatch-matches.js";

// ─── SSE helpers ──────────────────────────────────────────────────────────────

function pushMatchToPlayers(match: QuickMatch, extra: Record<string, unknown> = {}): void {
  const [p1, p2] = match.players;
  if (!p1 || !p2) return;
  const base = { matchId: match.id, createdAt: match.createdAt, entryFee: match.entryFee, prizeAmount: match.prizeAmount, ...extra };
  pushToUser(Number(p1.userId), "quickmatch_match", { ...base, me: { ...p1, uid: null }, opponent: { ...p2, uid: null } });
  pushToUser(Number(p2.userId), "quickmatch_match", { ...base, me: { ...p2, uid: null }, opponent: { ...p1, uid: null } });
}

function broadcastStats(): void {
  pushBroadcast("quickmatch_stats", getQueueStats());
}

const router: IRouter = Router();

const MACRO_BASE = "https://trigger.macrodroid.com/98315e1f-abce-4c9f-ab7d-87004928eb82";

// Known prize pools — must match frontend PRIZE_POOLS
const PRIZE_POOLS = [
  { entry: 12, prize: 20 },
  { entry: 30, prize: 50 },
  { entry: 42, prize: 70 },
];

function findPrizePool(entry: number, prize: number) {
  return PRIZE_POOLS.find((p) => p.entry === entry && p.prize === prize) ?? null;
}

function buildWebhookUrl(uid1: string | null, uid2: string | null): string {
  const base = `${MACRO_BASE}/clashren`;
  const params = new URLSearchParams({
    game_mode: "89UB",
    "players_uid(0)": uid1 ?? "",
    "players_uid(1)": uid2 ?? "",
  });
  return `${base}?${params.toString()}`;
}

async function fireMacroDroidWithUids(
  matchId: string,
  uid1: string | null,
  uid2: string | null,
): Promise<void> {
  markWebhookFired(matchId);
  const webhookUrl = buildWebhookUrl(uid1, uid2);
  try {
    await fetch(webhookUrl, { method: "GET", signal: AbortSignal.timeout(12_000) });
  } catch { /* best effort */ }
}

async function fetchPlayers(userIds: string[]): Promise<PlayerProfile[]> {
  const ids = userIds.map(Number).filter(Boolean);
  if (!ids.length) return userIds.map((id) => ({ userId: id, inGameName: "Player" }));
  const rows = await db
    .select({
      id: usersTable.id,
      inGameName: usersTable.inGameName,
      profilePicture: usersTable.profilePicture,
      uid: usersTable.uid,
    })
    .from(usersTable)
    .where(or(...ids.map((id) => eq(usersTable.id, id))));

  return userIds.map((uid) => {
    const row = rows.find((r) => String(r.id) === uid);
    return {
      userId: uid,
      inGameName: row?.inGameName ?? "Player",
      profilePicture: row?.profilePicture ?? null,
      uid: row?.uid ?? null,
    };
  });
}

// Modes that currently have MacroDroid support
const MODE_MACRO_SUPPORTED = new Set(["duel", "healing", "knife"]);

const VALID_GAME_TYPES = new Set(["cs", "br"]);
const VALID_MODE_IDS = new Set([
  "duel", "healing", "clash-squad", "knife",
  "solo-drop", "duo-rush", "squad-wipe", "zone-control",
]);

function validateQueueBody(
  body: { gameType?: string; modeId?: string },
  res: import("express").Response,
): { gameType: string; modeId: string } | null {
  const { gameType, modeId } = body;
  if (!gameType || !modeId) {
    res.status(400).json({ error: "gameType and modeId are required" });
    return null;
  }
  if (!VALID_GAME_TYPES.has(gameType)) {
    res.status(400).json({ error: "Invalid gameType." });
    return null;
  }
  if (!VALID_MODE_IDS.has(modeId)) {
    res.status(400).json({ error: "Invalid modeId." });
    return null;
  }
  return { gameType, modeId };
}

// Refund helper — used for expired queue entries
async function refundQueueEntry(
  userId: number,
  amount: number,
  label: string,
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
      type: "withdraw_refund",
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
      source: "quickmatch_ttl_expire",
    });
  });
}

// ─── Stuck-RESULT_PENDING sweep ───────────────────────────────────────────────
// If a player fails to upload a screenshot within the 80s window (network error,
// app close, etc.) the match stays in RESULT_PENDING indefinitely, blocking both
// players from joining new matches. This sweep auto-cancels stale RESULT_PENDING
// matches and issues full refunds to both players.
const RESULT_PENDING_CANCEL_MS = 5 * 60 * 1000; // 5 minutes before auto-cancel
async function sweepStuckResultPending(): Promise<void> {
  const matches = getActiveMatches();
  for (const match of matches) {
    if (match.currentState !== "RESULT_PENDING") continue;
    const age = match.resultPendingAt
      ? Date.now() - match.resultPendingAt
      : Date.now() - new Date(match.createdAt).getTime();
    if (age < RESULT_PENDING_CANCEL_MS) continue;
    console.log(`[result-pending-sweep] Cancelling stuck RESULT_PENDING match ${match.id} (age=${Math.round(age / 1000)}s)`);
    cancelMatch(match.id, "screenshot_window_expired", match).catch((err) =>
      console.error(`[result-pending-sweep] Cancel failed for ${match.id}:`, err),
    );
  }
}

// Background sweep — runs every 2 minutes
// 1. Refund timed-out queue entries
// 2. Auto-finalize dispute windows that expired without a dispute
// 3. Cancel RESULT_PENDING matches whose screenshot window expired
setInterval(async () => {
  // Queue TTL refunds
  const expired = sweepExpiredEntries();
  for (const entry of expired) {
    if (entry.entryFee > 0) {
      refundQueueEntry(Number(entry.userId), entry.entryFee, "QuickMatch Queue Timeout Refund")
        .catch((err) => console.error("[quickmatch] TTL refund failed:", err));
    }
  }
  // Dispute window auto-finalize
  sweepExpiredDisputeWindows().catch((err) =>
    console.error("[quickmatch] Dispute sweep failed:", err),
  );
  // Stuck RESULT_PENDING auto-cancel
  sweepStuckResultPending().catch((err) =>
    console.error("[quickmatch] Result-pending sweep failed:", err),
  );
}, 2 * 60 * 1000);

// ─── Join Queue ───────────────────────────────────────────────────────────────
router.post("/quickmatch/search/join", requireAuth, async (req, res) => {
  const userId    = String(req.user!.userId);
  const userIdNum = req.user!.userId;
  const valid = validateQueueBody(req.body, res);
  if (!valid) return;

  const rawEntry = Number((req.body as any).entryFee ?? 0);
  const rawPrize = Number((req.body as any).prizeAmount ?? 0);
  const entryFee    = isNaN(rawEntry) ? 0 : rawEntry;
  const prizeAmount = isNaN(rawPrize) ? 0 : rawPrize;

  // Validate prize pool selection
  if (entryFee > 0 || prizeAmount > 0) {
    if (!findPrizePool(entryFee, prizeAmount)) {
      res.status(400).json({ error: "Invalid prize pool selection" });
      return;
    }
  }

  // Already in an active match → return immediately
  const existingMatch = getMatchForPlayer(userId);
  if (existingMatch) {
    res.json({ ok: true, matched: true, matchId: existingMatch.id });
    return;
  }

  // Already in queue → idempotent
  if (isInQueue(userId, valid.gameType, valid.modeId)) {
    res.json({ ok: true, matched: false, queued: true });
    return;
  }

  // Check quickmatch-specific ban
  const userRow = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userIdNum),
    columns: {
      id: true,
      diamondBalance: true,
      quickmatchBannedUntil: true,
    },
  });
  if (!userRow) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (userRow.quickmatchBannedUntil && userRow.quickmatchBannedUntil > new Date()) {
    res.status(403).json({
      error: "You are suspended from QuickMatch",
      bannedUntil: userRow.quickmatchBannedUntil.toISOString(),
    });
    return;
  }

  // Negative balance guard — players with negative balance cannot join
  if (userRow.diamondBalance < 0) {
    res.status(402).json({
      error: "Your balance is negative. Please top up before joining a match.",
      code: "negative_balance",
    });
    return;
  }

  // Balance check + deduction (DB transaction)
  if (entryFee > 0) {
    let joinError: "user_not_found" | "insufficient_balance" | null = null;
    await db.transaction(async (tx: any) => {
      const uRes = await tx.execute(
        sql`SELECT id, diamond_balance FROM users WHERE id = ${userIdNum} FOR UPDATE`,
      );
      const lockedUser = ((uRes as any).rows ?? uRes)[0] as
        | { id: number; diamond_balance: number }
        | undefined;
      if (!lockedUser) { joinError = "user_not_found"; return; }
      if (lockedUser.diamond_balance < entryFee) {
        joinError = "insufficient_balance";
        return;
      }
      await tx
        .update(usersTable)
        .set({ diamondBalance: lockedUser.diamond_balance - entryFee })
        .where(eq(usersTable.id, userIdNum));
      await tx.insert(walletTransactionsTable).values({
        userId: userIdNum,
        type: "entry",
        amount: -entryFee,
        label: `QuickMatch Entry (${valid.gameType.toUpperCase()} ${valid.modeId})`,
      });
      await tx.insert(balanceChangeLogsTable).values({
        userId: userIdNum,
        adminId: null,
        amount: -entryFee,
        balanceBefore: lockedUser.diamond_balance,
        balanceAfter: lockedUser.diamond_balance - entryFee,
        reason: "QuickMatch entry fee",
        source: "quickmatch_join",
      });
    });
    if (joinError === "user_not_found") {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (joinError === "insufficient_balance") {
      // HTTP 402 = payment required
      res.status(402).json({ error: "insufficient_balance" });
      return;
    }
  }

  // Enqueue player — may return an expired entry that must be refunded
  const expiredEntry = joinQueue(userId, valid.gameType, valid.modeId, entryFee);
  if (expiredEntry && expiredEntry.entryFee > 0) {
    refundQueueEntry(Number(userId), expiredEntry.entryFee, "QuickMatch Queue Timeout Refund")
      .catch((err) => console.error("[quickmatch] Expired-entry refund failed:", err));
  }

  // Attempt match-making — only match players with same entry fee
  if (MODE_MACRO_SUPPORTED.has(valid.modeId) && !hasPendingRoomRequest()) {
    const playerIds = tryMatch(valid.gameType, valid.modeId, entryFee);
    if (playerIds) {
      const players = await fetchPlayers(playerIds);
      const match   = createMatch(players, valid.gameType, valid.modeId, entryFee, prizeAmount);
      // Seed prize row immediately so the state machine is ready
      if (prizeAmount > 0) {
        seedPrize(match.id, prizeAmount).catch((err) =>
          console.error("[quickmatch] Failed to seed prize:", err),
        );
      }
      // Transition to WAITING_FOR_ROOM then dispatch to worker phone
      try { transitionState(match.id, "MATCHED", "WAITING_FOR_ROOM"); } catch {}
      // One-fire guard: only fire if not already fired for this match
      if (!match.webhookFired) {
        dispatchMatchToWorker(match).catch((err) => {
          console.error("[quickmatch] Worker dispatch failed:", err);
        });
      }
      // SSE: notify both players immediately — no poll needed
      pushMatchToPlayers(match, { status: "waiting_room", roomStatus: "opponent_found" });
      // Push notification: opponent found
      for (const player of match.players) {
        notify(Number(player.userId), {
          type: "quickmatch_match",
          title: "⚡ Opponent Found!",
          body: "A match has been found. Room is being created — stay in the app!",
          url: `/#/quickmatch/${match.gameType}/${match.modeId}`,
        }).catch(() => {});
      }
      broadcastStats();
      res.json({ ok: true, matched: true });
      return;
    }
  }

  broadcastStats();
  res.json({ ok: true, matched: false });
});

// ─── Leave Queue ──────────────────────────────────────────────────────────────
router.post("/quickmatch/search/leave", requireAuth, async (req, res) => {
  const userId    = String(req.user!.userId);
  const userIdNum = req.user!.userId;
  const valid = validateQueueBody(req.body, res);
  if (!valid) return;

  // Reject if player is in a locked active match (waiting_room OR credentials_ready)
  const activeMatch = getMatchForPlayer(userId);
  if (activeMatch) {
    res.status(409).json({
      error: "Cannot leave while in an active match",
      code: "match_locked",
    });
    return;
  }

  const refundAmount = getQueueEntryFee(userId, valid.gameType, valid.modeId);
  leaveQueue(userId, valid.gameType, valid.modeId);

  // Refund entry fee if applicable
  if (refundAmount > 0) {
    try {
      await db.transaction(async (tx: any) => {
        const uRes = await tx.execute(
          sql`SELECT id, diamond_balance FROM users WHERE id = ${userIdNum} FOR UPDATE`,
        );
        const lockedUser = ((uRes as any).rows ?? uRes)[0] as
          | { id: number; diamond_balance: number }
          | undefined;
        if (!lockedUser) return;
        await tx
          .update(usersTable)
          .set({ diamondBalance: lockedUser.diamond_balance + refundAmount })
          .where(eq(usersTable.id, userIdNum));
        await tx.insert(walletTransactionsTable).values({
          userId: userIdNum,
          type: "withdraw_refund",
          amount: refundAmount,
          label: "QuickMatch Queue Exit Refund",
        });
        await tx.insert(balanceChangeLogsTable).values({
          userId: userIdNum,
          adminId: null,
          amount: refundAmount,
          balanceBefore: lockedUser.diamond_balance,
          balanceAfter: lockedUser.diamond_balance + refundAmount,
          reason: "QuickMatch queue exit refund",
          source: "quickmatch_leave",
        });
      });
    } catch (err) {
      console.error("[quickmatch] Refund failed on leave:", err);
    }
  }

  broadcastStats();
  res.json({ ok: true, refunded: refundAmount });
});

// ─── Queue position ───────────────────────────────────────────────────────────
// Returns how many players are ahead in the same mode and the estimated wait.
router.get("/quickmatch/position", requireAuth, (req, res) => {
  const userId   = String(req.user!.userId);
  const { gameType, modeId } = req.query as { gameType?: string; modeId?: string };
  if (!gameType || !modeId) {
    res.status(400).json({ error: "gameType and modeId are required" });
    return;
  }
  const position = getQueuePosition(userId, gameType, modeId);
  // Rough estimate: ~30s per match ahead in queue
  const estimatedWaitSeconds = position === null ? null : position * 30;
  res.json({ position, estimatedWaitSeconds, inQueue: position !== null });
});

// ─── Poll match status ────────────────────────────────────────────────────────
router.get("/quickmatch/match", requireAuth, (req, res) => {
  const userId = String(req.user!.userId);
  const match  = getMatchForPlayer(userId);
  if (!match) {
    res.json({ status: "none" });
    return;
  }

  const roomStatus = getRoomStatus(match);
  // Return player profiles without opponent UID (keep own UID server-side)
  const opponentRaw = match.players.find((p) => p.userId !== userId) ?? null;
  const meRaw       = match.players.find((p) => p.userId === userId)  ?? null;

  // Strip UIDs from both players — UIDs must never be client-facing
  const opponent = opponentRaw ? { ...opponentRaw, uid: null } : null;
  const me       = meRaw       ? { ...meRaw,       uid: null } : null;

  if (roomStatus === "ready" && match.credentials) {
    res.json({
      status: "ready",
      matchId: match.id,
      createdAt: match.createdAt,
      roomId: match.credentials.roomId,
      password: match.credentials.password,
      openInFfUrl: match.credentials.openInFfUrl ?? null,
      gameType: match.gameType,
      modeId: match.modeId,
      roomStatus,
      credentialsReadyAt: match.credentialsReadyAt ?? null,
      entryFee: match.entryFee,
      prizeAmount: match.prizeAmount,
      currentState: match.currentState,
      me,
      opponent,
    });
    return;
  }

  res.json({
    status: "waiting_room",
    matchId: match.id,
    createdAt: match.createdAt,
    gameType: match.gameType,
    modeId: match.modeId,
    roomStatus,
    entryFee: match.entryFee,
    prizeAmount: match.prizeAmount,
    currentState: match.currentState,
    me,
    opponent,
  });
});

// ─── Track join-intent action ─────────────────────────────────────────────────
router.post("/quickmatch/match/action", requireAuth, (req, res) => {
  const userId    = String(req.user!.userId);
  const userIdNum = req.user!.userId;
  const { action, matchId: reqMatchId } = req.body as { action?: string; matchId?: string };
  if (!action || !["copy_room", "copy_pass", "open_ff", "joined"].includes(action)) {
    res.status(400).json({ error: "Invalid action. Use: copy_room, copy_pass, open_ff, joined" });
    return;
  }
  // Prefer matchId from body; fall back to player's active match
  const match = (reqMatchId ? getMatchById(reqMatchId) : null) ?? getMatchForPlayer(userId);
  if (!match || !match.playerIds.includes(userId)) {
    res.status(404).json({ error: "No active match" });
    return;
  }
  markActionTaken(match.id, userId);

  // Record join confirmation for join-window penalty logic
  if (action === "joined") {
    // Bridge legacy action endpoint into the new join-window confirmation system
    // so penalty/refund logic works regardless of which endpoint the client calls.
    recordJoinConfirmed(match.id, userId);

    notify(userIdNum, {
      type:  "quickmatch_joined",
      title: "You're In! 🎮",
      body:  "Room credentials saved. Head to Free Fire and join the custom room — good luck!",
      url:   `/#/quickmatch/${match.gameType}/${match.modeId}`,
    }).catch(() => {});
  }

  res.json({ ok: true });
});

// ─── Dedicated join confirmation endpoint ─────────────────────────────────────
// Alias for action=joined — cleaner endpoint for the new UI
router.post("/quickmatch/joined", requireAuth, (req, res) => {
  const userId    = String(req.user!.userId);
  const userIdNum = req.user!.userId;
  const { matchId: reqMatchId } = req.body as { matchId?: string };

  const match = (reqMatchId ? getMatchById(reqMatchId) : null) ?? getMatchForPlayer(userId);
  if (!match || !match.playerIds.includes(userId)) {
    res.status(404).json({ error: "No active match" });
    return;
  }

  markActionTaken(match.id, userId);
  recordJoinConfirmed(match.id, userId);

  notify(userIdNum, {
    type:  "quickmatch_joined",
    title: "You're In! 🎮",
    body:  "Room credentials saved. Head to Free Fire and join the custom room — good luck!",
    url:   `/#/quickmatch/${match.gameType}/${match.modeId}`,
  }).catch(() => {});

  res.json({ ok: true });
});

// ─── App-open match-end check ─────────────────────────────────────────────────
// Called when a player brings the app to the foreground after joining the match.
// Fetches fresh stats and settles immediately if they differ from pre-snapshot.
// Falls back to DB lookup so that timer-settled matches are also surfaced.
router.post("/quickmatch/match/check-end", requireAuth, async (req, res) => {
  const userId    = String(req.user!.userId);
  const userIdNum = req.user!.userId;
  const match     = getMatchForPlayer(userId);

  // ── No active in-memory match ────────────────────────────────────────────
  // The match may have already been settled by the 15-min timer fallback
  // (which dismisses it from memory). Scope the lookup to the specific matchId
  // supplied by the client so we never surface an unrelated historical match.
  if (!match) {
    const { matchId: clientMatchId } = req.body as { matchId?: string };

    if (clientMatchId) {
      // Look up the exact match the client knows about
      const settled = await db.query.quickmatchVerificationsTable.findFirst({
        where: (t, { and, eq, isNotNull }) => and(
          eq(t.matchId, clientMatchId),
          eq(t.userId, userIdNum),
          isNotNull(t.outcome),
        ),
      }).catch(() => null);

      if (settled) {
        res.json({ ended: true, matchId: settled.matchId });
      } else {
        res.json({ ended: false, reason: "no_active_match" });
      }
    } else {
      // No matchId provided — cannot safely fall back to an arbitrary historical row
      res.json({ ended: false, reason: "no_active_match" });
    }
    return;
  }

  if (match.status !== "credentials_ready") {
    // Still in waiting_room (credentials not delivered yet)
    res.json({ ended: false, reason: "credentials_not_ready" });
    return;
  }

  // Always go through checkAndSettleIfEnded — it awaits any in-flight
  // settlement promise before returning ended:true, guaranteeing that
  // DB rows exist by the time the client navigates to the result page.
  // (Do NOT short-circuit on noShowHandled here; that bypasses the await.)
  try {
    const result: CheckEndResult = await checkAndSettleIfEnded(match);

    if (result.ended) {
      // Check if the match transitioned to RESULT_PENDING (screenshot-verification path)
      // rather than being fully settled. The client should show the upload UI, not navigate away.
      const freshMatch = getMatchById(match.id);
      if (freshMatch && freshMatch.currentState === "RESULT_PENDING") {
        // Notify both players via SSE to switch to the result_pending UI.
        // Include the authoritative resultPendingAt so the client can compute
        // its countdown from the server's clock rather than local start.
        const resultPendingAt = freshMatch.resultPendingAt ?? Date.now();
        for (const player of freshMatch.players) {
          pushToUser(Number(player.userId), "quickmatch_result_pending", {
            matchId: freshMatch.id,
            state: "RESULT_PENDING",
            windowSeconds: 80,
            resultPendingAt,
          });
        }
        res.json({ ended: true, resultPending: true, matchId: match.id, resultPendingAt });
        return;
      }
    }

    res.json({ ended: result.ended, reason: result.reason, matchId: match.id });
  } catch (err) {
    console.error("[check-end] Error:", err);
    res.status(500).json({ error: "Failed to check match end" });
  }
});

// ─── Dismiss match (only if no active match) ──────────────────────────────────
router.post("/quickmatch/match/dismiss", requireAuth, (req, res) => {
  const userId = String(req.user!.userId);

  // Block dismiss if player has ANY active match (waiting_room or credentials_ready)
  const activeMatch = getMatchForPlayer(userId);
  if (activeMatch) {
    res.status(409).json({ error: "Cannot dismiss an active match", code: "match_locked" });
    return;
  }

  // If provided a specific matchId, clean it up (e.g. cancelled-state cleanup)
  const { matchId } = req.body as { matchId?: string };
  if (matchId) {
    const match = getMatchById(matchId);
    if (match && match.playerIds.includes(userId)) {
      dismissMatch(matchId);
    }
  }

  res.json({ ok: true });
});

// ─── Pre-snapshot for display in the "joined" phase ───────────────────────────
// Returns the player's pre-game snapshot fetched when credentials arrived.
// Tries in-memory first (fastest), falls back to DB for resilience.
router.get("/quickmatch/match/pre-snapshot", requireAuth, async (req, res) => {
  const userId    = String(req.user!.userId);
  const userIdNum = req.user!.userId;

  // 1. Check in-memory match first
  const match = getMatchForPlayer(userId);
  if (match) {
    const snap = match.preSnapshots[userId];
    if (snap) {
      res.json({ snapshot: snap, capturedAt: snap.fetchedAt, source: "live" });
      return;
    }
    // Snapshot not in memory — check DB before deciding pending vs unavailable.
    // (DB write happens async; memory may not have it yet even if DB does.)
  }

  // 2. Always check DB — covers in-progress matches whose snapshot was persisted
  //    async, plus settled matches where the in-memory entry is gone.
  try {
    const row = await db.query.quickmatchVerificationsTable.findFirst({
      where: (t, { and, eq, isNotNull }) => and(
        eq(t.userId, userIdNum),
        isNotNull(t.preSnapshotData),
      ),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
    if (row?.preSnapshotData) {
      const snap = JSON.parse(row.preSnapshotData as string);
      res.json({ snapshot: snap, capturedAt: row.preSnapshotAt, source: "db" });
      return;
    }
  } catch { /* fall through */ }

  // No snapshot anywhere — tell client whether to keep waiting or give up
  if (match) {
    const reason = match.preSnapshotAttempted ? "unavailable" : "pending";
    res.json({ snapshot: null, reason });
  } else {
    res.json({ snapshot: null, reason: "not_found" });
  }
});

router.get("/quickmatch/stats", (_req, res) => {
  res.json(getQueueStats());
});

// ─── Pending result check (fires on app open / focus) ─────────────────────────
router.get("/quickmatch/pending-result", requireAuth, async (req, res) => {
  const userId = req.user!.userId;

  const row = await db.query.quickmatchVerificationsTable.findFirst({
    where: (t, { and, eq, isNull, isNotNull }) => and(
      eq(t.userId, userId),
      isNotNull(t.outcome),
      isNull(t.notifiedAt),
    ),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  if (!row) {
    res.json({ pending: false });
    return;
  }

  let resultType = row.outcome ?? "no_show";
  let coinsEarned = 0;
  let entryFee = 0;
  let prizeAmount = 0;
  try {
    if (row.statDiff) {
      const parsed = JSON.parse(row.statDiff) as {
        resultType?: string; coinsEarned?: number;
        entryFee?: number; prizeAmount?: number;
      };
      resultType  = parsed.resultType  ?? resultType;
      coinsEarned = parsed.coinsEarned ?? 0;
      entryFee    = parsed.entryFee    ?? 0;
      prizeAmount = parsed.prizeAmount ?? 0;
    }
  } catch { /* ignore */ }

  res.json({ pending: true, matchId: row.matchId, resultType, coinsEarned, entryFee, prizeAmount });
});

// ─── Mark QuickMatch result as seen ───────────────────────────────────────────
router.post("/quickmatch/result/:matchId/seen", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const { matchId } = req.params as { matchId: string };

  await db
    .update(quickmatchVerificationsTable)
    .set({ notifiedAt: new Date() })
    .where(and(
      eq(quickmatchVerificationsTable.matchId, matchId),
      eq(quickmatchVerificationsTable.userId, userId),
    ))
    .catch(() => {});

  res.json({ ok: true });
});

// ─── Result page data ─────────────────────────────────────────────────────────
router.get("/quickmatch/result/:matchId", requireAuth, async (req, res) => {
  const userId  = req.user!.userId;
  const { matchId } = req.params as { matchId: string };

  const row = await db.query.quickmatchVerificationsTable.findFirst({
    where: (t, { and, eq }) => and(eq(t.matchId, matchId), eq(t.userId, userId)),
  });

  if (!row) {
    res.status(404).json({ error: "Result not found" });
    return;
  }

  // Parse canonical result context embedded in statDiff by settlement
  let resultType:    string = row.outcome ?? "no_show";
  let coinsEarned:   number = 0;
  let entryFee:      number = 0;
  let prizeAmount:   number = 0;
  let opponentUserId: string | null = null;
  let opponentName:   string | null = null;

  try {
    if (row.statDiff) {
      const parsed = JSON.parse(row.statDiff) as {
        resultType?:    string;
        coinsEarned?:   number;
        entryFee?:      number;
        prizeAmount?:   number;
        opponentUserId?: string | null;
        opponentName?:   string | null;
      };
      // Use canonical resultType from statDiff if present (new records);
      // fall back to raw DB outcome for older rows
      resultType     = parsed.resultType    ?? resultType;
      coinsEarned    = parsed.coinsEarned   ?? 0;
      entryFee       = parsed.entryFee      ?? 0;
      prizeAmount    = parsed.prizeAmount   ?? 0;
      opponentUserId = parsed.opponentUserId ?? null;
      opponentName   = parsed.opponentName   ?? null;
    }
  } catch { /* ignore parse errors */ }

  // Fetch fresh opponent profile (name / avatar) if we have the id
  let opponentProfilePicture: string | null = null;
  if (opponentUserId) {
    const oppRow = await db.query.usersTable.findFirst({
      where: (t, { eq }) => eq(t.id, Number(opponentUserId)),
      columns: { inGameName: true, profilePicture: true },
    }).catch(() => null);
    if (oppRow) {
      opponentName           = oppRow.inGameName    ?? opponentName;
      opponentProfilePicture = oppRow.profilePicture ?? null;
    }
  }

  // ── Parse this player's stat deltas ────────────────────────────────────────
  type StatDiffShape = {
    resultType?:     string;
    coinsEarned?:    number;
    entryFee?:       number;
    prizeAmount?:    number;
    opponentUserId?: string | null;
    opponentName?:   string | null;
    killsDelta?:     number | null;
    damageDelta?:    number | null;
    deathsDelta?:    number | null;
    assistsDelta?:   number | null;
  };
  let myStatDiff: StatDiffShape = {};
  try {
    if (row.statDiff) myStatDiff = JSON.parse(row.statDiff) as StatDiffShape;
  } catch { /* ignore */ }

  // ── Fetch opponent's stat deltas from their verification row ────────────────
  let opponentKillsDelta:   number | null = null;
  let opponentDamageDelta:  number | null = null;
  let opponentDeathsDelta:  number | null = null;
  let opponentAssistsDelta: number | null = null;

  if (opponentUserId) {
    const oppVerif = await db.query.quickmatchVerificationsTable.findFirst({
      where: (t, { and, eq }) => and(
        eq(t.matchId, matchId),
        eq(t.userId, Number(opponentUserId)),
      ),
    }).catch(() => null);

    if (oppVerif?.statDiff) {
      try {
        const oppDiff = JSON.parse(oppVerif.statDiff) as StatDiffShape;
        opponentKillsDelta   = oppDiff.killsDelta   ?? null;
        opponentDamageDelta  = oppDiff.damageDelta  ?? null;
        opponentDeathsDelta  = oppDiff.deathsDelta  ?? null;
        opponentAssistsDelta = oppDiff.assistsDelta ?? null;
      } catch { /* ignore */ }
    }
  }

  res.json({
    matchId,
    resultType,
    coinsEarned,
    entryFee,
    prizeAmount,
    rewardGranted:         row.rewardGranted,
    opponentName,
    opponentProfilePicture,
    settledAt:             row.createdAt,
    // My stat deltas
    killsDelta:   myStatDiff.killsDelta   ?? null,
    damageDelta:  myStatDiff.damageDelta  ?? null,
    deathsDelta:  myStatDiff.deathsDelta  ?? null,
    assistsDelta: myStatDiff.assistsDelta ?? null,
    // Opponent's stat deltas
    opponentKillsDelta,
    opponentDamageDelta,
    opponentDeathsDelta,
    opponentAssistsDelta,
  });
});

export default router;
