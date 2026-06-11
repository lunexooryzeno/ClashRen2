/**
 * Admin API — Security flag management
 *
 * GET  /api/admin/security/overview          — aggregate stats
 * GET  /api/admin/security/flags             — paginated flag list (filtered)
 * POST /api/admin/security/flags/:id/resolve — mark a flag resolved
 * DELETE /api/admin/security/flags/:id       — dismiss a flag
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { securityFlagsTable } from "@workspace/db";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth.js";

const router: IRouter = Router();

// ── Overview stats ────────────────────────────────────────────────────────────
router.get("/admin/security/overview", requireAdmin, async (_req, res) => {
  const [
    [{ total }],
    [{ unresolved }],
    [{ critical }],
    [{ high }],
    byType,
  ] = await Promise.all([
    db.select({ total: count() }).from(securityFlagsTable),
    db.select({ unresolved: count() }).from(securityFlagsTable)
      .where(eq(securityFlagsTable.resolved, false)),
    db.select({ critical: count() }).from(securityFlagsTable)
      .where(and(eq(securityFlagsTable.severity, "critical"), eq(securityFlagsTable.resolved, false))),
    db.select({ high: count() }).from(securityFlagsTable)
      .where(and(eq(securityFlagsTable.severity, "high"), eq(securityFlagsTable.resolved, false))),
    db.execute(
      sql`SELECT type, COUNT(*)::int AS cnt FROM security_flags WHERE resolved = false GROUP BY type ORDER BY cnt DESC`,
    ),
  ]);

  res.json({
    total,
    unresolved,
    critical,
    high,
    byType: (byType as any).rows ?? [],
  });
});

// ── Flag list ─────────────────────────────────────────────────────────────────
router.get("/admin/security/flags", requireAdmin, async (req, res) => {
  const { resolved, type, severity, userId } = req.query as Record<string, string | undefined>;

  const where: Parameters<typeof and>[0][] = [
    resolved === "true" ? eq(securityFlagsTable.resolved, true) : eq(securityFlagsTable.resolved, false),
  ];
  if (type) where.push(eq(securityFlagsTable.type, type));
  if (severity) where.push(eq(securityFlagsTable.severity, severity));
  if (userId) where.push(eq(securityFlagsTable.userId!, parseInt(userId)));

  const flags = await db.query.securityFlagsTable.findMany({
    where: and(...where),
    orderBy: [desc(securityFlagsTable.createdAt)],
    limit: 200,
  });

  res.json(flags);
});

// ── Resolve a flag ───────────────────────────────────────────────────────────
router.post("/admin/security/flags/:id/resolve", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { notes } = req.body as { notes?: string };

  const [updated] = await db.update(securityFlagsTable)
    .set({
      resolved: true,
      resolvedAt: new Date(),
      resolvedByAdminId: req.user!.userId === -1 ? null : req.user!.userId,
      notes: notes ?? null,
    })
    .where(eq(securityFlagsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Flag not found" }); return; }
  res.json(updated);
});

// ── Dismiss (resolve without notes) ──────────────────────────────────────────
router.delete("/admin/security/flags/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [updated] = await db.update(securityFlagsTable)
    .set({ resolved: true, resolvedAt: new Date(), resolvedByAdminId: req.user!.userId === -1 ? null : req.user!.userId })
    .where(eq(securityFlagsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Flag not found" }); return; }
  res.json({ ok: true });
});

export default router;
