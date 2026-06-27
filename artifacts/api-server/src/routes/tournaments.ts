import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tournamentsTable,
  tournamentParticipantsTable,
  usersTable,
  walletTransactionsTable,
  notificationsTable,
  adminLogsTable,
  balanceChangeLogsTable,
  tournamentCredentialViewsTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireFullProfile, getTokenPayload } from "../middlewares/auth.js";
import { tournamentJoinLimiter } from "../middleware/rate-limiter.js";
import { checkTournamentBan, checkNewAccountSpend, checkWinPattern } from "../middleware/suspicious-activity.js";
import { sendPushToUser } from "../lib/push.js";

async function logMatchEvent(userId: number, action: string, details?: string) {
  await db.insert(adminLogsTable).values({ targetId: userId, action, category: "tournament", details });
}

const router: IRouter = Router();

function formatTournament(
  t: typeof tournamentsTable.$inferSelect,
  isJoined: boolean,
  isAdmin = false,
  participant?: typeof tournamentParticipantsTable.$inferSelect | null,
) {
  const canSeeRoomCreds = isJoined || isAdmin;
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
    roomId: canSeeRoomCreds ? t.roomId : null,
    roomPassword: canSeeRoomCreds ? t.roomPassword : null,
    isJoined,
    isReady: participant?.isReady ?? false,
    readyAt: participant?.readyAt?.toISOString() ?? null,
    kills: participant?.kills ?? null,
    placement: participant?.placement ?? null,
    diamondsWon: participant?.diamondsWon ?? null,
    joinedAt: participant?.joinedAt?.toISOString() ?? null,
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
    roomDirectLink: canSeeRoomCreds ? (t.roomDirectLink ?? null) : null,
    credentialsReleased: t.credentialsReleased,
    credentialsReleasedAt: t.credentialsReleasedAt?.toISOString() ?? null,
    credentialShareMode: t.credentialShareMode,
    credentialUnlockMinutes: t.credentialUnlockMinutes ?? null,
    credentialUnlockAt: t.credentialUnlockMinutes != null
      ? new Date(t.startTime.getTime() - t.credentialUnlockMinutes * 60 * 1000).toISOString()
      : null,
    cancelReason: t.cancelReason ?? null,
  };
}


router.get("/tournaments", async (req, res) => {
  const { status } = req.query as { status?: string };
  const tournaments = status
    ? await db.query.tournamentsTable.findMany({ where: eq(tournamentsTable.status, status), orderBy: [desc(tournamentsTable.startTime)] })
    : await db.query.tournamentsTable.findMany({ orderBy: [desc(tournamentsTable.startTime)] });

  const payload = getTokenPayload(req);
  const userId = payload?.userId ?? null;
  const isAdmin = payload?.isAdmin ?? false;
  let joinedIds = new Set<number>();
  let participationMap = new Map<number, typeof tournamentParticipantsTable.$inferSelect>();
  if (userId) {
    const participations = await db.query.tournamentParticipantsTable.findMany({ where: eq(tournamentParticipantsTable.userId, userId) });
    joinedIds = new Set(participations.map(p => p.tournamentId));
    // Build a map of tournamentId → best participant record for this user.
    // For multi-slot tournaments, prefer the record with the best (lowest) placement.
    for (const p of participations) {
      const existing = participationMap.get(p.tournamentId);
      if (!existing) {
        participationMap.set(p.tournamentId, p);
      } else {
        const pPlace = p.placement ?? Infinity;
        const ePlace = existing.placement ?? Infinity;
        if (pPlace < ePlace) participationMap.set(p.tournamentId, p);
      }
    }
  }

  // Short cache so the list feels snappy on re-navigation but picks up new
  // tournaments within a minute. Auth responses must not be cached publicly.
  if (!userId) {
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=30");
  } else {
    res.set("Cache-Control", "private, max-age=30, stale-while-revalidate=15");
  }
  res.json(tournaments.map(t => formatTournament(t, joinedIds.has(t.id), isAdmin, participationMap.get(t.id))));
});

router.get("/tournaments/featured", async (req, res) => {
  const ongoing = await db.query.tournamentsTable.findMany({
    where: eq(tournamentsTable.status, "ongoing"),
    orderBy: [desc(tournamentsTable.prizePoolDiamonds)],
    limit: 2,
  });
  const upcoming = await db.query.tournamentsTable.findMany({
    where: eq(tournamentsTable.status, "upcoming"),
    orderBy: [desc(tournamentsTable.prizePoolDiamonds)],
    limit: 3,
  });
  const featured = [...ongoing, ...upcoming].slice(0, 5);

  const payload = getTokenPayload(req);
  const userId = payload?.userId ?? null;
  const isAdmin = payload?.isAdmin ?? false;
  let joinedIds = new Set<number>();
  if (userId) {
    const participations = await db.query.tournamentParticipantsTable.findMany({ where: eq(tournamentParticipantsTable.userId, userId) });
    joinedIds = new Set(participations.map(p => p.tournamentId));
  }

  res.json(featured.map(t => formatTournament(t, joinedIds.has(t.id), isAdmin)));
});

