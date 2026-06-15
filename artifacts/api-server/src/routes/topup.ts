import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  topupRequestsTable,
  usersTable,
  walletTransactionsTable,
  balanceChangeLogsTable,
  paymentSessionsTable,
} from "@workspace/db";
import { eq, sql, and, gt, lt } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { topupLimiter } from "../middleware/rate-limiter.js";
import { getPaymentSettings, savePaymentSettings } from "../lib/paymentSettings.js";
import { pushToUser } from "../lib/sse-manager.js";
import { createHash } from "crypto";

const router: IRouter = Router();

const SESSION_DURATION_MS = 5 * 60 * 1000;

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

// ── POST /topup/session/create ─────────────────────────────────────────────
// Allocates a unique paisa-offset slot and creates a 5-min payment session.
router.post("/topup/session/create", requireAuth, topupLimiter, async (req, res) => {
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
    res.status(400).json({ error: `Minimum top-up is ₹${effectiveMin}.` });
    return;
  }

  const now = new Date();

  // Return existing active unexpired session for the same amount (idempotent create)
  const existing = await db.query.paymentSessionsTable.findFirst({
    where: and(
      eq(paymentSessionsTable.userId, userId),
      eq(paymentSessionsTable.baseRupees, rupees),
      eq(paymentSessionsTable.status, "active"),
      gt(paymentSessionsTable.expiresAt, now),
    ),
  });
  if (existing) {
    res.json({
      sessionId: existing.id,
      baseRupees: existing.baseRupees,
      offsetPaise: existing.offsetPaise,
      expiresAt: existing.expiresAt.toISOString(),
    });
    return;
  }

  // Expire any lingering active sessions for this user (different amounts or truly stale)
  await db
    .update(paymentSessionsTable)
    .set({ status: "expired" })
    .where(
      and(
        eq(paymentSessionsTable.userId, userId),
        eq(paymentSessionsTable.status, "active"),
      ),
    );

  // Find all occupied paise offsets for this base amount still active (other users)
  const occupied = await db.query.paymentSessionsTable.findMany({
    where: and(
      eq(paymentSessionsTable.baseRupees, rupees),
      eq(paymentSessionsTable.status, "active"),
      gt(paymentSessionsTable.expiresAt, now),
    ),
    columns: { offsetPaise: true },
  });

  const usedOffsets = new Set(occupied.map((s) => s.offsetPaise));
  let offset = 0;
  while (usedOffsets.has(offset) && offset < 100) offset++;
  if (offset >= 100) {
    res.status(503).json({ error: "All payment slots busy. Please try again in a moment." });
    return;
  }

  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const [session] = await db
    .insert(paymentSessionsTable)
    .values({ userId, baseRupees: rupees, offsetPaise: offset, expiresAt, status: "active" })
    .returning();

  res.json({
    sessionId: session.id,
    baseRupees: rupees,
    offsetPaise: offset,
    expiresAt: expiresAt.toISOString(),
  });
});

// ── GET /topup/session/:id ─────────────────────────────────────────────────
// Poll endpoint — returns session status. Includes topupRequest when completed.
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

  // Auto-expire if past expiresAt
  let status = session.status;
  if (status === "active" && session.expiresAt < new Date()) {
    await db
      .update(paymentSessionsTable)
      .set({ status: "expired" })
      .where(eq(paymentSessionsTable.id, session.id));
    status = "expired";
  }

  let topupRequest: { id: number; diamonds: number; rupees: number; status: string } | null = null;
  if (session.topupRequestId) {
    const tr = await db.query.topupRequestsTable.findFirst({
      where: eq(topupRequestsTable.id, session.topupRequestId),
      columns: { id: true, diamonds: true, rupees: true, status: true },
    });
    topupRequest = tr ?? null;
  }

  res.json({
    sessionId: session.id,
    status,
    baseRupees: session.baseRupees,
    offsetPaise: session.offsetPaise,
    expiresAt: session.expiresAt.toISOString(),
    topupRequest,
  });
});

// ── POST /topup/session/:id/cancel ─────────────────────────────────────────
// Cancels an active session early.
router.post("/topup/session/:id/cancel", requireAuth, async (req, res) => {
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
      eq(paymentSessionsTable.status, "active"),
    ),
  });

  if (!session) {
    res.status(404).json({ error: "No active session found." });
    return;
  }

  await db
    .update(paymentSessionsTable)
    .set({ status: "expired" })
    .where(eq(paymentSessionsTable.id, session.id));

  res.json({ ok: true });
});

// ── POST /topup/submit ─────────────────────────────────────────────────────
// Creates a pending topup, forwards to external webhook, returns topupId
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

  // Block duplicate UTR only if a verified top-up already used it
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

  // Get user's phone and hash it with MD5
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: { id: true, phone: true, diamondBalance: true, minTopup: true },
  });
  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  // Enforce effective minimum top-up (per-user override > global)
  const settings = getPaymentSettings();
  const effectiveMin = user.minTopup ?? settings.minTopup;
  if (rupees < effectiveMin) {
    res.status(400).json({ error: `Minimum top-up amount is ₹${effectiveMin}.` });
    return;
  }
  const phoneHash = createHash("md5").update(user.phone).digest("hex");

  // Create pending topup record
  const [request] = await db.insert(topupRequestsTable).values({
    userId,
    rupees,
    diamonds,
    utr: cleanUtr,
    status: "pending",
    bharatpeData: { phoneHash },
  }).returning();

  // Build the MacroDroid verification URL and return it so the browser fires it
  let verifyUrl: string | null = null;
  if (settings.webhookUrl) {
    const base = settings.webhookUrl.replace(/\/+$/, "");
    const query = `UserPaymentManagement(PhoneNumberHash)=${encodeURIComponent(phoneHash)}&UserPaymentManagement(UTR)=${encodeURIComponent(cleanUtr)}&UserPaymentManagement(Amount)=${encodeURIComponent(String(rupees))}`;
    verifyUrl = `${base}/payment.api.payment.verification?${query}`;
  }

  res.json({ topupId: request.id, pending: true, verifyUrl });
});

// ── GET /topup/status/:id ──────────────────────────────────────────────────
// Frontend polls this to know when diamonds are credited
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
// Called by external payment processor to approve or reject a topup
// Body: { topupId, action: "approve" | "reject", secret, reason? }
router.post("/webhook/payment", async (req, res) => {
  const { utr, action, secret, reason } = req.body as {
    utr?: string; action?: "approve" | "reject"; secret?: string; reason?: string;
  };

  // Validate secret
  if (!secret || secret !== getWebhookSecret()) {
    res.status(401).json({ error: "Invalid webhook secret." });
    return;
  }

  if (!utr || !action || !["approve", "reject"].includes(action)) {
    res.status(400).json({ error: "Missing or invalid fields: utr, action." });
    return;
  }

  // Find the most recent pending topup matching this UTR
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

  // Approve — credit diamonds
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

  // Push instant SSE notification so the user sees a confirmation immediately,
  // even if they navigated away from the waiting screen.
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
