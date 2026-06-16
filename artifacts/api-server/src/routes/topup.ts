import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  topupRequestsTable,
  usersTable,
  walletTransactionsTable,
  balanceChangeLogsTable,
  paymentSessionsTable,
} from "@workspace/db";
import { eq, sql, and, gt, lte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { topupLimiter } from "../middleware/rate-limiter.js";
import { getPaymentSettings, savePaymentSettings } from "../lib/paymentSettings.js";
import { pushToUser } from "../lib/sse-manager.js";
import { createHash } from "crypto";

const router: IRouter = Router();

const SESSION_DURATION_MS = 5 * 60 * 1_000; // 5 minutes

function getWebhookSecret(): string {
  const settings = getPaymentSettings();
  return settings.webhookSecret || process.env.WEBHOOK_SECRET || "dev_webhook_secret";
}

// ── GET /topup/bp-config ───────────────────────────────────────────────────
router.get("/topup/bp-config", requireAuth, (req, res) => {
  const settings = getPaymentSettings();
  res.json({
    xsrfToken: settings.xsrfToken || null,
    bharatpeSession: settings.bharatpeSession || null,
  });
});

// ── POST /topup/session ────────────────────────────────────────────────────
// Creates or restores a paisa-offset payment session for the user.
// Each concurrent ₹X top-up gets a unique paisa offset (₹X.00, ₹X.01, …)
// so that BharatPe auto-detection can identify which user paid.
router.post("/topup/session", requireAuth, topupLimiter, async (req, res) => {
  const { rupees, diamonds } = req.body as { rupees?: number; diamonds?: number };
  const userId = req.user!.userId;

  if (!rupees || rupees < 1 || !diamonds || diamonds < 1) {
    res.status(400).json({ error: "Invalid amount." });
    return;
  }

  const settings = getPaymentSettings();
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: { id: true, minTopup: true },
  });

  const effectiveMin = user?.minTopup ?? settings.minTopup;
  if (rupees < effectiveMin) {
    res.status(400).json({ error: `Minimum top-up amount is ₹${effectiveMin}.` });
    return;
  }

  // Cancel any expired sessions for this user first
  await db.update(paymentSessionsTable)
    .set({ status: "expired" })
    .where(and(
      eq(paymentSessionsTable.userId, userId),
      eq(paymentSessionsTable.status, "active"),
      lte(paymentSessionsTable.expiresAt, new Date()),
    ));

  // Check if user already has an active session for this exact rupee amount
  const existing = await db.query.paymentSessionsTable.findFirst({
    where: and(
      eq(paymentSessionsTable.userId, userId),
      eq(paymentSessionsTable.baseRupees, rupees),
      eq(paymentSessionsTable.status, "active"),
      gt(paymentSessionsTable.expiresAt, new Date()),
    ),
  });

  if (existing) {
    const exactAmount = parseFloat((existing.baseRupees + existing.paisaOffset / 100).toFixed(2));
    res.json({
      sessionId: existing.id,
      exactAmount,
      paisaOffset: existing.paisaOffset,
      expiresAt: existing.expiresAt.toISOString(),
      diamonds: existing.diamonds,
      restored: true,
    });
    return;
  }

  // Find next available paisa offset for this base rupee amount across all active sessions
  const concurrentSessions = await db.query.paymentSessionsTable.findMany({
    where: and(
      eq(paymentSessionsTable.baseRupees, rupees),
      eq(paymentSessionsTable.status, "active"),
      gt(paymentSessionsTable.expiresAt, new Date()),
    ),
    columns: { paisaOffset: true },
  });

  const usedOffsets = new Set(concurrentSessions.map(s => s.paisaOffset));
  let nextOffset = 0;
  while (usedOffsets.has(nextOffset) && nextOffset < 100) nextOffset++;

  if (nextOffset >= 100) {
    res.status(503).json({ error: "Too many concurrent sessions for this amount. Please try again in a few minutes." });
    return;
  }

  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const [session] = await db.insert(paymentSessionsTable).values({
    userId,
    baseRupees: rupees,
    paisaOffset: nextOffset,
    diamonds,
    status: "active",
    expiresAt,
  }).returning();

  const exactAmount = parseFloat((rupees + nextOffset / 100).toFixed(2));

  res.json({
    sessionId: session.id,
    exactAmount,
    paisaOffset: nextOffset,
    expiresAt: expiresAt.toISOString(),
    diamonds,
    restored: false,
  });
});

