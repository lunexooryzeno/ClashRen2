import { Router, type IRouter } from "express";
import { createWriteStream, mkdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { UPLOADS_DIR as UPLOADS_BASE } from "../lib/dataDir.js";
import { db } from "@workspace/db";
import {
  slotMatchesTable,
  slotMatchEventsTable,
  slotMatchPlayerStatusTable,
  slotMatchVerificationsTable,
  composedSlotMatchesTable,
  tournamentsTable,
  tournamentParticipantsTable,
  usersTable,
  notificationsTable,
  walletTransactionsTable,
  reportsTable,
} from "@workspace/db";
import { eq, and, or, asc, desc, isNull, isNotNull, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, getTokenPayload, getSuperSecret } from "../middlewares/auth.js";
import { notify } from "../lib/push.js";
import { pushToMatchAdmins, subscribeMatchAdmin, unsubscribeMatchAdmin, pushToUser } from "../lib/sse-manager.js";
import jwt from "jsonwebtoken";

const router: IRouter = Router();

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateDisplayId(): string {
  const min = 100000000000;
  const max = 999999999999;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

async function resolveSlotMatchId(mid: string): Promise<number | null> {
  // DisplayIds are always 12-digit strings (≥100000000000).
  // Internal DB ids are small integers. If the param looks like a displayId
  // (≥10 chars), always resolve via the displayId column.
  if (mid.length >= 10) {
    const match = await db.query.slotMatchesTable.findFirst({
      where: eq(slotMatchesTable.displayId, mid),
      columns: { id: true },
    });
    return match?.id ?? null;
  }
  const numeric = parseInt(mid);
  if (!isNaN(numeric)) return numeric;
  const match = await db.query.slotMatchesTable.findFirst({
    where: eq(slotMatchesTable.displayId, mid),
    columns: { id: true },
  });
  return match?.id ?? null;
}

async function logMatchEvent(slotMatchId: number, actor: string, eventType: string, payload?: object) {
  await db.insert(slotMatchEventsTable).values({
    slotMatchId,
    actor,
    eventType,
    payload: payload ? JSON.stringify(payload) : null,
  });
}

function deriveRoomStatus(match: typeof slotMatchesTable.$inferSelect): string {
  if (match.credentialsHidden) return "hidden";
  if (match.status === "completed") return "completed";
  if (match.status === "cancelled") return "expired";
  // Time-based expiry: match scheduled > 3 hours ago with no result
  if (match.status === "upcoming" && match.scheduledAt) {
    const threeHoursAfter = new Date(match.scheduledAt.getTime() + 3 * 60 * 60 * 1000);
    if (new Date() > threeHoursAfter) return "expired";
  }
  if (match.status === "ongoing") return "live";
  if (match.credentialsReleasedAt) return "open";
  return "waiting";
}

async function formatMatchWithPlayers(m: typeof slotMatchesTable.$inferSelect) {
  const p1 = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, m.player1Id),
    columns: { id: true, inGameName: true, uid: true, profilePicture: true, phone: true },
  });
  const p2 = m.player2Id
    ? await db.query.usersTable.findFirst({
        where: eq(usersTable.id, m.player2Id),
        columns: { id: true, inGameName: true, uid: true, profilePicture: true, phone: true },
      })
    : null;
  return {
    ...m,
    scheduledAt: m.scheduledAt.toISOString(),
    roomUnlockAt: m.roomUnlockAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    credentialsReleasedAt: m.credentialsReleasedAt?.toISOString() ?? null,
    player1: p1 ?? null,
    player2: p2 ?? null,
  };
}

async function enrichMatchForAdmin(m: typeof slotMatchesTable.$inferSelect) {
  const base = await formatMatchWithPlayers(m);

  // Per-player engagement
  const playerStatuses = await db.query.slotMatchPlayerStatusTable.findMany({
    where: eq(slotMatchPlayerStatusTable.slotMatchId, m.id),
  });

  // Last 20 events
  const events = await db.query.slotMatchEventsTable.findMany({
    where: eq(slotMatchEventsTable.slotMatchId, m.id),
    orderBy: [desc(slotMatchEventsTable.createdAt)],
    limit: 20,
  });

  return {
    ...base,
    roomStatus: deriveRoomStatus(m),
    playerStatuses: playerStatuses.map(ps => ({
      ...ps,
      viewedAt: ps.viewedAt?.toISOString() ?? null,
      gameOpenedAt: ps.gameOpenedAt?.toISOString() ?? null,
      confirmedAt: ps.confirmedAt?.toISOString() ?? null,
      notifiedAt: ps.notifiedAt?.toISOString() ?? null,
    })),
    events: events.map(e => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

async function notifyCredentials(match: typeof slotMatchesTable.$inferSelect, slotTitle: string) {
  const players = [
    { id: match.player1Id, seat: "A" },
    ...(match.player2Id ? [{ id: match.player2Id, seat: "B" }] : []),
  ];
  for (const p of players) {
    await notify(p.id, {
      type: "room_credentials",
      title: "Room Credentials Ready 🔑",
      body: `Room ID: ${match.roomId} · Password: ${match.roomPassword} — Tap to view your match.`,
      url: `/#/matches/${match.slotId}`,
    });
    // Upsert player status: notified
    await db.insert(slotMatchPlayerStatusTable).values({
      slotMatchId: match.id,
      userId: p.id,
      notifiedAt: new Date(),
    }).onConflictDoUpdate({
      target: [slotMatchPlayerStatusTable.slotMatchId, slotMatchPlayerStatusTable.userId],
      set: { notifiedAt: new Date() },
    }).catch(() => {});
  }
}

// ── Admin: get a single match by DB id (enriched) ─────────────────────────────
router.get("/admin/slot-matches/:mid", requireAdmin, async (req, res) => {
  const mid = await resolveSlotMatchId(String(req.params.mid));
  if (!mid) { res.status(404).json({ error: "Match not found" }); return; }
  const match = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  res.json(await enrichMatchForAdmin(match));
});

// ── Admin: SSE channel for a slot match ─────────────────────────────────────

function verifyAdminSseToken(token: string): boolean {
  try {
    const payload = jwt.verify(token, getSuperSecret()) as { type?: string };
    return payload?.type === "super_admin";
  } catch { return false; }
}

router.get("/admin/slot-matches/:mid/sse", async (req, res) => {
  const mid = await resolveSlotMatchId(String(req.params.mid));
  if (!mid) { res.status(404).json({ error: "Match not found" }); return; }

  // Accept token via query param (EventSource can't send custom headers)
  const tokenFromQuery = req.query.token as string | undefined;
  const tokenFromHeader = req.headers["x-super-admin-token"] as string | undefined;
  const token = tokenFromQuery ?? tokenFromHeader ?? "";

  if (!token || !verifyAdminSseToken(token)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  subscribeMatchAdmin(mid, res);

  const keepAlive = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { /* ignore */ }
  }, 20_000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribeMatchAdmin(mid, res);
  });
});

// ── Admin: set/update credentials & release mode ──────────────────────────────
router.patch("/admin/slot-matches/:mid/credentials", requireAdmin, async (req, res) => {
  const mid = await resolveSlotMatchId(String(req.params.mid));
  if (!mid) { res.status(404).json({ error: "Match not found" }); return; }

  const body = req.body as {
    roomId?: string | null;
    roomPassword?: string | null;
    releaseMode?: string;
    releaseOffsetMinutes?: number;
    roomDirectLink?: string | null;
    credentialShareMode?: string;
  };

  const VALID_RELEASE_MODES = ["auto", "manual", "instant"] as const;
  if (body.releaseMode !== undefined && !VALID_RELEASE_MODES.includes(body.releaseMode as typeof VALID_RELEASE_MODES[number])) {
    res.status(400).json({ error: `Invalid releaseMode. Must be one of: ${VALID_RELEASE_MODES.join(", ")}` });
    return;
  }
  if (body.releaseOffsetMinutes !== undefined) {
    const offset = Number(body.releaseOffsetMinutes);
    if (!Number.isInteger(offset) || offset < 1 || offset > 60) {
      res.status(400).json({ error: "releaseOffsetMinutes must be an integer between 1 and 60" });
      return;
    }
  }
  const VALID_SHARE_MODES = ["room_only", "ff_only", "both"] as const;
  if (body.credentialShareMode !== undefined && !VALID_SHARE_MODES.includes(body.credentialShareMode as typeof VALID_SHARE_MODES[number])) {
    res.status(400).json({ error: `Invalid credentialShareMode. Must be one of: ${VALID_SHARE_MODES.join(", ")}` });
    return;
  }

  const match = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }

  const effectiveReleaseMode = body.releaseMode ?? match.releaseMode;
  const newRoomId = "roomId" in body ? (body.roomId ?? null) : match.roomId;
  const newRoomPassword = "roomPassword" in body ? (body.roomPassword ?? null) : match.roomPassword;
  const newDirectLink = "roomDirectLink" in body ? (body.roomDirectLink ?? null) : match.roomDirectLink;

  // Instant mode: auto-release when roomId+password OR directLink is present
  const hasCredentials =
    (!!newRoomId?.trim() && !!newRoomPassword?.trim()) ||
    !!newDirectLink?.trim();
  const shouldInstantRelease =
    effectiveReleaseMode === "instant" &&
    hasCredentials &&
    !match.credentialsReleasedAt;

  const [updated] = await db.update(slotMatchesTable).set({
    roomId: "roomId" in body ? (body.roomId ?? null) : undefined,
    roomPassword: "roomPassword" in body ? (body.roomPassword ?? null) : undefined,
    releaseMode: body.releaseMode ?? undefined,
    releaseOffsetMinutes: body.releaseOffsetMinutes ?? undefined,
    roomDirectLink: "roomDirectLink" in body ? (body.roomDirectLink ?? null) : undefined,
    credentialShareMode: body.credentialShareMode ?? undefined,
    ...(shouldInstantRelease ? { credentialsReleasedAt: new Date(), credentialsHidden: false } : {}),
  }).where(eq(slotMatchesTable.id, mid)).returning();

  // Respond immediately — frontend only checks r.ok
  res.json({ ok: true });

  // Push enriched update + notifications in background
  enrichMatchForAdmin(updated).then(enriched => {
    pushToMatchAdmins(mid, "match_update", enriched);
  }).catch(() => {});
  logMatchEvent(mid, "admin", "credentials_set", {
    roomId: body.roomId,
    releaseMode: effectiveReleaseMode,
    releaseOffsetMinutes: body.releaseOffsetMinutes,
  }).catch(() => {});
  if (shouldInstantRelease) {
    db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, match.slotId) })
      .then(slot => notifyCredentials(updated, slot?.title ?? "Match"))
      .catch(() => {});
    logMatchEvent(mid, "system", "credentials_auto_released", { mode: "instant" }).catch(() => {});
  }
});

