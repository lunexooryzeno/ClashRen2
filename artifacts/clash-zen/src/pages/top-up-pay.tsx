import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Gem, Copy, Check, Loader2, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptics";

const DEFAULT_UPI_ID = "BHARATPE2V0D0M2C0A10930@unitype";
const DEFAULT_UPI_NAME = "BharatPe Merchant";
const POLL_INTERVAL_MS = 3000;
const STORAGE_KEY = "clash_topup_session";

interface StoredSession {
  sessionId: number;
  rupees: number;
  diamonds: number;
  expiresAt: string;
}

interface SessionData {
  sessionId: number;
  baseRupees: number;
  offsetPaise: number;
  expiresAt: string;
  status?: string;
}

interface PaymentSettings {
  upiId: string;
  upiName: string;
}

type PageState = "initializing" | "qr" | "success" | "expired" | "error";

function fmtAmount(baseRupees: number, offsetPaise: number): string {
  if (offsetPaise === 0) return String(baseRupees);
  return `${baseRupees}.${String(offsetPaise).padStart(2, "0")}`;
}

function useCountdown(expiresAt: string | null): number {
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    if (!expiresAt) return 300;
    return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      setTimeLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  return timeLeft;
}

export default function TopUpPayPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { invalidateUser } = useAuth();

  const params = new URLSearchParams(window.location.search);
  const rupees   = parseInt(params.get("rupees")   ?? "0");
  const diamonds = parseInt(params.get("diamonds") ?? "0");

  const [pageState, setPageState] = useState<PageState>("initializing");
  const [session, setSession]     = useState<SessionData | null>(null);
  const [copied, setCopied]       = useState(false);
  const [mounted, setMounted]     = useState(false);
  const [settings, setSettings]   = useState<PaymentSettings>({ upiId: DEFAULT_UPI_ID, upiName: DEFAULT_UPI_NAME });
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const sessionRef   = useRef<SessionData | null>(null);

  const timeLeft    = useCountdown(session?.expiresAt ?? null);
  const mins        = Math.floor(timeLeft / 60);
  const secs        = timeLeft % 60;
  const timerLabel  = `${mins}:${String(secs).padStart(2, "0")}`;
  const timerUrgent = timeLeft > 0 && timeLeft < 60;

  const exactAmount = session ? fmtAmount(session.baseRupees, session.offsetPaise) : String(rupees);
  const upiId  = settings.upiId;
  const upiName = settings.upiName;
  const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&cu=INR&tn=${encodeURIComponent("Pay To BharatPe Merchant")}&am=${exactAmount}`;

  function saveSession(sid: number, exp: string) {
    const stored: StoredSession = { sessionId: sid, rupees, diamonds, expiresAt: exp };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }

  function clearStoredSession() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function stopPolling() {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
  }

  const startPolling = useCallback((sessionId: number) => {
    stopPolling();
    const doPoll = async () => {
      if (cancelledRef.current) return;
      try {
        const res = await fetch(`/api/topup/session/${sessionId}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json() as SessionData;

        if (data.status === "completed") {
          stopPolling();
          clearStoredSession();
          haptic.successTap();
          invalidateUser();
          setPageState("success");
          const d = sessionRef.current?.baseRupees ? Math.floor(sessionRef.current.baseRupees / 0.5) : diamonds;
          toast({ title: "Payment confirmed!", description: `Diamonds have been added to your wallet.` });
          setTimeout(() => setLocation("/wallet"), 1800);
        } else if (data.status === "expired") {
          stopPolling();
          clearStoredSession();
          setPageState("expired");
        }
      } catch {
        // ignore network blips
      }
    };

    doPoll();
    pollTimerRef.current = setInterval(doPoll, POLL_INTERVAL_MS);
  }, [diamonds, invalidateUser, toast, setLocation]);

  async function createNewSession() {
    try {
      const res = await fetch("/api/topup/session/create", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rupees, diamonds }),
      });
      const data = await res.json() as SessionData & { error?: string };
      if (!res.ok || !data.sessionId) {
        setErrorMsg(data.error ?? "Could not start payment session. Please try again.");
        setPageState("error");
        return;
      }
      sessionRef.current = data;
      setSession(data);
      saveSession(data.sessionId, data.expiresAt);
      setPageState("qr");
      startPolling(data.sessionId);
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setPageState("error");
    }
  }

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const t = setTimeout(() => setMounted(true), 40);
    cancelledRef.current = false;

    fetch("/api/payment-settings")
      .then(r => r.json())
      .then((s: PaymentSettings) => setSettings(s))
      .catch(() => {});

    // Try to restore an existing session
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const stored: StoredSession = JSON.parse(raw);
        if (stored.rupees === rupees && new Date(stored.expiresAt) > new Date()) {
          fetch(`/api/topup/session/${stored.sessionId}`, { credentials: "include" })
            .then(r => r.json())
            .then((d: SessionData) => {
              if (cancelledRef.current) return;
              if (d.status === "active") {
                const restored: SessionData = {
                  sessionId: stored.sessionId,
                  baseRupees: rupees,
                  offsetPaise: d.offsetPaise,
                  expiresAt: d.expiresAt,
                };
                sessionRef.current = restored;
                setSession(restored);
                setPageState("qr");
                startPolling(stored.sessionId);
              } else if (d.status === "completed") {
                clearStoredSession();
                invalidateUser();
                setPageState("success");
                setTimeout(() => setLocation("/wallet"), 1800);
              } else {
                clearStoredSession();
                createNewSession();
              }
            })
            .catch(() => { clearStoredSession(); createNewSession(); });
          return () => { clearTimeout(t); stopPolling(); cancelledRef.current = true; };
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    createNewSession();
    return () => { clearTimeout(t); stopPolling(); cancelledRef.current = true; };
  }, []);

  // Auto-expire when countdown hits 0
  useEffect(() => {
    if (timeLeft === 0 && pageState === "qr") {
      stopPolling();
      clearStoredSession();
      setPageState("expired");
    }
  }, [timeLeft, pageState]);

  async function handleBack() {
    if (session && pageState === "qr") {
      fetch(`/api/topup/session/${session.sessionId}/cancel`, {
        method: "POST", credentials: "include",
      }).catch(() => {});
      clearStoredSession();
    }
    stopPolling();
    setLocation("/top-up");
  }

  function handleRetry() {
    setPageState("initializing");
    setSession(null);
    sessionRef.current = null;
    setErrorMsg(null);
    createNewSession();
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (pageState === "initializing") {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center profile-page-bg">
        <div className="h-[2px] w-full btn-primary-gradient opacity-80 absolute top-0 left-0" />
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)" }}>
            <Loader2 className="w-7 h-7 text-violet-400 animate-spin" />
          </div>
          <p className="text-sm text-zinc-400">Preparing your payment session…</p>
        </div>
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (pageState === "success") {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center relative overflow-hidden profile-page-bg px-6">
        <div className="h-[2px] w-full btn-primary-gradient opacity-80 absolute top-0 left-0" />
        <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)" }}>
            <CheckCircle2 className="w-9 h-9 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white mb-1.5">Payment Confirmed!</h2>
            <p className="text-[13px] text-zinc-400">Your diamonds have been added. Redirecting…</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Expired ────────────────────────────────────────────────────────────────
  if (pageState === "expired") {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center relative overflow-hidden profile-page-bg px-6">
        <div className="h-[2px] w-full btn-primary-gradient opacity-80 absolute top-0 left-0" />
        <button
          onClick={() => setLocation("/top-up")}
          className="absolute top-5 left-4 w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <div className="w-full max-w-sm flex flex-col items-center gap-5 text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: "rgba(234,88,12,0.1)", border: "1px solid rgba(234,88,12,0.25)" }}>
            <Clock className="w-9 h-9 text-orange-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white mb-1.5">Session Expired</h2>
            <p className="text-[13px] text-zinc-400 leading-relaxed max-w-[260px]">
              Your 5-minute payment window closed. Start a new session to pay.
            </p>
          </div>
          <button onClick={handleRetry}
            className="w-full h-12 rounded-2xl text-white font-bold text-sm btn-primary-gradient active:scale-[0.98] transition-transform">
            Try Again
          </button>
          <button onClick={() => setLocation("/top-up")}
            className="text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors">
            Back to top-up
          </button>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (pageState === "error") {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center relative overflow-hidden profile-page-bg px-6">
        <div className="h-[2px] w-full btn-primary-gradient opacity-80 absolute top-0 left-0" />
        <button
          onClick={() => setLocation("/top-up")}
          className="absolute top-5 left-4 w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <div className="w-full max-w-sm flex flex-col items-center gap-5 text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
            <XCircle className="w-9 h-9 text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white mb-1.5">Something Went Wrong</h2>
            {errorMsg && <p className="text-[13px] text-zinc-400 leading-relaxed">{errorMsg}</p>}
          </div>
          <button onClick={handleRetry}
            className="w-full h-12 rounded-2xl text-white font-bold text-sm btn-primary-gradient active:scale-[0.98] transition-transform">
            Try Again
          </button>
          <button onClick={() => setLocation("/top-up")}
            className="text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors">
            Back to top-up
          </button>
        </div>
      </div>
    );
  }

  // ── QR Screen ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden profile-page-bg">
      <div className="absolute top-0 right-0 w-[260px] h-[260px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)" }} />
      <div className="absolute bottom-1/3 left-0 w-[180px] h-[180px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)" }} />

      <div className="h-[2px] w-full btn-primary-gradient opacity-80" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-2 relative z-10"
        style={{ animation: mounted ? "pay-slide-up 0.35s ease both" : "none" }}>
        <button
          onClick={handleBack}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <span className="text-[11px] text-muted-foreground uppercase tracking-[0.2em] font-bold">
          Complete Payment
        </span>
        {/* Countdown pill */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all"
          style={{
            background: timerUrgent ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)",
            border: timerUrgent ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(255,255,255,0.1)",
          }}>
          <Clock className="w-3 h-3" style={{ color: timerUrgent ? "rgb(248,113,113)" : "rgb(161,161,170)" }} />
          <span className="text-[11px] font-bold font-mono"
            style={{ color: timerUrgent ? "rgb(248,113,113)" : "rgb(161,161,170)" }}>
            {timerLabel}
          </span>
        </div>
      </div>

      <div className="px-4 flex flex-col gap-3 relative z-10 pb-10">

        {/* Order summary */}
        <div className="rounded-2xl overflow-hidden"
          style={{
            background: "hsl(var(--card))",
            border: "1px solid rgba(139,92,246,0.2)",
            animation: mounted ? "pay-slide-up 0.4s 0.06s ease both" : "none",
          }}>
          <div className="px-4 py-2.5 flex items-center gap-2"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(139,92,246,0.06)" }}>
            <Gem className="w-3.5 h-3.5 text-violet-400" strokeWidth={2} />
            <span className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] font-bold">Order Summary</span>
          </div>
          <div className="px-4 py-3 flex justify-between items-center">
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5">You Pay</p>
              <p className="text-2xl font-extrabold font-heading text-white">₹{exactAmount}</p>
            </div>
            <div className="flex flex-col items-center px-3">
              <div className="w-px h-8" style={{ background: "rgba(255,255,255,0.08)" }} />
            </div>
            <div className="text-right">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5">You Receive</p>
              <p className="text-2xl font-extrabold font-heading text-blue-300 flex items-center gap-1.5 justify-end">
                <Gem className="w-5 h-5 text-blue-400" strokeWidth={1.5} />
                {diamonds.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Paisa-offset note */}
        {session && session.offsetPaise > 0 && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
            style={{
              background: "rgba(234,88,12,0.07)",
              border: "1px solid rgba(234,88,12,0.2)",
              animation: mounted ? "pay-fade-in 0.35s 0.12s ease both" : "none",
            }}>
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-orange-300 leading-relaxed">
              Pay exactly <span className="font-bold">₹{exactAmount}</span> — the extra paisa is a transaction identifier.
              You will receive diamonds for the full ₹{session.baseRupees}.
            </p>
          </div>
        )}

        {/* QR card */}
        <div className="rounded-3xl relative overflow-hidden"
          style={{
            background: "linear-gradient(160deg, hsl(var(--card)) 0%, rgba(139,92,246,0.07) 100%)",
            border: "1px solid rgba(139,92,246,0.25)",
            boxShadow: "0 8px 40px rgba(139,92,246,0.12)",
            animation: mounted ? "pay-scale-in 0.45s 0.14s ease both" : "none",
          }}>
          {/* Shimmer sweep */}
          <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
            <div className="absolute top-0 bottom-0 w-1/3"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent)",
                animation: "pay-shimmer 3s 1s infinite ease-in-out",
              }} />
          </div>

          <div className="flex flex-col items-center px-5 pt-5 pb-5 relative z-10">
            <p className="text-[10px] text-violet-400/80 uppercase tracking-[0.18em] font-bold mb-4">Scan & Pay via UPI</p>

            <div className="bg-white p-3 rounded-2xl mb-4"
              style={{ boxShadow: "0 4px 24px rgba(139,92,246,0.2)" }}>
              <QRCodeSVG value={upiUrl} size={180} />
            </div>

            {/* Amount badge */}
            <div className="flex items-center gap-2 mb-4 px-4 py-2 rounded-xl"
              style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)" }}>
              <span className="text-[11px] text-zinc-400">Pay exactly</span>
              <span className="text-base font-extrabold text-white">₹{exactAmount}</span>
            </div>

            {/* UPI ID row */}
            <div className="w-full rounded-2xl px-3 py-2.5 flex items-center justify-between gap-2"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(139,92,246,0.18)" }}>
              <div className="flex flex-col min-w-0">
                <span className="text-[9px] text-zinc-500 uppercase tracking-widest mb-0.5">UPI ID</span>
                <span className="text-[13px] font-mono font-semibold text-foreground truncate">{upiId}</span>
              </div>
              <button
                onClick={() => {
                  haptic.mediumTap();
                  navigator.clipboard.writeText(upiId);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                style={{
                  background: copied ? "rgba(16,185,129,0.15)" : "rgba(139,92,246,0.15)",
                  border: copied ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(139,92,246,0.35)",
                  color: copied ? "rgb(52,211,153)" : "rgb(167,139,250)",
                }}>
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>

        {/* Auto-detection active notice */}
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
          style={{
            background: "rgba(16,185,129,0.06)",
            border: "1px solid rgba(16,185,129,0.18)",
            animation: mounted ? "pay-slide-up 0.4s 0.22s ease both" : "none",
          }}>
          <div className="relative shrink-0">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-50" />
          </div>
          <p className="text-[12px] text-emerald-300 leading-relaxed">
            Watching for your payment automatically — diamonds will be credited the moment it arrives.
          </p>
        </div>

        {/* Don't close warning */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{
            background: "rgba(234,88,12,0.06)",
            border: "1px solid rgba(234,88,12,0.15)",
            animation: mounted ? "pay-slide-up 0.4s 0.28s ease both" : "none",
          }}>
          <AlertTriangle className="w-3.5 h-3.5 text-orange-400/70 shrink-0" />
          <p className="text-[11px] text-orange-300/70">
            Keep this page open — your session is active for {timerLabel}.
          </p>
        </div>

      </div>
    </div>
  );
}
