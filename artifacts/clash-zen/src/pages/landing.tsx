import { useEffect, useState, Fragment } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  ChevronRight, Flame, Download, ShieldCheck, Users, Trophy,
  Lock, RefreshCw, Share, Plus, X, Swords, Zap
} from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { haptic } from "@/lib/haptics";

const HERO_IMG = "/icons/logo.png";

const stats = [
  { value: "10K+", label: "Players" },
  { value: "₹5L+", label: "Paid Out" },
  { value: "500+", label: "Matches" },
];

const features = [
  {
    icon: <ShieldCheck className="w-5 h-5 text-orange-400" />,
    title: "100% Legit",
    desc: "Verified platform. Every payout fully transparent.",
    accent: "#ea580c",
    glow: "rgba(234,88,12,0.15)",
  },
  {
    icon: <Users className="w-5 h-5 text-blue-400" />,
    title: "Top Players",
    desc: "Compete against elite Free Fire Max players nationwide.",
    accent: "#3b82f6",
    glow: "rgba(59,130,246,0.15)",
  },
  {
    icon: <Trophy className="w-5 h-5 text-yellow-400" />,
    title: "Daily Cash",
    desc: "Real money. No delays, no hidden charges.",
    accent: "#eab308",
    glow: "rgba(234,179,8,0.15)",
  },
  {
    icon: <Lock className="w-5 h-5 text-red-400" />,
    title: "Zero Cheating",
    desc: "Room IDs locked per match. Cheaters banned permanently.",
    accent: "#dc2626",
    glow: "rgba(220,38,38,0.15)",
  },
];