// ── GET /topup/session/:id ─────────────────────────────────────────────────
router.get("/topup/session/:id", requireAuth, async (req, res) => {
  const sessionId = parseInt(req.params.id);
  const userId = req.user!.userId;

  if (isNaN(sessionId)) {
    res.status(400).json({ error: "Invalid session ID." });
    return;
  }

  const session = await db.query.paymentSessionsTable.findFirst({
    where: and(
      eq(paymentSessionsTable.id, sessionId),
      eq(paymentSessionsTable.userId, userId),
    ),
  });

  if (!session) {
    res.status(404).json({ error: "Session not found." });
    return;
  }

  const now = new Date();
  const isExpired = session.status === "active" && session.expiresAt <= now;

  // Lazily expire if missed by poller
  if (isExpired) {
    await db.update(paymentSessionsTable)
      .set({ status: "expired" })
      .where(eq(paymentSessionsTable.id, session.id));
    session.status = "expired";
  }

  res.json({
    sessionId: session.id,
    status: session.status,
    baseRupees: session.baseRupees,
    paisaOffset: session.paisaOffset,
    exactAmount: parseFloat((session.baseRupees + session.paisaOffset / 100).toFixed(2)),
    diamonds: session.diamonds,
    expiresAt: session.expiresAt.toISOString(),
    topupRequestId: session.topupRequestId,
    matchedAmount: session.matchedAmount,
  });
});

// ── DELETE /topup/session/:id ──────────────────────────────────────────────
router.delete("/topup/session/:id", requireAuth, async (req, res) => {
  const sessionId = parseInt(req.params.id);
  const userId = req.user!.userId;

  if (isNaN(sessionId)) {
    res.status(400).json({ error: "Invalid session ID." });
    return;
  }

  await db.update(paymentSessionsTable)
    .set({ status: "cancelled" })
    .where(and(
      eq(paymentSessionsTable.id, sessionId),
      eq(paymentSessionsTable.userId, userId),
      eq(paymentSessionsTable.status, "active"),
    ));

  res.json({ ok: true });
});

// ── POST /topup/submit ─────────────────────────────────────────────────────
// Legacy: Creates a pending topup with UTR (fallback for manual verification)
router.post("/topup/submit", requireAuth, topupLimiter, async (req, res) => {
  const { utr, rupees, diamonds } = req.body as {
    utr?: string; rupees?: number; diamonds?: number;
  };
  const userId = req.user!.userId;

  if (!utr || utr.trim().length < 6) {
    res.status(400).json({ error: "Invalid UTR. Must be at least 6 characters." });
    return;
  }
  if (!rupees || rupees < 1 || !diamonds || diamonds < 1) {
    res.status(400).json({ error: "Invalid amount." });
    return;
  }

  const cleanUtr = utr.trim();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const existing = await db.query.topupRequestsTable.findFirst({
    where: and(
      eq(topupRequestsTable.utr, cleanUtr),
      eq(topupRequestsTable.status, "verified"),
      gt(topupRequestsTable.createdAt, thirtyDaysAgo),
    ),
  });
  if (existing) {
    res.status(409).json({ error: "This UTR has already been used for a previous top-up." });
    return;
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: { id: true, phone: true, diamondBalance: true, minTopup: true },
  });
  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  const settings = getPaymentSettings();
  const effectiveMin = user.minTopup ?? settings.minTopup;
  if (rupees < effectiveMin) {
    res.status(400).json({ error: `Minimum top-up amount is ₹${effectiveMin}.` });
    return;
  }
  const phoneHash = createHash("md5").update(user.phone).digest("hex");

  const [request] = await db.insert(topupRequestsTable).values({
    userId,
    rupees,
    diamonds,
    utr: cleanUtr,
    status: "pending",
    bharatpeData: { phoneHash },
  }).returning();

  let verifyUrl: string | null = null;
  if (settings.webhookUrl) {
    const base = settings.webhookUrl.replace(/\/+$/, "");
    const query = `UserPaymentManagement(PhoneNumberHash)=${encodeURIComponent(phoneHash)}&UserPaymentManagement(UTR)=${encodeURIComponent(cleanUtr)}&UserPaymentManagement(Amount)=${encodeURIComponent(String(rupees))}`;
    verifyUrl = `${base}/payment.api.payment.verification?${query}`;
  }

  res.json({ topupId: request.id, pending: true, verifyUrl });
});

