import { Router, type IRouter } from "express";
import { getQueueStats, joinQueue, leaveQueue, tryMatch } from "../lib/quickmatch-queue.js";
import {
  createMatch,
  getMatchForPlayer,
  dismissMatch,
  hasPendingRoomRequest,
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
  } catch {
    // best effort
  }
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
    res.status(400).json({ error: `Invalid gameType. Must be one of: ${[...VALID_GAME_TYPES].join(", ")}` });
    return null;
  }
  if (!VALID_MODE_IDS.has(modeId)) {
    res.status(400).json({ error: `Invalid modeId. Must be one of: ${[...VALID_MODE_IDS].join(", ")}` });
    return null;
  }
  return { gameType, modeId };
}

router.post("/quickmatch/search/join", requireAuth, (req, res) => {
  const userId = String(req.user!.userId);
  const valid = validateQueueBody(req.body, res);
  if (!valid) return;

  // If player is already in a match, return it
  const existingMatch = getMatchForPlayer(userId);
  if (existingMatch) {
    res.json({ ok: true, matched: true, matchId: existingMatch.id });
    return;
  }

  joinQueue(userId, valid.gameType, valid.modeId);

  // Try to form a match
  const macroPath = MODE_MACRO_ACTION[valid.modeId];
  if (macroPath && !hasPendingRoomRequest()) {
    const playerIds = tryMatch(valid.gameType, valid.modeId);
    if (playerIds) {
      createMatch(playerIds, valid.gameType, valid.modeId);
      fireMacroDroid(macroPath); // async, fire and forget
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

// Poll for the current player's match status
router.get("/quickmatch/match", requireAuth, (req, res) => {
  const userId = String(req.user!.userId);
  const match = getMatchForPlayer(userId);
  if (!match) {
    res.json({ status: "none" });
    return;
  }
  if (match.status === "credentials_ready" && match.credentials) {
    res.json({
      status: "ready",
      matchId: match.id,
      roomId: match.credentials.roomId,
      password: match.credentials.password,
      gameType: match.gameType,
      modeId: match.modeId,
    });
    return;
  }
  res.json({ status: "waiting_room", matchId: match.id });
});

// Player dismisses match after joining the room
router.post("/quickmatch/match/dismiss", requireAuth, (req, res) => {
  const { matchId } = req.body as { matchId?: string };
  if (matchId) dismissMatch(matchId);
  res.json({ ok: true });
});

export default router;
