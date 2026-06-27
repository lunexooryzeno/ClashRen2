import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  walletTransactionsTable, withdrawalRequestsTable, usersTable,
  balanceChangeLogsTable, securityFlagsTable,
} from "@workspace/db";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { requireAuth, requireFullProfile } from "../middlewares/auth.js";
import { withdrawalLimiter } from "../middleware/rate-limiter.js";
import { getPaymentSettings } from "../lib/paymentSettings.js";

const router: IRouter = Router();

router.get("/wallet/transactions", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const txs = await db.query.walletTransactionsTable.findMany({
    where: eq(walletTransactionsTable.userId, userId),
    orderBy: [desc(walletTransactionsTable.createdAt)],
  });

  res.json(
    txs.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      label: t.label,
      tournamentId: t.tournamentId,
      createdAt: t.createdAt.toISOString(),
    })),
  );
});

function isWithinWindow(start: string, end: string): boolean {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const nowMins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  if (startMins <= endMins) return nowMins >= startMins && nowMins < endMins;
  return nowMins >= startMins || nowMins < endMins;
}

// Cooldown between withdrawal requests (6 hours)
const WITHDRAWAL_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// 2FA passcode change cooldown (24 hours)
const TWO_FA_BLOCK_MS = 24 * 60 * 60 * 1000;

