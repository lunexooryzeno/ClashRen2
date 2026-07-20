import { getSystemSettings } from "./systemSettings.js";
import type { CsCareerSnapshot } from "./quickmatch-matches.js";

const HL_BASE    = "https://proapis.hlgamingofficial.com/main/games/freefire/stats/api";
const HL_ACCOUNT = "https://proapis.hlgamingofficial.com/main/games/freefire/account/api";
const SNAPSHOT_TIMEOUT_MS = 15_000;

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
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
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

export async function fetchCsCareerSnapshot(playerUid: string): Promise<CsCareerSnapshot | null> {
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
    const resp = await fetch(url, { signal: AbortSignal.timeout(SNAPSHOT_TIMEOUT_MS) });
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
    return {
      gamesPlayed: Number(cs.games_played ?? 0),
      wins:        Number(cs.wins        ?? 0),
      kills:       Number(cs.kills       ?? 0),
      damage:      Number(cs.damage      ?? 0),
      deaths:      Number(cs.deaths      ?? 0),
      assists:     Number(cs.assists     ?? 0),
      fetchedAt:   new Date().toISOString(),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[hlgaming] Error fetching snapshot for UID ${playerUid}:`, msg);
    return null;
  }
}
