/**
 * Screenshot verification endpoints:
 *   POST /api/quickmatch/submit-screenshot  — winner uploads a screenshot
 *   POST /api/quickmatch/verifier/callback  — verifier phone posts OCR result
 *
 * The verifier phone is a separate worker type ("verifier") registered in
 * quickmatch_workers with worker_type = "verifier".
 */

import crypto from "crypto";
import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, mediaUploadsTable, quickmatchPrizesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import {
  getMatchById,
  getMatchForPlayer,
  transitionState,
  forceSetState,
  type QuickMatch,
} from "../lib/quickmatch-matches.js";
import {
  issueToken,
  consumeToken,
  logWorkerResponse,
} from "../lib/worker-tokens.js";
import {
  pendingPrize,
  lockPrize,
} from "../lib/prize-state.js";
import { pushToUser } from "../lib/sse-manager.js";
import { notify } from "../lib/push.js";

const router: IRouter = Router();

/** Seconds the winner has to upload a screenshot after RESULT_PENDING */
const SCREENSHOT_WINDOW_SECONDS = 80;
/** Seconds the verifier phone has to call back before the submission is rejected */
const VERIFIER_WATCHDOG_SECONDS = 60;

// Watchdog timers per match — cancelled if the verifier calls back in time
const verifierWatchdogs = new Map<string, ReturnType<typeof setTimeout>>();

// ─── Select a verifier-type worker ────────────────────────────────────────────

async function selectVerifier(): Promise<{
  id: number;
  webhookUrl: string;
  webhookSecret: string;
} | null> {
  const workers = await db.query.quickmatchWorkersTable.findMany({
    where: (w, { and, eq }) => and(eq(w.status, "active"), eq(w.workerType, "verifier")),
    orderBy: (w, { desc }) => [desc(w.priority)],
  });
  return workers[0] ?? null;
}

// ─── POST /api/quickmatch/submit-screenshot ───────────────────────────────────

router.post("/quickmatch/submit-screenshot", requireAuth, async (req, res) => {
  const userId    = req.user!.userId;
  const userIdStr = String(userId);

  const { matchId: reqMatchId, imageBase64, mimeType } = req.body as {
    matchId?: string;
    imageBase64?: string;
    mimeType?: string;
  };

  const activeMatch: QuickMatch | null =
    (reqMatchId ? getMatchById(reqMatchId) : null) ??
    getMatchForPlayer(userIdStr);

  if (!activeMatch || !activeMatch.playerIds.includes(userIdStr)) {
    res.status(404).json({ error: "No active match found" });
    return;
  }

  if (activeMatch.currentState !== "RESULT_PENDING") {
    res.status(409).json({
      error: "Screenshot can only be submitted when match state is RESULT_PENDING",
      currentState: activeMatch.currentState,
    });
    return;
  }

  // Server-side deadline enforcement: exactly 80s, matching the client SCREENSHOT_WINDOW_SECONDS.
  // No grace period — keeping the deadline identical on both sides prevents the client showing
  // an expired UI while the server still accepts the upload.
  // resultPendingAt is set when the match enters RESULT_PENDING via transitionState().
  const SCREENSHOT_DEADLINE_MS = SCREENSHOT_WINDOW_SECONDS * 1000; // exactly 80s
  if (activeMatch.resultPendingAt) {
    const elapsed = Date.now() - activeMatch.resultPendingAt;
    if (elapsed > SCREENSHOT_DEADLINE_MS) {
      res.status(409).json({
        error: "Screenshot upload window has expired",
        code: "window_expired",
        elapsedMs: elapsed,
      });
      return;
    }
  }

  // Validate image payload
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
  if (!imageBase64 || !mimeType || !ALLOWED_TYPES.includes(mimeType)) {
    res.status(400).json({
      error: "imageBase64 and mimeType (image/jpeg | image/png | image/webp) are required",
    });
    return;
  }

  let imageBuffer: Buffer;
  try {
    imageBuffer = Buffer.from(imageBase64, "base64");
  } catch {
    res.status(400).json({ error: "Invalid base64 image data" });
    return;
  }

  if (imageBuffer.length > 10 * 1024 * 1024) {
    res.status(413).json({ error: "Image too large (max 10 MB)" });
    return;
  }

  // Store as temporary media upload (expires in 1 hour)
  const mediaId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await db.insert(mediaUploadsTable).values({
    id: mediaId,
    mimeType,
    data: imageBuffer,
    temp: true,
    expiresAt,
  });

  // Transition match to VERIFYING_SCREENSHOT
  try {
    transitionState(activeMatch.id, "RESULT_PENDING", "VERIFYING_SCREENSHOT");
  } catch (err) {
    // Clean up uploaded file if transition fails
    await db.delete(mediaUploadsTable).where(eq(mediaUploadsTable.id, mediaId)).catch(() => {});
    res.status(409).json({ error: "Match state transition failed", detail: String(err) });
    return;
  }

  // Notify the submitting player
  pushToUser(userId, "quickmatch_screenshot_submitted", {
    matchId: activeMatch.id,
    submissionId: mediaId,
    state: "VERIFYING_SCREENSHOT",
  });

  // Dispatch to verifier phone asynchronously (don't block the response)
  dispatchToVerifier(activeMatch, userId, mediaId).catch((err) =>
    console.error(`[verifier-dispatch] Error for match ${activeMatch.id}:`, err),
  );

  res.json({ ok: true, submissionId: mediaId, state: "VERIFYING_SCREENSHOT" });
});

