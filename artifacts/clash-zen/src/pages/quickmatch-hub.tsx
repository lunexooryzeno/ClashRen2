import { useLocation } from "wouter";
import { ArrowLeft, Users, Map, Shield, Crosshair, Package, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import brImage from "@assets/1783487489445_1_1783942080739.png";
import csImage from "@assets/1783492275863_1783942081269.png";

const GAME_TYPES = [
  {
    id: "br",
    short: "BR",
    title: "BATTLE ROYALE",
    subtitle: "SURVIVAL ARENA",
    tagline: "Solo, Duo, Squad  |  Large Scale Battles",
    image: brImage,
    accent: "#22d3ee",
    glow: "rgba(34,211,238,0.5)",
    border: "rgba(34,211,238,0.55)",
    icons: [
      { label: "SQUAD", Icon: Users },
      { label: "DROP", Icon: Crosshair },
      { label: "LOOT", Icon: Package },
    ],
    modes: ["Solo Drop", "Duo Rush", "Squad Wipe", "Zone Control"],
  },
  {
    id: "cs",
    short: "CS",
    title: "CLASSIC SURVIVAL",
    subtitle: "TACTICAL SQUAD",
    tagline: "Clash Squad  |  Competitive & Casual Modes",
    image: csImage,
    accent: "#22d3ee",
    glow: "rgba(34,211,238,0.5)",
    border: "rgba(34,211,238,0.55)",
    icons: [
      { label: "MAP", Icon: Map },
      { label: "SQUAD", Icon: Users },
      { label: "RANK", Icon: Shield },
    ],
    modes: ["1v1 Duel", "Healing Battle", "Clash Squad", "Ranked"],
  },
];

const DUMMY_TOTALS = [17, 18, 20, 21, 19, 17];

export default function QuickMatchHub() {
  const [, navigate] = useLocation();
  const [visible, setVisible] = useState(false);
  const [online, setOnline] = useState<number | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
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

  return (
    <div
      className="min-h-[100dvh] flex flex-col"
      style={{ background: "#090b0e" }}
    >
      <style>{`
        @keyframes qm-live {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.35; transform: scale(0.75); }
        }
        @keyframes qm-radar {
          0%   { transform: scale(0.6); opacity: 0.6; }
          100% { transform: scale(2.4); opacity: 0; }
        }
      `}</style>

      {/* ── Header ── */}
      <div
        className="shrink-0 px-4 pt-12 pb-5 flex items-center justify-between relative"
        style={{
          background: "linear-gradient(180deg, #060809 0%, #090b0e 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Subtle top glow */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 50% -20%, rgba(34,211,238,0.07) 0%, transparent 65%)" }} />

        {/* Back */}
        <button
          onClick={() => navigate("/matches")}
          className="relative z-10 w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>

        {/* Title */}
        <div className="relative z-10 flex flex-col items-center">
          <h1 className="font-heading text-[17px] font-black text-white tracking-wide leading-none">
            Live Matchmaking
          </h1>
          <p className="text-[10px] text-zinc-500 mt-0.5 tracking-wider uppercase">Choose your game type</p>
        </div>

        {/* Online badge */}
        <div
          className="relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full"
          style={{
            background: "rgba(34,211,238,0.1)",
            border: "1px solid rgba(34,211,238,0.3)",
          }}
        >
          {/* Radar rings */}
          <div className="relative w-2.5 h-2.5 flex items-center justify-center shrink-0">
            <div className="absolute inset-0 rounded-full"
              style={{ background: "rgba(34,211,238,0.3)", animation: "qm-radar 1.8s ease-out infinite" }} />
            <div className="absolute inset-0 rounded-full"
              style={{ background: "rgba(34,211,238,0.25)", animation: "qm-radar 1.8s ease-out 0.6s infinite" }} />
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#22d3ee", animation: "qm-live 1.4s ease-in-out infinite" }} />
          </div>
          <span className="text-[11px] font-black text-cyan-300 tabular-nums">
            {online !== null ? `${online} online` : "—"}
          </span>
        </div>
      </div>

      {/* ── Cards ── */}
      <div className="flex-1 px-4 pt-5 pb-8 flex flex-col gap-5">
        {GAME_TYPES.map((type, idx) => (
          <button
            key={type.id}
            onClick={() => navigate(`/quickmatch/${type.id}`)}
            className="relative overflow-hidden text-left w-full active:scale-[0.975]"
            style={{
              borderRadius: 16,
              border: `1.5px solid ${type.border}`,
              boxShadow: `0 0 0 1px rgba(34,211,238,0.08), 0 8px 40px ${type.glow.replace("0.5", "0.18")}`,
              background: "#0d1117",
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(32px)",
              transition: `opacity 0.4s ease ${idx * 140}ms, transform 0.45s cubic-bezier(0.34,1.2,0.64,1) ${idx * 140}ms, scale 0.15s ease`,
            }}
          >
            {/* Corner brackets */}
            {(["tl", "tr", "bl", "br"] as const).map(pos => (
              <CornerBracket key={pos} pos={pos} color={type.accent} />
            ))}

            {/* ── Artwork ── */}
            <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16/9" }}>
              <img
                src={type.image}
                alt={type.title}
                loading="eager"
                decoding="async"
                draggable={false}
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }}
              />
              {/* Bottom gradient fade into card body */}
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: "linear-gradient(to bottom, transparent 40%, rgba(13,17,23,0.85) 80%, #0d1117 100%)" }} />
              {/* Cyan corner glow top-right */}
              <div className="absolute -top-4 -right-4 w-32 h-32 rounded-full pointer-events-none"
                style={{ background: `radial-gradient(circle, ${type.glow} 0%, transparent 70%)`, opacity: 0.45 }} />

              {/* Title overlay on image */}
              <div className="absolute bottom-3 left-4 right-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-black tracking-[0.18em] uppercase px-2 py-0.5 rounded"
                    style={{ background: `${type.accent}22`, color: type.accent, border: `1px solid ${type.accent}40` }}>
                    {type.short}
                  </span>
                </div>
                <h2 className="font-heading font-black text-white leading-none mt-1.5"
                  style={{ fontSize: 22, letterSpacing: "-0.01em", textShadow: `0 2px 16px rgba(0,0,0,0.8)` }}>
                  {type.title}
                  <span className="mx-1.5 text-zinc-400 font-normal">|</span>
                  <span style={{ color: type.accent }}>{type.subtitle}</span>
                </h2>
                <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>{type.tagline}</p>
              </div>
            </div>

            {/* ── Bottom content ── */}
            <div
              className="px-4 pt-3 pb-4 flex items-center gap-3"
              style={{
                background: "linear-gradient(135deg, rgba(13,17,23,0.98) 0%, rgba(15,20,28,0.98) 100%)",
                backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.008) 3px, rgba(255,255,255,0.008) 4px)",
              }}
            >
              {/* Icon row */}
              <div className="flex items-center gap-2">
                {type.icons.map(({ label, Icon }) => (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{
                        background: `${type.accent}14`,
                        border: `1px solid ${type.accent}35`,
                      }}
                    >
                      <Icon className="w-4 h-4" style={{ color: type.accent }} strokeWidth={1.8} />
                    </div>
                    <span className="text-[9px] font-bold tracking-wider uppercase" style={{ color: `${type.accent}99` }}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="flex-1 flex justify-end">
                <div
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl"
                  style={{
                    background: `linear-gradient(135deg, ${type.accent}22, ${type.accent}14)`,
                    border: `1px solid ${type.accent}55`,
                    boxShadow: `0 4px 20px ${type.glow.replace("0.5", "0.25")}`,
                  }}
                >
                  <span className="font-black uppercase tracking-[0.1em] text-white" style={{ fontSize: 11 }}>
                    Continue to Options
                  </span>
                  <span style={{ color: type.accent, fontSize: 13, fontWeight: 900 }}>›</span>
                </div>
              </div>
            </div>
          </button>
        ))}

        {/* Info note */}
        <div
          className="rounded-2xl px-4 py-3 flex items-start gap-3"
          style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.07)",
            opacity: visible ? 1 : 0,
            transition: "opacity 0.4s ease 380ms",
          }}
        >
          <TrendingUp className="w-4 h-4 text-cyan-500 mt-0.5 shrink-0" strokeWidth={2} />
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Live matchmaking connects you with players at your skill level in real time. Entry fees apply per mode.
          </p>
        </div>
      </div>
    </div>
  );
}