router.post("/wallet/withdraw", requireAuth, requireFullProfile, withdrawalLimiter, async (req, res) => {
  const userId = req.user!.userId;
  const { rupees, upiId } = req.body as { rupees?: number; upiId?: string };

  const settings = getPaymentSettings();
  const { ratePerDiamond: RATE, minWithdrawal: MIN_RUPEES } = settings;

  // ── Global toggles ──────────────────────────────────────────────────────────
  if (!settings.withdrawalEnabled) {
    res.status(503).json({ error: "Withdrawals are currently disabled." });
    return;
  }
  if (settings.withdrawalPaused) {
    res.status(503).json({ error: settings.withdrawalPauseMessage || "Withdrawals are temporarily paused." });
    return;
  }
  if (settings.withdrawalWindowEnabled && !isWithinWindow(settings.withdrawalWindowStart, settings.withdrawalWindowEnd)) {
    res.status(503).json({ error: `Withdrawals are only open between ${settings.withdrawalWindowStart} and ${settings.withdrawalWindowEnd} IST.` });
    return;
  }

  // ── Basic input validation ──────────────────────────────────────────────────
  if (!rupees || !Number.isInteger(rupees) || rupees < 1) {
    res.status(400).json({ error: "Invalid amount." });
    return;
  }
  if (!upiId?.trim() || upiId.trim().length < 5) {
    res.status(400).json({ error: "A valid payout destination is required." });
    return;
  }

  const diamondsNeeded = Math.ceil(rupees / RATE);

  // ── Load user (all protection columns) ─────────────────────────────────────
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: {
      id: true,
      diamondBalance: true,
      allowDepositWithdrawal: true,
      minWithdrawal: true,
      twoFaResetAt: true,
      twoFaWithdrawalBypass: true,
      status: true,
      withdrawalBanned: true,
      walletFrozen: true,
      createdAt: true,
    },
  });
  if (!user) { res.status(404).json({ error: "User not found." }); return; }

  // ── Account status ──────────────────────────────────────────────────────────
  if (user.status === "blocked" || user.status === "deleted") {
    res.status(403).json({ error: "Your account is not eligible for withdrawals." });
    return;
  }

  // ── Withdrawal ban ──────────────────────────────────────────────────────────
  if (user.withdrawalBanned) {
    res.status(403).json({ error: "Withdrawals have been disabled on your account. Contact support if you believe this is a mistake." });
    return;
  }

  // ── Wallet frozen ───────────────────────────────────────────────────────────
  if (user.walletFrozen) {
    res.status(403).json({ error: "Your wallet is currently frozen. Please contact support." });
    return;
  }

  // ── 2FA passcode change cooldown ────────────────────────────────────────────
  if (user.twoFaResetAt && !user.twoFaWithdrawalBypass) {
    const elapsed = Date.now() - user.twoFaResetAt.getTime();
    if (elapsed < TWO_FA_BLOCK_MS) {
      const hoursLeft = Math.ceil((TWO_FA_BLOCK_MS - elapsed) / 3600000);
      const expiresAt = new Date(user.twoFaResetAt.getTime() + TWO_FA_BLOCK_MS).toISOString();
      res.status(403).json({
        error: `Withdrawals are locked for ${hoursLeft}h after a passcode change for your security.`,
        reason: "passcode_changed",
        hoursLeft,
        expiresAt,
      });
      return;
    }
  }


  // ── Pending withdrawal block ────────────────────────────────────────────────
  const pendingWithdrawal = await db.query.withdrawalRequestsTable.findFirst({
    where: and(
      eq(withdrawalRequestsTable.userId, userId),
      eq(withdrawalRequestsTable.status, "pending"),
    ),
    columns: { id: true },
  });
  if (pendingWithdrawal) {
    res.status(409).json({
      error: "You already have a pending withdrawal. Please wait for it to be processed before submitting another.",
      reason: "pending_withdrawal",
    });
    return;
  }

  // ── Per-request cooldown (6 hours between withdrawals) ─────────────────────
  const recentWithdrawal = await db.query.withdrawalRequestsTable.findFirst({
    where: and(
      eq(withdrawalRequestsTable.userId, userId),
      gte(withdrawalRequestsTable.createdAt, new Date(Date.now() - WITHDRAWAL_COOLDOWN_MS)),
    ),
    orderBy: [desc(withdrawalRequestsTable.createdAt)],
    columns: { id: true, createdAt: true },
  });
  if (recentWithdrawal) {
    const waitMs = WITHDRAWAL_COOLDOWN_MS - (Date.now() - recentWithdrawal.createdAt.getTime());
    const waitMins = Math.ceil(waitMs / 60000);
    const waitHours = Math.floor(waitMs / 3600000);
    const remMins = Math.ceil((waitMs % 3600000) / 60000);
    const waitLabel = waitHours > 0
      ? `${waitHours}h ${remMins}m`
      : `${waitMins} minute${waitMins !== 1 ? "s" : ""}`;
    res.status(429).json({
      error: `Withdrawals are limited to once every 6 hours. Please wait ${waitLabel}.`,
      reason: "cooldown",
      waitMs,
    });
    return;
  }

  // ── Security flag check ─────────────────────────────────────────────────────
  // Block withdrawals if the account has unresolved high/critical security flags
  const activeFlags = await db.query.securityFlagsTable.findMany({
    where: and(
      eq(securityFlagsTable.userId, userId),
      eq(securityFlagsTable.resolved, false),
    ),
    columns: { type: true, severity: true },
  });
  const hasHighRiskFlag = activeFlags.some(f =>
    (f.type === "emulator_usage" || f.type === "multi_account" || f.type === "ip_cluster") &&
    (f.severity === "high" || f.severity === "critical")
  );
  if (hasHighRiskFlag) {
    res.status(403).json({
      error: "Your account has been flagged for suspicious activity. Withdrawals are temporarily blocked. Please contact support.",
      reason: "security_flag",
    });
    return;
  }

  // ── Per-user minimum amount ─────────────────────────────────────────────────
  const effectiveMin = user.minWithdrawal ?? MIN_RUPEES;
  if (rupees < effectiveMin) {
    res.status(400).json({ error: `Minimum withdrawal is ₹${effectiveMin}.` });
    return;
  }

  // ── Available withdrawable balance ──────────────────────────────────────────
  // Hard guard: must have enough raw balance at all
  if (user.diamondBalance < diamondsNeeded) {
    res.status(400).json({ error: `Insufficient balance. You need ${diamondsNeeded} diamonds to withdraw ₹${rupees}.` });
    return;
  }

  // Soft guard: only prize winnings (and optionally deposits) are withdrawable
  const txs = await db.query.walletTransactionsTable.findMany({
    where: eq(walletTransactionsTable.userId, userId),
    columns: { type: true, amount: true },
  });
  const prizeTotal    = txs.filter(t => t.type === "prize"           && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const depositTotal  = txs.filter(t => t.type === "topup"           && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const withdrawTotal = txs.filter(t => t.type === "withdraw"        && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const refundTotal   = txs.filter(t => t.type === "withdraw_refund" && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  // Cap by actual current balance — lifetime totals don't account for entry fees spent
  const availableWinning = Math.min(user.diamondBalance, Math.max(0, prizeTotal - withdrawTotal + refundTotal));
  const availableDeposit = user.allowDepositWithdrawal ? Math.min(user.diamondBalance, depositTotal) : 0;
  const totalAvailable   = Math.min(user.diamondBalance, availableWinning + availableDeposit);

  if (diamondsNeeded > totalAvailable) {
    res.status(400).json({
      error: user.allowDepositWithdrawal
        ? `Insufficient withdrawable balance. You have ${totalAvailable} withdrawable diamonds (₹${(totalAvailable * RATE).toFixed(2)}).`
        : `Insufficient winning balance. You have ${availableWinning} withdrawable diamonds (₹${(availableWinning * RATE).toFixed(2)}). Only tournament prize winnings can be withdrawn.`,
    });
    return;
  }

  // ── Atomic balance deduction — prevents negative wallet glitch ─────────────
  // Uses a conditional WHERE clause so the UPDATE fails (0 rows) if balance
  // dropped between our check above and this write — no race condition possible.
  const deducted = await db.update(usersTable)
    .set({ diamondBalance: sql`diamond_balance - ${diamondsNeeded}` })
    .where(and(
      eq(usersTable.id, userId),
      gte(usersTable.diamondBalance, diamondsNeeded),
    ))
    .returning({ newBalance: usersTable.diamondBalance });

  if (deducted.length === 0 || (deducted[0].newBalance ?? -1) < 0) {
    res.status(409).json({
      error: "Insufficient balance. Your wallet may have changed — please refresh and try again.",
      reason: "balance_race",
    });
    return;
  }

  const newBalance = deducted[0].newBalance;

  // ── Record the withdrawal ───────────────────────────────────────────────────
  await db.insert(balanceChangeLogsTable).values({
    userId,
    adminId: null,
    amount: -diamondsNeeded,
    balanceBefore: user.diamondBalance,
    balanceAfter: newBalance,
    reason: `Withdrawal ₹${rupees} → ${upiId.trim()}`,
    source: "withdrawal_request",
  });

  await db.insert(walletTransactionsTable).values({
    userId,
    type: "withdraw",
    amount: -diamondsNeeded,
    label: `Withdrawal ₹${rupees} → ${upiId.trim()}`,
  });

  const [request] = await db.insert(withdrawalRequestsTable)
    .values({ userId, rupees, diamondsRedeemed: diamondsNeeded, upiId: upiId.trim(), status: "pending" })
    .returning();

  res.json({
    id: request.id,
    status: "pending",
    rupees: request.rupees,
    diamondsRedeemed: request.diamondsRedeemed,
    upiId: request.upiId,
    createdAt: request.createdAt.toISOString(),
  });
});

router.get("/wallet/withdrawals", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const rows = await db.query.withdrawalRequestsTable.findMany({
    where: eq(withdrawalRequestsTable.userId, userId),
    orderBy: [desc(withdrawalRequestsTable.createdAt)],
    limit: 50,
  });
  res.json(rows.map(r => ({
    id: r.id,
    rupees: r.rupees,
    diamondsRedeemed: r.diamondsRedeemed,
    upiId: r.upiId,
    status: r.status,
    rejectedReason: r.rejectedReason,
    createdAt: r.createdAt.toISOString(),
    paidAt: r.paidAt?.toISOString() ?? null,
    rejectedAt: r.rejectedAt?.toISOString() ?? null,
  })));
});

export default router;
