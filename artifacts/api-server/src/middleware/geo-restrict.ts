import type { Request, Response, NextFunction } from "express";

const ALLOWED_COUNTRY = "IN";
const cache = new Map<string, { country: string; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function isPrivateOrInternalIP(ip: string): boolean {
  const raw = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (!raw || raw === "127.0.0.1" || raw === "::1") return true;
  if (raw.startsWith("10.")) return true;
  if (raw.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(raw)) return true;
  return false;
}

async function resolveCountry(ip: string): Promise<string | null> {
  const cached = cache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.country;

  try {
    const res = await fetch(`https://ip-api.io/json/${ip}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { country_code?: string };
    const country = data.country_code ?? null;
    if (country) {
      cache.set(ip, { country, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return country;
  } catch {
    return null;
  }
}

export async function requireIndiaIP(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const ip = (req.ip ?? req.socket?.remoteAddress ?? "").trim();

  if (!ip || isPrivateOrInternalIP(ip)) {
    next();
    return;
  }

  const country = await resolveCountry(ip);

  if (country !== null && country !== ALLOWED_COUNTRY) {
    res.status(403).json({
      error: "This service is only available in India.",
    });
    return;
  }

  next();
}
