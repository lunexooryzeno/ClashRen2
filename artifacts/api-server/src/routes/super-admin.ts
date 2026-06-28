import { Router, type IRouter } from "express";
import { getSupportSettings } from "../lib/supportSettings.js";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import {
  adminLogsTable,
  usersTable,
  notificationsTable,
  squadsTable,
  squadMembersTable,
  walletTransactionsTable,
  tournamentsTable,
  tournamentParticipantsTable,
  topupRequestsTable,
  balanceChangeLogsTable,
  bannersTable,
  diamondStockEntriesTable,
} from "@workspace/db";
import { eq, desc, sql, gte, lt, and, asc, isNull, like, count, sum, gt } from "drizzle-orm";
import { requireSuperAdmin } from "../middlewares/auth.js";
import { getSuperSecret } from "../middlewares/auth.js";
import { sendPushToUser, sendPushToAll } from "../lib/push.js";
import { getPaymentSettings, getPublicPaymentSettings, savePaymentSettings } from "../lib/paymentSettings.js";
import { getSystemSettings, saveSystemSettings } from "../lib/systemSettings.js";

const router: IRouter = Router();

const SECURITY_CODE = process.env.ADMIN_SAFE_WORD ?? process.env.ADMIN_SECURITY_CODE ?? "blue apple";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "clutchx";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "gxB>{\\B2=J52:~{`K]ZOAs(5F~D{!FDBrI4ZG8#";

// ── POST /super-admin/auth ─────────────────────────────────────────────────
router.post("/super-admin/auth", async (req, res) => {
  const { username, password, code } = req.body as {
    username?: string; password?: string; code?: string;
  };

  await new Promise(r => setTimeout(r, 600));

  const usernameOk = username?.trim() === ADMIN_USERNAME;
  const passwordOk = password?.trim() === ADMIN_PASSWORD;
  const codeOk = code?.trim().toLowerCase() === SECURITY_CODE;

  if (!usernameOk || !passwordOk || !codeOk) {
    res.status(401).json({ error: "Invalid credentials or security code." });
    return;
  }

  const token = jwt.sign(
    { type: "super_admin", version: 1 },
    getSuperSecret(),
    { expiresIn: "15d" },
  );

  await db.insert(adminLogsTable).values({
    action: "super_admin_login",
    category: "auth",
    details: `Super admin login by "${username}"`,
  });

  res.json({ token, expiresIn: 15 * 24 * 60 * 60 });
});

// ── POST /super-admin/verify-code ─────────────────────────────────────────
router.post("/super-admin/verify-code", requireSuperAdmin, async (req, res) => {
  const { code } = req.body as { code?: string };
  await new Promise(r => setTimeout(r, 400));
  if (code?.trim().toLowerCase() !== SECURITY_CODE) {
    res.status(401).json({ error: "Invalid security passphrase." });
    return;
  }
  res.json({ ok: true });
});

// ── GET /super-admin/logs ──────────────────────────────────────────────────
router.get("/super-admin/logs", requireSuperAdmin, async (req, res) => {
  const limitParam = parseInt(String(req.query.limit ?? "500"), 10);
  const limit = isNaN(limitParam) ? 500 : Math.min(500, Math.max(1, limitParam));
  const logs = await db.query.adminLogsTable.findMany({
    orderBy: [desc(adminLogsTable.createdAt)],
    limit,
  });
  res.json(logs.map(l => ({
    id: l.id,
    action: l.action,
    category: l.category,
    details: l.details,
    targetId: l.targetId,
    targetType: l.targetType,
    createdAt: l.createdAt.toISOString(),
  })));
});

// ── POST /super-admin/logs ─────────────────────────────────────────────────
router.post("/super-admin/logs", requireSuperAdmin, async (req, res) => {
  const { action, category, details, targetId, targetType } = req.body as {
    action: string; category: string; details?: string;
    targetId?: string; targetType?: string;
  };
  if (!action || !category) {
    res.status(400).json({ error: "action and category required" });
    return;
  }
  const [log] = await db.insert(adminLogsTable).values({
    action, category, details, targetId, targetType,
  }).returning();
  res.status(201).json(log);
});

// ── POST /super-admin/broadcast ────────────────────────────────────────────
router.post("/super-admin/broadcast", requireSuperAdmin, async (req, res) => {
  const { type = "system", title, body, targetUserId } = req.body as {
    type?: string; title: string; body: string; targetUserId?: number;
  };
  if (!title || !body) { res.status(400).json({ error: "title and body required" }); return; }

  let count = 0;
  if (targetUserId) {
    await db.insert(notificationsTable).values({ userId: targetUserId, type, title, body });
    sendPushToUser(targetUserId, { type, title, body, url: "/#/notifications" }).catch(() => {});
    count = 1;
  } else {
    const allUsers = await db.query.usersTable.findMany({ columns: { id: true } });
    if (allUsers.length > 0) {
      await db.insert(notificationsTable).values(
        allUsers.map(u => ({ userId: u.id, type, title, body })),
      );
      sendPushToAll({ type, title, body, url: "/#/notifications" }).catch(() => {});
    }
    count = allUsers.length;
  }

  await db.insert(adminLogsTable).values({
    action: "broadcast_notification",
    category: "notification",
    details: `"${title}" sent to ${targetUserId ? `user #${targetUserId}` : `all ${count} users`}`,
  });

  res.json({ message: "Broadcast sent", count });
});

// ── GET /super-admin/squads ────────────────────────────────────────────────
router.get("/super-admin/squads", requireSuperAdmin, async (_req, res) => {
  const squads = await db
    .select({
      id: squadsTable.id,
      name: squadsTable.name,
      uid: squadsTable.uid,
      leaderId: squadsTable.leaderId,
      avatar: squadsTable.avatar,
      createdAt: squadsTable.createdAt,
      leaderName: usersTable.inGameName,
      leaderPhone: usersTable.phone,
    })
    .from(squadsTable)
    .leftJoin(usersTable, eq(squadsTable.leaderId, usersTable.id))
    .orderBy(desc(squadsTable.createdAt));

  // Get member counts
  const memberCounts = await db
    .select({
      squadId: squadMembersTable.squadId,
      count: sql<number>`count(*)::int`,
    })
    .from(squadMembersTable)
    .where(eq(squadMembersTable.status, "active"))
    .groupBy(squadMembersTable.squadId);

  const countMap = Object.fromEntries(memberCounts.map(r => [r.squadId, r.count]));

  res.json(squads.map(s => ({
    id: s.id,
    name: s.name,
    uid: s.uid,
    leaderId: s.leaderId,
    leaderName: s.leaderName ?? "Unknown",
    leaderPhone: s.leaderPhone ?? "",
    avatar: s.avatar,
    memberCount: countMap[s.id] ?? 0,
    createdAt: s.createdAt.toISOString(),
  })));
});

// ── DELETE /super-admin/squads/:id ─────────────────────────────────────────
router.delete("/super-admin/squads/:id", requireSuperAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const squad = await db.query.squadsTable.findFirst({ where: eq(squadsTable.id, id) });
  if (!squad) { res.status(404).json({ error: "Squad not found" }); return; }

  await db.delete(squadMembersTable).where(eq(squadMembersTable.squadId, id));
  await db.delete(squadsTable).where(eq(squadsTable.id, id));

  await db.insert(adminLogsTable).values({
    action: "delete_squad",
    category: "squad",
    details: `Deleted squad "${squad.name}" (${squad.uid})`,
    targetId: String(id),
    targetType: "squad",
  });

  res.json({ message: "Squad deleted" });
});

// ── GET /super-admin/squad/:id/members ────────────────────────────────────
router.get("/super-admin/squads/:id/members", requireSuperAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const members = await db
    .select({
      id: squadMembersTable.id,
      userId: squadMembersTable.userId,
      role: squadMembersTable.role,
      status: squadMembersTable.status,
      joinedAt: squadMembersTable.joinedAt,
      inGameName: usersTable.inGameName,
      phone: usersTable.phone,
      uid: usersTable.uid,
    })
    .from(squadMembersTable)
    .leftJoin(usersTable, eq(squadMembersTable.userId, usersTable.id))
    .where(eq(squadMembersTable.squadId, id));

  res.json(members.map(m => ({
    id: m.id,
    userId: m.userId,
    role: m.role,
    status: m.status,
    inGameName: m.inGameName,
    phone: m.phone,
    uid: m.uid,
    joinedAt: m.joinedAt.toISOString(),
  })));
});

