import { useEffect, useRef, useState, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ChevronRight, Flame, Download, ShieldCheck, Users, Trophy, Lock, CheckCircle2, RefreshCw, Share, Plus, X } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { haptic } from "@/lib/haptics";

const HERO_IMG = "/icons/logo.png";

const CLASH_ZEN_URL =
  "https://play.google.com/store/apps/details?id=com.clashzen.app";

const cards = [
  {
    icon: <ShieldCheck className="w-7 h-7 text-orange-400" />,
    title: "100% Legit & Trusted",
    desc: "Verified platform. Every match, every payout — fully transparent with zero hidden charges.",
    glow: "rgba(234,88,12,0.22)",
    accent: "#ea580c",
  },
  {
    icon: <Users className="w-7 h-7 text-blue-400" />,
    title: "T1 Players Nationwide",
    desc: "Compete against top-tier Free Fire Max players from every corner of India.",
    glow: "rgba(59,130,246,0.22)",
    accent: "#3b82f6",
  },
  {
    icon: <Trophy className="w-7 h-7 text-yellow-400" />,
    title: "Daily Cash Payouts",
    desc: "Win real money credited straight to your wallet. No delays, no excuses — just rewards.",
    glow: "rgba(234,179,8,0.22)",
    accent: "#eab308",
  },
  {
    icon: <Lock className="w-7 h-7 text-red-400" />,
    title: "Zero Cheating Tolerance",
    desc: "Room credentials locked per match. Cheaters are banned permanently — fair play guaranteed.",
    glow: "rgba(220,38,38,0.22)",
    accent: "#dc2626",
  },
];

const AUTO_INTERVAL = 3200;

