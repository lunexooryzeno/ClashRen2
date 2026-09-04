/**
 * Worker Phone callback + join-window endpoints.
 * These are added as a separate route file mounted at /api via index.ts.
 */

import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  walletTransactionsTable,
  balanceChangeLogsTable,
  quickmatchWorkersTable,
} from "@workspace/db";
import {
  getMatchById,
  getMatchForPlayer,
  transitionState,
  forceSetState,
  markWebhookFired,
  attachCredentials,
  recordJoinConfirmed,
  setWorker,
  incrementCreateAttempts,
  type QuickMatch,
} from "../lib/quickmatch-matches.js";
import {
  consumeToken,
  validateToken,
  logWorkerResponse,
  markWorkerFree,
  selectWorker,
  issueToken,
  markWorkerBusy,
} from "../lib/worker-tokens.js";
import {
  cancelMatch,
  applyJoinWindowPenalties,
} from "../lib/quickmatch-cancel.js";
import { fetchAndStorePreSnapshots } from "../lib/quickmatch-settlement.js";
import { pushToUser } from "../lib/sse-manager.js";
import { requireAuth } from "../middlewares/auth.js";
import { notify } from "../lib/push.js";

const router: IRouter = Router();

// MacroDroid fallback base URL (used when no worker is registered in the DB)
const MACRO_BASE = "https://trigger.macrodroid.com/98315e1f-abce-4c9f-ab7d-87004928eb82";

// Maximum room-creation attempts before we cancel
const MAX_CREATE_ATTEMPTS = 3;
// Watchdog: cancel if no callback arrives within this window
const WORKER_WATCHDOG_MS = 90_000;
// Join window: 30 s to confirm + 15 s grace = 45 s total
const JOIN_WINDOW_MS  = 30_000;
const JOIN_GRACE_MS   = 15_000;

// Per-match watchdog timers (retry-aware)
const watchdogTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * SINGLE source of truth for all dispatch attempts (initial + retries).
 * Clears any prior watchdog for the match, issues a fresh token, fires the
 * webhook, always transitions to CREATING_ROOM (so the watchdog check is
 * meaningful), and starts a fresh 90-second watchdog for this attempt.
 *
 * Exported so the initial match-creation path in quickmatch.ts can call it
 * directly, keeping all watchdog ownership here.
 */
export async function dispatchMatchToWorker(match: QuickMatch): Promise<void> {
  const matchId = match.id;

  // Clear any existing watchdog for this match before starting a new attempt
  const existing = watchdogTimers.get(matchId);
  if (existing) { clearTimeout(existing); watchdogTimers.delete(matchId); }

  const worker = await selectWorker(match.modeId);

  if (!worker) {
    // No workers configured — fall back to legacy single-phone dispatch
    console.log(`[dispatch] No workers for modeId=${match.modeId}, using legacy MACRO_BASE`);
    const uid1 = match.players[0]?.uid ?? null;
    const uid2 = match.players[1]?.uid ?? null;
    markWebhookFired(matchId);
    const params = new URLSearchParams({
      game_mode: "89UB",
      "players_uid(0)": uid1 ?? "",
      "players_uid(1)": uid2 ?? "",
    });
    const url = `${MACRO_BASE}/clashren?${params}`;
    try { await fetch(url, { method: "GET", signal: AbortSignal.timeout(12_000) }); } catch {}

    // Always transition to CREATING_ROOM so watchdog check is meaningful
    forceSetState(matchId, "CREATING_ROOM");

    // Watchdog: legacy path can't receive a callback, so cancel after timeout
    const timer = setTimeout(async () => {
      watchdogTimers.delete(matchId);
      const m = getMatchById(matchId);
      if (!m || m.currentState !== "CREATING_ROOM") return;
      console.warn(`[watchdog] Match ${matchId}: legacy fallback timed out — cancelling`);
      await cancelMatch(matchId, "Worker phone did not respond in time", m);
    }, WORKER_WATCHDOG_MS);
    watchdogTimers.set(matchId, timer);
    return;
  }

  // Issue a fresh single-use access token for this attempt
  const rawToken = await issueToken(matchId, worker.id, 180);
  markWorkerBusy(worker.id, matchId).catch(() => {});
  setWorker(matchId, worker.id);
  markWebhookFired(matchId);

  const params = new URLSearchParams({
    game_mode: "89UB",
    access_token: rawToken,
  });
  const webhookUrl = `${worker.webhookUrl}?${params}`;

  console.log(`[dispatch] Firing webhook for match=${matchId} worker=${worker.id}`);
  try {
    await fetch(webhookUrl, { method: "GET", signal: AbortSignal.timeout(12_000) });
  } catch { /* best effort — watchdog handles timeout */ }

  // Always transition to CREATING_ROOM so watchdog and callback checks are consistent
  forceSetState(matchId, "CREATING_ROOM");

  // Fresh watchdog for this attempt
  const timer = setTimeout(async () => {
    watchdogTimers.delete(matchId);
    const m = getMatchById(matchId);
    if (!m || m.currentState !== "CREATING_ROOM") return;
    console.warn(`[watchdog] Match ${matchId}: no callback after ${WORKER_WATCHDOG_MS}ms — cancelling`);
    markWorkerFree(worker.id).catch(() => {});
    await cancelMatch(matchId, "Worker phone did not respond in time", m);
  }, WORKER_WATCHDOG_MS);
  watchdogTimers.set(matchId, timer);
}

