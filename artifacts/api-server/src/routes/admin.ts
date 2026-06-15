import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tournamentsTable,
  usersTable,
  tournamentParticipantsTable,
  walletTransactionsTable,
  notificationsTable,
  adminLogsTable,
  supportMessagesTable,
  withdrawalRequestsTable,
  deviceSessionsTable,
  balanceChangeLogsTable,
  scheduledRewardsTable,
  reportsTable,
  feedbackTable,
  tournamentCredentialViewsTable,
  achievementsTable,
  loginHistoryTable,
  securityFlagsTable,
  slotMatchesTable,
  slotMatchVerificationsTable,
  slotMatchEventsTable,
  slotMatchPlayerStatusTable,
  topupRequestsTable,
} from "@workspace/db";
import { eq, sql, lt, and, desc, asc, ne, gte, inArray } from "drizzle-orm";
import { requireAdmin, requireFinanceAdmin, getSuperSecret } from "../middlewares/auth.js";
import { getSupportSettings, saveSupportSettings } from "../lib/supportSettings.js";
import { getSystemSettings, saveSystemSettings } from "../lib/systemSettings.js";
import { sendPushToUser, sendPushToAll } from "../lib/push.js";
import { pushToUser, subscribeAdminChat, unsubscribeAdminChat } from "../lib/sse-manager.js";
import { markAdminOnline, markAdminOffline } from "../lib/chat-presence.js";
import jwt from "jsonwebtoken";

function pushAfter(userId: number, type: string, title: string, body: string, url?: string) {
  sendPushToUser(userId, { type, title, body, url: url ?? "/#/notifications" }).catch(() => {});
}

const router: IRouter = Router();

const BIN_EXPIRY_DAYS = 15;

async function logBalChange(p: {
  userId: number; adminId: number | null; amount: number;
  balanceBefore: number; balanceAfter: number; reason: string; source: string;
}) {
  await db.insert(balanceChangeLogsTable).values(p);
}

async function writeLog(targetId: number, action: string, category: string, details?: string) {
  await db.insert(adminLogsTable).values({
    action,
    category,
    details: details ?? null,
    targetId: String(targetId),
    targetType: "user",
  });
}

function formatUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    phone: u.phone,
    inGameName: u.inGameName,
    uid: u.uid,
    profilePicture: u.profilePicture ?? null,
    diamondBalance: u.diamondBalance,
    isAdmin: u.isAdmin,
    createdAt: u.createdAt.toISOString(),
    status: u.status,
    blockedAt: u.blockedAt?.toISOString() ?? null,
    blockedReason: u.blockedReason ?? null,
    blockedUntil: u.blockedUntil?.toISOString() ?? null,
    deletedAt: u.deletedAt?.toISOString() ?? null,
    deleteReason: u.deleteReason ?? null,
    lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
    isOnline: u.lastSeenAt ? (Date.now() - u.lastSeenAt.getTime()) < 3 * 60 * 1000 : false,
    theme: u.theme ?? null,
    tournamentBanned: u.tournamentBanned,
    tournamentBannedAt: u.tournamentBannedAt?.toISOString() ?? null,
    tournamentBannedUntil: u.tournamentBannedUntil?.toISOString() ?? null,
    withdrawalBanned: u.withdrawalBanned,
    withdrawalBannedAt: u.withdrawalBannedAt?.toISOString() ?? null,
    topupBanned: u.topupBanned,
    topupBannedAt: u.topupBannedAt?.toISOString() ?? null,
    chatMuted: u.chatMuted,
    chatMutedAt: u.chatMutedAt?.toISOString() ?? null,
    chatMutedUntil: u.chatMutedUntil?.toISOString() ?? null,
    walletFrozen: u.walletFrozen,
    walletFrozenAt: u.walletFrozenAt?.toISOString() ?? null,
    allowDepositWithdrawal: u.allowDepositWithdrawal,
    minWithdrawal: u.minWithdrawal ?? null,
    minTopup: u.minTopup ?? null,
    nameChangedAt: u.nameChangedAt?.toISOString() ?? null,
    nameChangeAllowed: u.nameChangeAllowed,
    platformId: u.platformId ?? null,
    twoFaResetAt: u.twoFaResetAt?.toISOString() ?? null,
    twoFaWithdrawalBypass: u.twoFaWithdrawalBypass,
    twoFaEnabled: u.twoFaEnabled,
    twoFaPassword: u.twoFaPassword ?? null,
    twoFaPending: u.twoFaPending,
    twoFaPendingAt: u.twoFaPendingAt?.toISOString() ?? null,
    twoFaAutoApproveAt: u.twoFaPendingAt ? new Date(u.twoFaPendingAt.getTime() + 24 * 60 * 60 * 1000).toISOString() : null,
  };
}

function formatTournament(t: typeof tournamentsTable.$inferSelect) {
  return {
    id: t.id,
    title: t.title,
    gameMode: t.gameMode,
    entryFeeDiamonds: t.entryFeeDiamonds,
    prizePoolDiamonds: t.prizePoolDiamonds,
    maxSlots: t.maxSlots,
    filledSlots: t.filledSlots,
    startTime: t.startTime.toISOString(),
    status: t.status,
    roomId: t.roomId,
    roomPassword: t.roomPassword,
    isJoined: false,
    createdAt: t.createdAt.toISOString(),
    perKillDiamonds: t.perKillDiamonds,
    matchSlug: t.matchSlug ?? null,
    imageUrl: t.imageUrl ?? null,
    rules: t.rules ?? null,
    description: t.description ?? null,
    map: t.map ?? null,
    region: t.region ?? null,
    shortTitle: t.shortTitle ?? null,
    statusLabel: t.statusLabel ?? null,
    statusColor: t.statusColor ?? null,
    estimatedDuration: t.estimatedDuration ?? null,
    matchSettings: t.matchSettings ?? null,
    roomDirectLink: t.roomDirectLink ?? null,
    credentialsReleased: t.credentialsReleased,
    credentialsReleasedAt: t.credentialsReleasedAt?.toISOString() ?? null,
    credentialShareMode: t.credentialShareMode,
    credentialUnlockMinutes: t.credentialUnlockMinutes ?? null,
  };
}

router.get("/admin/tournaments", requireAdmin, async (_req, res) => {
  const tournaments = await db.query.tournamentsTable.findMany();
  res.json(tournaments.map(formatTournament));
});

router.post("/admin/tournaments", requireAdmin, async (req, res) => {
  const body = req.body as {
    title?: string; gameMode?: string; entryFeeDiamonds?: number;
    prizePoolDiamonds?: number; maxSlots?: number; startTime?: string;
    status?: string; roomId?: string; roomPassword?: string;
    perKillDiamonds?: number; matchSlug?: string; imageUrl?: string; rules?: string;
    description?: string; map?: string; region?: string; shortTitle?: string; statusLabel?: string; statusColor?: string; estimatedDuration?: string;
    matchSettings?: string; roomDirectLink?: string; credentialUnlockMinutes?: number | null;
  };
  if (!body.title || !body.gameMode || !body.startTime || !body.status) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  const [tournament] = await db.insert(tournamentsTable).values({
    title: body.title,
    gameMode: body.gameMode,
    entryFeeDiamonds: body.entryFeeDiamonds ?? 0,
    prizePoolDiamonds: body.prizePoolDiamonds ?? 0,
    maxSlots: body.maxSlots ?? 100,
    startTime: new Date(body.startTime),
    status: body.status,
    roomId: body.roomId,
    roomPassword: body.roomPassword,
    perKillDiamonds: body.perKillDiamonds ?? 0,
    matchSlug: body.matchSlug ?? null,
    imageUrl: body.imageUrl ?? null,
    rules: body.rules ?? null,
    description: body.description ?? null,
    map: body.map ?? null,
    region: body.region ?? null,
    shortTitle: body.shortTitle ?? null,
    statusLabel: body.statusLabel ?? null,
    statusColor: body.statusColor ?? null,
    estimatedDuration: body.estimatedDuration ?? null,
    matchSettings: body.matchSettings ?? null,
    roomDirectLink: body.roomDirectLink ?? null,
    credentialUnlockMinutes: body.credentialUnlockMinutes ?? null,
  }).returning();
  res.status(201).json(formatTournament(tournament));
});

router.put("/admin/tournaments/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const body = req.body as {
    title?: string; gameMode?: string; entryFeeDiamonds?: number;
    prizePoolDiamonds?: number; maxSlots?: number; startTime?: string;
    status?: string; roomId?: string; roomPassword?: string;
    perKillDiamonds?: number; matchSlug?: string; imageUrl?: string; rules?: string;
    description?: string; map?: string; region?: string; shortTitle?: string; statusLabel?: string; statusColor?: string; estimatedDuration?: string;
    matchSettings?: string; roomDirectLink?: string; credentialUnlockMinutes?: number | null;
  };
  const [updated] = await db.update(tournamentsTable).set({
    title: body.title,
    gameMode: body.gameMode,
    entryFeeDiamonds: body.entryFeeDiamonds,
    prizePoolDiamonds: body.prizePoolDiamonds,
    maxSlots: body.maxSlots,
    startTime: body.startTime ? new Date(body.startTime) : undefined,
    status: body.status,
    roomId: body.roomId,
    roomPassword: body.roomPassword,
    perKillDiamonds: body.perKillDiamonds,
    matchSlug: body.matchSlug ?? undefined,
    imageUrl: body.imageUrl ?? undefined,
    rules: body.rules ?? undefined,
    description: body.description ?? undefined,
    map: body.map ?? undefined,
    region: body.region ?? undefined,
    shortTitle: body.shortTitle ?? undefined,
    statusLabel: body.statusLabel ?? undefined,
    statusColor: body.statusColor ?? undefined,
    estimatedDuration: body.estimatedDuration ?? undefined,
    matchSettings: body.matchSettings ?? undefined,
    roomDirectLink: body.roomDirectLink ?? undefined,
    credentialUnlockMinutes: "credentialUnlockMinutes" in body ? (body.credentialUnlockMinutes ?? null) : undefined,
  }).where(eq(tournamentsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Tournament not found" }); return; }
  res.json(formatTournament(updated));
});

router.post("/admin/tournaments/:id/gen-slug", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { createHash, randomBytes } = await import("crypto");
  const slug = createHash("md5").update(randomBytes(16)).digest("hex");
  const [updated] = await db.update(tournamentsTable)
    .set({ matchSlug: slug })
    .where(eq(tournamentsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Tournament not found" }); return; }
  await writeLog(id, "slug_generated", "tournament", `${updated.title} · slug: ${slug}`);
  res.json({ slug, tournament: formatTournament(updated) });
});

router.delete("/admin/tournaments/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const reason: string = String(req.body?.reason || "").trim() || "Tournament has been cancelled by the administrator.";
  const mode: string   = String(req.body?.mode   || "hard_delete");
  const silent: boolean = req.body?.silent === true;

  const tournament = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, id) });
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }

  // ── MODE: hide (only remove from listings, participants unaffected) ─────────
  if (mode === "hide") {
    await db.update(tournamentsTable).set({ status: "hidden" }).where(eq(tournamentsTable.id, id));
    await writeLog(id, "match_hidden", "tournament", `${tournament.title} · hidden from listings`);
    res.json({ message: "Match hidden from listings" });
    return;
  }

  // ── MODE: registered_only (refund participants, keep tournament record) ─────
  if (mode === "registered_only") {
    const participants = await db.query.tournamentParticipantsTable.findMany({
      where: eq(tournamentParticipantsTable.tournamentId, id),
    });
    for (const p of participants) {
      if (tournament.entryFeeDiamonds > 0) {
        const rUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, p.userId), columns: { id: true, diamondBalance: true } });
        await db.update(usersTable).set({ diamondBalance: sql`diamond_balance + ${tournament.entryFeeDiamonds}` }).where(eq(usersTable.id, p.userId));
        await db.insert(balanceChangeLogsTable).values({
          userId: p.userId, adminId: req.user!.userId, amount: tournament.entryFeeDiamonds,
          balanceBefore: rUser?.diamondBalance ?? 0,
          balanceAfter: (rUser?.diamondBalance ?? 0) + tournament.entryFeeDiamonds,
          reason: `Match registration removed — entry refund: ${tournament.title}`,
          source: "match_cancel_refund",
        });
        await db.insert(walletTransactionsTable).values({
          userId: p.userId, type: "topup", amount: tournament.entryFeeDiamonds,
          label: `Refund: ${tournament.title} (Registration Removed)`, tournamentId: id,
        });
      }
      if (!silent) {
        await db.insert(notificationsTable).values({
          userId: p.userId, type: "wallet", title: "Match Registration Removed",
          body: `Your registration for ${tournament.title} was removed by admin.${reason ? ` Reason: ${reason}.` : ""}${tournament.entryFeeDiamonds > 0 ? ` Your entry fee of ${tournament.entryFeeDiamonds} 💎 has been refunded.` : ""}`,
        });
        pushAfter(p.userId, "wallet", "Registration Removed",
          `${tournament.title}${tournament.entryFeeDiamonds > 0 ? ` — ${tournament.entryFeeDiamonds} 💎 refunded` : ""}`, "/#/wallet");
      }
    }
    await db.delete(tournamentParticipantsTable).where(eq(tournamentParticipantsTable.tournamentId, id));
    await db.update(tournamentsTable).set({ status: "cancelled", cancelReason: reason }).where(eq(tournamentsTable.id, id));
    await writeLog(id, "match_registered_removed", "tournament",
      `${tournament.title} · ${participants.length} participants removed & refunded · silent=${silent}`);
    res.json({ message: "Registered players removed and refunded", removed: participants.length });
    return;
  }

  // ── MODES: hard_delete / full_wipe — refund participants first ─────────────
  if (tournament.status !== "cancelled") {
    const participants = await db.query.tournamentParticipantsTable.findMany({
      where: eq(tournamentParticipantsTable.tournamentId, id),
    });
    for (const p of participants) {
      if (tournament.entryFeeDiamonds > 0) {
        const rUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, p.userId), columns: { id: true, diamondBalance: true } });
        await db.update(usersTable).set({ diamondBalance: sql`diamond_balance + ${tournament.entryFeeDiamonds}` }).where(eq(usersTable.id, p.userId));
        await db.insert(balanceChangeLogsTable).values({
          userId: p.userId, adminId: req.user!.userId, amount: tournament.entryFeeDiamonds,
          balanceBefore: rUser?.diamondBalance ?? 0,
          balanceAfter: (rUser?.diamondBalance ?? 0) + tournament.entryFeeDiamonds,
          reason: `Match deleted — entry refund: ${tournament.title}`,
          source: "match_cancel_refund",
        });
        if (mode !== "full_wipe") {
          await db.insert(walletTransactionsTable).values({
            userId: p.userId, type: "topup", amount: tournament.entryFeeDiamonds,
            label: `Refund: ${tournament.title} (Deleted)`, tournamentId: id,
          });
        }
      }
      if (!silent) {
        await db.insert(notificationsTable).values({
          userId: p.userId, type: "wallet", title: "Match Cancelled — Refunded",
          body: `${tournament.title} was cancelled. Reason: ${reason}${tournament.entryFeeDiamonds > 0 ? ` Your entry fee of ${tournament.entryFeeDiamonds} 💎 has been refunded.` : ""}`,
        });
        pushAfter(p.userId, "wallet", "Match Cancelled",
          `${tournament.title} cancelled${tournament.entryFeeDiamonds > 0 ? ` — ${tournament.entryFeeDiamonds} 💎 refunded` : ""}`, "/#/wallet");
      }
    }
  }

  try {
    await db.delete(tournamentCredentialViewsTable).where(eq(tournamentCredentialViewsTable.tournamentId, id));

    const slotMatchIds = (await db.query.slotMatchesTable.findMany({
      where: eq(slotMatchesTable.slotId, id),
      columns: { id: true },
    })).map(m => m.id);

    if (slotMatchIds.length > 0) {
      await db.delete(slotMatchVerificationsTable).where(inArray(slotMatchVerificationsTable.slotMatchId, slotMatchIds));
      await db.delete(slotMatchEventsTable).where(inArray(slotMatchEventsTable.slotMatchId, slotMatchIds));
      await db.delete(slotMatchPlayerStatusTable).where(inArray(slotMatchPlayerStatusTable.slotMatchId, slotMatchIds));
    }

    await db.delete(slotMatchesTable).where(eq(slotMatchesTable.slotId, id));
    await db.delete(tournamentParticipantsTable).where(eq(tournamentParticipantsTable.tournamentId, id));

    if (mode === "full_wipe") {
      await db.delete(walletTransactionsTable).where(eq(walletTransactionsTable.tournamentId, id));
      console.log(`[delete ${id}] wallet transactions wiped`);
    }

    await db.delete(tournamentsTable).where(eq(tournamentsTable.id, id));
    console.log(`[delete ${id}] tournament deleted (mode=${mode})`);
  } catch (err: any) {
    console.error(`[delete ${id}] FAILED:`, err?.message ?? err);
    res.status(500).json({ error: "Failed to delete tournament", detail: err?.message });
    return;
  }
  res.json({ message: mode === "full_wipe" ? "Tournament fully wiped from database and wallet history" : "Tournament deleted" });
});

