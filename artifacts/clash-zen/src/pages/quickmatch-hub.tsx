import { useLocation } from "wouter";
import { ArrowLeft, Users, Map, Shield, Crosshair, Package, ChevronRight, Zap, Target, X, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import brImage from "@assets/1783487489445_1_1783942080739.png";
import csImage from "@assets/1783492275863_1783942081269.png";

const DUMMY_TOTALS = [17, 18, 20, 21, 19, 17];

const MODES = [
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
    stats: [
      { icon: Users, value: "4v4", label: "Max Squad" },
      { icon: Crosshair, value: "100", label: "Players" },
      { icon: Package, value: "4", label: "Modes" },
    ],
    modes: ["Solo Drop", "Duo Rush", "Squad Wipe", "Zone Control"],
  },
  {
    id: "cs",
    label: "CLASH SQUAD",
    short: "CS",
    tagline: "4v4 tactical elimination.",
    desc: "Buy weapons each round, eliminate the enemy squad and dominate the scoreboard.",
    accent: "#22d3ee",
    accentDim: "rgba(34,211,238,0.18)",
    accentGlow: "rgba(34,211,238,0.55)",
    gradient: "linear-gradient(160deg, rgba(34,211,238,0.2) 0%, rgba(0,0,0,0) 55%)",
    image: csImage,
    stats: [
      { icon: Map, value: "4v4", label: "Format" },
      { icon: Shield, value: "7", label: "Rounds" },
      { icon: Target, value: "4", label: "Modes" },
    ],
    modes: ["1v1 Duel", "Healing Battle", "Clash Squad", "Ranked"],
  },
];

interface PrizePool {
  entry: number;
  prize: number;
}

const PRIZE_POOLS: PrizePool[] = [
  { entry: 12, prize: 20 },
  { entry: 30, prize: 50 },
  { entry: 42, prize: 70 },
];

