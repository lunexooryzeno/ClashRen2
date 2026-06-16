import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Gem, Copy, Check, Shield, Loader2,
  CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptics";

const DEFAULT_UPI_ID = "BHARATPE2V0D0M2C0A10930@unitype";
const DEFAULT_UPI_NAME = "BharatPe Merchant";
const POLL_MS = 2_500;

interface SessionData {
  sessionId: number;
  exactAmount: number;
  paisaOffset: number;
  expiresAt: string;
  diamonds: number;
  restored: boolean;
}

interface PaymentSettings {
  upiId: string;
  upiName: string;
  ratePerDiamond: number;
  minTopup: number;
  isEnabled: boolean;
}

type PageStatus = "loading" | "active" | "completed" | "expired" | "error";

function useCountdown(expiresAt: string | null): number {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setRemaining(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return remaining;
}

export default function TopUpPayPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { invalidateUser } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const rupees   = parseInt(params.get("rupees")   ?? "0");
  const diamonds = parseInt(params.get("diamonds") ?? "0");

  const [status, setStatus]     = useState<PageStatus>("loading");
  const [session, setSession]   = useState<SessionData | null>(null);
  const [copied, setCopied]     = useState(false);
  const [mounted, setMounted]   = useState(false);
  const [settings, setSettings] = useState<PaymentSettings>({
    upiId: DEFAULT_UPI_ID, upiName: DEFAULT_UPI_NAME,
    ratePerDiamond: 0.5, minTopup: 10, isEnabled: true,
  });

  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<SessionData | null>(null);

  const remaining = useCountdown(session?.expiresAt ?? null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startPolling = useCallback((sid: number) => {
    stopPolling();
    const doPoll = async () => {
      try {
        const res = await fetch(`/api/topup/session/${sid}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json() as { status: string; diamonds: number };
        if (data.status === "completed") {
          stopPolling();
          setStatus("completed");
          haptic.successTap();
          invalidateUser();
          toast({ title: "Payment confirmed! 💎", description: `${data.diamonds} diamonds added to your wallet.` });
          setTimeout(() => setLocation("/wallet"), 2000);
        } else if (data.status === "expired" || data.status === "cancelled") {
          stopPolling();
          setStatus("expired");
        }
      } catch { /* ignore network blips */ }
    };
    doPoll();
    pollRef.current = setInterval(doPoll, POLL_MS);
  }, [stopPolling, invalidateUser, toast, setLocation]);

  // SSE listener for instant topup_verified event
  useEffect(() => {
    const handleSSE = (e: Event) => {
      const data = (e as CustomEvent).detail as { sessionId?: number };
      if (sessionRef.current && data.sessionId === sessionRef.current.sessionId) {
        stopPolling();
        setStatus("completed");
        haptic.successTap();
        invalidateUser();
        setTimeout(() => setLocation("/wallet"), 2000);
      }
    };
    window.addEventListener("topup_verified", handleSSE);
    return () => window.removeEventListener("topup_verified", handleSSE);
  }, [stopPolling, invalidateUser, setLocation]);

  // Warn before close if payment is pending
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (status === "active") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status]);

  // Create session on mount
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const t = setTimeout(() => setMounted(true), 40);

    fetch("/api/payment-settings")
      .then(r => r.json())
      .then((s: PaymentSettings) => setSettings(s))
      .catch(() => {});

    if (!rupees || !diamonds) {
      setStatus("error");
      clearTimeout(t);
      return;
    }

    fetch("/api/topup/session", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rupees, diamonds }),
    })
      .then(r => r.json())
      .then((data: SessionData & { error?: string }) => {
        if (data.error) { setStatus("error"); return; }
        setSession(data);
        sessionRef.current = data;
        setStatus("active");
        if (data.restored) {
          toast({ title: "Session restored", description: "Your active payment session has been resumed." });
        }
        startPolling(data.sessionId);
      })
      .catch(() => setStatus("error"));

    return () => { clearTimeout(t); stopPolling(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const upiId   = settings.upiId;
  const upiName = settings.upiName;
  const exactAmount = session?.exactAmount ?? rupees;
  const upiUrl  = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&cu=INR&am=${exactAmount.toFixed(2)}&tn=${encodeURIComponent("ClashRen Diamond Top-up")}`;

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timerStr = `${mins}:${secs.toString().padStart(2, "0")}`;
  const timerUrgent = remaining > 0 && remaining <= 60;

  // ── Loading ──────────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center profile-page-bg">
        <div className="h-[2px] w-full btn-primary-gradient opacity-80 absolute top-0 left-0" />
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "hsl(var(--primary))" }} />
        <p className="text-sm text-zinc-500 mt-3">Preparing your payment session…</p>
      </div>
    );
  }

  // ── Completed ─────────────────────────────────────────────────────────────
  if (status === "completed") {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center profile-page-bg px-6">
        <div className="h-[2px] w-full btn-primary-gradient opacity-80 absolute top-0 left-0" />
        <div className="flex flex-col items-center gap-5 text-center max-w-xs">
          <div className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)" }}>
            <CheckCircle2 className="w-9 h-9 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white mb-1.5">Payment Detected! 🎉</h2>
            <p className="text-[13px] text-zinc-400">Your diamonds are being added. Redirecting…</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
            <Gem className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-bold text-white">+{session?.diamonds ?? diamonds} diamonds</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Expired ───────────────────────────────────────────────────────────────
  if (status === "expired") {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center profile-page-bg px-6">
        <div className="h-[2px] w-full btn-primary-gradient opacity-80 absolute top-0 left-0" />
        <button
          onClick={() => setLocation("/top-up")}
          className="absolute top-5 left-4 w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <div className="flex flex-col items-center gap-5 text-center max-w-xs">
          <div className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <Clock className="w-9 h-9 text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white mb-1.5">Session Expired</h2>
            <p className="text-[13px] text-zinc-400 leading-relaxed">
              Your 5-minute payment window has ended. If you already paid, contact support with your bank reference number.
            </p>
          </div>
          <button
            onClick={() => setLocation("/top-up")}
            className="w-full h-12 rounded-2xl text-white font-bold text-sm btn-primary-gradient flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
          <button
            onClick={() => setLocation("/support")}
            className="w-full h-10 rounded-2xl font-semibold text-sm active:scale-[0.98]"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
            Contact Support
          </button>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center profile-page-bg px-6">
        <div className="h-[2px] w-full btn-primary-gradient opacity-80 absolute top-0 left-0" />
        <div className="flex flex-col items-center gap-5 text-center max-w-xs">
          <div className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <XCircle className="w-9 h-9 text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white mb-1.5">Could not start session</h2>
            <p className="text-[13px] text-zinc-400">Please try again or contact support.</p>
          </div>
          <button onClick={() => setLocation("/top-up")}
            className="w-full h-12 rounded-2xl text-white font-bold text-sm btn-primary-gradient active:scale-[0.98] transition-transform">
            Back to Top-Up
          </button>
        </div>
      </div>
    );
  }

  // ── Active — QR screen ────────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden profile-page-bg">
      <div className="absolute top-0 right-0 w-[260px] h-[260px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)" }} />
      <div className="h-[2px] w-full btn-primary-gradient opacity-80" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-2 relative z-10"
        style={{ animation: mounted ? "pay-slide-up 0.35s ease both" : "none" }}>
        <button
          onClick={() => {
            if (status === "active") {
              if (!confirm("Your payment session is still active. Close anyway?")) return;
            }
            setLocation("/top-up");
          }}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <span className="text-[11px] text-muted-foreground uppercase tracking-[0.2em] font-bold">Complete Payment</span>

        {/* Timer */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
          style={{
            background: timerUrgent ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)",
            border: timerUrgent ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(255,255,255,0.1)",
          }}>
          <Clock className={`w-3 h-3 ${timerUrgent ? "text-red-400" : "text-zinc-400"}`} />
          <span className={`text-[11px] font-mono font-bold ${timerUrgent ? "text-red-300" : "text-zinc-300"}`}>
            {timerStr}
          </span>
        </div>
      </div>

      <div className="px-4 flex flex-col gap-3 relative z-10 pb-24"
        style={{ animation: mounted ? "pay-slide-up 0.4s 0.08s ease both" : "none" }}>

        {/* Order summary */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "hsl(var(--card))", border: "1px solid rgba(139,92,246,0.2)" }}>
          <div className="px-4 py-2.5 flex items-center gap-2"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(139,92,246,0.06)" }}>
            <Gem className="w-3.5 h-3.5 text-violet-400" strokeWidth={2} />
            <span className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] font-bold">Order Summary</span>
          </div>
          <div className="px-4 py-3 flex justify-between items-center">
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5">You Pay</p>
              <p className="text-2xl font-extrabold font-heading text-white">
                ₹{exactAmount.toFixed(2)}
              </p>
            </div>
            <div className="flex flex-col items-center px-3">
              <div className="w-px h-8" style={{ background: "rgba(255,255,255,0.08)" }} />
            </div>
            <div className="text-right">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5">You Receive</p>
              <p className="text-2xl font-extrabold font-heading text-blue-300 flex items-center gap-1.5 justify-end">
                <Gem className="w-5 h-5 text-blue-400" strokeWidth={1.5} />
                {(session?.diamonds ?? diamonds).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Paisa offset notice */}
        {(session?.paisaOffset ?? 0) > 0 && (
          <div className="rounded-xl px-3.5 py-2.5 flex items-start gap-2.5"
            style={{ background: "rgba(234,88,12,0.08)", border: "1px solid rgba(234,88,12,0.2)" }}>
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-px" />
            <p className="text-[11px] text-orange-300/90 leading-relaxed">
              ₹0.0{session?.paisaOffset} extra added as a <span className="font-bold">transaction identification fee</span> — this helps us match your payment automatically.
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

        {/* Auto-detect notice */}
        <div className="rounded-xl px-3.5 py-2.5 flex items-center gap-2.5"
          style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)" }}>
          <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <p className="text-[11px] text-emerald-300/80 leading-relaxed">
            Payment auto-detects in real time. Diamonds are credited <span className="font-bold">instantly</span> after we confirm your payment — no UTR needed.
          </p>
        </div>

        {/* Waiting indicator */}
        <div className="flex items-center justify-center gap-2 py-2">
          <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
          <span className="text-[12px] text-zinc-500">Waiting for payment…</span>
        </div>

      </div>

      {/* Sticky bottom note */}
      <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-6 pt-3"
        style={{ background: "linear-gradient(to top, rgba(2,2,6,0.98) 60%, transparent 100%)" }}>
        <p className="text-center text-[11px] text-zinc-600 leading-relaxed">
          Pay exactly <span className="text-zinc-400 font-semibold">₹{exactAmount.toFixed(2)}</span> to ensure auto-detection.
          Session expires in <span className={timerUrgent ? "text-red-400 font-semibold" : "text-zinc-400 font-semibold"}>{timerStr}</span>.
        </p>
      </div>
    </div>
  );
}