// ── MATCH OVERRIDE CONTROLS ───────────────────────────────────────────────────

router.post("/admin/tournaments/:id/cancel", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const tournament = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, id) });
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
  if (tournament.status === "cancelled") { res.status(409).json({ error: "Already cancelled" }); return; }

  const reason: string = String(req.body?.reason || "").trim() || "Tournament has been cancelled by the administrator.";
  const silent: boolean = req.body?.silent === true;

  const participants = await db.query.tournamentParticipantsTable.findMany({
    where: eq(tournamentParticipantsTable.tournamentId, id),
  });

  for (const p of participants) {
    if (tournament.entryFeeDiamonds > 0) {
      const rUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, p.userId), columns: { id: true, diamondBalance: true } });
      await db.update(usersTable).set({ diamondBalance: sql`diamond_balance + ${tournament.entryFeeDiamonds}` }).where(eq(usersTable.id, p.userId));
      await db.insert(balanceChangeLogsTable).values({
        userId: p.userId, adminId: req.user!.userId, amount: tournament.entryFeeDiamonds,
        balanceBefore: rUser?.diamondBalance ?? 0,
        balanceAfter: (rUser?.diamondBalance ?? 0) + tournament.entryFeeDiamonds,
        reason: `Match cancelled — entry refund: ${tournament.title}`,
        source: "match_cancel_refund",
      });
      await db.insert(walletTransactionsTable).values({
        userId: p.userId, type: "topup", amount: tournament.entryFeeDiamonds,
        label: `Refund: ${tournament.title} (Cancelled)`, tournamentId: id,
      });
    }
    if (!silent) {
      await db.insert(notificationsTable).values({
        userId: p.userId, type: "wallet", title: "Match Cancelled — Refunded",
        body: `${tournament.title} was cancelled. Reason: ${reason}${tournament.entryFeeDiamonds > 0 ? ` Your entry fee of ${tournament.entryFeeDiamonds} 💎 has been refunded.` : ""}`,
      });
      pushAfter(p.userId, "wallet", "Match Cancelled",
        `${tournament.title} cancelled${tournament.entryFeeDiamonds > 0 ? ` — ${tournament.entryFeeDiamonds} 💎 refunded` : ""}`, "/#/wallet");
    }
  }

  await db.update(tournamentsTable).set({ status: "cancelled", cancelReason: reason }).where(eq(tournamentsTable.id, id));
  await writeLog(id, "match_cancelled", "tournament",
    `${tournament.title} · ${participants.length} players refunded · silent=${silent} · reason: ${reason}`);
  res.json({ message: "Match cancelled", refunded: participants.length, silent });
});

router.post("/admin/tournaments/:id/redraw", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { roomId, roomPassword } = req.body as { roomId?: string; roomPassword?: string };
  const tournament = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, id) });
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }

  const [updated] = await db.update(tournamentsTable)
    .set({ roomId: roomId?.trim() || null, roomPassword: roomPassword?.trim() || null })
    .where(eq(tournamentsTable.id, id)).returning();

  const participants = await db.query.tournamentParticipantsTable.findMany({
    where: eq(tournamentParticipantsTable.tournamentId, id),
  });
  for (const p of participants) {
    await db.insert(notificationsTable).values({
      userId: p.userId, type: "tournament", title: "Room Redrawn",
      body: `The room for ${tournament.title} has been updated. Check the match for new credentials.`,
    });
    pushAfter(p.userId, "tournament", "Room Redrawn 🔑", `Check the match for new credentials.`, `/#/matches/${id}`);
  }
  await writeLog(id, "room_redrawn", "tournament",
    `${tournament.title} · New room: ${roomId || "cleared"}`);
  res.json(formatTournament(updated));
});

router.patch("/admin/tournaments/:id/reschedule", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { startTime, reason } = req.body as { startTime?: string; reason?: string };
  if (!startTime) { res.status(400).json({ error: "startTime required" }); return; }
  const tournament = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, id) });
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }

  const [updated] = await db.update(tournamentsTable)
    .set({ startTime: new Date(startTime) })
    .where(eq(tournamentsTable.id, id)).returning();

  const participants = await db.query.tournamentParticipantsTable.findMany({
    where: eq(tournamentParticipantsTable.tournamentId, id),
  });
  const newTimeStr = new Date(startTime).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  for (const p of participants) {
    await db.insert(notificationsTable).values({
      userId: p.userId, type: "tournament", title: "Match Rescheduled",
      body: `${tournament.title} has been rescheduled to ${newTimeStr}.${reason ? ` Reason: ${reason}` : ""}`,
    });
    pushAfter(p.userId, "tournament", "Match Rescheduled ⏰", `${tournament.title} → ${newTimeStr}`, `/#/matches/${id}`);
  }
  await writeLog(id, "match_rescheduled", "tournament",
    `${tournament.title} → ${newTimeStr}${reason ? ` · ${reason}` : ""}`);
  res.json(formatTournament(updated));
});

router.post("/admin/tournaments/:id/set-winner", requireAdmin, requireFinanceAdmin, async (req, res) => {
  const tournamentId = parseInt(String(req.params.id));
  if (isNaN(tournamentId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId, placement, kills, diamondsWon } = req.body as { userId?: number; placement?: number; kills?: number; diamondsWon?: number };
  if (!userId || !diamondsWon || diamondsWon < 0) { res.status(400).json({ error: "userId and diamondsWon required" }); return; }

  const tournament = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, tournamentId) });
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
  const existing = await db.query.tournamentParticipantsTable.findFirst({
    where: (t) => sql`${t.tournamentId} = ${tournamentId} AND ${t.userId} = ${userId}`,
  });
  if (!existing) { res.status(404).json({ error: "Participant not found" }); return; }

  const delta = diamondsWon - existing.diamondsWon;
  await db.update(tournamentParticipantsTable)
    .set({ kills: kills ?? existing.kills, placement: placement ?? existing.placement, diamondsWon })
    .where(sql`${tournamentParticipantsTable.tournamentId} = ${tournamentId} AND ${tournamentParticipantsTable.userId} = ${userId}`);

  if (delta !== 0) {
    const winUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId), columns: { id: true, diamondBalance: true } });
    await db.update(usersTable).set({ diamondBalance: sql`diamond_balance + ${delta}` }).where(eq(usersTable.id, userId));
    await db.insert(balanceChangeLogsTable).values({
      userId, adminId: req.user!.userId, amount: delta,
      balanceBefore: winUser?.diamondBalance ?? 0,
      balanceAfter: (winUser?.diamondBalance ?? 0) + delta,
      reason: `Set winner — ${tournament.title}${placement ? ` · #${placement}` : ""}`,
      source: "set_winner",
    });
    await db.insert(walletTransactionsTable).values({
      userId, type: "prize", amount: delta,
      label: `${tournament.title} Prize${placement === 1 ? " 🏆" : ""}`, tournamentId,
    });
    await db.insert(notificationsTable).values({
      userId, type: "result", title: placement === 1 ? "Winner! 🏆" : "Prize Credited",
      body: `You have been set as${placement === 1 ? " the winner" : ` #${placement}`} in ${tournament.title}. ${delta > 0 ? `+${delta}` : delta} 💎 diamonds.`,
    });
    pushAfter(userId, "result", placement === 1 ? "Winner! 🏆" : "Prize Credited 💎",
      `${delta > 0 ? `+${delta}` : delta} 💎 for ${tournament.title}`, `/#/history/matches/${tournamentId}`);
  }
  await writeLog(userId, "set_winner", "tournament",
    `${tournament.title} · User #${userId} · Place #${placement ?? "?"} · ${diamondsWon} 💎`);
  const updatedUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
  res.json({ message: "Winner set", userId, diamondsWon, balanceAfter: updatedUser?.diamondBalance ?? 0 });
});

router.post("/admin/tournaments/:id/force-payout", requireAdmin, requireFinanceAdmin, async (req, res) => {
  const tournamentId = parseInt(String(req.params.id));
  if (isNaN(tournamentId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId, amount, reason } = req.body as { userId?: number; amount?: number; reason?: string };
  if (!userId || !amount || amount <= 0) { res.status(400).json({ error: "userId and positive amount required" }); return; }

  const tournament = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, tournamentId) });
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
  const participant = await db.query.tournamentParticipantsTable.findFirst({
    where: (t) => sql`${t.tournamentId} = ${tournamentId} AND ${t.userId} = ${userId}`,
  });
  if (!participant) { res.status(404).json({ error: "Participant not found" }); return; }

  const fpUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId), columns: { id: true, diamondBalance: true } });
  await db.update(usersTable).set({ diamondBalance: sql`diamond_balance + ${amount}` }).where(eq(usersTable.id, userId));
  await db.update(tournamentParticipantsTable)
    .set({ diamondsWon: sql`diamonds_won + ${amount}` })
    .where(sql`${tournamentParticipantsTable.tournamentId} = ${tournamentId} AND ${tournamentParticipantsTable.userId} = ${userId}`);
  await db.insert(balanceChangeLogsTable).values({
    userId, adminId: req.user!.userId, amount,
    balanceBefore: fpUser?.diamondBalance ?? 0,
    balanceAfter: (fpUser?.diamondBalance ?? 0) + amount,
    reason: reason || `Force payout: ${tournament.title}`,
    source: "force_payout",
  });
  await db.insert(walletTransactionsTable).values({
    userId, type: "prize", amount, label: reason || `Force payout: ${tournament.title}`, tournamentId,
  });
  await db.insert(notificationsTable).values({
    userId, type: "wallet", title: "Prize Credited",
    body: `${amount} 💎 diamonds have been credited for ${tournament.title}.${reason ? ` ${reason}` : ""}`,
  });
  pushAfter(userId, "wallet", "Prize Credited 💎", `+${amount} 💎 for ${tournament.title}`, "/#/wallet");
  await writeLog(userId, "force_payout", "tournament",
    `${tournament.title} · +${amount} 💎${reason ? ` · ${reason}` : ""}`);
  res.json({ message: "Payout forced", userId, amount });
});

router.post("/admin/tournaments/:id/revoke-payout", requireAdmin, requireFinanceAdmin, async (req, res) => {
  const tournamentId = parseInt(String(req.params.id));
  if (isNaN(tournamentId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId, reason } = req.body as { userId?: number; reason?: string };
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }

  const tournament = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, tournamentId) });
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
  const participant = await db.query.tournamentParticipantsTable.findFirst({
    where: (t) => sql`${t.tournamentId} = ${tournamentId} AND ${t.userId} = ${userId}`,
  });
  if (!participant) { res.status(404).json({ error: "Participant not found" }); return; }
  if (participant.diamondsWon <= 0) { res.status(400).json({ error: "No payout to revoke" }); return; }

  const revokeAmount = participant.diamondsWon;
  const rvUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId), columns: { id: true, diamondBalance: true } });
  const newBalance = Math.max(0, (rvUser?.diamondBalance ?? 0) - revokeAmount);
  const actualDeducted = (rvUser?.diamondBalance ?? 0) - newBalance;

  await db.update(usersTable).set({ diamondBalance: newBalance }).where(eq(usersTable.id, userId));
  await db.update(tournamentParticipantsTable)
    .set({ diamondsWon: 0 })
    .where(sql`${tournamentParticipantsTable.tournamentId} = ${tournamentId} AND ${tournamentParticipantsTable.userId} = ${userId}`);
  await db.insert(balanceChangeLogsTable).values({
    userId, adminId: req.user!.userId, amount: -actualDeducted,
    balanceBefore: rvUser?.diamondBalance ?? 0,
    balanceAfter: newBalance,
    reason: reason || `Payout revoked: ${tournament.title}`,
    source: "revoke_payout",
  });
  await db.insert(walletTransactionsTable).values({
    userId, type: "reversal", amount: -actualDeducted,
    label: reason || `Payout revoked: ${tournament.title}`, tournamentId,
  });
  await db.insert(notificationsTable).values({
    userId, type: "wallet", title: "Payout Revoked",
    body: `Your payout of ${revokeAmount} 💎 for ${tournament.title} has been revoked.${reason ? ` Reason: ${reason}` : ""}`,
  });
  await writeLog(userId, "revoke_payout", "tournament",
    `${tournament.title} · -${actualDeducted} 💎 revoked${reason ? ` · ${reason}` : ""}`);
  res.json({ message: "Payout revoked", userId, deducted: actualDeducted });
});

// ── REWARD CONTROLS ───────────────────────────────────────────────────────────

router.post("/admin/tournaments/:id/resend-reward", requireAdmin, async (req, res) => {
  const tournamentId = parseInt(String(req.params.id));
  if (isNaN(tournamentId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId } = req.body as { userId?: number };
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }

  const tournament = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, tournamentId) });
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
  const participant = await db.query.tournamentParticipantsTable.findFirst({
    where: (t) => sql`${t.tournamentId} = ${tournamentId} AND ${t.userId} = ${userId}`,
  });
  if (!participant) { res.status(404).json({ error: "Participant not found" }); return; }
  if (participant.diamondsWon <= 0) { res.status(400).json({ error: "No reward to resend" }); return; }

  await db.insert(notificationsTable).values({
    userId, type: "result", title: "Reward Reminder",
    body: `You earned ${participant.diamondsWon} 💎 in ${tournament.title}. Your prize is in your wallet!`,
  });
  await writeLog(userId, "resend_reward", "tournament",
    `${tournament.title} · Resent ${participant.diamondsWon} 💎 notification`);
  res.json({ message: "Reward notification resent", userId, diamondsWon: participant.diamondsWon });
});

