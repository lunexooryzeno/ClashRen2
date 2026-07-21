import { getSystemSettings } from "./systemSettings.js";
import type { CsCareerSnapshot } from "./quickmatch-matches.js";

const HL_BASE    = "https://proapis.hlgamingofficial.com/main/games/freefire/stats/api";
const HL_ACCOUNT = "https://proapis.hlgamingofficial.com/main/games/freefire/account/api";
const SNAPSHOT_TIMEOUT_MS = 15_000;

// ─── In-memory snapshot cache ─────────────────────────────────────────────────
// Avoids hammering the HL Gaming API when check-end polls every 30 s.
// Cache entries expire after CACHE_TTL_MS so we still detect stat changes.
const CACHE_TTL_MS = 90_000; // 90 s — shorter than polling interval × 3
interface CacheEntry { snap: CsCareerSnapshot; expiresAt: number; }
const snapshotCache = new Map<string, CacheEntry>();

function getCached(uid: string): CsCareerSnapshot | null {
  const entry = snapshotCache.get(uid);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { snapshotCache.delete(uid); return null; }
  return entry.snap;
}
function setCache(uid: string, snap: CsCareerSnapshot): void {
  snapshotCache.set(uid, { snap, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Retry helper ─────────────────────────────────────────────────────────────
// Retries a fetch up to maxRetries times when the response is 429 (rate-limit).
// Each attempt gets its own per-attempt timeout so earlier retries don't eat
// into the timeout budget of later attempts.
// baseDelayMs is chosen to give the API's rate-limit window time to reset:
// 15s, 30s, 60s — total possible wait ~105s before giving up.
async function fetchWithRetry(
  url: string,
  perAttemptTimeoutMs: number,
  maxRetries = 3,
  baseDelayMs = 15_000,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = baseDelayMs * Math.pow(2, attempt - 1); // 15s, 30s, 60s
      console.log(`[hlgaming] Rate-limited (429). Retrying in ${Math.round(delay / 1000)}s (attempt ${attempt}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, delay));
    }
    try {
      // Fresh AbortSignal per attempt so earlier delays don't consume the budget
      const resp = await fetch(url, { signal: AbortSignal.timeout(perAttemptTimeoutMs) });
      if (resp.status !== 429) return resp; // success or other error — return as-is
      lastErr = new Error(`HTTP 429`);
    } catch (err) {
      throw err; // timeout or network error — don't retry
    }
  }
  throw lastErr ?? new Error("HTTP 429 — exhausted retries");
}

export interface HlGamingProfile {
  uid: string;
  nickname: string;
  level: number;
}

export async function fetchHlGamingAccount(playerUid: string, region = "ind"): Promise<HlGamingProfile | null> {
  const settings = getSystemSettings();
  if (!settings.hlGamingUseruid || !settings.hlGamingApiKey) {
    console.warn("[hlgaming] Missing hlGamingUseruid or hlGamingApiKey — skipping account fetch");
    return null;
  }

  const url =
    `${HL_ACCOUNT}?sectionName=AllData` +
    `&PlayerUid=${encodeURIComponent(playerUid)}` +
    `&region=${encodeURIComponent(region)}` +
    `&useruid=${encodeURIComponent(settings.hlGamingUseruid)}` +
    `&api=${encodeURIComponent(settings.hlGamingApiKey)}`;

  try {
    // 3 retries, 5s per-attempt timeout, 5s base delay (account lookup is quick)
    const resp = await fetchWithRetry(url, 10_000, 3, 5_000);
    if (!resp.ok) {
      console.warn(`[hlgaming] HTTP ${resp.status} fetching account for UID ${playerUid}`);
      return null;
    }
    const json = await resp.json() as Record<string, unknown>;
    console.log(`[hlgaming] raw response for UID ${playerUid}:`, JSON.stringify(json).slice(0, 500));
    const result = (json.result ?? json.data ?? json) as Record<string, unknown>;
    const ai     = (result.AccountInfo ?? {}) as Record<string, unknown>;
    const name   = ai.AccountName ?? ai.nickname ?? ai.name;
    if (!name || typeof name !== "string") return null;
    const level  = Number(
      ai.AccountLevel ?? ai.Level ?? ai.level ?? ai.account_level ?? 0
    );
    return { uid: playerUid, nickname: name, level };
  } catch (err: unknown) {
    console.error(`[hlgaming] Error fetching account for UID ${playerUid}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

interface HlApiResponse {
  status?: string;
  data?: {
    CS_CAREER?: {
      games_played?: number;
      wins?: number;
      kills?: number;
      damage?: number;
      deaths?: number;
      assists?: number;
    };
  };
}

export async function fetchCsCareerSnapshot(
  playerUid: string,
  { bypassCache = false }: { bypassCache?: boolean } = {},
): Promise<CsCareerSnapshot | null> {
  // Serve from cache when available (suppresses repeated API calls during polling)
  if (!bypassCache) {
    const cached = getCached(playerUid);
    if (cached) {
      console.log(`[hlgaming] Cache hit for UID ${playerUid} (games=${cached.gamesPlayed})`);
      return cached;
    }
  }

  const settings = getSystemSettings();
  if (!settings.hlGamingUseruid || !settings.hlGamingApiKey) {
    console.warn("[hlgaming] Missing hlGamingUseruid or hlGamingApiKey — skipping snapshot");
    return null;
  }

  const url =
    `${HL_BASE}?sectionName=free_fire_stats` +
    `&useruid=${encodeURIComponent(settings.hlGamingUseruid)}` +
    `&api=${encodeURIComponent(settings.hlGamingApiKey)}` +
    `&uid=${encodeURIComponent(playerUid)}` +
    `&region=IND`;

  try {
    // Retries up to 3× on 429 with exponential back-off (15s → 30s → 60s).
    // Each attempt gets its own fresh SNAPSHOT_TIMEOUT_MS window.
    const resp = await fetchWithRetry(url, SNAPSHOT_TIMEOUT_MS);
    if (!resp.ok) {
      console.warn(`[hlgaming] HTTP ${resp.status} fetching snapshot for UID ${playerUid}`);
      return null;
    }
    const json = (await resp.json()) as HlApiResponse;
    const cs = json?.data?.CS_CAREER;
    if (!cs) {
      console.warn(`[hlgaming] No CS_CAREER data for UID ${playerUid}`);
      return null;
    }
    const snap: CsCareerSnapshot = {
      gamesPlayed: Number(cs.games_played ?? 0),
      wins:        Number(cs.wins        ?? 0),
      kills:       Number(cs.kills       ?? 0),
      damage:      Number(cs.damage      ?? 0),
      deaths:      Number(cs.deaths      ?? 0),
      assists:     Number(cs.assists     ?? 0),
      fetchedAt:   new Date().toISOString(),
    };
    setCache(playerUid, snap);
    return snap;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[hlgaming] Error fetching snapshot for UID ${playerUid}:`, msg);
    return null;
  }
}
