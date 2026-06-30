import { useLocation } from "wouter";
import { ArrowLeft, Zap, Users } from "lucide-react";
import { useEffect, useState } from "react";

const GAME_TYPES = [
  {
    id: "cs",
    label: "Classic Survival",
    short: "CS",
    tagline: "Close-range tactics & skill duels",
    accent: "#ef4444",
    glow: "rgba(239,68,68,0.45)",
    border: "rgba(239,68,68,0.35)",
    bg: "linear-gradient(135deg, rgba(239,68,68,0.18) 0%, rgba(239,68,68,0.04) 100%)",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" width={40} height={40}>
        <circle cx="20" cy="20" r="18" stroke="#ef4444" strokeWidth="1.5" opacity="0.3" />
        <circle cx="20" cy="20" r="3" fill="#ef4444" />
        <line x1="20" y1="4" x2="20" y2="12" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
        <line x1="20" y1="28" x2="20" y2="36" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
        <line x1="4" y1="20" x2="12" y2="20" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
        <line x1="28" y1="20" x2="36" y2="20" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    modes: ["1v1 Duel", "Healing Battle", "Clash Squad", "Knife Fight"],
  },
  {
    id: "br",
    label: "Battle Royale",
    short: "BR",
    tagline: "Drop, loot, survive to the last zone",
    accent: "#3b82f6",
    glow: "rgba(59,130,246,0.45)",
    border: "rgba(59,130,246,0.35)",
    bg: "linear-gradient(135deg, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0.04) 100%)",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" width={40} height={40}>
        <path d="M20 4 L34 30 L20 24 L6 30 Z" stroke="#3b82f6" strokeWidth="1.5" fill="rgba(59,130,246,0.1)" strokeLinejoin="round" />
        <circle cx="20" cy="20" r="3" fill="#3b82f6" />
        <path d="M20 24 L20 36" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    modes: ["Solo Drop", "Duo Rush", "Squad Wipe", "Zone Control"],
  },
];

interface QuickMatchStats {
  cs: { total: number; modes: Record<string, number> };
  br: { total: number; modes: Record<string, number> };
}

function SearchingBadge({ count, accent }: { count: number | null; accent: string }) {
  if (count === null) return null;
  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded-full"
      style={{
        background: `${accent}18`,
        border: `1px solid ${accent}40`,
      }}
    >
      <Users className="w-3 h-3" style={{ color: accent }} strokeWidth={2} />
      <span className="text-[10px] font-extrabold tabular-nums" style={{ color: accent }}>
        {count === 0 ? "Be the first!" : `${count} searching`}
      </span>
    </div>
  );
}

