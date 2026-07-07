import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { User, Users, Shield, ArrowRight, Swords, Gem } from "lucide-react";
import bgImage from "@assets/1782801646557_1782801792030.png";

const MODES = [
  {
    id: "solo",
    label: "Solo",
    tagline: "Last One Standing",
    entry: "From 10 💎 entry",
    icon: User,
    accent: "#ef4444",
    glow: "rgba(239,68,68,0.5)",
    border: "rgba(239,68,68,0.35)",
    delay: 150,
    image: "/modes/solo.jpg",
  },
  {
    id: "duo",
    label: "Duo",
    tagline: "Pair Up & Dominate",
    entry: "From 20 💎 entry",
    icon: Users,
    accent: "#a855f7",
    glow: "rgba(168,85,247,0.5)",
    border: "rgba(168,85,247,0.35)",
    delay: 230,
    image: "/modes/duo.webp",
  },
  {
    id: "squad",
    label: "Squad",
    tagline: "Unite Your Squad",
    entry: "From 40 💎 entry",
    icon: Shield,
    accent: "#f59e0b",
    glow: "rgba(245,158,11,0.5)",
    border: "rgba(245,158,11,0.35)",
    delay: 310,
    image: "/modes/squad.jpg",
  },
];

function SectionLabel({ children, delay, visible }: { children: React.ReactNode; delay: number; visible: boolean }) {
  return (
    <div
      className="flex items-center gap-2 px-1"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition: `opacity 0.35s ease ${delay}ms, transform 0.35s ease ${delay}ms`,
      }}
    >
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">{children}</span>
      <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, rgba(255,255,255,0.07), transparent)" }} />
    </div>
  );
}

function ModeCard({ mode, visible }: { mode: typeof MODES[number]; visible: boolean }) {
  const [, navigate] = useLocation();
  const Icon = mode.icon;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/matches/mode/${mode.id}`)}
      onKeyDown={e => e.key === "Enter" && navigate(`/matches/mode/${mode.id}`)}
      className="relative overflow-hidden rounded-2xl cursor-pointer active:scale-[0.975] select-none flex flex-row"
      style={{
        border: `1px solid ${mode.border}`,
        boxShadow: `0 4px 24px ${mode.glow.replace("0.5","0.2")}, inset 0 1px 0 rgba(255,255,255,0.06)`,
        background: "#080808",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.4s ease ${mode.delay}ms, transform 0.4s ease ${mode.delay}ms`,
      }}
    >
      <div className="relative shrink-0 overflow-hidden rounded-l-2xl" style={{ width: "46%" }}>
        <img src={mode.image} alt={mode.label} className="w-full h-auto block" draggable={false} loading="lazy" decoding="async" />
        <div className="absolute inset-y-0 right-0 w-14 pointer-events-none" style={{ background: `linear-gradient(to right, transparent, #080808)` }} />
        <div className="absolute inset-x-0 top-0 h-8 pointer-events-none" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.4), transparent)" }} />
      </div>
      <div className="relative flex-1 flex flex-col justify-between py-3 pr-3 pl-1 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 120% 60%, ${mode.glow.replace("0.5","0.18")} 0%, transparent 65%)` }} />
        <div className="absolute -right-2 top-1/2 -translate-y-1/2 opacity-[0.06] pointer-events-none">
          <Icon strokeWidth={0.6} style={{ width: 88, height: 88, color: mode.accent }} />
        </div>
        <div className="relative z-10 flex items-center justify-end mb-1">
          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: `${mode.accent}18`, border: `1px solid ${mode.accent}40` }}>
            <ArrowRight className="w-3 h-3" style={{ color: mode.accent }} />
          </div>
        </div>
        <div className="relative z-10">
          <h2 className="font-heading font-black text-white leading-none tracking-tight" style={{ fontSize: 28, textShadow: `0 0 20px ${mode.glow}` }}>
            {mode.label}
          </h2>
          <p className="text-[11px] font-semibold mt-1 leading-tight" style={{ color: `${mode.accent}bb` }}>{mode.tagline}</p>
          <div className="flex items-center gap-1 mt-2">
            <Gem className="w-2.5 h-2.5 shrink-0" style={{ color: `${mode.accent}99` }} />
            <span className="text-[10px] font-semibold" style={{ color: `${mode.accent}77` }}>{mode.entry}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Ornate corner bracket — renders two bars forming an L */
