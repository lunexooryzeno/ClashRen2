import { Router } from "express";
import crypto from "crypto";
import { requireSuperAdmin } from "../middlewares/auth.js";

const router = Router();

// ─── MacroDroid config ───────────────────────────────────────────────────────
const MACRO_BASE = "https://trigger.macrodroid.com/98315e1f-abce-4c9f-ab7d-87004928eb82";

const ACTIONS: Record<string, { label: string; path: string; description: string }> = {
  launch_game: {
    label: "Launch Game",
    path: "/clashren.launch_game",
    description: "Opens Free Fire on the host phone",
  },
  host_cs_1v1: {
    label: "Host CS 1v1 (Solo)",
    path: "/clashren.host_cs_1v1",
    description: "Creates a Clash Squad 1v1 custom room and returns credentials",
  },
};

// ─── Secret key for credential callback ─────────────────────────────────────
let phoneHostSecret: string =
  process.env.PHONE_HOST_SECRET ?? crypto.randomBytes(32).toString("hex");

// ─── In-memory session state ─────────────────────────────────────────────────
interface HostCredentials {
  roomId: string;
  password: string;
  receivedAt: string;
  extra?: Record<string, unknown>;
}

interface HostSession {
  id: string;
  action: string;
  actionLabel: string;
  status: "triggered" | "waiting_credentials" | "credentials_ready" | "expired";
  triggeredAt: string;
  webhookStatus?: number;
  credentials?: HostCredentials;
}

let currentSession: HostSession | null = null;
const sessionLog: HostSession[] = [];
const MAX_LOG = 30;
const SESSION_TIMEOUT_MS = 12 * 60 * 1000; // 12 min

function archiveCurrent(status: HostSession["status"] = "expired") {
  if (!currentSession) return;
  currentSession.status = status;
  sessionLog.unshift({ ...currentSession });
  if (sessionLog.length > MAX_LOG) sessionLog.pop();
  currentSession = null;
}

function maybeExpire() {
  if (!currentSession) return;
  if (currentSession.status === "credentials_ready") return;
  const age = Date.now() - new Date(currentSession.triggeredAt).getTime();
  if (age > SESSION_TIMEOUT_MS) archiveCurrent("expired");
}

// ─── Admin: status ───────────────────────────────────────────────────────────
router.get("/super-admin/phone-host/status", requireSuperAdmin, (_req, res) => {
  maybeExpire();
  res.json({ current: currentSession, log: sessionLog.slice(0, 15) });
});

// ─── Admin: config (webhook URLs + secret) ───────────────────────────────────
router.get("/super-admin/phone-host/config", requireSuperAdmin, (req, res) => {
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol;
  const host  = req.headers["x-forwarded-host"] ?? req.get("host");
  const baseUrl = `${proto}://${host}`;
  res.json({
    macroBase: MACRO_BASE,
    actions: ACTIONS,
    callbackUrl: `${baseUrl}/api/phone-host/credentials`,
    secret: phoneHostSecret,
  });
});

// ─── Admin: rotate secret ────────────────────────────────────────────────────
router.post("/super-admin/phone-host/secret/rotate", requireSuperAdmin, (_req, res) => {
  phoneHostSecret = crypto.randomBytes(32).toString("hex");
  res.json({ ok: true, secret: phoneHostSecret });
});

// ─── Admin: dismiss/clear current session ────────────────────────────────────
router.post("/super-admin/phone-host/session/dismiss", requireSuperAdmin, (_req, res) => {
  archiveCurrent("expired");
  res.json({ ok: true });
});

// ─── Admin: trigger a MacroDroid action ──────────────────────────────────────
router.post("/super-admin/phone-host/trigger", requireSuperAdmin, async (req, res) => {
  const { action } = req.body as { action?: string };
  if (!action || !ACTIONS[action]) {
    res.status(400).json({ error: `Unknown action. Valid: ${Object.keys(ACTIONS).join(", ")}` });
    return;
  }

  maybeExpire();
  if (currentSession && currentSession.status !== "credentials_ready") {
    archiveCurrent("expired");
  } else if (currentSession) {
    archiveCurrent("credentials_ready");
  }

  const session: HostSession = {
    id: crypto.randomUUID(),
    action,
    actionLabel: ACTIONS[action].label,
    status: "triggered",
    triggeredAt: new Date().toISOString(),
  };
  currentSession = session;

  try {
    const webhookUrl = MACRO_BASE + ACTIONS[action].path;
    const resp = await fetch(webhookUrl, {
      method: "GET",
      signal: AbortSignal.timeout(12_000),
    });
    session.webhookStatus = resp.status;
    session.status = resp.ok ? "waiting_credentials" : "triggered";
    res.json({ ok: resp.ok, session, webhookUrl, webhookStatus: resp.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    session.status = "expired";
    archiveCurrent("expired");
    res.status(502).json({ error: `Webhook call failed: ${msg}` });
  }
});

// ─── Public: MacroDroid credential callback ──────────────────────────────────
// MacroDroid POST to /api/phone-host/credentials
// Headers: X-Phone-Host-Key: <secret>
// Body: { "roomId": "...", "password": "...", "action": "..." }
router.post("/phone-host/credentials", (req, res) => {
  const key = req.headers["x-phone-host-key"];
  if (!key || key !== phoneHostSecret) {
    res.status(401).json({ error: "Invalid or missing X-Phone-Host-Key header." });
    return;
  }

  const { roomId, password, action, ...extra } = req.body as {
    roomId?: string;
    password?: string;
    action?: string;
    [k: string]: unknown;
  };

  if (!roomId || !password) {
    res.status(400).json({ error: "roomId and password are required in the request body." });
    return;
  }

  maybeExpire();

  const creds: HostCredentials = {
    roomId: String(roomId),
    password: String(password),
    receivedAt: new Date().toISOString(),
    extra: Object.keys(extra).length ? extra : undefined,
  };

  if (currentSession) {
    currentSession.credentials = creds;
    currentSession.status = "credentials_ready";
    res.json({ ok: true, message: "Credentials attached to active session." });
  } else {
    const orphan: HostSession = {
      id: crypto.randomUUID(),
      action: action ?? "unknown",
      actionLabel: action ?? "Orphaned callback",
      status: "credentials_ready",
      triggeredAt: new Date().toISOString(),
      credentials: creds,
    };
    sessionLog.unshift(orphan);
    if (sessionLog.length > MAX_LOG) sessionLog.pop();
    res.json({ ok: true, message: "Credentials stored (no active session). Check session log." });
  }
});

export default router;