export default function QuickMatchHub() {
  const [, navigate] = useLocation();
  const [visible, setVisible] = useState(false);
  const [stats, setStats] = useState<QuickMatchStats | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    setStats({ cs: { total: 8, modes: {} }, br: { total: 5, modes: {} } });
  }, []);

  return (
    <div
      className="min-h-[100dvh] flex flex-col"
      style={{ background: "hsl(var(--background))" }}
    >
      <style>{`
        @keyframes live-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
        @keyframes radar-ring {
          0% { transform: scale(0.6); opacity: 0.7; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>

      {/* Header */}
      <div
        className="shrink-0 px-4 pt-14 pb-6 relative"
        style={{
          background: "linear-gradient(180deg,#030303 0%,hsl(var(--background)) 100%)",
        }}
      >
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(239,68,68,0.08) 0%, transparent 60%)" }} />

        <div className="flex items-center justify-between mb-6 relative z-10">
          <button
            onClick={() => navigate("/matches")}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>

          {/* LIVE badge */}
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.3)",
              boxShadow: "0 0 12px rgba(239,68,68,0.2)",
            }}
          >
            <span
              className="w-2 h-2 rounded-full bg-red-500"
              style={{ animation: "live-pulse 1.4s ease-in-out infinite" }}
            />
            <span className="text-[11px] font-extrabold tracking-widest text-red-400 uppercase">Live</span>
          </div>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-yellow-400" fill="currentColor" />
            <span className="text-[10px] font-black tracking-[0.2em] uppercase text-zinc-500">Quick Match</span>
          </div>
          <h1 className="font-heading text-3xl font-black text-white tracking-tight leading-none">
            Live<br />
            <span style={{ background: "linear-gradient(90deg,#ef4444,#f97316)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Matchmaking
            </span>
          </h1>
          <p className="text-[12px] text-zinc-500 mt-2">Choose your game type to find a match instantly</p>
        </div>
      </div>

      {/* Game type tiles */}
      <div className="flex-1 px-4 pb-8 flex flex-col gap-4 pt-2">
        {GAME_TYPES.map((type, idx) => {
          const typeStats = stats ? stats[type.id as "cs" | "br"] : null;
          const total = typeStats?.total ?? null;

          return (
            <button
              key={type.id}
              onClick={() => navigate(`/quickmatch/${type.id}`)}
              className="relative overflow-hidden rounded-3xl text-left active:scale-[0.975] transition-transform w-full"
              style={{
                background: type.bg,
                border: `1.5px solid ${type.border}`,
                boxShadow: `0 8px 40px ${type.glow.replace("0.45", "0.2")}`,
                minHeight: 168,
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(28px)",
                transition: `opacity 0.4s ease ${idx * 120}ms, transform 0.4s ease ${idx * 120}ms, scale 0.15s ease`,
              }}
            >
              {/* Glow orb */}
              <div
                className="absolute -top-12 -right-12 w-48 h-48 rounded-full pointer-events-none"
                style={{ background: `radial-gradient(circle, ${type.glow} 0%, transparent 65%)` }}
              />

              {/* Top accent bar */}
              <div className="absolute top-0 left-0 right-0 h-[2px]"
                style={{ background: `linear-gradient(90deg, ${type.accent}, ${type.accent}40)` }} />

              <div className="relative z-10 p-5 flex flex-col h-full">
                {/* Top row */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex flex-col gap-2">
                    <span
                      className="text-[10px] font-black tracking-[0.22em] uppercase px-2.5 py-1 rounded-full"
                      style={{
                        background: `${type.accent}20`,
                        color: type.accent,
                        border: `1px solid ${type.accent}45`,
                      }}
                    >
                      {type.short}
                    </span>
                    <SearchingBadge count={total} accent={type.accent} />
                  </div>
                  <div style={{ opacity: 0.7 }}>{type.icon}</div>
                </div>

                {/* Title */}
                <h2
                  className="font-heading text-2xl font-black text-white tracking-tight leading-none mb-1"
                  style={{ textShadow: `0 0 24px ${type.glow}` }}
                >
                  {type.label}
                </h2>
                <p className="text-[12px] mb-4" style={{ color: `${type.accent}bb` }}>{type.tagline}</p>

                {/* Mode pills */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {type.modes.map(m => (
                    <span
                      key={m}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
                    >
                      {m}
                    </span>
                  ))}
                </div>

                {/* CTA */}
                <div className="flex items-center gap-2 mt-auto">
                  <span
                    className="text-[13px] font-extrabold px-5 py-2.5 rounded-xl"
                    style={{
                      background: `linear-gradient(135deg, ${type.accent}, ${type.accent}cc)`,
                      color: "#fff",
                      boxShadow: `0 4px 16px ${type.glow}`,
                    }}
                  >
                    Select Mode →
                  </span>
                </div>
              </div>
            </button>
          );
        })}

        {/* Info note */}
        <div
          className="rounded-2xl px-4 py-3 flex items-start gap-3 mt-1"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            opacity: visible ? 1 : 0,
            transition: "opacity 0.4s ease 340ms",
          }}
        >
          <Zap className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Live matchmaking connects you with players at your skill level in real time. Entry fees apply per mode.
          </p>
        </div>
      </div>
    </div>
  );
}