// ── Admin: release credentials now ───────────────────────────────────────────
router.post("/admin/slot-matches/:mid/release", requireAdmin, async (req, res) => {
  const mid = await resolveSlotMatchId(String(req.params.mid));
  if (!mid) { res.status(404).json({ error: "Match not found" }); return; }

  const match = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if (!match.roomDirectLink && (!match.roomId || !match.roomPassword)) {
    res.status(400).json({ error: "Set room credentials (or a Free Fire link) before releasing" });
    return;
  }

  const [updated] = await db.update(slotMatchesTable).set({
    credentialsReleasedAt: new Date(),
    credentialsHidden: false,
  }).where(eq(slotMatchesTable.id, mid)).returning();

  // Respond immediately — frontend only checks r.ok
  res.json({ ok: true });

  // Push enriched update + notifications in background
  enrichMatchForAdmin(updated).then(enriched => {
    pushToMatchAdmins(mid, "match_update", enriched);
  }).catch(() => {});
  db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, match.slotId) })
    .then(slot => notifyCredentials(updated, slot?.title ?? "Match"))
    .catch(() => {});
  logMatchEvent(mid, "admin", "credentials_released", { manual: true }).catch(() => {});
});

// ── Admin: toggle hide credentials ────────────────────────────────────────────
router.post("/admin/slot-matches/:mid/hide", requireAdmin, async (req, res) => {
  const mid = await resolveSlotMatchId(String(req.params.mid));
  if (!mid) { res.status(404).json({ error: "Match not found" }); return; }

  const match = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }

  // Accept explicit hidden flag; default to toggling for backward compatibility
  const body = req.body as { hidden?: boolean };
  const newHidden = typeof body.hidden === "boolean" ? body.hidden : !match.credentialsHidden;
  const [updated] = await db.update(slotMatchesTable).set({
    credentialsHidden: newHidden,
  }).where(eq(slotMatchesTable.id, mid)).returning();

  await logMatchEvent(mid, "admin", newHidden ? "credentials_hidden" : "credentials_shown");

  const enriched = await enrichMatchForAdmin(updated);
  pushToMatchAdmins(mid, "match_update", enriched);
  res.json(enriched);
});

// ── Admin: replace room (new credentials + re-notify) ─────────────────────────
router.post("/admin/slot-matches/:mid/replace-room", requireAdmin, async (req, res) => {
  const mid = await resolveSlotMatchId(String(req.params.mid));
  if (!mid) { res.status(404).json({ error: "Match not found" }); return; }

  const body = req.body as { roomId: string; roomPassword: string };
  if (!body.roomId?.trim() || !body.roomPassword?.trim()) {
    res.status(400).json({ error: "roomId and roomPassword are required" });
    return;
  }

  const match = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }

  const [updated] = await db.update(slotMatchesTable).set({
    roomId: body.roomId.trim(),
    roomPassword: body.roomPassword.trim(),
    credentialsReleasedAt: new Date(),
    credentialsHidden: false,
  }).where(eq(slotMatchesTable.id, mid)).returning();

  const slot = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, match.slotId) });
  await notifyCredentials(updated, slot?.title ?? "Match");
  await logMatchEvent(mid, "admin", "room_replaced", { roomId: body.roomId });

  const enriched = await enrichMatchForAdmin(updated);
  pushToMatchAdmins(mid, "match_update", enriched);
  res.json(enriched);
});

// ── Admin: resend notification to player(s) ───────────────────────────────────
router.post("/admin/slot-matches/:mid/resend-notification", requireAdmin, async (req, res) => {
  const mid = await resolveSlotMatchId(String(req.params.mid));
  if (!mid) { res.status(404).json({ error: "Match not found" }); return; }

  const body = req.body as { userId?: number; all?: boolean };
  const match = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if (!match.roomId || !match.roomPassword) {
    res.status(400).json({ error: "No credentials set to resend" });
    return;
  }

  const allowedPlayers = [match.player1Id, match.player2Id].filter((id): id is number => id != null);

  const targets: number[] = [];
  if (body.userId) {
    if (!allowedPlayers.includes(body.userId)) {
      res.status(403).json({ error: "User is not a participant of this match" });
      return;
    }
    targets.push(body.userId);
  } else {
    // all unconfirmed players
    const statuses = await db.query.slotMatchPlayerStatusTable.findMany({
      where: eq(slotMatchPlayerStatusTable.slotMatchId, mid),
    });
    const confirmedIds = new Set(statuses.filter(s => s.confirmedAt).map(s => s.userId));
    if (match.player1Id && !confirmedIds.has(match.player1Id)) targets.push(match.player1Id);
    if (match.player2Id && !confirmedIds.has(match.player2Id)) targets.push(match.player2Id);
  }

  for (const uid of targets) {
    await notify(uid, {
      type: "room_credentials",
      title: "Room Credentials (Resent) 🔑",
      body: `Room ID: ${match.roomId} · Password: ${match.roomPassword}`,
      url: `/#/matches/${match.slotId}`,
    });
    await db.insert(slotMatchPlayerStatusTable).values({
      slotMatchId: mid,
      userId: uid,
      notifiedAt: new Date(),
    }).onConflictDoUpdate({
      target: [slotMatchPlayerStatusTable.slotMatchId, slotMatchPlayerStatusTable.userId],
      set: { notifiedAt: new Date() },
    }).catch(() => {});
  }

  await logMatchEvent(mid, "admin", "notification_resent", { targets });
  const freshMatch = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (freshMatch) {
    const enriched = await enrichMatchForAdmin(freshMatch);
    pushToMatchAdmins(mid, "match_update", enriched);
  }
  res.json({ ok: true, sent: targets.length });
});

// ── Admin: force expire a match ────────────────────────────────────────────────
router.post("/admin/slot-matches/:mid/force-expire", requireAdmin, async (req, res) => {
  const mid = await resolveSlotMatchId(String(req.params.mid));
  if (!mid) { res.status(404).json({ error: "Match not found" }); return; }

  const match = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }

  const [updated] = await db.update(slotMatchesTable).set({
    status: "cancelled",
    credentialsHidden: true,
  }).where(eq(slotMatchesTable.id, mid)).returning();

  await logMatchEvent(mid, "admin", "match_force_expired");

  const enriched = await enrichMatchForAdmin(updated);
  pushToMatchAdmins(mid, "match_update", enriched);
  res.json(enriched);
});

// ── User: player engagement tracking ─────────────────────────────────────────
router.patch("/slot-matches/:mid/engagement", requireAuth, async (req, res) => {
  const mid = await resolveSlotMatchId(String(req.params.mid));
  if (!mid) { res.status(404).json({ error: "Match not found" }); return; }

  const payload = getTokenPayload(req);
  const userId = payload?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const body = req.body as { event: "viewed" | "game_opened" | "confirmed" };
  if (!["viewed", "game_opened", "confirmed"].includes(body.event)) {
    res.status(400).json({ error: "Invalid event type" });
    return;
  }

  const match = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if (match.player1Id !== userId && match.player2Id !== userId) {
    res.status(403).json({ error: "Not a participant" });
    return;
  }

  const now = new Date();
  const updateFields: Record<string, Date> = {};
  if (body.event === "viewed") updateFields.viewedAt = now;
  if (body.event === "game_opened") updateFields.gameOpenedAt = now;
  if (body.event === "confirmed") updateFields.confirmedAt = now;

  await db.insert(slotMatchPlayerStatusTable).values({
    slotMatchId: mid,
    userId,
    ...updateFields,
  }).onConflictDoUpdate({
    target: [slotMatchPlayerStatusTable.slotMatchId, slotMatchPlayerStatusTable.userId],
    set: updateFields,
  }).catch(() => {});

  await logMatchEvent(mid, "player", `player_${body.event}`, { userId });

  // Push full match_update (includes refreshed events + statuses) so admin log updates live
  const updatedMatch = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (updatedMatch) {
    const enriched = await enrichMatchForAdmin(updatedMatch);
    pushToMatchAdmins(mid, "match_update", enriched);
  }

  res.json({ ok: true });
});

// ── Admin: generate matchmaking for a slot ─────────────────────────────────────
router.post("/admin/slots/:id/generate-matchmaking", requireAdmin, async (req, res) => {
  const slotId = parseInt(String(req.params.id));
  if (isNaN(slotId)) { res.status(400).json({ error: "Invalid slot ID" }); return; }

  const slot = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, slotId) });
  if (!slot) { res.status(404).json({ error: "Slot not found" }); return; }

  const body = req.body as {
    slotIndex?: number;
    waveSize?: number;
    waveIntervalMinutes?: number;
    roomUnlockMinutes?: number;
    slotRoomId?: string;
    slotRoomPassword?: string;
  };
  const slotIndex = body.slotIndex ?? 0;
  const waveSize = Math.max(1, body.waveSize ?? 3);
  const waveIntervalMinutes = Math.max(1, body.waveIntervalMinutes ?? 10);
  const roomUnlockMinutes = Math.max(1, body.roomUnlockMinutes ?? 2);

  const participants = await db.query.tournamentParticipantsTable.findMany({
    where: and(
      eq(tournamentParticipantsTable.tournamentId, slotId),
      eq(tournamentParticipantsTable.slotIndex, slotIndex),
    ),
  });
  if (participants.length < 2) {
    res.status(400).json({ error: "Need at least 2 registered players to generate matchmaking" });
    return;
  }

  await db.delete(slotMatchesTable).where(
    and(eq(slotMatchesTable.slotId, slotId), eq(slotMatchesTable.slotIndex, slotIndex))
  );

  const shuffled = shuffleArray(participants);
  const slotRoomId = body.slotRoomId || slot.roomId || null;
  const slotRoomPassword = body.slotRoomPassword || slot.roomPassword || null;

  const matchInserts: (typeof slotMatchesTable.$inferInsert)[] = [];
  const participantUpdates: { id: number; waveNumber: number; matchNumber: number; seatNumber: number }[] = [];

  let matchIndex = 0;
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    const matchNum = matchIndex + 1;
    const waveNum = Math.floor(matchIndex / waveSize) + 1;
    const waveOffsetMs = (waveNum - 1) * waveIntervalMinutes * 60 * 1000;
    const scheduledAt = new Date(slot.startTime.getTime() + waveOffsetMs);
    const roomUnlockAt = new Date(scheduledAt.getTime() - roomUnlockMinutes * 60 * 1000);

    matchInserts.push({
      slotId,
      slotIndex,
      displayId: generateDisplayId(),
      waveNumber: waveNum,
      matchNumber: matchNum,
      player1Id: shuffled[i].userId,
      player2Id: shuffled[i + 1].userId,
      player1Seat: "A",
      player2Seat: "B",
      roomId: slotRoomId,
      roomPassword: slotRoomPassword,
      roomUnlockAt,
      scheduledAt,
      status: "upcoming",
    });

    participantUpdates.push({ id: shuffled[i].id, waveNumber: waveNum, matchNumber: matchNum, seatNumber: 1 });
    participantUpdates.push({ id: shuffled[i + 1].id, waveNumber: waveNum, matchNumber: matchNum, seatNumber: 2 });
    matchIndex++;
  }

  const inserted = await db.insert(slotMatchesTable).values(matchInserts).returning();

  for (const upd of participantUpdates) {
    await db.update(tournamentParticipantsTable)
      .set({ waveNumber: upd.waveNumber, matchNumber: upd.matchNumber, seatNumber: upd.seatNumber })
      .where(eq(tournamentParticipantsTable.id, upd.id));
  }

  for (const m of inserted) {
    const matchUrl = `/#/matches/${slot.matchSlug || slot.id}`;
    const timeLabel = m.scheduledAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
    const notifBody = `Wave ${m.waveNumber} · Match ${m.matchNumber} — starts at ${timeLabel}. Check your match details.`;

    if (m.player1Id) {
      notify(m.player1Id, {
        type: "match",
        title: "⚔️ Your Match Has Been Fixed!",
        body: notifBody,
        url: matchUrl,
      }).catch(() => {});
    }
    if (m.player2Id) {
      notify(m.player2Id, {
        type: "match",
        title: "⚔️ Your Match Has Been Fixed!",
        body: notifBody,
        url: matchUrl,
      }).catch(() => {});
    }
  }

  const byePlayer = shuffled.length % 2 === 1 ? shuffled[shuffled.length - 1] : null;

  res.json({
    matches: inserted.length,
    waves: Math.ceil(inserted.length / waveSize),
    byePlayerId: byePlayer?.userId ?? null,
    config: { waveSize, waveIntervalMinutes, roomUnlockMinutes },
  });
});