function CornerBracket({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const size = 18;
  const thickness = 3;
  const color = "#fbbf24";
  const radius = 3;

  const top    = pos === "tl" || pos === "tr" ? -1 : undefined;
  const bottom = pos === "bl" || pos === "br" ? -1 : undefined;
  const left   = pos === "tl" || pos === "bl" ? -1 : undefined;
  const right  = pos === "tr" || pos === "br" ? -1 : undefined;

  const hBar: React.CSSProperties = {
    position: "absolute",
    width: size,
    height: thickness,
    background: `linear-gradient(${pos.includes("l") ? "to right" : "to left"}, ${color}, rgba(251,191,36,0.4))`,
    top: pos.includes("t") ? 0 : undefined,
    bottom: pos.includes("b") ? 0 : undefined,
    left: pos.includes("l") ? 0 : undefined,
    right: pos.includes("r") ? 0 : undefined,
    borderRadius: pos === "tl" ? `${radius}px 0 0 0` : pos === "tr" ? `0 ${radius}px 0 0` : pos === "bl" ? `0 0 0 ${radius}px` : `0 0 ${radius}px 0`,
  };
  const vBar: React.CSSProperties = {
    position: "absolute",
    width: thickness,
    height: size,
    background: `linear-gradient(${pos.includes("t") ? "to bottom" : "to top"}, ${color}, rgba(251,191,36,0.4))`,
    top: pos.includes("t") ? 0 : undefined,
    bottom: pos.includes("b") ? 0 : undefined,
    left: pos.includes("l") ? 0 : undefined,
    right: pos.includes("r") ? 0 : undefined,
    borderRadius: pos === "tl" ? `${radius}px 0 0 0` : pos === "tr" ? `0 ${radius}px 0 0` : pos === "bl" ? `0 0 0 ${radius}px` : `0 0 ${radius}px 0`,
  };

  return (
    <div style={{ position: "absolute", top, bottom, left, right, width: size, height: size, zIndex: 30, pointerEvents: "none" }}>
      <div style={hBar} />
      <div style={vBar} />
    </div>
  );
}

/* Clean golden circle emblem with crossed swords */
function SwordEmblem() {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 88, height: 88, flexShrink: 0 }}>
      {/* Outer glow */}
      <div className="absolute inset-0 rounded-full pointer-events-none" style={{
        boxShadow: "0 0 22px rgba(245,158,11,0.6), 0 0 48px rgba(245,158,11,0.18)",
      }} />

      {/* Golden circle background */}
      <div className="absolute inset-0 rounded-full" style={{
        background: "radial-gradient(circle at 40% 35%, #fde68a 0%, #f59e0b 45%, #b45309 100%)",
        border: "2.5px solid #fbbf24",
        boxShadow: "inset 0 2px 8px rgba(255,255,255,0.25), inset 0 -2px 8px rgba(0,0,0,0.4)",
      }} />

      {/* Swords icon */}
      <div className="relative z-10 flex items-center justify-center" style={{
        filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.7))",
      }}>
        <Swords style={{ width: 42, height: 42, color: "#1c0a00" }} strokeWidth={1.8} />
      </div>
    </div>
  );
}