router.post("/admin/tournaments/:id/cancel-reward", requireAdmin, async (req, res) => {
  const tournamentId = parseInt(String(req.params.id));
  if (isNaN(tournamentId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId, deductBalance = true, reason } = req.body as { userId?: number; deductBalance?: boolean; reason?: string };
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }

  const tournament = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, tournamentId) });
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
  const participant = await db.query.tournamentParticipantsTable.findFirst({
    where: (t) => sql`${t.tournamentId} = ${tournamentId} AND ${t.userId} = ${userId}`,
  });
  if (!participant) { res.status(404).json({ error: "Participant not found" }); return; }
  if (participant.diamondsWon <= 0) { res.status(400).json({ error: "No reward to cancel" }); return; }

  const cancelAmount = participant.diamondsWon;
  let deducted = 0;

  if (deductBalance) {
    const crUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId), columns: { id: true, diamondBalance: true } });
    const newBalance = Math.max(0, (crUser?.diamondBalance ?? 0) - cancelAmount);
    deducted = (crUser?.diamondBalance ?? 0) - newBalance;
    await db.update(usersTable).set({ diamondBalance: newBalance }).where(eq(usersTable.id, userId));
    await db.insert(balanceChangeLogsTable).values({
      userId, adminId: req.user!.userId, amount: -deducted,
      balanceBefore: crUser?.diamondBalance ?? 0,
      balanceAfter: newBalance,
      reason: reason || `Reward cancelled: ${tournament.title}`,
      source: "revoke_payout",
    });
    await db.insert(walletTransactionsTable).values({
      userId, type: "reversal", amount: -deducted,
      label: reason || `Reward cancelled: ${tournament.title}`, tournamentId,
    });
  }

  await db.update(tournamentParticipantsTable)
    .set({ diamondsWon: 0 })
    .where(sql`${tournamentParticipantsTable.tournamentId} = ${tournamentId} AND ${tournamentParticipantsTable.userId} = ${userId}`);

  await db.insert(notificationsTable).values({
    userId, type: "wallet", title: "Reward Cancelled",
    body: `Your reward of ${cancelAmount} 💎 for ${tournament.title} has been cancelled.${reason ? ` Reason: ${reason}` : ""}`,
  });
  await writeLog(userId, "cancel_reward", "tournament",
    `${tournament.title} · ${cancelAmount} 💎 cancelled${deductBalance ? ` · -${deducted} deducted` : " · no deduction"}${reason ? ` · ${reason}` : ""}`);
  res.json({ message: "Reward cancelled", userId, deducted });
});

router.post("/admin/tournaments/:id/schedule-reward", requireAdmin, async (req, res) => {
  const tournamentId = parseInt(String(req.params.id));
  if (isNaN(tournamentId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId, amount, scheduledFor, reason } = req.body as { userId?: number; amount?: number; scheduledFor?: string; reason?: string };
  if (!userId || !amount || amount <= 0 || !scheduledFor) {
    res.status(400).json({ error: "userId, amount, and scheduledFor required" }); return;
  }
  const tournament = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, tournamentId) });
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
  const participant = await db.query.tournamentParticipantsTable.findFirst({
    where: (t) => sql`${t.tournamentId} = ${tournamentId} AND ${t.userId} = ${userId}`,
  });
  if (!participant) { res.status(404).json({ error: "Participant not found" }); return; }

  const [sr] = await db.insert(scheduledRewardsTable).values({
    tournamentId, userId, amount,
    reason: reason || `Scheduled reward: ${tournament.title}`,
    scheduledFor: new Date(scheduledFor),
    status: "pending",
    createdByAdminId: req.user!.userId,
  }).returning();

  await writeLog(userId, "schedule_reward", "tournament",
    `${tournament.title} · +${amount} 💎 scheduled for ${new Date(scheduledFor).toLocaleString()}`);
  res.json(sr);
});

router.get("/admin/tournaments/:id/scheduled-rewards", requireAdmin, async (req, res) => {
  const tournamentId = parseInt(String(req.params.id));
  if (isNaN(tournamentId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const rows = await db.query.scheduledRewardsTable.findMany({
    where: eq(scheduledRewardsTable.tournamentId, tournamentId),
    orderBy: [asc(scheduledRewardsTable.scheduledFor)],
  });
  res.json(rows);
});

router.delete("/admin/scheduled-rewards/:scheduledId", requireAdmin, async (req, res) => {
  const scheduledId = parseInt(String(req.params.scheduledId));
  if (isNaN(scheduledId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const sr = await db.query.scheduledRewardsTable.findFirst({ where: eq(scheduledRewardsTable.id, scheduledId) });
  if (!sr) { res.status(404).json({ error: "Scheduled reward not found" }); return; }
  if (sr.status !== "pending") { res.status(409).json({ error: `Cannot cancel — status is ${sr.status}` }); return; }
  await db.update(scheduledRewardsTable).set({ status: "cancelled" }).where(eq(scheduledRewardsTable.id, scheduledId));
  res.json({ message: "Scheduled reward cancelled" });
});

router.post("/admin/tournaments/:id/bulk-reward", requireAdmin, requireFinanceAdmin, async (req, res) => {
  const tournamentId = parseInt(String(req.params.id));
  if (isNaN(tournamentId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { rewards } = req.body as { rewards?: { userId: number; amount: number; reason?: string }[] };
  if (!rewards || !Array.isArray(rewards) || rewards.length === 0) {
    res.status(400).json({ error: "rewards array required" }); return;
  }

  const tournament = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, tournamentId) });
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }

  const results: { userId: number; amount: number; success: boolean; error?: string }[] = [];

  for (const r of rewards) {
    if (!r.userId || !r.amount || r.amount <= 0) {
      results.push({ userId: r.userId, amount: r.amount, success: false, error: "Invalid entry" });
      continue;
    }
    try {
      const participant = await db.query.tournamentParticipantsTable.findFirst({
        where: (t) => sql`${t.tournamentId} = ${tournamentId} AND ${t.userId} = ${r.userId}`,
      });
      if (!participant) {
        results.push({ userId: r.userId, amount: r.amount, success: false, error: "Not a participant" });
        continue;
      }
      const brUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, r.userId), columns: { id: true, diamondBalance: true } });
      await db.update(usersTable).set({ diamondBalance: sql`diamond_balance + ${r.amount}` }).where(eq(usersTable.id, r.userId));
      await db.update(tournamentParticipantsTable)
        .set({ diamondsWon: sql`diamonds_won + ${r.amount}` })
        .where(sql`${tournamentParticipantsTable.tournamentId} = ${tournamentId} AND ${tournamentParticipantsTable.userId} = ${r.userId}`);
      await db.insert(balanceChangeLogsTable).values({
        userId: r.userId, adminId: req.user!.userId, amount: r.amount,
        balanceBefore: brUser?.diamondBalance ?? 0,
        balanceAfter: (brUser?.diamondBalance ?? 0) + r.amount,
        reason: r.reason || `Bulk reward: ${tournament.title}`,
        source: "force_payout",
      });
      await db.insert(walletTransactionsTable).values({
        userId: r.userId, type: "prize", amount: r.amount,
        label: r.reason || `${tournament.title} Prize`, tournamentId,
      });
      await db.insert(notificationsTable).values({
        userId: r.userId, type: "result", title: "Prize Credited",
        body: `+${r.amount} 💎 awarded for ${tournament.title}.${r.reason ? ` ${r.reason}` : ""}`,
      });
      pushAfter(r.userId, "result", "Prize Credited 💎", `+${r.amount} 💎 for ${tournament.title}`, "/#/wallet");
      results.push({ userId: r.userId, amount: r.amount, success: true });
    } catch (e) {
      results.push({ userId: r.userId, amount: r.amount, success: false, error: String(e) });
    }
  }

  const succeeded = results.filter(r => r.success).length;
  await writeLog(tournamentId, "bulk_reward", "tournament",
    `${tournament.title} · ${succeeded}/${rewards.length} rewards sent`);
  res.json({ message: "Bulk reward complete", succeeded, total: rewards.length, results });
});

// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/tournaments/:id/participants", requireAdmin, async (req, res) => {
  const raw = String(req.params.id);
  const isSlug = !/^\d+$/.test(raw);
  const numericId = isSlug ? NaN : parseInt(raw, 10);

  let tournament: typeof tournamentsTable.$inferSelect | undefined;
  if (isSlug) {
    tournament = await db.query.tournamentsTable.findFirst({
      where: eq(tournamentsTable.matchSlug, raw),
    });
    if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
  } else {
    tournament = await db.query.tournamentsTable.findFirst({
      where: eq(tournamentsTable.id, numericId),
    });
    if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
  }
  const id = tournament.id;

  const participants = await db
    .select({
      id: tournamentParticipantsTable.id,
      tournamentId: tournamentParticipantsTable.tournamentId,
      userId: tournamentParticipantsTable.userId,
      slotIndex: tournamentParticipantsTable.slotIndex,
      kills: tournamentParticipantsTable.kills,
      placement: tournamentParticipantsTable.placement,
      diamondsWon: tournamentParticipantsTable.diamondsWon,
      joinedAt: tournamentParticipantsTable.joinedAt,
      matchNumber: tournamentParticipantsTable.matchNumber,
      waveNumber: tournamentParticipantsTable.waveNumber,
      seatNumber: tournamentParticipantsTable.seatNumber,
      inGameName: usersTable.inGameName,
      phone: usersTable.phone,
    })
    .from(tournamentParticipantsTable)
    .leftJoin(usersTable, eq(tournamentParticipantsTable.userId, usersTable.id))
    .where(eq(tournamentParticipantsTable.tournamentId, id));

  const credViews = await db.query.tournamentCredentialViewsTable.findMany({
    where: eq(tournamentCredentialViewsTable.tournamentId, id),
  });
  const seenSet = new Set(credViews.map(v => v.userId));

  const uniqueSlots = new Set(participants.map(p => p.slotIndex));

  let timeSlots: Array<{ startTime: string; endTime: string; label: string }> = [];
  try {
    const ms = tournament.matchSettings ? JSON.parse(tournament.matchSettings) : {};
    if (Array.isArray(ms.timeSlots)) timeSlots = ms.timeSlots;
  } catch { timeSlots = []; }

  res.json({
    meta: {
      tournamentId: tournament.id,
      title: tournament.title,
      maxSlots: tournament.maxSlots,
      filledSlots: tournament.filledSlots,
      uniqueSlotCount: uniqueSlots.size,
      totalBookings: participants.length,
      timeSlots,
    },
    participants: participants.map(p => ({
      id: p.id,
      tournamentId: p.tournamentId,
      userId: p.userId,
      slotIndex: p.slotIndex,
      inGameName: p.inGameName ?? null,
      phone: p.phone ?? "",
      kills: p.kills,
      placement: p.placement ?? null,
      diamondsWon: p.diamondsWon,
      joinedAt: p.joinedAt.toISOString(),
      hasSeenCredentials: seenSet.has(p.userId),
      matchNumber: p.matchNumber ?? null,
      waveNumber: p.waveNumber ?? null,
      seatNumber: p.seatNumber ?? null,
    })),
  });
});

router.patch("/admin/tournaments/:id/participants/:userId", requireAdmin, async (req, res) => {
  const rawId = String(req.params.id);
  const isSlugId = !/^\d+$/.test(rawId);
  const userId = parseInt(String(req.params.userId), 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  let tournamentId: number;
  if (isSlugId) {
    const found = await db.query.tournamentsTable.findFirst({
      where: eq(tournamentsTable.matchSlug, rawId),
    });
    if (!found) { res.status(404).json({ error: "Tournament not found" }); return; }
    tournamentId = found.id;
  } else {
    const numericTournamentId = parseInt(rawId, 10);
    if (isNaN(numericTournamentId)) { res.status(400).json({ error: "Invalid tournament ID" }); return; }
    tournamentId = numericTournamentId;
  }

  const body = req.body as { kills?: number; placement?: number | null; diamondsWon?: number; slotIndex?: number; fromSlotIndex?: number };

  const existing = body.fromSlotIndex !== undefined
    ? await db.query.tournamentParticipantsTable.findFirst({
        where: (t) => sql`${t.tournamentId} = ${tournamentId} AND ${t.userId} = ${userId} AND ${t.slotIndex} = ${body.fromSlotIndex}`,
      })
    : await db.query.tournamentParticipantsTable.findFirst({
        where: (t) => sql`${t.tournamentId} = ${tournamentId} AND ${t.userId} = ${userId}`,
      });
  if (!existing) { res.status(404).json({ error: "Participant not found" }); return; }

  const updateData: Partial<typeof tournamentParticipantsTable.$inferInsert> = {};
  if (body.kills !== undefined) updateData.kills = body.kills;
  if ("placement" in body) updateData.placement = body.placement as number | null;
  if (body.diamondsWon !== undefined) updateData.diamondsWon = body.diamondsWon;
  if (body.slotIndex !== undefined) updateData.slotIndex = body.slotIndex;

  const [updated] = await db
    .update(tournamentParticipantsTable)
    .set(updateData)
    .where(eq(tournamentParticipantsTable.id, existing.id))
    .returning();

  // Log result_confirmed when kills/placement change
  const resultChanged = (body.kills !== undefined && body.kills !== existing.kills) ||
    ("placement" in body && body.placement !== existing.placement);
  if (resultChanged) {
    const tTitle = (await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, tournamentId) }))?.title ?? `#${tournamentId}`;
    const kills = body.kills ?? existing.kills;
    const placement = ("placement" in body ? body.placement : existing.placement) ?? null;
    await db.insert(adminLogsTable).values({
      targetId: userId, action: "result_confirmed", category: "tournament",
      details: `Match: ${tTitle} · Kills: ${kills}${placement !== null ? ` · Placement: #${placement}` : ""}`,
    });
  }

  let prizeDelta = 0;
  if (body.diamondsWon !== undefined && body.diamondsWon !== existing.diamondsWon) {
    prizeDelta = body.diamondsWon - existing.diamondsWon;
    const delta = prizeDelta;
    await db
      .update(usersTable)
      .set({ diamondBalance: sql`${usersTable.diamondBalance} + ${delta}` })
      .where(eq(usersTable.id, userId));

    if (delta !== 0) {
      const tournament = await db.query.tournamentsTable.findFirst({
        where: eq(tournamentsTable.id, tournamentId),
      });
      await db.insert(walletTransactionsTable).values({
        userId,
        type: "prize",
        amount: delta,
        label: tournament ? `${tournament.title} Prize` : "Tournament Prize",
        tournamentId,
      });

      if (delta > 0 && tournament) {
        const placement = body.placement ?? existing.placement;
        const placementText = placement === 1 ? "1st place 🏆" : placement === 2 ? "2nd place 🥈" : placement === 3 ? "3rd place 🥉" : `${placement}th place`;
        await db.insert(notificationsTable).values({
          userId,
          type: "result",
          title: "Prize Received!",
          body: `You finished in ${placementText} in "${tournament.title}" and won ${delta} diamonds!`,
        });
        // Log reward_sent
        await db.insert(adminLogsTable).values({
          targetId: userId, action: "reward_sent", category: "tournament",
          details: `Match: ${tournament.title} · +${delta} 💎 · ${placementText}`,
        });
      }
    }
  }

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });

  if (prizeDelta !== 0 && user) {
    await logBalChange({
      userId, adminId: req.user!.userId, amount: prizeDelta,
      balanceBefore: user.diamondBalance - prizeDelta,
      balanceAfter: user.diamondBalance,
      reason: prizeDelta > 0 ? `Prize distribution +${prizeDelta} 💎` : `Prize adjustment ${prizeDelta} 💎`,
      source: "prize_distribution",
    });
  }

  res.json({
    id: updated.id,
    tournamentId: updated.tournamentId,
    userId: updated.userId,
    inGameName: user?.inGameName ?? null,
    phone: user?.phone ?? "",
    kills: updated.kills,
    placement: updated.placement ?? null,
    diamondsWon: updated.diamondsWon,
    joinedAt: updated.joinedAt.toISOString(),
  });
});