// ── Admin: save custom (admin-composed) 1v1 match pairings for a slot ───────
router.post("/admin/slots/:id/save-custom-matches", requireAdmin, async (req, res) => {
  const slotId = parseInt(String(req.params.id));
  if (isNaN(slotId)) { res.status(400).json({ error: "Invalid slot ID" }); return; }

  const slot = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, slotId) });
  if (!slot) { res.status(404).json({ error: "Slot not found" }); return; }

  const body = req.body as {
    slotIndex?: number;
    matchType?: string;
    matches: Array<{
      teamA: (number | null)[];
      teamB: (number | null)[];
      scheduledTime: string | null;
    }>;
  };

  const slotIndex = body.slotIndex ?? 0;

  const matchType = (body.matchType ?? "1v1").toLowerCase();
  if (matchType !== "1v1") {
    res.status(400).json({
      error: `Save is only supported for 1v1 matches. The database schema does not yet store full team rosters for ${body.matchType}. Extend the slot_matches table to add this support.`,
    });
    return;
  }

  if (!Array.isArray(body.matches) || body.matches.length === 0) {
    res.status(400).json({ error: "No matches provided" }); return;
  }

  const seen = new Map<number, number>();
  for (const m of body.matches) {
    for (const id of [...m.teamA, ...m.teamB]) {
      if (id != null) seen.set(id, (seen.get(id) ?? 0) + 1);
    }
  }
  const dups = [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  if (dups.length > 0) {
    res.status(400).json({ error: `Duplicate players detected: ${dups.join(", ")}` }); return;
  }

  // Clear only matches for this specific slotId + slotIndex
  await db.delete(slotMatchesTable).where(
    and(eq(slotMatchesTable.slotId, slotId), eq(slotMatchesTable.slotIndex, slotIndex))
  );
  // Clear only participant assignments for players in this slotIndex
  await db.update(tournamentParticipantsTable)
    .set({ waveNumber: null, matchNumber: null, seatNumber: null })
    .where(
      and(
        eq(tournamentParticipantsTable.tournamentId, slotId),
        eq(tournamentParticipantsTable.slotIndex, slotIndex),
      )
    );

  const slotStartTime = slot.startTime;
  const matchInserts: (typeof slotMatchesTable.$inferInsert)[] = [];

  body.matches.forEach((match, idx) => {
    const player1Id = match.teamA[0] ?? null;
    const player2Id = match.teamB[0] ?? null;
    if (player1Id == null) return;

    const scheduledAt = match.scheduledTime
      ? new Date(match.scheduledTime)
      : new Date(slotStartTime.getTime() + idx * 10 * 60 * 1000);

    matchInserts.push({
      slotId,
      slotIndex,
      displayId: generateDisplayId(),
      waveNumber: idx + 1,
      matchNumber: idx + 1,
      player1Id,
      player2Id: player2Id ?? null,
      player1Seat: "A",
      player2Seat: player2Id != null ? "B" : null,
      scheduledAt,
      status: "upcoming",
    });
  });

  if (matchInserts.length === 0) {
    res.status(400).json({ error: "No valid 1v1 match pairs to save" }); return;
  }

  const inserted = await db.insert(slotMatchesTable).values(matchInserts).returning();

  for (let i = 0; i < inserted.length; i++) {
    const ins = inserted[i];
    const matchNum = ins.matchNumber;
    const waveNum = ins.waveNumber;
    await db.update(tournamentParticipantsTable)
      .set({ waveNumber: waveNum, matchNumber: matchNum, seatNumber: 1 })
      .where(
        and(
          eq(tournamentParticipantsTable.tournamentId, slotId),
          eq(tournamentParticipantsTable.slotIndex, slotIndex),
          eq(tournamentParticipantsTable.userId, ins.player1Id),
        )
      );
    if (ins.player2Id != null) {
      await db.update(tournamentParticipantsTable)
        .set({ waveNumber: waveNum, matchNumber: matchNum, seatNumber: 2 })
        .where(
          and(
            eq(tournamentParticipantsTable.tournamentId, slotId),
            eq(tournamentParticipantsTable.slotIndex, slotIndex),
            eq(tournamentParticipantsTable.userId, ins.player2Id),
          )
        );
    }
  }

  // Notify each assigned player that their match has been fixed
  for (const ins of inserted) {
    const matchUrl = `/#/matches/${slot.matchSlug || slot.id}`;
    const timeLabel = ins.scheduledAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
    const notifBody = `Match ${ins.matchNumber} — starts at ${timeLabel}. Check your match details.`;

    if (ins.player1Id) {
      notify(ins.player1Id, {
        type: "match",
        title: "⚔️ Your Match Has Been Fixed!",
        body: notifBody,
        url: matchUrl,
      }).catch(() => {});
    }
    if (ins.player2Id) {
      notify(ins.player2Id, {
        type: "match",
        title: "⚔️ Your Match Has Been Fixed!",
        body: notifBody,
        url: matchUrl,
      }).catch(() => {});
    }
  }

  res.json({ saved: inserted.length, matchIds: inserted.map(m => m.id) });
});

// ── Admin: load composed match draft for a slot ────────────────────────────────
router.get("/admin/slots/:id/composed-matches", requireAdmin, async (req, res) => {
  const slotId = parseInt(String(req.params.id));
  if (isNaN(slotId)) { res.status(400).json({ error: "Invalid slot ID" }); return; }
  const slotIndex = parseInt(String(req.query.slotIndex ?? "0"));
  if (isNaN(slotIndex)) { res.status(400).json({ error: "Invalid slotIndex" }); return; }

  const rows = await db.query.composedSlotMatchesTable.findMany({
    where: and(
      eq(composedSlotMatchesTable.slotId, slotId),
      eq(composedSlotMatchesTable.slotIndex, slotIndex),
    ),
    orderBy: [asc(composedSlotMatchesTable.rowOrder)],
  });

  if (rows.length === 0) {
    res.json({ matchType: null, rows: [] });
    return;
  }

  res.json({
    matchType: rows[0].matchType,
    rows: rows.map(r => ({
      teamA: r.teamAPlayerIds,
      teamB: r.teamBPlayerIds,
      scheduledTime: r.scheduledTime?.toISOString() ?? null,
    })),
  });
});

// ── Admin: save composed match draft for a slot ────────────────────────────────
router.post("/admin/slots/:id/composed-matches", requireAdmin, async (req, res) => {
  const slotId = parseInt(String(req.params.id));
  if (isNaN(slotId)) { res.status(400).json({ error: "Invalid slot ID" }); return; }

  const slot = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, slotId) });
  if (!slot) { res.status(404).json({ error: "Slot not found" }); return; }

  const body = req.body as {
    slotIndex?: number;
    matchType?: string;
    rows: Array<{
      teamA: (number | null)[];
      teamB: (number | null)[];
      scheduledTime: string | null;
    }>;
  };

  const slotIndex = body.slotIndex ?? 0;
  const matchType = (body.matchType ?? "1v1") as string;

  const VALID_TYPES = ["1v1", "2v2", "4v4"];
  if (!VALID_TYPES.includes(matchType)) {
    res.status(400).json({ error: `Invalid matchType. Must be one of: ${VALID_TYPES.join(", ")}` });
    return;
  }

  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    res.status(400).json({ error: "No rows provided" });
    return;
  }

  const seen = new Map<number, number>();
  for (const row of body.rows) {
    for (const id of [...row.teamA, ...row.teamB]) {
      if (id != null) seen.set(id, (seen.get(id) ?? 0) + 1);
    }
  }
  const dups = [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  if (dups.length > 0) {
    res.status(400).json({ error: `Duplicate players detected: ${dups.join(", ")}` });
    return;
  }

  await db.delete(composedSlotMatchesTable).where(
    and(
      eq(composedSlotMatchesTable.slotId, slotId),
      eq(composedSlotMatchesTable.slotIndex, slotIndex),
    )
  );

  const inserts = body.rows.map((row, idx) => ({
    slotId,
    slotIndex,
    matchType,
    rowOrder: idx,
    teamAPlayerIds: row.teamA.filter((id): id is number => id !== null),
    teamBPlayerIds: row.teamB.filter((id): id is number => id !== null),
    scheduledTime: row.scheduledTime ? new Date(row.scheduledTime) : null,
    updatedAt: new Date(),
  }));

  await db.insert(composedSlotMatchesTable).values(inserts);

  res.json({ saved: inserts.length });
});

