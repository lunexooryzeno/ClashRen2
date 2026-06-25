import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { ArrowLeft, Gem, ChevronRight, Zap, Star, ScrollText, AlertTriangle, X, Eye } from "lucide-react";
import { haptic } from "@/lib/haptics";

const PRESETS = [
  { rupees: 10,  tag: null,         accent: "rgba(20,184,166,0.9)"  },
  { rupees: 20,  tag: null,         accent: "rgba(99,102,241,0.9)"  },
  { rupees: 50,  tag: null,         accent: "rgba(59,130,246,0.9)"  },
  { rupees: 100, tag: "Popular",    accent: "rgba(234,88,12,0.9)"   },
  { rupees: 200, tag: null,         accent: "rgba(139,92,246,0.9)"  },
  { rupees: 500, tag: "Best Value", accent: "rgba(16,185,129,0.9)"  },
];

const PARTICLES = [
  { left: "12%", delay: "0s",    dur: "4.2s", size: 10 },
  { left: "28%", delay: "0.8s",  dur: "3.6s", size: 7  },
  { left: "47%", delay: "1.5s",  dur: "4.8s", size: 12 },
  { left: "63%", delay: "0.3s",  dur: "3.9s", size: 8  },
  { left: "78%", delay: "2.1s",  dur: "4.4s", size: 6  },
  { left: "91%", delay: "1.1s",  dur: "3.3s", size: 9  },
];

interface ActiveSession {
  id: number;
  finalAmount: string;
  baseAmount: string;
  diamonds: number;
  expiresAt: string;
}

function FloatingParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {PARTICLES.map((p, i) => (
        <div key={i} className="absolute bottom-0" style={{ left: p.left, animationDelay: p.delay }}>
          <Gem
            style={{
              width: p.size, height: p.size,
              color: "hsl(var(--primary))",
              opacity: 0,
              animation: `topup-float ${p.dur} ${p.delay} infinite ease-in-out`,
            }}
            strokeWidth={1.5}
          />
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
    const start = displayed;
    const end = value;
    const diff = end - start;
    const steps = 24;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      const eased = 1 - Math.pow(1 - step / steps, 3);
      setDisplayed(Math.round(start + diff * eased));
      if (step >= steps) { setDisplayed(end); clearInterval(interval); }
    }, 18);
    return () => clearInterval(interval);
  }, [value]);

  return <>{displayed.toLocaleString()}</>;
}