router.delete("/admin/tournaments/:id/participants/:userId", requireAdmin, async (req, res) => {
  const tournamentId = parseInt(String(req.params.id));
  const userId = parseInt(String(req.params.userId));
  if (isNaN(tournamentId) || isNaN(userId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const tournament = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, tournamentId) });
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }

  const participant = await db.query.tournamentParticipantsTable.findFirst({
    where: (t) => sql`${t.tournamentId} = ${tournamentId} AND ${t.userId} = ${userId}`,
  });
  if (!participant) { res.status(404).json({ error: "Participant not found" }); return; }

  await db
    .delete(tournamentParticipantsTable)
    .where(
      sql`${tournamentParticipantsTable.tournamentId} = ${tournamentId} AND ${tournamentParticipantsTable.userId} = ${userId}`
    );

  await db
    .update(tournamentsTable)
    .set({ filledSlots: sql`GREATEST(0, ${tournamentsTable.filledSlots} - 1)` })
    .where(eq(tournamentsTable.id, tournamentId));

  if (tournament.entryFeeDiamonds > 0) {
    const kickedUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId), columns: { id: true, diamondBalance: true } });
    await db
      .update(usersTable)
      .set({ diamondBalance: sql`${usersTable.diamondBalance} + ${tournament.entryFeeDiamonds}` })
      .where(eq(usersTable.id, userId));

    await logBalChange({
      userId, adminId: req.user!.userId, amount: tournament.entryFeeDiamonds,
      balanceBefore: kickedUser?.diamondBalance ?? 0,
      balanceAfter: (kickedUser?.diamondBalance ?? 0) + tournament.entryFeeDiamonds,
      reason: `Entry fee refund: kicked from ${tournament.title}`,
      source: "kick_refund",
    });

    await db.insert(walletTransactionsTable).values({
      userId,
      type: "topup",
      amount: tournament.entryFeeDiamonds,
      label: `Refund: ${tournament.title}`,
      tournamentId,
    });

    await db.insert(notificationsTable).values({
      userId,
      type: "wallet",
      title: "Entry Fee Refunded",
      body: `Your entry fee of ${tournament.entryFeeDiamonds} diamonds for "${tournament.title}" has been refunded.`,
    });
  }

  res.json({ message: "Participant removed and entry fee refunded" });
});

router.get("/admin/users", requireAdmin, async (_req, res) => {
  // Auto-purge bin entries older than 15 days
  const cutoff = new Date(Date.now() - BIN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const expiredBinUsers = await db.query.usersTable.findMany({
    where: (u) => sql`${u.status} = 'deleted' AND ${u.deletedAt} IS NOT NULL AND ${u.deletedAt} < ${cutoff}`,
  });
  for (const u of expiredBinUsers) {
    await db.delete(tournamentParticipantsTable).where(eq(tournamentParticipantsTable.userId, u.id));
    await db.delete(walletTransactionsTable).where(eq(walletTransactionsTable.userId, u.id));
    await db.delete(notificationsTable).where(eq(notificationsTable.userId, u.id));
    await db.delete(usersTable).where(eq(usersTable.id, u.id));
  }

  const users = await db.query.usersTable.findMany({
    where: (u) => sql`${u.status} != 'deleted'`,
  });
  res.json(users.map(formatUser));
});

router.get("/admin/users/bin", requireAdmin, async (_req, res) => {
  const cutoff = new Date(Date.now() - BIN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  // Auto-purge
  const expiredBinUsers = await db.query.usersTable.findMany({
    where: (u) => sql`${u.status} = 'deleted' AND ${u.deletedAt} IS NOT NULL AND ${u.deletedAt} < ${cutoff}`,
  });
  for (const u of expiredBinUsers) {
    await db.delete(tournamentParticipantsTable).where(eq(tournamentParticipantsTable.userId, u.id));
    await db.delete(walletTransactionsTable).where(eq(walletTransactionsTable.userId, u.id));
    await db.delete(notificationsTable).where(eq(notificationsTable.userId, u.id));
    await db.delete(usersTable).where(eq(usersTable.id, u.id));
  }

  const binnedUsers = await db.query.usersTable.findMany({
    where: (u) => sql`${u.status} = 'deleted'`,
  });
  res.json(binnedUsers.map(formatUser));
});

router.patch("/admin/users/:id/diamonds", requireAdmin, requireFinanceAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { amount } = req.body as { amount?: number };
  if (amount === undefined) { res.status(400).json({ error: "Amount is required" }); return; }
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const newBalance = Math.max(0, user.diamondBalance + amount);
  const [updated] = await db.update(usersTable).set({ diamondBalance: newBalance }).where(eq(usersTable.id, id)).returning();

  if (amount !== 0) {
    await db.insert(walletTransactionsTable).values({
      userId: id,
      type: "topup",
      amount,
      label: amount > 0 ? "Admin Top-Up" : "Admin Adjustment",
    });

    await db.insert(notificationsTable).values({
      userId: id,
      type: "wallet",
      title: amount > 0 ? "Diamonds Added!" : "Diamonds Deducted",
      body: amount > 0
        ? `${amount} diamonds have been added to your wallet by Clash Zen Support.`
        : `${Math.abs(amount)} diamonds have been deducted from your wallet by Clash Zen Support.`,
    });

    await writeLog(id,
      amount > 0 ? "diamonds_added" : "diamonds_deducted",
      "wallet",
      amount > 0
        ? `+${amount} diamonds added. New balance: ${newBalance}`
        : `-${Math.abs(amount)} diamonds deducted. New balance: ${newBalance}`
    );

    await logBalChange({
      userId: id, adminId: req.user!.userId, amount,
      balanceBefore: user.diamondBalance,
      balanceAfter: newBalance,
      reason: amount > 0 ? `Admin added ${amount} diamonds` : `Admin deducted ${Math.abs(amount)} diamonds`,
      source: "admin_adjustment",
    });
  }

  res.json(formatUser(updated));
});

router.patch("/admin/users/:id/admin", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const [updated] = await db
    .update(usersTable)
    .set({ isAdmin: !user.isAdmin })
    .where(eq(usersTable.id, id))
    .returning();
  await writeLog(id, user.isAdmin ? "admin_revoked" : "admin_granted", "moderation");
  res.json(formatUser(updated));
});

router.patch("/admin/users/:id/block", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { reason, blockedUntil } = req.body as { reason?: string; blockedUntil?: string };
  if (!reason?.trim()) { res.status(400).json({ error: "Block reason is required" }); return; }

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.status === "deleted") { res.status(400).json({ error: "Cannot block a deleted user" }); return; }

  const [updated] = await db
    .update(usersTable)
    .set({
      status: "blocked",
      blockedAt: new Date(),
      blockedReason: reason.trim(),
      blockedUntil: blockedUntil ? new Date(blockedUntil) : null,
    })
    .where(eq(usersTable.id, id))
    .returning();

  await db.insert(notificationsTable).values({
    userId: id,
    type: "system",
    title: "Account Blocked",
    body: `Your account has been blocked. Reason: ${reason.trim()}${blockedUntil ? ` Until: ${new Date(blockedUntil).toLocaleDateString()}` : ""}`,
  });
  await writeLog(id, "user_blocked", "moderation",
    `Reason: ${reason.trim()}${blockedUntil ? ` | Until: ${new Date(blockedUntil).toLocaleDateString()}` : ""}`
  );

  res.json(formatUser(updated));

  // Real-time push: immediately redirect user to suspension screen on all active tabs
  pushToUser(id, "suspended", {
    suspended: true,
    status: "blocked",
    reason: reason.trim(),
    blockedUntil: blockedUntil ? new Date(blockedUntil).toISOString() : null,
  });
});

router.patch("/admin/users/:id/unblock", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [updated] = await db
    .update(usersTable)
    .set({
      status: "active",
      blockedAt: null,
      blockedReason: null,
      blockedUntil: null,
    })
    .where(eq(usersTable.id, id))
    .returning();

  await db.insert(notificationsTable).values({
    userId: id,
    type: "system",
    title: "Account Unblocked",
    body: "Your account has been unblocked. You can now log in again.",
  });
  await writeLog(id, "user_unblocked", "moderation");

  res.json(formatUser(updated));
});

router.patch("/admin/users/:id/bin", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { reason } = req.body as { reason?: string };
  if (!reason?.trim()) { res.status(400).json({ error: "Delete reason is required" }); return; }

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.status === "deleted") { res.status(400).json({ error: "User is already in the bin" }); return; }

  const [updated] = await db
    .update(usersTable)
    .set({
      status: "deleted",
      deletedAt: new Date(),
      deleteReason: reason.trim(),
    })
    .where(eq(usersTable.id, id))
    .returning();

  await writeLog(id, "user_binned", "moderation", `Reason: ${reason.trim()}`);
  res.json(formatUser(updated));

  // Real-time push: immediately redirect user to suspension screen on all active tabs
  pushToUser(id, "suspended", {
    suspended: true,
    status: "deleted",
    reason: reason.trim(),
    blockedUntil: null,
  });
});

router.patch("/admin/users/:id/restore", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  if (!user) { res.status(404).json({ error: "User not found — they may have been auto-purged. Refresh the bin list." }); return; }
  if (user.status !== "deleted") { res.status(400).json({ error: "User is not in the bin" }); return; }

  const [updated] = await db
    .update(usersTable)
    .set({ status: "active", deletedAt: null, deleteReason: null })
    .where(eq(usersTable.id, id))
    .returning();

  await db.insert(notificationsTable).values({
    userId: id,
    type: "system",
    title: "Account Restored",
    body: "Your account has been restored. You can log in again.",
  });
  await writeLog(id, "user_restored", "moderation");

  res.json(formatUser(updated));
});

/**
 * PATCH /admin/users/:id/force-logout
 * Immediately invalidates all active sessions for a user by bumping sessionVersion.
 * Any existing JWT tokens with the old sv will be rejected on next API call.
 * SSE push ensures connected tabs are kicked in real-time without waiting for heartbeat.
 */
router.patch("/admin/users/:id/force-logout", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const newSv = (user.sessionVersion ?? 1) + 1;
  await db.update(usersTable).set({ sessionVersion: newSv }).where(eq(usersTable.id, id));
  await writeLog(id, "admin_force_logout", "security",
    `All sessions invalidated by admin — sessionVersion bumped to ${newSv}`
  );

  // Real-time push: kick all active SSE connections immediately
  pushToUser(id, "force_logout", { code: "ADMIN_FORCE_LOGOUT" });

  res.json({ ok: true, sessionVersion: newSv });
});

router.patch("/admin/users/:id/restrict", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { type, action, until } = req.body as { type: string; action: "apply" | "lift"; until?: string };

  const validTypes = ["tournament_ban", "withdrawal_ban", "topup_ban", "chat_mute"];
  if (!validTypes.includes(type)) { res.status(400).json({ error: "Invalid restriction type" }); return; }
  if (!["apply", "lift"].includes(action)) { res.status(400).json({ error: "Invalid action" }); return; }

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const untilDate = until ? new Date(until) : null;
  const now = new Date();
  let updateData: Record<string, unknown> = {};
  let logAction: string;
  let logDetail: string | undefined;

  if (type === "tournament_ban") {
    if (action === "apply") {
      updateData = { tournamentBanned: true, tournamentBannedAt: now, tournamentBannedUntil: untilDate };
      logAction = "tournament_ban_applied";
      logDetail = untilDate ? `Until: ${untilDate.toLocaleDateString()}` : "Permanent";
    } else {
      updateData = { tournamentBanned: false, tournamentBannedAt: null, tournamentBannedUntil: null };
      logAction = "tournament_ban_lifted";
    }
  } else if (type === "withdrawal_ban") {
    if (action === "apply") {
      updateData = { withdrawalBanned: true, withdrawalBannedAt: now };
      logAction = "withdrawal_ban_applied";
    } else {
      updateData = { withdrawalBanned: false, withdrawalBannedAt: null };
      logAction = "withdrawal_ban_lifted";
    }
  } else if (type === "topup_ban") {
    if (action === "apply") {
      updateData = { topupBanned: true, topupBannedAt: now };
      logAction = "topup_ban_applied";
    } else {
      updateData = { topupBanned: false, topupBannedAt: null };
      logAction = "topup_ban_lifted";
    }
  } else {
    if (action === "apply") {
      updateData = { chatMuted: true, chatMutedAt: now, chatMutedUntil: untilDate };
      logAction = "chat_mute_applied";
      logDetail = untilDate ? `Until: ${untilDate.toLocaleDateString()}` : "Permanent";
    } else {
      updateData = { chatMuted: false, chatMutedAt: null, chatMutedUntil: null };
      logAction = "chat_mute_lifted";
    }
  }

  const [updated] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
  await writeLog(id, logAction, "moderation", logDetail);

  res.json(formatUser(updated));
});

router.delete("/admin/users/:id/permanent", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  // Idempotent: if already gone (auto-purged or concurrent delete), treat as success
  if (!user) { res.json({ message: "User permanently deleted" }); return; }
  if (user.status !== "deleted") { res.status(400).json({ error: "User must be in the bin before permanent deletion" }); return; }

  await db.delete(tournamentParticipantsTable).where(eq(tournamentParticipantsTable.userId, id));
  await db.delete(walletTransactionsTable).where(eq(walletTransactionsTable.userId, id));
  await db.delete(notificationsTable).where(eq(notificationsTable.userId, id));
  await writeLog(id, "user_permanently_deleted", "moderation", `Phone: ${user.phone}`);
  await db.delete(usersTable).where(eq(usersTable.id, id));

  res.json({ message: "User permanently deleted" });
});

router.get("/admin/users/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(formatUser(user));
});

router.post("/admin/users/:id/2fa/approve", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (!user.twoFaPending) { res.status(400).json({ error: "No pending 2FA request" }); return; }
  await db.update(usersTable)
    .set({ twoFaEnabled: true, twoFaPassword: user.twoFaPendingPassword, twoFaPending: false, twoFaPendingPassword: null, twoFaPendingAt: null })
    .where(eq(usersTable.id, id));
  await writeLog(id, "2fa_approved", "security");
  res.status(204).end();
});

router.post("/admin/users/:id/2fa/reject", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (!user.twoFaPending) { res.status(400).json({ error: "No pending 2FA request" }); return; }
  await db.update(usersTable)
    .set({ twoFaPending: false, twoFaPendingPassword: null, twoFaPendingAt: null })
    .where(eq(usersTable.id, id));
  await writeLog(id, "2fa_rejected", "security");
  res.status(204).end();
});

router.get("/admin/2fa/pending", requireAdmin, async (req, res) => {
  const users = await db.query.usersTable.findMany({
    where: eq(usersTable.twoFaPending, true),
    orderBy: (u, { asc }) => [asc(u.twoFaPendingAt)],
  });
  res.json(users.map(formatUser));
});

router.get("/admin/users/:id/wallet", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const txs = await db.query.walletTransactionsTable.findMany({
    where: (t) => sql`${t.userId} = ${id}`,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit: 100,
  });
  res.json(txs.map(t => ({
    id: t.id, type: t.type, amount: t.amount, label: t.label,
    tournamentId: t.tournamentId, createdAt: t.createdAt.toISOString(),
  })));
});

// ── WALLET CONTROLS ──────────────────────────────────────────────────────────

