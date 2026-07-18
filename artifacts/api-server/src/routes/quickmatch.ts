import { Router, type IRouter } from "express";
import { eq, or, sql } from "drizzle-orm";
import { db, usersTable, walletTransactionsTable, balanceChangeLogsTable } from "@workspace/db";
import {
  getQueueStats,
  joinQueue,
  leaveQueue,
  tryMatch,
  getQueueEntryFee,
  isInQueue,
  sweepExpiredEntries,
} from "../lib/quickmatch-queue.js";
import {
  createMatch,
  getMatchForPlayer,
  getMatchById,
  dismissMatch,
  hasPendingRoomRequest,
  getRoomStatus,
  markWebhookFired,
  markActionTaken,
  type PlayerProfile,
} from "../lib/quickmatch-matches.js";
import { creditPlayer } from "../lib/quickmatch-settlement.js";
import { requireAuth } from "../middlewares/auth.js";

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

// Background TTL sweep — runs every 2 minutes to refund timed-out queue entries
setInterval(async () => {
  const expired = sweepExpiredEntries();
  for (const entry of expired) {
    if (entry.entryFee > 0) {
      refundQueueEntry(Number(entry.userId), entry.entryFee, "QuickMatch Queue Timeout Refund")
        .catch((err) => console.error("[quickmatch] TTL refund failed:", err));
    }
  }
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

  // Check quickmatch ban (reuses tournamentBanned)
  const userRow = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userIdNum),
    columns: {
      id: true,
      diamondBalance: true,
      tournamentBanned: true,
      tournamentBannedUntil: true,
    },
  });
  if (!userRow) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (userRow.tournamentBanned) {
    const banUntil = userRow.tournamentBannedUntil;
    if (!banUntil || banUntil > new Date()) {
      res.status(403).json({
        error: "You are suspended from QuickMatch",
        bannedUntil: banUntil?.toISOString() ?? null,
      });
      return;
    }
    // Ban expired — auto-lift
    await db
      .update(usersTable)
      .set({ tournamentBanned: false, tournamentBannedUntil: null })
      .where(eq(usersTable.id, userIdNum));
  }

  // Balance check + deduction (DB transaction)
  if (entryFee > 0) {
    let joinError: string | null = null;
    await db.transaction(async (tx: any) => {
      const uRes = await tx.execute(
        sql`SELECT id, diamond_balance FROM users WHERE id = ${userIdNum} FOR UPDATE`,
      );
      const lockedUser = ((uRes as any).rows ?? uRes)[0] as
        | { id: number; diamond_balance: number }
        | undefined;
      if (!lockedUser) { joinError = "User not found"; return; }
      if (lockedUser.diamond_balance < entryFee) {
        joinError = `Insufficient coins. Need ${entryFee}, have ${lockedUser.diamond_balance}`;
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
    if (joinError) {
      // HTTP 402 = payment required (standard for insufficient funds)
      res.status(402).json({ error: joinError, code: "insufficient_balance" });
      return;
    }
  }

  // Enqueue player
  joinQueue(userId, valid.gameType, valid.modeId, entryFee);

  // Attempt match-making — only match players with same entry fee
  if (MODE_MACRO_SUPPORTED.has(valid.modeId) && !hasPendingRoomRequest()) {
    const playerIds = tryMatch(valid.gameType, valid.modeId, entryFee);
    if (playerIds) {
      const players    = await fetchPlayers(playerIds);
      const match      = createMatch(players, valid.gameType, valid.modeId, entryFee, prizeAmount);
      const uid1       = players[0]?.uid ?? null;
      const uid2       = players[1]?.uid ?? null;
      // One-fire guard: only fire if not already fired for this match
      if (!match.webhookFired) {
        fireMacroDroidWithUids(match.id, uid1, uid2).catch(() => {});
      }
      res.json({ ok: true, matched: true });
      return;
    }
  }

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

  res.json({ ok: true, refunded: refundAmount });
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

  // Strip UID from opponent (keep own UID for display purposes)
  const opponent = opponentRaw ? { ...opponentRaw, uid: null } : null;
  const me       = meRaw;

  if (roomStatus === "ready" && match.credentials) {
    res.json({
      status: "ready",
      matchId: match.id,
      roomId: match.credentials.roomId,
      password: match.credentials.password,
      openInFfUrl: match.credentials.openInFfUrl ?? null,
      gameType: match.gameType,
      modeId: match.modeId,
      roomStatus,
      credentialsReadyAt: match.credentialsReadyAt ?? null,
      entryFee: match.entryFee,
      prizeAmount: match.prizeAmount,
      me,
      opponent,
    });
    return;
  }

  res.json({
    status: "waiting_room",
    matchId: match.id,
    gameType: match.gameType,
    modeId: match.modeId,
    roomStatus,
    entryFee: match.entryFee,
    prizeAmount: match.prizeAmount,
    me,
    opponent,
  });
});

// ─── Track join-intent action ─────────────────────────────────────────────────
router.post("/quickmatch/match/action", requireAuth, (req, res) => {
  const userId = String(req.user!.userId);
  const { action, matchId: reqMatchId } = req.body as { action?: string; matchId?: string };
  if (!action || !["copy_room", "copy_pass", "open_ff"].includes(action)) {
    res.status(400).json({ error: "Invalid action. Use: copy_room, copy_pass, open_ff" });
    return;
  }
  // Prefer matchId from body; fall back to player's active match
  const match = (reqMatchId ? getMatchById(reqMatchId) : null) ?? getMatchForPlayer(userId);
  if (!match || !match.playerIds.includes(userId)) {
    res.status(404).json({ error: "No active match" });
    return;
  }
  markActionTaken(match.id, userId);
  res.json({ ok: true });
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

router.get("/quickmatch/stats", (_req, res) => {
  res.json(getQueueStats());
});

export default router;
