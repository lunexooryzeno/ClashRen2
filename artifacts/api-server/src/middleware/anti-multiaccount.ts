/**
 * Anti-multiaccount detection.
 *
 * Detection strategies
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. checkFingerprintMultiAccount  — same device fingerprint → multiple users
 * 2. checkIPCluster                — same IP → 3+ distinct accounts in 24 hours
 * 3. checkUIDUniqueness            — same Free Fire UID linked to two accounts
 *
 * Checks 1 & 2 are called from the heartbeat endpoint (fire-and-forget, non-blocking).
 * Check 3 is called inline from PATCH /users/me and POST /users/me/fetch-name
 * and returns a hard block when the UID is already taken.
 *
 * All detections raise a security_flags record for admin review and write an
 * admin_logs entry so the event is visible in the admin audit trail.
 */
import { db } from "@workspace/db";
import {
  deviceSessionsTable,
  usersTable,
  securityFlagsTable,
  adminLogsTable,
} from "@workspace/db";
import { eq, and, ne, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

// ── Internal: create a deduplicated security flag ────────────────────────────

async function raiseFlag(p: {
  userId: number;
  type: string;
  severity: string;
  details: object;
  relatedUserId?: number;
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
      relatedUserId: p.relatedUserId ?? null,
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

    logger.warn({ userId: p.userId, type: p.type, severity: p.severity }, "[security] flag raised");
  } catch (err) {
    logger.error({ err, type: p.type, userId: p.userId }, "[security] failed to raise flag");
  }
}

// ── 1. Fingerprint multi-account ─────────────────────────────────────────────
// Called from POST /users/heartbeat (fire-and-forget).
export async function checkFingerprintMultiAccount(
  userId: number,
  fingerprint: string,
  ip: string | null,
): Promise<void> {
  const others = await db.query.deviceSessionsTable.findMany({
    where: and(
      eq(deviceSessionsTable.fingerprint, fingerprint),
      ne(deviceSessionsTable.userId, userId),
    ),
    columns: { userId: true },
    limit: 5,
  });

  if (others.length === 0) return;

  const relatedIds = [...new Set(others.map(o => o.userId))];
  const details = { fingerprint, relatedUserIds: relatedIds, ip };

  // Flag the current user
  await raiseFlag({
    userId,
    type: "multi_account",
    severity: "high",
    details,
    relatedUserId: relatedIds[0],
    ip,
    fingerprint,
  });

  // Flag each related account too (they may be the original fraudster)
  for (const rid of relatedIds) {
    await raiseFlag({
      userId: rid,
      type: "multi_account",
      severity: "high",
      details: { fingerprint, relatedUserIds: [userId, ...relatedIds.filter(id => id !== rid)], ip },
      relatedUserId: userId,
      ip,
      fingerprint,
    });
  }
}

// ── 2. IP cluster detection ───────────────────────────────────────────────────
// Flags when 3+ distinct accounts are seen from the same IP in 24 hours.
export async function checkIPCluster(userId: number, ip: string): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await db.execute(
    sql`SELECT COUNT(DISTINCT user_id)::int AS cnt
        FROM device_sessions
        WHERE ip = ${ip}
          AND last_seen_at >= ${since}
          AND user_id != ${userId}`,
  );
  const others = Number((result as any).rows?.[0]?.cnt ?? 0);
  if (others < 3) return;

  await raiseFlag({
    userId,
    type: "ip_cluster",
    severity: "medium",
    details: { ip, distinctAccountsLast24h: others + 1 },
    ip,
  });
}

// ── 3. Free Fire UID uniqueness ───────────────────────────────────────────────
// Called inline (blocking). Returns { blocked: true } when UID is already taken.
export async function checkUIDUniqueness(
  userId: number,
  uid: string,
): Promise<{ blocked: boolean; existingUserId?: number }> {
  const existing = await db.query.usersTable.findFirst({
    where: and(eq(usersTable.uid, uid), ne(usersTable.id, userId)),
    columns: { id: true, inGameName: true },
  });
  if (!existing) return { blocked: false };

  const details = { uid, existingUserId: existing.id, existingName: existing.inGameName };
  await raiseFlag({ userId, type: "uid_reuse", severity: "critical", details, relatedUserId: existing.id });
  await raiseFlag({ userId: existing.id, type: "uid_reuse", severity: "critical", details: { uid, newUserId: userId }, relatedUserId: userId });

  return { blocked: true, existingUserId: existing.id };
}
