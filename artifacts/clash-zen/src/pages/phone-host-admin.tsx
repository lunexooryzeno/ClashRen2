import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Smartphone, Zap, CheckCircle2, Clock, XCircle, Copy, Check,
  RefreshCw, RotateCcw, ChevronLeft, Shield, Wifi, WifiOff,
  Play, Hash, Lock, ExternalLink, AlertTriangle, Loader2, History,
  ArrowRight, Globe, KeyRound, FileJson, Info, Terminal,
} from "lucide-react";

// ─── Shared super-admin session ───────────────────────────────────────────────
const SESSION_KEY = "czsa_v1_session";

function getSAToken(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as { token: string; expiresAt: number };
    if (Date.now() > s.expiresAt) return null;
    return s.token;
  } catch { return null; }
}

async function saFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const token = getSAToken();
  if (!token) throw new Error("Not authenticated as super admin.");
  return fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "X-Super-Admin-Token": token,
      ...(opts.headers ?? {}),
    },
    credentials: "include",
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────
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

interface Config {
  macroBase: string;
  actions: Record<string, { label: string; path: string; description: string }>;
  callbackUrl: string;
  secret: string;
}

interface StatusPayload {
  current: HostSession | null;
  log: HostSession[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function statusColor(s: HostSession["status"]) {
  if (s === "credentials_ready") return "#22c55e";
  if (s === "waiting_credentials") return "#f59e0b";
  if (s === "triggered") return "#3b82f6";
  return "#71717a";
}

function statusIcon(s: HostSession["status"]) {
  if (s === "credentials_ready") return <CheckCircle2 className="w-4 h-4" style={{ color: statusColor(s) }} />;
  if (s === "waiting_credentials") return <Clock className="w-4 h-4" style={{ color: statusColor(s) }} />;
  if (s === "triggered") return <Loader2 className="w-4 h-4 animate-spin" style={{ color: statusColor(s) }} />;
  return <XCircle className="w-4 h-4" style={{ color: statusColor(s) }} />;
}

function statusLabel(s: HostSession["status"]) {
  if (s === "credentials_ready") return "Credentials Ready";
  if (s === "waiting_credentials") return "Waiting for Room...";
  if (s === "triggered") return "Triggering...";
  return "Expired";
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-95"
      style={{
        background: copied ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.07)",
        border: copied ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.1)",
        color: copied ? "#22c55e" : "#a1a1aa",
      }}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {label ?? (copied ? "Copied!" : "Copy")}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PhoneHostAdminPage() {
  const [, navigate] = useLocation();
  const [authed, setAuthed] = useState(false);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isWaiting = status?.current?.status === "waiting_credentials" || status?.current?.status === "triggered";

  const loadStatus = useCallback(async () => {
    try {
      const r = await saFetch("/api/super-admin/phone-host/status");
      if (r.ok) setStatus(await r.json() as StatusPayload);
    } catch { /* silent */ }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const r = await saFetch("/api/super-admin/phone-host/config");
      if (r.ok) setConfig(await r.json() as Config);
    } catch { /* silent */ }
  }, []);

  // Check auth and load data
  useEffect(() => {
    const token = getSAToken();
    if (!token) { navigate("/286c81443d1fb388d1b9a8e3b280824c"); return; }
    setAuthed(true);
    loadStatus();
    loadConfig();
  }, [navigate, loadStatus, loadConfig]);

  // Poll while waiting for credentials
  useEffect(() => {
    if (!authed) return;
    const interval = isWaiting ? 2_000 : 8_000;
    const id = setInterval(loadStatus, interval);
    return () => clearInterval(id);
  }, [authed, isWaiting, loadStatus]);