// ── Admin: clear matchmaking for a slot ───────────────────────────────────────
router.post("/admin/slots/:id/clear-matchmaking", requireAdmin, async (req, res) => {
  const slotId = parseInt(String(req.params.id));
  if (isNaN(slotId)) { res.status(400).json({ error: "Invalid slot ID" }); return; }

  const body = req.body as { slotIndex?: number };
  const slotIndex = body.slotIndex ?? 0;

  await db.delete(slotMatchesTable).where(
    and(eq(slotMatchesTable.slotId, slotId), eq(slotMatchesTable.slotIndex, slotIndex))
  );
  await db.update(tournamentParticipantsTable)
    .set({ waveNumber: null, matchNumber: null, seatNumber: null })
    .where(
      and(
        eq(tournamentParticipantsTable.tournamentId, slotId),
        eq(tournamentParticipantsTable.slotIndex, slotIndex),
      )
    );

  res.json({ ok: true });
});

// ── Admin: get all matches for a slot (optionally filtered by slotIndex) ──
router.get("/admin/slots/:id/matches", requireAdmin, async (req, res) => {
  const slotId = parseInt(String(req.params.id));
  if (isNaN(slotId)) { res.status(400).json({ error: "Invalid slot ID" }); return; }

  const slotIndexParam = req.query.slotIndex;
  const slotIndex = slotIndexParam !== undefined ? parseInt(String(slotIndexParam), 10) : null;

  const whereClause = slotIndex !== null && !isNaN(slotIndex)
    ? and(eq(slotMatchesTable.slotId, slotId), eq(slotMatchesTable.slotIndex, slotIndex))
    : eq(slotMatchesTable.slotId, slotId);

  const matches = await db.query.slotMatchesTable.findMany({
    where: whereClause,
    orderBy: [asc(slotMatchesTable.waveNumber), asc(slotMatchesTable.matchNumber)],
  });

  const formatted = await Promise.all(matches.map(formatMatchWithPlayers));
  res.json(formatted);
});

// ── Admin: update a match ──────────────────────────────────────────────────
router.patch("/admin/slot-matches/:mid", requireAdmin, async (req, res) => {
  const mid = await resolveSlotMatchId(String(req.params.mid));
  if (!mid) { res.status(404).json({ error: "Match not found" }); return; }

  const body = req.body as {
    status?: string;
    winnerId?: number | null;
    roomId?: string | null;
    roomPassword?: string | null;
    notes?: string | null;
    roomUnlockAt?: string | null;
    releaseMode?: string;
    releaseOffsetMinutes?: number;
    credentialsReleasedAt?: string | null;
  };

  const [updated] = await db.update(slotMatchesTable).set({
    status: body.status ?? undefined,
    winnerId: "winnerId" in body ? (body.winnerId ?? null) : undefined,
    roomId: "roomId" in body ? (body.roomId ?? null) : undefined,
    roomPassword: "roomPassword" in body ? (body.roomPassword ?? null) : undefined,
    notes: "notes" in body ? (body.notes ?? null) : undefined,
    roomUnlockAt: body.roomUnlockAt ? new Date(body.roomUnlockAt) : undefined,
    releaseMode: body.releaseMode ?? undefined,
    releaseOffsetMinutes: "releaseOffsetMinutes" in body ? (body.releaseOffsetMinutes ?? undefined) : undefined,
    credentialsReleasedAt: "credentialsReleasedAt" in body
      ? (body.credentialsReleasedAt ? new Date(body.credentialsReleasedAt) : null)
      : undefined,
  }).where(eq(slotMatchesTable.id, mid)).returning();

  if (!updated) { res.status(404).json({ error: "Match not found" }); return; }
  res.json(await formatMatchWithPlayers(updated));
});

// ── Admin: delete a match ─────────────────────────────────────────────────
// ── Admin: confirm or un-confirm a player joined the room ─────────────────
router.patch("/admin/slot-matches/:mid/confirm-player", requireAdmin, async (req, res) => {
  const mid = await resolveSlotMatchId(String(req.params.mid));
  if (!mid) { res.status(404).json({ error: "Match not found" }); return; }

  const body = req.body as { userId: number; confirmed: boolean };
  if (!body.userId) { res.status(400).json({ error: "userId required" }); return; }

  const now = new Date();
  if (body.confirmed) {
    await db.insert(slotMatchPlayerStatusTable).values({
      slotMatchId: mid,
      userId: body.userId,
      confirmedAt: now,
    }).onConflictDoUpdate({
      target: [slotMatchPlayerStatusTable.slotMatchId, slotMatchPlayerStatusTable.userId],
      set: { confirmedAt: now },
    });
    await logMatchEvent(mid, "admin", "admin_confirmed_player", { userId: body.userId });
  } else {
    await db.update(slotMatchPlayerStatusTable)
      .set({ confirmedAt: null })
      .where(and(
        eq(slotMatchPlayerStatusTable.slotMatchId, mid),
        eq(slotMatchPlayerStatusTable.userId, body.userId),
      ));
    await logMatchEvent(mid, "admin", "admin_unconfirmed_player", { userId: body.userId });
  }

  const updatedMatch = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (updatedMatch) {
    const enriched = await enrichMatchForAdmin(updatedMatch);
    pushToMatchAdmins(mid, "match_update", enriched);
  }

  res.json({ ok: true });
});

router.delete("/admin/slot-matches/:mid", requireAdmin, async (req, res) => {
  const mid = await resolveSlotMatchId(String(req.params.mid));
  if (!mid) { res.status(404).json({ error: "Match not found" }); return; }

  const match = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }

  await db.delete(slotMatchesTable).where(eq(slotMatchesTable.id, mid));

  // Respond immediately after the delete
  res.json({ ok: true });

  // Clear participant assignments in background (non-critical cleanup)
  for (const userId of [match.player1Id, match.player2Id]) {
    if (userId == null) continue;
    db.update(tournamentParticipantsTable)
      .set({ waveNumber: null, matchNumber: null, seatNumber: null })
      .where(
        and(
          eq(tournamentParticipantsTable.tournamentId, match.slotId),
          eq(tournamentParticipantsTable.slotIndex, match.slotIndex),
          eq(tournamentParticipantsTable.userId, userId),
        )
      )
      .catch(() => {});
  }
});

// ── User: fire auto-verify for all pending matches ────────────────────────
// Called by the "My Matches" page on load. Scans every slot the user has
// joined and fires autoVerifyMatch() in the background for any match that
// is still in pre_snapshot_stored state. Returns immediately so the UI
// is never blocked.
router.post("/my-matches/auto-verify-pending", requireAuth, async (req, res) => {
  const payload = getTokenPayload(req);
  const userId = payload?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const participants = await db.query.tournamentParticipantsTable.findMany({
    where: and(
      eq(tournamentParticipantsTable.userId, userId),
      isNotNull(tournamentParticipantsTable.matchNumber),
    ),
  });

  const now = new Date();
  let triggered = 0;
  for (const p of participants) {
    if (p.matchNumber == null || p.slotIndex == null || p.waveNumber == null) continue;
    const match = await db.query.slotMatchesTable.findFirst({
      where: and(
        eq(slotMatchesTable.slotId, p.tournamentId),
        eq(slotMatchesTable.slotIndex, p.slotIndex),
        eq(slotMatchesTable.matchNumber, p.matchNumber),
        eq(slotMatchesTable.waveNumber, p.waveNumber),
      ),
      columns: { id: true, verificationStatus: true, scheduledAt: true, gameMode: true, matchMode: true },
    });
    if (
      match &&
      (match.verificationStatus === "pre_snapshot_stored" || match.verificationStatus === "failed") &&
      match.gameMode && match.matchMode &&
      match.scheduledAt <= now
    ) {
      autoVerifyMatch(match.id).catch(() => {});
      triggered++;
    }
  }

  res.json({ triggered });
});