// ─── Dispatch to verifier phone ───────────────────────────────────────────────

async function dispatchToVerifier(
  match: QuickMatch,
  claimedWinnerUserId: number,
  mediaId: string,
): Promise<void> {
  const matchId = match.id;

  // Cancel any existing watchdog for this match
  const existing = verifierWatchdogs.get(matchId);
  if (existing) { clearTimeout(existing); verifierWatchdogs.delete(matchId); }

  const verifier = await selectVerifier();
  if (!verifier) {
    console.warn(`[verifier-dispatch] No active verifier worker — rejecting match ${matchId}`);
    await rejectSubmission(match, mediaId, "No verifier available");
    return;
  }

  const rawToken = await issueToken(matchId, verifier.id, VERIFIER_WATCHDOG_SECONDS + 30);

  // Build a download URL the verifier phone can fetch
  const baseUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "http://localhost:5000";
  const mediaUrl = `${baseUrl}/api/uploads/${mediaId}`;

  // Find the claiming player's profile for nickname matching
  const claimingPlayer = match.players.find((p) => Number(p.userId) === claimedWinnerUserId);

  const params = new URLSearchParams({
    action: "verify_screenshot",
    access_token: rawToken,
    match_id: matchId,
    player_id: String(claimedWinnerUserId),
    player_nickname: claimingPlayer?.inGameName ?? "",
    media_url: mediaUrl,
    upload_timestamp: new Date().toISOString(),
  });

  const webhookUrl = `${verifier.webhookUrl}?${params.toString()}`;
  console.log(`[verifier-dispatch] Firing verifier webhook for match=${matchId} worker=${verifier.id}`);

  try {
    await fetch(webhookUrl, { method: "GET", signal: AbortSignal.timeout(12_000) });
  } catch {
    /* best-effort — watchdog handles timeout */
  }

  // Start 60-second watchdog
  const timer = setTimeout(async () => {
    verifierWatchdogs.delete(matchId);
    const m = getMatchById(matchId);
    if (!m || m.currentState !== "VERIFYING_SCREENSHOT") return;
    console.warn(`[verifier-watchdog] Match ${matchId}: no callback after ${VERIFIER_WATCHDOG_SECONDS}s`);
    await rejectSubmission(m, mediaId, "Verifier did not respond in time");
  }, VERIFIER_WATCHDOG_SECONDS * 1000);
  verifierWatchdogs.set(matchId, timer);
}

// ─── Reject a submission (revert match state, allow re-upload) ────────────────

async function rejectSubmission(
  match: QuickMatch,
  mediaId: string,
  reason: string,
): Promise<void> {
  // Revert to RESULT_PENDING so the winner can re-upload
  forceSetState(match.id, "RESULT_PENDING");

  // Clean up temp media row
  if (mediaId) {
    await db.delete(mediaUploadsTable)
      .where(and(eq(mediaUploadsTable.id, mediaId), eq(mediaUploadsTable.temp, true)))
      .catch(() => {});
  }

  // Calculate remaining time from the authoritative resultPendingAt timestamp.
  // Deadline is exactly SCREENSHOT_WINDOW_SECONDS (80s) — no grace period.
  const SCREENSHOT_DEADLINE_MS = SCREENSHOT_WINDOW_SECONDS * 1000; // exactly 80s
  const remainingMs = match.resultPendingAt
    ? Math.max(0, SCREENSHOT_DEADLINE_MS - (Date.now() - match.resultPendingAt))
    : 0;

  // Notify players that re-upload is available (with server-authoritative remaining time)
  for (const player of match.players) {
    pushToUser(Number(player.userId), "quickmatch_screenshot_rejected", {
      matchId: match.id,
      reason,
      canRetry: remainingMs > 0,
      remainingMs,
      remainingSeconds: Math.floor(remainingMs / 1000),
      windowSeconds: SCREENSHOT_WINDOW_SECONDS,
    });
  }

  console.log(`[verifier] Match ${match.id} screenshot rejected: ${reason} (remainingMs=${remainingMs})`);
}