// Internal alias for retry path
async function retryDispatch(matchId: string, match: QuickMatch): Promise<void> {
  return dispatchMatchToWorker(match);
}

// ─── Per-match join-window timers (in-process) ────────────────────────────────
const joinWindowTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function startJoinWindow(match: QuickMatch): void {
  if (joinWindowTimers.has(match.id)) return; // already started

  try { transitionState(match.id, "ROOM_READY", "JOIN_WINDOW"); } catch { return; }

  const [p1, p2] = match.players;
  for (const player of [p1, p2]) {
    if (!player) continue;
    pushToUser(Number(player.userId), "quickmatch_join_window", {
      matchId: match.id,
      state: "JOIN_WINDOW",
      windowMs: JOIN_WINDOW_MS,
      graceMs:  JOIN_GRACE_MS,
      totalMs:  JOIN_WINDOW_MS + JOIN_GRACE_MS,
      roomId:   match.credentials?.roomId,
      password: match.credentials?.password,
    });
    // Push notification: join reminder (fires even if app is backgrounded)
    notify(Number(player.userId), {
      type:  "quickmatch_join_reminder",
      title: "⏰ Join Now!",
      body:  `Room is ready — you have ${Math.round((JOIN_WINDOW_MS + JOIN_GRACE_MS) / 1000)}s to join or you'll forfeit.`,
      url:   `/#/quickmatch/${match.gameType}/${match.modeId}`,
    }).catch(() => {});
  }

  const timer = setTimeout(async () => {
    joinWindowTimers.delete(match.id);
    try {
      await applyJoinWindowPenalties(match);
    } catch (err) {
      console.error(`[joinWindow] Penalty error for match ${match.id}:`, err);
    }
  }, JOIN_WINDOW_MS + JOIN_GRACE_MS);

  joinWindowTimers.set(match.id, timer);
}