// ── User: get my match for a slot ─────────────────────────────────────────
router.get("/slots/:id/my-match", requireAuth, async (req, res) => {
  const slotId = parseInt(String(req.params.id));
  if (isNaN(slotId)) { res.status(400).json({ error: "Invalid slot ID" }); return; }

  const payload = getTokenPayload(req);
  const userId = payload?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const participant = await db.query.tournamentParticipantsTable.findFirst({
    where: and(
      eq(tournamentParticipantsTable.tournamentId, slotId),
      eq(tournamentParticipantsTable.userId, userId),
    ),
  });
  if (!participant) { res.status(404).json({ error: "Not registered" }); return; }
  if (participant.matchNumber == null) {
    res.json({ matchmaking: false });
    return;
  }

  const match = await db.query.slotMatchesTable.findFirst({
    where: and(
      eq(slotMatchesTable.slotId, slotId),
      eq(slotMatchesTable.slotIndex, participant.slotIndex),
      eq(slotMatchesTable.matchNumber, participant.matchNumber),
      eq(slotMatchesTable.waveNumber, participant.waveNumber!),
    ),
  });
  if (!match) { res.json({ matchmaking: false }); return; }

  const now = new Date();
  // Hidden override always wins — admin hide takes precedence over any timing logic.
  // Credentials are visible only when: not hidden AND explicitly released by admin
  // (legacy roomUnlockAt only applies when the new release system is not in use)
  const adminReleased = !!match.credentialsReleasedAt;
  const legacyUnlock = !adminReleased && (match.roomUnlockAt ? now >= match.roomUnlockAt : false);
  const isUnlocked = !match.credentialsHidden && (adminReleased || legacyUnlock);

  // Track view engagement when credentials are fetched
  if (isUnlocked && userId) {
    db.insert(slotMatchPlayerStatusTable).values({
      slotMatchId: match.id,
      userId,
      viewedAt: now,
    }).onConflictDoUpdate({
      target: [slotMatchPlayerStatusTable.slotMatchId, slotMatchPlayerStatusTable.userId],
      set: { viewedAt: now },
    }).catch(() => {});

    logMatchEvent(match.id, "player", "player_viewed", { userId })
      .then(() => db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, match.id) }))
      .then(m => m ? enrichMatchForAdmin(m) : null)
      .then(enriched => { if (enriched) pushToMatchAdmins(match.id, "match_update", enriched); })
      .catch(() => {});
  }

  // Auto-verify in background: trigger on pre_snapshot_stored OR failed (stale-data retry)
  if (
    (match.verificationStatus === "pre_snapshot_stored" || match.verificationStatus === "failed") &&
    match.gameMode && match.matchMode &&
    match.scheduledAt <= now
  ) {
    autoVerifyMatch(match.id).catch(() => {});
  }

  const opponentId = participant.seatNumber === 1 ? match.player2Id : match.player1Id;
  const opponent = opponentId
    ? await db.query.usersTable.findFirst({
        where: eq(usersTable.id, opponentId),
        columns: { id: true, inGameName: true, uid: true, profilePicture: true },
      })
    : null;

  // For completed matches, enrich with per-player kill counts from verification records
  let myKills: number | null = null;
  let opponentKills: number | null = null;
  let verificationType: "auto" | "manual" | null = null;
  let verificationConfidence: number | null = null;
  let myVerif: any = null;
  let oppVerif: any = null;
  let activityLog: any[] = [];
  if (match.status === "completed") {
    [myVerif, oppVerif] = await Promise.all([
      db.query.slotMatchVerificationsTable.findFirst({
        where: and(
          eq(slotMatchVerificationsTable.slotMatchId, match.id),
          eq(slotMatchVerificationsTable.userId, userId),
        ),
      }),
      opponentId
        ? db.query.slotMatchVerificationsTable.findFirst({
            where: and(
              eq(slotMatchVerificationsTable.slotMatchId, match.id),
              eq(slotMatchVerificationsTable.userId, opponentId),
            ),
          })
        : Promise.resolve(null),
    ]);
    if (myVerif?.statDiff) {
      try { const d = JSON.parse(myVerif.statDiff as string); if (typeof d.kills === "number") myKills = d.kills; } catch {}
    }
    if (oppVerif?.statDiff) {
      try { const d = JSON.parse(oppVerif.statDiff as string); if (typeof d.kills === "number") opponentKills = d.kills; } catch {}
    }
    const hasAutoData = myVerif?.statDiff != null || oppVerif?.statDiff != null;
    if (hasAutoData) {
      verificationType = "auto";
      try {
        const winnerIsMe = match.winnerId === userId;
        const winnerDiffRaw = winnerIsMe ? myVerif?.statDiff : oppVerif?.statDiff;
        const loserDiffRaw  = winnerIsMe ? oppVerif?.statDiff : myVerif?.statDiff;
        if (winnerDiffRaw) {
          const wd = JSON.parse(winnerDiffRaw as string);
          const ld = loserDiffRaw ? JSON.parse(loserDiffRaw as string) : null;
          const wScore = scoreFromDiff(wd);
          const lScore = ld ? scoreFromDiff(ld) : 0;
          if (wScore !== -Infinity && wScore > 0) {
            if (wd.gamesplayed >= 1) {
              const lAbs = Math.max(0, lScore === -Infinity ? 0 : lScore);
              const margin = wScore / (wScore + lAbs + 1);
              verificationConfidence = Math.min(99, Math.max(88, Math.round(88 + margin * 11)));
            } else {
              verificationConfidence = 74;
            }
          }
        }
      } catch {}
    } else if (match.verificationStatus === "reward_distributed" || match.verificationStatus === "winner_decided") {
      verificationType = "manual";
    }
    // Fetch full activity log (excluding noisy player_viewed events)
    const rawEvents = await db.query.slotMatchEventsTable.findMany({
      where: eq(slotMatchEventsTable.slotMatchId, match.id),
      orderBy: [asc(slotMatchEventsTable.createdAt)],
    });
    activityLog = rawEvents
      .filter(e => !["player_viewed", "player_game_opened"].includes(e.eventType))
      .map(e => ({
        id: e.id,
        actor: e.actor,
        eventType: e.eventType,
        payload: e.payload
          ? (() => { try { return JSON.parse(e.payload as string); } catch { return null; } })()
          : null,
        createdAt: e.createdAt.toISOString(),
      }));
  }

  // Build per-player stat analysis for completed matches
  const _parseSafe = (s: string | null | undefined) => {
    if (!s) return null;
    try { return JSON.parse(s); } catch { return null; }
  };
  const buildPlayerStat = (v: any | null) => {
    if (!v) return null;
    const diff = _parseSafe(v.statDiff) ?? {};
    const pre  = _parseSafe(v.preSnapshotData)?.data ?? {};
    const post = _parseSafe(v.postSnapshotData)?.data ?? {};
    const KEYS = ["kills", "gamesplayed", "wins", "damage", "mvpCount", "knockDowns"] as const;
    const stats: Record<string, { before: number | null; after: number | null; delta: number | null }> = {};
    for (const k of KEYS) {
      stats[k] = { before: pre[k] ?? null, after: post[k] ?? null, delta: diff[k] ?? null };
    }
    return {
      ffUid: v.ffUid ?? null,
      isWinner: v.isWinner ?? null,
      preSnapshotAt: v.preSnapshotAt?.toISOString?.() ?? null,
      postSnapshotAt: v.postSnapshotAt?.toISOString?.() ?? null,
      hasData: v.statDiff != null,
      stats,
    };
  };

  res.json({
    matchmaking: true,
    match: {
      id: match.id,
      matchNumber: match.matchNumber,
      waveNumber: match.waveNumber,
      scheduledAt: match.scheduledAt.toISOString(),
      roomUnlockAt: match.roomUnlockAt?.toISOString() ?? null,
      status: match.status,
      winnerId: match.winnerId,
      notes: match.notes,
      seat: participant.seatNumber === 1 ? "A" : "B",
      roomId: isUnlocked ? match.roomId : null,
      roomPassword: isUnlocked ? match.roomPassword : null,
      roomDirectLink: isUnlocked ? match.roomDirectLink : null,
      credentialShareMode: match.credentialShareMode,
      isUnlocked,
      releaseMode: match.releaseMode,
      releaseOffsetMinutes: match.releaseOffsetMinutes ?? 5,
      myKills,
      opponentKills,
      createdAt: match.createdAt.toISOString(),
      credentialsReleasedAt: match.credentialsReleasedAt?.toISOString() ?? null,
      verificationStatus: match.verificationStatus ?? null,
      prizeAmountDiamonds: match.prizeAmountDiamonds ?? 0,
      rewardDistributedAt: match.rewardDistributedAt?.toISOString() ?? null,
      verificationType,
      verificationConfidence,
      statAnalysis: match.status === "completed"
        ? { mine: buildPlayerStat(myVerif), opponent: buildPlayerStat(oppVerif) }
        : null,
      activityLog,
      disputeDeadline: match.status === "completed"
        ? new Date(match.scheduledAt.getTime() + 24 * 60 * 60 * 1000).toISOString()
        : null,
      alreadyDisputed: match.status === "completed"
        ? !!(await db.query.slotMatchEventsTable.findFirst({
            where: and(
              eq(slotMatchEventsTable.slotMatchId, match.id),
              eq(slotMatchEventsTable.eventType, "player_dispute"),
              eq(slotMatchEventsTable.actor, String(userId)),
            ),
          }))
        : false,
    },
    opponent: opponent ?? null,
  });
});

// ── Auto-release scheduler (exported for use in index.ts) ──────────────────
export async function processAutoReleases() {
  try {
    const now = new Date();
    const candidates = await db.query.slotMatchesTable.findMany({
      where: and(
        eq(slotMatchesTable.releaseMode, "auto"),
        isNull(slotMatchesTable.credentialsReleasedAt),
        isNotNull(slotMatchesTable.roomId),
        isNotNull(slotMatchesTable.roomPassword),
      ),
    });

    for (const match of candidates) {
      const offsetMinutes = match.releaseOffsetMinutes ?? 5;
      const releaseAt = new Date(match.scheduledAt.getTime() - offsetMinutes * 60 * 1000);
      if (now >= releaseAt) {
        const [updated] = await db.update(slotMatchesTable).set({
          credentialsReleasedAt: now,
        }).where(eq(slotMatchesTable.id, match.id)).returning();

        const slot = await db.query.tournamentsTable.findFirst({
          where: eq(tournamentsTable.id, match.slotId),
          columns: { title: true },
        });

        await notifyCredentials(updated, slot?.title ?? "Match");
        await logMatchEvent(match.id, "system", "credentials_auto_released", {
          offsetMinutes,
          scheduledAt: match.scheduledAt.toISOString(),
        });

        const enriched = await enrichMatchForAdmin(updated);
        pushToMatchAdmins(match.id, "match_update", enriched);
      }
    }
  } catch (e) {
    console.error("[auto-release] error:", e);
  }
}

// ── Verification helpers ─────────────────────────────────────────────────────
interface GameStats {
  gamesplayed: number; kills: number; wins: number; damage: number;
  mvpCount: number; knockDowns: number; assists: number; deaths: number;
}
function extractStats(snapshot: unknown, gameMode: string): GameStats | null {
  const s = (snapshot as any)?.data?.[gameMode === "cs" ? "csstats" : "brstats"];
  if (!s) return null;
  return {
    gamesplayed: s.gamesplayed ?? 0, kills: s.kills ?? 0, wins: s.wins ?? 0,
    damage: s.detailedstats?.damage ?? 0, mvpCount: s.detailedstats?.mvpCount ?? 0,
    knockDowns: s.detailedstats?.knockDowns ?? 0, assists: s.detailedstats?.assists ?? 0,
    deaths: s.detailedstats?.deaths ?? 0,
  };
}
function diffStats(pre: GameStats, post: GameStats) {
  return {
    gamesplayed: post.gamesplayed - pre.gamesplayed, kills: post.kills - pre.kills,
    wins: post.wins - pre.wins, damage: post.damage - pre.damage,
    mvpCount: post.mvpCount - pre.mvpCount, knockDowns: post.knockDowns - pre.knockDowns,
    assists: post.assists - pre.assists, deaths: post.deaths - pre.deaths,
  };
}
function scoreFromDiff(diff: ReturnType<typeof diffStats>): number {
  // Primary: gamesplayed incremented — full confidence, all metrics count
  if (diff.gamesplayed >= 1) {
    return (diff.wins * 10000) + (diff.kills * 100) + (diff.mvpCount * 500) +
      Math.floor(diff.damage / 100) + diff.knockDowns;
  }
  // gamesplayed not yet updated (Free Fire API caches this field last), but
  // kills / damage / knockdowns prove a game WAS played — use them as fallback
  const activityScore = (diff.kills * 100) + (diff.mvpCount * 500) +
    Math.floor(diff.damage / 100) + diff.knockDowns;
  if (activityScore > 0) return activityScore;
  // Absolutely zero change across every metric — API is returning stale cached data
  return -Infinity;
}

/** Healing Battle win logic:
 *  - Winner = player whose damage delta is 0 (dealt no damage).
 *  - If both dealt damage → scores tied at 0 → "disputed" (both disqualified).
 *  - If both dealt 0 damage → scores tied at 1 → "disputed" (no clear winner).
 *  - Stale API data (every single stat unchanged) → -Infinity → cooldown + retry.
 */
