import { Router } from "express";
import crypto from "crypto";
import { requireSuperAdmin } from "../middlewares/auth.js";
import { attachCredentials } from "../lib/quickmatch-matches.js";
import {
  fetchAndStorePreSnapshots,
  settleQuickMatch,
  SNAPSHOT_DELAY_MS,
} from "../lib/quickmatch-settlement.js";
import { pushToUser } from "../lib/sse-manager.js";
import { getSystemSettings, saveSystemSettings } from "../lib/systemSettings.js";

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
// Loaded from persistent settings so it survives server restarts.
// If no secret exists yet, one is generated once and saved immediately.
function loadOrCreateSecret(): string {
  if (process.env.PHONE_HOST_SECRET) return process.env.PHONE_HOST_SECRET;
  const stored = getSystemSettings().phoneHostSecret;
  if (stored) return stored;
  const fresh = crypto.randomBytes(32).toString("hex");
  saveSystemSettings({ phoneHostSecret: fresh });
  return fresh;
}

let phoneHostSecret: string = loadOrCreateSecret();

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
  saveSystemSettings({ phoneHostSecret });
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

// ─── Public: poll current session credentials (for queue page) ───────────────
// Returns { status, roomId, password } only when credentials_ready
// Requires requireAuth so random users can't spam it
router.get("/phone-host/room", (req, res) => {
  maybeExpire();
  if (!currentSession) {
    res.json({ status: "none" });
    return;
  }
  if (currentSession.status === "credentials_ready" && currentSession.credentials) {
    res.json({
      status: "ready",
      roomId: currentSession.credentials.roomId,
      password: currentSession.credentials.password,
      action: currentSession.action,
    });
    return;
  }
  res.json({ status: currentSession.status });
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

  const { roomId, password, action, openInFfUrl, ...extra } = req.body as {
    roomId?: string;
    password?: string;
    action?: string;
    openInFfUrl?: string;
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

  // Attach to any pending quickmatch waiting for a room
  const attachedMatch = attachCredentials(
    String(roomId),
    String(password),
    openInFfUrl ? String(openInFfUrl) : null,
  );

  // Fire pre-snapshots immediately, then settle after SNAPSHOT_DELAY_MS
  if (attachedMatch) {
    console.log(
      `[phone-host] Credentials attached to match ${attachedMatch.id}. ` +
      `Fetching pre-snapshots, settlement in ${SNAPSHOT_DELAY_MS / 1000}s.`,
    );
    fetchAndStorePreSnapshots(attachedMatch).catch((err) =>
      console.error("[phone-host] Pre-snapshot error:", err),
    );
    setTimeout(() => {
      // Skip legacy settlement if the match has entered the screenshot pipeline.
      // checkAndSettleIfEnded already transitions to RESULT_PENDING when stats change,
      // and settleQuickMatch itself guards against those states — this is an extra
      // safety net for the timer path.
      const current = attachedMatch.currentState;
      const screenshotStates = [
        "RESULT_PENDING", "VERIFYING_SCREENSHOT", "PROVISIONAL_WIN",
        "DISPUTE_WINDOW", "FINALIZED", "CANCELLED",
      ];
      if (screenshotStates.includes(current)) {
        console.log(`[phone-host] Skipping 15-min fallback settlement for match ${attachedMatch.id} — state: ${current}`);
        return;
      }
      settleQuickMatch(attachedMatch).catch((err) =>
        console.error("[phone-host] Settlement error:", err),
      );
    }, SNAPSHOT_DELAY_MS);

    // SSE: push credentials to both players immediately (zero-latency vs 2.5s poll)
    const [p1, p2] = attachedMatch.players;
    const credPayload = {
      status:             "ready",
      matchId:            attachedMatch.id,
      createdAt:          attachedMatch.createdAt,
      roomStatus:         "ready",
      roomId:             String(roomId),
      password:           String(password),
      openInFfUrl:        openInFfUrl ? String(openInFfUrl) : null,
      credentialsReadyAt: attachedMatch.credentialsReadyAt ?? null,
      entryFee:           attachedMatch.entryFee,
      prizeAmount:        attachedMatch.prizeAmount,
    };
    if (p1) pushToUser(Number(p1.userId), "quickmatch_match", { ...credPayload, me: { ...p1, uid: null }, opponent: p2 ? { ...p2, uid: null } : null });
    if (p2) pushToUser(Number(p2.userId), "quickmatch_match", { ...credPayload, me: { ...p2, uid: null }, opponent: p1 ? { ...p1, uid: null } : null });
  }

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