router.post("/admin/users/:id/wallet/freeze", requireAdmin, requireFinanceAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { action } = req.body as { action: "freeze" | "unfreeze" };
  if (action !== "freeze" && action !== "unfreeze") { res.status(400).json({ error: "action must be 'freeze' or 'unfreeze'" }); return; }

  const freeze = action === "freeze";
  const [updated] = await db
    .update(usersTable)
    .set({ walletFrozen: freeze, walletFrozenAt: freeze ? new Date() : null })
    .where(eq(usersTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }

  await writeLog(id, freeze ? "wallet_frozen" : "wallet_unfrozen", "wallet",
    freeze ? "Wallet frozen — all transactions blocked" : "Wallet unfrozen");
  res.json(formatUser(updated));
});

router.post("/admin/users/:id/wallet/allow-deposit-withdrawal", requireAdmin, requireFinanceAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { allow } = req.body as { allow: boolean };
  if (typeof allow !== "boolean") { res.status(400).json({ error: "allow must be a boolean" }); return; }

  const [updated] = await db
    .update(usersTable)
    .set({ allowDepositWithdrawal: allow })
    .where(eq(usersTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }

  await writeLog(id, allow ? "deposit_withdrawal_allowed" : "deposit_withdrawal_revoked", "wallet",
    allow ? "Deposit withdrawal allowed — user can withdraw top-up balance" : "Deposit withdrawal revoked");
  res.json(formatUser(updated));
});

router.post("/admin/users/:id/wallet/min-withdrawal", requireAdmin, requireFinanceAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { minWithdrawal } = req.body as { minWithdrawal: number | null };
  if (minWithdrawal !== null && (typeof minWithdrawal !== "number" || minWithdrawal < 1 || !Number.isInteger(minWithdrawal))) {
    res.status(400).json({ error: "minWithdrawal must be a positive integer or null" }); return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ minWithdrawal: minWithdrawal ?? null })
    .where(eq(usersTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }

  await writeLog(id, "min_withdrawal_updated", "wallet",
    minWithdrawal !== null
      ? `Per-user minimum withdrawal set to ₹${minWithdrawal}`
      : "Per-user minimum withdrawal cleared — using global setting");
  res.json(formatUser(updated));
});

router.post("/admin/users/:id/wallet/min-topup", requireAdmin, requireFinanceAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { minTopup } = req.body as { minTopup: number | null };
  if (minTopup !== null && (typeof minTopup !== "number" || minTopup < 1 || !Number.isInteger(minTopup))) {
    res.status(400).json({ error: "minTopup must be a positive integer or null" }); return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ minTopup: minTopup ?? null })
    .where(eq(usersTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }

  await writeLog(id, "min_topup_updated", "wallet",
    minTopup !== null
      ? `Per-user minimum top-up set to ₹${minTopup}`
      : "Per-user minimum top-up cleared — using global setting");
  res.json(formatUser(updated));
});

router.post("/admin/users/:id/wallet/hold-withdrawals", requireAdmin, requireFinanceAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { action } = req.body as { action: "hold" | "release" };
  if (action !== "hold" && action !== "release") { res.status(400).json({ error: "action must be 'hold' or 'release'" }); return; }

  const hold = action === "hold";
  const [updated] = await db
    .update(usersTable)
    .set({ withdrawalBanned: hold, withdrawalBannedAt: hold ? new Date() : null })
    .where(eq(usersTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }

  await writeLog(id, hold ? "withdrawals_held" : "withdrawals_released", "wallet",
    hold ? "Withdrawal hold placed — user cannot withdraw" : "Withdrawal hold removed");
  res.json(formatUser(updated));
});

router.post("/admin/users/:id/wallet/reverse-reward", requireAdmin, requireFinanceAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { transactionId } = req.body as { transactionId: number };
  if (!transactionId) { res.status(400).json({ error: "transactionId required" }); return; }

  const tx = await db.query.walletTransactionsTable.findFirst({
    where: (t) => sql`${t.id} = ${transactionId} AND ${t.userId} = ${id} AND ${t.type} = 'prize'`,
  });
  if (!tx) { res.status(404).json({ error: "Prize transaction not found" }); return; }
  if (tx.amount <= 0) { res.status(400).json({ error: "Transaction already reversed or is not a prize" }); return; }

  const rrUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id), columns: { id: true, diamondBalance: true } });
  await db.update(usersTable)
    .set({ diamondBalance: sql`${usersTable.diamondBalance} - ${tx.amount}` })
    .where(eq(usersTable.id, id));

  await db.insert(walletTransactionsTable).values({
    userId: id, type: "reversal", amount: -tx.amount,
    label: `Reward Reversed: ${tx.label}`, tournamentId: tx.tournamentId,
  });
  await db.insert(notificationsTable).values({
    userId: id, type: "wallet", title: "Reward Reversed",
    body: `A prize of ${tx.amount} diamonds from "${tx.label}" has been reversed by admin.`,
  });

  await writeLog(id, "reward_reversed", "wallet",
    `TX #${tx.id} · -${tx.amount} 💎 · ${tx.label}`);

  await logBalChange({
    userId: id, adminId: req.user!.userId, amount: -tx.amount,
    balanceBefore: rrUser?.diamondBalance ?? 0,
    balanceAfter: (rrUser?.diamondBalance ?? 0) - tx.amount,
    reason: `Reward reversed: ${tx.label}`,
    source: "wallet_reverse_reward",
  });

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  res.json({ newBalance: user?.diamondBalance ?? 0 });
});

router.post("/admin/users/:id/wallet/refund-entry", requireAdmin, requireFinanceAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { transactionId } = req.body as { transactionId: number };
  if (!transactionId) { res.status(400).json({ error: "transactionId required" }); return; }

  const tx = await db.query.walletTransactionsTable.findFirst({
    where: (t) => sql`${t.id} = ${transactionId} AND ${t.userId} = ${id} AND ${t.type} = 'entry'`,
  });
  if (!tx) { res.status(404).json({ error: "Entry fee transaction not found" }); return; }
  if (tx.amount >= 0) { res.status(400).json({ error: "Transaction already refunded or is not an entry fee" }); return; }

  const refundAmount = Math.abs(tx.amount);
  const reUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id), columns: { id: true, diamondBalance: true } });
  await db.update(usersTable)
    .set({ diamondBalance: sql`${usersTable.diamondBalance} + ${refundAmount}` })
    .where(eq(usersTable.id, id));

  await db.insert(walletTransactionsTable).values({
    userId: id, type: "refund", amount: refundAmount,
    label: `Entry Refund: ${tx.label}`, tournamentId: tx.tournamentId,
  });
  await db.insert(notificationsTable).values({
    userId: id, type: "wallet", title: "Entry Fee Refunded",
    body: `Your entry fee of ${refundAmount} diamonds for "${tx.label}" has been refunded.`,
  });

  await writeLog(id, "entry_refunded", "wallet",
    `TX #${tx.id} · +${refundAmount} 💎 · ${tx.label}`);

  await logBalChange({
    userId: id, adminId: req.user!.userId, amount: refundAmount,
    balanceBefore: reUser?.diamondBalance ?? 0,
    balanceAfter: (reUser?.diamondBalance ?? 0) + refundAmount,
    reason: `Entry fee refunded: ${tx.label}`,
    source: "wallet_refund_entry",
  });

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  res.json({ newBalance: user?.diamondBalance ?? 0 });
});

// ─────────────────────────────────────────────────────────────────────────────

router.post("/admin/users/:id/notify", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { title, body, type } = req.body as { title?: string; body?: string; type?: string };
  if (!title?.trim() || !body?.trim()) {
    res.status(400).json({ error: "Title and body are required" }); return;
  }
  const [notif] = await db.insert(notificationsTable).values({
    userId: id,
    type: type?.trim() || "system",
    title: title.trim(),
    body: body.trim(),
  }).returning();
  pushAfter(id, type?.trim() || "system", title.trim(), body.trim(), "/#/notifications");
  res.json({ id: notif.id, createdAt: notif.createdAt.toISOString() });
});

router.post("/admin/tournaments/:id/notify-all", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { title, body, type } = req.body as { title?: string; body?: string; type?: string };
  if (!title?.trim() || !body?.trim()) { res.status(400).json({ error: "Title and body required" }); return; }
  const tournament = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, id) });
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
  const participants = await db.query.tournamentParticipantsTable.findMany({
    where: eq(tournamentParticipantsTable.tournamentId, id),
  });
  for (const p of participants) {
    await db.insert(notificationsTable).values({
      userId: p.userId, type: type?.trim() || "tournament",
      title: title.trim(), body: body.trim(),
    });
    pushAfter(p.userId, type?.trim() || "tournament", title.trim(), body.trim(), `/#/matches/${id}`);
  }
  await writeLog(id, "notify_all", "tournament",
    `${tournament.title} · ${participants.length} players · "${title.trim()}"`);
  res.json({ message: "Notification sent", count: participants.length });
});

router.post("/admin/tournaments/:id/release-credentials", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { shareMode } = req.body as { shareMode?: string };
  const validModes = ["room_only", "ff_only", "both"];
  const mode = validModes.includes(shareMode ?? "") ? shareMode! : "both";

  const tournament = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, id) });
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
  if (!tournament.roomId) { res.status(400).json({ error: "Room ID is required before releasing credentials" }); return; }

  const [updated] = await db
    .update(tournamentsTable)
    .set({ credentialsReleased: true, credentialsReleasedAt: new Date(), credentialShareMode: mode })
    .where(eq(tournamentsTable.id, id))
    .returning();

  const participants = await db.query.tournamentParticipantsTable.findMany({
    where: eq(tournamentParticipantsTable.tournamentId, id),
  });

  const notifBody = (mode === "ff_only")
    ? `Room is open! Tap to join the match directly.`
    : (mode === "room_only")
      ? `Room ID: ${tournament.roomId}${tournament.roomPassword ? ` · Password: ${tournament.roomPassword}` : ""}`
      : tournament.roomDirectLink
        ? `Room is open! Tap to join directly.`
        : `Room ID: ${tournament.roomId}${tournament.roomPassword ? ` · Password: ${tournament.roomPassword}` : ""}`;

  for (const p of participants) {
    await db.insert(notificationsTable).values({
      userId: p.userId,
      type: "tournament",
      title: `🎮 Room Open — ${tournament.title}`,
      body: notifBody,
    });
    pushAfter(p.userId, "tournament", `🎮 Room Open — ${tournament.title}`, notifBody, `/#/matches/${id}`);
  }

  await writeLog(id, "credentials_released", "tournament",
    `${tournament.title} · mode=${mode} · ${participants.length} players notified`);

  res.json({ ...formatTournament(updated), count: participants.length });
});

router.post("/admin/tournaments/:id/unrelease-credentials", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const tournament = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, id) });
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }

  const [updated] = await db
    .update(tournamentsTable)
    .set({ credentialsReleased: false, credentialsReleasedAt: null })
    .where(eq(tournamentsTable.id, id))
    .returning();

  await writeLog(id, "credentials_unreleased", "tournament", `${tournament.title}`);
  res.json(formatTournament(updated));
});

router.get("/admin/users/:id/notifications", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const notifs = await db.query.notificationsTable.findMany({
    where: (n) => sql`${n.userId} = ${id}`,
    orderBy: (n, { desc }) => [desc(n.createdAt)],
    limit: 100,
  });
  res.json(notifs.map(n => ({
    id: n.id, type: n.type, title: n.title, body: n.body,
    read: n.read, createdAt: n.createdAt.toISOString(),
  })));
});

router.get("/admin/users/:id/tournaments", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const entries = await db
    .select({
      id: tournamentParticipantsTable.id,
      tournamentId: tournamentParticipantsTable.tournamentId,
      kills: tournamentParticipantsTable.kills,
      placement: tournamentParticipantsTable.placement,
      diamondsWon: tournamentParticipantsTable.diamondsWon,
      joinedAt: tournamentParticipantsTable.joinedAt,
      title: tournamentsTable.title,
      gameMode: tournamentsTable.gameMode,
      entryFeeDiamonds: tournamentsTable.entryFeeDiamonds,
      status: tournamentsTable.status,
      startTime: tournamentsTable.startTime,
    })
    .from(tournamentParticipantsTable)
    .leftJoin(tournamentsTable, eq(tournamentParticipantsTable.tournamentId, tournamentsTable.id))
    .where(eq(tournamentParticipantsTable.userId, id))
    .orderBy(sql`${tournamentParticipantsTable.joinedAt} DESC`);
  res.json(entries.map(e => ({
    id: e.id, tournamentId: e.tournamentId, kills: e.kills,
    placement: e.placement, diamondsWon: e.diamondsWon,
    joinedAt: e.joinedAt.toISOString(), title: e.title ?? "Unknown",
    gameMode: e.gameMode ?? "squad", entryFeeDiamonds: e.entryFeeDiamonds ?? 0,
    status: e.status ?? "completed", startTime: e.startTime?.toISOString() ?? null,
  })));
});

router.get("/admin/users/:id/logs", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [adminLogs, walletTxs, tourJoins, user] = await Promise.all([
    db.query.adminLogsTable.findMany({
      where: (l) => sql`${l.targetId} = ${String(id)} AND ${l.targetType} = 'user'`,
      orderBy: [desc(adminLogsTable.createdAt)],
      limit: 200,
    }),
    db.query.walletTransactionsTable.findMany({
      where: eq(walletTransactionsTable.userId, id),
      orderBy: [desc(walletTransactionsTable.createdAt)],
      limit: 200,
    }),
    db
      .select({
        id: tournamentParticipantsTable.id,
        joinedAt: tournamentParticipantsTable.joinedAt,
        tournamentId: tournamentParticipantsTable.tournamentId,
        title: tournamentsTable.title,
        kills: tournamentParticipantsTable.kills,
        placement: tournamentParticipantsTable.placement,
        diamondsWon: tournamentParticipantsTable.diamondsWon,
        entryFeeDiamonds: tournamentsTable.entryFeeDiamonds,
      })
      .from(tournamentParticipantsTable)
      .leftJoin(tournamentsTable, eq(tournamentParticipantsTable.tournamentId, tournamentsTable.id))
      .where(eq(tournamentParticipantsTable.userId, id))
      .orderBy(sql`${tournamentParticipantsTable.joinedAt} DESC`)
      .limit(200),
    db.query.usersTable.findFirst({ where: eq(usersTable.id, id) }),
  ]);

  type LogEntry = { id: string; action: string; category: string; details: string | null; createdAt: string };
  const entries: LogEntry[] = [];

  for (const l of adminLogs) {
    entries.push({ id: `adm-${l.id}`, action: l.action, category: l.category, details: l.details ?? null, createdAt: l.createdAt.toISOString() });
  }

  for (const tx of walletTxs) {
    const actionMap: Record<string, string> = { topup: "wallet_topup", entry: "tournament_entry", prize: "prize_received" };
    const categoryMap: Record<string, string> = { topup: "wallet", entry: "tournament", prize: "tournament" };
    const action = actionMap[tx.type] ?? "wallet_transaction";
    const category = categoryMap[tx.type] ?? "wallet";
    const sign = tx.amount > 0 ? "+" : "";
    entries.push({
      id: `tx-${tx.id}`,
      action,
      category,
      details: `${sign}${tx.amount} diamonds — ${tx.label}`,
      createdAt: tx.createdAt.toISOString(),
    });
  }

  for (const p of tourJoins) {
    const parts: string[] = [];
    if (p.title) parts.push(p.title);
    if (p.placement != null) parts.push(`Placement: #${p.placement}`);
    if (p.kills != null) parts.push(`Kills: ${p.kills}`);
    if (p.diamondsWon) parts.push(`Won: ${p.diamondsWon} diamonds`);
    entries.push({
      id: `tour-${p.id}`,
      action: "tournament_joined",
      category: "tournament",
      details: parts.join(" · ") || null,
      createdAt: p.joinedAt.toISOString(),
    });
  }

  if (user) {
    entries.push({
      id: `acc-created`,
      action: "account_created",
      category: "account",
      details: `Phone: ${user.phone}`,
      createdAt: user.createdAt.toISOString(),
    });
  }

  entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json(entries.slice(0, 300));
});