function scoreFromDiffHealing(diff: ReturnType<typeof diffStats>): number {
  const hasActivity =
    diff.gamesplayed !== 0 || diff.kills !== 0 || diff.damage !== 0 ||
    diff.deaths !== 0 || diff.knockDowns !== 0 || diff.wins !== 0 || diff.assists !== 0;
  if (!hasActivity) return -Infinity; // fully stale — retry later
  return diff.damage === 0 ? 1 : 0;
}
async function fetchPlayerStatsPrimary(ffUid: string, gameMode: string, matchMode: string): Promise<unknown | null> {
  try {
    const url = `https://freefire-api-six.vercel.app/get_player_stats?server=ind&uid=${encodeURIComponent(ffUid)}&matchmode=${matchMode.toUpperCase()}&gamemode=${gameMode}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.success ? data : null;
  } catch { return null; }
}
async function fetchPlayerStatsFallback(ffUid: string, gameMode: string, matchMode: string): Promise<unknown | null> {
  try {
    const url = `https://freefireinfo-zy9l.onrender.com/api/v1/player-stats?uid=${encodeURIComponent(ffUid)}&server=IND&gamemode=${gameMode}&matchmode=${matchMode.toUpperCase()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.success ? data : null;
  } catch { return null; }
}
async function fetchPlayerStats(ffUid: string, gameMode: string, matchMode: string): Promise<unknown | null> {
  return (await fetchPlayerStatsPrimary(ffUid, gameMode, matchMode)) ?? (await fetchPlayerStatsFallback(ffUid, gameMode, matchMode));
}
async function creditMatchPrize(mid: number, winnerId: number, prize: number, slotId: number) {
  await db.update(usersTable).set({ diamondBalance: sql`diamond_balance + ${prize}` }).where(eq(usersTable.id, winnerId));
  await db.insert(walletTransactionsTable).values({ userId: winnerId, type: "prize", amount: prize, label: `Match Prize 🏆`, tournamentId: slotId });
  await db.insert(notificationsTable).values({ userId: winnerId, type: "result", title: "Winner! 🏆", body: `You won the match! +${prize} 💎 diamonds credited to your wallet.` });
}

/** Returns the effective prize for a match — match-level first, falls back to tournament prize pool. */
async function resolveMatchPrize(match: typeof slotMatchesTable.$inferSelect): Promise<number> {
  if ((match.prizeAmountDiamonds ?? 0) > 0) return match.prizeAmountDiamonds!;
  const tournament = await db.query.tournamentsTable.findFirst({
    where: eq(tournamentsTable.id, match.slotId),
    columns: { prizePoolDiamonds: true },
  });
  return tournament?.prizePoolDiamonds ?? 0;
}

// Prevent concurrent auto-verify runs for the same match
const autoVerifyInProgress = new Set<number>();
// Cooldown prevents hammering the stat APIs when they return stale data.
// matchId → earliest timestamp when the next retry is allowed.
const autoVerifyCooldown = new Map<number, number>();

/** Background auto-verify: fetch post-stats, decide winner, credit prize.
 *  Safe to call on every user fetch — guards ensure it runs at most once per match.
 *  If the stat APIs return stale data (all zeros), a cooldown is set and the
 *  match status stays as-is so the next open automatically retries. */
async function autoVerifyMatch(matchId: number): Promise<void> {
  if (autoVerifyInProgress.has(matchId)) return;
  const cooldownUntil = autoVerifyCooldown.get(matchId);
  if (cooldownUntil && Date.now() < cooldownUntil) return;

  autoVerifyInProgress.add(matchId);
  try {
    const match = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, matchId) });
    if (!match) return;
    // Run when pre-snapshot is stored OR a previous attempt got stale data ("failed")
    if (match.verificationStatus !== "pre_snapshot_stored" && match.verificationStatus !== "failed") return;
    if (!match.gameMode || !match.matchMode) return;
    // Only run if the match has started (scheduledAt in the past)
    if (match.scheduledAt > new Date()) return;

    const verifications = await db.query.slotMatchVerificationsTable.findMany({
      where: eq(slotMatchVerificationsTable.slotMatchId, matchId),
    });
    if (!verifications.length) return;

    // Read winLogic from the tournament's matchSettings JSON
    const tournament = await db.query.tournamentsTable.findFirst({
      where: eq(tournamentsTable.id, match.slotId),
    });
    let winLogic = "standard";
    try {
      const rawMs = (tournament as any)?.matchSettings;
      if (rawMs) {
        const ms = JSON.parse(rawMs);
        if (ms?.winLogic) winLogic = ms.winLogic;
      }
    } catch {}

    const now = new Date();
    const scored: { userId: number; score: number; apiReturned: boolean }[] = [];
    for (const v of verifications) {
      const postData = v.ffUid ? await fetchPlayerStats(v.ffUid, match.gameMode, match.matchMode) : null;
      const preStats = v.preSnapshotData ? extractStats(JSON.parse(v.preSnapshotData), match.gameMode) : null;
      const postStats = postData ? extractStats(postData, match.gameMode) : null;
      const diff = preStats && postStats ? diffStats(preStats, postStats) : null;
      const score = diff
        ? (winLogic === "healing_battle" ? scoreFromDiffHealing(diff) : scoreFromDiff(diff))
        : -Infinity;
      await db.update(slotMatchVerificationsTable).set({
        postSnapshotAt: now,
        postSnapshotData: postData ? JSON.stringify(postData) : null,
        statDiff: diff ? JSON.stringify(diff) : null,
      }).where(and(eq(slotMatchVerificationsTable.slotMatchId, matchId), eq(slotMatchVerificationsTable.userId, v.userId)));
      scored.push({ userId: v.userId, score, apiReturned: postData !== null });
    }

    const valid = scored.filter(s => isFinite(s.score));

    // If no valid scores — either the stat API is down or returning stale cached data.
    // Do NOT write "failed" to the DB; keep the status as-is so auto-verify retries
    // naturally on the next app open. Apply a cooldown to avoid API hammering.
    if (valid.length === 0) {
      const allApisFailed = scored.every(s => !s.apiReturned);
      // Shorter cooldown when APIs are fully down (likely temporary outage)
      const cooldownMs = allApisFailed ? 3 * 60 * 1000 : 10 * 60 * 1000;
      autoVerifyCooldown.set(matchId, Date.now() + cooldownMs);
      await logMatchEvent(matchId, "system", "auto_verify_retry", {
        reason: allApisFailed ? "api_unreachable" : "stale_data",
        retryAfterMs: cooldownMs,
      });
      return;
    }

    let newStatus = "winner_decided";
    let winnerId: number | null = null;
    if (valid.length === 1) { winnerId = valid[0].userId; }
    else {
      const [a, b] = [...valid].sort((x, y) => y.score - x.score);
      if (a.score === b.score) { newStatus = "disputed"; }
      else { winnerId = a.userId; }
    }

    for (const s of scored) {
      await db.update(slotMatchVerificationsTable).set({ isWinner: winnerId !== null ? s.userId === winnerId : null })
        .where(and(eq(slotMatchVerificationsTable.slotMatchId, matchId), eq(slotMatchVerificationsTable.userId, s.userId)));
    }

    const prize = await resolveMatchPrize(match);
    // Sync prize back to match row if it was missing
    if (prize > 0 && (match.prizeAmountDiamonds ?? 0) === 0) {
      await db.update(slotMatchesTable).set({ prizeAmountDiamonds: prize }).where(eq(slotMatchesTable.id, matchId));
    }

    if (winnerId && newStatus === "winner_decided" && prize > 0) {
      await creditMatchPrize(matchId, winnerId, prize, match.slotId);
      await db.update(slotMatchVerificationsTable).set({ rewardGranted: true })
        .where(and(eq(slotMatchVerificationsTable.slotMatchId, matchId), eq(slotMatchVerificationsTable.userId, winnerId)));
      newStatus = "reward_distributed";
    }

    // Update each player's participant record with their match placement so the
    // history page shows "WON" for the winner and "LOST" for the loser.
    if (winnerId) {
      for (const s of scored) {
        const isWinnerEntry = s.userId === winnerId;
        await db.update(tournamentParticipantsTable)
          .set({
            placement: isWinnerEntry ? 1 : 2,
            ...(isWinnerEntry && prize > 0 ? { diamondsWon: prize } : {}),
          })
          .where(and(
            eq(tournamentParticipantsTable.tournamentId, match.slotId),
            eq(tournamentParticipantsTable.userId, s.userId),
            eq(tournamentParticipantsTable.slotIndex, match.slotIndex),
          ));
      }
    }

    await db.update(slotMatchesTable).set({
      verificationStatus: newStatus,
      ...(winnerId ? { winnerId, status: "completed" } : {}),
      ...(newStatus === "reward_distributed" ? { rewardDistributedAt: now } : {}),
    }).where(eq(slotMatchesTable.id, matchId));

    await logMatchEvent(matchId, "system", "auto_verified", { newStatus, winnerId, scored });

    const updated = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, matchId) });
    if (updated) {
      const enriched = await enrichMatchForAdmin(updated);
      pushToMatchAdmins(matchId, "match_update", enriched);

      // Push real-time result to both players so their match page updates instantly
      // without waiting for the poll cycle.
      const payload = {
        matchId,
        slotId: updated.slotId,
        verificationStatus: newStatus,
        winnerId,
        prize,
      };
      if (updated.player1Id) pushToUser(updated.player1Id, "match_verified", payload);
      if (updated.player2Id) pushToUser(updated.player2Id, "match_verified", payload);
    }
  } finally {
    autoVerifyInProgress.delete(matchId);
  }
}
function serializeVerif(v: typeof slotMatchVerificationsTable.$inferSelect) {
  return { ...v, preSnapshotAt: v.preSnapshotAt?.toISOString() ?? null, postSnapshotAt: v.postSnapshotAt?.toISOString() ?? null };
}

