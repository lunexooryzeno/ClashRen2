import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import {
  ArrowLeft, Gem, ChevronRight, Zap, Star, ScrollText,
  AlertTriangle, X, Eye, Copy, Check, Shield, Loader2,
  CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { haptic } from "@/lib/haptics";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_UPI_ID   = "BHARATPE2V0D0M2C0A10930@unitype";
const DEFAULT_UPI_NAME = "BharatPe Merchant";
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS  = 5 * 60 * 1000;
const SESSION_MINS     = 5;

const PRESETS = [
  { rupees: 10,  tag: null,         accent: "rgba(20,184,166,0.9)"  },
  { rupees: 20,  tag: null,         accent: "rgba(99,102,241,0.9)"  },
  { rupees: 50,  tag: null,         accent: "rgba(59,130,246,0.9)"  },
  { rupees: 100, tag: "Popular",    accent: "rgba(234,88,12,0.9)"   },
  { rupees: 200, tag: null,         accent: "rgba(139,92,246,0.9)"  },
  { rupees: 500, tag: "Best Value", accent: "rgba(16,185,129,0.9)"  },
];

const PARTICLES = [
  { left: "12%", delay: "0s",   dur: "4.2s", size: 10 },
  { left: "28%", delay: "0.8s", dur: "3.6s", size: 7  },
  { left: "47%", delay: "1.5s", dur: "4.8s", size: 12 },
  { left: "63%", delay: "0.3s", dur: "3.9s", size: 8  },
  { left: "78%", delay: "2.1s", dur: "4.4s", size: 6  },
  { left: "91%", delay: "1.1s", dur: "3.3s", size: 9  },
];

type Step = "select" | "qr" | "utr" | "waiting" | "expired";
type PollStatus = "pending" | "verified" | "rejected" | "timeout";

interface PaymentSettings {
  upiId: string; upiName: string;
  ratePerDiamond: number; minTopup: number; isEnabled: boolean;
}
interface SessionData {
  id: number; baseAmount: string; finalAmount: string;
  diamonds: number; status: string; expiresAt: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function FloatingParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {PARTICLES.map((p, i) => (
        <div key={i} className="absolute bottom-0" style={{ left: p.left }}>
          <Gem style={{ width: p.size, height: p.size, color: "hsl(var(--primary))", opacity: 0,
            animation: `topup-float ${p.dur} ${p.delay} infinite ease-in-out` }} strokeWidth={1.5} />
        </div>
      ))}
    </div>
  );
}

function AnimatedCounter({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    if (value === prevRef.current) return;
    prevRef.current = value;
    const start = displayed; const end = value; const diff = end - start;
    const steps = 24; let step = 0;
    const iv = setInterval(() => {
      step++;
      setDisplayed(Math.round(start + diff * (1 - Math.pow(1 - step / steps, 3))));
      if (step >= steps) { setDisplayed(end); clearInterval(iv); }
    }, 18);
    return () => clearInterval(iv);
  }, [value]);
  return <>{displayed.toLocaleString()}</>;
}

