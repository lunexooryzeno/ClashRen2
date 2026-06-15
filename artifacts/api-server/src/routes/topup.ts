import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { topupRequestsTable, topupSessionsTable, usersTable, walletTransactionsTable, balanceChangeLogsTable } from "@workspace/db";
import { eq, sql, and, gt, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { topupLimiter } from "../middleware/rate-limiter.js";
import { getPaymentSettings, savePaymentSettings } from "../lib/paymentSettings.js";
import { pushToUser } from "../lib/sse-manager.js";
import { createHash, randomUUID } from "crypto";

const router: IRouter = Router();

const SESSION_DURATION_MS = 5 * 60 * 1000; // 5 minutes

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
// Creates (or restores) a paisa-offset payment session.
// Body: { rupees, diamonds, sessionToken? }
router.post("/topup/session", requireAuth, async (req, res) => {
  const { rupees, diamonds, sessionToken } = req.body as {
    rupees?: number; diamonds?: number; sessionToken?: string;
  };
  const userId = req.user!.userId;

  // Restore path: client sends a token it already has
  if (sessionToken) {
    const existing = await db.query.topupSessionsTable.findFirst({
      where: eq(topupSessionsTable.sessionToken, sessionToken),
    });
    if (existing && existing.userId === userId && existing.status === "active" && existing.expiresAt > new Date()) {
      const secondsLeft = Math.max(0, Math.floor((existing.expiresAt.getTime() - Date.now()) / 1000));
      const actualRupees = existing.actualPaise / 100;
      res.json({
        sessionToken: existing.sessionToken,
        actualRupees,
        paisaOffset: existing.paisaOffset,
        expiresAt: existing.expiresAt.toISOString(),
        secondsLeft,
        restored: true,
      });
      return;
    }
    // Token expired or doesn't belong to user — fall through to create new
  }

  if (!rupees || rupees < 1 || !diamonds || diamonds < 1) {
    res.status(400).json({ error: "Invalid amount." });
    return;
  }

  // Find and claim a unique paisa offset atomically.
  // We attempt insert with increasing offsets; the DB partial unique index on
  // actual_paise WHERE status='active' guarantees exactly-once allocation even
  // under concurrent requests. On a uniqueness violation we retry with the next
  // offset rather than relying solely on the pre-insert read.
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  // Clean up expired active sessions first so they don't exhaust offset slots.
  // The partial unique index only covers status='active', so stale expired rows
  // would block allocation indefinitely without this cleanup.
  await db.update(topupSessionsTable)
    .set({ status: "abandoned" })
    .where(
      and(
        eq(topupSessionsTable.status, "active"),
        sql`expires_at < now()`,
      )
    );

  // Seed used-set from current DB state (only non-expired active rows remain)
  const activeSessions = await db
    .select({ paisaOffset: topupSessionsTable.paisaOffset })
    .from(topupSessionsTable)
    .where(
      and(
        eq(topupSessionsTable.baseRupees, rupees),
        eq(topupSessionsTable.status, "active"),
        gt(topupSessionsTable.expiresAt, new Date()),
      )
    );
  const usedOffsets = new Set(activeSessions.map((s: { paisaOffset: number }) => s.paisaOffset));

  let token: string | null = null;
  let paisaOffset = 0;
  let actualPaise = 0;

  while (paisaOffset <= 99) {
    if (usedOffsets.has(paisaOffset)) { paisaOffset++; continue; }

    actualPaise = rupees * 100 + paisaOffset;
    const candidate = randomUUID();

    try {
      await db.insert(topupSessionsTable).values({
        sessionToken: candidate,
        userId,
        baseRupees: rupees,
        actualPaise,
        diamonds,
        paisaOffset,
        expiresAt,
        status: "active",
      });
      token = candidate;
      break; // success
    } catch (err: unknown) {
      // PostgreSQL unique_violation code is '23505'
      const pg = err as { code?: string };
      if (pg?.code === "23505") {
        paisaOffset++;
        continue; // race — try next offset
      }
      throw err; // unexpected error
    }
  }

  if (!token) {
    res.status(503).json({ error: "Too many concurrent sessions for this amount. Please try again shortly." });
    return;
  }

  res.json({
    sessionToken: token,
    actualRupees: actualPaise / 100,
    paisaOffset,
    expiresAt: expiresAt.toISOString(),
    secondsLeft: Math.floor(SESSION_DURATION_MS / 1000),
    restored: false,
  });
});

// ── GET /topup/session/:token ──────────────────────────────────────────────
router.get("/topup/session/:token", requireAuth, async (req, res) => {
  const { token } = req.params;
  const userId = req.user!.userId;

  const session = await db.query.topupSessionsTable.findFirst({
    where: eq(topupSessionsTable.sessionToken, token),
  });

  if (!session || session.userId !== userId) {
    res.status(404).json({ active: false });
    return;
  }

  const now = new Date();
  const active = session.status === "active" && session.expiresAt > now;
  const secondsLeft = active ? Math.max(0, Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000)) : 0;

  res.json({
    active,
    actualRupees: session.actualPaise / 100,
    paisaOffset: session.paisaOffset,
    expiresAt: session.expiresAt.toISOString(),
    secondsLeft,
    baseRupees: session.baseRupees,
    diamonds: session.diamonds,
  });
});