// ── GET /super-admin/wallet-transactions ───────────────────────────────────
router.get("/super-admin/wallet-transactions", requireSuperAdmin, async (_req, res) => {
  const txs = await db
    .select({
      id: walletTransactionsTable.id,
      userId: walletTransactionsTable.userId,
      type: walletTransactionsTable.type,
      amount: walletTransactionsTable.amount,
      label: walletTransactionsTable.label,
      tournamentId: walletTransactionsTable.tournamentId,
      createdAt: walletTransactionsTable.createdAt,
      inGameName: usersTable.inGameName,
    })
    .from(walletTransactionsTable)
    .leftJoin(usersTable, eq(walletTransactionsTable.userId, usersTable.id))
    .orderBy(desc(walletTransactionsTable.createdAt))
    .limit(1000);

  res.json(txs.map(t => ({
    id: t.id,
    userId: t.userId,
    type: t.type,
    amount: t.amount,
    label: t.label,
    tournamentId: t.tournamentId,
    createdAt: t.createdAt.toISOString(),
    inGameName: t.inGameName ?? "Unknown",
  })));
});

// ── GET /super-admin/full-stats ────────────────────────────────────────────
router.get("/super-admin/full-stats", requireSuperAdmin, async (_req, res) => {
  const [
    [{ totalUsers }],
    [{ adminUsers }],
    [{ diamondSum }],
    [{ totalTournaments }],
    [{ activeTournaments }],
    [{ upcomingTournaments }],
    [{ completedTournaments }],
    [{ totalParticipants }],
    [{ prizeSum }],
    [{ topupSum }],
    [{ entrySum }],
    [{ totalTransactions }],
    [{ totalSquads }],
    [{ totalLogEntries }],
  ] = await Promise.all([
    db.select({ totalUsers: count() }).from(usersTable),
    db.select({ adminUsers: count() }).from(usersTable).where(eq(usersTable.isAdmin, true)),
    db.select({ diamondSum: sum(usersTable.diamondBalance) }).from(usersTable),
    db.select({ totalTournaments: count() }).from(tournamentsTable),
    db.select({ activeTournaments: count() }).from(tournamentsTable).where(eq(tournamentsTable.status, "ongoing")),
    db.select({ upcomingTournaments: count() }).from(tournamentsTable).where(eq(tournamentsTable.status, "upcoming")),
    db.select({ completedTournaments: count() }).from(tournamentsTable).where(eq(tournamentsTable.status, "completed")),
    db.select({ totalParticipants: count() }).from(tournamentParticipantsTable),
    db.select({ prizeSum: sum(tournamentParticipantsTable.diamondsWon) }).from(tournamentParticipantsTable),
    db.select({ topupSum: sum(walletTransactionsTable.amount) }).from(walletTransactionsTable).where(and(eq(walletTransactionsTable.type, "topup"), gt(walletTransactionsTable.amount, 0))),
    db.select({ entrySum: sum(walletTransactionsTable.amount) }).from(walletTransactionsTable).where(eq(walletTransactionsTable.type, "entry")),
    db.select({ totalTransactions: count() }).from(walletTransactionsTable),
    db.select({ totalSquads: count() }).from(squadsTable),
    db.select({ totalLogEntries: count() }).from(adminLogsTable),
  ]);

  res.json({
    totalUsers,
    adminUsers,
    totalTournaments,
    activeTournaments,
    upcomingTournaments,
    completedTournaments,
    totalParticipants,
    totalDiamondsInCirculation: Number(diamondSum ?? 0),
    totalPrizesDistributed: Number(prizeSum ?? 0),
    totalTopups: Number(topupSum ?? 0),
    totalEntryFees: Math.abs(Number(entrySum ?? 0)),
    totalSquads,
    totalTransactions,
    totalLogEntries,
  });
});

// ── GET /super-admin/freefire/stats ───────────────────────────────────────
router.get("/super-admin/freefire/stats", requireSuperAdmin, async (req, res) => {
  const { uid, gamemode = "br", matchmode = "CAREER" } = req.query as {
    uid?: string; gamemode?: string; matchmode?: string;
  };
  if (!uid || !/^\d{8,14}$/.test(uid)) {
    res.status(400).json({ error: "Invalid UID" }); return;
  }
  const gm = String(gamemode).toLowerCase();
  const mm = String(matchmode).toUpperCase();
  if (!["br", "cs"].includes(gm)) {
    res.status(400).json({ error: "Invalid gamemode. Use br or cs." }); return;
  }
  if (!["CAREER", "RANKED", "NORMAL"].includes(mm)) {
    res.status(400).json({ error: "Invalid matchmode. Use CAREER, RANKED, or NORMAL." }); return;
  }

  const STATS_BASE = "https://freefireinfo-zy9l.onrender.com/api/v1/player-stats";
  const INFO_BASE  = "https://developers.freefirecommunity.com/api/v1/info";
  const apiKey = process.env.FREEFIRE_API_KEY;

  try {
    const [statsRes, playerRes] = await Promise.allSettled([
      fetch(`${STATS_BASE}?uid=${uid}&server=IND&gamemode=${gm}&matchmode=${mm}`, {
        signal: AbortSignal.timeout(12000),
      }),
      apiKey
        ? fetch(`${INFO_BASE}?region=ind&uid=${uid}`, {
            headers: {
              "accept": "*/*",
              "content-type": "application/json",
              "referer": "https://developers.freefirecommunity.com/en/dashboard/playground",
              "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "x-api-key": apiKey,
            },
            signal: AbortSignal.timeout(8000),
          })
        : Promise.reject(new Error("No API key")),
    ]);

    const statsData = statsRes.status === "fulfilled" && statsRes.value.ok
      ? (await statsRes.value.json() as { success: boolean; data: unknown }).data
      : null;

    let player = null;
    if (playerRes.status === "fulfilled" && playerRes.value.ok) {
      const raw   = await playerRes.value.json() as Record<string, unknown>;
      const basic  = (raw.basicInfo        ?? {}) as Record<string, unknown>;
      const social = (raw.socialInfo       ?? {}) as Record<string, unknown>;
      const credit = (raw.creditScoreInfo  ?? {}) as Record<string, unknown>;
      player = {
        nickname:      basic.nickname      ?? null,
        level:         basic.level         ?? null,
        rank:          basic.rank          ?? null,
        rankingPoints: basic.rankingPoints ?? null,
        liked:         basic.liked         ?? null,
        region:        basic.region        ?? null,
        creditScore:   credit.creditScore  ?? null,
        signature:     social.signature    ?? null,
      };
    }

    if (!statsData) {
      res.status(404).json({ error: "No stats found for this player. Ensure the UID is correct." }); return;
    }

    res.json({ uid, gamemode: gm, matchmode: mm, player, stats: statsData });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "TimeoutError") {
      res.status(504).json({ error: "FF API timed out" }); return;
    }
    res.status(502).json({ error: "Failed to reach FF API" });
  }
});

// ── GET /support-settings (public) ────────────────────────────────────────
router.get("/support-settings", (_req, res) => {
  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.json(getSupportSettings());
});

// ── GET /payment-settings (public) ────────────────────────────────────────
router.get("/payment-settings", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
  res.json(getPublicPaymentSettings());
});

// ── GET /super-admin/payment-settings ─────────────────────────────────────
router.get("/super-admin/payment-settings", requireSuperAdmin, (_req, res) => {
  res.json(getPaymentSettings());
});

// ── PUT /super-admin/payment-settings ─────────────────────────────────────
router.put("/super-admin/payment-settings", requireSuperAdmin, async (req, res) => {
  const {
    upiId, upiName, ratePerDiamond, minTopup, minWithdrawal, isEnabled,
    withdrawalEnabled, withdrawalPaused, withdrawalPauseMessage,
    withdrawalWindowEnabled, withdrawalWindowStart, withdrawalWindowEnd, withdrawalProcessingNote,
    xsrfToken, bharatpeSession, bharatpeToken, bharatpeMerchantId,
    gatewayAlert, webhookUrl, webhookSecret,
  } = req.body as {
    upiId?: string; upiName?: string; ratePerDiamond?: number;
    minTopup?: number; minWithdrawal?: number; isEnabled?: boolean;
    withdrawalEnabled?: boolean; withdrawalPaused?: boolean; withdrawalPauseMessage?: string;
    withdrawalWindowEnabled?: boolean; withdrawalWindowStart?: string; withdrawalWindowEnd?: string; withdrawalProcessingNote?: string;
    xsrfToken?: string; bharatpeSession?: string;
    bharatpeToken?: string; bharatpeMerchantId?: string;
    gatewayAlert?: { message: string; at: string } | null;
    webhookUrl?: string; webhookSecret?: string;
  };

  const updated = savePaymentSettings({
    upiId, upiName, ratePerDiamond, minTopup, minWithdrawal, isEnabled,
    withdrawalEnabled, withdrawalPaused, withdrawalPauseMessage,
    withdrawalWindowEnabled, withdrawalWindowStart, withdrawalWindowEnd, withdrawalProcessingNote,
    xsrfToken, bharatpeSession, bharatpeToken, bharatpeMerchantId,
    gatewayAlert, webhookUrl, webhookSecret,
  });

  // If BharatPe credentials were included in the save, forward them to MacroDroid
  if ((xsrfToken !== undefined || bharatpeSession !== undefined) && (updated.xsrfToken || updated.bharatpeSession)) {
    sendBpCredentialsToMacrodroid(updated.xsrfToken, updated.bharatpeSession).catch(err =>
      console.error("[MacroDroid] Auto-send on save failed:", err?.message)
    );
  }

  await db.insert(adminLogsTable).values({
    action: "update_payment_settings",
    category: "general",
    details: `Updated payment settings: UPI ID=${updated.upiId}, Rate=₹${updated.ratePerDiamond}/💎, TopUp=${updated.isEnabled}, Withdrawal=${updated.withdrawalEnabled}`,
  });

  res.json(updated);
});

