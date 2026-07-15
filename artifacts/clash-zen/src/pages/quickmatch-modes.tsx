import { useParams, useLocation } from "wouter";
import { ArrowLeft, Clock, Users, Zap, Swords, Heart, Shield, Scissors, Target, Wind, Crosshair, Map } from "lucide-react";
import { useEffect, useState } from "react";

type GameType = "cs" | "br";

const TYPE_META: Record<GameType, {
  label: string;
  short: string;
  accent: string;
  glow: string;
  border: string;
  headerBg: string;
}> = {
  cs: {
    label: "Classic Survival",
    short: "CS",
    accent: "#ef4444",
    glow: "rgba(239,68,68,0.4)",
    border: "rgba(239,68,68,0.3)",
    headerBg: "radial-gradient(ellipse at 60% 0%, rgba(239,68,68,0.12) 0%, transparent 60%)",
  },
  br: {
    label: "Battle Royale",
    short: "BR",
    accent: "#3b82f6",
    glow: "rgba(59,130,246,0.4)",
    border: "rgba(59,130,246,0.3)",
    headerBg: "radial-gradient(ellipse at 60% 0%, rgba(59,130,246,0.12) 0%, transparent 60%)",
  },
};

interface SubMode {
  id: string;
  name: string;
  format: string;
  desc: string;
  waitTime: string;
  entryFee: number;
  Icon: React.ElementType;
  accent: string;
  popular?: boolean;
}

const CS_MODES: SubMode[] = [
  {
    id: "duel",
    name: "1v1 Duel",
    format: "1v1",
    desc: "Head-to-head elimination — best reflexes win",
    waitTime: "~30s",
    entryFee: 0,
    Icon: Crosshair,
    accent: "#ef4444",
    popular: true,
  },
  {
    id: "healing",
    name: "Healing Battle",
    format: "1v1",
    desc: "Fight while managing health kits — strategy meets aim",
    waitTime: "~45s",
    entryFee: 0,
    Icon: Heart,
    accent: "#ec4899",
  },
  {
    id: "clash-squad",
    name: "Clash Squad",
    format: "4v4",
    desc: "Round-based squad showdown in a tight zone",
    waitTime: "~1m",
    entryFee: 0,
    Icon: Shield,
    accent: "#f97316",
  },
  {
    id: "knife",
    name: "Knife Fight",
    format: "1v1",
    desc: "Melee only — pure movement and timing",
    waitTime: "~20s",
    entryFee: 0,
    Icon: Scissors,
    accent: "#a78bfa",
  },
];

const BR_MODES: SubMode[] = [
  {
    id: "solo-drop",
    name: "Solo Drop",
    format: "Solo",
    desc: "Drop in alone, loot fast, outlast everyone",
    waitTime: "~1m",
    entryFee: 0,
    Icon: Target,
    accent: "#3b82f6",
    popular: true,
  },
  {
    id: "duo-rush",
    name: "Duo Rush",
    format: "2v2",
    desc: "Pair up and push hard — teamwork takes the win",
    waitTime: "~1m 30s",
    entryFee: 0,
    Icon: Users,
    accent: "#06b6d4",
  },
  {
    id: "squad-wipe",
    name: "Squad Wipe",
    format: "4v4",
    desc: "Full squad fights — eliminate the entire enemy squad",
    waitTime: "~2m",
    entryFee: 0,
    Icon: Swords,
    accent: "#8b5cf6",
  },
  {
    id: "zone-control",
    name: "Zone Control",
    format: "Solo",
    desc: "Hold the safe zone longest — patience and positioning",
    waitTime: "~45s",
    entryFee: 0,
    Icon: Map,
    accent: "#22c55e",
  },
];

