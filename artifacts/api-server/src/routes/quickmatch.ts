import { Router, type IRouter } from "express";
import { eq, or } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { getQueueStats, joinQueue, leaveQueue, tryMatch } from "../lib/quickmatch-queue.js";
import {
  createMatch,
  getMatchForPlayer,
  dismissMatch,
  hasPendingRoomRequest,
  getRoomStatus,
  type PlayerProfile,
} from "../lib/quickmatch-matches.js";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

const MACRO_BASE = "https://trigger.macrodroid.com/98315e1f-abce-4c9f-ab7d-87004928eb82";
const MODE_MACRO_ACTION: Record<string, string> = {
  duel: "/clashren.host_cs_1v1",
  healing: "/clashren.host_cs_1v1",
  knife: "/clashren.host_cs_1v1",
};

async function fireMacroDroid(path: string): Promise<void> {
  try {
    await fetch(MACRO_BASE + path, { method: "GET" });
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

router.get("/quickmatch/stats", (_req, res) => {
  res.json(getQueueStats());
});

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
    res.status(400).json({ error: `Invalid gameType.` });
    return null;
  }
  if (!VALID_MODE_IDS.has(modeId)) {
    res.status(400).json({ error: `Invalid modeId.` });
    return null;
  }
  return { gameType, modeId };
}

router.post("/quickmatch/search/join", requireAuth, async (req, res) => {
  const userId = String(req.user!.userId);
  const valid = validateQueueBody(req.body, res);
  if (!valid) return;

  const existingMatch = getMatchForPlayer(userId);
  if (existingMatch) {
    res.json({ ok: true, matched: true, matchId: existingMatch.id });
    return;
  }

  joinQueue(userId, valid.gameType, valid.modeId);

  const macroPath = MODE_MACRO_ACTION[valid.modeId];
  if (macroPath && !hasPendingRoomRequest()) {
    const playerIds = tryMatch(valid.gameType, valid.modeId);
    if (playerIds) {
      const players = await fetchPlayers(playerIds);
      createMatch(players, valid.gameType, valid.modeId);
      fireMacroDroid(macroPath);
      res.json({ ok: true, matched: true });
      return;
    }
  }

  res.json({ ok: true, matched: false });
});

router.post("/quickmatch/search/leave", requireAuth, (req, res) => {
  const userId = String(req.user!.userId);
  const valid = validateQueueBody(req.body, res);
  if (!valid) return;
  leaveQueue(userId, valid.gameType, valid.modeId);
  res.json({ ok: true });
});

router.get("/quickmatch/match", requireAuth, (req, res) => {
  const userId = String(req.user!.userId);
  const match = getMatchForPlayer(userId);
  if (!match) {
    res.json({ status: "none" });
    return;
  }

  const roomStatus = getRoomStatus(match);
  const opponent = match.players.find((p) => p.userId !== userId) ?? null;
  const me = match.players.find((p) => p.userId === userId) ?? null;

  if (roomStatus === "ready" && match.credentials) {
    res.json({
      status: "ready",
      matchId: match.id,
      roomId: match.credentials.roomId,
      password: match.credentials.password,
      gameType: match.gameType,
      modeId: match.modeId,
      roomStatus,
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
    me,
    opponent,
  });
});

router.post("/quickmatch/match/dismiss", requireAuth, (req, res) => {
  const { matchId } = req.body as { matchId?: string };
  if (matchId) dismissMatch(matchId);
  res.json({ ok: true });
});

export default router;
