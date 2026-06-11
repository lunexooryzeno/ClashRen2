/**
 * Fraud & Suspicious Activity Monitor — Admin API
 *
 * GET  /api/admin/fraud/dashboard          — aggregated overview, recent alerts, top risky users
 * GET  /api/admin/fraud/users/:id/profile  — comprehensive fraud profile for a single user
 * POST /api/admin/fraud/users/:id/review   — moderator review actions (hold, note, escalate, etc.)
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  securityFlagsTable,
  usersTable,
  deviceSessionsTable,
  loginHistoryTable,
  tournamentParticipantsTable,
  withdrawalRequestsTable,
  adminLogsTable,
} from "@workspace/db";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { requireAdmin, requireFinanceAdmin } from "../middlewares/auth.js";

const router: IRouter = Router();

// ── Flag type → human label ───────────────────────────────────────────────────
const FLAG_LABELS: Record<string, string> = {
  multi_account:       "Multi-Account",
  emulator_usage:      "Emulator Usage",
  suspicious_win:      "Suspicious Win Pattern",
  ip_cluster:          "IP Cluster",
  new_account_spending:"New Account High-Spend",
  fake_winner:         "Fake Winner Claim",
  rapid_withdrawal:    "Rapid Withdrawal",
  device_switch:       "Device Switching",
  spam_join:           "Spam Tournament Joins",
};

// ── Risk level helper ─────────────────────────────────────────────────────────
function derivedRisk(critical: number, high: number): "critical" | "high" | "medium" {
  if (critical > 0) return "critical";
  if (high > 0) return "high";
  return "medium";
}

// ── GET /admin/fraud/dashboard ─────────────────────────────────────────────────
router.get("/admin/fraud/dashboard", requireAdmin, async (_req, res) => {
  const dayAgo      = new Date(Date.now() -      24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [statsRows, recentAlertRows, riskyUserRows] = await Promise.all([

    // Summary stats
    db.execute(sql`
      SELECT
        COUNT(DISTINCT user_id)::int                                                            AS flagged_users,
        COUNT(CASE WHEN severity = 'critical' AND resolved = false THEN 1 END)::int            AS critical,
        COUNT(CASE WHEN severity = 'high'     AND resolved = false THEN 1 END)::int            AS high,
        COUNT(CASE WHEN severity = 'medium'   AND resolved = false THEN 1 END)::int            AS medium,
        COUNT(CASE WHEN resolved = false THEN 1 END)::int                                       AS pending,
        COUNT(CASE WHEN created_at >= ${dayAgo} THEN 1 END)::int                               AS alerts_today
      FROM security_flags
    `),

    // Recent alerts (last 24 h)
    db.execute(sql`
      SELECT
        sf.id, sf.user_id AS "userId", sf.type, sf.severity,
        sf.details, sf.resolved, sf.created_at AS "createdAt",
        u.in_game_name AS "inGameName", u.platform_id AS "platformId"
      FROM security_flags sf
      JOIN users u ON u.id = sf.user_id
      WHERE sf.created_at >= ${dayAgo}
      ORDER BY
        CASE sf.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
        sf.created_at DESC
      LIMIT 30
    `),

    // Top risky users with unresolved flags
    db.execute(sql`
      SELECT
        sf.user_id                                                                                              AS "userId",
        u.in_game_name                                                                                          AS "inGameName",
        u.platform_id                                                                                           AS "platformId",
        u.created_at                                                                                            AS "accountCreatedAt",
        u.withdrawal_banned                                                                                     AS "withdrawalBanned",
        u.wallet_frozen                                                                                         AS "walletFrozen",
        u.tournament_banned                                                                                     AS "tournamentBanned",
        u.status,
        COUNT(sf.id)::int                                                                                       AS "flagCount",
        COUNT(CASE WHEN sf.severity = 'critical' AND sf.resolved = false THEN 1 END)::int                      AS "criticalFlags",
        COUNT(CASE WHEN sf.severity = 'high'     AND sf.resolved = false THEN 1 END)::int                      AS "highFlags",
        COUNT(CASE WHEN sf.severity = 'medium'   AND sf.resolved = false THEN 1 END)::int                      AS "mediumFlags",
        COUNT(CASE WHEN sf.resolved = false THEN 1 END)::int                                                    AS "unresolvedFlags",
        ARRAY_AGG(DISTINCT sf.type)                                                                             AS "flagTypes",
        MAX(sf.created_at)                                                                                      AS "lastFlaggedAt"
      FROM security_flags sf
      JOIN users u ON u.id = sf.user_id
      WHERE sf.resolved = false
      GROUP BY sf.user_id, u.in_game_name, u.platform_id, u.created_at,
               u.withdrawal_banned, u.wallet_frozen, u.tournament_banned, u.status
      ORDER BY "criticalFlags" DESC, "highFlags" DESC, "flagCount" DESC
      LIMIT 100
    `),
  ]);

  const statsRow = (statsRows as any).rows?.[0] ?? {};

  res.json({
    stats: {
      flaggedUsers:  Number(statsRow.flagged_users  ?? 0),
      critical:      Number(statsRow.critical       ?? 0),
      high:          Number(statsRow.high           ?? 0),
      medium:        Number(statsRow.medium         ?? 0),
      pending:       Number(statsRow.pending        ?? 0),
      alertsToday:   Number(statsRow.alerts_today   ?? 0),
    },
    recentAlerts: (recentAlertRows  as any).rows ?? [],
    riskyUsers:   (riskyUserRows    as any).rows ?? [],
  });
});

// ── GET /admin/fraud/users/:id/profile ────────────────────────────────────────
router.get("/admin/fraud/users/:id/profile", requireAdmin, async (req, res) => {
  const userId = parseInt(String(req.params.id));
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dayAgo       = new Date(Date.now() -      24 * 60 * 60 * 1000);

  const [user, allFlags, deviceSessions, recentParticipations, recentWithdrawals, moderationHistory] =
    await Promise.all([
      db.query.usersTable.findFirst({
        where: eq(usersTable.id, userId),
        columns: {
          id: true, inGameName: true, phone: true, platformId: true, uid: true,
          createdAt: true, status: true, isAdmin: true, adminRole: true,
          tournamentBanned: true, withdrawalBanned: true, walletFrozen: true,
          topupBanned: true, chatMuted: true, diamondBalance: true,
        },
      }),
      db.query.securityFlagsTable.findMany({
        where: eq(securityFlagsTable.userId, userId),
        orderBy: [desc(securityFlagsTable.createdAt)],
      }),
      db.query.deviceSessionsTable.findMany({
        where: eq(deviceSessionsTable.userId, userId),
        orderBy: [desc(deviceSessionsTable.lastSeenAt)],
        limit: 10,
      }),
      db.query.tournamentParticipantsTable.findMany({
        where: and(
          eq(tournamentParticipantsTable.userId, userId),
          gte(tournamentParticipantsTable.createdAt, sevenDaysAgo),
        ),
        orderBy: [desc(tournamentParticipantsTable.createdAt)],
      }),
      db.query.withdrawalRequestsTable.findMany({
        where: eq(withdrawalRequestsTable.userId, userId),
        orderBy: [desc(withdrawalRequestsTable.createdAt)],
        limit: 10,
      }),
      db.execute(sql`
        SELECT action, category, details, created_at AS "createdAt"
        FROM admin_logs
        WHERE target_id = ${String(userId)} AND target_type = 'user'
        ORDER BY created_at DESC
        LIMIT 40
      `),
    ]);

  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // Related accounts: shared fingerprint or IP
  const relatedAccounts = await db.execute(sql`
    SELECT DISTINCT
      ds2.user_id                   AS "userId",
      u2.in_game_name               AS "inGameName",
      u2.platform_id                AS "platformId",
      ds2.ip,
      ds2.fingerprint,
      CASE
        WHEN ds2.fingerprint IN (
          SELECT fingerprint FROM device_sessions
          WHERE user_id = ${userId} AND fingerprint IS NOT NULL
        ) THEN 'fingerprint'
        ELSE 'ip'
      END                           AS "matchType"
    FROM device_sessions ds1
    JOIN device_sessions ds2
      ON  (ds1.fingerprint IS NOT NULL AND ds1.fingerprint = ds2.fingerprint)
       OR (ds1.ip          IS NOT NULL AND ds1.ip          = ds2.ip)
    JOIN users u2 ON u2.id = ds2.user_id
    WHERE ds1.user_id = ${userId}
      AND ds2.user_id != ${userId}
    LIMIT 15
  `);

  // ── Trust-score computation ─────────────────────────────────────────────────
  const unresolvedFlags   = allFlags.filter(f => !f.resolved);
  const criticalCount     = unresolvedFlags.filter(f => f.severity === "critical").length;
  const highCount         = unresolvedFlags.filter(f => f.severity === "high").length;
  const mediumCount       = unresolvedFlags.filter(f => f.severity === "medium").length;
  const ageDays           = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const firstPlaces       = recentParticipations.filter(p => p.placement === 1).length;
  const totalDiamondsWon  = recentParticipations.reduce((s, p) => s + (p.diamondsWon ?? 0), 0);
  const withdrawalsIn24h  = recentWithdrawals.filter(w => new Date(w.createdAt) > dayAgo).length;

  let score = 100;
  const factors: { factor: string; impact: number; detail: string }[] = [];

  const push = (f: string, impact: number, detail: string) => {
    score += impact;
    factors.push({ factor: f, impact, detail });
  };

  if (ageDays < 1)      push("very_new_account",  -30, "Account created less than 24 hours ago");
  else if (ageDays < 7) push("new_account",        -15, `Account is ${Math.floor(ageDays)} day(s) old`);

  if (criticalCount > 0) push("critical_flags",  -Math.min(50, criticalCount * 25), `${criticalCount} unresolved critical flag(s)`);
  if (highCount     > 0) push("high_flags",      -Math.min(30, highCount     * 15), `${highCount} unresolved high flag(s)`);
  if (mediumCount   > 0) push("medium_flags",    -Math.min(10, mediumCount   *  5), `${mediumCount} unresolved medium flag(s)`);

  if (unresolvedFlags.some(f => f.type === "emulator_usage")) push("emulator",     -20, "Emulator usage detected");
  if (unresolvedFlags.some(f => f.type === "multi_account"))  push("multi_account", -30, "Multi-account behavior detected");

  if (firstPlaces      >= 5)    push("win_pattern",   -25, `${firstPlaces} first-place wins in the last 7 days`);
  if (totalDiamondsWon >= 2000) push("prize_volume",  -10, `${totalDiamondsWon} diamonds won in 7 days`);

  if (user.withdrawalBanned) push("withdrawal_ban",  -15, "Withdrawal ban is active");
  if (user.walletFrozen)     push("wallet_frozen",   -15, "Wallet is frozen");
  if (user.tournamentBanned) push("tournament_ban",  -10, "Tournament ban is active");
  if (user.topupBanned)      push("topup_ban",       -5,  "Top-up ban is active");
  if (withdrawalsIn24h >= 3) push("rapid_withdrawals", -10, `${withdrawalsIn24h} withdrawal requests in 24 hours`);

  score = Math.max(0, Math.min(100, score));
  const riskLevel = score >= 80 ? "low" : score >= 60 ? "medium" : score >= 40 ? "high" : "critical";

  res.json({
    user,
    trustScore: {
      score,
      riskLevel,
      fraudConfidence: 100 - score,
      factors,
    },
    flags:                allFlags,
    deviceSessions,
    recentParticipations,
    recentWithdrawals,
    relatedAccounts:    (relatedAccounts     as any).rows ?? [],
    moderationHistory:  (moderationHistory   as any).rows ?? [],
    summary: {
      ageDays:             Math.floor(ageDays),
      unresolvedFlagCount: unresolvedFlags.length,
      firstPlaces,
      totalDiamondsWon,
      withdrawalsIn24h,
    },
  });
});

// ── POST /admin/fraud/users/:id/review — Moderator actions ───────────────────
router.post("/admin/fraud/users/:id/review", requireAdmin, async (req, res) => {
  const userId = parseInt(String(req.params.id));
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { action, note, flagId } = req.body as {
    action: string;
    note?: string;
    flagId?: number;
  };

  const VALID_ACTIONS = ["hold_rewards", "release_rewards", "clear_all_flags", "clear_flag", "add_note", "escalate"] as const;
  if (!VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
    res.status(400).json({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` });
    return;
  }

  // Financial actions require full admin role
  if ((action === "hold_rewards" || action === "release_rewards") &&
      req.user?.userId !== -1 && req.user?.adminRole !== "admin") {
    res.status(403).json({ error: "Reward hold/release requires Admin role.", code: "INSUFFICIENT_ROLE" });
    return;
  }

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const adminId = req.user!.userId === -1 ? null : req.user!.userId;

  switch (action) {
    case "hold_rewards":
      await db.update(usersTable)
        .set({ withdrawalBanned: true, withdrawalBannedAt: new Date() })
        .where(eq(usersTable.id, userId));
      await db.insert(adminLogsTable).values({
        action: "fraud_reward_hold", category: "security",
        details: note ? `Fraud review — reward hold applied. Note: ${note}` : "Fraud review — reward hold applied",
        targetId: String(userId), targetType: "user",
      });
      res.json({ ok: true, message: "Reward hold applied — user cannot withdraw" });
      return;

    case "release_rewards":
      await db.update(usersTable)
        .set({ withdrawalBanned: false, withdrawalBannedAt: null })
        .where(eq(usersTable.id, userId));
      await db.insert(adminLogsTable).values({
        action: "fraud_reward_released", category: "security",
        details: note ? `Fraud review cleared — hold removed. Note: ${note}` : "Fraud review — reward hold removed",
        targetId: String(userId), targetType: "user",
      });
      res.json({ ok: true, message: "Reward hold removed — user can withdraw again" });
      return;

    case "clear_all_flags":
      await db.update(securityFlagsTable)
        .set({
          resolved: true, resolvedAt: new Date(),
          resolvedByAdminId: adminId,
          notes: note ?? "Cleared via Fraud Monitor review",
        })
        .where(and(eq(securityFlagsTable.userId, userId), eq(securityFlagsTable.resolved, false)));
      await db.insert(adminLogsTable).values({
        action: "fraud_flags_cleared", category: "security",
        details: note ? `All security flags cleared. Note: ${note}` : "All security flags cleared via Fraud Monitor",
        targetId: String(userId), targetType: "user",
      });
      res.json({ ok: true, message: "All active security flags cleared" });
      return;

    case "clear_flag": {
      if (!flagId) { res.status(400).json({ error: "flagId required for clear_flag" }); return; }
      await db.update(securityFlagsTable)
        .set({ resolved: true, resolvedAt: new Date(), resolvedByAdminId: adminId, notes: note ?? "Cleared via Fraud Monitor" })
        .where(and(eq(securityFlagsTable.id, flagId), eq(securityFlagsTable.userId, userId)));
      await db.insert(adminLogsTable).values({
        action: "fraud_flag_cleared", category: "security",
        details: `Flag #${flagId} cleared.${note ? ` Note: ${note}` : ""}`,
        targetId: String(userId), targetType: "user",
      });
      res.json({ ok: true, message: `Flag #${flagId} cleared` });
      return;
    }

    case "add_note":
      if (!note?.trim()) { res.status(400).json({ error: "note is required" }); return; }
      await db.insert(adminLogsTable).values({
        action: "fraud_review_note", category: "security",
        details: `Fraud review note: ${note}`,
        targetId: String(userId), targetType: "user",
      });
      res.json({ ok: true, message: "Note saved to review history" });
      return;

    case "escalate":
      await db.insert(adminLogsTable).values({
        action: "fraud_escalated", category: "security",
        details: note ? `Case escalated for senior review. Note: ${note}` : "Case escalated for senior review",
        targetId: String(userId), targetType: "user",
      });
      res.json({ ok: true, message: "Case escalated for senior admin review" });
      return;
  }
});

export default router;