// ── Shared helper — send BharatPe credentials to MacroDroid ──────────────
async function sendBpCredentialsToMacrodroid(xsrfToken: string, session: string): Promise<void> {
  const url = new URL("https://trigger.macrodroid.com/9fa326ec-2426-42fa-9ad1-5aeaa12c27cd/payment.api.tokens");
  url.searchParams.set("BharatPeCredentials(SessionCookie)", decodeURIComponent(session));
  url.searchParams.set("BharatPeCredentials(XSRF-Token)", decodeURIComponent(xsrfToken));
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
  console.log(`[MacroDroid] Send credentials → HTTP ${res.status}`);
}

// ── POST /super-admin/regenerate-webhook-secret ────────────────────────────
router.post("/super-admin/regenerate-webhook-secret", requireSuperAdmin, (_req, res) => {
  const newSecret = randomBytes(32).toString("hex");
  const updated = savePaymentSettings({ webhookSecret: newSecret });
  res.json({ webhookSecret: updated.webhookSecret });
});

// ── POST /super-admin/send-bp-credentials ─────────────────────────────────
// Manually push stored BharatPe credentials to MacroDroid
router.post("/super-admin/send-bp-credentials", requireSuperAdmin, async (_req, res) => {
  const settings = getPaymentSettings();
  if (!settings.xsrfToken || !settings.bharatpeSession) {
    res.status(400).json({ error: "No BharatPe credentials are stored yet." });
    return;
  }
  try {
    await sendBpCredentialsToMacrodroid(settings.xsrfToken, settings.bharatpeSession);
    res.json({ ok: true, message: "Credentials sent to external API." });
  } catch (err) {
    console.error("[MacroDroid] Manual send failed:", err);
    res.status(502).json({ error: "Failed to reach MacroDroid. Check credentials or try again." });
  }
});

// ── GET /super-admin/topup-stats ──────────────────────────────────────────
router.get("/super-admin/topup-stats", requireSuperAdmin, async (req, res) => {
  const range = String(req.query.range ?? "7d");
  const days = range === "30d" ? 30 : range === "12w" ? 84 : 7;
  const trunc = range === "12w" ? "week" : "day";
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db.execute(sql`
    SELECT
      DATE_TRUNC(${trunc}, created_at AT TIME ZONE 'UTC') AS bucket,
      COUNT(*)::int AS count,
      COALESCE(SUM(rupees), 0)::int AS total_rupees,
      COALESCE(SUM(diamonds), 0)::int AS total_diamonds
    FROM topup_requests
    WHERE created_at >= ${since} AND status = 'verified'
    GROUP BY bucket
    ORDER BY bucket ASC
  `);

  const summary = await db
    .select({
      total: sql<number>`count(*)::int`,
      totalRupees: sql<number>`coalesce(sum(rupees), 0)::int`,
      totalDiamonds: sql<number>`coalesce(sum(diamonds), 0)::int`,
    })
    .from(topupRequestsTable)
    .where(gte(topupRequestsTable.createdAt, since));

  res.json({
    points: (rows.rows as Array<Record<string, unknown>>).map(r => ({
      date: new Date(r.bucket as string).toISOString(),
      count: r.count,
      rupees: r.total_rupees,
      diamonds: r.total_diamonds,
    })),
    summary: summary[0] ?? { total: 0, totalRupees: 0, totalDiamonds: 0 },
  });
});

// ── GET /super-admin/topup-requests ───────────────────────────────────────
router.get("/super-admin/topup-requests", requireSuperAdmin, async (_req, res) => {
  const requests = await db
    .select({
      id: topupRequestsTable.id,
      userId: topupRequestsTable.userId,
      rupees: topupRequestsTable.rupees,
      diamonds: topupRequestsTable.diamonds,
      utr: topupRequestsTable.utr,
      status: topupRequestsTable.status,
      bharatpeData: topupRequestsTable.bharatpeData,
      verifiedAt: topupRequestsTable.verifiedAt,
      rejectedAt: topupRequestsTable.rejectedAt,
      rejectedReason: topupRequestsTable.rejectedReason,
      createdAt: topupRequestsTable.createdAt,
      phone: usersTable.phone,
      inGameName: usersTable.inGameName,
    })
    .from(topupRequestsTable)
    .leftJoin(usersTable, eq(topupRequestsTable.userId, usersTable.id))
    .orderBy(desc(topupRequestsTable.createdAt));

  res.json(requests.map(r => ({
    ...r,
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    rejectedAt: r.rejectedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  })));
});

// ── GET /super-admin/utr-transactions ─────────────────────────────────────
// All approved (verified) topup requests with user info
router.get("/super-admin/utr-transactions", requireSuperAdmin, async (_req, res) => {
  const records = await db
    .select({
      id: topupRequestsTable.id,
      userId: topupRequestsTable.userId,
      rupees: topupRequestsTable.rupees,
      diamonds: topupRequestsTable.diamonds,
      utr: topupRequestsTable.utr,
      verifiedAt: topupRequestsTable.verifiedAt,
      createdAt: topupRequestsTable.createdAt,
      phone: usersTable.phone,
      inGameName: usersTable.inGameName,
    })
    .from(topupRequestsTable)
    .leftJoin(usersTable, eq(topupRequestsTable.userId, usersTable.id))
    .where(eq(topupRequestsTable.status, "verified"))
    .orderBy(desc(topupRequestsTable.verifiedAt));

  res.json(records.map(r => ({
    ...r,
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  })));
});

// ── DELETE /super-admin/utr-transactions/:id ───────────────────────────────
// Deletes the topup record, reverses the diamond credit, removes wallet tx,
// and frees the UTR so it can be reused for a new transaction.
router.delete("/super-admin/utr-transactions/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const topup = await db.query.topupRequestsTable.findFirst({ where: eq(topupRequestsTable.id, id) });
    if (!topup) { res.status(404).json({ error: "Record not found" }); return; }

    // Get current user balance
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, topup.userId),
      columns: { id: true, diamondBalance: true },
    });

    const currentBalance = user?.diamondBalance ?? 0;
    const newBalance = Math.max(0, currentBalance - topup.diamonds);

    // Deduct diamonds from user
    await db.update(usersTable)
      .set({ diamondBalance: newBalance })
      .where(eq(usersTable.id, topup.userId));

    // Remove the wallet transaction for this topup (safe LIKE via drizzle like())
    await db.delete(walletTransactionsTable)
      .where(
        and(
          eq(walletTransactionsTable.userId, topup.userId),
          eq(walletTransactionsTable.type, "topup"),
          like(walletTransactionsTable.label, `%${topup.utr}%`),
        )
      );

    // Log the balance reversal
    await db.insert(balanceChangeLogsTable).values({
      userId: topup.userId,
      adminId: null,
      amount: -(currentBalance - newBalance),
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      reason: `UTR top-up reversed · UTR ${topup.utr} · ₹${topup.rupees}`,
      source: "admin_reversal",
    });

    // Delete the topup record — this also frees the UTR for reuse since the
    // duplicate-UTR check filters on status = 'verified' only.
    await db.delete(topupRequestsTable).where(eq(topupRequestsTable.id, id));

    console.log(`[Admin] Reversed topup #${id} (UTR ${topup.utr}): -${currentBalance - newBalance} diamonds from user ${topup.userId}`);
    res.json({ ok: true, diamondsDeducted: currentBalance - newBalance });
  } catch (err) {
    console.error("[Admin] DELETE utr-transaction failed:", err);
    res.status(500).json({ error: "Failed to delete transaction" });
  }
});

