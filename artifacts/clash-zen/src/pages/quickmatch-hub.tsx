import { useLocation } from "wouter";
import { ArrowLeft, Users, Map, Shield, Crosshair, Package, ChevronRight, Zap, Target } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import brImage from "@assets/1783487489445_1_1783942080739.png";
import csImage from "@assets/1783492275863_1783942081269.png";

const DUMMY_TOTALS = [17, 18, 20, 21, 19, 17];

const MODES = [
  {
    id: "cs",
    label: "CLASH SQUAD",
    short: "CS",
    tagline: "1v1 tactical elimination.",
    desc: "Head-to-head showdown — outaim your opponent and claim the prize.",
    accent: "#22d3ee",
    accentDim: "rgba(34,211,238,0.18)",
    accentGlow: "rgba(34,211,238,0.55)",
    gradient: "linear-gradient(160deg, rgba(34,211,238,0.2) 0%, rgba(0,0,0,0) 55%)",
    image: csImage,
    comingSoon: false,
    stats: [
      { icon: Crosshair, value: "1v1", label: "Format" },
      { icon: Shield, value: "Live", label: "Status" },
      { icon: Target, value: "1", label: "Mode" },
    ],
    modes: [{ label: "1v1 Duel", live: true }],
  },
  {
    id: "br",
    label: "BATTLE ROYALE",
    short: "BR",
    tagline: "100 players. One winner.",
    desc: "Drop in, loot up, and fight to be the last squad standing across massive open maps.",
    accent: "#f97316",
    accentDim: "rgba(249,115,22,0.18)",
    accentGlow: "rgba(249,115,22,0.55)",
    gradient: "linear-gradient(160deg, rgba(249,115,22,0.22) 0%, rgba(0,0,0,0) 55%)",
    image: brImage,
    comingSoon: true,
    stats: [
      { icon: Users, value: "4v4", label: "Max Squad" },
      { icon: Crosshair, value: "100", label: "Players" },
      { icon: Package, value: "4", label: "Modes" },
    ],
    modes: [
      { label: "Solo Drop", live: false },
      { label: "Duo Rush", live: false },
      { label: "Squad Wipe", live: false },
      { label: "Zone Control", live: false },
    ],
  },
];