  const trigger = async (action: string) => {
    setTriggering(action);
    setError(null);
    try {
      const r = await saFetch("/api/super-admin/phone-host/trigger", {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      const data = await r.json() as { ok?: boolean; error?: string; session?: HostSession };
      if (!r.ok || data.error) {
        setError(data.error ?? "Trigger failed");
      } else {
        await loadStatus();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setTriggering(null);
    }
  };

  const dismiss = async () => {
    await saFetch("/api/super-admin/phone-host/session/dismiss", { method: "POST" });
    await loadStatus();
  };

  const rotateSecret = async () => {
    if (!confirm("Rotate the secret key? MacroDroid will need to be updated immediately.")) return;
    setRotating(true);
    try {
      const r = await saFetch("/api/super-admin/phone-host/secret/rotate", { method: "POST" });
      const data = await r.json() as { ok: boolean; secret: string };
      if (data.ok) {
        setNewSecret(data.secret);
        await loadConfig();
      }
    } finally {
      setRotating(false);
    }
  };

  if (!authed) return null;

  const cur = status?.current;
  const creds = cur?.credentials;

  return (
    <div className="min-h-screen" style={{ background: "#060709", color: "#e4e4e7" }}>

      {/* Header */}
      <div
        className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 border-b"
        style={{ background: "rgba(6,7,9,0.92)", borderColor: "rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}
      >
        <button
          onClick={() => navigate("/286c81443d1fb388d1b9a8e3b280824c")}
          className="p-2 rounded-xl transition-colors"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          <ChevronLeft className="w-4 h-4 text-zinc-400" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}>
            <Smartphone className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <h1 className="text-[14px] font-bold text-white leading-none">Phone Host</h1>
            <p className="text-[11px] text-zinc-500 leading-none mt-0.5">MacroDroid Match Controller</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isWaiting && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)" }}>
              <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Waiting</span>
            </div>
          )}
          {cur?.status === "credentials_ready" && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)" }}>
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-[10px] font-bold text-green-400 uppercase tracking-wider">Ready</span>
            </div>
          )}
          <button onClick={loadStatus} className="p-2 rounded-xl transition-colors" style={{ background: "rgba(255,255,255,0.05)" }}>
            <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-3 p-3 rounded-2xl" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-[13px] text-red-300">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-zinc-500"><XCircle className="w-4 h-4" /></button>
          </div>
        )}

        {/* Current Session Card */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4 text-violet-400" />
              <span className="text-[13px] font-bold text-white">Current Session</span>
            </div>
            {cur && (
              <button onClick={dismiss} className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" /> Dismiss
              </button>
            )}
          </div>

          {!cur ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <WifiOff className="w-8 h-8 text-zinc-700" />
              <p className="text-[13px] text-zinc-500">No active session</p>
              <p className="text-[11px] text-zinc-600">Trigger an action below to start</p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {/* Status row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {statusIcon(cur.status)}
                  <span className="text-[13px] font-semibold" style={{ color: statusColor(cur.status) }}>
                    {statusLabel(cur.status)}
                  </span>
                </div>
                <span className="text-[11px] text-zinc-500">{timeAgo(cur.triggeredAt)}</span>
              </div>

              {/* Action + webhook status */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold text-violet-300" style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.2)" }}>
                  {cur.actionLabel}
                </span>
                {cur.webhookStatus && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                    style={{
                      background: cur.webhookStatus === 200 ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                      border: `1px solid ${cur.webhookStatus === 200 ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
                      color: cur.webhookStatus === 200 ? "#22c55e" : "#f87171",
                    }}
                  >
                    MacroDroid {cur.webhookStatus}
                  </span>
                )}
              </div>

              {/* Credentials */}
              {creds && (
                <div className="rounded-xl p-3 space-y-2.5" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-[11px] font-bold text-green-400 uppercase tracking-wider">Room Credentials</span>
                    <span className="ml-auto text-[10px] text-zinc-500">{timeAgo(creds.receivedAt)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl p-2.5" style={{ background: "rgba(0,0,0,0.3)" }}>
                      <p className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1"><Hash className="w-3 h-3" />Room ID</p>
                      <p className="text-[18px] font-black text-white tabular-nums tracking-wider">{creds.roomId}</p>
                      <div className="mt-1"><CopyButton text={creds.roomId} /></div>
                    </div>
                    <div className="rounded-xl p-2.5" style={{ background: "rgba(0,0,0,0.3)" }}>
                      <p className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1"><Lock className="w-3 h-3" />Password</p>
                      <p className="text-[18px] font-black text-white tabular-nums tracking-wider">{creds.password}</p>
                      <div className="mt-1"><CopyButton text={creds.password} /></div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <CopyButton text={`Room ID: ${creds.roomId}\nPassword: ${creds.password}`} label="Copy Both" />
                  </div>
                </div>
              )}

              {/* Waiting indicator */}
              {(cur.status === "waiting_credentials" || cur.status === "triggered") && (
                <div className="flex items-center gap-2 py-2 px-3 rounded-xl" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.15)" }}>
                  <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  <span className="text-[12px] text-amber-300">Waiting for MacroDroid to post room credentials…</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Trigger Actions */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="text-[13px] font-bold text-white">Trigger Action</span>
          </div>
          <div className="p-4 space-y-2">
            {config ? (
              Object.entries(config.actions).map(([key, act]) => (
                <button
                  key={key}
                  onClick={() => trigger(key)}
                  disabled={triggering !== null}
                  className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{
                    background: triggering === key ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.04)",
                    border: triggering === key ? "1px solid rgba(139,92,246,0.35)" : "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.2)" }}>
                    {triggering === key
                      ? <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                      : <Play className="w-4 h-4 text-violet-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-white">{act.label}</p>
                    <p className="text-[11px] text-zinc-500 truncate">{act.description}</p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                </button>
              ))
            ) : (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
              </div>
            )}
          </div>
        </div>

        {/* MacroDroid Configuration Guide */}
        {config && (
          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <Smartphone className="w-4 h-4 text-cyan-400" />
              <span className="text-[13px] font-bold text-white">MacroDroid Setup</span>
            </div>
            <div className="p-4 space-y-3">

              {/* Webhook base */}
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">MacroDroid Webhook Base</p>
                <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <code className="text-[11px] text-cyan-300 flex-1 break-all">{config.macroBase}</code>
                  <CopyButton text={config.macroBase} />
                </div>
              </div>

              {/* Actions list */}
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Webhook Triggers</p>
                <div className="space-y-1.5">
                  {Object.entries(config.actions).map(([key, act]) => (
                    <div key={key} className="p-2.5 rounded-xl" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-semibold text-white">{act.label}</span>
                        <CopyButton text={config.macroBase + act.path} label="Copy URL" />
                      </div>
                      <code className="text-[10px] text-zinc-400 break-all">{config.macroBase + act.path}</code>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Credential Callback — full MacroDroid HTTP Action reference ── */}
              <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)" }}>
                {/* Header */}
                <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: "rgba(16,185,129,0.15)", background: "rgba(16,185,129,0.08)" }}>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2.5} />
                  <span className="text-[11px] font-black text-emerald-400 uppercase tracking-widest">Credential Callback — MacroDroid HTTP Action</span>
                </div>

                <div className="p-3 space-y-3">
                  {/* Info note */}
                  <div className="flex items-start gap-2 p-2 rounded-xl" style={{ background: "rgba(0,0,0,0.25)" }}>
                    <Info className="w-3.5 h-3.5 text-zinc-500 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      After MacroDroid creates the room in Free Fire, add an <strong className="text-white">HTTP Action</strong> in your macro to POST the credentials below. The server will forward them to waiting players automatically.
                    </p>
                  </div>

                  {/* Step 1 — Method + URL */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Globe className="w-3 h-3 text-cyan-400" />
                      <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Step 1 · Endpoint</span>
                    </div>
                    <div className="flex items-stretch gap-2">
                      <div className="flex items-center px-2.5 py-2 rounded-xl shrink-0" style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)" }}>
                        <span className="text-[11px] font-black text-indigo-300">POST</span>
                      </div>
                      <div className="flex-1 flex items-center gap-2 px-2.5 py-2 rounded-xl overflow-hidden" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <code className="text-[10px] text-emerald-300 flex-1 break-all leading-relaxed">{config.callbackUrl}</code>
                        <CopyButton text={config.callbackUrl} />
                      </div>
                    </div>
                  </div>

                  {/* Step 2 — Header */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <KeyRound className="w-3 h-3 text-amber-400" />
                      <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Step 2 · Auth Header</span>
                    </div>
                    <div className="p-2.5 rounded-xl space-y-1.5" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="flex items-center justify-between">
                        <code className="text-[10px] text-zinc-400">Header name</code>
                        <CopyButton text="X-Phone-Host-Key" label="Copy" />
                      </div>
                      <code className="text-[12px] font-bold text-amber-300 block">X-Phone-Host-Key</code>
                      <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
                      <div className="flex items-center justify-between">
                        <code className="text-[10px] text-zinc-400">Header value — use secret from Security section</code>
                      </div>
                      <code className="text-[11px] text-rose-300 block break-all">{newSecret ?? config.secret}</code>
                      <CopyButton text={newSecret ?? config.secret} label="Copy Secret" />
                    </div>
                  </div>

                  {/* Step 3 — Body */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <FileJson className="w-3 h-3 text-violet-400" />
                      <span className="text-[10px] font-black text-violet-400 uppercase tracking-widest">Step 3 · JSON Body</span>
                    </div>
                    <div className="p-2.5 rounded-xl" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="flex items-center justify-between mb-2">
                        <code className="text-[10px] text-zinc-500">Content-Type: application/json</code>
                        <CopyButton
                          text={`{\n  "roomId": "[ROOM_ID_VARIABLE]",\n  "password": "[PASSWORD_VARIABLE]",\n  "action": "host_cs_1v1"\n}`}
                          label="Copy Body"
                        />
                      </div>
                      <pre className="text-[11px] text-zinc-200 leading-relaxed overflow-x-auto">{`{
  "roomId":  "[room_id_macro_var]",
  "password": "[password_macro_var]",
  "action":  "host_cs_1v1"
}`}</pre>
                      <p className="text-[10px] text-zinc-600 mt-2">
                        Replace <code className="text-amber-200">[room_id_macro_var]</code> and <code className="text-amber-200">[password_macro_var]</code> with the MacroDroid local variables where you store the room ID and password read from the screen.
                      </p>
                    </div>
                  </div>

                  {/* Step 4 — cURL reference */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Terminal className="w-3 h-3 text-fuchsia-400" />
                      <span className="text-[10px] font-black text-fuchsia-400 uppercase tracking-widest">Step 4 · cURL Reference (test / MacroDroid shell action)</span>
                    </div>
                    <div className="p-2.5 rounded-xl" style={{ background: "rgba(0,0,0,0.45)", border: "1px solid rgba(168,85,247,0.2)" }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] text-zinc-500">Paste into shell or use in MacroDroid "Run Shell Script" action</span>
                        <CopyButton
                          text={[
                            `curl -X POST "${config.callbackUrl}" \\`,
                            `  -H "Content-Type: application/json" \\`,
                            `  -H "X-Phone-Host-Key: ${newSecret ?? config.secret}" \\`,
                            `  -d '{`,
                            `    "roomId":    "123456",`,
                            `    "password":  "abc123",`,
                            `    "action":    "host_cs_1v1",`,
                            `    "openInFfUrl": ""`,
                            `  }'`,
                          ].join("\n")}
                          label="Copy cURL"
                        />
                      </div>
                      <pre
                        className="text-[10px] leading-relaxed overflow-x-auto select-all"
                        style={{ color: "#d4d4d8", fontFamily: "monospace" }}
                      >{`curl -X POST "${config.callbackUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-Phone-Host-Key: ${newSecret ?? config.secret}" \\
  -d '{
    "roomId":     "123456",
    "password":   "abc123",
    "action":     "host_cs_1v1",
    "openInFfUrl": ""
  }'`}</pre>
                      <div className="mt-2.5 space-y-1 border-t pt-2" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                        <p className="text-[10px] text-zinc-500 font-semibold">Fields:</p>
                        <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px]">
                          <code className="text-amber-300">roomId</code>
                          <span className="text-zinc-500">Free Fire room ID (required)</span>
                          <code className="text-amber-300">password</code>
                          <span className="text-zinc-500">Room password (required)</span>
                          <code className="text-amber-300">action</code>
                          <span className="text-zinc-500">Which macro triggered this — e.g. <code className="text-zinc-400">host_cs_1v1</code></span>
                          <code className="text-amber-300">openInFfUrl</code>
                          <span className="text-zinc-500">Deep-link to open room in FF app (optional)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expected response */}
                  <div className="flex items-start gap-2 p-2.5 rounded-xl" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-0.5">Expected Response</p>
                      <code className="text-[10px] text-zinc-300">HTTP 200 · </code>
                      <code className="text-[10px] text-zinc-400">{"{ \"ok\": true }"}</code>
                      <p className="text-[10px] text-zinc-600 mt-1">Any non-200 means the secret is wrong or the server is down. Check the secret and retry.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Security */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <Shield className="w-4 h-4 text-rose-400" />
            <span className="text-[13px] font-bold text-white">Security</span>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Callback Secret Key</p>
                <button onClick={() => setShowSecret(v => !v)} className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
                  {showSecret ? "Hide" : "Show"}
                </button>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <code className="text-[11px] text-rose-300 flex-1 break-all">
                  {showSecret
                    ? (newSecret ?? config?.secret ?? "Loading…")
                    : "•".repeat(16) + " (hidden)"}
                </code>
                {showSecret && config && (
                  <CopyButton text={newSecret ?? config.secret} />
                )}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1.5">
                Set this as <code className="text-amber-300">X-Phone-Host-Key</code> header in MacroDroid's HTTP action.
              </p>
            </div>

            <button
              onClick={rotateSecret}
              disabled={rotating}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
            >
              {rotating
                ? <Loader2 className="w-4 h-4 text-red-400 animate-spin" />
                : <RotateCcw className="w-4 h-4 text-red-400" />}
              <span className="text-[12px] font-bold text-red-400">Rotate Secret Key</span>
            </button>
            <p className="text-[11px] text-zinc-600">Rotating invalidates the current key — update MacroDroid immediately after.</p>
          </div>
        </div>

        {/* Session Log */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <button
            onClick={() => setShowLog(v => !v)}
            className="w-full px-4 py-3 flex items-center gap-2 border-b transition-colors hover:bg-white/[0.02]"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
          >
            <History className="w-4 h-4 text-zinc-400" />
            <span className="text-[13px] font-bold text-white">Session Log</span>
            <span className="ml-auto text-[11px] text-zinc-500">{status?.log.length ?? 0} entries</span>
          </button>

          {showLog && (
            <div className="divide-y" style={{ divideColor: "rgba(255,255,255,0.04)" }}>
              {!status?.log.length ? (
                <p className="text-center py-6 text-[12px] text-zinc-600">No history yet</p>
              ) : (
                status.log.map((s) => (
                  <div key={s.id} className="px-4 py-3 flex items-start gap-3">
                    {statusIcon(s.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-semibold text-white">{s.actionLabel}</span>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: statusColor(s.status) }}>
                          {s.status.replace("_", " ")}
                        </span>
                      </div>
                      {s.credentials && (
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Room: <span className="text-white font-bold">{s.credentials.roomId}</span> · Pass: <span className="text-white font-bold">{s.credentials.password}</span>
                        </p>
                      )}
                      <p className="text-[10px] text-zinc-600 mt-0.5">{timeAgo(s.triggeredAt)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="h-8" />
      </div>
    </div>
  );
}