// ── POST /super-admin/topup-requests/:id/verify ────────────────────────────
router.post("/super-admin/topup-requests/:id/verify", requireSuperAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const request = await db.query.topupRequestsTable.findFirst({ where: eq(topupRequestsTable.id, id) });
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }
  if (request.status === "verified") { res.status(409).json({ error: "Already verified" }); return; }

  await db.update(topupRequestsTable).set({ status: "verified", verifiedAt: new Date() }).where(eq(topupRequestsTable.id, id));

  const saTopupUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, request.userId), columns: { id: true, diamondBalance: true } });
  await db.update(usersTable)
    .set({ diamondBalance: sql`diamond_balance + ${request.diamonds}` })
    .where(eq(usersTable.id, request.userId));

  await db.insert(balanceChangeLogsTable).values({
    userId: request.userId, adminId: -1, amount: request.diamonds,
    balanceBefore: saTopupUser?.diamondBalance ?? 0,
    balanceAfter: (saTopupUser?.diamondBalance ?? 0) + request.diamonds,
    reason: `Super admin topup ₹${request.rupees} · UTR ${request.utr}`,
    source: "super_admin_topup",
  });

  await db.insert(walletTransactionsTable).values({
    userId: request.userId,
    type: "topup",
    amount: request.diamonds,
    label: `Top-up ₹${request.rupees} · UTR ${request.utr}`,
  });

  await db.insert(adminLogsTable).values({
    action: "verify_topup",
    category: "general",
    details: `Verified top-up #${id} · ₹${request.rupees} → ${request.diamonds}💎 · UTR ${request.utr}`,
    targetId: String(request.userId),
    targetType: "user",
  });

  const topupTitle = "Top-up Successful!";
  const topupBody = `₹${request.rupees} has been verified and ${request.diamonds} diamonds have been added to your wallet.`;
  await db.insert(notificationsTable).values({
    userId: request.userId,
    type: "wallet",
    title: topupTitle,
    body: topupBody,
  });
  sendPushToUser(request.userId, { type: "wallet", title: topupTitle, body: topupBody, url: "/#/wallet" }).catch(() => {});

  res.json({ message: "Verified and diamonds credited" });
});

// ── POST /super-admin/topup-requests/:id/reject ────────────────────────────
router.post("/super-admin/topup-requests/:id/reject", requireSuperAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { reason } = req.body as { reason?: string };

  const request = await db.query.topupRequestsTable.findFirst({ where: eq(topupRequestsTable.id, id) });
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }
  if (request.status === "verified") { res.status(409).json({ error: "Cannot reject an already verified request" }); return; }

  await db.update(topupRequestsTable).set({
    status: "rejected",
    rejectedAt: new Date(),
    rejectedReason: reason ?? null,
  }).where(eq(topupRequestsTable.id, id));

  await db.insert(adminLogsTable).values({
    action: "reject_topup",
    category: "general",
    details: `Rejected top-up #${id} · ₹${request.rupees} · UTR ${request.utr}${reason ? ` · Reason: ${reason}` : ""}`,
    targetId: String(request.userId),
    targetType: "user",
  });

  const rejectTitle = "Top-up Not Verified";
  const rejectBody = reason
    ? `Your top-up of ₹${request.rupees} could not be verified. Reason: ${reason}. Please contact support if you need help.`
    : `Your top-up of ₹${request.rupees} could not be verified. Please contact support if you need help.`;
  await db.insert(notificationsTable).values({
    userId: request.userId,
    type: "wallet",
    title: rejectTitle,
    body: rejectBody,
  });
  sendPushToUser(request.userId, { type: "wallet", title: rejectTitle, body: rejectBody, url: "/#/wallet" }).catch(() => {});

  res.json({ message: "Rejected" });
});

// ── GET /super-admin/geo-analytics ─────────────────────────────────────────
router.get("/super-admin/geo-analytics", requireSuperAdmin, async (_req, res) => {
  const [sessions, users] = await Promise.all([
    db.query.deviceSessionsTable.findMany({
      columns: { userId: true, country: true, region: true, language: true, isEmulator: true, lastSeenAt: true },
    }),
    db.query.usersTable.findMany({
      columns: { id: true, diamondBalance: true, lastSeenAt: true },
    }),
  ]);

  const now = Date.now();
  const userMap = new Map(users.map(u => [u.id, u]));

  const latestByUser = new Map<number, typeof sessions[0]>();
  for (const s of sessions) {
    const ex = latestByUser.get(s.userId);
    if (!ex || s.lastSeenAt > ex.lastSeenAt) latestByUser.set(s.userId, s);
  }

  type CountryStat = { country: string; userCount: number; emulatorCount: number; activeCount: number; totalDiamonds: number };
  const byCountry = new Map<string, CountryStat>();
  const byLanguage = new Map<string, number>();
  const byRegion = new Map<string, number>();

  for (const [userId, s] of latestByUser) {
    const country = s.country ?? "Unknown";
    const u = userMap.get(userId);
    if (!byCountry.has(country)) byCountry.set(country, { country, userCount: 0, emulatorCount: 0, activeCount: 0, totalDiamonds: 0 });
    const stat = byCountry.get(country)!;
    stat.userCount++;
    if (s.isEmulator) stat.emulatorCount++;
    if (u?.lastSeenAt && (now - u.lastSeenAt.getTime()) < 30 * 86400000) stat.activeCount++;
    if (u) stat.totalDiamonds += u.diamondBalance;
    if (s.language) byLanguage.set(s.language, (byLanguage.get(s.language) ?? 0) + 1);
    if (s.region) byRegion.set(s.region, (byRegion.get(s.region) ?? 0) + 1);
  }

  const countries = [...byCountry.values()]
    .sort((a, b) => b.userCount - a.userCount).slice(0, 20)
    .map(c => ({
      country: c.country, userCount: c.userCount,
      avgDiamonds: c.userCount > 0 ? Math.round(c.totalDiamonds / c.userCount) : 0,
      emulatorPct: c.userCount > 0 ? Math.round((c.emulatorCount / c.userCount) * 100) : 0,
      activePct: c.userCount > 0 ? Math.round((c.activeCount / c.userCount) * 100) : 0,
    }));

  const languages = [...byLanguage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([language, count]) => ({ language, count }));
  const regions = [...byRegion.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([region, count]) => ({ region, count }));

  res.json({ countries, languages, regions });
});

// ── GET /super-admin/analytics ─────────────────────────────────────────────
router.get("/super-admin/analytics", requireSuperAdmin, async (req, res) => {
  const now = Date.now();
  const DAY = 86400000;
  const rawDays = parseInt(String(req.query.days ?? "30"));
  const days = [7, 30, 180].includes(rawDays) ? rawDays : 30;
  const useWeekly = days > 30;
  const windowMs = days * DAY;
  const since = new Date(now - windowMs);

  const [users, participants] = await Promise.all([
    db.query.usersTable.findMany({ columns: { id: true, createdAt: true, lastSeenAt: true } }),
    db.query.tournamentParticipantsTable.findMany({
      columns: { id: true, joinedAt: true },
      where: gte(tournamentParticipantsTable.joinedAt, since),
    }),
  ]);

  function toDay(d: Date) { return d.toISOString().slice(0, 10); }
  function toWeek(d: Date) {
    const c = new Date(d); c.setUTCHours(0, 0, 0, 0);
    c.setUTCDate(c.getUTCDate() - c.getUTCDay());
    return c.toISOString().slice(0, 10);
  }

  const dau = users.filter(u => u.lastSeenAt && (now - u.lastSeenAt.getTime()) < DAY).length;
  const mau = users.filter(u => u.lastSeenAt && (now - u.lastSeenAt.getTime()) < 30 * DAY).length;
  const onlineNow = users.filter(u => u.lastSeenAt && (now - u.lastSeenAt.getTime()) < 3 * 60 * 1000).length;
  const newInPeriod = users.filter(u => u.createdAt.getTime() >= now - windowMs).length;
  const activeInPeriod = users.filter(u => u.lastSeenAt && u.lastSeenAt.getTime() >= now - windowMs).length;

  let chart: { day: string; registrations: number; activeUsers: number; tournamentJoins: number }[];

  if (!useWeekly) {
    const regsMap: Record<string, number> = {};
    const activeMap: Record<string, number> = {};
    const joinsMap: Record<string, number> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = toDay(new Date(now - i * DAY));
      regsMap[d] = 0; activeMap[d] = 0; joinsMap[d] = 0;
    }
    for (const u of users) {
      const regDay = toDay(u.createdAt);
      if (regDay in regsMap) regsMap[regDay]++;
      if (u.lastSeenAt) { const ad = toDay(u.lastSeenAt); if (ad in activeMap) activeMap[ad]++; }
    }
    for (const p of participants) { const jd = toDay(p.joinedAt); if (jd in joinsMap) joinsMap[jd]++; }
    chart = Object.keys(regsMap).sort().map(day => ({
      day: new Date(day).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      registrations: regsMap[day], activeUsers: activeMap[day], tournamentJoins: joinsMap[day],
    }));
  } else {
    const regsMap: Record<string, number> = {};
    const activeMap: Record<string, number> = {};
    const joinsMap: Record<string, number> = {};
    for (let i = 25; i >= 0; i--) {
      const w = toWeek(new Date(now - i * 7 * DAY));
      if (!(w in regsMap)) { regsMap[w] = 0; activeMap[w] = 0; joinsMap[w] = 0; }
    }
    for (const u of users) {
      if (u.createdAt.getTime() < now - windowMs) continue;
      const w = toWeek(u.createdAt); if (w in regsMap) regsMap[w]++;
      if (u.lastSeenAt && u.lastSeenAt.getTime() >= now - windowMs) {
        const wa = toWeek(u.lastSeenAt); if (wa in activeMap) activeMap[wa]++;
      }
    }
    for (const p of participants) { const w = toWeek(p.joinedAt); if (w in joinsMap) joinsMap[w]++; }
    chart = Object.keys(regsMap).sort().map(day => ({
      day: new Date(day).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      registrations: regsMap[day], activeUsers: activeMap[day], tournamentJoins: joinsMap[day],
    }));
  }

  res.json({
    totalUsers: users.length, onlineNow, dau, mau,
    newInPeriod, activeInPeriod,
    newThisWeek: users.filter(u => (now - u.createdAt.getTime()) < 7 * DAY).length,
    newThisMonth: users.filter(u => (now - u.createdAt.getTime()) < 30 * DAY).length,
    chart,
  });
});