// ─── POST /api/quickmatch/verifier/callback ────────────────────────────────────

router.post("/quickmatch/verifier/callback", async (req, res) => {
  const {
    access_token,
    is_valid,
    detected_nickname,
    detected_victory_text,
    ocr_confidence,
    tampering_score,
    screenshot_media_id,
  } = req.body as {
    access_token?: string;
    is_valid?: boolean;
    detected_nickname?: string;
    detected_victory_text?: string;
    ocr_confidence?: number;
    tampering_score?: number;
    screenshot_media_id?: string;
  };

  if (!access_token) {
    res.status(401).json({ error: "access_token required" });
    return;
  }

  // Validate and consume the token (terminal callback — one-shot)
  const tokenInfo = await consumeToken(access_token);
  if (!tokenInfo) {
    res.json({ ok: false, error: "invalid_or_expired_token" });
    return;
  }

  const { matchId, workerId, id: tokenId } = tokenInfo;

  // Cancel watchdog — verifier responded in time
  const watchdog = verifierWatchdogs.get(matchId);
  if (watchdog) { clearTimeout(watchdog); verifierWatchdogs.delete(matchId); }

  // Log the callback for audit trail
  await logWorkerResponse({
    tokenId,
    matchId,
    workerId,
    msgCode: is_valid ? "ocr_valid" : "ocr_invalid",
    payload: req.body,
  });

  const match = getMatchById(matchId);
  if (!match) {
    res.json({ ok: false, error: "match_not_found" });
    return;
  }

  if (match.currentState !== "VERIFYING_SCREENSHOT") {
    res.json({ ok: false, error: "match_not_in_verifying_state", currentState: match.currentState });
    return;
  }

  const mediaId = screenshot_media_id ?? "";
  const ocrResult = {
    isValid: is_valid,
    detectedNickname: detected_nickname ?? null,
    detectedVictoryText: detected_victory_text ?? null,
    ocrConfidence: ocr_confidence ?? null,
    tamperingScore: tampering_score ?? null,
    receivedAt: new Date().toISOString(),
  };

  if (is_valid === true) {
    await handleValidOcr(match, mediaId, ocrResult);
  } else {
    await handleInvalidOcr(match, mediaId, ocrResult);
  }

  res.json({ ok: true });
});

// ─── Valid OCR: VERIFYING_SCREENSHOT → PROVISIONAL_WIN → DISPUTE_WINDOW ──────

