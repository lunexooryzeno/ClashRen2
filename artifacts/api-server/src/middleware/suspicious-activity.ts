/**
 * Suspicious activity detection — behavioural anomaly analysis.
 *
 * Checks
 * ─────────────────────────────────────────────────────────────────────────────
 * checkTournamentBan        — hard gate: block tournament-banned users at join time
 * checkNewAccountSpend      — flag accounts < 24 h old joining paid tournaments
 * checkEmulatorUsage        — flag emulator usage (soft, admin reviews)
 * checkWinPattern           — flag implausible win streaks (> 5 wins or > 2000 💎 in 7 days)
 *
 * All checks except checkTournamentBan are fire-and-forget (non-blocking).
 */
import { db } from "@workspace/db";
import {
  usersTable,
  tournamentParticipantsTable,
  securityFlagsTable,
  adminLogsTable,
} from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { logger } from "../lib/logger.js";

// ── Internal: deduplicated flag creator ───────────────────────────────────────

async function raiseFlag(p: {
  userId: number;
  type: string;
  severity: string;
  details: object;
  ip?: string | null;
  fingerprint?: string | null;
  autoAction?: string;
}): Promise<void> {
  try {
    const existing = await db.query.securityFlagsTable.findFirst({
      where: and(
        eq(securityFlagsTable.userId, p.userId),
        eq(securityFlagsTable.type, p.type),
        eq(securityFlagsTable.resolved, false),
      ),
      columns: { id: true },
    });
    if (existing) return;

    await db.insert(securityFlagsTable).values({
      userId: p.userId,
      type: p.type,
      severity: p.severity,
      details: JSON.stringify(p.details),
      ip: p.ip ?? null,
      fingerprint: p.fingerprint ?? null,
      autoAction: p.autoAction ?? "none",
    });

    await db.insert(adminLogsTable).values({
      action: `security:${p.type}`,
      category: "security",
      details: JSON.stringify({ severity: p.severity, ...p.details }),
      targetId: String(p.userId),
      targetType: "user",
    });

    logger.warn({ userId: p.userId, type: p.type, severity: p.severity }, "[security] suspicious activity");
  } catch (err) {
    logger.error({ err, type: p.type, userId: p.userId }, "[security] failed to raise suspicious-activity flag");
  }
}

// ── Hard gate: tournament ban ────────────────────────────────────────────────
// Returns { banned: true } when the user is currently tournament-banned.
// Clears an expired ban automatically.
export async function checkTournamentBan(
  userId: number,
): Promise<{ banned: boolean; until?: string | null }> {
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: { tournamentBanned: true, tournamentBannedUntil: true },
  });
  if (!user?.tournamentBanned) return { banned: false };

  if (user.tournamentBannedUntil && user.tournamentBannedUntil <= new Date()) {
    await db.update(usersTable)
      .set({ tournamentBanned: false, tournamentBannedUntil: null })
      .where(eq(usersTable.id, userId));
    return { banned: false };
  }
  return { banned: true, until: user.tournamentBannedUntil?.toISOString() ?? null };
}

// ── New account spending ──────────────────────────────────────────────────────
// Flags accounts < 24 h old that join a paid tournament (≥ 30 💎 entry).
export async function checkNewAccountSpend(
  userId: number,
  tournamentId: number,
  entryFee: number,
): Promise<void> {
  if (entryFee < 30) return;
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: { createdAt: true },
  });
  if (!user) return;

  const ageHours = (Date.now() - user.createdAt.getTime()) / 3_600_000;
  if (ageHours >= 24) return;

  await raiseFlag({
    userId,
    type: "new_account_spend",
    severity: "medium",
    details: { accountAgeHours: +ageHours.toFixed(1), entryFee, tournamentId },
  });
}

// ── Emulator usage ───────────────────────────────────────────────────────────
// Logs a soft flag when a device reports itself as an emulator.
// Does not block — admin reviews and decides action.
export async function checkEmulatorUsage(
  userId: number,
  emulatorSignals: string | null,
  ip: string | null,
): Promise<void> {
  await raiseFlag({
    userId,
    type: "emulator",
    severity: "medium",
    details: { emulatorSignals, ip },
    ip,
  });
}

// ── Suspicious win pattern ────────────────────────────────────────────────────
// Flags users with > 5 first-place finishes or > 2 000 💎 won in the last 7 days.
// Called async after result-posting — never blocks a live request.
export async function checkWinPattern(userId: number): Promise<void> {
  const since = new Date(Date.now() - 7 * 24 * 3_600_000);
  const recent = await db.query.tournamentParticipantsTable.findMany({
    where: and(
      eq(tournamentParticipantsTable.userId, userId),
      gte(tournamentParticipantsTable.joinedAt, since),
    ),
    columns: { placement: true, diamondsWon: true },
  });

  const wins = recent.filter(p => p.placement === 1).length;
  const diamonds = recent.reduce((s, p) => s + p.diamondsWon, 0);

  if (wins <= 5 && diamonds <= 2000) return;

  await raiseFlag({
    userId,
    type: "suspicious_win",
    severity: wins > 8 || diamonds > 5000 ? "high" : "medium",
    details: { winsLast7Days: wins, diamondsWonLast7Days: diamonds, tournamentsLast7Days: recent.length },
  });
}
