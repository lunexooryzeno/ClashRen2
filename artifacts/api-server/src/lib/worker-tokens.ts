import crypto from "crypto";
import { db } from "@workspace/db";
import { workerAccessTokensTable, workerResponseLogsTable, quickmatchWorkersTable } from "@workspace/db";
import { eq, and, isNull, sql } from "drizzle-orm";

const DEFAULT_TTL_SECONDS = 180; // 3 minutes

/**
 * Generate a cryptographically random 32-byte token, store its SHA-256 hash in
 * worker_access_tokens, and return the raw token for inclusion in the webhook URL.
 */
export async function issueToken(
  matchId: string,
  workerId: number,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await db.insert(workerAccessTokensTable).values({
    tokenHash,
    matchId,
    workerId,
    expiresAt,
  });

  return rawToken;
}

export interface ConsumedToken {
  id: number;
  matchId: string;
  workerId: number;
}

/**
 * Validate a raw token:
 * - SHA-256 hash must exist in worker_access_tokens
 * - Must not be expired
 * - Must not have already been used (usedAt is null)
 * - Marks it used atomically
 *
 * Returns the token record on success; null on any validation failure.
 */
export async function consumeToken(rawToken: string): Promise<ConsumedToken | null> {
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const now = new Date();

  // Atomic conditional update: only succeeds when token exists, not yet used, and not expired.
  // Using raw SQL UPDATE … RETURNING so we can check rows-affected in one round-trip,
  // preventing any race between concurrent callback deliveries.
  const result = await db
    .update(workerAccessTokensTable)
    .set({ usedAt: now, completed: true })
    .where(
      and(
        eq(workerAccessTokensTable.tokenHash, tokenHash),
        isNull(workerAccessTokensTable.usedAt),
        // expires_at > now  (token is still valid)
        // Drizzle doesn't have a gt(col, value) for timestamps via the builder easily,
        // so we use a raw sql condition
        sql`${workerAccessTokensTable.expiresAt} > ${now}`,
      ),
    )
    .returning();

  if (!result.length) {
    // Token not found, already used, or expired — reject silently
    return null;
  }

  const row = result[0];
  return { id: row.id, matchId: row.matchId, workerId: row.workerId };
}

/**
 * Peek at a raw token without consuming it — used by the watchdog to check if
 * a token has been used already.
 */
export async function peekToken(rawToken: string): Promise<{ matchId: string; usedAt: Date | null; expiresAt: Date } | null> {
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const row = await db.query.workerAccessTokensTable.findFirst({
    where: (t, { eq }) => eq(t.tokenHash, tokenHash),
  });
  if (!row) return null;
  return { matchId: row.matchId, usedAt: row.usedAt, expiresAt: row.expiresAt };
}

/**
 * Validate a raw token without consuming it (no state mutation).
 * Returns the token record if valid (exists, not expired, not already used);
 * returns null on any validation failure.
 *
 * Use this for non-terminal progress callbacks where the same token should
 * remain usable for the subsequent final callback.
 */
export async function validateToken(rawToken: string): Promise<ConsumedToken | null> {
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const now = new Date();
  const row = await db.query.workerAccessTokensTable.findFirst({
    where: (t, { eq }) => eq(t.tokenHash, tokenHash),
  });
  if (!row) return null;
  if (row.usedAt) return null;              // already consumed by a terminal callback
  if (row.expiresAt <= now) return null;     // expired
  return { id: row.id, matchId: row.matchId, workerId: row.workerId };
}

/**
 * Log a worker phone response for audit trail.
 */
export async function logWorkerResponse(opts: {
  tokenId?: number;
  matchId: string;
  workerId?: number;
  phoneStatus?: string;
  msgCode?: string;
  responseCode?: string;
  payload?: unknown;
}): Promise<void> {
  await db.insert(workerResponseLogsTable).values({
    tokenId: opts.tokenId ?? null,
    matchId: opts.matchId,
    workerId: opts.workerId ?? null,
    phoneStatus: opts.phoneStatus ?? null,
    msgCode: opts.msgCode ?? null,
    responseCode: opts.responseCode ?? null,
    payload: opts.payload ? JSON.stringify(opts.payload) : null,
  }).catch((err) => console.error("[worker-tokens] Failed to log response:", err));
}

/**
 * Select the highest-priority available room_creator worker that supports the given game mode.
 * Returns null if no worker is available.
 */
export async function selectWorker(modeId: string): Promise<{ id: number; webhookUrl: string; webhookSecret: string } | null> {
  const workers = await db.query.quickmatchWorkersTable.findMany({
    where: (w, { and, eq }) => and(eq(w.status, "active"), eq(w.workerType, "room_creator")),
    orderBy: (w, { desc }) => [desc(w.priority)],
  });

  for (const w of workers) {
    const modes = w.supportedGameModes.split(",").map((m) => m.trim());
    if (modes.includes(modeId) || modes.includes("*")) {
      return { id: w.id, webhookUrl: w.webhookUrl, webhookSecret: w.webhookSecret };
    }
  }
  return null;
}

/**
 * Mark a worker as busy (assigned to a match).
 */
export async function markWorkerBusy(workerId: number, matchId: string): Promise<void> {
  await db
    .update(quickmatchWorkersTable)
    .set({ status: "busy", currentJobMatchId: matchId })
    .where(eq(quickmatchWorkersTable.id, workerId))
    .catch(() => {});
}

/**
 * Mark a worker as available again.
 */
export async function markWorkerFree(workerId: number): Promise<void> {
  await db
    .update(quickmatchWorkersTable)
    .set({ status: "active", currentJobMatchId: null, lastHeartbeatAt: new Date() })
    .where(eq(quickmatchWorkersTable.id, workerId))
    .catch(() => {});
}