// ── GET /super-admin/tournament-analytics ──────────────────────────────────
router.get("/super-admin/tournament-analytics", requireSuperAdmin, async (req, res) => {
  const now = Date.now();
  const DAY = 86400000;
  const rawDays = parseInt(String(req.query.days ?? "30"));
  const days = [7, 30, 180].includes(rawDays) ? rawDays : 30;
  const useWeekly = days > 30;
  const since = new Date(now - days * DAY);

  const [allTournaments, allParticipants] = await Promise.all([
    db.select().from(tournamentsTable),
    db.select().from(tournamentParticipantsTable),
  ]);

  // Filter to period
  const tournaments = allTournaments.filter(t => t.createdAt >= since);
  const tournamentIds = new Set(tournaments.map(t => t.id));
  const participants = allParticipants.filter(p => tournamentIds.has(p.tournamentId));

  const filled = tournaments.filter(t => t.filledSlots >= t.maxSlots);
  const cancelled = tournaments.filter(t => t.status === "upcoming" && t.startTime < new Date());
  const completed = tournaments.filter(t => t.status === "completed");

  const totalCreated = tournaments.length;
  const totalFilled = filled.length;
  const totalCancelled = cancelled.length;
  const fillRate = totalCreated > 0 ? Math.round((totalFilled / totalCreated) * 100) : 0;
  const cancelRate = totalCreated > 0 ? Math.round((totalCancelled / totalCreated) * 100) : 0;
  const avgJoinRate = totalCreated > 0
    ? Math.round(tournaments.reduce((s, t) => s + (t.maxSlots > 0 ? t.filledSlots / t.maxSlots : 0), 0) / totalCreated * 100)
    : 0;

  // Avg fill time: for filled tournaments, time from createdAt to last participant joinedAt
  const fillTimes: number[] = [];
  for (const t of filled) {
    const tp = participants.filter(p => p.tournamentId === t.id);
    if (tp.length > 0) {
      const maxJoin = Math.max(...tp.map(p => p.joinedAt.getTime()));
      const mins = (maxJoin - t.createdAt.getTime()) / 60000;
      if (mins >= 0) fillTimes.push(mins);
    }
  }
  const avgFillTimeMinutes = fillTimes.length > 0
    ? Math.round(fillTimes.reduce((a, b) => a + b, 0) / fillTimes.length)
    : null;

  // Avg match duration: proxy — time from startTime to last joinedAt for completed tournaments
  const matchDurations: number[] = [];
  for (const t of completed) {
    const tp = participants.filter(p => p.tournamentId === t.id);
    if (tp.length > 0) {
      const maxJoin = Math.max(...tp.map(p => p.joinedAt.getTime()));
      const dur = (maxJoin - t.startTime.getTime()) / 60000;
      if (dur > 0) matchDurations.push(dur);
    }
  }
  const avgMatchDurationMinutes = matchDurations.length > 0
    ? Math.round(matchDurations.reduce((a, b) => a + b, 0) / matchDurations.length)
    : null;

  const byStatus = {
    upcoming: tournaments.filter(t => t.status === "upcoming").length,
    ongoing: tournaments.filter(t => t.status === "ongoing").length,
    completed: completed.length,
  };

  // Period chart
  function toDay(d: Date) { return d.toISOString().slice(0, 10); }
  function toWeek(d: Date) {
    const c = new Date(d); c.setUTCHours(0,0,0,0); c.setUTCDate(c.getUTCDate() - c.getUTCDay());
    return c.toISOString().slice(0, 10);
  }
  const createdMap: Record<string, number> = {};
  const filledMap: Record<string, number> = {};
  const cancelledMap: Record<string, number> = {};
  if (!useWeekly) {
    for (let i = days - 1; i >= 0; i--) {
      const d = toDay(new Date(now - i * DAY));
      createdMap[d] = 0; filledMap[d] = 0; cancelledMap[d] = 0;
    }
  } else {
    for (let i = 25; i >= 0; i--) {
      const w = toWeek(new Date(now - i * 7 * DAY));
      if (!(w in createdMap)) { createdMap[w] = 0; filledMap[w] = 0; cancelledMap[w] = 0; }
    }
  }
  const cancelledSet = new Set(cancelled.map(t => t.id));
  const bucketFn = useWeekly ? toWeek : toDay;
  for (const t of tournaments) {
    const b = bucketFn(t.createdAt);
    if (b in createdMap) createdMap[b]++;
    if (t.filledSlots >= t.maxSlots && b in filledMap) filledMap[b]++;
    if (cancelledSet.has(t.id) && b in cancelledMap) cancelledMap[b]++;
  }
  const chart = Object.keys(createdMap).sort().map(day => ({
    day: new Date(day).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    created: createdMap[day],
    filled: filledMap[day],
    cancelled: cancelledMap[day],
  }));

  // Top 10 tournaments by fill pct
  const top = [...tournaments]
    .sort((a, b) => (b.filledSlots / Math.max(b.maxSlots, 1)) - (a.filledSlots / Math.max(a.maxSlots, 1)))
    .slice(0, 10)
    .map(t => ({
      id: t.id,
      title: t.title,
      gameMode: t.gameMode,
      status: t.status,
      filledSlots: t.filledSlots,
      maxSlots: t.maxSlots,
      fillPct: t.maxSlots > 0 ? Math.round((t.filledSlots / t.maxSlots) * 100) : 0,
      entryFee: t.entryFeeDiamonds,
      prizePool: t.prizePoolDiamonds,
      startTime: t.startTime,
      createdAt: t.createdAt,
    }));

  res.json({
    summary: {
      totalCreated, totalFilled, fillRate, avgJoinRate,
      totalCancelled, cancelRate,
      avgFillTimeMinutes, avgMatchDurationMinutes,
    },
    byStatus,
    chart,
    top,
  });
});