export default function LandingPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const pwa = usePwaInstall();
  const [showIosSheet, setShowIosSheet] = useState(false);
  const [showManualSheet, setShowManualSheet] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const mouseStartX = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const saved = sessionStorage.getItem("redirectAfterLogin");
      if (saved && saved.startsWith("/") && saved !== "/landing" && saved !== "/get-started") {
        sessionStorage.removeItem("redirectAfterLogin");
        setLocation(saved);
      } else {
        setLocation("/");
      }
    }
  }, [isAuthenticated, isLoading, setLocation]);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveIndex((i) => (i + 1) % cards.length);
    }, AUTO_INTERVAL);
  }, []);

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startTimer]);

  const goTo = (i: number) => {
    setActiveIndex(i);
    startTimer();
  };

  const prev = () => goTo((activeIndex - 1 + cards.length) % cards.length);
  const next = () => goTo((activeIndex + 1) % cards.length);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) diff > 0 ? next() : prev();
    touchStartX.current = null;
  };
  const handleMouseDown = (e: React.MouseEvent) => {
    mouseStartX.current = e.clientX;
  };
  const handleMouseUp = (e: React.MouseEvent) => {
    if (mouseStartX.current === null) return;
    const diff = mouseStartX.current - e.clientX;
    if (Math.abs(diff) > 40) diff > 0 ? next() : prev();
    mouseStartX.current = null;
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-6 px-8 bg-[#020202]">
        <Skeleton className="w-20 h-20 rounded-3xl bg-white/6" />
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          <Skeleton className="h-10 w-40 rounded-xl bg-white/8" />
          <Skeleton className="h-4 w-56 rounded bg-white/5" />
          <Skeleton className="h-4 w-44 rounded bg-white/4" />
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs mt-1">
          <Skeleton className="h-13 w-full rounded-2xl bg-white/6" />
          <Skeleton className="h-13 w-full rounded-2xl bg-white/4" />
        </div>
      </div>
    );
  }

  const card = cards[activeIndex];

  return (
    <div className="min-h-[100dvh] flex flex-col overflow-x-hidden bg-[#020202]">
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.08); }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes card-appear {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .anim-float { animation: float 4s ease-in-out infinite; }
        .anim-glow-pulse { animation: glow-pulse 3s ease-in-out infinite; }
        .anim-slide-up { animation: slide-up 0.65s cubic-bezier(.22,.68,0,1.2) both; }
        .anim-fade-in { animation: fade-in 0.6s ease both; }
        .anim-card { animation: card-appear 0.35s cubic-bezier(.22,.68,0,1.2) both; }
        .delay-100 { animation-delay: 0.10s; }
        .delay-200 { animation-delay: 0.20s; }
        .delay-300 { animation-delay: 0.32s; }
        .delay-400 { animation-delay: 0.44s; }
        .delay-500 { animation-delay: 0.56s; }
        .delay-600 { animation-delay: 0.68s; }
        .btn-molten {
          background: linear-gradient(135deg, #ea580c 0%, #dc2626 100%);
          box-shadow: 0 0 28px rgba(234,88,12,0.5), 0 2px 8px rgba(0,0,0,0.5);
          transition: box-shadow 0.25s, transform 0.15s;
        }
        .btn-molten:hover { box-shadow: 0 0 40px rgba(234,88,12,0.7), 0 4px 16px rgba(0,0,0,0.5); }
        .btn-molten:active { transform: scale(0.96); }
        .slider-dot {
          width: 6px; height: 6px; border-radius: 50%;
          transition: all 0.3s ease;
          cursor: pointer;
        }
        .slider-dot-active {
          width: 20px; border-radius: 4px;
        }
      `}</style>

      {/* Volcanic glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="anim-glow-pulse absolute top-[-20%] left-1/2 -translate-x-1/2 w-[650px] h-[550px] bg-orange-600/10 rounded-full blur-[130px]" />
        <div className="absolute top-[5%] right-[-20%] w-[400px] h-[400px] bg-red-700/8 rounded-full blur-[110px]" />
        <div className="absolute bottom-[-15%] left-[-15%] w-[500px] h-[500px] bg-orange-900/7 rounded-full blur-[120px]" />
      </div>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pt-10 pb-12 text-center">

        {/* Floating hero image */}
        <div className="anim-float mb-4 relative">
          <div className="anim-glow-pulse absolute inset-0 rounded-full blur-3xl bg-gradient-to-b from-orange-600/35 to-red-700/20 scale-125" />
          <img
            src={HERO_IMG}
            alt="Clash Ren"
            className="relative w-48 h-48 object-contain drop-shadow-[0_0_32px_rgba(234,88,12,0.5)]"
            loading="eager"
            fetchPriority="high"
            decoding="sync"
          />
        </div>

        {/* Badge */}
        <div className="anim-slide-up delay-100 mb-3 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-600/10 border border-orange-500/25 text-orange-400 text-xs font-heading tracking-widest uppercase">
          <Flame className="w-3 h-3" />
          Free Fire Max Tournaments
        </div>

        {/* Title */}
        <h1 className="anim-slide-up delay-200 leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontStyle: "italic" }}>
          <span className="text-5xl sm:text-6xl" style={{ background: "linear-gradient(180deg, #ffffff 0%, #aaaaaa 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CLASH </span><span className="text-5xl sm:text-6xl" style={{ color: "#e01010" }}>REN</span>
        </h1>

        {/* Tagline */}
        <p className="anim-slide-up delay-300 mt-4 text-base text-zinc-400 max-w-[260px] leading-relaxed font-medium">
          Where skill decides the winner, not luck.
        </p>

        {/* CTA buttons */}
        <div className="anim-slide-up delay-400 mt-9 flex flex-col gap-3 w-full max-w-[280px] mx-auto">
          <button
            className="btn-molten w-full h-13 rounded-2xl text-white font-bold text-base font-heading tracking-widest flex items-center justify-center gap-2 border-0 cursor-pointer"
            onClick={() => { haptic.mediumTap(); setLocation("/get-started"); }}
            data-testid="hero-get-started-btn"
          >
            <Flame className="w-4 h-4" />
            Let's Begin
            <ChevronRight className="w-4 h-4" />
          </button>

          {pwa.state !== "installed" && (
            <Button
              variant="outline"
              disabled={pwa.state === "installing" || pwa.state === "loading"}
              className="w-full h-12 rounded-2xl border-primary/30 bg-primary/8 text-primary hover:bg-primary/15 hover:border-primary/50 font-heading tracking-wide text-sm transition-all active:scale-95 disabled:opacity-50"
              onClick={() => {
                haptic.mediumTap();
                if (pwa.state === "available") {
                  pwa.install();
                } else if (pwa.state === "unavailable") {
                  if (pwa.platform === "ios") setShowIosSheet(true);
                  else setShowManualSheet(true);
                }
              }}
              data-testid="download-app-btn"
            >
              {pwa.state === "installing" ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Installing…</>
              ) : (
                <><Download className="w-4 h-4 mr-2" />Install ClashRen</>
              )}
            </Button>
          )}
        </div>

        {/* Divider */}
        <div className="anim-fade-in delay-500 mt-12 w-full max-w-sm h-px bg-gradient-to-r from-transparent via-orange-600/20 to-transparent" />

        {/* Auto-sliding trust card carousel */}
        <div className="anim-slide-up delay-600 mt-8 w-full max-w-sm mx-auto select-none">

          {/* Card */}
          <div
            key={activeIndex}
            className="anim-card glass-card p-5 flex flex-col items-start gap-3 text-left cursor-grab active:cursor-grabbing"
            style={{ borderColor: `${card.accent}22` }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
          >
            {/* Icon + title row */}
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: card.glow, border: `1px solid ${card.accent}30` }}
              >
                {card.icon}
              </div>
              <h3 className="font-heading font-bold text-base tracking-wide text-zinc-100 leading-tight">
                {card.title}
              </h3>
            </div>
            {/* Accent line */}
            <div
              className="w-10 h-0.5 rounded-full"
              style={{ background: `linear-gradient(90deg, ${card.accent}, transparent)` }}
            />
            <p className="text-sm text-zinc-400 leading-relaxed">{card.desc}</p>
          </div>

          {/* Dots */}
          <div className="mt-4 flex items-center justify-center gap-2">
            {cards.map((_, i) => (
              <button
                key={i}
                className="slider-dot"
                style={{
                  background: i === activeIndex ? card.accent : "rgba(255,255,255,0.18)",
                  width: i === activeIndex ? "20px" : "6px",
                  borderRadius: i === activeIndex ? "4px" : "50%",
                }}
                onClick={() => { haptic.mediumTap(); goTo(i); }}
                aria-label={`Go to card ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </main>

      {/* iOS "Add to Home Screen" instructions sheet */}
      {showIosSheet && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
          onClick={() => { haptic.mediumTap(); setShowIosSheet(false); }}
        >
          <div
            className="rounded-t-3xl p-6 pb-10 flex flex-col gap-5 animate-in slide-in-from-bottom-4 duration-300"
            style={{ background: "rgba(18,14,30,0.98)", border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={HERO_IMG} alt="Clash Ren" className="w-9 h-9 rounded-xl" />
                <div>
                  <p className="text-sm font-bold text-white font-heading tracking-wide">Install ClashRen</p>
                  <p className="text-[11px] text-zinc-500">Add to your Home Screen</p>
                </div>
              </div>
              <button
                onClick={() => { haptic.mediumTap(); setShowIosSheet(false); }}
                className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            <div className="h-px bg-white/8" />

            {/* Steps */}
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0 mt-0.5">
                  <Share className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Tap the Share button</p>
                  <p className="text-[12px] text-zinc-500 mt-0.5">In Safari, tap the <span className="text-blue-400 font-medium">Share</span> icon at the bottom of your screen</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 mt-0.5">
                  <Plus className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Add to Home Screen</p>
                  <p className="text-[12px] text-zinc-500 mt-0.5">Scroll down and tap <span className="text-primary font-medium">"Add to Home Screen"</span></p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0 mt-0.5">
                  <Download className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Tap Add</p>
                  <p className="text-[12px] text-zinc-500 mt-0.5">Confirm by tapping <span className="text-emerald-400 font-medium">"Add"</span> — ClashRen will appear on your home screen</p>
                </div>
              </div>
            </div>

            {pwa.state === "available" && (
              <button
                className="btn-molten w-full h-12 rounded-2xl text-white font-bold text-sm font-heading tracking-widest flex items-center justify-center gap-2"
                onClick={async () => {
                  haptic.mediumTap();
                  setShowIosSheet(false);
                  await pwa.install();
                }}
              >
                <Download className="w-4 h-4" />
                Direct Install
              </button>
            )}

            <p className="text-[11px] text-zinc-600 text-center">
              Open this page in <span className="text-zinc-400">Safari</span> if you're using a different browser
            </p>
          </div>
        </div>
      )}

      {/* Android / Desktop manual install sheet */}
      {showManualSheet && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
          onClick={() => { haptic.mediumTap(); setShowManualSheet(false); }}
        >
          <div
            className="rounded-t-3xl p-6 pb-10 flex flex-col gap-5 animate-in slide-in-from-bottom-4 duration-300"
            style={{ background: "rgba(18,14,30,0.98)", border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={HERO_IMG} alt="Clash Ren" className="w-9 h-9 rounded-xl" />
                <div>
                  <p className="text-sm font-bold text-white font-heading tracking-wide">Install ClashRen</p>
                  <p className="text-[11px] text-zinc-500">
                    {pwa.platform === "android" ? "Chrome for Android" : "Chrome / Edge"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { haptic.mediumTap(); setShowManualSheet(false); }}
                className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            <div className="h-px bg-white/8" />

            {pwa.platform === "android" ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-zinc-700/50 border border-zinc-600/40 flex items-center justify-center shrink-0 mt-0.5 text-sm font-bold text-zinc-300">⋮</div>
                  <div>
                    <p className="text-sm font-semibold text-white">Tap the menu</p>
                    <p className="text-[12px] text-zinc-500 mt-0.5">In Chrome, tap the <span className="text-zinc-300 font-medium">⋮ three-dot menu</span> at the top right</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 mt-0.5">
                    <Plus className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Add to Home Screen</p>
                    <p className="text-[12px] text-zinc-500 mt-0.5">Tap <span className="text-primary font-medium">"Add to Home Screen"</span> or <span className="text-primary font-medium">"Install app"</span></p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0 mt-0.5">
                    <Download className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Tap Install</p>
                    <p className="text-[12px] text-zinc-500 mt-0.5">Confirm by tapping <span className="text-emerald-400 font-medium">"Install"</span> — ClashRen will appear on your home screen</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 mt-0.5">
                    <Download className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Look for the install icon</p>
                    <p className="text-[12px] text-zinc-500 mt-0.5">In Chrome or Edge, tap the <span className="text-primary font-medium">⊕ install icon</span> in the address bar</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-zinc-700/50 border border-zinc-600/40 flex items-center justify-center shrink-0 mt-0.5 text-sm font-bold text-zinc-300">⋮</div>
                  <div>
                    <p className="text-sm font-semibold text-white">Or use the menu</p>
                    <p className="text-[12px] text-zinc-500 mt-0.5">Tap <span className="text-zinc-300 font-medium">⋮ menu → "Install ClashRen"</span></p>
                  </div>
                </div>
              </div>
            )}

            {pwa.state === "available" && (
              <button
                className="btn-molten w-full h-12 rounded-2xl text-white font-bold text-sm font-heading tracking-widest flex items-center justify-center gap-2"
                onClick={async () => {
                  haptic.mediumTap();
                  setShowManualSheet(false);
                  await pwa.install();
                }}
              >
                <Download className="w-4 h-4" />
                Direct Install
              </button>
            )}

            <p className="text-[11px] text-zinc-600 text-center">
              Open this page in <span className="text-zinc-400">Chrome</span> if you're using a different browser
            </p>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 mt-2">
        <div className="w-full h-px bg-gradient-to-r from-transparent via-orange-600/40 to-transparent" />
        <div className="px-6 py-6 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <img src={HERO_IMG} alt="Clash Ren" className="w-6 h-6 object-contain opacity-70" />
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontStyle: "italic", letterSpacing: "0.1em", fontSize: "0.85rem", color: "#888" }}>CLASH <span style={{ color: "#e01010" }}>REN</span></span>
          </div>
          <p className="text-[10px] text-zinc-700 tracking-wide">
            © {new Date().getFullYear()} Clash Ren · All rights reserved
          </p>
        </div>
      </footer>
    </div>
  );
}