function ActiveSessionModal({
  session,
  onViewQR,
  onCancel,
  isCancelling,
}: {
  session: ActiveSession;
  onViewQR: () => void;
  onCancel: () => void;
  isCancelling: boolean;
}) {
  const finalAmt = parseFloat(session.finalAmount);
  const expiresAt = new Date(session.expiresAt);
  const initialSecsLeft = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const [countdown, setCountdown] = useState(initialSecsLeft);

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
          border: "1px solid rgba(255,140,0,0.3)",
          borderBottom: "none",
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
              <Eye className="w-4 h-4" />
              View Active QR
            </button>
            <button onClick={onCancel} disabled={isCancelling}
              className="w-full py-3.5 rounded-2xl font-bold text-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                color: "rgb(248,113,113)",
              }}>
              <X className="w-4 h-4" />
              {isCancelling ? "Cancelling…" : "Cancel Payment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TopUpPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [popKey, setPopKey] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [rate, setRate] = useState(0.5);
  const [globalMinTopup, setGlobalMinTopup] = useState(10);

  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isCancellingSession, setIsCancellingSession] = useState(false);

  const minTopup = user?.minTopup ?? globalMinTopup;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const t = setTimeout(() => setMounted(true), 50);

    fetch("/api/payment-settings")
      .then(r => r.json())
      .then((s: { ratePerDiamond: number; minTopup: number }) => {
        setRate(s.ratePerDiamond);
        setGlobalMinTopup(s.minTopup ?? 20);
      })
      .catch(() => {});

    fetch("/api/payment-sessions/active", { credentials: "include" })
      .then(r => r.json())
      .then((data: { session: ActiveSession | null }) => {
        if (data.session) {
          setActiveSession(data.session);
          setShowSessionModal(true);
        }
      })
      .catch(() => {});

    return () => clearTimeout(t);
  }, []);

  const customRupees = parseInt(custom) || 0;
  const customDiamonds = Math.floor(customRupees / rate);
  const customValid = customRupees >= minTopup;

  const activeDiamonds =
    selected !== null ? Math.floor(selected / rate)
    : customValid ? customDiamonds
    : null;

  const activeRupees =
    selected !== null ? selected
    : customValid ? customRupees
    : null;

  function pick(rupees: number) {
    haptic.mediumTap();
    setSelected(rupees);
    setCustom("");
    setPopKey(k => k + 1);
  }

  async function handleContinue() {
    if (activeRupees === null || activeDiamonds === null || isCreatingSession) return;
    haptic.mediumTap();
    setIsCreatingSession(true);
    try {
      const res = await fetch("/api/payment-sessions/create", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseAmount: activeRupees, diamonds: activeDiamonds }),
      });
      const data = await res.json() as {
        sessionId?: number;
        error?: string;
        session?: ActiveSession;
      };

      if (res.status === 409 && data.session) {
        setActiveSession(data.session);
        setShowSessionModal(true);
        return;
      }

      if (!res.ok || !data.sessionId) return;

      navigate(`/top-up/pay?sessionId=${data.sessionId}`);
    } catch {
      // ignore network errors
    } finally {
      setIsCreatingSession(false);
    }
  }

  async function handleCancelSession() {
    if (!activeSession) return;
    setIsCancellingSession(true);
    try {
      await fetch(`/api/payment-sessions/${activeSession.id}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      setActiveSession(null);
      setShowSessionModal(false);
    } catch {
      // ignore
    } finally {
      setIsCancellingSession(false);
    }
  }

  function handleViewActiveQR() {
    if (!activeSession) return;
    navigate(`/top-up/pay?sessionId=${activeSession.id}`);
  }

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden profile-page-bg">
      <FloatingParticles />

      {showSessionModal && activeSession && (
        <ActiveSessionModal
          session={activeSession}
          onViewQR={handleViewActiveQR}
          onCancel={handleCancelSession}
          isCancelling={isCancellingSession}
        />
      )}

      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse, rgba(139,92,246,0.12) 0%, transparent 70%)" }} />
      <div className="absolute bottom-0 right-0 w-64 h-64 pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)" }} />

      <div className="h-[2px] w-full btn-primary-gradient opacity-80" />

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-5 pb-2 relative z-10"
        style={{ animation: mounted ? "topup-slide-up 0.4s ease both" : "none" }}>
        <button onClick={() => navigate("/wallet")}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <span className="text-[11px] text-muted-foreground uppercase tracking-[0.2em] font-bold">Diamond Store</span>
        <button onClick={() => { haptic.lightTap(); navigate("/top-up/terms"); }}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors"
          title="Terms & Conditions">
          <ScrollText className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {/* ── Hero gem ── */}
      <div className="flex flex-col items-center pt-4 pb-2 relative z-10">
        <div className="relative flex items-center justify-center mb-3">
          <div className="w-20 h-20 rounded-[28px] flex items-center justify-center relative"
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

      {/* ── Packages ── */}
      <div className="px-4 pt-4 relative z-10">
        <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-bold mb-3 px-1">
          Choose a Package
        </p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          {PRESETS.map((pkg, idx) => {
            const diamonds = Math.floor(pkg.rupees / rate);
            const isActive = selected === pkg.rupees && !custom;
            const isBelowMin = pkg.rupees < minTopup;
            return (
              <button
                key={pkg.rupees}
                onClick={() => { if (!isBelowMin) pick(pkg.rupees); }}
                disabled={isBelowMin}
                className="relative rounded-2xl p-4 text-left overflow-hidden transition-all duration-200 active:scale-[0.95] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: isActive
                    ? `linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.12))`
                    : "hsl(var(--card))",
                  border: isActive
                    ? "1.5px solid rgba(139,92,246,0.6)"
                    : "1px solid rgba(255,255,255,0.08)",
                  boxShadow: isActive
                    ? "0 0 24px rgba(139,92,246,0.2), inset 0 1px 0 rgba(255,255,255,0.08)"
                    : "0 2px 12px rgba(0,0,0,0.3)",
                  animation: mounted ? `topup-card-in 0.4s ${0.1 + idx * 0.08}s ease both` : "none",
                  transform: isActive ? "scale(1.02)" : "scale(1)",
                }}
              >
                {isActive && (
                  <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                    <div className="absolute top-0 bottom-0 w-1/3"
                      style={{
                        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
                        animation: "topup-shimmer 2s 0.2s infinite ease-in-out",
                      }} />
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
                  <span key={`${pkg.rupees}-${isActive}`}
                    className="text-sm font-bold text-blue-300"
                    style={{ animation: isActive ? "topup-count-in 0.25s ease both" : "none" }}>
                    {diamonds.toLocaleString()} diamonds
                  </span>
                </div>
                {isActive && (
                  <div className="absolute bottom-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(139,92,246,0.8)", animation: "topup-pop 0.3s ease both" }}>
                    <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Custom amount ── */}
        <div className="rounded-2xl relative transition-all duration-300"
          style={{
            background: custom && customRupees > 0
              ? "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.08))"
              : "hsl(var(--card))",
            border: custom && customRupees > 0
              ? "1.5px solid rgba(139,92,246,0.5)"
              : "1px solid rgba(255,255,255,0.08)",
            animation: mounted ? "topup-card-in 0.4s 0.28s ease both" : "none",
          }}>
          {custom && customRupees > 0 && (
            <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
              <div className="absolute top-0 bottom-0 w-1/3"
                style={{
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)",
                  animation: "topup-shimmer 2.5s infinite ease-in-out",
                }} />
            </div>
          )}
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-md flex items-center justify-center"
                style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.25)" }}>
                <Zap className="w-3 h-3 text-violet-400" />
              </div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] font-bold">Custom Amount</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 pt-3 pb-2"
            style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <span className="text-3xl font-extrabold text-zinc-500 shrink-0">₹</span>
            <input
              type="number"
              min={minTopup}
              value={custom}
              onChange={e => { setCustom(e.target.value); setSelected(null); }}
              placeholder="0"
              className="flex-1 min-w-0 bg-transparent text-3xl font-extrabold text-white placeholder:text-zinc-800 outline-none"
            />
            {custom && (
              <button onClick={() => { setCustom(""); setSelected(null); }}
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-zinc-500 active:scale-90 transition-transform"
                style={{ background: "rgba(255,255,255,0.06)" }}>
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>
          <div className="px-4 pb-3">
            {custom && customRupees > 0 && !customValid
              ? <p className="text-[11px] font-semibold text-red-400">Minimum top-up is ₹{minTopup}</p>
              : <p className="text-[11px] text-zinc-600">Min. ₹{minTopup} per top-up</p>
            }
          </div>
        </div>
      </div>

      {/* ── Diamonds preview banner ── */}
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
                  style={{
                    border: "1px solid rgba(59,130,246,0.4)",
                    animation: `topup-pulse-ring 1.8s ${i * 0.9}s infinite ease-out`,
                  }} />
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

      {/* ── Sticky CTA ── */}
      {activeRupees !== null && activeDiamonds !== null && (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-6 pt-4"
          style={{
            background: "linear-gradient(to top, rgba(2,2,6,0.98) 60%, transparent 100%)",
            animation: "topup-slide-up 0.35s ease both",
          }}>
          <button
            className="w-full h-14 rounded-2xl text-white font-bold text-base btn-primary-gradient flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
            style={{ animation: "topup-btn-glow 2s infinite ease-in-out" }}
            disabled={isCreatingSession}
            onClick={handleContinue}>
            {isCreatingSession ? "Please wait…" : "Continue"}
            {!isCreatingSession && <ChevronRight className="w-4 h-4 ml-0.5" />}
          </button>
        </div>
      )}
    </div>
  );
}