// ─── Worker callback (no user auth — validated by access token) ───────────────
// The public MacroDroid callback is /api/workers/host/status.
// Keep the older path as an alias so already-configured worker macros continue
// to work while new macros use the canonical host-status URL.
router.post(["/workers/host/status", "/quickmatch/worker/callback"], async (req, res) => {
  const {
    access_token,
    phone_status,
    msg_code,
    response_code,
    room_id,
    room_password,
  } = req.body as {
    access_token?: string;
    phone_status?: string;
    msg_code?: string;
    response_code?: string;
    room_id?: string;
    room_password?: string;
  };

  if (!access_token) {
    res.status(401).json({ error: "access_token required" });
    return;
  }

  // Determine whether this is a terminal callback before deciding whether to consume.
  // Terminal: room_created (success) or error.
  // Progress: any other status update (e.g. "creating", "booting_game", intermediate states).
  // We only consume (mark used) on terminal callbacks so that workers who send
  // intermediate progress updates before the final room_created/error callback
  // don't invalidate their own token prematurely.
  const isTerminal =
    response_code === "room_created" || msg_code === "room_created" ||
    response_code === "error"        || phone_status === "error";

  let tokenInfo: { id: number; matchId: string; workerId: number } | null;

  if (isTerminal) {
    // Atomic validate-and-consume: rejects replay/duplicate terminal callbacks
    tokenInfo = await consumeToken(access_token);
  } else {
    // Validate without consuming so terminal callbacks can still use the same token
    tokenInfo = await validateToken(access_token);
  }

  if (!tokenInfo) {
    // Silent reject — don't leak whether token exists or was replayed
    res.json({ ok: false, error: "invalid_or_expired_token" });
    return;
  }

  const { matchId, workerId, id: tokenId } = tokenInfo;
  // Always use the matchId bound to the token — never trust client-supplied match_id
  // to prevent one token being applied to a different match.

  // Log the response regardless of outcome
  await logWorkerResponse({
    tokenId,
    matchId,
    workerId,
    phoneStatus: phone_status,
    msgCode: msg_code,
    responseCode: response_code,
    payload: req.body,
  });

  const match = getMatchById(matchId);
  if (!match) {
    markWorkerFree(workerId).catch(() => {});
    res.json({ ok: false, error: "match_not_found" });
    return;
  }

  console.log(
    `[worker-callback] match=${matchId} worker=${workerId} ` +
    `phone_status=${phone_status} msg_code=${msg_code} response_code=${response_code}`,
  );

  const isSuccess = response_code === "room_created" || msg_code === "room_created";
  const isError   = response_code === "error" || phone_status === "error";

  if (isSuccess && room_id && room_password) {
    // Transition to ROOM_READY
    try {
      const updated = attachCredentials(room_id, room_password, null, matchId);
      if (updated) {
        markWorkerFree(workerId).catch(() => {});
        // Notify players
        const [p1, p2] = updated.players;
        if (p1) pushToUser(Number(p1.userId), "quickmatch_match", {
          matchId: updated.id, status: "credentials_ready", roomStatus: "ready",
          roomId: room_id, password: room_password,
          me: { ...p1, uid: null }, opponent: p2 ? { ...p2, uid: null } : null,
        });
        if (p2) pushToUser(Number(p2.userId), "quickmatch_match", {
          matchId: updated.id, status: "credentials_ready", roomStatus: "ready",
          roomId: room_id, password: room_password,
          me: { ...p2, uid: null }, opponent: p1 ? { ...p1, uid: null } : null,
        });
        // Push notification: room ready — alert both players even if app is in background
        for (const player of updated.players) {
          notify(Number(player.userId), {
            type:  "quickmatch_room_ready",
            title: "🏠 Room Ready!",
            body:  "Your custom room is set up. Open the app to get the room ID and password.",
            url:   `/#/quickmatch/${updated.gameType}/${updated.modeId}`,
          }).catch(() => {});
        }
        // Start join window
        startJoinWindow(updated);
        // Fetch pre-snapshots in background
        fetchAndStorePreSnapshots(updated).catch(() => {});
      }
    } catch (err) {
      console.error(`[worker-callback] Failed to attach credentials:`, err);
    }
  } else if (isError) {
    const attempts = incrementCreateAttempts(matchId);
    markWorkerFree(workerId).catch(() => {});

    if (attempts >= MAX_CREATE_ATTEMPTS) {
      await cancelMatch(matchId, "Room creation failed after multiple attempts", match);
    } else {
      console.log(`[worker-callback] Match ${matchId}: create attempt ${attempts}/${MAX_CREATE_ATTEMPTS} failed — re-dispatching immediately`);
      // Reset state and immediately re-dispatch to another available worker.
      // This keeps hasPendingRoomRequest() accurate and drives the retry without
      // waiting for a new player join — which would never arrive for this match.
      forceSetState(matchId, "WAITING_FOR_ROOM");
      retryDispatch(matchId, match).catch((err) =>
        console.error(`[worker-callback] Retry dispatch failed for match ${matchId}:`, err),
      );
    }
  }

  res.json({ ok: true });
});

// ─── Player confirms joining the room ────────────────────────────────────────
router.post("/quickmatch/joined", requireAuth, async (req, res) => {
  const userId    = String(req.user!.userId);
  const userIdNum = req.user!.userId;
  const { matchId } = req.body as { matchId?: string };

  const match = (matchId ? getMatchById(matchId) : null) ?? getMatchForPlayer(userId);
  if (!match || !match.playerIds.includes(userId)) {
    res.status(404).json({ error: "No active match" });
    return;
  }

  if (match.currentState !== "JOIN_WINDOW" && match.currentState !== "ROOM_READY") {
    res.status(409).json({ error: "Not in join window" });
    return;
  }

  if (match.joinConfirmed[userId]) {
    res.json({ ok: true, alreadyConfirmed: true });
    return;
  }

  recordJoinConfirmed(match.id, userId);

  // Also record legacy actionTaken for backward compat
  if (!match.actionTaken[userId]) {
    match.actionTaken[userId] = new Date().toISOString();
  }

  // Notify both players of this confirmation
  for (const player of match.players) {
    pushToUser(Number(player.userId), "quickmatch_join_confirmed", {
      matchId: match.id,
      confirmedBy: userId,
      allConfirmed: match.players.every((p) => match.joinConfirmed[p.userId]),
    });
  }

  // Push notification to confirming player
  notify(userIdNum, {
    type:  "quickmatch_joined",
    title: "You're In! 🎮",
    body:  "Room confirmed. Head to Free Fire and join the custom room — good luck!",
    url:   `/#/quickmatch/${match.gameType}/${match.modeId}`,
  }).catch(() => {});

  res.json({ ok: true });
});

export default router;