// ── GET /super-admin/mode-analytics ────────────────────────────────────────
router.get("/super-admin/mode-analytics", requireSuperAdmin, async (req, res) => {
  const now = Date.now();
  const DAY = 86400000;
  const rawDays = parseInt(String(req.query.days ?? "30"));
  const days = [7, 30, 180].includes(rawDays) ? rawDays : 30;
  const useWeekly = days > 30;
  const since = new Date(now - days * DAY);

  const [tournaments, allParticipants] = await Promise.all([
    db.select().from(tournamentsTable),
    db.select().from(tournamentParticipantsTable),
  ]);

  // Filter participants to the period
  const participants = allParticipants.filter(p => p.joinedAt >= since);

  // Collect all unique modes
  const modeSet = new Set(tournaments.map(t => t.gameMode));
  const modes = Array.from(modeSet);

  const modeStats = modes.map(mode => {
    const modeTourneys = tournaments.filter(t => t.gameMode === mode);
    const modeParts = participants.filter(p => modeTourneys.some(t => t.id === p.tournamentId));

    const totalTournaments = modeTourneys.length;
    const totalParticipants = modeParts.length;
    const uniquePlayerIds = new Set(modeParts.map(p => p.userId));
    const uniquePlayers = uniquePlayerIds.size;

    // Avg fill rate
    const avgFillRate = totalTournaments > 0
      ? Math.round(modeTourneys.reduce((s, t) => s + (t.maxSlots > 0 ? t.filledSlots / t.maxSlots : 0), 0) / modeTourneys.length * 100)
      : 0;

    // Cancel rate: past startTime + still upcoming
    const cancelledCount = modeTourneys.filter(t => t.status === "upcoming" && t.startTime < new Date()).length;
    const cancelRate = totalTournaments > 0 ? Math.round((cancelledCount / totalTournaments) * 100) : 0;

    // Retention: % of unique players who joined 2+ tournaments in this mode
    let retained = 0;
    for (const uid of uniquePlayerIds) {
      const joinCount = modeParts.filter(p => p.userId === uid).length;
      if (joinCount >= 2) retained++;
    }
    const retentionPct = uniquePlayers > 0 ? Math.round((retained / uniquePlayers) * 100) : 0;

    // Avg kills + avg diamonds
    const avgKills = totalParticipants > 0
      ? Math.round((modeParts.reduce((s, p) => s + (p.kills ?? 0), 0) / totalParticipants) * 10) / 10
      : 0;
    const avgDiamondsWon = totalParticipants > 0
      ? Math.round(modeParts.reduce((s, p) => s + (p.diamondsWon ?? 0), 0) / totalParticipants)
      : 0;
    const totalPrizePool = modeTourneys.reduce((s, t) => s + (t.prizePoolDiamonds ?? 0), 0);

    return {
      mode,
      totalTournaments,
      totalParticipants,
      uniquePlayers,
      avgFillRate,
      cancelRate,
      retentionPct,
      avgKills,
      avgDiamondsWon,
      totalPrizePool,
    };
  }).sort((a, b) => b.totalParticipants - a.totalParticipants);

  // Period chart: per bucket, participation count per mode
  function toDay(d: Date) { return d.toISOString().slice(0, 10); }
  function toWeek(d: Date) {
    const c = new Date(d); c.setUTCHours(0,0,0,0); c.setUTCDate(c.getUTCDate() - c.getUTCDay());
    return c.toISOString().slice(0, 10);
  }
  const bucketFn = useWeekly ? toWeek : toDay;
  const bucketKeys: string[] = [];
  if (!useWeekly) {
    for (let i = days - 1; i >= 0; i--) bucketKeys.push(toDay(new Date(now - i * DAY)));
  } else {
    const seen = new Set<string>();
    for (let i = 25; i >= 0; i--) {
      const w = toWeek(new Date(now - i * 7 * DAY));
      if (!seen.has(w)) { seen.add(w); bucketKeys.push(w); }
    }
  }

  const chart = bucketKeys.map(bucket => {
    const entry: Record<string, string | number> = {
      day: new Date(bucket).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    };
    for (const mode of modes) {
      const modeTourneys = tournaments.filter(t => t.gameMode === mode);
      const modeTourneyIds = new Set(modeTourneys.map(t => t.id));
      entry[mode] = participants.filter(p => bucketFn(p.joinedAt) === bucket && modeTourneyIds.has(p.tournamentId)).length;
    }
    return entry;
  });

  res.json({ modes: modeStats, chart, modeList: modes });
});

// ── GET /super-admin/retention-analytics ───────────────────────────────────
router.get("/super-admin/retention-analytics", requireSuperAdmin, async (req, res) => {
  const now = Date.now();
  const DAY = 86400000;
  const rawDays = parseInt(String(req.query.days ?? "30"));
  const chartDays = [7, 30, 180].includes(rawDays) ? rawDays : 30;
  // Cohort weeks: 4 for 7d, 8 for 30d, 26 for 180d
  const cohortWeeks = chartDays === 7 ? 4 : chartDays === 30 ? 8 : 26;

  const users = await db.select({
    id: usersTable.id,
    createdAt: usersTable.createdAt,
    lastSeenAt: usersTable.lastSeenAt,
  }).from(usersTable);

  // ── Overall D1 / D7 / D30 ──────────────────────────────────────────────
  const eligible = (minDays: number) =>
    users.filter(u => (now - u.createdAt.getTime()) >= minDays * DAY);

  const retained = (cohort: typeof users, minDays: number) =>
    cohort.filter(u => u.lastSeenAt && (u.lastSeenAt.getTime() - u.createdAt.getTime()) >= minDays * DAY);

  const d1Cohort = eligible(1);
  const d7Cohort = eligible(7);
  const d30Cohort = eligible(30);

  const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : null;

  const overall = {
    d1: { cohortSize: d1Cohort.length, retained: retained(d1Cohort, 1).length, pct: pct(retained(d1Cohort, 1).length, d1Cohort.length) },
    d7: { cohortSize: d7Cohort.length, retained: retained(d7Cohort, 7).length, pct: pct(retained(d7Cohort, 7).length, d7Cohort.length) },
    d30: { cohortSize: d30Cohort.length, retained: retained(d30Cohort, 30).length, pct: pct(retained(d30Cohort, 30).length, d30Cohort.length) },
  };

  // ── Weekly cohort breakdown (last 8 weeks) ─────────────────────────────
  function weekStart(ts: number): string {
    const d = new Date(ts);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // Sunday
    return d.toISOString().slice(0, 10);
  }

  const cohortMap: Record<string, typeof users> = {};
  for (let i = cohortWeeks - 1; i >= 0; i--) {
    const ws = weekStart(now - i * 7 * DAY);
    if (!cohortMap[ws]) cohortMap[ws] = [];
  }

  for (const u of users) {
    const ws = weekStart(u.createdAt.getTime());
    if (ws in cohortMap) cohortMap[ws].push(u);
  }

  const cohorts = Object.entries(cohortMap).sort(([a], [b]) => a.localeCompare(b)).map(([week, members]) => {
    const regDate = new Date(week);
    const label = regDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    const registered = members.length;

    const d1Elig = members.filter(u => (now - u.createdAt.getTime()) >= 1 * DAY);
    const d7Elig = members.filter(u => (now - u.createdAt.getTime()) >= 7 * DAY);
    const d30Elig = members.filter(u => (now - u.createdAt.getTime()) >= 30 * DAY);

    const d1Ret = retained(d1Elig, 1).length;
    const d7Ret = retained(d7Elig, 7).length;
    const d30Ret = retained(d30Elig, 30).length;

    return {
      week: label,
      registered,
      d1: { eligible: d1Elig.length, retained: d1Ret, pct: pct(d1Ret, d1Elig.length) },
      d7: { eligible: d7Elig.length, retained: d7Ret, pct: pct(d7Ret, d7Elig.length) },
      d30: { eligible: d30Elig.length, retained: d30Ret, pct: pct(d30Ret, d30Elig.length) },
    };
  });

  // ── Rolling daily D1 chart ─────────────────────────────────────────────
  function toDay(d: Date) { return d.toISOString().slice(0, 10); }
  const chart: { day: string; registered: number; d1Retained: number; d1Pct: number }[] = [];
  for (let i = chartDays - 1; i >= 2; i--) {
    const dayTs = now - i * DAY;
    const dayStr = toDay(new Date(dayTs));
    const dayUsers = users.filter(u => toDay(u.createdAt) === dayStr);
    const dayD1 = dayUsers.filter(u => u.lastSeenAt && (u.lastSeenAt.getTime() - u.createdAt.getTime()) >= DAY);
    chart.push({
      day: new Date(dayStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      registered: dayUsers.length,
      d1Retained: dayD1.length,
      d1Pct: dayUsers.length > 0 ? Math.round((dayD1.length / dayUsers.length) * 100) : 0,
    });
  }

  res.json({ overall, cohorts, chart });
});

// ── GET /super-admin/match-to-return ───────────────────────────────────────
router.get("/super-admin/match-to-return", requireSuperAdmin, async (req, res) => {
  const now = Date.now();
  const DAY = 86400000;
  const HOUR = 3600000;
  const rawDays = parseInt(String(req.query.days ?? "30"));
  const days = [7, 30, 180].includes(rawDays) ? rawDays : 30;
  const since = now - days * DAY;

  const [users, participants, tournaments] = await Promise.all([
    db.select({ id: usersTable.id, lastSeenAt: usersTable.lastSeenAt }).from(usersTable),
    db.select().from(tournamentParticipantsTable),
    db.select({ id: tournamentsTable.id, gameMode: tournamentsTable.gameMode }).from(tournamentsTable),
  ]);

  // Build per-user join history sorted by time
  const userJoins: Record<number, { joinedAt: Date; tournamentId: number }[]> = {};
  for (const p of participants) {
    if (!userJoins[p.userId]) userJoins[p.userId] = [];
    userJoins[p.userId].push({ joinedAt: p.joinedAt, tournamentId: p.tournamentId });
  }
  for (const uid of Object.keys(userJoins)) {
    userJoins[Number(uid)].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  }

  const tourneyMode: Record<number, string> = {};
  for (const t of tournaments) tourneyMode[t.id] = t.gameMode;

  const userMap: Record<number, Date | null> = {};
  for (const u of users) userMap[u.id] = u.lastSeenAt;

  // Cohort: users whose first match was >= 24h ago
  type M2RUser = { userId: number; firstMatch: Date; firstMode: string; returnMs: number | null };
  const cohortUsers: M2RUser[] = [];

  for (const [uid, joins] of Object.entries(userJoins)) {
    const userId = Number(uid);
    const firstMatch = joins[0].joinedAt;
    if (now - firstMatch.getTime() < DAY) continue; // too recent
    if (firstMatch.getTime() < since) continue; // outside period

    const firstMode = tourneyMode[joins[0].tournamentId] ?? "unknown";
    let returnMs: number | null = null;

    // Signal 1: second tournament join within 24h
    if (joins.length >= 2) {
      const secondJoin = joins[1].joinedAt.getTime();
      const gap = secondJoin - firstMatch.getTime();
      if (gap <= DAY) returnMs = gap;
    }

    // Signal 2: lastSeenAt within 24h of first match (if no second join found)
    if (returnMs === null) {
      const lsa = userMap[userId];
      if (lsa) {
        const gap = lsa.getTime() - firstMatch.getTime();
        if (gap > 0 && gap <= DAY) returnMs = gap;
      }
    }

    cohortUsers.push({ userId, firstMatch, firstMode, returnMs });
  }

  const returned = cohortUsers.filter(u => u.returnMs !== null);
  const rate = cohortUsers.length > 0 ? Math.round((returned.length / cohortUsers.length) * 100) : null;

  // ── Return-time distribution (for returned users) ──────────────────────
  const buckets = [
    { label: "< 1h",   min: 0,       max: HOUR },
    { label: "1–6h",   min: HOUR,    max: 6 * HOUR },
    { label: "6–24h",  min: 6 * HOUR, max: DAY },
  ];
  const distribution = buckets.map(b => {
    const count = returned.filter(u => u.returnMs! >= b.min && u.returnMs! < b.max).length;
    return { bucket: b.label, count, pct: returned.length > 0 ? Math.round((count / returned.length) * 100) : 0 };
  });

  // ── By game mode ────────────────────────────────────────────────────────
  const modes = [...new Set(cohortUsers.map(u => u.firstMode))];
  const byMode = modes.map(mode => {
    const mUsers = cohortUsers.filter(u => u.firstMode === mode);
    const mReturned = mUsers.filter(u => u.returnMs !== null);
    return {
      mode,
      cohortSize: mUsers.length,
      returned: mReturned.length,
      rate: mUsers.length > 0 ? Math.round((mReturned.length / mUsers.length) * 100) : null,
      avgReturnMs: mReturned.length > 0 ? Math.round(mReturned.reduce((s, u) => s + u.returnMs!, 0) / mReturned.length) : null,
    };
  }).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));

  // ── Daily chart ─────────────────────────────────────────────────────────
  function toDay(d: Date) { return d.toISOString().slice(0, 10); }
  const chart: { day: string; cohort: number; returned: number; rate: number }[] = [];
  for (let i = days; i >= 2; i--) {
    const dayStr = toDay(new Date(now - i * DAY));
    const dayCohort = cohortUsers.filter(u => toDay(u.firstMatch) === dayStr);
    const dayReturned = dayCohort.filter(u => u.returnMs !== null);
    chart.push({
      day: new Date(dayStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      cohort: dayCohort.length,
      returned: dayReturned.length,
      rate: dayCohort.length > 0 ? Math.round((dayReturned.length / dayCohort.length) * 100) : 0,
    });
  }

  // ── Avg return time for returned users ──────────────────────────────────
  const avgReturnMs = returned.length > 0
    ? Math.round(returned.reduce((s, u) => s + u.returnMs!, 0) / returned.length)
    : null;

  res.json({
    overall: { cohortSize: cohortUsers.length, returned: returned.length, rate, avgReturnMs },
    distribution,
    byMode,
    chart,
  });
});

