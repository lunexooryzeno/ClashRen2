import { useLocation } from "wouter";
import { ArrowLeft, Trophy, Users, ChevronDown, ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { CoinIcon } from "@/components/CoinIcon";
import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const PRIZE_POOLS = [
  { entry: 12, prize: 20, activePlayers: 18 },
  { entry: 30, prize: 50, activePlayers: 11 },
  { entry: 42, prize: 70, activePlayers: 7 },
];

const GAME_TYPES = [
  { id: "cs" as const, label: "Clash Squad" },
  { id: "br" as const, label: "Battle Royale", comingSoon: true },
];

const SQUAD_OPTIONS: Record<string, { id: string; label: string }[]> = {
  cs: [
    { id: "solo",  label: "Solo"  },
    { id: "duo",   label: "Duo"   },
    { id: "squad", label: "Squad" },
  ],
  br: [
    { id: "solo",  label: "Solo"  },
    { id: "duo",   label: "Duo"   },
    { id: "squad", label: "Squad" },
  ],
};

const MODE_OPTIONS: Record<string, Record<string, { id: string; label: string; comingSoon?: boolean; random?: boolean }[]>> = {
  cs: {
    solo:  [
      { id: "any",     label: "Any (Random)",  random: true        },
      { id: "duel",    label: "Normal 1v1"                          },
      { id: "healing", label: "Healing Battle", comingSoon: true    },
      { id: "knife",   label: "Knife Fight",    comingSoon: true    },
    ],
    duo:   [
      { id: "any",  label: "Any (Random)", random: true             },
      { id: "duel", label: "2v2 Duel",     comingSoon: true         },
    ],
    squad: [
      { id: "any",         label: "Any (Random)", random: true      },
      { id: "clash-squad", label: "CS 4v4",       comingSoon: true  },
    ],
  },
  br: {
    solo:  [
      { id: "any",          label: "Any (Random)", random: true     },
      { id: "solo-drop",    label: "Solo Drop",    comingSoon: true  },
      { id: "zone-control", label: "Zone Control", comingSoon: true  },
    ],
    duo:   [
      { id: "any",      label: "Any (Random)", random: true        },
      { id: "duo-rush", label: "Duo Rush",     comingSoon: true     },
    ],
    squad: [
      { id: "any",        label: "Any (Random)", random: true      },
      { id: "squad-wipe", label: "Squad Wipe",   comingSoon: true   },
    ],
  },
};

function Dropdown({
  label,
  options,
  value,
  onChange,
  accent = "#22d3ee",
}: {
  label?: string;
  options: { id: string; label: string; comingSoon?: boolean }[];
  value: string;
  onChange: (id: string) => void;
  accent?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.id === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative flex-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl active:scale-[0.97] transition-transform"
        style={{
          background: open ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)",
          border: `1.5px solid ${open ? accent + "60" : "rgba(255,255,255,0.1)"}`,
          transition: "background 0.15s, border-color 0.15s, transform 0.1s",
        }}
      >
        <div className="flex flex-col items-start min-w-0">
          {label && <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 leading-none mb-0.5">{label}</span>}
          <span className="text-[13px] font-extrabold text-white truncate">{selected.label}</span>
        </div>
        <ChevronDown
          className="w-3.5 h-3.5 shrink-0 text-zinc-400 transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-2xl overflow-hidden"
          style={{
            background: "rgba(14,16,22,0.98)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
            backdropFilter: "blur(24px)",
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => { if (!opt.comingSoon) { onChange(opt.id); setOpen(false); } }}
              className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors"
              style={{
                background: opt.id === value ? "rgba(255,255,255,0.06)" : "transparent",
                opacity: opt.comingSoon ? 0.4 : 1,
                cursor: opt.comingSoon ? "not-allowed" : "pointer",
              }}
            >
              <span className={`text-[13px] font-bold ${opt.id === value ? "text-white" : "text-zinc-400"}`}>
                {opt.label}
              </span>
              {opt.id === value && (
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
              )}
              {opt.comingSoon && (
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Soon</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


export default function QuickMatchHub() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [gameType, setGameType] = useState<"cs" | "br">("cs");
  const [squadSize, setSquadSize] = useState("solo");
  const [modeId, setModeId] = useState("any");
  const [prizeIdx, setPrizeIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const [showTypeSheet, setShowTypeSheet] = useState(false);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [queueStats, setQueueStats] = useState<{
    cs: { total: number; modes: Record<string, number> };
    br: { total: number; modes: Record<string, number> };
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    async function fetchOnline() {
      try {
        const stats = await apiFetch<{
          cs: { total: number; modes: Record<string, number> };
          br: { total: number; modes: Record<string, number> };
        }>("/quickmatch/stats");
        setQueueStats(stats);
        const total = (stats.cs?.total ?? 0) + (stats.br?.total ?? 0);
        setOnlineCount(total);
      } catch {
        setOnlineCount(null);
      }
    }
    fetchOnline();
    const id = setInterval(fetchOnline, 8_000);
    return () => clearInterval(id);
  }, []);

  const pool = PRIZE_POOLS[prizeIdx];
  const squadOpts = SQUAD_OPTIONS[gameType];
  const modeOpts = MODE_OPTIONS[gameType][squadSize] ?? [];
  const currentMode = modeOpts.find(m => m.id === modeId) ?? modeOpts[0];
  const isComingSoon = currentMode?.comingSoon ?? false;

  // Real active player count for the current selection
  const activePlayers = (() => {
    if (!queueStats) return null;
    const gt = queueStats[gameType];
    if (!gt) return 0;
    if (!currentMode || currentMode.id === "any") return gt.total;
    return gt.modes[currentMode.id] ?? 0;
  })();

  const accent = gameType === "cs" ? "#22d3ee" : "#f97316";

  const handleSquadChange = (id: string) => {
    setSquadSize(id);
    const newModes = MODE_OPTIONS[gameType][id] ?? [];
    if (newModes.length > 0) setModeId(newModes[0].id);
  };

  const handleTypeChange = (id: string) => {
    const gt = id as "cs" | "br";
    setGameType(gt);
    setShowTypeSheet(false);
    const newSquad = SQUAD_OPTIONS[gt][0].id;
    setSquadSize(newSquad);
    const newModes = MODE_OPTIONS[gt][newSquad] ?? [];
    if (newModes.length > 0) setModeId(newModes[0].id);
  };

  const prevPrize = () => setPrizeIdx(i => (i - 1 + PRIZE_POOLS.length) % PRIZE_POOLS.length);
  const nextPrize = () => setPrizeIdx(i => (i + 1) % PRIZE_POOLS.length);

  const handleJoin = () => {
    if (isComingSoon) return;
    sessionStorage.setItem("qm_entry", String(pool.entry));
    sessionStorage.setItem("qm_prize", String(pool.prize));
    let targetMode = currentMode?.id ?? "duel";
    if (targetMode === "any") {
      const liveModes = modeOpts.filter(m => !m.random && !m.comingSoon);
      if (liveModes.length > 0) {
        targetMode = liveModes[Math.floor(Math.random() * liveModes.length)].id;
      } else {
        targetMode = "duel";
      }
    }
    navigate(`/quickmatch/${gameType}/${targetMode}`);
  };

  return (
    <div
      className="min-h-[100dvh] flex flex-col relative overflow-hidden"
      style={{ background: "#06070a" }}
    >
      <style>{`
        @keyframes qhub-in { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
        @keyframes qhub-card-swap { from { opacity:0; transform:scale(0.93); } to { opacity:1; transform:scale(1); } }
        @keyframes qhub-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }
        @keyframes qhub-sheet-in { from{opacity:0;transform:translateY(100%)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* Ambient glow behind card */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "38%", left: "50%", transform: "translate(-50%,-50%)",
          width: 320, height: 320,
          background: `radial-gradient(circle, ${accent}18 0%, transparent 70%)`,
          filter: "blur(40px)",
          transition: "background 0.4s ease",
        }}
      />

      {/* ── Header ── */}
      <div
        className="shrink-0 px-4 pt-4 pb-4"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 16px)",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(-12px)",
          transition: "opacity 0.35s ease, transform 0.4s ease",
        }}
      >
        <div className="flex items-center gap-3">
          {/* Back */}
          <button
            onClick={() => navigate("/")}
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 active:scale-90 transition-transform"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>

          {/* Game type selector — tappable pill */}
          <button
            onClick={() => setShowTypeSheet(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl flex-1 active:scale-[0.97] transition-transform"
            style={{
              background: `${accent}14`,
              border: `1.5px solid ${accent}45`,
              boxShadow: `0 0 16px ${accent}18`,
            }}
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: accent, animation: "qhub-pulse 1.6s ease-in-out infinite" }} />
            <span className="text-[14px] font-extrabold text-white flex-1 text-left">{GAME_TYPES.find(t => t.id === gameType)?.label}</span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </button>

          {/* Online players badge */}
          <div
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl shrink-0"
            style={{
              background: "rgba(16,185,129,0.1)",
              border: "1px solid rgba(16,185,129,0.25)",
            }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ animation: "qhub-pulse 1.4s ease-in-out infinite" }} />
            <span className="text-[11px] font-black text-emerald-400 tabular-nums">
              {onlineCount !== null && onlineCount > 0 ? `${onlineCount} online` : "Live"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Squad size + Mode dropdowns ── */}
      <div
        className="px-4 pb-4 flex gap-3"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(10px)",
          transition: "opacity 0.35s ease 60ms, transform 0.4s ease 60ms",
        }}
      >
        <Dropdown
          label="Team Size"
          options={squadOpts}
          value={squadSize}
          onChange={handleSquadChange}
          accent={accent}
        />
        <Dropdown
          label="Mode"
          options={modeOpts}
          value={currentMode?.id ?? ""}
          onChange={setModeId}
          accent={accent}
        />
      </div>

      {/* ── Prize pool carousel card ── */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-4 pb-4"
        style={{
          opacity: visible ? 1 : 0,
          transition: "opacity 0.4s ease 120ms",
        }}
      >
        <div className="w-full flex items-center gap-3">
          {/* Left arrow */}
          <button
            onClick={prevPrize}
            className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 active:scale-90 transition-transform"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <ChevronLeft className="w-5 h-5 text-zinc-400" />
          </button>

          {/* Card */}
          <div
            key={prizeIdx}
            className="flex-1 rounded-3xl overflow-hidden relative"
            style={{
              background: "linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
              border: `1.5px solid ${accent}35`,
              boxShadow: `0 4px 40px ${accent}14, 0 0 0 1px rgba(255,255,255,0.03) inset`,
              animation: "qhub-card-swap 0.22s ease both",
            }}
          >
            {/* Top neon line */}
            <div
              className="absolute top-0 left-0 right-0 h-[1.5px]"
              style={{ background: `linear-gradient(90deg, transparent 0%, ${accent}80 50%, transparent 100%)` }}
            />

            {/* Trophy + Prize amount */}
            <div className="flex flex-col items-center pt-7 pb-5 gap-2">
              <div
                className="w-16 h-16 rounded-3xl flex items-center justify-center mb-1"
                style={{
                  background: `${accent}14`,
                  border: `1.5px solid ${accent}35`,
                  boxShadow: `0 0 24px ${accent}20`,
                }}
              >
                <Trophy className="w-7 h-7" style={{ color: accent }} strokeWidth={1.8} />
              </div>
              <div className="flex items-center gap-1.5">
                <CoinIcon width={22} />
                <span className="text-[36px] font-black text-white leading-none tabular-nums">{pool.prize}</span>
              </div>
              <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Prize Pool</span>
            </div>

            {/* Divider */}
            <div className="mx-5 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

            {/* Stats row */}
            <div className="grid grid-cols-3 divide-x divide-white/[0.05] px-2 py-4">
              {[
                { label: "Entry", value: pool.entry, icon: <CoinIcon width={14} /> },
                { label: "Prize", value: pool.prize, icon: <CoinIcon width={14} /> },
                { label: "Active", value: activePlayers !== null ? activePlayers : "—", icon: <Users className="w-3 h-3 text-emerald-400" strokeWidth={2} /> },
              ].map(({ label, value, icon }) => (
                <div key={label} className="flex flex-col items-center gap-1 py-1">
                  <div className="flex items-center gap-1">
                    {icon}
                    <span className="text-[18px] font-black text-white tabular-nums leading-none">{value}</span>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
                </div>
              ))}
            </div>

            {/* Bottom shimmer */}
            <div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-px"
              style={{ background: `linear-gradient(90deg, transparent, ${accent}60, transparent)` }}
            />
          </div>

          {/* Right arrow */}
          <button
            onClick={nextPrize}
            className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 active:scale-90 transition-transform"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <ChevronRight className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Dot indicators */}
        <div className="flex items-center gap-1.5 mt-4">
          {PRIZE_POOLS.map((_, i) => (
            <button
              key={i}
              onClick={() => setPrizeIdx(i)}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === prizeIdx ? 20 : 6,
                height: 6,
                background: i === prizeIdx ? accent : "rgba(255,255,255,0.15)",
                boxShadow: i === prizeIdx ? `0 0 8px ${accent}80` : "none",
              }}
            />
          ))}
        </div>

        {/* Real user balance */}
        <div className="flex items-center gap-2 mt-4 px-4 py-2.5 rounded-2xl"
          style={{ background: "rgba(250,204,21,0.07)", border: "1px solid rgba(250,204,21,0.18)" }}>
          <CoinIcon width={16} />
          <span className="text-[12px] font-bold text-yellow-300">Your Balance:</span>
          <span className="text-[13px] font-black text-white tabular-nums ml-auto">
            {(user?.diamondBalance ?? 0).toLocaleString()} coins
          </span>
        </div>
      </div>

      {/* ── Join button ── */}
      <div
        className="shrink-0 px-4 pb-8"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 0.35s ease 200ms, transform 0.4s ease 200ms",
        }}
      >
        <button
          onClick={handleJoin}
          disabled={isComingSoon}
          className="w-full relative overflow-hidden rounded-3xl active:scale-[0.97] transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: isComingSoon
              ? "rgba(255,255,255,0.04)"
              : `linear-gradient(135deg, ${accent}ee 0%, ${accent}99 100%)`,
            boxShadow: isComingSoon
              ? "none"
              : `0 8px 40px ${accent}55, 0 1px 0 rgba(255,255,255,0.25) inset`,
            border: isComingSoon ? "1px solid rgba(255,255,255,0.08)" : `1px solid ${accent}40`,
          }}
        >
          {/* Shimmer sweep */}
          {!isComingSoon && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%)",
                animation: "qhub-shimmer 2.8s ease-in-out infinite",
              }}
            />
          )}
          <style>{`@keyframes qhub-shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(200%)} }`}</style>

          <div className="relative flex items-center justify-between px-5 py-4">
            {/* Left: icon + label stack */}
            <div className="flex flex-col items-start gap-0.5">
              <span
                className="font-heading font-black tracking-wide uppercase leading-none"
                style={{ fontSize: 17, color: isComingSoon ? "rgba(255,255,255,0.3)" : "#fff" }}
              >
                {isComingSoon ? "Coming Soon" : "Find Match"}
              </span>
              {!isComingSoon && (
                <span className="text-[11px] font-semibold flex items-center gap-1" style={{ color: "rgba(255,255,255,0.65)" }}>
                  {currentMode?.id === "any" ? "Any mode" : currentMode?.label} · <CoinIcon width={11} /> {pool.entry} entry
                </span>
              )}
            </div>

            {/* Right: play icon circle */}
            {!isComingSoon && (
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  background: "rgba(255,255,255,0.18)",
                  border: "1px solid rgba(255,255,255,0.25)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <polygon points="6,3 20,12 6,21" />
                </svg>
              </div>
            )}
          </div>
        </button>
      </div>

      {/* ── Game type bottom sheet ── */}
      {showTypeSheet && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={() => setShowTypeSheet(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl overflow-hidden"
            style={{
              background: "rgba(12,14,20,0.98)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderBottom: "none",
              animation: "qhub-sheet-in 0.28s cubic-bezier(0.34,1.2,0.64,1) both",
              paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)",
            }}
          >
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-3 mb-5" />
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-600 px-5 mb-3">Game Type</p>
            {GAME_TYPES.map((gt) => (
              <button
                key={gt.id}
                onClick={() => !gt.comingSoon && handleTypeChange(gt.id)}
                className="w-full flex items-center justify-between px-5 py-4 transition-colors"
                style={{
                  background: gt.id === gameType ? "rgba(255,255,255,0.05)" : "transparent",
                  opacity: gt.comingSoon ? 0.4 : 1,
                  cursor: gt.comingSoon ? "not-allowed" : "pointer",
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center"
                    style={{
                      background: gt.id === "cs" ? "rgba(34,211,238,0.12)" : "rgba(249,115,22,0.12)",
                      border: `1px solid ${gt.id === "cs" ? "rgba(34,211,238,0.25)" : "rgba(249,115,22,0.25)"}`,
                    }}
                  >
                    <Zap className="w-4 h-4" style={{ color: gt.id === "cs" ? "#22d3ee" : "#f97316" }} strokeWidth={2} />
                  </div>
                  <div>
                    <span className="text-[14px] font-extrabold text-white block">{gt.label}</span>
                    {gt.comingSoon && <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Coming Soon</span>}
                  </div>
                </div>
                {gt.id === gameType && (
                  <div className="w-2 h-2 rounded-full" style={{ background: accent }} />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