router.get("/tournaments/s/:slug", async (req, res) => {
  const slug = String(req.params.slug);
  const tournament = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.matchSlug, slug) });
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }

  const payload = getTokenPayload(req);
  const userId = payload?.userId ?? null;
  const isAdmin = payload?.isAdmin ?? false;
  let isJoined = false;
  let participant: typeof tournamentParticipantsTable.$inferSelect | null = null;
  if (userId) {
    const p = await db.query.tournamentParticipantsTable.findFirst({
      where: and(eq(tournamentParticipantsTable.tournamentId, tournament.id), eq(tournamentParticipantsTable.userId, userId))
    });
    isJoined = !!p;
    participant = p ?? null;
  }
  res.json(formatTournament(tournament, isJoined, isAdmin, participant));
});

router.get("/tournaments/:id", async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const tournament = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, id) });
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }

  const payload = getTokenPayload(req);
  const userId = payload?.userId ?? null;
  const isAdmin = payload?.isAdmin ?? false;
  let isJoined = false;
  let participant: typeof tournamentParticipantsTable.$inferSelect | null = null;
  if (userId) {
    const p = await db.query.tournamentParticipantsTable.findFirst({
      where: and(eq(tournamentParticipantsTable.tournamentId, id), eq(tournamentParticipantsTable.userId, userId))
    });
    isJoined = !!p;
    participant = p ?? null;
  }
  res.json(formatTournament(tournament, isJoined, isAdmin, participant));
});

router.post("/tournaments/:id/join", requireAuth, requireFullProfile, tournamentJoinLimiter, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const userId = req.user!.userId;

  // Hard block: tournament-banned users cannot join
  const banStatus = await checkTournamentBan(userId);
  if (banStatus.banned) {
    const until = banStatus.until ? ` until ${new Date(banStatus.until).toLocaleDateString("en-IN")}` : "";
    res.status(403).json({ error: `You are banned from tournaments${until}. Contact support if you believe this is a mistake.` });
    return;
  }

  const tournament = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, id) });
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
  if (tournament.status !== "upcoming") { res.status(400).json({ error: "Tournament is not open for joining" }); return; }
  if (tournament.filledSlots >= tournament.maxSlots) { res.status(400).json({ error: "Tournament is full" }); return; }

  const slotIndex = typeof req.body?.slotIndex === "number" ? req.body.slotIndex : 0;

  // Determine cutoff time: use the specific slot's startTime when available,
  // fall back to the tournament's overall startTime for non-slot tournaments.
  let slotStartTime: Date = tournament.startTime;
  try {
    const ms = typeof tournament.matchSettings === "string"
      ? JSON.parse(tournament.matchSettings)
      : (tournament.matchSettings ?? {});
    const slots: Array<{ startTime: string }> = Array.isArray(ms.timeSlots) ? ms.timeSlots : [];
    if (slots[slotIndex]?.startTime) slotStartTime = new Date(slots[slotIndex].startTime);
  } catch { /* ignore parse errors, fall back to tournament.startTime */ }

  const closeMinutes = (() => {
    try {
      const ms = typeof tournament.matchSettings === "string" ? JSON.parse(tournament.matchSettings) : (tournament.matchSettings ?? {});
      return typeof ms.registrationCloseMinutes === "number" ? ms.registrationCloseMinutes : 15;
    } catch { return 15; }
  })();

  const cutoffMs = slotStartTime.getTime() - closeMinutes * 60 * 1000;
  if (Date.now() >= cutoffMs) {
    res.status(400).json({ error: "Booking closed — registration cutoff has passed", code: "cutoff_passed" });
    return;
  }

  const existing = await db.query.tournamentParticipantsTable.findFirst({
    where: and(
      eq(tournamentParticipantsTable.tournamentId, id),
      eq(tournamentParticipantsTable.userId, req.user!.userId),
      eq(tournamentParticipantsTable.slotIndex, slotIndex),
    )
  });
  if (existing) { res.status(400).json({ error: "Already joined this slot" }); return; }
  let joinError: string | null = null;

  await db.transaction(async (tx) => {
    const tRes = await tx.execute(
      sql`SELECT id, status, filled_slots, max_slots, entry_fee_diamonds, title FROM tournaments WHERE id = ${id} FOR UPDATE`
    );
    const lockedTournament = ((tRes as any).rows ?? tRes)[0] as { id: number; status: string; filled_slots: number; max_slots: number; entry_fee_diamonds: number; title: string } | undefined;

    if (!lockedTournament || lockedTournament.status !== "upcoming") {
      joinError = "Tournament is not open for joining";
      return;
    }
    if (lockedTournament.filled_slots >= lockedTournament.max_slots) {
      joinError = "Tournament is full";
      return;
    }

    const uRes = await tx.execute(
      sql`SELECT id, diamond_balance FROM users WHERE id = ${userId} FOR UPDATE`
    );
    const lockedUser = ((uRes as any).rows ?? uRes)[0] as { id: number; diamond_balance: number } | undefined;

    if (!lockedUser) {
      joinError = "User not found";
      return;
    }
    if (lockedUser.diamond_balance < lockedTournament.entry_fee_diamonds) {
      joinError = `Insufficient diamonds. Need ${lockedTournament.entry_fee_diamonds}, have ${lockedUser.diamond_balance}`;
      return;
    }

    await tx
      .update(usersTable)
      .set({ diamondBalance: lockedUser.diamond_balance - lockedTournament.entry_fee_diamonds })
      .where(eq(usersTable.id, userId));

    await tx
      .update(tournamentsTable)
      .set({ filledSlots: lockedTournament.filled_slots + 1 })
      .where(eq(tournamentsTable.id, id));

    await tx.insert(tournamentParticipantsTable).values({
      tournamentId: id,
      userId,
      slotIndex,
      kills: 0,
      diamondsWon: 0,
    });

    // Record wallet debit
    if (lockedTournament.entry_fee_diamonds > 0) {
      await tx.insert(balanceChangeLogsTable).values({
        userId, adminId: null, amount: -lockedTournament.entry_fee_diamonds,
        balanceBefore: lockedUser.diamond_balance,
        balanceAfter: lockedUser.diamond_balance - lockedTournament.entry_fee_diamonds,
        reason: `Entry fee: ${lockedTournament.title}`,
        source: "tournament_join",
      });
      await tx.insert(walletTransactionsTable).values({
        userId,
        type: "entry",
        amount: -lockedTournament.entry_fee_diamonds,
        label: `${lockedTournament.title} Entry`,
        tournamentId: id,
      });
    }

    // Notify user
    await tx.insert(notificationsTable).values({
      userId,
      type: "tournament",
      title: "Tournament Joined!",
      body: `You have successfully joined "${lockedTournament.title}". Good luck!`,
    });
    sendPushToUser(userId, {
      type: "tournament",
      title: "Tournament Joined!",
      body: `You have successfully joined "${lockedTournament.title}". Good luck!`,
      url: `/events/${id}`,
    }).catch(() => {});
  });

  if (joinError) {
    res.status(400).json({ error: joinError });
    return;
  }

  // Log match participation event
  const tournament2 = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, id) });
  await logMatchEvent(userId, "tournament_joined", `Match: ${tournament2?.title ?? `#${id}`} · Entry: ${tournament2?.entryFeeDiamonds ?? 0} 💎`);

  // Async suspicious-activity checks — do not block the response
  void checkNewAccountSpend(userId, id, tournament2?.entryFeeDiamonds ?? 0);

  res.json({ message: "Successfully joined tournament!" });
});