// ── Step 1: Amount selector ───────────────────────────────────────────────────
function StepSelect({
  user, rate, minTopup,
  selected, setSelected, custom, setCustom, popKey, setPopKey,
  activeDiamonds, activeRupees, isCreatingSession,
  onContinue, onBack,
}: {
  user: any; rate: number; minTopup: number;
  selected: number | null; setSelected: (n: number | null) => void;
  custom: string; setCustom: (s: string) => void;
  popKey: number; setPopKey: (f: (k: number) => number) => void;
  activeDiamonds: number | null; activeRupees: number | null;
  isCreatingSession: boolean;
  onContinue: () => void; onBack: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 40); return () => clearTimeout(t); }, []);

  const customRupees  = parseInt(custom) || 0;
  const customDiamonds = Math.floor(customRupees / rate);
  const customValid   = customRupees >= minTopup;

  function pick(rupees: number) {
    haptic.mediumTap(); setSelected(rupees); setCustom(""); setPopKey(k => k + 1);
  }

  return (
    <>
      <FloatingParticles />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse, rgba(139,92,246,0.12) 0%, transparent 70%)" }} />
      <div className="absolute bottom-0 right-0 w-64 h-64 pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)" }} />

      <div className="h-[2px] w-full btn-primary-gradient opacity-80" />

      <div className="flex items-center justify-between px-4 pt-5 pb-2 relative z-10"
        style={{ animation: mounted ? "topup-slide-up 0.4s ease both" : "none" }}>
        <button onClick={onBack}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <span className="text-[11px] text-muted-foreground uppercase tracking-[0.2em] font-bold">Diamond Store</span>
        <div className="w-9" />
      </div>

      {/* Hero gem */}
      <div className="flex flex-col items-center pt-4 pb-2 relative z-10">
        <div className="relative flex items-center justify-center mb-3">
          <div className="w-20 h-20 rounded-[28px] flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(59,130,246,0.15))",
              border: "1px solid rgba(139,92,246,0.4)",
              boxShadow: "0 0 40px rgba(139,92,246,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
            }}>
            <Gem className="w-10 h-10 text-blue-300" strokeWidth={1.5} />
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-full"
          style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)" }}>
          <Gem className="w-3.5 h-3.5 text-blue-400" strokeWidth={2} />
          <span className="text-xs font-bold text-white">{(user?.diamondBalance ?? 0).toLocaleString()} Diamonds Available</span>
        </div>
      </div>

      {/* Packages grid */}
      <div className="px-4 pt-4 relative z-10">
        <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-bold mb-3 px-1">Choose a Package</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          {PRESETS.map((pkg, idx) => {
            const diamonds = Math.floor(pkg.rupees / rate);
            const isActive = selected === pkg.rupees && !custom;
            const isBelowMin = pkg.rupees < minTopup;
            return (
              <button key={pkg.rupees} onClick={() => { if (!isBelowMin) pick(pkg.rupees); }}
                disabled={isBelowMin}
                className="relative rounded-2xl p-4 text-left overflow-hidden transition-all duration-200 active:scale-[0.95] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: isActive ? "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.12))" : "hsl(var(--card))",
                  border: isActive ? "1.5px solid rgba(139,92,246,0.6)" : "1px solid rgba(255,255,255,0.08)",
                  boxShadow: isActive ? "0 0 24px rgba(139,92,246,0.2), inset 0 1px 0 rgba(255,255,255,0.08)" : "0 2px 12px rgba(0,0,0,0.3)",
                  animation: mounted ? `topup-card-in 0.4s ${0.1 + idx * 0.08}s ease both` : "none",
                  transform: isActive ? "scale(1.02)" : "scale(1)",
                }}>
                {isActive && (
                  <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                    <div className="absolute top-0 bottom-0 w-1/3"
                      style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)", animation: "topup-shimmer 2s 0.2s infinite ease-in-out" }} />
                  </div>
                )}
                {pkg.tag && (
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md"
                    style={{ background: "rgba(234,88,12,0.85)", border: "1px solid rgba(234,88,12,0.5)" }}>
                    <Star className="w-2.5 h-2.5 text-white" fill="white" />
                    <span className="text-[9px] font-black text-white uppercase tracking-wider">{pkg.tag}</span>
                  </div>
                )}
                <div className="flex items-baseline gap-1 mb-0.5">
                  <span className="text-3xl font-extrabold font-heading text-white leading-none">₹{pkg.rupees}</span>
                </div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3">Rupees</p>
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-md flex items-center justify-center"
                    style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.2)" }}>
                    <Gem className="w-3 h-3 text-blue-400" strokeWidth={2} />
                  </div>
                  <span className="text-sm font-bold text-blue-300">{diamonds.toLocaleString()} diamonds</span>
                </div>
                {isActive && (
                  <div className="absolute bottom-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(139,92,246,0.8)", animation: "topup-pop 0.3s ease both" }}>
                    <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Custom amount */}
        <div className="rounded-2xl relative transition-all duration-300"
          style={{
            background: custom && customRupees > 0 ? "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.08))" : "hsl(var(--card))",
            border: custom && customRupees > 0 ? "1.5px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.08)",
            animation: mounted ? "topup-card-in 0.4s 0.28s ease both" : "none",
          }}>
          <div className="flex items-center gap-1.5 px-4 pt-3.5 pb-2">
            <div className="w-5 h-5 rounded-md flex items-center justify-center"
              style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.25)" }}>
              <Zap className="w-3 h-3 text-violet-400" />
            </div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] font-bold">Custom Amount</span>
          </div>
          <div className="flex items-center gap-3 px-4 pt-3 pb-2"
            style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <span className="text-3xl font-extrabold text-zinc-500 shrink-0">₹</span>
            <input type="number" min={minTopup} value={custom}
              onChange={e => { setCustom(e.target.value); setSelected(null); }}
              placeholder="0"
              className="flex-1 min-w-0 bg-transparent text-3xl font-extrabold text-white placeholder:text-zinc-800 outline-none" />
            {custom && (
              <button onClick={() => { setCustom(""); setSelected(null); }}
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-zinc-500 active:scale-90 transition-transform"
                style={{ background: "rgba(255,255,255,0.06)" }}>
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
          <div className="px-4 pb-3">
            {custom && customRupees > 0 && !customValid
              ? <p className="text-[11px] font-semibold text-red-400">Minimum top-up is ₹{minTopup}</p>
              : <p className="text-[11px] text-zinc-600">Min. ₹{minTopup} per top-up</p>}
          </div>
        </div>
      </div>

      {/* Diamonds preview banner */}
      {activeDiamonds !== null && (
        <div className="px-4 pt-3 pb-2 relative z-10" style={{ animation: "topup-slide-up 0.3s ease both" }}>
          <div className="rounded-2xl px-5 py-3.5 flex items-center gap-4"
            style={{
              background: "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(59,130,246,0.1))",
              border: "1px solid rgba(139,92,246,0.3)",
              boxShadow: "0 4px 24px rgba(139,92,246,0.12)",
            }}>
            <div className="relative">
              {[0, 1].map(i => (
                <div key={i} className="absolute inset-0 rounded-full"
                  style={{ border: "1px solid rgba(59,130,246,0.4)", animation: `topup-pulse-ring 1.8s ${i * 0.9}s infinite ease-out` }} />
              ))}
              <Gem className="w-8 h-8 text-blue-300 relative z-10" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-0.5">You will receive</p>
              <p className="text-2xl font-extrabold font-heading text-white leading-none"
                key={`${popKey}-banner`} style={{ animation: "topup-count-in 0.3s ease both" }}>
                <AnimatedCounter value={activeDiamonds} />
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Value</p>
              <p className="text-sm font-bold text-emerald-400">₹{(activeDiamonds * rate).toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1" style={{ minHeight: 100 }} />

      {/* Sticky CTA */}
      {activeRupees !== null && activeDiamonds !== null && (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-6 pt-4"
          style={{ background: "linear-gradient(to top, rgba(2,2,6,0.98) 60%, transparent 100%)", animation: "topup-slide-up 0.35s ease both" }}>
          <button onClick={onContinue} disabled={isCreatingSession}
            className="w-full h-14 rounded-2xl text-white font-bold text-base btn-primary-gradient flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
            style={{ animation: "topup-btn-glow 2s infinite ease-in-out" }}>
            {isCreatingSession ? "Please wait…" : <><span>Continue</span><ChevronRight className="w-4 h-4 ml-0.5" /></>}
          </button>
        </div>
      )}
    </>
  );
}

// ── Step 2: QR code ───────────────────────────────────────────────────────────
function StepQR({
  session, upiId, upiName, countdown, onNext, onBack,
}: {
  session: SessionData; upiId: string; upiName: string;
  countdown: number; onNext: () => void; onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 40); return () => clearTimeout(t); }, []);

  const finalAmount = parseFloat(session.finalAmount);
  const baseAmount  = parseFloat(session.baseAmount);
  const paisaExtra  = Math.round((finalAmount - baseAmount) * 100);
  const hasPaisa    = paisaExtra > 0;
  const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&cu=INR&tn=${encodeURIComponent("Pay To BharatPe Merchant")}&am=${finalAmount.toFixed(2)}`;
  const countdownMins = Math.floor(countdown / 60);
  const countdownSecs = countdown % 60;

  return (
    <>
      <div className="h-[2px] w-full btn-primary-gradient opacity-80" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-2 relative z-10"
        style={{ animation: mounted ? "pay-slide-up 0.35s ease both" : "none" }}>
        <button onClick={onBack}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <span className="text-[11px] text-muted-foreground uppercase tracking-[0.2em] font-bold">Scan &amp; Pay</span>
        {/* countdown */}
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl"
          style={{
            background: countdown < 60 ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.08)",
            border: `1px solid ${countdown < 60 ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.2)"}`,
          }}>
          <Clock className="w-3 h-3" style={{ color: countdown < 60 ? "rgb(248,113,113)" : "rgb(52,211,153)" }} />
          <span className="text-[12px] font-bold tabular-nums"
            style={{ color: countdown < 60 ? "rgb(248,113,113)" : "rgb(52,211,153)" }}>
            {countdownMins}:{String(countdownSecs).padStart(2, "0")}
          </span>
        </div>
      </div>

      <div className="px-4 flex flex-col gap-3 relative z-10 pb-32">
        {/* Order summary */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "hsl(var(--card))", border: "1px solid rgba(139,92,246,0.2)", animation: mounted ? "pay-slide-up 0.4s 0.06s ease both" : "none" }}>
          <div className="px-4 py-2.5 flex items-center gap-2"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(139,92,246,0.06)" }}>
            <Gem className="w-3.5 h-3.5 text-violet-400" strokeWidth={2} />
            <span className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] font-bold">Order Summary</span>
          </div>
          <div className="px-4 py-3 flex justify-between items-center">
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5">You Pay</p>
              <p className="text-2xl font-extrabold font-heading text-white">₹{finalAmount.toFixed(2)}</p>
            </div>
            <div className="w-px h-10" style={{ background: "rgba(255,255,255,0.08)" }} />
            <div className="text-right">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5">You Receive</p>
              <p className="text-2xl font-extrabold font-heading text-blue-300 flex items-center gap-1.5 justify-end">
                <Gem className="w-5 h-5 text-blue-400" strokeWidth={1.5} />
                {session.diamonds.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Paisa offset notice */}
        {hasPaisa && (
          <div className="rounded-2xl px-4 py-3 flex items-start gap-3"
            style={{ background: "rgba(234,88,12,0.07)", border: "1px solid rgba(234,88,12,0.3)", animation: mounted ? "pay-slide-up 0.4s 0.1s ease both" : "none" }}>
            <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
            <p className="text-[12px] text-orange-200 leading-relaxed">
              This additional charge of <span className="font-bold text-orange-300">{paisaExtra} paisa</span> is
              the transaction charge. Pay the <span className="font-bold text-white">exact amount ₹{finalAmount.toFixed(2)}</span>, or your top-up will fail.
            </p>
          </div>
        )}

        {/* QR card */}
        <div className="rounded-3xl relative overflow-hidden"
          style={{
            background: "linear-gradient(160deg, hsl(var(--card)) 0%, rgba(139,92,246,0.07) 100%)",
            border: "1px solid rgba(139,92,246,0.25)",
            boxShadow: "0 8px 40px rgba(139,92,246,0.12)",
            animation: mounted ? "pay-scale-in 0.45s 0.12s ease both" : "none",
          }}>
          <div className="flex flex-col items-center px-5 pt-5 pb-5 relative z-10">
            <p className="text-[10px] text-violet-400/80 uppercase tracking-[0.18em] font-bold mb-4">Scan &amp; Pay via UPI</p>
            <div className="bg-white p-3 rounded-2xl mb-4" style={{ boxShadow: "0 4px 24px rgba(139,92,246,0.2)" }}>
              <QRCodeSVG value={upiUrl} size={180} />
            </div>
            <div className="w-full rounded-2xl px-3 py-2.5 flex items-center justify-between gap-2"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(139,92,246,0.18)" }}>
              <div className="flex flex-col min-w-0">
                <span className="text-[9px] text-zinc-500 uppercase tracking-widest mb-0.5">UPI ID</span>
                <span className="text-[13px] font-mono font-semibold text-foreground truncate">{upiId}</span>
              </div>
              <button
                onClick={() => { haptic.mediumTap(); navigator.clipboard.writeText(upiId); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
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
            <div className="mt-3 w-full rounded-xl px-3 py-2 flex items-center justify-between"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="text-[11px] text-zinc-500">Pay exactly</span>
              <span className="text-[15px] font-extrabold text-white tabular-nums">₹{finalAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-6 pt-4"
        style={{ background: "linear-gradient(to top, rgba(2,2,6,0.98) 60%, transparent 100%)" }}>
        <button onClick={() => { haptic.mediumTap(); onNext(); }}
          className="w-full h-14 rounded-2xl text-white font-bold text-base btn-primary-gradient flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          style={{ boxShadow: "0 0 32px rgba(234,88,12,0.4)" }}>
          I've Made Payment
        </button>
      </div>
    </>
  );
}

// ── Step 3: UTR Entry ─────────────────────────────────────────────────────────
function StepUTR({
  session, utr, setUtr, isSubmitting, onSubmit, onBack,
}: {
  session: SessionData; utr: string; setUtr: (s: string) => void;
  isSubmitting: boolean; onSubmit: () => void; onBack: () => void;
}) {
  return (
    <>
      <div className="h-[2px] w-full btn-primary-gradient opacity-80" />

      <div className="flex items-center justify-between px-4 pt-5 pb-2 relative z-10"
        style={{ animation: "pay-step-in 0.35s ease both" }}>
        <button onClick={onBack}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <span className="text-[11px] text-muted-foreground uppercase tracking-[0.2em] font-bold">Enter Reference No.</span>
        <div className="w-9" />
      </div>

      <div className="px-4 flex flex-col gap-3 relative z-10 pb-32" style={{ animation: "pay-step-in 0.35s ease both" }}>
        <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
          style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.07)" }}>
          <span className="text-sm text-zinc-400">Amount paid</span>
          <span className="text-sm font-bold text-white">₹{parseFloat(session.finalAmount).toFixed(2)}</span>
        </div>

        <div className="rounded-3xl overflow-hidden"
          style={{
            background: "linear-gradient(160deg, hsl(var(--card)) 0%, rgba(59,130,246,0.06) 100%)",
            border: "1px solid rgba(59,130,246,0.2)",
            boxShadow: "0 8px 32px rgba(59,130,246,0.08)",
          }}>
          <div className="px-4 py-2.5 flex items-center gap-2"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(59,130,246,0.06)" }}>
            <Shield className="w-3.5 h-3.5 text-blue-400" strokeWidth={2} />
            <span className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] font-bold">UTR / Reference No.</span>
          </div>
          <div className="px-4 py-4">
            <p className="text-[11px] text-zinc-500 mb-3">Find this in your UPI app's payment receipt</p>
            <div className="rounded-2xl px-4 py-3"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <input type="text" inputMode="numeric" value={utr}
                onChange={e => setUtr(e.target.value.replace(/\D/g, ""))}
                placeholder="Enter payment reference number"
                maxLength={12} autoFocus
                className="w-full bg-transparent text-xl font-bold text-foreground placeholder:text-zinc-700 outline-none tracking-widest" />
            </div>
            <div className="mt-3 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Where to find your UTR</p>
                <ul className="flex flex-col gap-1">
                  {[
                    "Open your UPI app (GPay, PhonePe, Paytm…)",
                    "Go to transaction history or recent payments",
                    "Tap the payment made to this merchant",
                    "Look for UTR / Reference No. — 12 digits",
                  ].map((hint, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-orange-400 mt-px"
                        style={{ background: "rgba(234,88,12,0.12)" }}>{i + 1}</span>
                      <span className="text-[11px] text-zinc-500 leading-relaxed">{hint}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 py-1">
          <Zap className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-[11px] text-zinc-500">Secured · encrypted · verified by our team</span>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-6 pt-4"
        style={{ background: "linear-gradient(to top, rgba(2,2,6,0.98) 60%, transparent 100%)" }}>
        <button onClick={onSubmit} disabled={utr.trim().length < 6 || isSubmitting}
          className="w-full h-14 rounded-2xl text-white font-bold text-base btn-primary-gradient flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ boxShadow: utr.trim().length >= 6 ? "0 0 32px rgba(234,88,12,0.35)" : "none" }}>
          {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : "Submit & Verify"}
        </button>
      </div>
    </>
  );
}

// ── Step 4: Waiting / result ──────────────────────────────────────────────────
function StepWaiting({
  utr, finalAmount, pollStatus, pollElapsed, rejectedReason,
  onRetry, onNewTopup,
}: {
  utr: string; finalAmount: number; pollStatus: PollStatus;
  pollElapsed: number; rejectedReason: string | null;
  onRetry: () => void; onNewTopup: () => void;
}) {
  const [, setLocation] = useLocation();
  const mins = Math.floor(pollElapsed / 60);
  const secs = pollElapsed % 60;
  const elapsedStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return (
    <>
      <div className="h-[2px] w-full btn-primary-gradient opacity-80" />
      <div className="absolute top-0 right-0 w-[260px] h-[260px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)" }} />

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6 py-16">
        {pollStatus === "pending" && (
          <>
            <div className="relative">
              <div className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ background: "rgba(234,88,12,0.1)", border: "1px solid rgba(234,88,12,0.25)" }}>
                <Loader2 className="w-9 h-9 text-orange-400 animate-spin" />
              </div>
              <div className="absolute inset-0 rounded-full animate-ping opacity-20"
                style={{ background: "rgba(234,88,12,0.3)" }} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-1.5">Verifying Payment</h2>
              <p className="text-[13px] text-zinc-400 leading-relaxed max-w-[260px]">
                We're confirming your transaction. This usually takes a few seconds.
              </p>
            </div>
            <div className="w-full rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="text-left">
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-0.5">UTR / Reference</p>
                <p className="text-[14px] font-mono font-bold text-white tracking-widest">{utr}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-0.5">Amount Paid</p>
                <p className="text-[14px] font-bold text-white">₹{finalAmount.toFixed(2)}</p>
              </div>
            </div>
            <p className="text-[11px] text-zinc-600">Checking for {elapsedStr}…</p>
          </>
        )}

        {pollStatus === "verified" && (
          <>
            <div className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)" }}>
              <CheckCircle2 className="w-9 h-9 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-1.5">Payment Confirmed!</h2>
              <p className="text-[13px] text-zinc-400">Your diamonds have been added. Redirecting…</p>
            </div>
          </>
        )}

        {(pollStatus === "rejected" || pollStatus === "timeout") && (
          <>
            <div className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
              <XCircle className="w-9 h-9 text-red-400" />
            </div>
            <div className="w-full">
              <h2 className="text-xl font-bold text-white mb-1.5">
                {pollStatus === "timeout" ? "Verification Timed Out" : "Payment Rejected"}
              </h2>
              <p className="text-[13px] text-zinc-400 leading-relaxed">
                {pollStatus === "timeout"
                  ? "We couldn't confirm your payment in time. Contact support if you paid."
                  : "Your transaction could not be verified."}
              </p>
              {rejectedReason && (
                <div className="mt-3 px-4 py-3 rounded-2xl text-left"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <p className="text-[10px] text-red-400/70 uppercase tracking-wider font-bold mb-1">Reason</p>
                  <p className="text-[13px] text-red-300 leading-relaxed">{rejectedReason}</p>
                </div>
              )}
            </div>
            <button onClick={onRetry}
              className="w-full h-12 rounded-2xl text-white font-bold text-sm btn-primary-gradient active:scale-[0.98] transition-transform">
              Try Again
            </button>
            <button onClick={() => setLocation("/support")}
              className="w-full h-12 rounded-2xl font-bold text-sm active:scale-[0.98] transition-transform"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>
              Contact Support
            </button>
            <button onClick={onNewTopup} className="text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors">
              Start a new top-up
            </button>
          </>
        )}
      </div>
    </>
  );
}