// ── Admin: Confirm joined players + fetch pre-match snapshots ─────────────────
router.patch("/admin/slot-matches/:mid/confirm-joined", requireAdmin, async (req, res) => {
  const mid = await resolveSlotMatchId(String(req.params.mid));
  if (!mid) { res.status(404).json({ error: "Match not found" }); return; }
  const body = req.body as { playerIds?: number[]; gameMode?: string; matchMode?: string; prizeAmountDiamonds?: number };
  const { playerIds = [], gameMode, matchMode, prizeAmountDiamonds = 0 } = body;
  if (!gameMode || !["br", "cs"].includes(gameMode)) { res.status(400).json({ error: "gameMode must be 'br' or 'cs'" }); return; }
  if (!matchMode || !["normal", "career", "ranked"].includes(matchMode)) { res.status(400).json({ error: "matchMode must be 'normal', 'career', or 'ranked'" }); return; }
  if (!playerIds.length) { res.status(400).json({ error: "Select at least one player" }); return; }

  const match = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  const validPlayerIds = [match.player1Id, match.player2Id].filter(Boolean) as number[];
  const invalidIds = playerIds.filter(id => !validPlayerIds.includes(id));
  if (invalidIds.length) { res.status(400).json({ error: "Invalid player IDs" }); return; }

  // 1. Immediately update match status and insert placeholder verification rows
  await db.update(slotMatchesTable).set({
    gameMode, matchMode, prizeAmountDiamonds, verificationStatus: "pre_snapshot_stored", status: "ongoing",
  }).where(eq(slotMatchesTable.id, mid));

  const now = new Date();
  const playerMeta: { uid: number; ffUid: string | null; playerName: string }[] = [];
  for (const uid of playerIds) {
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, uid), columns: { id: true, uid: true, inGameName: true } });
    const ffUid = user?.uid ?? null;
    const playerName = user?.inGameName ?? `User #${uid}`;
    playerMeta.push({ uid, ffUid, playerName });
    await db.insert(slotMatchPlayerStatusTable).values({ slotMatchId: mid, userId: uid, confirmedAt: now })
      .onConflictDoUpdate({ target: [slotMatchPlayerStatusTable.slotMatchId, slotMatchPlayerStatusTable.userId], set: { confirmedAt: now } }).catch(() => {});
    await db.insert(slotMatchVerificationsTable).values({
      slotMatchId: mid, userId: uid, ffUid, preSnapshotAt: now, preSnapshotData: null,
    }).onConflictDoUpdate({
      target: [slotMatchVerificationsTable.slotMatchId, slotMatchVerificationsTable.userId],
      set: { ffUid, preSnapshotAt: now, preSnapshotData: null, postSnapshotAt: null, postSnapshotData: null, statDiff: null, isWinner: null, rewardGranted: false },
    });
  }

  // 2. Push SSE immediately so the frontend unblocks
  const updatedNow = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (updatedNow) { const enriched = await enrichMatchForAdmin(updatedNow); pushToMatchAdmins(mid, "match_update", enriched); }

  // 3. Respond to frontend immediately — button unlocks right away
  const verifNow = await db.query.slotMatchVerificationsTable.findMany({ where: eq(slotMatchVerificationsTable.slotMatchId, mid) });
  res.json({ ok: true, fetching: true, verifications: verifNow.map(serializeVerif) });

  // 4. Fetch stats in background — does not block the response
  (async () => {
    const verificationResults: { userId: number; ffUid: string | null; success: boolean; error?: string }[] = [];
    await Promise.all(playerMeta.map(async ({ uid, ffUid, playerName }) => {
      let snapshotData: unknown = null;
      if (ffUid) {
        pushToMatchAdmins(mid, "stats_progress", { userId: uid, playerName, step: "Fetching stats — trying primary API…" });
        const primary = await fetchPlayerStatsPrimary(ffUid, gameMode!, matchMode!);
        if (primary) {
          snapshotData = primary;
          pushToMatchAdmins(mid, "stats_progress", { userId: uid, playerName, step: "✓ Stats fetched (primary API)" });
        } else {
          pushToMatchAdmins(mid, "stats_progress", { userId: uid, playerName, step: "Primary API failed — trying fallback API…" });
          const fallback = await fetchPlayerStatsFallback(ffUid, gameMode!, matchMode!);
          if (fallback) {
            snapshotData = fallback;
            pushToMatchAdmins(mid, "stats_progress", { userId: uid, playerName, step: "✓ Stats fetched (fallback API)" });
          } else {
            pushToMatchAdmins(mid, "stats_progress", { userId: uid, playerName, step: "✗ Both APIs failed — check UID or try again" });
          }
        }
      } else {
        pushToMatchAdmins(mid, "stats_progress", { userId: uid, playerName, step: "No FF UID on profile" });
      }
      const snapshotSuccess = !!snapshotData;
      await db.update(slotMatchVerificationsTable)
        .set({ preSnapshotData: snapshotData ? JSON.stringify(snapshotData) : null })
        .where(and(eq(slotMatchVerificationsTable.slotMatchId, mid), eq(slotMatchVerificationsTable.userId, uid)));
      verificationResults.push({ userId: uid, ffUid, success: snapshotSuccess, ...(!snapshotSuccess && { error: ffUid ? "Both APIs failed" : "No FF UID on profile" }) });
    }));
    await logMatchEvent(mid, "admin", "players_confirmed", { playerIds, gameMode, matchMode, prizeAmountDiamonds, verificationResults });
    const updatedAfter = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
    if (updatedAfter) { const enriched = await enrichMatchForAdmin(updatedAfter); pushToMatchAdmins(mid, "match_update", enriched); }
  })().catch(() => {});
});

// ── Admin: Re-fetch pre-match stats for players that have no snapshot yet ─────
router.post("/admin/slot-matches/:mid/refetch-prestats", requireAdmin, async (req, res) => {
  const mid = await resolveSlotMatchId(String(req.params.mid));
  if (!mid) { res.status(404).json({ error: "Match not found" }); return; }
  const match = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if (!match.gameMode || !match.matchMode) { res.status(400).json({ error: "Match not configured. Confirm players first." }); return; }

  const verifications = await db.query.slotMatchVerificationsTable.findMany({ where: eq(slotMatchVerificationsTable.slotMatchId, mid) });
  if (!verifications.length) { res.status(400).json({ error: "No verification records. Confirm players first." }); return; }

  const playerMeta = await Promise.all(
    verifications.map(async v => {
      const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, v.userId), columns: { id: true, inGameName: true } });
      return { userId: v.userId, ffUid: v.ffUid, playerName: user?.inGameName ?? `User #${v.userId}` };
    })
  );

  // Respond immediately — fetch in background
  const verifNow = await db.query.slotMatchVerificationsTable.findMany({ where: eq(slotMatchVerificationsTable.slotMatchId, mid) });
  res.json({ ok: true, fetching: true, verifications: verifNow.map(serializeVerif) });

  (async () => {
    for (const { userId, ffUid, playerName } of playerMeta) {
      let snapshotData: unknown = null;
      if (ffUid) {
        pushToMatchAdmins(mid, "stats_progress", { userId, playerName, step: "Re-fetching stats — trying primary API…" });
        const primary = await fetchPlayerStatsPrimary(ffUid, match.gameMode!, match.matchMode!);
        if (primary) {
          snapshotData = primary;
          pushToMatchAdmins(mid, "stats_progress", { userId, playerName, step: "✓ Stats fetched (primary API)" });
        } else {
          pushToMatchAdmins(mid, "stats_progress", { userId, playerName, step: "Primary API failed — trying fallback…" });
          const fallback = await fetchPlayerStatsFallback(ffUid, match.gameMode!, match.matchMode!);
          if (fallback) {
            snapshotData = fallback;
            pushToMatchAdmins(mid, "stats_progress", { userId, playerName, step: "✓ Stats fetched (fallback API)" });
          } else {
            pushToMatchAdmins(mid, "stats_progress", { userId, playerName, step: "✗ Both APIs failed — check UID or try again later" });
          }
        }
      } else {
        pushToMatchAdmins(mid, "stats_progress", { userId, playerName, step: "No FF UID on profile" });
      }
      if (snapshotData !== null) {
        await db.update(slotMatchVerificationsTable)
          .set({ preSnapshotData: JSON.stringify(snapshotData), preSnapshotAt: new Date() })
          .where(and(eq(slotMatchVerificationsTable.slotMatchId, mid), eq(slotMatchVerificationsTable.userId, userId)));
      }
    }
    const updatedAfter = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
    if (updatedAfter) { const enriched = await enrichMatchForAdmin(updatedAfter); pushToMatchAdmins(mid, "match_update", enriched); }
  })().catch(() => {});
});

// ── Admin: Verify result (post-match snapshots + winner determination) ────────
router.post("/admin/slot-matches/:mid/verify-result", requireAdmin, async (req, res) => {
  const mid = await resolveSlotMatchId(String(req.params.mid));
  if (!mid) { res.status(404).json({ error: "Match not found" }); return; }
  const match = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if (match.verificationStatus === "reward_distributed") { res.status(400).json({ error: "Reward already distributed" }); return; }
  if (!match.gameMode || !match.matchMode) { res.status(400).json({ error: "Match not configured. Confirm players first." }); return; }

  const verifications = await db.query.slotMatchVerificationsTable.findMany({ where: eq(slotMatchVerificationsTable.slotMatchId, mid) });
  if (!verifications.length) { res.status(400).json({ error: "No verification records. Confirm players first." }); return; }

  const now = new Date();
  const scored: { userId: number; score: number }[] = [];
  for (const v of verifications) {
    const postData = v.ffUid ? await fetchPlayerStats(v.ffUid, match.gameMode, match.matchMode) : null;
    const preStats = v.preSnapshotData ? extractStats(JSON.parse(v.preSnapshotData), match.gameMode) : null;
    const postStats = postData ? extractStats(postData, match.gameMode) : null;
    const diff = preStats && postStats ? diffStats(preStats, postStats) : null;
    const score = diff ? scoreFromDiff(diff) : -Infinity;
    await db.update(slotMatchVerificationsTable).set({
      postSnapshotAt: now, postSnapshotData: postData ? JSON.stringify(postData) : null,
      statDiff: diff ? JSON.stringify(diff) : null,
    }).where(and(eq(slotMatchVerificationsTable.slotMatchId, mid), eq(slotMatchVerificationsTable.userId, v.userId)));
    scored.push({ userId: v.userId, score });
  }

  const valid = scored.filter(s => isFinite(s.score));

  // If no valid scores, stats haven't changed yet — don't corrupt the DB with "failed".
  // Return a stale-data signal so the admin knows to retry after the match ends.
  if (valid.length === 0) {
    res.status(202).json({
      ok: false,
      stale: true,
      message: "Stats unchanged — match may not have finished yet. Retry after the match ends.",
      verifications: (await db.query.slotMatchVerificationsTable.findMany({ where: eq(slotMatchVerificationsTable.slotMatchId, mid) })).map(serializeVerif),
    });
    return;
  }

  let newStatus = "winner_decided";
  let winnerId: number | null = null;
  if (valid.length === 1) { winnerId = valid[0].userId; }
  else {
    const [a, b] = [...valid].sort((x, y) => y.score - x.score);
    if (a.score === b.score) { newStatus = "disputed"; }
    else { winnerId = a.userId; }
  }

  for (const s of scored) {
    await db.update(slotMatchVerificationsTable).set({ isWinner: winnerId !== null ? s.userId === winnerId : null })
      .where(and(eq(slotMatchVerificationsTable.slotMatchId, mid), eq(slotMatchVerificationsTable.userId, s.userId)));
  }

  const prize = await resolveMatchPrize(match);
  if (prize > 0 && (match.prizeAmountDiamonds ?? 0) === 0) {
    await db.update(slotMatchesTable).set({ prizeAmountDiamonds: prize }).where(eq(slotMatchesTable.id, mid));
  }
  if (winnerId && newStatus === "winner_decided" && prize > 0) {
    await creditMatchPrize(mid, winnerId, prize, match.slotId);
    await db.update(slotMatchVerificationsTable).set({ rewardGranted: true })
      .where(and(eq(slotMatchVerificationsTable.slotMatchId, mid), eq(slotMatchVerificationsTable.userId, winnerId)));
    newStatus = "reward_distributed";
  }

  // Update each player's participant record with their match placement so the
  // history page shows "WON" for the winner and "LOST" for the loser.
  if (winnerId) {
    for (const s of scored) {
      const isWinnerEntry = s.userId === winnerId;
      await db.update(tournamentParticipantsTable)
        .set({
          placement: isWinnerEntry ? 1 : 2,
          ...(isWinnerEntry && prize > 0 ? { diamondsWon: prize } : {}),
        })
        .where(and(
          eq(tournamentParticipantsTable.tournamentId, match.slotId),
          eq(tournamentParticipantsTable.userId, s.userId),
          eq(tournamentParticipantsTable.slotIndex, match.slotIndex),
        ));
    }
  }

  await db.update(slotMatchesTable).set({
    verificationStatus: newStatus,
    ...(winnerId ? { winnerId, status: "completed" } : {}),
    ...(newStatus === "reward_distributed" ? { rewardDistributedAt: now } : {}),
  }).where(eq(slotMatchesTable.id, mid));

  await logMatchEvent(mid, "system", "result_verified", { newStatus, winnerId, scored });
  const updated = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (updated) { const enriched = await enrichMatchForAdmin(updated); pushToMatchAdmins(mid, "match_update", enriched); }

  const updatedVerifs = await db.query.slotMatchVerificationsTable.findMany({ where: eq(slotMatchVerificationsTable.slotMatchId, mid) });
  res.json({ ok: true, status: newStatus, winnerId, verifications: updatedVerifs.map(serializeVerif) });
});