// Mark as Ready
router.post("/tournaments/:id/ready", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const userId = req.user!.userId;

  const participant = await db.query.tournamentParticipantsTable.findFirst({
    where: and(eq(tournamentParticipantsTable.tournamentId, id), eq(tournamentParticipantsTable.userId, userId)),
  });
  if (!participant) { res.status(404).json({ error: "Not registered for this tournament" }); return; }
  if (participant.isReady) { res.json({ isReady: true, readyAt: participant.readyAt?.toISOString() }); return; }

  const now = new Date();
  await db
    .update(tournamentParticipantsTable)
    .set({ isReady: true, readyAt: now })
    .where(and(eq(tournamentParticipantsTable.tournamentId, id), eq(tournamentParticipantsTable.userId, userId)));

  const t = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, id) });
  await logMatchEvent(userId, "ready_clicked", `Match: ${t?.title ?? `#${id}`}`);

  res.json({ isReady: true, readyAt: now.toISOString() });
});

// Room Viewed — called by frontend when room credentials are revealed
router.post("/tournaments/:id/room-viewed", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const userId = req.user!.userId;

  const participant = await db.query.tournamentParticipantsTable.findFirst({
    where: and(eq(tournamentParticipantsTable.tournamentId, id), eq(tournamentParticipantsTable.userId, userId)),
  });
  if (!participant) { res.status(204).end(); return; }

  const t = await db.query.tournamentsTable.findFirst({ where: eq(tournamentsTable.id, id) });

  // Record credential view (upsert — ignore duplicate)
  await db.execute(
    sql`INSERT INTO tournament_credential_views (tournament_id, user_id) VALUES (${id}, ${userId}) ON CONFLICT DO NOTHING`
  );

  await logMatchEvent(userId, "room_viewed", `Match: ${t?.title ?? `#${id}`} · Room: ${t?.roomId ?? "—"}`);

  res.status(204).end();
});

export default router;