async function handleValidOcr(
  match: QuickMatch,
  mediaId: string,
  ocrResult: Record<string, unknown>,
): Promise<void> {
  const matchId = match.id;

  // Determine the winner by matching the OCR nickname against player profiles
  let winnerUserId: number | null = null;
  if (ocrResult.detectedNickname && typeof ocrResult.detectedNickname === "string") {
    for (const player of match.players) {
      if (player.inGameName?.toLowerCase() === ocrResult.detectedNickname.toLowerCase()) {
        winnerUserId = Number(player.userId);
        break;
      }
    }
  }

  if (!winnerUserId) {
    console.warn(
      `[verifier] Match ${matchId}: OCR nickname "${ocrResult.detectedNickname}" ` +
      `did not match any player — rejecting`,
    );
    await handleInvalidOcr(match, mediaId, { ...ocrResult, rejectReason: "nickname_mismatch" });
    return;
  }

  // 1. Transition prize NOT_CREATED → PENDING (inserts pending wallet_transaction)
  const prizeApplied = await pendingPrize(matchId, winnerUserId, ocrResult);
  if (!prizeApplied) {
    console.warn(`[verifier] Match ${matchId}: pendingPrize guard failed — duplicate callback?`);
    return;
  }

  // 2. Store the screenshot media id on the prize row
  await db
    .update(quickmatchPrizesTable)
    .set({ screenshotMediaId: mediaId })
    .where(eq(quickmatchPrizesTable.matchId, matchId))
    .catch(() => {});

  // 3. Delete the temp screenshot — no longer needed after verification
  //    (unless a dispute is subsequently opened; retention on dispute is Task 16)
  if (mediaId) {
    await db.delete(mediaUploadsTable)
      .where(and(eq(mediaUploadsTable.id, mediaId), eq(mediaUploadsTable.temp, true)))
      .catch(() => {});
  }

  // 4. Transition match state: VERIFYING_SCREENSHOT → PROVISIONAL_WIN → DISPUTE_WINDOW
  //    Also stamp provisionalWinnerId so GET /quickmatch/match can expose role on reconnect.
  let updatedMatch: QuickMatch | undefined;
  try {
    updatedMatch = transitionState(matchId, "VERIFYING_SCREENSHOT", "PROVISIONAL_WIN");
  } catch (err) {
    console.error(`[verifier] VERIFYING_SCREENSHOT→PROVISIONAL_WIN failed:`, err);
    return;
  }
  updatedMatch.provisionalWinnerId = String(winnerUserId);
  try {
    transitionState(matchId, "PROVISIONAL_WIN", "DISPUTE_WINDOW");
  } catch (err) {
    console.error(`[verifier] PROVISIONAL_WIN→DISPUTE_WINDOW failed:`, err);
    return;
  }

  // 5. Transition prize PENDING → LOCKED (dispute window is now open)
  await lockPrize(matchId);

  // 6. Notify all players
  const winner = match.players.find((p) => Number(p.userId) === winnerUserId);
  const loser  = match.players.find((p) => Number(p.userId) !== winnerUserId);

  if (winner) {
    pushToUser(Number(winner.userId), "quickmatch_provisional_win", {
      matchId,
      state: "DISPUTE_WINDOW",
      prizeAmount: match.prizeAmount,
      message: "Prize credited (Pending Verification)",
      nonWithdrawable: true,
    });
    notify(Number(winner.userId), {
      type: "quickmatch_result",
      title: "🏆 You Won! (Pending Verification)",
      body: `${match.prizeAmount} diamonds locked — credited after the dispute window.`,
      url: `/#/quickmatch/result/${matchId}`,
    }).catch(() => {});
  }

  if (loser) {
    pushToUser(Number(loser.userId), "quickmatch_result", {
      matchId,
      resultType: "loss",
      state: "DISPUTE_WINDOW",
      message: "You can dispute this result within the dispute window.",
    });
    notify(Number(loser.userId), {
      type: "quickmatch_result",
      title: "Match Result",
      body: "You lost. If you believe this is incorrect, you can open a dispute.",
      url: `/#/quickmatch/result/${matchId}`,
    }).catch(() => {});
  }

  console.log(`[verifier] Match ${matchId}: OCR valid — winner=${winnerUserId}, prize PENDING→LOCKED, match in DISPUTE_WINDOW`);
}

// ─── Invalid OCR: revert to RESULT_PENDING for re-upload ──────────────────────

async function handleInvalidOcr(
  match: QuickMatch,
  mediaId: string,
  ocrResult: Record<string, unknown>,
): Promise<void> {
  const matchId = match.id;

  // Revert match to RESULT_PENDING
  forceSetState(matchId, "RESULT_PENDING");

  // Clean up temp screenshot
  if (mediaId) {
    await db.delete(mediaUploadsTable)
      .where(and(eq(mediaUploadsTable.id, mediaId), eq(mediaUploadsTable.temp, true)))
      .catch(() => {});
  }

  // Calculate remaining time from the authoritative resultPendingAt timestamp.
  // Deadline is exactly SCREENSHOT_WINDOW_SECONDS (80s) — no grace period.
  const SCREENSHOT_DEADLINE_MS = SCREENSHOT_WINDOW_SECONDS * 1000; // exactly 80s
  const remainingMs = match.resultPendingAt
    ? Math.max(0, SCREENSHOT_DEADLINE_MS - (Date.now() - match.resultPendingAt))
    : 0;

  // Notify players they can retry (with server-authoritative remaining time)
  for (const player of match.players) {
    pushToUser(Number(player.userId), "quickmatch_screenshot_rejected", {
      matchId,
      reason: "OCR verification failed",
      ocrConfidence: ocrResult.ocrConfidence,
      tamperingScore: ocrResult.tamperingScore,
      canRetry: remainingMs > 0,
      remainingMs,
      remainingSeconds: Math.floor(remainingMs / 1000),
      windowSeconds: SCREENSHOT_WINDOW_SECONDS,
    });
  }

  console.log(`[verifier] Match ${matchId}: OCR invalid — reverted to RESULT_PENDING (remainingMs=${remainingMs})`);
}

export default router;