router.get("/admin/users/:id/messages", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const messages = await db.query.supportMessagesTable.findMany({
    where: eq(supportMessagesTable.userId, id),
    orderBy: [asc(supportMessagesTable.createdAt)],
    limit: 200,
  });
  await db
    .update(supportMessagesTable)
    .set({ readByAdmin: true })
    .where(and(eq(supportMessagesTable.userId, id), eq(supportMessagesTable.isFromAdmin, false)));
  res.json(messages.map(m => ({
    id: m.id,
    message: m.message,
    isFromAdmin: m.isFromAdmin,
    readByUser: m.readByUser,
    createdAt: m.createdAt.toISOString(),
  })));
});

router.post("/admin/users/:id/messages", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { message } = req.body as { message?: string };
  if (!message?.trim()) { res.status(400).json({ error: "Message is required" }); return; }
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const [msg] = await db
    .insert(supportMessagesTable)
    .values({ userId: id, message: message.trim(), isFromAdmin: true, readByAdmin: true })
    .returning();
  const payload = {
    id: msg.id,
    message: msg.message,
    isFromAdmin: true,
    readByUser: false,
    createdAt: msg.createdAt.toISOString(),
  };
  // Push real-time to the user's SSE stream
  pushToUser(id, "chat_message", payload);
  res.json(payload);
});

// ── Admin chat SSE (real-time user messages + typing for admin) ───────────────

router.get("/admin/support/:id/chat-sse", (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).end(); return; }
  const tokenParam = req.query.token as string;
  let authorized = false;
  if (tokenParam) {
    try {
      const p = jwt.verify(tokenParam, getSuperSecret()) as { type?: string };
      authorized = p?.type === "super_admin";
    } catch { /* invalid token */ }
  }
  if (!authorized) { res.status(401).end(); return; }

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(`event: connected\ndata: {}\n\n`);

  subscribeAdminChat(id, res);
  markAdminOnline(id);
  pushToUser(id, "support_presence", { online: true });

  req.on("close", () => {
    unsubscribeAdminChat(id, res);
    markAdminOffline(id);
    pushToUser(id, "support_presence", { online: false, lastActive: new Date().toISOString() });
  });
});

router.post("/admin/support/:id/typing", requireAdmin, (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { typing } = req.body as { typing?: boolean };
  pushToUser(id, "support_typing", { typing: !!typing });
  res.sendStatus(204);
});

router.get("/admin/withdrawals", requireAdmin, async (req, res) => {
  const { status } = req.query as { status?: string };
  const rows = await db
    .select({
      id: withdrawalRequestsTable.id,
      userId: withdrawalRequestsTable.userId,
      rupees: withdrawalRequestsTable.rupees,
      diamondsRedeemed: withdrawalRequestsTable.diamondsRedeemed,
      upiId: withdrawalRequestsTable.upiId,
      status: withdrawalRequestsTable.status,
      rejectedReason: withdrawalRequestsTable.rejectedReason,
      createdAt: withdrawalRequestsTable.createdAt,
      paidAt: withdrawalRequestsTable.paidAt,
      rejectedAt: withdrawalRequestsTable.rejectedAt,
      phone: usersTable.phone,
      inGameName: usersTable.inGameName,
    })
    .from(withdrawalRequestsTable)
    .leftJoin(usersTable, eq(withdrawalRequestsTable.userId, usersTable.id))
    .orderBy(desc(withdrawalRequestsTable.createdAt))
    .limit(200);
  const filtered = status ? rows.filter(r => r.status === status) : rows;
  res.json(filtered.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    paidAt: r.paidAt?.toISOString() ?? null,
    rejectedAt: r.rejectedAt?.toISOString() ?? null,
  })));
});

router.get("/admin/users/:id/withdrawals", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const rows = await db.query.withdrawalRequestsTable.findMany({
    where: eq(withdrawalRequestsTable.userId, id),
    orderBy: [desc(withdrawalRequestsTable.createdAt)],
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

router.patch("/admin/withdrawals/:id/pay", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [wd] = await db.update(withdrawalRequestsTable)
    .set({ status: "paid", paidAt: new Date() })
    .where(and(eq(withdrawalRequestsTable.id, id), eq(withdrawalRequestsTable.status, "pending")))
    .returning();
  if (!wd) { res.status(404).json({ error: "Withdrawal not found or already processed" }); return; }
  await db.insert(notificationsTable).values({
    userId: wd.userId, type: "wallet", title: "Withdrawal Approved 🎉",
    body: `Great news! Your withdrawal of ₹${wd.rupees} has been approved. The amount will be credited to your UPI ID (${wd.upiId}) shortly. If you don't receive it, please contact support.`,
  });
  res.json({ id: wd.id, status: "paid", paidAt: wd.paidAt?.toISOString() });
});

router.patch("/admin/withdrawals/:id/reject", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { reason } = req.body as { reason?: string };
  const [wd] = await db.update(withdrawalRequestsTable)
    .set({ status: "rejected", rejectedAt: new Date(), rejectedReason: reason?.trim() || "No reason provided" })
    .where(and(eq(withdrawalRequestsTable.id, id), eq(withdrawalRequestsTable.status, "pending")))
    .returning();
  if (!wd) { res.status(404).json({ error: "Withdrawal not found or already processed" }); return; }
  const wdUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, wd.userId), columns: { id: true, diamondBalance: true } });
  await db.update(usersTable)
    .set({ diamondBalance: sql`diamond_balance + ${wd.diamondsRedeemed}` })
    .where(eq(usersTable.id, wd.userId));
  await db.insert(balanceChangeLogsTable).values({
    userId: wd.userId, adminId: req.user!.userId, amount: wd.diamondsRedeemed,
    balanceBefore: wdUser?.diamondBalance ?? 0,
    balanceAfter: (wdUser?.diamondBalance ?? 0) + wd.diamondsRedeemed,
    reason: `Withdrawal rejected — refund ₹${wd.rupees}`,
    source: "withdrawal_reject_refund",
  });
  await db.insert(walletTransactionsTable).values({
    userId: wd.userId, type: "withdraw_refund", amount: wd.diamondsRedeemed,
    label: `Withdrawal refund ₹${wd.rupees} — Rejected`,
  });
  await db.insert(notificationsTable).values({
    userId: wd.userId, type: "wallet", title: "Withdrawal Rejected",
    body: `Your withdrawal of ₹${wd.rupees} was rejected. ${wd.rejectedReason}. ${wd.diamondsRedeemed} diamonds have been refunded.`,
  });
  res.json({ id: wd.id, status: "rejected" });
});

router.get("/admin/users/:id/balance-log", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const logs = await db.query.balanceChangeLogsTable.findMany({
    where: (l) => sql`${l.userId} = ${id}`,
    orderBy: (l) => [desc(l.createdAt)],
  });
  res.json(logs.map(l => ({
    id: l.id,
    adminId: l.adminId,
    amount: l.amount,
    balanceBefore: l.balanceBefore,
    balanceAfter: l.balanceAfter,
    reason: l.reason,
    source: l.source,
    createdAt: l.createdAt.toISOString(),
  })));
});

router.get("/admin/users/:id/devices", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const sessions = await db.query.deviceSessionsTable.findMany({
    where: eq(deviceSessionsTable.userId, id),
    orderBy: [desc(deviceSessionsTable.lastSeenAt)],
  });

  res.json(sessions.map(s => ({
    id: s.id,
    ip: s.ip,
    userAgent: s.userAgent,
    fingerprint: s.fingerprint,
    deviceId: s.deviceId,
    isEmulator: s.isEmulator,
    emulatorSignals: s.emulatorSignals,
    androidVersion: s.androidVersion,
    deviceType: s.deviceType,
    appVersion: s.appVersion,
    networkType: s.networkType,
    country: s.country,
    region: s.region,
    language: s.language,
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
  })));
});

router.get("/admin/fingerprint/:fp/accounts", requireAdmin, async (req, res) => {
  const fp = req.params.fp;
  const sessions = await db.query.deviceSessionsTable.findMany({
    where: eq(deviceSessionsTable.fingerprint, fp),
  });

  const userIds = [...new Set(sessions.map(s => s.userId))];
  const users = await Promise.all(
    userIds.map(uid => db.query.usersTable.findFirst({ where: eq(usersTable.id, uid) }))
  );

  res.json(
    users
      .filter(Boolean)
      .map(u => ({
        id: u!.id,
        phone: u!.phone,
        inGameName: u!.inGameName,
        status: u!.status,
        createdAt: u!.createdAt.toISOString(),
      }))
  );
});

// ── Reports / Disputes ─────────────────────────────────────────────────────────
router.get("/admin/reports", requireAdmin, async (req, res) => {
  const { status } = req.query as { status?: string };
  const reports = await db.query.reportsTable.findMany({
    orderBy: [desc(reportsTable.createdAt)],
  });
  const filtered = status && status !== "all" ? reports.filter(r => r.status === status) : reports;

  const userIds = [...new Set([
    ...filtered.map(r => r.reporterId),
    ...filtered.map(r => r.accusedId).filter(Boolean) as number[],
  ])];
  const users = userIds.length > 0
    ? await db.query.usersTable.findMany({ where: (u) => sql`${u.id} = ANY(${sql.raw(`ARRAY[${userIds.join(",")}]`)}::int[])` })
    : [];
  const userMap = Object.fromEntries(users.map(u => [u.id, { id: u.id, inGameName: u.inGameName, phone: u.phone }]));

  const enriched = await Promise.all(filtered.map(async r => {
    const prevDisputes = r.accusedId
      ? (await db.query.reportsTable.findMany({ where: eq(reportsTable.accusedId, r.accusedId!) })).length - 1
      : 0;
    return {
      id: r.id,
      category: r.category,
      evidence: r.evidence,
      status: r.status,
      adminNotes: r.adminNotes,
      tournamentId: r.tournamentId,
      accusedName: r.accusedName,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      reporter: userMap[r.reporterId] ?? { id: r.reporterId, inGameName: null, phone: "?" },
      accused: r.accusedId ? (userMap[r.accusedId] ?? null) : null,
      previousDisputeCount: Math.max(0, prevDisputes),
    };
  }));
  res.json(enriched);
});

router.patch("/admin/reports/:id/status", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { status, adminNotes } = req.body as { status?: string; adminNotes?: string };
  const allowed = ["pending", "resolved", "rejected", "penalized"];
  if (!status || !allowed.includes(status)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  const [updated] = await db.update(reportsTable)
    .set({ status, adminNotes: adminNotes ?? null, updatedAt: new Date() })
    .where(eq(reportsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Report not found" }); return; }
  await writeLog(id, "report_status_update", "moderation", `Status → ${status}`);
  res.json({ id: updated.id, status: updated.status });
});

router.get("/admin/feedback", requireAdmin, async (_req, res) => {
  const items = await db.query.feedbackTable.findMany({
    orderBy: [desc(feedbackTable.createdAt)],
    limit: 200,
  });
  const userIds = [...new Set(items.map(f => f.userId).filter(Boolean))] as number[];
  const users = userIds.length > 0
    ? await db.query.usersTable.findMany({ where: (u) => sql`${u.id} = ANY(${sql.raw(`ARRAY[${userIds.join(",")}]`)}::int[])` })
    : [];
  const userMap = Object.fromEntries(users.map(u => [u.id, { id: u.id, inGameName: u.inGameName, phone: u.phone }]));
  res.json(items.map(f => ({
    id: f.id, type: f.type, message: f.message,
    createdAt: f.createdAt.toISOString(),
    user: f.userId ? (userMap[f.userId] ?? null) : null,
  })));
});

router.get("/admin/logs", requireAdmin, async (req, res) => {
  const category = String(req.query.category ?? "all");
  const search   = String(req.query.search ?? "").trim().toLowerCase();
  const limit    = Math.min(parseInt(String(req.query.limit ?? "200")), 500);

  let logs = await db.query.adminLogsTable.findMany({
    orderBy: [desc(adminLogsTable.createdAt)],
    limit: 500,
  });

  if (category !== "all") {
    logs = logs.filter(l => l.category === category);
  }
  if (search) {
    logs = logs.filter(l =>
      l.action.toLowerCase().includes(search) ||
      (l.details ?? "").toLowerCase().includes(search) ||
      (l.targetId ?? "").toLowerCase().includes(search)
    );
  }

  res.json(logs.slice(0, limit).map(l => ({
    id:         l.id,
    action:     l.action,
    category:   l.category,
    details:    l.details ?? null,
    targetId:   l.targetId ?? null,
    targetType: l.targetType ?? null,
    createdAt:  l.createdAt.toISOString(),
  })));
});

router.get("/admin/stats", requireAdmin, async (_req, res) => {
  const allTournaments = await db.query.tournamentsTable.findMany();
  const allUsers = await db.query.usersTable.findMany({
    where: (u) => sql`${u.status} != 'deleted'`,
  });
  const allParticipants = await db.query.tournamentParticipantsTable.findMany();

  const totalDiamondsInCirculation = allUsers.reduce((s, u) => s + u.diamondBalance, 0);
  const totalEntryFeesCollected = allTournaments.reduce(
    (s, t) => s + t.filledSlots * t.entryFeeDiamonds,
    0
  );
  const totalPrizesDistributed = allParticipants.reduce((s, p) => s + p.diamondsWon, 0);

  res.json({
    totalUsers: allUsers.length,
    totalTournaments: allTournaments.length,
    activeTournaments: allTournaments.filter(t => t.status === "ongoing").length,
    upcomingTournaments: allTournaments.filter(t => t.status === "upcoming").length,
    completedTournaments: allTournaments.filter(t => t.status === "completed").length,
    totalDiamondsInCirculation,
    totalEntryFeesCollected,
    totalPrizesDistributed,
  });
});

// ── GET /admin/support-settings ──────────────────────────────────────────
router.get("/admin/support-settings", requireAdmin, (_req, res) => {
  res.json(getSupportSettings());
});

// ── PUT /admin/support-settings ──────────────────────────────────────────
router.put("/admin/support-settings", requireAdmin, (req, res) => {
  const { whatsappNumber, email, availableHours } = req.body as {
    whatsappNumber?: string; email?: string; availableHours?: string;
  };
  const updated = saveSupportSettings({
    ...(whatsappNumber !== undefined && { whatsappNumber: whatsappNumber.trim() }),
    ...(email !== undefined && { email: email.trim() }),
    ...(availableHours !== undefined && { availableHours: availableHours.trim() }),
  });
  res.json(updated);
});

// ── GET /admin/system-settings ────────────────────────────────────────────────
router.get("/admin/system-settings", requireAdmin, (_req, res) => {
  const s = getSystemSettings();
  // Mask the key — only return whether it's set and last 4 chars
  const key = s.freefireApiKey;
  res.json({
    freefireApiKeySet: !!key,
    freefireApiKeyPreview: key ? `••••••••${key.slice(-4)}` : "",
  });
});

// ── PUT /admin/system-settings ────────────────────────────────────────────────
router.put("/admin/system-settings", requireAdmin, (req, res) => {
  const { freefireApiKey } = req.body as { freefireApiKey?: string };
  const updated = saveSystemSettings({
    ...(freefireApiKey !== undefined && { freefireApiKey: freefireApiKey.trim() }),
  });
  const key = updated.freefireApiKey;
  res.json({
    freefireApiKeySet: !!key,
    freefireApiKeyPreview: key ? `••••••••${key.slice(-4)}` : "",
  });
});

// ── Allow 2FA Withdrawal (bypass 24h block) ──────────────────────────────────

router.post("/admin/users/:id/allow-2fa-withdrawal", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }
  const [updated] = await db.update(usersTable)
    .set({ twoFaWithdrawalBypass: true })
    .where(eq(usersTable.id, userId))
    .returning();
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  await writeLog(userId, "2fa_withdrawal_bypass_granted", "security", "Admin bypassed 24h withdrawal block after passcode change");
  res.json({ ok: true });
});