// ── PATCH /topup/session/:token ────────────────────────────────────────────
// Marks a session as completed or abandoned
// Body: { status: "completed" | "abandoned" }
router.patch("/topup/session/:token", requireAuth, async (req, res) => {
  const { token } = req.params;
  const { status } = req.body as { status?: "completed" | "abandoned" };
  const userId = req.user!.userId;

  if (!status || !["completed", "abandoned"].includes(status)) {
    res.status(400).json({ error: "status must be 'completed' or 'abandoned'." });
    return;
  }

  const session = await db.query.topupSessionsTable.findFirst({
    where: eq(topupSessionsTable.sessionToken, token),
  });

  if (!session || session.userId !== userId) {
    res.status(404).json({ error: "Session not found." });
    return;
  }

  await db.update(topupSessionsTable)
    .set({ status })
    .where(eq(topupSessionsTable.sessionToken, token));

  res.json({ ok: true });
});

// ── POST /topup/submit ─────────────────────────────────────────────────────
// Creates a pending topup, forwards to external webhook, returns topupId
router.post("/topup/submit", requireAuth, topupLimiter, async (req, res) => {
  const { utr, rupees: clientRupees, diamonds: clientDiamonds, sessionToken } = req.body as {
    utr?: string; rupees?: number; diamonds?: number; sessionToken?: string;
  };
  const userId = req.user!.userId;

  if (!utr || utr.trim().length < 6) {
    res.status(400).json({ error: "Invalid UTR. Must be at least 6 characters." });
    return;
  }

  // A valid active session is required so every submission carries a unique
  // paisa amount that BharatPe can use to identify the payer.
  if (!sessionToken) {
    res.status(400).json({ error: "Session token is required. Please go back and start a new payment session." });
    return;
  }

  const session = await db.query.topupSessionsTable.findFirst({
    where: eq(topupSessionsTable.sessionToken, sessionToken),
  });

  if (
    !session ||
    session.userId !== userId ||
    session.status !== "active" ||
    session.expiresAt <= new Date()
  ) {
    res.status(409).json({ error: "Payment session expired or invalid. Please go back and start a new session." });
    return;
  }

  // Derive canonical values from session — do not trust client-supplied amounts.
  // If client sends mismatched values, reject to surface tampering attempts.
  const rupees = session.baseRupees;
  const diamonds = session.diamonds;
  const actualPaise = session.actualPaise;

  if (
    (clientRupees !== undefined && clientRupees !== rupees) ||
    (clientDiamonds !== undefined && clientDiamonds !== diamonds)
  ) {
    res.status(409).json({ error: "Amount mismatch. Session values do not match submitted values." });
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

  // Create pending topup record using session-canonical values
  const [request] = await db.insert(topupRequestsTable).values({
    userId,
    rupees,
    diamonds,
    utr: cleanUtr,
    status: "pending",
    bharatpeData: { phoneHash },
    actualPaise,
    sessionToken,
  }).returning();

  // Mark session completed — scoped to this user to prevent cross-user mutations
  if (sessionToken) {
    await db.update(topupSessionsTable)
      .set({ status: "completed" })
      .where(
        and(
          eq(topupSessionsTable.sessionToken, sessionToken),
          eq(topupSessionsTable.userId, userId),
        )
      );
  }

  // Build the MacroDroid verification URL and return it so the browser fires it
  let verifyUrl: string | null = null;
  if (settings.webhookUrl) {
    const base = settings.webhookUrl.replace(/\/+$/, "");
    const amountStr = (actualPaise / 100).toFixed(2);
    const query = `UserPaymentManagement(PhoneNumberHash)=${encodeURIComponent(phoneHash)}&UserPaymentManagement(UTR)=${encodeURIComponent(cleanUtr)}&UserPaymentManagement(Amount)=${encodeURIComponent(amountStr)}`;
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
