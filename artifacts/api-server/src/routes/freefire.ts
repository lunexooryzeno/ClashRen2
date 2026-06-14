import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { getSystemSettings } from "../lib/systemSettings.js";

const router: IRouter = Router();

const FF_API_BASE = "https://developers.freefirecommunity.com/api/v1";
const VALID_REGIONS = new Set(["ind", "sg", "id", "br", "us", "th", "vn", "my", "pk", "bd"]);

router.get("/freefire/player", requireAuth, async (req, res) => {
  const { uid, region = "ind" } = req.query as { uid?: string; region?: string };

  if (!uid || !/^\d{8,14}$/.test(uid)) {
    return res.status(400).json({ error: "Invalid UID. Must be 8–14 digits." });
  }

  const normalizedRegion = String(region).toLowerCase();
  if (!VALID_REGIONS.has(normalizedRegion)) {
    return res.status(400).json({ error: "Invalid region." });
  }

  const apiKey = process.env.FREEFIRE_API_KEY || getSystemSettings().freefireApiKey;
  if (!apiKey) {
    return res.status(500).json({ error: "Free Fire API key not configured." });
  }

  try {
    const url = new URL(`${FF_API_BASE}/info`);
    url.searchParams.set("region", normalizedRegion);
    url.searchParams.set("uid", uid);

    const ffRes = await fetch(url.toString(), {
      headers: {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        "content-type": "application/json",
        "pragma": "no-cache",
        "referer": "https://developers.freefirecommunity.com/en/dashboard/playground",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
        "x-api-key": apiKey,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!ffRes.ok) {
      if (ffRes.status === 404) {
        return res.status(404).json({ error: "Player not found. Check the UID and region." });
      }
      return res.status(502).json({ error: "Failed to fetch player data. Try again." });
    }

    const data = await ffRes.json() as Record<string, unknown>;

    // Return only the fields we actually use — keeps response lean
    const basic = (data.basicInfo ?? {}) as Record<string, unknown>;
    const credit = (data.creditScoreInfo ?? {}) as Record<string, unknown>;
    const pet = (data.petInfo ?? {}) as Record<string, unknown>;
    const social = (data.socialInfo ?? {}) as Record<string, unknown>;
    const prime = (basic.primePrivilegeDetail ?? {}) as Record<string, unknown>;

    return res.json({
      accountId: basic.accountId,
      nickname: basic.nickname,
      level: basic.level,
      rank: basic.rank,
      rankingPoints: basic.rankingPoints,
      region: basic.region,
      liked: basic.liked,
      exp: basic.exp,
      creditScore: credit.creditScore ?? 100,
      primeLevel: (prime.primeLevel as number) ?? 0,
      signature: social.signature ?? "",
      pet: pet.id
        ? { level: pet.level, exp: pet.exp }
        : null,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return res.status(504).json({ error: "Free Fire API timed out. Try again." });
    }
    return res.status(502).json({ error: "Failed to reach Free Fire API." });
  }
});

export default router;
