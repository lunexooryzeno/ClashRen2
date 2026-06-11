import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tournamentParticipantsTable,
  tournamentsTable,
  slotMatchesTable,
  slotMatchVerificationsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

router.get("/history", requireAuth, async (req, res) => {
  const userId = req.user!.userId;

  const participations = await db.query.tournamentParticipantsTable.findMany({
    where: eq(tournamentParticipantsTable.userId, userId),
  });

  if (!participations.length) { res.json([]); return; }

  // ── Batch-fetch all referenced tournaments in one query ──────────────────
  const tournamentIds = [...new Set(participations.map(p => p.tournamentId))];
  const tournaments = await db.query.tournamentsTable.findMany({
    where: inArray(tournamentsTable.id, tournamentIds),
  });
  const tournamentMap = new Map(tournaments.map(t => [t.id, t]));

  // ── Batch-fetch slot matches for participants that have a matchNumber ─────
  type MatchKey = { slotId: number; slotIndex: number; matchNumber: number; waveNumber: number };
  const matchedParticipants = participations.filter(
    p => p.matchNumber != null && p.slotIndex != null && p.waveNumber != null
  );

  // Build slot-match lookup map: "slotId:slotIndex:matchNumber:waveNumber" → slotMatchId
  const slotMatchIdMap = new Map<string, number>();
  if (matchedParticipants.length > 0) {
    // Fetch all relevant slot matches in one query by slotId membership
    const slotIds = [...new Set(matchedParticipants.map(p => p.tournamentId))];
    const slotMatches = await db.query.slotMatchesTable.findMany({
      where: inArray(slotMatchesTable.slotId, slotIds),
      columns: { id: true, slotId: true, slotIndex: true, matchNumber: true, waveNumber: true },
    });
    for (const m of slotMatches) {
      const key = `${m.slotId}:${m.slotIndex}:${m.matchNumber}:${m.waveNumber}`;
      slotMatchIdMap.set(key, m.id);
    }
  }

  // ── Batch-fetch all verifications for this user in one query ─────────────
  const slotMatchIds = [...slotMatchIdMap.values()];
  const verifications = slotMatchIds.length > 0
    ? await db.query.slotMatchVerificationsTable.findMany({
        where: and(
          inArray(slotMatchVerificationsTable.slotMatchId, slotMatchIds),
          eq(slotMatchVerificationsTable.userId, userId),
        ),
        columns: { slotMatchId: true, statDiff: true },
      })
    : [];
  const verifMap = new Map(verifications.map(v => [v.slotMatchId, v]));

  // ── Build results ─────────────────────────────────────────────────────────
  const results = participations.map(p => {
    const tournament = tournamentMap.get(p.tournamentId);
    if (!tournament) return null;

    const effectiveStatus =
      p.placement != null ? "completed" : tournament.status;

    let kills = p.kills ?? 0;
    if (p.matchNumber != null && p.slotIndex != null && p.waveNumber != null) {
      const key = `${p.tournamentId}:${p.slotIndex}:${p.matchNumber}:${p.waveNumber}`;
      const smId = slotMatchIdMap.get(key);
      if (smId != null) {
        const verif = verifMap.get(smId);
        if (verif?.statDiff) {
          try {
            const diff = JSON.parse(verif.statDiff as string);
            if (typeof diff.kills === "number") kills = diff.kills;
          } catch { /* ignore */ }
        }
      }
    }

    return {
      id: p.id,
      tournamentId: p.tournamentId,
      tournamentTitle: tournament.title,
      gameMode: tournament.gameMode,
      kills,
      placement: p.placement,
      diamondsWon: p.diamondsWon,
      entryFeeDiamonds: tournament.entryFeeDiamonds,
      joinedAt: p.joinedAt.toISOString(),
      tournamentStartTime: tournament.startTime.toISOString(),
      status: effectiveStatus,
    };
  });

  res.json(results.filter(Boolean));
});

export default router;