function CornerBracket({ pos, color }: { pos: "tl" | "tr" | "bl" | "br"; color: string }) {
  const size = 16;
  const thick = 2.5;
  const r = 3;

  const base: React.CSSProperties = { position: "absolute", zIndex: 20, pointerEvents: "none" };
  const corner: React.CSSProperties = {
    ...base,
    top: pos.includes("t") ? -1 : undefined,
    bottom: pos.includes("b") ? -1 : undefined,
    left: pos.includes("l") ? -1 : undefined,
    right: pos.includes("r") ? -1 : undefined,
    width: size,
    height: size,
  };
  const hBar: React.CSSProperties = {
    position: "absolute",
    width: size, height: thick,
    background: `linear-gradient(${pos.includes("l") ? "to right" : "to left"}, ${color}, ${color}40)`,
    top: pos.includes("t") ? 0 : undefined,
    bottom: pos.includes("b") ? 0 : undefined,
    left: pos.includes("l") ? 0 : undefined,
    right: pos.includes("r") ? 0 : undefined,
    borderRadius: pos === "tl" ? `${r}px 0 0 0` : pos === "tr" ? `0 ${r}px 0 0` : pos === "bl" ? `0 0 0 ${r}px` : `0 0 ${r}px 0`,
  };
  const vBar: React.CSSProperties = {
    position: "absolute",
    width: thick, height: size,
    background: `linear-gradient(${pos.includes("t") ? "to bottom" : "to top"}, ${color}, ${color}40)`,
    top: pos.includes("t") ? 0 : undefined,
    bottom: pos.includes("b") ? 0 : undefined,
    left: pos.includes("l") ? 0 : undefined,
    right: pos.includes("r") ? 0 : undefined,
    borderRadius: pos === "tl" ? `${r}px 0 0 0` : pos === "tr" ? `0 ${r}px 0 0` : pos === "bl" ? `0 0 0 ${r}px` : `0 0 ${r}px 0`,
  };

  return (
    <div style={corner}>
      <div style={hBar} />
      <div style={vBar} />
    </div>
  );
}
