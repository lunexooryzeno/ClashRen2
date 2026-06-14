import { db } from "@workspace/db";
import { freefireApiKeysTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

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
  source: "gameskinbo";
}

let rrIndex = 0;

async function getActiveKeys() {
  return db.query.freefireApiKeysTable.findMany({
    where: eq(freefireApiKeysTable.isActive, true),
    orderBy: asc(freefireApiKeysTable.id),
  });
}

async function markUsed(id: number) {
  await db.execute(
    `UPDATE freefire_api_keys SET request_count = request_count + 1, last_used_at = NOW() WHERE id = ${id}`
  ).catch(() => {});
}

export async function fetchFreefireProfile(
  uid: string,
  region = "ind",
): Promise<NormalizedProfile | null> {
  const keys = await getActiveKeys();
  if (keys.length === 0) return null;

  const MAX_RETRIES = Math.min(3, keys.length);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const keyRecord = keys[rrIndex % keys.length];
    rrIndex = (rrIndex + 1) % keys.length;

    try {
      const url = new URL("https://api.gameskinbo.com/ff-info/get");
      url.searchParams.set("uid", uid);
      if (region) url.searchParams.set("region", region.toUpperCase());

      const res = await fetch(url.toString(), {
        headers: { "x-api-key": keyRecord.key },
        signal: AbortSignal.timeout(9000),
      });

      if (res.status === 401 || res.status === 429 || res.status === 402) {
        continue;
      }

      if (!res.ok) continue;

      const data = await res.json() as Record<string, unknown>;
      const ai = (data.AccountInfo ?? {}) as Record<string, unknown>;
      if (!ai.AccountName) continue;

      const ap = (data.AccountProfileInfo ?? {}) as Record<string, unknown>;

      void markUsed(keyRecord.id);

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
      continue;
    }
  }

  return null;
}
