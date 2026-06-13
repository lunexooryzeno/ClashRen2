import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { getSystemSettings, type SystemSettings } from "../lib/systemSettings.js";

const router: IRouter = Router();

export interface NormalizedProfile {
  accountId: string;
  nickname: string;
  level: number;
  rank: number;
  rankingPoints: number;
  region: string;
  liked: number;
  exp: string;
  creditScore: number;
  primeLevel: number;
  signature: string;
  pet: { level: number; exp: number } | null;
  source: "hlgaming" | "gameskinbo";
}

async function fetchFromHLGaming(uid: string, region: string, settings: SystemSettings): Promise<NormalizedProfile | null> {
  const useruid = process.env.HL_GAMING_USERUID || settings.hlGamingUseruid;
  const apiKey = process.env.HL_GAMING_API_KEY || settings.hlGamingApiKey;
  if (!useruid || !apiKey) return null;

  try {
    const url = new URL("https://proapis.hlgamingofficial.com/main/games/freefire/account/api");
    url.searchParams.set("sectionName", "AllData");
    url.searchParams.set("PlayerUid", uid);
    url.searchParams.set("region", region);
    url.searchParams.set("useruid", useruid);
    url.searchParams.set("api", apiKey);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(9000) });
    if (!res.ok) return null;

    const data = await res.json() as Record<string, unknown>;
    const result = (data.result ?? data) as Record<string, unknown>;
    const ai = (result.AccountInfo ?? {}) as Record<string, unknown>;
    if (!ai.AccountName) return null;

    const ci = (result.creditScoreInfo ?? {}) as Record<string, unknown>;
    const si = (result.socialinfo ?? {}) as Record<string, unknown>;
    const pi = (result.petInfo ?? null) as Record<string, unknown> | null;

    return {
      accountId: uid,
      nickname: String(ai.AccountName),
      level: Number(ai.AccountLevel ?? 0),
      rank: Number(ai.BrMaxRank ?? 0),
      rankingPoints: Number(ai.BrRankPoint ?? 0),
      region: String(ai.AccountRegion ?? region).toUpperCase(),
      liked: Number(ai.AccountLikes ?? 0),
      exp: String(ai.AccountEXP ?? 0),
      creditScore: Number(ci.creditScore ?? 100),
      primeLevel: 0,
      signature: String(si.AccountSignature ?? ""),
      pet: pi && pi.level ? { level: Number(pi.level), exp: Number(pi.exp ?? 0) } : null,
      source: "hlgaming",
    };
  } catch {
    return null;
  }
}

async function fetchFromGameskinbo(uid: string, region: string, settings: SystemSettings): Promise<NormalizedProfile | null> {
  const apiKey = process.env.GAMESKINBO_API_KEY || settings.gameskinboApiKey;
  if (!apiKey) return null;

  try {
    const url = new URL("https://api.gameskinbo.com/ff-info/get");
    url.searchParams.set("uid", uid);
    url.searchParams.set("region", region.toUpperCase());

    const res = await fetch(url.toString(), {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;

    const data = await res.json() as Record<string, unknown>;
    const ai = (data.AccountInfo ?? {}) as Record<string, unknown>;
    if (!ai.AccountName) return null;

    const ap = (data.AccountProfileInfo ?? {}) as Record<string, unknown>;

    return {
      accountId: uid,
      nickname: String(ai.AccountName),
      level: Number(ai.AccountLevel ?? 0),
      rank: Number(ap.BrMaxRank ?? 0),
      rankingPoints: Number(ap.BrRankPoint ?? 0),
      region: String(ai.AccountRegion ?? region).toUpperCase(),
      liked: Number(ai.AccountLikes ?? 0),
      exp: String(ai.AccountEXP ?? 0),
      creditScore: 100,
      primeLevel: 0,
      signature: "",
      pet: null,
      source: "gameskinbo",
    };
  } catch {
    return null;
  }
}

router.get("/freefire/player", requireAuth, async (req, res) => {
  const { uid, region = "ind" } = req.query as { uid?: string; region?: string };

  if (!uid || !/^\d{8,14}$/.test(uid)) {
    return res.status(400).json({ error: "Invalid UID. Must be 8–14 digits." });
  }

  const normalizedRegion = String(region).toLowerCase();
  const settings = getSystemSettings();

  // ── Source 1: HL Gaming (primary) ──────────────────────────────────────────
  const hlgaming = await fetchFromHLGaming(uid, normalizedRegion, settings);
  if (hlgaming) {
    return res.json(hlgaming);
  }

  // ── Source 2: Gameskinbo (secondary) ───────────────────────────────────────
  const gameskinbo = await fetchFromGameskinbo(uid, normalizedRegion, settings);
  if (gameskinbo) {
    return res.json(gameskinbo);
  }

  // ── Source 3: Manual fallback ───────────────────────────────────────────────
  return res.json({ manual: true, uid });
});

// Test endpoint — returns status of each configured source (admin only)
router.get("/freefire/sources", requireAuth, async (req, res) => {
  const settings = getSystemSettings();

  const hlGamingConfigured = !!(process.env.HL_GAMING_USERUID || settings.hlGamingUseruid) &&
                             !!(process.env.HL_GAMING_API_KEY || settings.hlGamingApiKey);
  const gameskinboConfigured = !!(process.env.GAMESKINBO_API_KEY || settings.gameskinboApiKey);

  return res.json({
    primary: { name: "HL Gaming", configured: hlGamingConfigured },
    secondary: { name: "Gameskinbo", configured: gameskinboConfigured },
    fallback: { name: "Manual Entry", always: true },
  });
});

export default router;
