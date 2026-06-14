import { Router, type IRouter } from "express";
import { requireAuth, requireSuperAdmin } from "../middlewares/auth.js";
import { fetchFreefireProfile } from "../lib/freefireKeys.js";
import { db } from "@workspace/db";
import { freefireApiKeysTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router: IRouter = Router();

export type { NormalizedProfile } from "../lib/freefireKeys.js";

// ── GET /freefire/player ────────────────────────────────────────────────────
router.get("/freefire/player", requireAuth, async (req, res) => {
  const { uid, region = "ind" } = req.query as { uid?: string; region?: string };

  if (!uid || !/^\d{8,14}$/.test(uid)) {
    return res.status(400).json({ error: "Invalid UID. Must be 8–14 digits." });
  }

  const profile = await fetchFreefireProfile(uid, String(region));
  if (profile) return res.json(profile);

  return res.json({ manual: true, uid });
});

// ── GET /freefire/sources ───────────────────────────────────────────────────
router.get("/freefire/sources", requireAuth, async (_req, res) => {
  const keys = await db.query.freefireApiKeysTable.findMany({
    columns: { id: true, label: true, isActive: true, requestCount: true, lastUsedAt: true },
    orderBy: asc(freefireApiKeysTable.id),
  });
  return res.json({ provider: "Gameskinbo", keys });
});

// ── Admin: list API keys ────────────────────────────────────────────────────
router.get("/freefire/api-keys", requireSuperAdmin, async (_req, res) => {
  const keys = await db.query.freefireApiKeysTable.findMany({
    orderBy: asc(freefireApiKeysTable.id),
  });
  return res.json(keys);
});

// ── Admin: add API key ──────────────────────────────────────────────────────
router.post("/freefire/api-keys", requireSuperAdmin, async (req, res) => {
  const { key, label = "" } = req.body as { key?: string; label?: string };
  if (!key?.trim()) return res.status(400).json({ error: "key is required" });

  const [row] = await db
    .insert(freefireApiKeysTable)
    .values({ key: key.trim(), label: label.trim() })
    .onConflictDoNothing()
    .returning();

  if (!row) return res.status(409).json({ error: "Key already exists" });
  return res.status(201).json(row);
});

// ── Admin: toggle active ────────────────────────────────────────────────────
router.patch("/freefire/api-keys/:id", requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { isActive, label } = req.body as { isActive?: boolean; label?: string };

  const patch: Record<string, unknown> = {};
  if (typeof isActive === "boolean") patch.isActive = isActive;
  if (typeof label === "string") patch.label = label.trim();

  if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Nothing to update" });

  const [row] = await db
    .update(freefireApiKeysTable)
    .set(patch)
    .where(eq(freefireApiKeysTable.id, id))
    .returning();

  if (!row) return res.status(404).json({ error: "Key not found" });
  return res.json(row);
});

// ── Admin: delete API key ───────────────────────────────────────────────────
router.delete("/freefire/api-keys/:id", requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(freefireApiKeysTable).where(eq(freefireApiKeysTable.id, id));
  return res.status(204).send();
});

export default router;