// ── GET /banners (public — active banners for home page) ──────────────────
router.get("/banners", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(bannersTable)
      .where(eq(bannersTable.isActive, true))
      .orderBy(asc(bannersTable.displayOrder), asc(bannersTable.createdAt));
    res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=30");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Failed to load banners" });
  }
});

// ── GET /super-admin/banners ───────────────────────────────────────────────
router.get("/super-admin/banners", requireSuperAdmin, async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(bannersTable)
      .orderBy(asc(bannersTable.displayOrder), asc(bannersTable.createdAt));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Failed to load banners" });
  }
});

// ── POST /super-admin/banners ──────────────────────────────────────────────
router.post("/super-admin/banners", requireSuperAdmin, async (req, res) => {
  const { title, tag, subtitle, buttonText, buttonUrl, imageUrl, accentColor, placement, displayOrder, isActive } =
    req.body as Record<string, string | number | boolean | undefined>;
  if (!title || typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "Title is required" });
    return;
  }
  try {
    const [banner] = await db
      .insert(bannersTable)
      .values({
        title: (title as string).trim(),
        tag: tag ? String(tag).trim() || null : null,
        subtitle: subtitle ? String(subtitle).trim() || null : null,
        buttonText: buttonText ? String(buttonText).trim() || null : null,
        buttonUrl: buttonUrl ? String(buttonUrl).trim() || null : null,
        imageUrl: imageUrl ? String(imageUrl).trim() || null : null,
        accentColor: accentColor ? String(accentColor) : "#a855f7",
        placement: placement ? String(placement) : "home",
        displayOrder: displayOrder !== undefined ? Number(displayOrder) : 0,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      })
      .returning();
    res.json(banner);
  } catch (e) {
    res.status(500).json({ error: "Failed to create banner" });
  }
});

// ── PATCH /super-admin/banners/:id ────────────────────────────────────────
router.patch("/super-admin/banners/:id", requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const { title, tag, subtitle, buttonText, buttonUrl, imageUrl, accentColor, placement, displayOrder, isActive } =
    req.body as Record<string, string | number | boolean | undefined>;
  try {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = String(title).trim();
    if (tag !== undefined) updateData.tag = String(tag).trim() || null;
    if (subtitle !== undefined) updateData.subtitle = String(subtitle).trim() || null;
    if (buttonText !== undefined) updateData.buttonText = String(buttonText).trim() || null;
    if (buttonUrl !== undefined) updateData.buttonUrl = String(buttonUrl).trim() || null;
    if (imageUrl !== undefined) updateData.imageUrl = String(imageUrl).trim() || null;
    if (accentColor !== undefined) updateData.accentColor = String(accentColor);
    if (placement !== undefined) updateData.placement = String(placement);
    if (displayOrder !== undefined) updateData.displayOrder = Number(displayOrder);
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);
    const [banner] = await db
      .update(bannersTable)
      .set(updateData)
      .where(eq(bannersTable.id, id))
      .returning();
    if (!banner) { res.status(404).json({ error: "Banner not found" }); return; }
    res.json(banner);
  } catch (e) {
    res.status(500).json({ error: "Failed to update banner" });
  }
});

// ── DELETE /super-admin/banners/:id ───────────────────────────────────────
router.delete("/super-admin/banners/:id", requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(bannersTable).where(eq(bannersTable.id, id));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete banner" });
  }
});

