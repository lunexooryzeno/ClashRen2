import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { reportsTable, feedbackTable, usersTable, tournamentsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { reportLimiter } from "../middleware/rate-limiter.js";

const router: IRouter = Router();

const VALID_CATEGORIES = new Set([
  "cheating", "fake_winner", "harassment", "abusive_behavior",
  "false_score", "dispute", "other",
]);

// ── Submit a report ───────────────────────────────────────────────────────────
router.post("/reports", requireAuth, reportLimiter, async (req, res) => {
  const { category, evidence, accusedId, accusedName, tournamentId, _hp } = req.body as {
    category?: string; evidence?: string;
    accusedId?: number; accusedName?: string; tournamentId?: number;
    _hp?: string;
  };

  // Honeypot: bots that fill hidden fields get a silent fake success
  if (_hp) {
    res.json({ id: -1, createdAt: new Date().toISOString() });
    return;
  }

  if (!category?.trim() || !VALID_CATEGORIES.has(category.trim())) {
    res.status(400).json({ error: "Invalid category." }); return;
  }
  if (!evidence?.trim() || evidence.trim().length < 10) {
    res.status(400).json({ error: "Please provide more detail in the evidence field (min 10 characters)." }); return;
  }
  const [report] = await db.insert(reportsTable).values({
    reporterId: req.user!.userId,
    accusedId: accusedId ?? null,
    accusedName: accusedName?.trim() || null,
    category: category.trim(),
    evidence: evidence.trim(),
    tournamentId: tournamentId ?? null,
    status: "pending",
  }).returning();
  res.json({ id: report.id, createdAt: report.createdAt.toISOString() });
});

// ── Get my reports ────────────────────────────────────────────────────────────
router.get("/reports/mine", requireAuth, async (req, res) => {
  const reports = await db.query.reportsTable.findMany({
    where: eq(reportsTable.reporterId, req.user!.userId),
    orderBy: [desc(reportsTable.createdAt)],
  });
  res.json(reports.map(r => ({
    id: r.id, category: r.category, evidence: r.evidence,
    accusedName: r.accusedName, status: r.status,
    adminNotes: r.adminNotes, createdAt: r.createdAt.toISOString(),
  })));
});

// ── Submit feedback ───────────────────────────────────────────────────────────
router.post("/feedback", requireAuth, async (req, res) => {
  const { type, message } = req.body as { type?: string; message?: string };
  if (!message?.trim()) {
    res.status(400).json({ error: "Message is required" }); return;
  }
  const [fb] = await db.insert(feedbackTable).values({
    userId: req.user!.userId,
    type: type?.trim() || "general",
    message: message.trim(),
  }).returning();
  res.json({ id: fb.id, createdAt: fb.createdAt.toISOString() });
});

export default router;
