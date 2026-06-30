import { Router, type IRouter } from "express";
import { getQueueStats, joinQueue, leaveQueue } from "../lib/quickmatch-queue.js";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

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
  const userId = req.user!.userId;
  const valid = validateQueueBody(req.body, res);
  if (!valid) return;
  joinQueue(String(userId), valid.gameType, valid.modeId);
  res.json({ ok: true });
});

router.post("/quickmatch/search/leave", requireAuth, (req, res) => {
  const userId = req.user!.userId;
  const valid = validateQueueBody(req.body, res);
  if (!valid) return;
  leaveQueue(String(userId), valid.gameType, valid.modeId);
  res.json({ ok: true });
});

export default router;
