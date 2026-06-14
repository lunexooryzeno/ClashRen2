import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, tournamentParticipantsTable, tournamentsTable, adminLogsTable, deviceSessionsTable, achievementsTable } from "@workspace/db";
import { eq, or, ilike, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import bcrypt from "bcryptjs";
import { checkUIDUniqueness, checkFingerprintMultiAccount, checkIPCluster } from "../middleware/anti-multiaccount.js";
import { checkEmulatorUsage } from "../middleware/suspicious-activity.js";
import { subscribe, unsubscribe } from "../lib/sse-manager.js";

async function logUserAction(userId: number, action: string, category: string, details?: string) {
  await db.insert(adminLogsTable).values({
    action,
    category,
    details: details ?? null,
    targetId: String(userId),
    targetType: "user",
  });
}

const ONLINE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

const router: IRouter = Router();

router.get("/users/me", requireAuth, async (req, res) => {
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({
    id: user.id,
    phone: user.phone,
    inGameName: user.inGameName,
    uid: user.uid,
    profilePicture: user.profilePicture ?? null,
    diamondBalance: user.diamondBalance,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt.toISOString(),
    allowDepositWithdrawal: user.allowDepositWithdrawal,
    minWithdrawal: user.minWithdrawal ?? null,
    minTopup: user.minTopup ?? null,
    nameChangedAt: user.nameChangedAt?.toISOString() ?? null,
    nameChangeAllowed: user.nameChangeAllowed,
    twoFaResetAt: user.twoFaResetAt?.toISOString() ?? null,
    twoFaWithdrawalBypass: user.twoFaWithdrawalBypass,
    platformId: user.platformId ?? null,
  });
});

router.patch("/users/me", requireAuth, async (req, res) => {
  const { uid, inGameName, profilePicture } = req.body as {
    uid?: string;
    inGameName?: string;
    profilePicture?: string | null;
  };

  const trimmedName = inGameName?.trim() || undefined;

  // Guard: reject if there's nothing to update
  if (uid === undefined && trimmedName === undefined && profilePicture === undefined) {
    res.status(400).json({ error: "No fields to update." });
    return;
  }

  // Block if this Free Fire UID is already linked to a different account
  if (uid) {
    const uidCheck = await checkUIDUniqueness(req.user!.userId, uid);
    if (uidCheck.blocked) {
      res.status(409).json({ error: "This Free Fire UID is already linked to another Clash Zen account." });
      return;
    }
  }

  const [updated] = await db.update(usersTable)
    .set({
      uid: uid ?? undefined,
      // Save inGameName when provided (initial setup or profile update)
      inGameName: trimmedName,
      // Record timestamp when a name is set so cooldown logic has a reference point
      nameChangedAt: trimmedName ? new Date() : undefined,
      nameChangeAllowed: trimmedName ? false : undefined,
      profilePicture: profilePicture !== undefined ? profilePicture : undefined,
    })
    .where(eq(usersTable.id, req.user!.userId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const changed: string[] = [];
  if (uid !== undefined) changed.push(`UID: ${uid}`);
  if (trimmedName !== undefined) changed.push(`In-game name: ${trimmedName}`);
  if (profilePicture !== undefined) changed.push("Profile picture updated");
  if (changed.length > 0) {
    await logUserAction(req.user!.userId, "profile_updated", "account", changed.join(" · "));
  }
  res.json({
    id: updated.id,
    phone: updated.phone,
    inGameName: updated.inGameName,
    uid: updated.uid,
    profilePicture: updated.profilePicture ?? null,
    diamondBalance: updated.diamondBalance,
    isAdmin: updated.isAdmin,
    createdAt: updated.createdAt.toISOString(),
    allowDepositWithdrawal: updated.allowDepositWithdrawal,
    nameChangedAt: updated.nameChangedAt?.toISOString() ?? null,
    nameChangeAllowed: updated.nameChangeAllowed,
  });
});

const NAME_CHANGE_COOLDOWN_MS = 12 * 24 * 60 * 60 * 1000; // 12 days

router.post("/users/me/fetch-name", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const { uid: bodyUid } = req.body as { uid?: string };
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const uidToUse = bodyUid?.trim() || user.uid;
  if (!uidToUse) { res.status(400).json({ error: "Enter your Free Fire UID first." }); return; }
  if (!/^\d{8,14}$/.test(uidToUse)) { res.status(400).json({ error: "Invalid Free Fire UID format." }); return; }

  const cooldownRemaining = user.nameChangedAt
    ? NAME_CHANGE_COOLDOWN_MS - (Date.now() - user.nameChangedAt.getTime())
    : 0;

  if (cooldownRemaining > 0 && !user.nameChangeAllowed) {
    const daysLeft = Math.ceil(cooldownRemaining / (24 * 60 * 60 * 1000));
    res.status(429).json({
      error: "Name change cooldown active",
      daysLeft,
      cooldownEndsAt: new Date(user.nameChangedAt!.getTime() + NAME_CHANGE_COOLDOWN_MS).toISOString(),
    });
    return;
  }

  const apiKey = process.env.FREEFIRE_API_KEY;
  const INFO_BASE = "https://developers.freefirecommunity.com/api/v1/info";
  const STATS_BASE = "https://freefireinfo-zy9l.onrender.com/api/v1/player-stats";

  let nickname: string | null = null;

  try {
    if (apiKey) {
      const r = await fetch(`${INFO_BASE}?region=ind&uid=${user.uid}`, {
        headers: {
          "accept": "*/*",
          "content-type": "application/json",
          "referer": "https://developers.freefirecommunity.com/en/dashboard/playground",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "x-api-key": apiKey,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const raw = await r.json() as Record<string, unknown>;
        const basic = (raw.basicInfo ?? {}) as Record<string, unknown>;
        if (basic.nickname && typeof basic.nickname === "string") nickname = basic.nickname;
      }
    }

    if (!nickname) {
      const r = await fetch(`${STATS_BASE}?uid=${user.uid}&server=IND&gamemode=br&matchmode=CAREER`, {
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const raw = await r.json() as { success?: boolean; data?: Record<string, unknown> };
        const d = raw.data ?? {};
        if (d.nickname && typeof d.nickname === "string") nickname = d.nickname;
        else if (d.playerName && typeof d.playerName === "string") nickname = d.playerName;
        else if (d.name && typeof d.name === "string") nickname = d.name;
      }
    }
  } catch { /* API unreachable */ }

  if (!nickname) {
    res.status(404).json({ error: "Could not fetch name. Check your UID or try again later." });
    return;
  }

  const [updated] = await db.update(usersTable)
    .set({ uid: uidToUse, inGameName: nickname, nameChangedAt: new Date(), nameChangeAllowed: false })
    .where(eq(usersTable.id, userId))
    .returning();

  await logUserAction(userId, "name_changed_via_uid", "account", `UID: ${uidToUse} · Name set to: ${nickname}`);

  res.json({
    id: updated.id,
    phone: updated.phone,
    inGameName: updated.inGameName,
    uid: updated.uid,
    profilePicture: updated.profilePicture ?? null,
    diamondBalance: updated.diamondBalance,
    isAdmin: updated.isAdmin,
    createdAt: updated.createdAt.toISOString(),
    allowDepositWithdrawal: updated.allowDepositWithdrawal,
    nameChangedAt: updated.nameChangedAt?.toISOString() ?? null,
    nameChangeAllowed: updated.nameChangeAllowed,
  });
});

router.post("/users/theme", requireAuth, async (req, res) => {
  const { theme } = req.body as { theme?: string };
  if (!theme?.trim()) { res.status(400).json({ error: "Theme required" }); return; }
  await db.update(usersTable)
    .set({ theme: theme.trim() })
    .where(eq(usersTable.id, req.user!.userId));
  await logUserAction(req.user!.userId, "theme_changed", "account", `Theme: ${theme.trim()}`);
  res.status(204).end();
});

const TWO_FA_AUTO_APPROVE_MS = 24 * 60 * 60 * 1000; // 24 hours

async function checkAutoApprove2Fa(userId: number) {
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
  if (!user || !user.twoFaPending || !user.twoFaPendingAt) return user;
  const elapsed = Date.now() - user.twoFaPendingAt.getTime();
  if (elapsed >= TWO_FA_AUTO_APPROVE_MS) {
    const [updated] = await db.update(usersTable)
      .set({ twoFaEnabled: true, twoFaPassword: user.twoFaPendingPassword, twoFaPending: false, twoFaPendingPassword: null, twoFaPendingAt: null })
      .where(eq(usersTable.id, userId))
      .returning();
    return updated;
  }
  return user;
}

const TWO_FA_WITHDRAWAL_BLOCK_MS = 24 * 60 * 60 * 1000; // 24 hours

function getWithdrawalBlockInfo(user: { twoFaResetAt: Date | null; twoFaWithdrawalBypass: boolean }) {
  if (!user.twoFaResetAt || user.twoFaWithdrawalBypass) return { blocked: false };
  const elapsed = Date.now() - user.twoFaResetAt.getTime();
  if (elapsed >= TWO_FA_WITHDRAWAL_BLOCK_MS) return { blocked: false };
  return {
    blocked: true,
    expiresAt: new Date(user.twoFaResetAt.getTime() + TWO_FA_WITHDRAWAL_BLOCK_MS).toISOString(),
  };
}

router.get("/users/me/2fa", requireAuth, async (req, res) => {
  const user = await checkAutoApprove2Fa(req.user!.userId);
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  const autoApproveAt = user.twoFaPendingAt
    ? new Date(user.twoFaPendingAt.getTime() + TWO_FA_AUTO_APPROVE_MS).toISOString()
    : null;
  const blockInfo = getWithdrawalBlockInfo(user);
  res.json({
    enabled: user.twoFaEnabled,
    pending: user.twoFaPending,
    pendingAt: user.twoFaPendingAt?.toISOString() ?? null,
    autoApproveAt,
    withdrawalBlocked: blockInfo.blocked,
    withdrawalBlockExpiresAt: blockInfo.blocked ? blockInfo.expiresAt : null,
  });
});

router.post("/users/2fa/enable", requireAuth, async (req, res) => {
  const { passcode } = req.body as { passcode?: string };
  if (!passcode?.trim()) { res.status(400).json({ error: "Passcode required" }); return; }
  if (!/^\d{6}$/.test(passcode.trim())) { res.status(400).json({ error: "Passcode must be exactly 6 digits" }); return; }
  const hashed = await bcrypt.hash(passcode.trim(), 10);
  const now = new Date();
  await db.update(usersTable)
    .set({ twoFaPending: true, twoFaPendingPassword: hashed, twoFaPendingAt: now, twoFaEnabled: false, twoFaPassword: null, twoFaResetAt: now, twoFaWithdrawalBypass: false })
    .where(eq(usersTable.id, req.user!.userId));
  await logUserAction(req.user!.userId, "2fa_passcode_set", "security");
  res.status(204).end();
});

router.post("/users/2fa/reset", requireAuth, async (req, res) => {
  const { passcode } = req.body as { passcode?: string };
  if (!passcode?.trim()) { res.status(400).json({ error: "Passcode required" }); return; }
  if (!/^\d{6}$/.test(passcode.trim())) { res.status(400).json({ error: "Passcode must be exactly 6 digits" }); return; }
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (!user.twoFaEnabled) { res.status(400).json({ error: "2FA is not enabled" }); return; }
  const hashed = await bcrypt.hash(passcode.trim(), 10);
  const now = new Date();
  await db.update(usersTable)
    .set({ twoFaPending: true, twoFaPendingPassword: hashed, twoFaPendingAt: now, twoFaEnabled: false, twoFaPassword: null, twoFaResetAt: now, twoFaWithdrawalBypass: false })
    .where(eq(usersTable.id, req.user!.userId));
  await logUserAction(req.user!.userId, "2fa_passcode_reset", "security", "Passcode changed — 24h withdrawal block applied");
  res.status(204).end();
});

router.post("/users/2fa/disable", requireAuth, async (req, res) => {
  await db.update(usersTable)
    .set({ twoFaEnabled: false, twoFaPassword: null, twoFaPending: false, twoFaPendingPassword: null, twoFaPendingAt: null })
    .where(eq(usersTable.id, req.user!.userId));
  await logUserAction(req.user!.userId, "2fa_disabled", "security");
  res.status(204).end();
});

router.post("/users/heartbeat", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  await db.update(usersTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(usersTable.id, userId));

  const {
    deviceId, fingerprint, isEmulator, emulatorSignals, userAgent,
    androidVersion, deviceType, appVersion, networkType, language,
  } = req.body as {
    deviceId?: string; fingerprint?: string; isEmulator?: boolean;
    emulatorSignals?: string; userAgent?: string;
    androidVersion?: string | null; deviceType?: string | null;
    appVersion?: string | null; networkType?: string | null;
    language?: string | null;
  };

  const ip = (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null
  );

  let sessionId: number | null = null;
  let needsGeoLookup = false;

  if (deviceId && fingerprint) {
    const existing = await db.query.deviceSessionsTable.findFirst({
      where: and(
        eq(deviceSessionsTable.userId, userId),
        eq(deviceSessionsTable.deviceId, deviceId),
      ),
    });

    if (existing) {
      await db.update(deviceSessionsTable)
        .set({
          lastSeenAt: new Date(), ip,
          userAgent: userAgent ?? existing.userAgent,
          isEmulator: isEmulator ?? false,
          emulatorSignals: emulatorSignals ?? null,
          androidVersion: androidVersion ?? existing.androidVersion,
          deviceType: deviceType ?? existing.deviceType,
          appVersion: appVersion ?? existing.appVersion,
          networkType: networkType ?? existing.networkType,
          language: language ?? existing.language,
        })
        .where(eq(deviceSessionsTable.id, existing.id));
      sessionId = existing.id;
      needsGeoLookup = !existing.country || (!!ip && ip !== existing.ip);
    } else {
      const inserted = await db.insert(deviceSessionsTable).values({
        userId, ip,
        userAgent: userAgent ?? null,
        fingerprint, deviceId,
        isEmulator: isEmulator ?? false,
        emulatorSignals: emulatorSignals ?? null,
        androidVersion: androidVersion ?? null,
        deviceType: deviceType ?? null,
        appVersion: appVersion ?? null,
        networkType: networkType ?? null,
        language: language ?? null,
      }).returning({ id: deviceSessionsTable.id });
      sessionId = inserted[0]?.id ?? null;
      needsGeoLookup = true;
    }
  }

  res.status(204).end();

  if (sessionId && needsGeoLookup && ip && !isPrivateIp(ip)) {
    void lookupAndStoreGeo(ip, sessionId);
  }

  // Async security checks — fire-and-forget, never block the heartbeat response
  if (fingerprint) void checkFingerprintMultiAccount(userId, fingerprint, ip);
  if (ip && !isPrivateIp(ip)) void checkIPCluster(userId, ip);
  if (isEmulator) void checkEmulatorUsage(userId, emulatorSignals ?? null, ip);
});

function isPrivateIp(ip: string): boolean {
  return (
    ip === "::1" || ip === "::ffff:127.0.0.1" ||
    ip.startsWith("127.") || ip.startsWith("10.") ||
    ip.startsWith("192.168.") || ip.startsWith("172.16.")
  );
}

async function lookupAndStoreGeo(ip: string, sessionId: number): Promise<void> {
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,regionName`,
      { signal: AbortSignal.timeout(7000) }
    );
    if (!res.ok) return;
    const geo = await res.json() as { status: string; country?: string; regionName?: string };
    if (geo.status === "success") {
      await db.update(deviceSessionsTable)
        .set({ country: geo.country ?? null, region: geo.regionName ?? null })
        .where(eq(deviceSessionsTable.id, sessionId));
    }
  } catch { /* silent */ }
}

router.get("/users/me/stats", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const participations = await db.query.tournamentParticipantsTable.findMany({
    where: eq(tournamentParticipantsTable.userId, userId),
  });

  const tournamentsPlayed = participations.length;
  const totalKills = participations.reduce((s, p) => s + p.kills, 0);
  const totalWins = participations.filter(p => p.placement === 1).length;
  const diamondsEarned = participations.reduce((s, p) => s + p.diamondsWon, 0);

  const allUsers = await db.query.tournamentParticipantsTable.findMany();
  const userKillMap = new Map<number, number>();
  for (const p of allUsers) {
    userKillMap.set(p.userId, (userKillMap.get(p.userId) || 0) + p.kills);
  }
  const sorted = Array.from(userKillMap.entries()).sort((a, b) => b[1] - a[1]);
  const rankIndex = sorted.findIndex(([uid]) => uid === userId);
  const rank = rankIndex >= 0 ? rankIndex + 1 : null;

  const tournamentIds = participations.map(p => p.tournamentId);
  let diamondsSpent = 0;
  if (tournamentIds.length > 0) {
    const tournaments = await db.query.tournamentsTable.findMany();
    const feeMap = new Map(tournaments.map(t => [t.id, t.entryFeeDiamonds]));
    diamondsSpent = tournamentIds.reduce((s, id) => s + (feeMap.get(id) ?? 0), 0);
  }

  res.json({ tournamentsPlayed, totalKills, totalWins, diamondsEarned, diamondsSpent, rank });
});

// Search users by in-game name or UID (excludes current user)
router.get("/users/search", requireAuth, async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q || q.length < 2) { res.json([]); return; }

  const results = await db
    .select({ id: usersTable.id, inGameName: usersTable.inGameName, uid: usersTable.uid, profilePicture: usersTable.profilePicture })
    .from(usersTable)
    .where(or(
      ilike(usersTable.inGameName, `%${q}%`),
      ilike(usersTable.uid, `%${q}%`),
    ))
    .limit(20);

  res.json(
    results
      .filter(u => u.id !== req.user!.userId)
      .map(u => ({ id: u.id, inGameName: u.inGameName ?? "Player", uid: u.uid ?? "—", profilePicture: u.profilePicture }))
  );
});

router.get("/users/me/achievements", requireAuth, async (req, res) => {
  const rows = await db.select().from(achievementsTable)
    .where(eq(achievementsTable.userId, req.user!.userId))
    .orderBy(achievementsTable.createdAt);
  res.json(rows.map(r => ({
    id: r.id, icon: r.icon, bgColor: r.bgColor,
    title: r.title, subtitle: r.subtitle, description: r.description,
    isUnlocked: r.isUnlocked, createdAt: r.createdAt.toISOString(),
  })));
});

/**
 * GET /api/users/sse — Server-Sent Events stream for real-time session management.
 *
 * Pushes events to the authenticated user's active browser tabs:
 *   - "suspended"          → account was blocked or deleted by an admin
 *   - "force_logout"       → admin explicitly kicked all sessions
 *   - "session_superseded" → a new login on another device bumped sessionVersion
 *   - "connected"          → initial handshake confirmation (client can use this to reset reconnect delay)
 *
 * The client (useSessionSSE hook) auto-reconnects with exponential backoff.
 * Never cached by the service worker (added to noCache list in sw.js).
 */
router.get("/users/sse", requireAuth, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Disable nginx / proxy buffering so events are delivered immediately
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const userId = req.user!.userId;
  subscribe(userId, res);

  // Confirm connection to the client
  res.write(`event: connected\ndata: {"status":"ok"}\n\n`);

  // Keep-alive ping every 25 s (proxies drop idle connections after ~30 s)
  const ping = setInterval(() => {
    try {
      res.write(`:ping\n\n`);
    } catch {
      clearInterval(ping);
    }
  }, 25_000);

  req.on("close", () => {
    clearInterval(ping);
    unsubscribe(userId, res);
  });
});

export default router;