// ── GET /super-admin/diamond-stock ────────────────────────────────────────
// Returns aggregate stats: allocated, distributed, remaining, user total, suspicious flag
router.get("/super-admin/diamond-stock", requireSuperAdmin, async (_req, res) => {
  const [allocRow] = await db
    .select({ total: sql<number>`coalesce(sum(diamonds), 0)` })
    .from(diamondStockEntriesTable);

  const [distRow] = await db
    .select({ total: sql<number>`coalesce(sum(diamonds), 0)` })
    .from(topupRequestsTable)
    .where(eq(topupRequestsTable.status, "verified"));

  const [userRow] = await db
    .select({ total: sql<number>`coalesce(sum(diamond_balance), 0)` })
    .from(usersTable)
    .where(isNull(usersTable.deletedAt));

  const totalAllocated   = Number(allocRow?.total ?? 0);
  const totalDistributed = Number(distRow?.total ?? 0);
  const totalUserBalance = Number(userRow?.total ?? 0);
  const remaining        = totalAllocated - totalDistributed;
  const suspicious       = totalUserBalance > totalAllocated;
  const suspiciousDiff   = totalUserBalance - totalAllocated;

  res.json({ totalAllocated, totalDistributed, remaining, totalUserBalance, suspicious, suspiciousDiff });
});

// ── POST /super-admin/diamond-stock/add ──────────────────────────────────
// Admin records a diamond purchase/allocation
router.post("/super-admin/diamond-stock/add", requireSuperAdmin, async (req, res) => {
  const { diamonds, notes } = req.body as {
    diamonds?: number; notes?: string;
  };
  if (!diamonds || diamonds < 1) {
    res.status(400).json({ error: "diamonds is required and must be positive." });
    return;
  }
  const [entry] = await db.insert(diamondStockEntriesTable).values({
    diamonds,
    notes: notes?.trim() || null,
  }).returning();
  res.json({ ok: true, entry });
});

// ── GET /super-admin/diamond-stock/history ───────────────────────────────
// Returns recent allocation entries
router.get("/super-admin/diamond-stock/history", requireSuperAdmin, async (_req, res) => {
  const entries = await db
    .select()
    .from(diamondStockEntriesTable)
    .orderBy(desc(diamondStockEntriesTable.createdAt))
    .limit(50);
  res.json(entries);
});

// ── GET /super-admin/diamond-stock/utrs ──────────────────────────────────
// Returns all UTRs from verified topup requests with user info
router.get("/super-admin/diamond-stock/utrs", requireSuperAdmin, async (_req, res) => {
  const rows = await db
    .select({
      id: topupRequestsTable.id,
      utr: topupRequestsTable.utr,
      rupees: topupRequestsTable.rupees,
      diamonds: topupRequestsTable.diamonds,
      verifiedAt: topupRequestsTable.verifiedAt,
      createdAt: topupRequestsTable.createdAt,
      userId: usersTable.id,
      phone: usersTable.phone,
      inGameName: usersTable.inGameName,
      uid: usersTable.uid,
    })
    .from(topupRequestsTable)
    .innerJoin(usersTable, eq(topupRequestsTable.userId, usersTable.id))
    .where(eq(topupRequestsTable.status, "verified"))
    .orderBy(desc(topupRequestsTable.verifiedAt));
  res.json(rows);
});

// ── GET /super-admin/diamond-stock/users ─────────────────────────────────
// Returns all non-deleted users sorted by diamond balance descending
router.get("/super-admin/diamond-stock/users", requireSuperAdmin, async (_req, res) => {
  const users = await db
    .select({
      id: usersTable.id,
      phone: usersTable.phone,
      inGameName: usersTable.inGameName,
      uid: usersTable.uid,
      diamondBalance: usersTable.diamondBalance,
    })
    .from(usersTable)
    .where(isNull(usersTable.deletedAt))
    .orderBy(desc(usersTable.diamondBalance));
  res.json(users);
});

// ── DELETE /super-admin/diamond-stock/:id ────────────────────────────────
router.delete("/super-admin/diamond-stock/:id", requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(diamondStockEntriesTable).where(eq(diamondStockEntriesTable.id, id));
  res.json({ ok: true });
});

// ── PATCH /super-admin/users/:id/role — Granular Admin Role Management ────────
// Assigns one of: "support", "moderator", "tournament_admin", "admin" — or null to revoke.
//
// Role capabilities:
//   support          → View users, reply to support tickets. No moderation or wallet access.
//   moderator        → Block/mute users, manage reports, view security flags. No wallet access.
//   tournament_admin → Create/manage tournaments, release credentials. No direct wallet mutation.
//   admin            → Full access including all wallet and prize operations.
//   null             → Removes all admin access.
router.patch("/super-admin/users/:id/role", requireSuperAdmin, async (req, res) => {
  const userId = parseInt(String(req.params.id));
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const { role } = req.body as { role: string | null };
  const validRoles = ["support", "moderator", "tournament_admin", "admin"] as const;

  if (role !== null && role !== undefined && !validRoles.includes(role as typeof validRoles[number])) {
    res.status(400).json({
      error: `Invalid role. Must be one of: ${validRoles.join(", ")} — or null to revoke all admin access.`,
    });
    return;
  }

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const normalizedRole = role ?? null;
  const [updated] = await db
    .update(usersTable)
    .set({
      adminRole: normalizedRole,
      isAdmin: normalizedRole !== null,
    })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id, adminRole: usersTable.adminRole, isAdmin: usersTable.isAdmin });

  await db.insert(adminLogsTable).values({
    action: normalizedRole ? "admin_role_assigned" : "admin_role_revoked",
    category: "auth",
    details: JSON.stringify({
      targetUserId: userId,
      previousRole: user.adminRole ?? null,
      newRole: normalizedRole,
    }),
    targetId: String(userId),
    targetType: "user",
  });

  res.json({
    userId: updated.id,
    adminRole: updated.adminRole,
    isAdmin: updated.isAdmin,
    message: normalizedRole
      ? `User ${userId} assigned role: ${normalizedRole}`
      : `All admin access revoked for user ${userId}`,
  });
});

// ── GET /super-admin/users/roles — List all users with admin roles ─────────────
router.get("/super-admin/users/roles", requireSuperAdmin, async (_req, res) => {
  const adminUsers = await db
    .select({
      id: usersTable.id,
      phone: usersTable.phone,
      inGameName: usersTable.inGameName,
      isAdmin: usersTable.isAdmin,
      adminRole: usersTable.adminRole,
      createdAt: usersTable.createdAt,
      status: usersTable.status,
    })
    .from(usersTable)
    .where(sql`${usersTable.adminRole} IS NOT NULL OR ${usersTable.isAdmin} = true`)
    .orderBy(usersTable.adminRole);

  res.json(adminUsers);
});

// ── GET /super-admin/system-settings ──────────────────────────────────────────
router.get("/super-admin/system-settings", requireSuperAdmin, (_req, res) => {
  const s = getSystemSettings();
  const mask = (v: string) => v ? `••••••••${v.slice(-4)}` : "";
  res.json({
    freefireApiKeySet: !!s.freefireApiKey,
    freefireApiKeyPreview: mask(s.freefireApiKey),
    hlGamingUseruidSet: !!s.hlGamingUseruid,
    hlGamingUseruidPreview: mask(s.hlGamingUseruid),
    hlGamingApiKeySet: !!s.hlGamingApiKey,
    hlGamingApiKeyPreview: mask(s.hlGamingApiKey),
    gameskinboApiKeySet: !!s.gameskinboApiKey,
    gameskinboApiKeyPreview: mask(s.gameskinboApiKey),
  });
});

// ── PUT /super-admin/system-settings ──────────────────────────────────────────
router.put("/super-admin/system-settings", requireSuperAdmin, (req, res) => {
  const { freefireApiKey, hlGamingUseruid, hlGamingApiKey, gameskinboApiKey } =
    req.body as { freefireApiKey?: string; hlGamingUseruid?: string; hlGamingApiKey?: string; gameskinboApiKey?: string };
  const updated = saveSystemSettings({
    ...(freefireApiKey !== undefined && { freefireApiKey: freefireApiKey.trim() }),
    ...(hlGamingUseruid !== undefined && { hlGamingUseruid: hlGamingUseruid.trim() }),
    ...(hlGamingApiKey !== undefined && { hlGamingApiKey: hlGamingApiKey.trim() }),
    ...(gameskinboApiKey !== undefined && { gameskinboApiKey: gameskinboApiKey.trim() }),
  });
  const mask = (v: string) => v ? `••••••••${v.slice(-4)}` : "";
  res.json({
    freefireApiKeySet: !!updated.freefireApiKey,
    freefireApiKeyPreview: mask(updated.freefireApiKey),
    hlGamingUseruidSet: !!updated.hlGamingUseruid,
    hlGamingUseruidPreview: mask(updated.hlGamingUseruid),
    hlGamingApiKeySet: !!updated.hlGamingApiKey,
    hlGamingApiKeyPreview: mask(updated.hlGamingApiKey),
    gameskinboApiKeySet: !!updated.gameskinboApiKey,
    gameskinboApiKeyPreview: mask(updated.gameskinboApiKey),
  });
});

export default router;