// ── Allow Name Change ────────────────────────────────────────────────────────

router.post("/admin/users/:id/allow-name-change", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }
  const [updated] = await db.update(usersTable)
    .set({ nameChangeAllowed: true })
    .where(eq(usersTable.id, userId))
    .returning();
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  await writeLog(userId, "name_change_allowed_by_admin", "account", "Admin bypassed 12-day name change cooldown");
  res.json({ ok: true, nameChangeAllowed: true });
});

// ── Achievements ────────────────────────────────────────────────────────────

router.get("/admin/users/:id/achievements", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }
  const rows = await db.select().from(achievementsTable).where(eq(achievementsTable.userId, userId)).orderBy(desc(achievementsTable.createdAt));
  res.json(rows.map(r => ({
    id: r.id, userId: r.userId, icon: r.icon, bgColor: r.bgColor,
    title: r.title, subtitle: r.subtitle, description: r.description,
    isUnlocked: r.isUnlocked, createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/admin/users/:id/achievements", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }
  const { icon, bgColor, title, subtitle, description, isUnlocked } = req.body as {
    icon?: string; bgColor?: string; title?: string; subtitle?: string; description?: string; isUnlocked?: boolean;
  };
  if (!title?.trim()) { res.status(400).json({ error: "Title is required" }); return; }
  const [row] = await db.insert(achievementsTable).values({
    userId,
    icon: icon?.trim() || "🏆",
    bgColor: bgColor?.trim() || "#f59e0b",
    title: title.trim(),
    subtitle: subtitle?.trim() || "",
    description: description?.trim() || "",
    isUnlocked: isUnlocked === true,
  }).returning();
  res.json({
    id: row.id, userId: row.userId, icon: row.icon, bgColor: row.bgColor,
    title: row.title, subtitle: row.subtitle, description: row.description,
    isUnlocked: row.isUnlocked, createdAt: row.createdAt.toISOString(),
  });
});

router.put("/admin/achievements/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { icon, bgColor, title, subtitle, description, isUnlocked } = req.body as {
    icon?: string; bgColor?: string; title?: string; subtitle?: string; description?: string; isUnlocked?: boolean;
  };
  if (!title?.trim()) { res.status(400).json({ error: "Title is required" }); return; }
  const [row] = await db.update(achievementsTable).set({
    icon: icon?.trim() || "🏆",
    bgColor: bgColor?.trim() || "#f59e0b",
    title: title.trim(),
    subtitle: subtitle?.trim() || "",
    description: description?.trim() || "",
    isUnlocked: isUnlocked === true,
    updatedAt: new Date(),
  }).where(eq(achievementsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({
    id: row.id, userId: row.userId, icon: row.icon, bgColor: row.bgColor,
    title: row.title, subtitle: row.subtitle, description: row.description,
    isUnlocked: row.isUnlocked, createdAt: row.createdAt.toISOString(),
  });
});

router.delete("/admin/achievements/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(achievementsTable).where(eq(achievementsTable.id, id));
  res.json({ ok: true });
});

// ── Push notification admin endpoints ────────────────────────────────────────

router.get("/admin/push/stats", requireAdmin, async (_req, res) => {
  const result = await db.execute(
    sql`SELECT COUNT(*)::int AS total_subs, COUNT(DISTINCT user_id)::int AS subscribed_users FROM push_subscriptions`,
  );
  const row = (result as any).rows?.[0] ?? {};
  res.json({
    totalSubscriptions: Number(row.total_subs ?? 0),
    subscribedUsers: Number(row.subscribed_users ?? 0),
  });
});

router.post("/admin/push/send", requireAdmin, async (req, res) => {
  const { target, userId, title, body, type = "system", url = "/#/notifications" } = req.body as {
    target: "all" | "user";
    userId?: number;
    title: string;
    body: string;
    type?: string;
    url?: string;
  };

  if (!title?.trim() || !body?.trim()) {
    res.status(400).json({ error: "title and body are required" });
    return;
  }

  if (target === "user") {
    if (!userId) { res.status(400).json({ error: "userId required for target 'user'" }); return; }
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
      columns: { id: true, status: true },
    });
    if (!user || user.status === "deleted") { res.status(404).json({ error: "User not found" }); return; }

    await db.insert(notificationsTable).values({ userId, type, title, body });
    sendPushToUser(userId, { title, body, type, url }).catch(() => {});
    await db.insert(adminLogsTable).values({
      action: "admin_push_user",
      category: "system",
      details: JSON.stringify({ userId, title, body, type }),
      targetId: String(userId),
      targetType: "user",
    });
    res.json({ ok: true, sent: 1, failed: 0, inApp: 1 });
    return;
  }

  // Broadcast to all push subscribers
  const { sent, failed } = await sendPushToAll({ title, body, type, url });

  // Save in-app notification for every active user
  const activeUsers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.status, "active"));

  const CHUNK = 500;
  for (let i = 0; i < activeUsers.length; i += CHUNK) {
    const chunk = activeUsers.slice(i, i + CHUNK);
    await db.insert(notificationsTable).values(chunk.map(u => ({ userId: u.id, type, title, body })));
  }

  await db.insert(adminLogsTable).values({
    action: "admin_push_broadcast",
    category: "system",
    details: JSON.stringify({ title, body, type, url, sent, failed, inApp: activeUsers.length }),
    targetId: null,
    targetType: "broadcast",
  });

  res.json({ ok: true, sent, failed, inApp: activeUsers.length });
});

// ── Trust Score ───────────────────────────────────────────────────────────────
router.get("/admin/users/:id/trust-score", requireAdmin, async (req, res) => {
  const userId = parseInt(String(req.params.id));
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [user, unresolvedFlags, recentParticipations, recentWithdrawals] = await Promise.all([
    db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
      columns: {
        id: true, createdAt: true, isAdmin: true, adminRole: true,
        tournamentBanned: true, withdrawalBanned: true, walletFrozen: true,
        topupBanned: true, chatMuted: true, status: true,
      },
    }),
    db.query.securityFlagsTable.findMany({
      where: and(eq(securityFlagsTable.userId, userId), sql`${securityFlagsTable.resolved} = false`),
    }),
    db.query.tournamentParticipantsTable.findMany({
      where: and(
        eq(tournamentParticipantsTable.userId, userId),
        gte(tournamentParticipantsTable.createdAt, sevenDaysAgo),
      ),
    }),
    db.query.withdrawalRequestsTable.findMany({
      where: and(eq(withdrawalRequestsTable.userId, userId), gte(withdrawalRequestsTable.createdAt, dayAgo)),
    }),
  ]);

  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  let score = 100;
  const factors: { factor: string; impact: number; detail: string }[] = [];

  // Account age
  const ageDays = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 1) {
    score -= 30;
    factors.push({ factor: "very_new_account", impact: -30, detail: "Account created less than 24 hours ago" });
  } else if (ageDays < 7) {
    score -= 15;
    factors.push({ factor: "new_account", impact: -15, detail: `Account is ${Math.floor(ageDays)} day(s) old` });
  }

  // Security flags by severity
  const criticalFlags = unresolvedFlags.filter(f => f.severity === "critical");
  const highFlags = unresolvedFlags.filter(f => f.severity === "high");
  const mediumFlags = unresolvedFlags.filter(f => f.severity === "medium");

  if (criticalFlags.length > 0) {
    const impact = Math.min(50, criticalFlags.length * 25);
    score -= impact;
    factors.push({ factor: "critical_security_flags", impact: -impact, detail: `${criticalFlags.length} unresolved critical flag(s): ${criticalFlags.map(f => f.type).join(", ")}` });
  }
  if (highFlags.length > 0) {
    const impact = Math.min(30, highFlags.length * 15);
    score -= impact;
    factors.push({ factor: "high_security_flags", impact: -impact, detail: `${highFlags.length} unresolved high-severity flag(s): ${highFlags.map(f => f.type).join(", ")}` });
  }
  if (mediumFlags.length > 0) {
    const impact = Math.min(10, mediumFlags.length * 5);
    score -= impact;
    factors.push({ factor: "medium_security_flags", impact: -impact, detail: `${mediumFlags.length} unresolved medium flag(s)` });
  }

  // Emulator detected
  if (unresolvedFlags.some(f => f.type === "emulator_usage")) {
    score -= 20;
    factors.push({ factor: "emulator_usage", impact: -20, detail: "Emulator usage detected on this account" });
  }

  // Multi-account linkage
  if (unresolvedFlags.some(f => f.type === "multi_account")) {
    score -= 30;
    factors.push({ factor: "multi_account", impact: -30, detail: "Multi-account behavior detected (shared device or IP)" });
  }

  // Win pattern anomaly (7-day window)
  const firstPlaces = recentParticipations.filter(p => p.placement === 1).length;
  const totalDiamondsWon = recentParticipations.reduce((sum, p) => sum + (p.diamondsWon ?? 0), 0);
  if (firstPlaces >= 5) {
    score -= 25;
    factors.push({ factor: "suspicious_win_pattern", impact: -25, detail: `${firstPlaces} first-place finishes in the last 7 days` });
  }
  if (totalDiamondsWon >= 2000) {
    score -= 10;
    factors.push({ factor: "high_prize_volume", impact: -10, detail: `${totalDiamondsWon} diamonds won in the last 7 days` });
  }

  // Active restrictions
  if (user.withdrawalBanned) { score -= 15; factors.push({ factor: "withdrawal_banned", impact: -15, detail: "Withdrawal ban is currently active" }); }
  if (user.walletFrozen) { score -= 15; factors.push({ factor: "wallet_frozen", impact: -15, detail: "Wallet is currently frozen" }); }
  if (user.tournamentBanned) { score -= 10; factors.push({ factor: "tournament_banned", impact: -10, detail: "Tournament ban is currently active" }); }
  if (user.topupBanned) { score -= 5; factors.push({ factor: "topup_banned", impact: -5, detail: "Top-up ban is currently active" }); }

  // Rapid withdrawals in last 24h
  if (recentWithdrawals.length >= 3) {
    score -= 10;
    factors.push({ factor: "rapid_withdrawals", impact: -10, detail: `${recentWithdrawals.length} withdrawal request(s) in the last 24 hours` });
  }

  score = Math.max(0, Math.min(100, score));
  const riskLevel: "low" | "medium" | "high" | "critical" =
    score >= 80 ? "low" : score >= 60 ? "medium" : score >= 40 ? "high" : "critical";

  res.json({
    userId,
    score,
    riskLevel,
    factors,
    summary: {
      unresolvedFlags: unresolvedFlags.length,
      accountAgeDays: Math.floor(ageDays),
      recentFirstPlaces: firstPlaces,
      recentDiamondsWon: totalDiamondsWon,
      withdrawalsLast24h: recentWithdrawals.length,
    },
  });
});

// ── Fraud Monitoring Analytics ────────────────────────────────────────────────
router.get("/admin/analytics/fraud", requireAdmin, async (_req, res) => {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [suspiciousWinners, flaggedUsers, ipClusters, riskyWithdrawals, fingerprintClusters] =
    await Promise.all([

      // Users with 3+ first-place finishes in the last 7 days
      db.execute(sql`
        SELECT
          tp.user_id                                    AS "userId",
          u.in_game_name                                AS "inGameName",
          u.platform_id                                 AS "platformId",
          COUNT(*)::int                                 AS "firstPlaceCount",
          SUM(tp.diamonds_won)::int                     AS "totalDiamondsWon"
        FROM tournament_participants tp
        JOIN users u ON u.id = tp.user_id
        WHERE tp.placement = 1
          AND tp.created_at >= ${sevenDaysAgo}
        GROUP BY tp.user_id, u.in_game_name, u.platform_id
        HAVING COUNT(*) >= 3
        ORDER BY "firstPlaceCount" DESC
        LIMIT 20
      `),

      // Users with unresolved high/critical security flags
      db.execute(sql`
        SELECT
          sf.user_id                                    AS "userId",
          u.in_game_name                                AS "inGameName",
          u.platform_id                                 AS "platformId",
          COUNT(sf.id)::int                             AS "flagCount",
          MAX(sf.severity)                              AS "worstSeverity",
          ARRAY_AGG(DISTINCT sf.type)                   AS "flagTypes"
        FROM security_flags sf
        JOIN users u ON u.id = sf.user_id
        WHERE sf.resolved = false
          AND sf.severity IN ('high', 'critical')
        GROUP BY sf.user_id, u.in_game_name, u.platform_id
        ORDER BY "flagCount" DESC
        LIMIT 20
      `),

      // IP addresses used by 3+ distinct accounts in the last 7 days
      db.execute(sql`
        SELECT
          lh.ip,
          COUNT(DISTINCT lh.user_id)::int               AS "accountCount",
          ARRAY_AGG(DISTINCT lh.user_id)                AS "userIds"
        FROM login_history lh
        WHERE lh.created_at >= ${sevenDaysAgo}
          AND lh.ip IS NOT NULL
        GROUP BY lh.ip
        HAVING COUNT(DISTINCT lh.user_id) >= 3
        ORDER BY "accountCount" DESC
        LIMIT 15
      `),

      // Pending withdrawals from users who also have unresolved security flags
      db.execute(sql`
        SELECT
          wr.id                                         AS "requestId",
          wr.user_id                                    AS "userId",
          u.in_game_name                                AS "inGameName",
          wr.rupees,
          wr.upi_id                                     AS "upiId",
          wr.status,
          wr.created_at                                 AS "createdAt",
          COUNT(sf.id)::int                             AS "activeFlagCount"
        FROM withdrawal_requests wr
        JOIN users u ON u.id = wr.user_id
        LEFT JOIN security_flags sf
          ON sf.user_id = wr.user_id AND sf.resolved = false
        WHERE wr.status = 'pending'
        GROUP BY wr.id, wr.user_id, u.in_game_name, wr.rupees, wr.upi_id, wr.status, wr.created_at
        HAVING COUNT(sf.id) > 0
        ORDER BY wr.created_at DESC
        LIMIT 15
      `),

      // Device fingerprints shared by 2+ distinct accounts (multi-account signals)
      db.execute(sql`
        SELECT
          ds.fingerprint,
          COUNT(DISTINCT ds.user_id)::int               AS "accountCount",
          ARRAY_AGG(DISTINCT ds.user_id)                AS "userIds"
        FROM device_sessions ds
        WHERE ds.fingerprint IS NOT NULL
        GROUP BY ds.fingerprint
        HAVING COUNT(DISTINCT ds.user_id) >= 2
        ORDER BY "accountCount" DESC
        LIMIT 15
      `),
    ]);

  res.json({
    generatedAt: now.toISOString(),
    suspiciousWinners: (suspiciousWinners as any).rows ?? [],
    flaggedUsers: (flaggedUsers as any).rows ?? [],
    ipClusters: (ipClusters as any).rows ?? [],
    riskyWithdrawals: (riskyWithdrawals as any).rows ?? [],
    fingerprintClusters: (fingerprintClusters as any).rows ?? [],
  });
});

