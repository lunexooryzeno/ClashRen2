/**
 * Admin worker phone management routes.
 * Mounted under /api/admin/workers.
 */

import { Router, type IRouter } from "express";
import { db, quickmatchWorkersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth.js";
import { getMatchById } from "../lib/quickmatch-matches.js";
import { cancelMatch } from "../lib/quickmatch-cancel.js";
import { markWorkerFree } from "../lib/worker-tokens.js";

const router: IRouter = Router();

function maskSecret(secret: string): string {
  if (!secret || secret.length < 8) return "****";
  return secret.slice(0, 4) + "****" + secret.slice(-4);
}

function formatWorker(w: typeof quickmatchWorkersTable.$inferSelect, includeSecret = false) {
  return {
    id: w.id,
    name: w.name,
    webhookUrl: w.webhookUrl,
    webhookSecret: includeSecret ? w.webhookSecret : maskSecret(w.webhookSecret),
    supportedGameModes: w.supportedGameModes,
    status: w.status,
    priority: w.priority,
    lastHeartbeatAt: w.lastHeartbeatAt?.toISOString() ?? null,
    currentJobMatchId: w.currentJobMatchId ?? null,
    createdAt: w.createdAt.toISOString(),
  };
}

// GET /api/admin/workers — list all workers
router.get("/admin/workers", requireAdmin, async (_req, res) => {
  res.set("Cache-Control", "no-store");
  const workers = await db.query.quickmatchWorkersTable.findMany({
    orderBy: (w, { desc }) => [desc(w.priority)],
  });
  res.json(workers.map((w) => formatWorker(w)));
});

// POST /api/admin/workers — create a worker
router.post("/admin/workers", requireAdmin, async (req, res) => {
  const { name, webhookUrl, webhookSecret, supportedGameModes, priority } = req.body as {
    name?: string;
    webhookUrl?: string;
    webhookSecret?: string;
    supportedGameModes?: string;
    priority?: number;
  };

  if (!name || !webhookUrl || !webhookSecret) {
    res.status(400).json({ error: "name, webhookUrl, and webhookSecret are required" });
    return;
  }

  const [worker] = await db
    .insert(quickmatchWorkersTable)
    .values({
      name: name.trim(),
      webhookUrl: webhookUrl.trim(),
      webhookSecret: webhookSecret.trim(),
      supportedGameModes: supportedGameModes?.trim() ?? "duel,healing,knife",
      priority: priority ?? 0,
    })
    .returning();

  // Return the raw secret only on creation (one-time reveal)
  res.status(201).json(formatWorker(worker, true));
});

// PATCH /api/admin/workers/:id — update a worker
router.patch("/admin/workers/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { name, webhookUrl, webhookSecret, supportedGameModes, status, priority } = req.body as {
    name?: string;
    webhookUrl?: string;
    webhookSecret?: string;
    supportedGameModes?: string;
    status?: string;
    priority?: number;
  };

  const patch: Partial<typeof quickmatchWorkersTable.$inferInsert> = {};
  if (name !== undefined) patch.name = name.trim();
  if (webhookUrl !== undefined) patch.webhookUrl = webhookUrl.trim();
  if (webhookSecret !== undefined) patch.webhookSecret = webhookSecret.trim();
  if (supportedGameModes !== undefined) patch.supportedGameModes = supportedGameModes.trim();
  if (status !== undefined) patch.status = status;
  if (priority !== undefined) patch.priority = priority;

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db
    .update(quickmatchWorkersTable)
    .set(patch)
    .where(eq(quickmatchWorkersTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Worker not found" }); return; }
  res.json(formatWorker(updated));
});

// DELETE /api/admin/workers/:id — delete a worker
router.delete("/admin/workers/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(quickmatchWorkersTable)
    .where(eq(quickmatchWorkersTable.id, id))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Worker not found" }); return; }
  res.json({ ok: true });
});

// POST /api/admin/workers/:id/test — fire a ping to the worker webhook
router.post("/admin/workers/:id/test", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const worker = await db.query.quickmatchWorkersTable.findFirst({
    where: (w, { eq }) => eq(w.id, id),
  });
  if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }

  const pingUrl = `${worker.webhookUrl}?action=ping`;
  let status = 0;
  let latencyMs = 0;
  const start = Date.now();
  try {
    const resp = await fetch(pingUrl, { method: "GET", signal: AbortSignal.timeout(10_000) });
    status = resp.status;
  } catch (err: any) {
    res.json({ ok: false, error: err?.message ?? "Request failed", latencyMs: Date.now() - start });
    return;
  }
  latencyMs = Date.now() - start;
  res.json({ ok: status >= 200 && status < 400, status, latencyMs });
});

// POST /api/admin/workers/:id/force-stop — release a worker from its current job
router.post("/admin/workers/:id/force-stop", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const worker = await db.query.quickmatchWorkersTable.findFirst({
    where: (w, { eq }) => eq(w.id, id),
  });
  if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }

  const matchId = worker.currentJobMatchId;
  if (matchId) {
    const match = getMatchById(matchId);
    if (match) {
      await cancelMatch(matchId, "Admin force-stopped worker phone", match);
    }
  }

  await markWorkerFree(id);
  res.json({ ok: true, releasedMatchId: matchId ?? null });
});

export default router;