// ── Admin: Get verification records ─────────────────────────────────────────
router.get("/admin/slot-matches/:mid/verifications", requireAdmin, async (req, res) => {
  const mid = await resolveSlotMatchId(String(req.params.mid));
  if (!mid) { res.status(404).json({ error: "Match not found" }); return; }
  const verifications = await db.query.slotMatchVerificationsTable.findMany({ where: eq(slotMatchVerificationsTable.slotMatchId, mid) });
  res.json(verifications.map(serializeVerif));
});

// ── Player: Upload dispute screenshot ────────────────────────────────────────
const DISPUTE_UPLOADS_DIR = join(UPLOADS_BASE, "disputes");
mkdirSync(DISPUTE_UPLOADS_DIR, { recursive: true });

const DISPUTE_ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": ".jpg", "image/jpg": ".jpg",
  "image/png": ".png", "image/webp": ".webp",
};

router.post("/slots/:id/dispute/screenshot", requireAuth, (req, res) => {
  const ct = (req.headers["content-type"] ?? "").split(";")[0].trim();
  if (!DISPUTE_ALLOWED_MIME[ct]) {
    res.status(400).json({ error: "Only JPEG, PNG, WebP images allowed" }); return;
  }
  const chunks: Buffer[] = [];
  let totalSize = 0;
  let aborted = false;
  req.on("data", (chunk: Buffer) => {
    totalSize += chunk.length;
    if (totalSize > 10 * 1024 * 1024) {
      aborted = true; req.destroy();
      res.status(400).json({ error: "File too large (max 10 MB)" }); return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
    if (aborted) return;
    if (!chunks.length) { res.status(400).json({ error: "No file data received" }); return; }
    const ext = DISPUTE_ALLOWED_MIME[ct] ?? ".jpg";
    const filename = `${randomUUID()}${ext}`;
    const filePath = join(DISPUTE_UPLOADS_DIR, filename);
    const buf = Buffer.concat(chunks);
    const ws = createWriteStream(filePath);
    ws.write(buf); ws.end();
    ws.on("finish", () => res.json({ url: `/api/slots/uploads/disputes/${filename}` }));
    ws.on("error", () => res.status(500).json({ error: "Failed to save screenshot" }));
  });
  req.on("error", () => { if (!aborted) res.status(500).json({ error: "Upload stream error" }); });
});

// ── Player: Submit dispute ────────────────────────────────────────────────────
router.post("/slots/:id/dispute", requireAuth, async (req, res) => {
  const slotId = parseInt(req.params.id);
  const userId = req.user!.userId;

  const participant = await db.query.tournamentParticipantsTable.findFirst({
    where: and(
      eq(tournamentParticipantsTable.tournamentId, slotId),
      eq(tournamentParticipantsTable.userId, userId),
    ),
  });
  if (!participant) { res.status(403).json({ error: "Not a participant" }); return; }

  const match = await db.query.slotMatchesTable.findFirst({
    where: and(
      eq(slotMatchesTable.slotId, slotId),
      or(eq(slotMatchesTable.player1Id, userId), eq(slotMatchesTable.player2Id, userId)),
      eq(slotMatchesTable.status, "completed"),
    ),
  });
  if (!match) { res.status(404).json({ error: "No completed match found" }); return; }

  const deadline = new Date(match.scheduledAt.getTime() + 24 * 60 * 60 * 1000);
  if (new Date() > deadline) {
    res.status(400).json({ error: "Dispute window has closed", deadline: deadline.toISOString() }); return;
  }

  const alreadyFiled = await db.query.slotMatchEventsTable.findFirst({
    where: and(
      eq(slotMatchEventsTable.slotMatchId, match.id),
      eq(slotMatchEventsTable.eventType, "player_dispute"),
      eq(slotMatchEventsTable.actor, String(userId)),
    ),
  });
  if (alreadyFiled) {
    res.status(400).json({ error: "You have already filed a dispute for this match" }); return;
  }

  const { reason, description, screenshotUrl, manualReviewRequested } = req.body as {
    reason?: string; description?: string;
    screenshotUrl?: string; manualReviewRequested?: boolean;
  };
  if (!reason?.trim()) { res.status(400).json({ error: "Reason is required" }); return; }
  if (!description?.trim() || description.trim().length < 10) {
    res.status(400).json({ error: "Please describe the issue (min 10 characters)" }); return;
  }

  const opponentId = match.player1Id === userId ? match.player2Id : match.player1Id;
  const opponent = opponentId
    ? await db.query.usersTable.findFirst({ where: eq(usersTable.id, opponentId), columns: { inGameName: true } })
    : null;

  const evidenceText = [
    `Reason: ${reason}`,
    manualReviewRequested ? "Manual Review Requested: yes" : null,
    `Description: ${description.trim()}`,
    screenshotUrl ? `Screenshot: ${screenshotUrl}` : null,
    `Match #${match.matchNumber ?? match.id} | Slot ${slotId}`,
  ].filter(Boolean).join("\n");

  await Promise.all([
    db.insert(reportsTable).values({
      reporterId: userId,
      accusedId: opponentId ?? null,
      accusedName: opponent?.inGameName ?? null,
      category: "dispute",
      evidence: evidenceText,
      tournamentId: slotId,
      status: "pending",
    }),
    logMatchEvent(match.id, String(userId), "player_dispute", {
      reason, manualReviewRequested: manualReviewRequested ?? false,
      screenshotUrl: screenshotUrl ?? null,
    }),
  ]);

  res.json({ ok: true, deadline: deadline.toISOString() });
});

// ── Admin: Dispute match ──────────────────────────────────────────────────────
router.post("/admin/slot-matches/:mid/dispute", requireAdmin, async (req, res) => {
  const mid = await resolveSlotMatchId(String(req.params.mid));
  if (!mid) { res.status(404).json({ error: "Match not found" }); return; }
  const match = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  await db.update(slotMatchesTable).set({ verificationStatus: "disputed" }).where(eq(slotMatchesTable.id, mid));
  await logMatchEvent(mid, "admin", "match_disputed", { reason: (req.body as any)?.reason });
  const updated = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (updated) { const enriched = await enrichMatchForAdmin(updated); pushToMatchAdmins(mid, "match_update", enriched); }
  res.json({ ok: true });
});

// ── Admin: Override winner manually ──────────────────────────────────────────
router.patch("/admin/slot-matches/:mid/override-winner", requireAdmin, async (req, res) => {
  const mid = await resolveSlotMatchId(String(req.params.mid));
  if (!mid) { res.status(404).json({ error: "Match not found" }); return; }
  const body = req.body as { winnerId?: number; prizeAmountDiamonds?: number };
  if (!body.winnerId) { res.status(400).json({ error: "winnerId required" }); return; }
  const match = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if (match.verificationStatus === "reward_distributed") { res.status(400).json({ error: "Reward already distributed" }); return; }
  const validPlayerIds = [match.player1Id, match.player2Id].filter(Boolean) as number[];
  if (!validPlayerIds.includes(body.winnerId)) { res.status(400).json({ error: "Winner must be a match participant" }); return; }

  const prize = body.prizeAmountDiamonds !== undefined
    ? body.prizeAmountDiamonds
    : await resolveMatchPrize(match);
  const now = new Date();
  if (prize > 0) {
    await creditMatchPrize(mid, body.winnerId, prize, match.slotId);
    await db.update(slotMatchVerificationsTable).set({ isWinner: false }).where(eq(slotMatchVerificationsTable.slotMatchId, mid));
    await db.update(slotMatchVerificationsTable).set({ isWinner: true, rewardGranted: true })
      .where(and(eq(slotMatchVerificationsTable.slotMatchId, mid), eq(slotMatchVerificationsTable.userId, body.winnerId)));
  }

  await db.update(slotMatchesTable).set({
    winnerId: body.winnerId, status: "completed", verificationStatus: "reward_distributed",
    rewardDistributedAt: now, prizeAmountDiamonds: prize,
  }).where(eq(slotMatchesTable.id, mid));

  await logMatchEvent(mid, "admin", "winner_overridden", { winnerId: body.winnerId, prize });
  const updated = await db.query.slotMatchesTable.findFirst({ where: eq(slotMatchesTable.id, mid) });
  if (updated) { const enriched = await enrichMatchForAdmin(updated); pushToMatchAdmins(mid, "match_update", enriched); }
  res.json({ ok: true, winnerId: body.winnerId, prize });
});

export default router;
