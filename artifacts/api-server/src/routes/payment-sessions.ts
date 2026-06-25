import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { paymentSessionsTable } from "@workspace/db";
import { and, eq, gt, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

const SESSION_DURATION_MS = 5 * 60 * 1000;

// POST /api/payment-sessions/create
router.post("/payment-sessions/create", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const { baseAmount, diamonds } = req.body as { baseAmount?: number; diamonds?: number };

  if (!baseAmount || baseAmount <= 0 || !diamonds || diamonds <= 0) {
    res.status(400).json({ error: "Invalid amount or diamonds." });
    return;
  }

  const now = new Date();

  // Block if user already has an active pending session
  const existing = await db.query.paymentSessionsTable.findFirst({
    where: and(
      eq(paymentSessionsTable.userId, userId),
      eq(paymentSessionsTable.status, "pending"),
      gt(paymentSessionsTable.expiresAt, now)
    ),
  });

  if (existing) {
    res.status(409).json({
      error: "active_session",
      session: {
        id: existing.id,
        finalAmount: existing.finalAmount,
        baseAmount: existing.baseAmount,
        diamonds: existing.diamonds,
        expiresAt: existing.expiresAt,
      },
    });
    return;
  }

  // Dynamic Paisa Pool: find highest finalAmount active for this baseAmount
  const pool = await db.query.paymentSessionsTable.findMany({
    where: and(
      eq(paymentSessionsTable.status, "pending"),
      gt(paymentSessionsTable.expiresAt, now),
      sql`${paymentSessionsTable.baseAmount} = ${baseAmount.toFixed(2)}`
    ),
    orderBy: [desc(paymentSessionsTable.finalAmount)],
  });

  let finalAmount: number;
  if (pool.length === 0) {
    finalAmount = baseAmount;
  } else {
    const highest = parseFloat(pool[0].finalAmount);
    finalAmount = Math.round((highest + 0.01) * 100) / 100;
  }

  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  const [session] = await db.insert(paymentSessionsTable).values({
    userId,
    baseAmount: baseAmount.toFixed(2),
    finalAmount: finalAmount.toFixed(2),
    diamonds,
    status: "pending",
    expiresAt,
  }).returning();

  res.json({
    sessionId: session.id,
    baseAmount: session.baseAmount,
    finalAmount: session.finalAmount,
    diamonds: session.diamonds,
    expiresAt: session.expiresAt,
  });
});

// GET /api/payment-sessions/active
router.get("/payment-sessions/active", requireAuth, async (req, res) => {
  const userId = req.user!.userId;

  const session = await db.query.paymentSessionsTable.findFirst({
    where: and(
      eq(paymentSessionsTable.userId, userId),
      eq(paymentSessionsTable.status, "pending"),
      gt(paymentSessionsTable.expiresAt, new Date())
    ),
  });

  if (!session) {
    res.json({ session: null });
    return;
  }

  res.json({
    session: {
      id: session.id,
      baseAmount: session.baseAmount,
      finalAmount: session.finalAmount,
      diamonds: session.diamonds,
      expiresAt: session.expiresAt,
      status: session.status,
    },
  });
});

// GET /api/payment-sessions/:id
router.get("/payment-sessions/:id", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const sessionId = parseInt(req.params.id);

  if (isNaN(sessionId)) {
    res.status(400).json({ error: "Invalid session ID." });
    return;
  }

  const session = await db.query.paymentSessionsTable.findFirst({
    where: and(
      eq(paymentSessionsTable.id, sessionId),
      eq(paymentSessionsTable.userId, userId)
    ),
  });

  if (!session) {
    res.status(404).json({ error: "Session not found." });
    return;
  }

  res.json({
    id: session.id,
    baseAmount: session.baseAmount,
    finalAmount: session.finalAmount,
    diamonds: session.diamonds,
    status: session.status,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
    topupRequestId: session.topupRequestId,
  });
});

// POST /api/payment-sessions/:id/cancel
router.post("/payment-sessions/:id/cancel", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const sessionId = parseInt(req.params.id);

  if (isNaN(sessionId)) {
    res.status(400).json({ error: "Invalid session ID." });
    return;
  }

  const session = await db.query.paymentSessionsTable.findFirst({
    where: and(
      eq(paymentSessionsTable.id, sessionId),
      eq(paymentSessionsTable.userId, userId),
      eq(paymentSessionsTable.status, "pending")
    ),
  });

  if (!session) {
    res.status(404).json({ error: "Active session not found." });
    return;
  }

  await db.update(paymentSessionsTable)
    .set({ status: "cancelled" })
    .where(eq(paymentSessionsTable.id, sessionId));

  res.json({ ok: true });
});

// POST /api/payment-sessions/:id/complete
router.post("/payment-sessions/:id/complete", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const sessionId = parseInt(req.params.id);
  const { topupRequestId } = req.body as { topupRequestId?: number };

  if (isNaN(sessionId)) {
    res.status(400).json({ error: "Invalid session ID." });
    return;
  }

  const session = await db.query.paymentSessionsTable.findFirst({
    where: and(
      eq(paymentSessionsTable.id, sessionId),
      eq(paymentSessionsTable.userId, userId),
      eq(paymentSessionsTable.status, "pending")
    ),
  });

  if (!session) {
    res.status(404).json({ error: "Active session not found." });
    return;
  }

  await db.update(paymentSessionsTable)
    .set({
      status: "completed",
      ...(topupRequestId ? { topupRequestId } : {}),
    })
    .where(eq(paymentSessionsTable.id, sessionId));

  res.json({ ok: true });
});

export default router;