export default function QuickMatchHub() {
  const [, navigate] = useLocation();
  const [online, setOnline] = useState<number | null>(null);
  const [entered, setEntered] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 40);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    function tick() {
      setOnline(DUMMY_TOTALS[seqRef.current % DUMMY_TOTALS.length]);
      seqRef.current += 1;
    }
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);

  const handleModeSelect = (id: string) => {
    const mode = MODES.find(m => m.id === id);
    if (!mode || mode.comingSoon) return;
    if (id === "cs") {
      navigate("/quickmatch/cs/prize-pool");
    } else {
      navigate(`/quickmatch/${id}`);
    }
  };

  return (
    <div
      className="relative min-h-[100dvh] overflow-hidden"
      style={{ background: "#06070a" }}
    >
      <style>{`
        @keyframes qm-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }
        @keyframes qm-ring  { 0%{transform:scale(0.5);opacity:0.7} 100%{transform:scale(2.6);opacity:0} }
        @keyframes qm-slide-up { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
        @keyframes qm-badge-in { from{opacity:0;transform:scale(0.8) translateY(-6px)} to{opacity:1;transform:scale(1) translateY(0)} }
      `}</style>

      {/* ── Sticky floating header ── */}
      <div
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 12px)",
          paddingBottom: 12,
          background: "linear-gradient(to bottom, rgba(6,7,10,0.92) 0%, transparent 100%)",
          pointerEvents: "none",
        }}
      >
        <button
          onClick={() => navigate("/matches")}
          className="flex items-center gap-2 rounded-2xl active:scale-90 transition-transform"
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            padding: "8px 14px 8px 10px",
            pointerEvents: "auto",
            backdropFilter: "blur(16px)",
          }}
        >
          <ArrowLeft className="w-4 h-4 text-white" strokeWidth={2.2} />
          <span className="text-[12px] font-bold text-white tracking-wide">Back</span>
        </button>

        {/* Online pill */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-2xl"
          style={{
            background: "rgba(6,7,10,0.75)",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(16px)",
            pointerEvents: "auto",
            animation: "qm-badge-in 0.5s cubic-bezier(0.34,1.4,0.64,1) 0.2s both",
          }}
        >
          <div className="relative w-3 h-3 flex items-center justify-center shrink-0">
            <div className="absolute inset-0 rounded-full bg-emerald-400/30"
              style={{ animation: "qm-ring 1.8s ease-out infinite" }} />
            <div className="absolute inset-0 rounded-full bg-emerald-400/20"
              style={{ animation: "qm-ring 1.8s ease-out 0.7s infinite" }} />
            <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
              style={{ animation: "qm-pulse 1.6s ease-in-out infinite" }} />
          </div>
          <span className="text-[11px] font-black text-emerald-300 tabular-nums">
            {online !== null ? `${online} online` : "—"}
          </span>
        </div>
      </div>

      {/* ── Page title block ── */}
      <div
        className="relative z-10 pt-28 pb-6 px-5 flex flex-col gap-1"
        style={{
          opacity: entered ? 1 : 0,
          transform: entered ? "translateY(0)" : "translateY(16px)",
          transition: "opacity 0.4s ease, transform 0.45s cubic-bezier(0.34,1.2,0.64,1)",
        }}
      >
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" strokeWidth={2.5} />
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-400">
            Live Matchmaking
          </span>
        </div>
        <h1
          className="font-heading font-black text-white leading-none"
          style={{ fontSize: 30, letterSpacing: "-0.02em" }}
        >
          Choose Your<br />
          <span style={{ color: "#f97316" }}>Game Mode</span>
        </h1>
      </div>

      {/* ── Mode cards ── */}
      <div className="relative z-10 px-4 pb-10 flex flex-col gap-4">
        {MODES.map((mode, idx) => (
          <ModeCard
            key={mode.id}
            mode={mode}
            entered={entered}
            delay={idx * 120 + 80}
            onSelect={() => handleModeSelect(mode.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ModeCard({
  mode,
  entered,
  delay,
  onSelect,
}: {
  mode: typeof MODES[0];
  entered: boolean;
  delay: number;
  onSelect: () => void;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={onSelect}
      className="relative w-full overflow-hidden text-left"
      style={{
        borderRadius: 20,
        border: `1.5px solid ${mode.accent}44`,
        background: "#0d0f14",
        opacity: entered ? 1 : 0,
        transform: entered
          ? pressed ? "scale(0.975)" : "translateY(0)"
          : "translateY(36px)",
        transition: `opacity 0.45s ease ${delay}ms, transform ${pressed ? "0.12s" : `0.5s cubic-bezier(0.34,1.2,0.64,1) ${delay}ms`}`,
        boxShadow: `0 2px 0 rgba(0,0,0,0.5), 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03)`,
      }}
    >
      {/* ── Artwork panel ── */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16/8" }}>
        <img
          src={mode.image}
          alt={mode.label}
          loading="eager"
          draggable={false}
          style={{
            width: "100%", height: "100%",
            objectFit: "cover", objectPosition: "center top",
            display: "block",
            transform: pressed ? "scale(1.03)" : "scale(1)",
            transition: "transform 0.4s ease",
          }}
        />
        <div className="absolute inset-0" style={{
          background: `linear-gradient(to bottom, transparent 20%, rgba(13,15,20,0.7) 70%, #0d0f14 100%)`
        }} />
        <div className="absolute inset-0" style={{ background: mode.gradient }} />

        {/* Type badge */}
        <div
          className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
          style={{
            background: `${mode.accent}22`,
            border: `1px solid ${mode.accent}55`,
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: mode.accent }} />
          <span className="text-[10px] font-black tracking-[0.15em] uppercase" style={{ color: mode.accent }}>
            {mode.short}
          </span>
        </div>

        {/* Title on image */}
        <div className="absolute bottom-3 left-4 right-4">
          <p className="text-[11px] font-bold tracking-wider uppercase mb-1" style={{ color: `${mode.accent}cc` }}>
            {mode.tagline}
          </p>
          <h2
            className="font-heading font-black text-white leading-none"
            style={{ fontSize: 24, letterSpacing: "-0.01em", textShadow: "0 2px 12px rgba(0,0,0,0.9)" }}
          >
            {mode.label}
          </h2>
        </div>
      </div>

      {/* ── Content panel ── */}
      <div className="px-4 pt-3 pb-4">
        <p className="text-[12px] text-zinc-400 leading-relaxed mb-4">
          {mode.desc}
        </p>

        {/* Stats strip */}
        <div
          className="flex items-stretch gap-0 mb-4 overflow-hidden"
          style={{ borderRadius: 12, border: `1px solid rgba(255,255,255,0.06)` }}
        >
          {mode.stats.map(({ icon: Icon, value, label }, i) => (
            <div
              key={label}
              className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5"
              style={{
                borderRight: i < mode.stats.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                background: "rgba(255,255,255,0.025)",
              }}
            >
              <Icon className="w-3.5 h-3.5 mb-0.5" style={{ color: mode.accent }} strokeWidth={2} />
              <span className="text-[15px] font-black text-white leading-none tabular-nums">{value}</span>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mt-0.5">{label}</span>
            </div>
          ))}
        </div>

        {/* Mode pills */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {mode.modes.map(m => (
            <span
              key={m.label}
              className="text-[10px] font-bold px-2.5 py-1 rounded-lg"
              style={{
                background: m.live ? mode.accentDim : "rgba(255,255,255,0.04)",
                color: m.live ? `${mode.accent}cc` : "rgba(255,255,255,0.25)",
                border: `1px solid ${m.live ? `${mode.accent}25` : "rgba(255,255,255,0.08)"}`,
              }}
            >
              {m.label}{!m.live && " · soon"}
            </span>
          ))}
        </div>

        {/* CTA button */}
        <div
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl"
          style={{
            background: mode.comingSoon
              ? "rgba(255,255,255,0.04)"
              : `linear-gradient(135deg, ${mode.accent} 0%, ${mode.accent}cc 100%)`,
            boxShadow: mode.comingSoon
              ? "none"
              : `0 4px 24px ${mode.accentGlow.replace("0.55", "0.35")}, 0 1px 0 rgba(255,255,255,0.15) inset`,
            border: mode.comingSoon ? "1px solid rgba(255,255,255,0.08)" : "none",
            transform: pressed && !mode.comingSoon ? "scale(0.97)" : "scale(1)",
            transition: "transform 0.12s ease",
          }}
        >
          <span
            className="font-heading font-black tracking-wide uppercase"
            style={{ fontSize: 14, color: mode.comingSoon ? "rgba(255,255,255,0.3)" : "#fff" }}
          >
            {mode.comingSoon ? "Coming Soon" : `Enter ${mode.short}`}
          </span>
          {!mode.comingSoon && <ChevronRight className="w-4 h-4 text-white" strokeWidth={3} />}
        </div>
      </div>
    </button>
  );
}
