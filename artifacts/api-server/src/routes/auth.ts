import { Router, type IRouter, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable, otpSessionsTable, loginHistoryTable, notificationsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { signToken } from "../lib/jwt.js";
import bcrypt from "bcryptjs";
import { consumePhoneOtpSlot } from "../middleware/rate-limiter.js";
import { pushToUser } from "../lib/sse-manager.js";

const router: IRouter = Router();

function isAuthPrivateIp(ip: string): boolean {
  return (
    ip === "::1" || ip === "::ffff:127.0.0.1" ||
    ip.startsWith("127.") || ip.startsWith("10.") ||
    ip.startsWith("192.168.") || ip.startsWith("172.")
  );
}

async function recordLoginGeo(ip: string, loginId: number): Promise<void> {
  try {
    const r = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName`);
    if (!r.ok) return;
    const geo = await r.json() as { status: string; country?: string; regionName?: string };
    if (geo.status === "success") {
      await db.update(loginHistoryTable)
        .set({ country: geo.country ?? null, region: geo.regionName ?? null })
        .where(eq(loginHistoryTable.id, loginId));
    }
  } catch { /* ignore */ }
}

function parseBrowserLabel(ua: string): string {
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  if (/Android/i.test(ua) && /Chrome/i.test(ua)) return "Android · Chrome";
  if (/Android/i.test(ua)) return "Android";
  if (/CriOS/i.test(ua)) return "Chrome iOS";
  if (/FxiOS/i.test(ua)) return "Firefox iOS";
  if (/EdgA?\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua)) return "Opera";
  if (/Chrome/i.test(ua)) return "Chrome";
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/Safari/i.test(ua)) return "Safari";
  return "Unknown browser";
}

async function sendLoginAlert(userId: number, ua: string | null, ip: string | null, method: string, isNewUser: boolean): Promise<void> {
  try {
    const browser = ua ? parseBrowserLabel(ua) : "Unknown device";
    const ipLabel = ip && !isAuthPrivateIp(ip) ? ` · ${ip}` : "";
    const methodLabel = method === "2fa" ? "2FA passcode" : "OTP";

    const title = isNewUser ? "Account Created" : "New Login Detected";
    const body = isNewUser
      ? `Welcome! Signed in via ${methodLabel} from ${browser}${ipLabel}`
      : `Signed in via ${methodLabel} from ${browser}${ipLabel}`;

    await db.insert(notificationsTable).values({
      userId,
      type: "security",
      title,
      body,
    });
  } catch { /* non-blocking */ }
}

function generatePlatformId(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const rand4 = () => Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * 26)]).join("");
  const rand8 = () => Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join("");
  return `CZEN${rand4()}${rand8()}`;
}

async function getUniquePlatformId(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const id = generatePlatformId();
    const existing = await db.query.usersTable.findFirst({ where: (u, { eq }) => eq(u.platformId, id), columns: { id: true } });
    if (!existing) return id;
  }
  throw new Error("Could not generate unique platform ID");
}

const COOKIE_NAME = "clash_zen_session";
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const OTP_EXPIRY_MINUTES = 10;

function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  });
}

// Creates (or replaces) an OTP session for this phone and returns a
// browser-side token the frontend must present to complete-login.
// Antcloud is called from the browser — not the server — to avoid network
// blocks that antcloud imposes on non-browser requests.
async function createOtpSession(phone: string): Promise<string> {
  await db.delete(otpSessionsTable).where(eq(otpSessionsTable.phone, phone));
  const browserToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  await db.insert(otpSessionsTable).values({
    phone,
    otpCode: browserToken,
    expiresAt,
    attempts: 0,
    verified: 0,
    antcloudSession: null,
  });
  return browserToken;
}

router.post("/auth/send-otp", async (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
    res.status(400).json({ error: "Only Indian mobile numbers (+91) are supported. Enter a valid 10-digit number starting with 6, 7, 8, or 9." });
    return;
  }

  const fullPhone = `+91${phone}`;

  // Phone-level rate limit: max 5 OTP sends per phone per 30 min
  const phoneCheck = consumePhoneOtpSlot(fullPhone);
  if (!phoneCheck.allowed) {
    const waitMin = Math.ceil((phoneCheck.waitMs ?? 0) / 60000);
    res.status(429).json({ error: `Too many OTP requests for this number. Please wait ${waitMin} minute${waitMin !== 1 ? "s" : ""} before trying again.` });
    return;
  }

  // Create DB session — antcloud OTP is sent from the browser to avoid server-side network blocks
  const browserToken = await createOtpSession(fullPhone);
  res.json({ browserToken });
});

// Called after the browser has verified OTP with antcloud directly.
// Accepts { phone, browserToken } — the token was issued by send-otp/resend-otp
// and proves the request was rate-checked by our server before antcloud was called.
router.post("/auth/verify-otp", async (req, res) => {
  const { phone, browserToken, deviceId: fpDeviceId, fingerprint: fpFingerprint } = req.body as {
    phone?: string; browserToken?: string; deviceId?: string; fingerprint?: string;
  };
  const authIp = (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null
  );
  if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
    res.status(400).json({ error: "Only Indian mobile numbers (+91) are supported." });
    return;
  }
  if (!browserToken) {
    res.status(400).json({ error: "Missing session token. Please request a new OTP." });
    return;
  }

  const fullPhone = `+91${phone}`;
  const now = new Date();

  const session = await db.query.otpSessionsTable.findFirst({
    where: and(
      eq(otpSessionsTable.phone, fullPhone),
      eq(otpSessionsTable.otpCode, browserToken),
      gt(otpSessionsTable.expiresAt, now),
    ),
  });

  if (!session) {
    res.status(400).json({ error: "Session expired or invalid. Please request a new OTP." });
    return;
  }
  if (session.verified) {
    res.status(400).json({ error: "Session already used. Please request a new OTP." });
    return;
  }

  await db.update(otpSessionsTable).set({ verified: 1 }).where(eq(otpSessionsTable.id, session.id));

  let isNewUser = false;
  let user = await db.query.usersTable.findFirst({ where: eq(usersTable.phone, fullPhone) });
  if (!user) {
    isNewUser = true;
    const platformId = await getUniquePlatformId();
    const [newUser] = await db.insert(usersTable).values({
      phone: fullPhone,
      diamondBalance: 0,
      isAdmin: false,
      platformId,
    }).returning();
    user = newUser;
  }

  if (user.status === "deleted") {
    res.status(403).json({ error: "This account has been deleted." });
    return;
  }
  if (user.status === "blocked") {
    const until = user.blockedUntil;
    if (until && until <= new Date()) {
      await db.update(usersTable).set({ status: "active", blockedAt: null, blockedReason: null, blockedUntil: null }).where(eq(usersTable.id, user.id));
    } else {
      const untilText = until ? ` until ${until.toLocaleDateString()}.` : ".";
      const reason = user.blockedReason ? ` Reason: ${user.blockedReason}` : "";
      res.status(403).json({ error: `Your account has been blocked${untilText}${reason}` });
      return;
    }
  }

  const newSv = (user.sessionVersion ?? 1) + 1;
  await db.update(usersTable).set({ sessionVersion: newSv }).where(eq(usersTable.id, user.id));
  pushToUser(user.id, "session_superseded", { code: "SESSION_SUPERSEDED" });

  const token = signToken({ userId: user.id, phone: user.phone, isAdmin: user.isAdmin, sv: newSv });
  setSessionCookie(res, token);

  let loginId: number | null = null;
  try {
    const [ins] = await db.insert(loginHistoryTable).values({
      userId: user.id,
      ip: authIp,
      userAgent: (req.headers["user-agent"] as string) ?? null,
      deviceId: fpDeviceId ?? null,
      fingerprint: fpFingerprint ?? null,
      method: "otp",
      isNewUser,
    }).returning({ id: loginHistoryTable.id });
    loginId = ins?.id ?? null;
  } catch { /* non-blocking */ }

  res.json({
    token,
    user: {
      id: user.id,
      phone: user.phone,
      inGameName: user.inGameName,
      uid: user.uid,
      diamondBalance: user.diamondBalance,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt.toISOString(),
    },
    isNewUser,
  });

  if (loginId && authIp && !isAuthPrivateIp(authIp)) void recordLoginGeo(authIp, loginId);
  void sendLoginAlert(user.id, (req.headers["user-agent"] as string) ?? null, authIp, "otp", isNewUser);
});

router.post("/auth/resend-otp", async (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
    res.status(400).json({ error: "Only Indian mobile numbers (+91) are supported." });
    return;
  }

  const fullPhone = `+91${phone}`;

  const phoneCheck = consumePhoneOtpSlot(fullPhone);
  if (!phoneCheck.allowed) {
    const waitMin = Math.ceil((phoneCheck.waitMs ?? 0) / 60000);
    res.status(429).json({ error: `Too many OTP requests for this number. Please wait ${waitMin} minute${waitMin !== 1 ? "s" : ""} before trying again.` });
    return;
  }

  const browserToken = await createOtpSession(fullPhone);
  res.json({ browserToken });
});

// Called by the frontend to complete login after the browser has verified OTP with antcloud.
// Accepts { phone, browserToken } — the token was issued by send-otp and proves
// the OTP flow was rate-checked before antcloud was called from the browser.
// If the user has 2FA enabled, returns { requires2fa: true } first.
router.post("/auth/complete-login", async (req, res) => {
  const { phone, browserToken, passcode, deviceId: fpDeviceId, fingerprint: fpFingerprint, _hp } = req.body as {
    phone?: string; browserToken?: string; passcode?: string; deviceId?: string; fingerprint?: string; _hp?: string;
  };

  if (_hp) {
    res.json({ requires2fa: false });
    return;
  }
  const authIp = (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null
  );
  if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
    res.status(400).json({ error: "Only Indian mobile numbers (+91) are supported." });
    return;
  }

  const fullPhone = `+91${phone}`;

  // Validate the browser token if provided (OTP path — not 2FA passcode-only path)
  if (browserToken) {
    const now = new Date();
    const session = await db.query.otpSessionsTable.findFirst({
      where: and(eq(otpSessionsTable.phone, fullPhone), eq(otpSessionsTable.otpCode, browserToken), gt(otpSessionsTable.expiresAt, now)),
    });
    if (!session) {
      res.status(400).json({ error: "Session expired or invalid. Please request a new OTP." });
      return;
    }
    if (session.verified) {
      res.status(400).json({ error: "Session already used. Please request a new OTP." });
      return;
    }
    await db.update(otpSessionsTable).set({ verified: 1 }).where(eq(otpSessionsTable.id, session.id));
  }

  let isNewUser = false;
  let user = await db.query.usersTable.findFirst({ where: eq(usersTable.phone, fullPhone) });
  if (!user) {
    isNewUser = true;
    const platformId = await getUniquePlatformId();
    const [newUser] = await db
      .insert(usersTable)
      .values({ phone: fullPhone, diamondBalance: 0, isAdmin: false, platformId })
      .returning();
    user = newUser;
  }

  if (user.status === "deleted") {
    res.status(403).json({
      suspended: true,
      status: "deleted",
      reason: (user as unknown as Record<string, unknown>).deleteReason as string | null ?? null,
    });
    return;
  }
  if (user.status === "blocked") {
    const until = user.blockedUntil;
    if (until && until <= new Date()) {
      await db.update(usersTable).set({ status: "active", blockedAt: null, blockedReason: null, blockedUntil: null }).where(eq(usersTable.id, user.id));
    } else {
      res.status(403).json({
        suspended: true,
        status: "blocked",
        reason: user.blockedReason ?? null,
        blockedUntil: until ? until.toISOString() : null,
      });
      return;
    }
  }

  // 2FA check: if the user has 2FA enabled, require the passcode before issuing a session
  if (user.twoFaEnabled && user.twoFaPassword) {
    if (!passcode) {
      res.json({ requires2fa: true });
      return;
    }
    const match = await bcrypt.compare(passcode, user.twoFaPassword);
    if (!match) {
      res.status(400).json({ error: "Invalid 2FA passcode. Please try again." });
      return;
    }
  }

  const newSv = (user.sessionVersion ?? 1) + 1;
  await db.update(usersTable).set({ sessionVersion: newSv }).where(eq(usersTable.id, user.id));
  // Immediately notify any older active SSE connections that they've been superseded
  pushToUser(user.id, "session_superseded", { code: "SESSION_SUPERSEDED" });

  const loginMethod = (user.twoFaEnabled && passcode) ? "2fa" : "otp";
  const token = signToken({ userId: user.id, phone: user.phone, isAdmin: user.isAdmin, sv: newSv });
  setSessionCookie(res, token);

  let loginId: number | null = null;
  try {
    const [ins] = await db.insert(loginHistoryTable).values({
      userId: user.id,
      ip: authIp,
      userAgent: (req.headers["user-agent"] as string) ?? null,
      deviceId: fpDeviceId ?? null,
      fingerprint: fpFingerprint ?? null,
      method: loginMethod,
      isNewUser,
    }).returning({ id: loginHistoryTable.id });
    loginId = ins?.id ?? null;
  } catch { /* non-blocking */ }

  res.json({
    token,
    user: {
      id: user.id,
      phone: user.phone,
      inGameName: user.inGameName,
      uid: user.uid,
      diamondBalance: user.diamondBalance,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt.toISOString(),
    },
    isNewUser,
  });

  if (loginId && authIp && !isAuthPrivateIp(authIp)) void recordLoginGeo(authIp, loginId);
  void sendLoginAlert(user.id, (req.headers["user-agent"] as string) ?? null, authIp, loginMethod, isNewUser);
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ message: "Logged out successfully" });
});

export default router;