export default function Events() {
  const [, navigate] = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="flex-1 overflow-y-auto pb-10 relative"
      style={{
        backgroundImage: `linear-gradient(rgba(5,5,12,0.82), rgba(5,5,12,0.88)), url(${bgImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "scroll",
      }}
    >
      <div className="px-4 pt-5 pb-2 flex flex-col gap-4">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-black tracking-tight leading-tight">
            <span className="text-white">Enter the </span>
            <span style={{ background: "linear-gradient(90deg,#ef4444,#a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Arena</span>
          </h1>
          <p className="text-[11px] text-zinc-500 mt-1">Free Fire Max tournaments · Win real diamonds</p>
        </div>

        {/* Game Modes section */}
        <div className="flex flex-col gap-2.5">
          <SectionLabel delay={80} visible={visible}>Game Modes</SectionLabel>
          <div className="flex flex-col gap-3">
            {MODES.map(mode => (
              <ModeCard key={mode.id} mode={mode} visible={visible} />
            ))}
          </div>
        </div>

        {/* Instant Battle section */}
        <div className="flex flex-col gap-2.5 mt-2">
          <SectionLabel delay={40} visible={visible}>Instant Battle</SectionLabel>
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate("/quickmatch")}
            onKeyDown={e => e.key === "Enter" && navigate("/quickmatch")}
            className="relative overflow-hidden cursor-pointer active:scale-[0.99] select-none"
            style={{
              borderRadius: "14px",
              background: "linear-gradient(135deg, #1c1205 0%, #111111 45%, #1a1205 100%)",
              border: "1px solid rgba(245,158,11,0.25)",
            }}
          >
                {/* Subtle carbon-fiber texture overlay */}
                <div className="absolute inset-0 pointer-events-none" style={{
                  backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.012) 3px, rgba(255,255,255,0.012) 4px)",
                  zIndex: 0,
                }} />

                {/* Background glow */}
                <div className="absolute -top-6 -left-6 w-48 h-48 rounded-full pointer-events-none" style={{
                  background: "radial-gradient(circle, rgba(245,158,11,0.16) 0%, transparent 65%)",
                }} />
                <div className="absolute -bottom-6 -right-6 w-36 h-36 rounded-full pointer-events-none" style={{
                  background: "radial-gradient(circle, rgba(217,119,6,0.12) 0%, transparent 65%)",
                }} />

                {/* Static shimmer highlight */}
                <div className="absolute inset-0 pointer-events-none" style={{
                  background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.04) 50%, transparent 70%)",
                  zIndex: 1,
                }} />

                {/* ── Content row ── */}
                <div className="relative flex items-center gap-3 px-3 pt-3 pb-2" style={{ zIndex: 2 }}>
                  {/* Sword emblem */}
                  <SwordEmblem />

                  {/* Right text */}
                  <div className="flex-1 min-w-0">
                    {/* Live + queue badges */}
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="rounded-full shrink-0"
                          style={{ width: 8, height: 8, background: "#f97316", display: "inline-block" }}
                        />
                        <span className="text-[11px] font-black text-white tracking-widest uppercase">LIVE</span>
                      </div>
                      <span
                        className="text-[10px] font-bold px-2.5 py-0.5 rounded-md"
                        style={{
                          background: "rgba(17,17,17,0.9)",
                          border: "1px solid rgba(245,158,11,0.45)",
                          color: "#fbbf24",
                        }}
                      >
                        247 in queue
                      </span>
                    </div>

                    {/* Title */}
                    <h2
                      className="font-heading font-black leading-none tracking-tight"
                      style={{
                        fontSize: 24,
                        color: "#ffffff",
                        textShadow: "0 0 20px rgba(245,158,11,0.5)",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      Instant Battle
                    </h2>

                    {/* Tagline */}
                    <p className="mt-1 leading-snug" style={{ fontSize: 11, color: "rgba(253,186,116,0.7)", fontWeight: 500 }}>
                      No wait. No setup. Drop in &amp; fight.
                    </p>
                  </div>
                </div>

                {/* ── ENTER NOW button ── */}
                <div
                  className="relative mx-2.5 mb-2.5 rounded-lg flex items-center justify-center gap-1.5 py-2.5"
                  style={{
                    zIndex: 2,
                    background: "linear-gradient(135deg, #ea580c 0%, #d97706 40%, #f59e0b 70%, #d97706 100%)",
                    boxShadow: "0 3px 16px rgba(234,88,12,0.55), inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.25)",
                  }}
                >
                  <span
                    className="font-black uppercase tracking-[0.15em] text-white"
                    style={{ fontSize: 13, textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}
                  >
                    ENTER NOW
                  </span>
                  <span className="text-white font-black" style={{ fontSize: 15, lineHeight: 1, marginTop: 1 }}>»</span>
                </div>

          </div>
        </div>

      </div>
    </div>
  );
}