// ── Login History ──────────────────────────────────────────────────────────────
router.get("/admin/users/:id/login-history", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const rows = await db.query.loginHistoryTable.findMany({
    where: eq(loginHistoryTable.userId, id),
    orderBy: [desc(loginHistoryTable.createdAt)],
    limit: 100,
  });

  res.json(rows.map(r => ({
    id: r.id,
    ip: r.ip,
    userAgent: r.userAgent,
    deviceId: r.deviceId,
    fingerprint: r.fingerprint,
    method: r.method,
    isNewUser: r.isNewUser,
    country: r.country,
    region: r.region,
    createdAt: r.createdAt.toISOString(),
  })));
});

// ── Data Export / Import (All-in-one) ─────────────────────────────────────────

// Export everything as a single JSON backup file
router.get("/admin/export/all", requireAdmin, async (_req, res) => {
  const [users, tournaments, participants, transactions, logs] = await Promise.all([
    db.select().from(usersTable).orderBy(asc(usersTable.id)),
    db.select().from(tournamentsTable).orderBy(desc(tournamentsTable.startTime)),
    db.select().from(tournamentParticipantsTable).orderBy(asc(tournamentParticipantsTable.id)),
    db.select().from(walletTransactionsTable).orderBy(desc(walletTransactionsTable.createdAt)).limit(50000),
    db.select().from(adminLogsTable).orderBy(desc(adminLogsTable.createdAt)).limit(10000),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    counts: {
      users: users.length,
      tournaments: tournaments.length,
      participants: participants.length,
      transactions: transactions.length,
      adminLogs: logs.length,
    },
    users: users.map(u => ({
      id: u.id,
      platformId: u.platformId,
      phone: u.phone,
      inGameName: u.inGameName,
      uid: u.uid,
      diamondBalance: u.diamondBalance,
      isAdmin: u.isAdmin,
      status: u.status,
      createdAt: u.createdAt,
    })),
    tournaments: tournaments.map(t => ({
      id: t.id,
      title: t.title,
      gameMode: t.gameMode,
      entryFeeDiamonds: t.entryFeeDiamonds,
      prizePoolDiamonds: t.prizePoolDiamonds,
      maxSlots: t.maxSlots,
      startTime: t.startTime,
      status: t.status,
      roomId: t.roomId,
      roomPassword: t.roomPassword,
      createdAt: t.createdAt,
    })),
    participants: participants.map(p => ({
      id: p.id,
      tournamentId: p.tournamentId,
      userId: p.userId,
      slot: p.slot,
      kills: p.kills,
      placement: p.placement,
      prizeAwarded: p.prizeAwarded,
      joinedAt: p.joinedAt,
    })),
    transactions: transactions.map(t => ({
      id: t.id,
      userId: t.userId,
      type: t.type,
      amount: t.amount,
      description: t.description,
      createdAt: t.createdAt,
    })),
    adminLogs: logs.map(l => ({
      id: l.id,
      action: l.action,
      category: l.category,
      targetId: l.targetId,
      targetType: l.targetType,
      details: l.details,
      createdAt: l.createdAt,
    })),
  };

  const filename = `clashzen-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.json(payload);
});

// Import from a backup JSON — updates existing users and tournaments by id/phone
router.post("/admin/import/all", requireAdmin, async (req, res) => {
  const body = req.body as {
    version?: number;
    users?: Array<{
      id?: number; phone?: string; inGameName?: string; uid?: string;
      diamondBalance?: number; isAdmin?: boolean; status?: string;
    }>;
    tournaments?: Array<{
      id?: number; title?: string; gameMode?: string; entryFeeDiamonds?: number;
      prizePoolDiamonds?: number; maxSlots?: number; startTime?: string;
      status?: string; roomId?: string; roomPassword?: string;
    }>;
  };

  if (!body || (!body.users && !body.tournaments)) {
    res.status(400).json({ error: "No importable data found in file." });
    return;
  }

  const results: Record<string, { updated: number; skipped: number; errors: string[] }> = {};

  // ── Import users ──────────────────────────────────────────────────────────
  if (Array.isArray(body.users) && body.users.length > 0) {
    let updated = 0, skipped = 0;
    const errors: string[] = [];
    for (const rec of body.users.slice(0, 10000)) {
      try {
        const phone = rec.phone
          ? (rec.phone.startsWith("+") ? rec.phone : `+91${rec.phone}`)
          : null;
        const user = phone
          ? await db.query.usersTable.findFirst({ where: eq(usersTable.phone, phone) })
          : rec.id
          ? await db.query.usersTable.findFirst({ where: eq(usersTable.id, rec.id) })
          : null;

        if (!user) { skipped++; continue; }

        const patch: Partial<typeof usersTable.$inferInsert> = {};
        if (rec.inGameName !== undefined) patch.inGameName = String(rec.inGameName);
        if (rec.uid !== undefined) patch.uid = String(rec.uid);
        if (rec.diamondBalance !== undefined && Number.isFinite(Number(rec.diamondBalance))) {
          patch.diamondBalance = Number(rec.diamondBalance);
        }
        if (rec.status !== undefined) patch.status = rec.status as string;
        if (rec.isAdmin !== undefined) patch.isAdmin = Boolean(rec.isAdmin);

        if (Object.keys(patch).length > 0) {
          await db.update(usersTable).set(patch).where(eq(usersTable.id, user.id));
          updated++;
        } else {
          skipped++;
        }
      } catch (e) {
        errors.push(`user ${rec.id ?? rec.phone}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
    results.users = { updated, skipped, errors: errors.slice(0, 20) };
  }

  // ── Import tournaments ────────────────────────────────────────────────────
  if (Array.isArray(body.tournaments) && body.tournaments.length > 0) {
    let updated = 0, skipped = 0;
    const errors: string[] = [];
    for (const rec of body.tournaments.slice(0, 5000)) {
      if (!rec.id) { skipped++; continue; }
      try {
        const existing = await db.query.tournamentsTable.findFirst({
          where: eq(tournamentsTable.id, rec.id),
        });
        if (!existing) { skipped++; continue; }

        const patch: Partial<typeof tournamentsTable.$inferInsert> = {};
        if (rec.title) patch.title = rec.title;
        if (rec.gameMode) patch.gameMode = rec.gameMode;
        if (rec.entryFeeDiamonds !== undefined) patch.entryFeeDiamonds = Number(rec.entryFeeDiamonds);
        if (rec.prizePoolDiamonds !== undefined) patch.prizePoolDiamonds = Number(rec.prizePoolDiamonds);
        if (rec.maxSlots !== undefined) patch.maxSlots = Number(rec.maxSlots);
        if (rec.startTime) patch.startTime = new Date(rec.startTime);
        if (rec.status) patch.status = rec.status as typeof tournamentsTable.$inferInsert["status"];
        if (rec.roomId !== undefined) patch.roomId = rec.roomId;
        if (rec.roomPassword !== undefined) patch.roomPassword = rec.roomPassword;

        if (Object.keys(patch).length > 0) {
          await db.update(tournamentsTable).set(patch).where(eq(tournamentsTable.id, rec.id));
          updated++;
        } else {
          skipped++;
        }
      } catch (e) {
        errors.push(`tournament ${rec.id}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
    results.tournaments = { updated, skipped, errors: errors.slice(0, 20) };
  }

  res.json({ results });
});

// ── GET /admin/users/:id/topup-history ────────────────────────────────────────
router.get("/admin/users/:id/topup-history", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const rows = await db.query.topupRequestsTable.findMany({
    where: eq(topupRequestsTable.userId, id),
    orderBy: [desc(topupRequestsTable.createdAt)],
  });
  res.json(rows.map(r => ({
    id: r.id,
    rupees: r.rupees,
    diamonds: r.diamonds,
    utr: r.utr,
    status: r.status,
    rejectedReason: r.rejectedReason ?? null,
    bharatpeData: r.bharatpeData ?? null,
    actualPaise: r.actualPaise ?? null,
    sessionToken: r.sessionToken ?? null,
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    rejectedAt: r.rejectedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  })));
});

// ── GET /admin/users/:id/withdrawal-risk ──────────────────────────────────────
router.get("/admin/users/:id/withdrawal-risk", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [user, txns, withdrawals, topups, secFlags] = await Promise.all([
    db.query.usersTable.findFirst({
      where: eq(usersTable.id, id),
      columns: { id: true, createdAt: true, walletFrozen: true, withdrawalBanned: true, topupBanned: true },
    }),
    db.query.walletTransactionsTable.findMany({
      where: eq(walletTransactionsTable.userId, id),
      orderBy: [desc(walletTransactionsTable.createdAt)],
    }),
    db.query.withdrawalRequestsTable.findMany({
      where: eq(withdrawalRequestsTable.userId, id),
      orderBy: [desc(withdrawalRequestsTable.createdAt)],
    }),
    db.query.topupRequestsTable.findMany({
      where: eq(topupRequestsTable.userId, id),
      orderBy: [desc(topupRequestsTable.createdAt)],
    }),
    db.query.securityFlagsTable.findMany({
      where: and(eq(securityFlagsTable.userId, id), sql`${securityFlagsTable.resolved} = false`),
    }),
  ]);

  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const totalFromTopups = txns.filter(t => t.type === "topup").reduce((s, t) => s + t.amount, 0);
  const totalFromPrizes = txns.filter(t => t.type === "prize").reduce((s, t) => s + t.amount, 0);
  const totalFromGifts  = txns.filter(t => t.type === "add").reduce((s, t) => s + t.amount, 0);
  const totalEntryFees  = txns.filter(t => t.type === "entry").reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalInflow     = totalFromTopups + totalFromPrizes + totalFromGifts;

  const totalWithdrawn  = withdrawals.filter(w => w.status === "paid").reduce((s, w) => s + w.diamondsRedeemed, 0);
  const pendingWithdraw = withdrawals.filter(w => w.status === "pending").reduce((s, w) => s + w.diamondsRedeemed, 0);
  const recentWithdrawals = withdrawals.filter(w => new Date(w.createdAt) >= sevenDaysAgo);

  const rejectedTopups      = topups.filter(t => t.status === "rejected").length;
  const verifiedTopupsTotal = topups.filter(t => t.status === "verified").reduce((s, t) => s + t.rupees, 0);

  let score = 0;
  const riskFlags: { flag: string; severity: "low" | "medium" | "high" | "critical"; detail: string }[] = [];

  const ageDays = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 1) {
    score += 35;
    riskFlags.push({ flag: "new_account", severity: "critical", detail: "Account less than 24 hours old attempting withdrawal" });
  } else if (ageDays < 7) {
    score += 15;
    riskFlags.push({ flag: "new_account", severity: "medium", detail: `Account only ${Math.floor(ageDays)} day(s) old` });
  }

  if (totalInflow > 0) {
    const prizeRatio = totalFromPrizes / totalInflow;
    if (prizeRatio > 0.8 && totalFromTopups === 0) {
      score += 30;
      riskFlags.push({ flag: "prize_only_income", severity: "high", detail: "100% of diamonds from prizes — no verified top-ups" });
    } else if (prizeRatio > 0.6) {
      score += 15;
      riskFlags.push({ flag: "prize_heavy", severity: "medium", detail: `${Math.round(prizeRatio * 100)}% of diamonds came from prizes` });
    }
  }

  if (totalEntryFees > 0) {
    const winRate = totalFromPrizes / totalEntryFees;
    if (winRate > 5) {
      score += 25;
      riskFlags.push({ flag: "extreme_win_rate", severity: "critical", detail: `Prize/entry ratio ${winRate.toFixed(1)}x — extremely high win rate` });
    } else if (winRate > 3) {
      score += 15;
      riskFlags.push({ flag: "high_win_rate", severity: "high", detail: `Prize/entry ratio ${winRate.toFixed(1)}x — unusually high` });
    }
  } else if (totalFromPrizes > 500) {
    score += 20;
    riskFlags.push({ flag: "free_winner", severity: "high", detail: "Won prizes without any recorded entry fees" });
  }

  if (totalFromTopups > 0 && (totalWithdrawn + pendingWithdraw) > totalFromTopups) {
    score += 20;
    riskFlags.push({ flag: "withdrawal_exceeds_topup", severity: "high", detail: `Withdrawals (${totalWithdrawn + pendingWithdraw}💎) exceed verified top-ups (${totalFromTopups}💎)` });
  }

  if (recentWithdrawals.length >= 3) {
    score += 15;
    riskFlags.push({ flag: "high_velocity", severity: "medium", detail: `${recentWithdrawals.length} withdrawal requests in the last 7 days` });
  }

  if (rejectedTopups >= 2) {
    score += 10;
    riskFlags.push({ flag: "rejected_topups", severity: "medium", detail: `${rejectedTopups} previously rejected top-up UTR(s)` });
  }

  const criticalFlags = secFlags.filter(f => f.severity === "critical");
  const highFlags     = secFlags.filter(f => f.severity === "high");
  if (criticalFlags.length > 0) {
    score += 30;
    riskFlags.push({ flag: "security_flags", severity: "critical", detail: `${criticalFlags.length} critical security flag(s): ${criticalFlags.map(f => f.type).join(", ")}` });
  } else if (highFlags.length > 0) {
    score += 15;
    riskFlags.push({ flag: "security_flags", severity: "high", detail: `${highFlags.length} high-severity flag(s): ${highFlags.map(f => f.type).join(", ")}` });
  }
  if (user.walletFrozen)     { score += 10; riskFlags.push({ flag: "wallet_frozen",     severity: "high",     detail: "Wallet is currently frozen by admin" }); }
  if (user.withdrawalBanned) { score += 10; riskFlags.push({ flag: "withdrawal_banned", severity: "critical", detail: "Account has an active withdrawal ban" }); }

  const finalScore = Math.min(100, score);
  const riskLevel  = finalScore >= 70 ? "critical" : finalScore >= 45 ? "high" : finalScore >= 20 ? "medium" : "low";

  res.json({
    riskScore: finalScore,
    riskLevel,
    diamondSources: {
      fromTopups: totalFromTopups,
      fromPrizes: totalFromPrizes,
      fromGifts:  totalFromGifts,
      totalInflow,
      topupPercent: totalInflow > 0 ? Math.round((totalFromTopups / totalInflow) * 100) : 0,
      prizePercent: totalInflow > 0 ? Math.round((totalFromPrizes / totalInflow) * 100) : 0,
      giftPercent:  totalInflow > 0 ? Math.round((totalFromGifts  / totalInflow) * 100) : 0,
    },
    withdrawalStats: {
      totalWithdrawn,
      pendingWithdraw,
      totalRequests:    withdrawals.length,
      paidRequests:     withdrawals.filter(w => w.status === "paid").length,
      rejectedRequests: withdrawals.filter(w => w.status === "rejected").length,
      recentCount:      recentWithdrawals.length,
    },
    topupStats: {
      total:          topups.length,
      verified:       topups.filter(t => t.status === "verified").length,
      pending:        topups.filter(t => t.status === "pending").length,
      rejected:       rejectedTopups,
      verifiedRupees: verifiedTopupsTotal,
    },
    winRatio:      totalEntryFees > 0 ? parseFloat((totalFromPrizes / totalEntryFees).toFixed(2)) : null,
    flags:         riskFlags,
    accountAgeDays: Math.floor(ageDays),
  });
});

export default router;