function SubModeCard({ mode, delay, visible, searching, onSelect }: {
  mode: SubMode;
  delay: number;
  visible: boolean;
  searching: number | null;
  onSelect: () => void;
}) {
  const Icon = mode.Icon;
  const cardAccent = mode.accent;

  return (
    <div
      className="relative overflow-hidden rounded-2xl active:scale-[0.975] transition-transform cursor-pointer"
      style={{
        background: `linear-gradient(135deg, ${cardAccent}0f 0%, rgba(255,255,255,0.02) 100%)`,
        border: `1px solid ${cardAccent}30`,
        boxShadow: `0 4px 24px ${cardAccent}18`,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 0.35s ease ${delay}ms, transform 0.35s ease ${delay}ms, scale 0.15s ease`,
      }}
      onClick={onSelect}
    >
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl"
        style={{ background: `linear-gradient(to bottom, ${cardAccent}, ${cardAccent}50)` }} />

      <div className="flex items-center gap-3 px-4 py-4 pl-5">
        {/* Icon */}
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{
            background: `${cardAccent}18`,
            border: `1.5px solid ${cardAccent}35`,
            boxShadow: `0 0 16px ${cardAccent}20`,
          }}
        >
          <Icon className="w-5 h-5" style={{ color: cardAccent }} strokeWidth={1.8} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[14px] font-extrabold text-white truncate">{mode.name}</span>
            {mode.popular && (
              <span
                className="text-[8px] font-black px-1.5 py-0.5 rounded-full tracking-widest uppercase shrink-0"
                style={{ background: `${cardAccent}25`, color: cardAccent, border: `1px solid ${cardAccent}40` }}
              >
                Hot
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-500 leading-snug mb-2">{mode.desc}</p>

          <div className="flex items-center gap-3">
            {/* Format */}
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {mode.format}
            </span>
            {/* Wait time */}
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-zinc-600" />
              <span className="text-[10px] text-zinc-500 font-semibold">{mode.waitTime}</span>
            </div>
            {/* Entry fee */}
            <div className="flex items-center gap-1 ml-auto">
              <svg viewBox="0 0 16 16" width={12} height={12} fill="none">
                <polygon points="8,1 3,5 8,4.2 13,5" fill="#60a5fa" opacity="0.9" />
                <polygon points="3,5 8,4.2 6,9" fill="#2563eb" />
                <polygon points="13,5 8,4.2 10,9" fill="#3b82f6" />
                <polygon points="3,5 6,9 8,15" fill="#1d4ed8" opacity="0.8" />
                <polygon points="13,5 10,9 8,15" fill="#2563eb" opacity="0.75" />
                <polygon points="6,9 10,9 8,15" fill="#1e3a8a" />
              </svg>
              <span className="text-[11px] font-extrabold text-blue-300 tabular-nums">{mode.entryFee}</span>
            </div>
          </div>

          {/* Searching badge */}
          {searching !== null && (
            <div className="mt-2 flex items-center gap-1">
              <Users className="w-3 h-3" style={{ color: cardAccent }} strokeWidth={2} />
              <span className="text-[10px] font-bold" style={{ color: `${cardAccent}cc` }}>
                {searching === 0 ? "Be the first!" : `${searching} searching`}
              </span>
            </div>
          )}
        </div>

        {/* Arrow */}
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${cardAccent}18`, border: `1px solid ${cardAccent}30` }}
        >
          <Wind className="w-3.5 h-3.5" style={{ color: cardAccent }} strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}

interface QuickMatchStats {
  cs: { total: number; modes: Record<string, number> };
  br: { total: number; modes: Record<string, number> };
}

export default function QuickMatchModes() {
  const params = useParams<{ type: string }>();
  const [, navigate] = useLocation();
  const [visible, setVisible] = useState(false);
  const [stats, setStats] = useState<QuickMatchStats | null>(null);

  const typeKey = (params.type ?? "cs") as GameType;
  const meta = TYPE_META[typeKey] ?? TYPE_META.cs;
  const modes = typeKey === "cs" ? CS_MODES : BR_MODES;

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    setStats({
      cs: { total: 8, modes: { duel: 3, healing: 2, "clash-squad": 2, knife: 1 } },
      br: { total: 5, modes: { "solo-drop": 2, "duo-rush": 1, "squad-wipe": 1, "zone-control": 1 } },
    });
  }, []);

  const modeCounts = stats ? stats[typeKey]?.modes ?? null : null;

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "hsl(var(--background))" }}>
      <style>{`
        @keyframes live-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>

      {/* Header */}
      <div
        className="shrink-0 px-4 pt-14 pb-6 relative"
        style={{ background: "linear-gradient(180deg,#030303 0%,hsl(var(--background)) 100%)" }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{ background: meta.headerBg }} />

        <div className="flex items-center justify-between mb-5 relative z-10">
          <button
            onClick={() => navigate("/quickmatch")}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>

          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{
              background: `${meta.accent}15`,
              border: `1px solid ${meta.accent}35`,
              boxShadow: `0 0 12px ${meta.accent}25`,
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: meta.accent, animation: "live-pulse 1.4s ease-in-out infinite" }}
            />
            <span className="text-[11px] font-extrabold tracking-widest uppercase" style={{ color: meta.accent }}>
              {meta.short}
            </span>
          </div>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-[10px] font-black tracking-[0.2em] uppercase text-zinc-500">Select Mode</span>
          </div>
          <h1 className="font-heading text-2xl font-black text-white tracking-tight leading-tight">
            {meta.label}
          </h1>
          <p className="text-[12px] text-zinc-500 mt-1">Pick a mode and find your match instantly</p>
        </div>
      </div>

      {/* Modes list */}
      <div className="flex-1 px-4 pb-10 flex flex-col gap-3 pt-1">
        {modes.map((mode, idx) => (
          <SubModeCard
            key={mode.id}
            mode={mode}
            delay={idx * 70}
            visible={visible}
            searching={modeCounts ? (modeCounts[mode.id] ?? 0) : null}
            onSelect={() => navigate(`/quickmatch/${typeKey}/${mode.id}`)}
          />
        ))}

        {/* Coming soon hint */}
        <div
          className="rounded-2xl px-4 py-3 flex items-center gap-3 mt-1"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px dashed rgba(255,255,255,0.08)",
            opacity: visible ? 1 : 0,
            transition: "opacity 0.4s ease 420ms",
          }}
        >
          <span className="text-[18px]">🎮</span>
          <p className="text-[11px] text-zinc-600">More modes coming soon — stay tuned for updates</p>
        </div>
      </div>
    </div>
  );
}