// ── GET /topup/status/:id ──────────────────────────────────────────────────
router.get("/topup/status/:id", requireAuth, async (req, res) => {
  const topupId = parseInt(req.params.id);
  const userId = req.user!.userId;

  if (isNaN(topupId)) {
    res.status(400).json({ error: "Invalid topup ID." });
    return;
  }

  const topup = await db.query.topupRequestsTable.findFirst({
    where: and(eq(topupRequestsTable.id, topupId), eq(topupRequestsTable.userId, userId)),
    columns: { id: true, status: true, diamonds: true, rupees: true, utr: true, verifiedAt: true, rejectedReason: true },
  });

  if (!topup) {
    res.status(404).json({ error: "Topup request not found." });
    return;
  }

  res.json({
    topupId: topup.id,
    status: topup.status,
    diamonds: topup.diamonds,
    rupees: topup.rupees,
    verifiedAt: topup.verifiedAt,
    rejectedReason: topup.rejectedReason ?? null,
  });
});

// ── POST /webhook/payment ──────────────────────────────────────────────────
router.post("/webhook/payment", async (req, res) => {
  const { utr, action, secret, reason } = req.body as {
    utr?: string; action?: "approve" | "reject"; secret?: string; reason?: string;
  };

  if (!secret || secret !== getWebhookSecret()) {
    res.status(401).json({ error: "Invalid webhook secret." });
    return;
  }

  if (!utr || !action || !["approve", "reject"].includes(action)) {
    res.status(400).json({ error: "Missing or invalid fields: utr, action." });
    return;
  }

  const topup = await db.query.topupRequestsTable.findFirst({
    where: and(eq(topupRequestsTable.utr, utr.trim()), eq(topupRequestsTable.status, "pending")),
  });

  if (!topup) {
    res.status(404).json({ error: "No pending topup found for this UTR." });
    return;
  }

  if (action === "reject") {
    await db.update(topupRequestsTable)
      .set({ status: "rejected", rejectedAt: new Date(), rejectedReason: reason ?? "Rejected by payment processor." })
      .where(eq(topupRequestsTable.id, topup.id));

    res.json({ ok: true, action: "rejected", utr });
    return;
  }

  const userRow = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, topup.userId),
    columns: { id: true, diamondBalance: true },
  });

  await db.update(usersTable)
    .set({ diamondBalance: sql`diamond_balance + ${topup.diamonds}` })
    .where(eq(usersTable.id, topup.userId));

  await db.update(topupRequestsTable)
    .set({ status: "verified", verifiedAt: new Date() })
    .where(eq(topupRequestsTable.id, topup.id));

  await db.insert(balanceChangeLogsTable).values({
    userId: topup.userId,
    adminId: null,
    amount: topup.diamonds,
    balanceBefore: userRow?.diamondBalance ?? 0,
    balanceAfter: (userRow?.diamondBalance ?? 0) + topup.diamonds,
    reason: `Top-up ₹${topup.rupees} · UTR ${topup.utr}`,
    source: "topup_verified",
  });

  await db.insert(walletTransactionsTable).values({
    userId: topup.userId,
    type: "topup",
    amount: topup.diamonds,
    label: `Top-up ₹${topup.rupees} · UTR ${topup.utr}`,
  });

  pushToUser(topup.userId, "topup_verified", {
    topupId: topup.id,
    diamonds: topup.diamonds,
    rupees: topup.rupees,
    utr: topup.utr,
  });

  console.log(`[Webhook] Approved topup #${topup.id} (UTR ${utr}): +${topup.diamonds} diamonds for user ${topup.userId}`);
  res.json({ ok: true, action: "approved", utr, diamonds: topup.diamonds });
});

export default router;