export default function LandingPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const pwa = usePwaInstall();
  const [showIosSheet, setShowIosSheet] = useState(false);
  const [showManualSheet, setShowManualSheet] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

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

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-6 px-8 bg-[#020202]">
        <Skeleton className="w-16 h-16 rounded-2xl bg-white/6" />
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          <Skeleton className="h-10 w-40 rounded-xl bg-white/8" />
          <Skeleton className="h-4 w-56 rounded bg-white/5" />
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs mt-1">
          <Skeleton className="h-13 w-full rounded-2xl bg-white/6" />
          <Skeleton className="h-13 w-full rounded-2xl bg-white/4" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col overflow-x-hidden bg-[#020202]">
      <style>{`
        @keyframes glow-breathe {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50%       { opacity: 0.75; transform: scale(1.1); }
        }
        @keyframes rise {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pop {
          from { opacity: 0; transform: scale(0.93); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes cta-pulse {
          0%, 100% { box-shadow: 0 0 22px rgba(234,88,12,0.5), 0 2px 8px rgba(0,0,0,0.6); }
          50%       { box-shadow: 0 0 42px rgba(234,88,12,0.75), 0 4px 16px rgba(0,0,0,0.6); }
        }
        .anim-breathe { animation: glow-breathe 4s ease-in-out infinite; }
        .anim-rise    { animation: rise 0.55s cubic-bezier(.22,.68,0,1.15) both; }
        .anim-pop     { animation: pop  0.45s cubic-bezier(.22,.68,0,1.2)  both; }
        .d-1  { animation-delay: 0.05s; }
        .d-2  { animation-delay: 0.15s; }
        .d-3  { animation-delay: 0.25s; }
        .d-4  { animation-delay: 0.38s; }
        .d-5  { animation-delay: 0.50s; }
        .d-6  { animation-delay: 0.62s; }
        .btn-fire {
          background: linear-gradient(135deg, #f97316 0%, #dc2626 100%);
          animation: cta-pulse 2.6s ease-in-out infinite;
          transition: transform 0.15s;
        }
        .btn-fire:active { transform: scale(0.96); }
        .stat-sep { width: 1px; height: 28px; background: rgba(255,255,255,0.08); }
        .feat-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
      `}</style>

      {/* Background glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="anim-breathe absolute top-[-18%] left-1/2 -translate-x-1/2 w-[600px] h-[500px] bg-orange-700/12 rounded-full blur-[120px]" />
        <div className="absolute top-[10%] right-[-22%] w-[360px] h-[360px] bg-red-800/8 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-18%] w-[440px] h-[440px] bg-orange-900/7 rounded-full blur-[110px]" />
      </div>

      <main className="relative z-10 flex-1 flex flex-col items-center px-5 pt-12 pb-14 text-center">

        {/* Logo + wordmark */}
        {mounted && (
          <div className="anim-pop d-1 flex items-center gap-2.5 mb-8">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl blur-lg bg-orange-500/35" />
              <img
                src={HERO_IMG}
                alt="Clash Ren"
                className="relative w-10 h-10 object-contain rounded-xl"
                loading="eager"
                fetchPriority="high"
                decoding="sync"
              />
            </div>
            <span
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 800,
                fontStyle: "italic",
                letterSpacing: "0.08em",
                fontSize: "1.45rem",
                lineHeight: 1,
              }}
            >
              <span style={{ color: "#fff" }}>CLASH</span>
              <span style={{ color: "#e01010" }}> REN</span>
            </span>
          </div>
        )}

        {/* Hero headline */}
        {mounted && (
          <>
            <div className="anim-rise d-1 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 mb-5">
              <Swords className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-[11px] font-heading tracking-widest uppercase text-orange-400 font-semibold">Free Fire Max Tournaments</span>
            </div>

            <h1
              className="anim-rise d-2"
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 900,
                fontStyle: "italic",
                fontSize: "clamp(2.8rem, 13vw, 4.2rem)",
                lineHeight: 0.95,
                letterSpacing: "-0.01em",
              }}
            >
              <span style={{ background: "linear-gradient(180deg,#fff 20%,#bbb 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                ENTER THE
              </span>
              <br />
              <span style={{ background: "linear-gradient(135deg, #f97316 0%, #dc2626 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                BATTLEFIELD
              </span>
            </h1>

            <p className="anim-rise d-3 mt-4 text-[15px] text-zinc-400 max-w-[260px] leading-relaxed">
              Skill-based tournaments. Real cash prizes.<br />
              <span className="text-zinc-300">No bots. No luck. Just you.</span>
            </p>
          </>
        )}

        {/* Stats bar */}
        {mounted && (
          <div className="anim-rise d-3 mt-7 w-full max-w-[300px] flex items-center justify-between px-5 py-3.5 rounded-2xl"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {stats.map((s, i) => (
              <Fragment key={s.label}>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-lg font-heading font-bold text-white leading-none">{s.value}</span>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{s.label}</span>
                </div>
                {i < stats.length - 1 && <div className="stat-sep" />}
              </Fragment>
            ))}
          </div>
        )}

        {/* CTAs */}
        {mounted && (
          <div className="anim-rise d-4 mt-7 flex flex-col gap-3 w-full max-w-[290px]">
            <button
              className="btn-fire w-full h-14 rounded-2xl text-white font-bold text-[15px] font-heading tracking-widest flex items-center justify-center gap-2.5 border-0 cursor-pointer"
              onClick={() => { haptic.mediumTap(); setLocation("/get-started"); }}
              data-testid="hero-get-started-btn"
            >
              <Flame className="w-4.5 h-4.5" />
              Start Playing
              <ChevronRight className="w-4 h-4" />
            </button>

            {pwa.state !== "installed" && (
              <Button
                variant="outline"
                disabled={pwa.state === "installing" || pwa.state === "loading"}
                className="w-full h-11 rounded-2xl border-white/10 bg-white/4 text-zinc-300 hover:bg-white/8 hover:text-white font-heading tracking-wide text-sm transition-all active:scale-95 disabled:opacity-50"
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
                  <><Download className="w-4 h-4 mr-2" />Install App</>
                )}
              </Button>
            )}
          </div>
        )}

        {/* Divider */}
        {mounted && (
          <div className="anim-rise d-5 mt-10 w-full max-w-sm flex items-center gap-3">
            <div className="flex-1 h-px bg-white/6" />
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-600 uppercase tracking-widest font-medium">
              <Zap className="w-3 h-3 text-zinc-700" />
              Why ClashRen
            </div>
            <div className="flex-1 h-px bg-white/6" />
          </div>
        )}

        {/* 2×2 feature grid */}
        {mounted && (
          <div className="anim-rise d-6 mt-5 w-full max-w-sm grid grid-cols-2 gap-3">
            {features.map((f) => (
              <div key={f.title} className="feat-card" style={{ borderColor: `${f.accent}20` }}>
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: f.glow, border: `1px solid ${f.accent}25` }}
                >
                  {f.icon}
                </div>
                <p className="text-[13px] font-bold text-zinc-100 font-heading leading-tight">{f.title}</p>
                <p className="text-[11px] text-zinc-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* iOS sheet */}
      {showIosSheet && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }}
          onClick={() => { haptic.mediumTap(); setShowIosSheet(false); }}
        >
          <div
            className="rounded-t-3xl p-6 pb-10 flex flex-col gap-5 animate-in slide-in-from-bottom-4 duration-300"
            style={{ background: "rgba(18,14,30,0.98)", border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={HERO_IMG} alt="Clash Ren" className="w-9 h-9 rounded-xl" />
                <div>
                  <p className="text-sm font-bold text-white font-heading tracking-wide">Install ClashRen</p>
                  <p className="text-[11px] text-zinc-500">Add to your Home Screen</p>
                </div>
              </div>
              <button onClick={() => { haptic.mediumTap(); setShowIosSheet(false); }} className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
            <div className="h-px bg-white/8" />
            <div className="flex flex-col gap-4">
              {[
                { icon: <Share className="w-4 h-4 text-blue-400" />, color: "blue", title: "Tap the Share button", desc: <>In Safari, tap the <span className="text-blue-400 font-medium">Share</span> icon at the bottom</> },
                { icon: <Plus className="w-4 h-4 text-primary" />, color: "primary", title: "Add to Home Screen", desc: <>Scroll down and tap <span className="text-primary font-medium">"Add to Home Screen"</span></> },
                { icon: <Download className="w-4 h-4 text-emerald-400" />, color: "emerald", title: "Tap Add", desc: <>Confirm by tapping <span className="text-emerald-400 font-medium">"Add"</span></> },
              ].map((step) => (
                <div key={step.title} className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-xl bg-${step.color}-500/15 border border-${step.color}-500/25 flex items-center justify-center shrink-0 mt-0.5`}>{step.icon}</div>
                  <div>
                    <p className="text-sm font-semibold text-white">{step.title}</p>
                    <p className="text-[12px] text-zinc-500 mt-0.5">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-zinc-600 text-center">Open this page in <span className="text-zinc-400">Safari</span> if you're using a different browser</p>
          </div>
        </div>
      )}

      {/* Android / Desktop sheet */}
      {showManualSheet && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }}
          onClick={() => { haptic.mediumTap(); setShowManualSheet(false); }}
        >
          <div
            className="rounded-t-3xl p-6 pb-10 flex flex-col gap-5 animate-in slide-in-from-bottom-4 duration-300"
            style={{ background: "rgba(18,14,30,0.98)", border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={HERO_IMG} alt="Clash Ren" className="w-9 h-9 rounded-xl" />
                <div>
                  <p className="text-sm font-bold text-white font-heading tracking-wide">Install ClashRen</p>
                  <p className="text-[11px] text-zinc-500">{pwa.platform === "android" ? "Chrome for Android" : "Chrome / Edge"}</p>
                </div>
              </div>
              <button onClick={() => { haptic.mediumTap(); setShowManualSheet(false); }} className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
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
                  <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 mt-0.5"><Plus className="w-4 h-4 text-primary" /></div>
                  <div>
                    <p className="text-sm font-semibold text-white">Add to Home Screen</p>
                    <p className="text-[12px] text-zinc-500 mt-0.5">Tap <span className="text-primary font-medium">"Add to Home Screen"</span> or <span className="text-primary font-medium">"Install app"</span></p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0 mt-0.5"><Download className="w-4 h-4 text-emerald-400" /></div>
                  <div>
                    <p className="text-sm font-semibold text-white">Tap Install</p>
                    <p className="text-[12px] text-zinc-500 mt-0.5">Confirm by tapping <span className="text-emerald-400 font-medium">"Install"</span></p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 mt-0.5"><Download className="w-4 h-4 text-primary" /></div>
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
                className="btn-fire w-full h-12 rounded-2xl text-white font-bold text-sm font-heading tracking-widest flex items-center justify-center gap-2"
                onClick={async () => { haptic.mediumTap(); setShowManualSheet(false); await pwa.install(); }}
              >
                <Download className="w-4 h-4" />Direct Install
              </button>
            )}
            <p className="text-[11px] text-zinc-600 text-center">Open this page in <span className="text-zinc-400">Chrome</span> if you're using a different browser</p>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10">
        <div className="w-full h-px bg-gradient-to-r from-transparent via-white/6 to-transparent" />
        <div className="px-6 py-5 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <img src={HERO_IMG} alt="Clash Ren" className="w-5 h-5 object-contain opacity-50" />
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontStyle: "italic", letterSpacing: "0.1em", fontSize: "0.8rem", color: "#555" }}>
              CLASH <span style={{ color: "#b91c1c" }}>REN</span>
            </span>
          </div>
          <p className="text-[10px] text-zinc-700 tracking-wide">© {new Date().getFullYear()} Clash Ren · All rights reserved</p>
        </div>
      </footer>
    </div>
  );
}