// ── Step 5: Expired ───────────────────────────────────────────────────────────
function StepExpired({ onRestart }: { onRestart: () => void }) {
  return (
    <>
      <div className="h-[2px] w-full btn-primary-gradient opacity-80" />
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
        <div className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{ background: "rgba(234,88,12,0.1)", border: "1px solid rgba(234,88,12,0.25)" }}>
          <Clock className="w-9 h-9 text-orange-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white mb-2">Session Expired</h2>
          <p className="text-[13px] text-zinc-400 leading-relaxed">
            Your payment session has expired. The paisa slot has been freed for other users.
            Start a new top-up to get a fresh QR code.
          </p>
        </div>
        <button onClick={onRestart}
          className="w-full h-12 rounded-2xl text-white font-bold text-sm btn-primary-gradient active:scale-[0.98] transition-transform">
          Start New Top-Up
        </button>
      </div>
    </>
  );
}

// ── Active Session Modal ──────────────────────────────────────────────────────
function ActiveSessionModal({
  session, onViewQR, onCancel, isCancelling,
}: {
  session: SessionData; onViewQR: () => void;
  onCancel: () => void; isCancelling: boolean;
}) {
  const finalAmt = parseFloat(session.finalAmount);
  const initSecs = Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
  const [countdown, setCountdown] = useState(initSecs);
  useEffect(() => {
    const t = setInterval(() => setCountdown(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const mins = Math.floor(countdown / 60);
  const secs = countdown % 60;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-md mx-auto rounded-t-3xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, hsl(var(--card)) 0%, rgba(139,92,246,0.08) 100%)",
          border: "1px solid rgba(255,140,0,0.3)", borderBottom: "none",
          boxShadow: "0 -20px 60px rgba(234,88,12,0.18)",
          animation: "pay-slide-up 0.35s ease both",
        }}>
        <div className="h-1 w-full"
          style={{ background: "linear-gradient(90deg, rgba(234,88,12,0.9), rgba(239,68,68,0.8))" }} />
        <div className="px-5 pt-5 pb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(234,88,12,0.12)", border: "1px solid rgba(234,88,12,0.3)" }}>
              <AlertTriangle className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Active Payment Session</h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">Don't close the page — your session is still live</p>
            </div>
          </div>
          <div className="rounded-2xl px-4 py-3 mb-4 flex items-center justify-between"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5">Pay Exactly</p>
              <p className="text-2xl font-extrabold font-heading text-white">₹{finalAmt.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5">Expires In</p>
              <p className="text-xl font-bold tabular-nums"
                style={{ color: countdown < 60 ? "rgb(239,68,68)" : "rgb(52,211,153)" }}>
                {mins}:{String(secs).padStart(2, "0")}
              </p>
            </div>
          </div>
          <p className="text-[12px] text-zinc-400 leading-relaxed text-center mb-5">
            Please complete your payment of{" "}
            <span className="text-white font-bold">₹{finalAmt.toFixed(2)}</span> to receive{" "}
            <span className="text-blue-300 font-bold">💎 {session.diamonds.toLocaleString()} diamonds</span>.
          </p>
          <div className="flex flex-col gap-2.5">
            <button onClick={onViewQR}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-sm btn-primary-gradient flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
              <Eye className="w-4 h-4" /> View Active QR
            </button>
            <button onClick={onCancel} disabled={isCancelling}
              className="w-full py-3.5 rounded-2xl font-bold text-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "rgb(248,113,113)" }}>
              <X className="w-4 h-4" /> {isCancelling ? "Cancelling…" : "Cancel Payment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Root page ─────────────────────────────────────────────────────────────────
export default function TopUpPage() {
  const { user, invalidateUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // amount selector state
  const [selected, setSelected]   = useState<number | null>(null);
  const [custom, setCustom]       = useState("");
  const [popKey, setPopKey]       = useState(0);
  const [rate, setRate]           = useState(0.5);
  const [globalMinTopup, setGlobalMinTopup] = useState(10);
  const [upiId, setUpiId]         = useState(DEFAULT_UPI_ID);
  const [upiName, setUpiName]     = useState(DEFAULT_UPI_NAME);

  // session state
  const [step, setStep]             = useState<Step>("select");
  const [session, setSession]       = useState<SessionData | null>(null);
  const [countdown, setCountdown]   = useState(SESSION_MINS * 60);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [activeSession, setActiveSession] = useState<SessionData | null>(null);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [isCancellingSession, setIsCancellingSession] = useState(false);

  // UTR / payment state
  const [utr, setUtr]               = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pollStatus, setPollStatus]     = useState<PollStatus>("pending");
  const [pollElapsed, setPollElapsed]   = useState(0);
  const [rejectedReason, setRejectedReason] = useState<string | null>(null);

  const pollTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const hardTimeoutRef = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const countdownRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef   = useRef(0);
  const topupIdRef     = useRef<number | null>(null);

  const minTopup = user?.minTopup ?? globalMinTopup;
  const customRupees   = parseInt(custom) || 0;
  const customDiamonds = Math.floor(customRupees / rate);
  const customValid    = customRupees >= minTopup;

  const activeDiamonds =
    selected !== null ? Math.floor(selected / rate)
    : customValid ? customDiamonds : null;
  const activeRupees =
    selected !== null ? selected
    : customValid ? customRupees : null;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    fetch("/api/payment-settings")
      .then(r => r.json())
      .then((s: PaymentSettings) => {
        setRate(s.ratePerDiamond);
        setGlobalMinTopup(s.minTopup ?? 20);
        if (s.upiId)   setUpiId(s.upiId);
        if (s.upiName) setUpiName(s.upiName);
      })
      .catch(() => {});

    // check for an existing pending session
    fetch("/api/payment-sessions/active", { credentials: "include" })
      .then(r => r.json())
      .then((data: { session: SessionData | null }) => {
        if (data.session) { setActiveSession(data.session); setShowSessionModal(true); }
      })
      .catch(() => {});

    return () => stopPolling();
  }, []);

  // countdown ticker for the QR step
  useEffect(() => {
    if (step !== "qr" || !session) return;
    if (countdownRef.current) clearInterval(countdownRef.current);
    const secsLeft = Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
    setCountdown(secsLeft);
    countdownRef.current = setInterval(() => {
      setCountdown(s => {
        if (s <= 1) { clearInterval(countdownRef.current!); countdownRef.current = null; setStep("expired"); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [step, session]);

  function stopPolling() {
    if (pollTimerRef.current)   { clearInterval(pollTimerRef.current);   pollTimerRef.current   = null; }
    if (elapsedRef.current)     { clearInterval(elapsedRef.current);      elapsedRef.current     = null; }
    if (hardTimeoutRef.current) { clearTimeout(hardTimeoutRef.current);   hardTimeoutRef.current = null; }
    if (countdownRef.current)   { clearInterval(countdownRef.current);    countdownRef.current   = null; }
  }

  function startPolling(topupId: number) {
    topupIdRef.current   = topupId;
    startTimeRef.current = Date.now();

    elapsedRef.current = setInterval(() => {
      setPollElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    hardTimeoutRef.current = setTimeout(() => {
      stopPolling(); setPollStatus("timeout");
    }, POLL_TIMEOUT_MS);

    const doPoll = async () => {
      try {
        const res = await fetch(`/api/topup/status/${topupId}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json() as { status: string; diamonds: number; rejectedReason?: string };
        if (data.status === "verified") {
          stopPolling(); setPollStatus("verified"); haptic.successTap(); invalidateUser();
          toast({ title: "Payment confirmed!", description: `${data.diamonds} diamonds added to your wallet.` });
          setTimeout(() => navigate("/wallet"), 1800);
        } else if (data.status === "rejected") {
          stopPolling(); setPollStatus("rejected"); haptic.errorTap();
          setRejectedReason(data.rejectedReason ?? null);
          toast({ title: "Payment rejected", description: data.rejectedReason ?? "Could not verify.", variant: "destructive" });
        }
      } catch { /* ignore blips */ }
    };

    doPoll();
    pollTimerRef.current = setInterval(doPoll, POLL_INTERVAL_MS);
  }

  async function handleContinue() {
    if (activeRupees === null || activeDiamonds === null || isCreatingSession) return;
    haptic.mediumTap();
    setIsCreatingSession(true);
    try {
      const res = await fetch("/api/payment-sessions/create", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseAmount: activeRupees, diamonds: activeDiamonds }),
      });
      const data = await res.json() as { sessionId?: number; error?: string; session?: SessionData };
      if (res.status === 409 && data.session) {
        setActiveSession(data.session); setShowSessionModal(true); return;
      }
      if (!res.ok || !data.sessionId) return;
      // fetch full session data then go to QR step
      const sr = await fetch(`/api/payment-sessions/${data.sessionId}`, { credentials: "include" });
      const sdata: SessionData = await sr.json();
      setSession(sdata);
      setStep("qr");
      window.scrollTo({ top: 0, behavior: "instant" });
    } catch {
      toast({ title: "Network error", description: "Could not connect. Please try again.", variant: "destructive" });
    } finally {
      setIsCreatingSession(false);
    }
  }

  async function handleSubmitUTR() {
    if (!session || utr.trim().length < 6 || isSubmitting) return;
    setIsSubmitting(true); haptic.mediumTap();
    setStep("waiting");
    try {
      const res = await fetch("/api/topup/submit", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          utr: utr.trim(),
          rupees: Math.round(parseFloat(session.baseAmount)),
          diamonds: session.diamonds,
        }),
      });
      const data = await res.json() as { topupId?: number; verifyUrl?: string; error?: string };
      if (!res.ok || !data.topupId) {
        setStep("utr");
        toast({ title: "Submission failed", description: data?.error ?? "Please try again.", variant: "destructive" });
        return;
      }
      // mark session complete
      fetch(`/api/payment-sessions/${session.id}/complete`, {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topupRequestId: data.topupId }),
      }).catch(() => {});
      // fire webhook
      if (data.verifyUrl) { try { new XMLHttpRequest().open("GET", data.verifyUrl, true); } catch { } }
      startPolling(data.topupId);
    } catch {
      setStep("utr");
      toast({ title: "Network error", description: "Could not reach the server.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancelSession() {
    if (!activeSession) return;
    setIsCancellingSession(true);
    try {
      await fetch(`/api/payment-sessions/${activeSession.id}/cancel`, { method: "POST", credentials: "include" });
      setActiveSession(null); setShowSessionModal(false);
    } catch { /* ignore */ } finally { setIsCancellingSession(false); }
  }

  function handleViewActiveQR() {
    if (!activeSession) return;
    setSession(activeSession); setShowSessionModal(false); setStep("qr");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function resetToSelect() {
    stopPolling(); setStep("select"); setSession(null); setUtr(""); setPollStatus("pending");
    setPollElapsed(0); setRejectedReason(null); setSelected(null); setCustom("");
  }

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden profile-page-bg">
      {showSessionModal && activeSession && (
        <ActiveSessionModal
          session={activeSession}
          onViewQR={handleViewActiveQR}
          onCancel={handleCancelSession}
          isCancelling={isCancellingSession}
        />
      )}

      {step === "select" && (
        <StepSelect
          user={user} rate={rate} minTopup={minTopup}
          selected={selected} setSelected={setSelected}
          custom={custom} setCustom={setCustom}
          popKey={popKey} setPopKey={setPopKey}
          activeDiamonds={activeDiamonds} activeRupees={activeRupees}
          isCreatingSession={isCreatingSession}
          onContinue={handleContinue}
          onBack={() => navigate("/wallet")}
        />
      )}

      {step === "qr" && session && (
        <StepQR
          session={session} upiId={upiId} upiName={upiName}
          countdown={countdown}
          onNext={() => { setStep("utr"); window.scrollTo({ top: 0, behavior: "instant" }); }}
          onBack={resetToSelect}
        />
      )}

      {step === "utr" && session && (
        <StepUTR
          session={session} utr={utr} setUtr={setUtr}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmitUTR}
          onBack={() => setStep("qr")}
        />
      )}

      {step === "waiting" && session && (
        <StepWaiting
          utr={utr}
          finalAmount={parseFloat(session.finalAmount)}
          pollStatus={pollStatus}
          pollElapsed={pollElapsed}
          rejectedReason={rejectedReason}
          onRetry={() => { setPollStatus("pending"); setPollElapsed(0); setStep("utr"); }}
          onNewTopup={resetToSelect}
        />
      )}

      {step === "expired" && (
        <StepExpired onRestart={resetToSelect} />
      )}
    </div>
  );
}
