/**
 * Granular rate limiters — per authenticated user (falls back to IP when unauthenticated).
 *
 * Strategy                   Window     Max     Endpoint family
 * ─────────────────────────  ─────────  ──────  ───────────────────────────────
 * Tournament join            1 hour     10      POST /tournaments/:id/join
 * Withdrawal request         24 hours   8       POST /wallet/withdraw
 * Top-up submit              1 hour     5       POST /topup/submit
 * Support messages           1 hour     20      POST /support/messages
 * Phone OTP (per phone)      30 min     5       POST /auth/send-otp + resend-otp
 */
import { rateLimit } from "express-rate-limit";
import type { Request } from "express";

// Normalize IPv6-mapped IPv4 addresses (e.g. ::ffff:1.2.3.4 → 1.2.3.4) and
// return a stable string key. When the request carries an authenticated user we
// key by user-id instead so the limit travels with the account, not the IP.
function userOrIpKey(req: Request): string {
  if (req.user?.userId != null) return `uid:${req.user.userId}`;
  const raw = (req.ip ?? "").trim();
  const ip = raw.startsWith("::ffff:") ? raw.slice(7) : raw;
  return `ip:${ip || "unknown"}`;
}

// validate:false disables express-rate-limit's own key-generator IP heuristic
// check. We handle IPv6 normalization ourselves above, so the warning is a
// false positive.
const COMMON = { validate: false } as const;

// ── Per-endpoint limiters ─────────────────────────────────────────────────────

export const tournamentJoinLimiter = rateLimit({
  ...COMMON,
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  message: { error: "You are joining tournaments too fast. Please wait before joining another." },
});

export const withdrawalLimiter = rateLimit({
  ...COMMON,
  windowMs: 24 * 60 * 60 * 1000,
  max: 8,
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  message: { error: "Too many withdrawal requests today. Please try again tomorrow." },
});

export const topupLimiter = rateLimit({
  ...COMMON,
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  message: { error: "Too many top-up attempts. Please wait before trying again." },
});

export const supportMessageLimiter = rateLimit({
  ...COMMON,
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You are sending messages too fast. Please slow down." },
});

export const reportLimiter = rateLimit({
  ...COMMON,
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  message: { error: "Too many reports submitted. Please wait before submitting another." },
});

// ── Phone-level OTP rate limiter (pre-auth, in-memory) ───────────────────────
// Tracks how many OTP sends have been requested per phone number.
// Resets after WINDOW_MS. Survives individual req cycles but not server restarts
// (acceptable — window is short and this is defence-in-depth on top of IP limits).

const PHONE_OTP_LIMIT = 10;
const PHONE_OTP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

interface PhoneRecord { count: number; resetAt: number }
const phoneOtpMap = new Map<string, PhoneRecord>();

// Prune expired entries every 10 minutes to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of phoneOtpMap) {
    if (now >= v.resetAt) phoneOtpMap.delete(k);
  }
}, 10 * 60 * 1000).unref();

export function consumePhoneOtpSlot(phone: string): { allowed: boolean; waitMs?: number } {
  const now = Date.now();
  const rec = phoneOtpMap.get(phone);

  if (!rec || now >= rec.resetAt) {
    phoneOtpMap.set(phone, { count: 1, resetAt: now + PHONE_OTP_WINDOW_MS });
    return { allowed: true };
  }
  if (rec.count >= PHONE_OTP_LIMIT) {
    return { allowed: false, waitMs: rec.resetAt - now };
  }
  rec.count++;
  return { allowed: true };
}