function PrizePoolCard({ pool, onSelect }: { pool: PrizePool; onSelect: () => void }) {
  const [pressed, setPressed] = useState(false);

  return (
    <div
      className="shrink-0 relative overflow-hidden rounded-2xl cursor-pointer select-none"
      style={{
        width: "72vw",
        maxWidth: 260,
        minWidth: 220,
        background: "linear-gradient(160deg, #0f1a14 0%, #0a0f0d 100%)",
        border: "1.5px solid rgba(16,185,129,0.35)",
        boxShadow: pressed
          ? "0 0 0px #10b981"
          : "0 0 22px rgba(16,185,129,0.15), inset 0 1px 0 rgba(16,185,129,0.08)",
        transform: pressed ? "scale(0.96)" : "scale(1)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => { setPressed(false); onSelect(); }}
      onPointerLeave={() => setPressed(false)}
    >
      {/* Top neon border accent */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
        style={{ background: "linear-gradient(90deg, transparent 0%, #10b981 50%, transparent 100%)" }}
      />

      {/* WIN banner */}
      <div
        className="mx-4 mt-5 mb-3 rounded-xl flex items-center justify-center gap-2 py-2"
        style={{
          background: "linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(5,150,105,0.1) 100%)",
          border: "1px solid rgba(16,185,129,0.3)",
        }}
      >
        <Trophy className="w-4 h-4" style={{ color: "#10b981" }} strokeWidth={2} />
        <span className="text-[13px] font-black tracking-[0.15em] uppercase" style={{ color: "#10b981" }}>
          WIN
        </span>
        <span className="text-[15px] font-black" style={{ color: "#34d399" }}>
          ₹{pool.prize}
        </span>
      </div>

      {/* Prize breakdown */}
      <div className="px-4 pb-4 flex flex-col gap-2.5">
        {/* Entry fee row */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider">Entry Fee</span>
          <div
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <span className="text-[13px] font-black text-white">₹{pool.entry}</span>
          </div>
        </div>

        {/* Prize pool row */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider">Prize Pool</span>
          <div
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg"
            style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }}
          >
            <span className="text-[13px] font-black" style={{ color: "#34d399" }}>₹{pool.prize}</span>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

        {/* Fast match badge */}
        <div className="flex items-center justify-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 6px #34d399" }} />
          <span className="text-[10px] font-bold text-emerald-400 tracking-wide">Fast Match</span>
        </div>
      </div>

      {/* Bottom glow */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-px"
        style={{ background: "linear-gradient(90deg, transparent, #10b981, transparent)" }}
      />
    </div>
  );
}

function PrizePoolOverlay({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (pool: PrizePool) => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleSelect = (pool: PrizePool) => {
    setVisible(false);
    setTimeout(() => onSelect(pool), 200);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{
        background: visible ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0)",
        backdropFilter: visible ? "blur(4px)" : "none",
        transition: "background 0.3s ease, backdrop-filter 0.3s ease",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <style>{`
        .prize-scroll::-webkit-scrollbar { display: none; }
        .prize-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div
        className="rounded-t-3xl overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #0d1117 0%, #080c0a 100%)",
          border: "1px solid rgba(16,185,129,0.2)",
          borderBottom: "none",
          boxShadow: "0 -8px 40px rgba(16,185,129,0.12)",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Zap className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2.5} />
              <span className="text-[10px] font-black tracking-[0.2em] uppercase text-zinc-500">Clash Squad</span>
            </div>
            <h2 className="text-[18px] font-black text-white tracking-tight">Select Prize Pool</h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">Pick your entry — winner takes all</p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {/* Cards scroll area */}
        <div
          className="prize-scroll flex gap-4 px-5 pb-6 overflow-x-auto"
          style={{
            scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
            scrollPaddingLeft: "20px",
          }}
        >
          {PRIZE_POOLS.map((pool) => (
            <div key={pool.entry} style={{ scrollSnapAlign: "start" }}>
              <PrizePoolCard pool={pool} onSelect={() => handleSelect(pool)} />
            </div>
          ))}
          <div className="shrink-0 w-1" />
        </div>

        {/* Bottom hint */}
        <div
          className="mx-5 mb-6 rounded-xl px-4 py-2.5 flex items-center justify-center gap-2"
          style={{ background: "rgba(16,185,129,0.05)", border: "1px dashed rgba(16,185,129,0.15)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 opacity-70" />
          <span className="text-[10px] text-zinc-500 font-semibold">Swipe to explore pools · Tap to enter</span>
        </div>
      </div>
    </div>
  );
}

export default function QuickMatchHub() {
  const [, navigate] = useLocation();
  const [online, setOnline] = useState<number | null>(null);
  const [entered, setEntered] = useState(false);
  const [showPrizePicker, setShowPrizePicker] = useState(false);
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
    if (id === "cs") {
      setShowPrizePicker(true);
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

      {/* Prize Pool Overlay — shown when CS is tapped */}
      {showPrizePicker && (
        <PrizePoolOverlay
          onClose={() => setShowPrizePicker(false)}
          onSelect={(pool) => navigate(`/quickmatch/cs?entry=${pool.entry}&prize=${pool.prize}`)}
        />
      )}
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
        {/* Overlays */}
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
        {/* Description */}
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
              key={m}
              className="text-[10px] font-bold px-2.5 py-1 rounded-lg"
              style={{
                background: mode.accentDim,
                color: `${mode.accent}cc`,
                border: `1px solid ${mode.accent}25`,
              }}
            >
              {m}
            </span>
          ))}
        </div>

        {/* CTA button */}
        <div
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl"
          style={{
            background: `linear-gradient(135deg, ${mode.accent} 0%, ${mode.accent}cc 100%)`,
            boxShadow: `0 4px 24px ${mode.accentGlow.replace("0.55", "0.35")}, 0 1px 0 rgba(255,255,255,0.15) inset`,
            transform: pressed ? "scale(0.97)" : "scale(1)",
            transition: "transform 0.12s ease",
          }}
        >
          <span className="font-heading font-black text-white tracking-wide uppercase" style={{ fontSize: 14 }}>
            Enter {mode.short}
          </span>
          <ChevronRight className="w-4 h-4 text-white" strokeWidth={3} />
        </div>
      </div>
    </button>
  );
}
