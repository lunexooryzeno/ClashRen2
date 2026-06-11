import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useGetMyHistory } from "@workspace/api-client-react";
import type { HistoryEntry } from "@workspace/api-client-react";
import { format, isToday, isYesterday, isThisWeek, isThisMonth } from "date-fns";
import { motion, AnimatePresence, animate } from "framer-motion";
import {
  Trophy, Swords, Gem, Search, X, TrendingUp, TrendingDown,
  Zap, Target, Clock, ChevronDown, ChevronUp, Shield,
  Flame, Star, Award, BarChart2, Filter, RefreshCw, ArrowUpDown, Check,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/* ─── Types ──────────────────────────────────────────────────────────────────── */

type FilterKey = "all" | "won" | "lost" | "cancelled";
type SortKey   = "latest" | "oldest" | "highest_reward" | "lowest_reward";

interface Stats {
  total: number;
  wins: number;
  losses: number;
  cancelled: number;
  winRate: number;
  currentStreak: number;
  highestStreak: number;
  totalRewards: number;
  totalFees: number;
  netProfit: number;
  totalKills: number;
  favoriteMode: string;
  avgKillsPerMatch: number;
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function deriveResult(e: HistoryEntry): "won" | "lost" | "cancelled" | "pending" {
  if (e.status === "cancelled") return "cancelled";
  if (e.placement === 1) return "won";
  if (e.placement != null) return "lost";
  return "pending";
}

function groupLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  if (isThisWeek(date)) return "This Week";
  if (isThisMonth(date)) return "This Month";
  return "Older";
}

const GROUP_ORDER = ["Today", "Yesterday", "This Week", "This Month", "Older"];

function computeStats(list: HistoryEntry[]): Stats {
  const completed = list.filter(e => e.status !== "cancelled");
  const wins      = list.filter(e => deriveResult(e) === "won");
  const losses    = list.filter(e => deriveResult(e) === "lost");
  const cancelled = list.filter(e => deriveResult(e) === "cancelled");

  const totalRewards = list.reduce((s, e) => s + (e.diamondsWon ?? 0), 0);
  const totalFees    = list.reduce((s, e) => s + (e.entryFeeDiamonds ?? 0), 0);
  const totalKills   = list.reduce((s, e) => s + (e.kills ?? 0), 0);

  // Streak — walk sorted desc
  const sorted = [...list].sort(
    (a, b) => new Date(b.tournamentStartTime).getTime() - new Date(a.tournamentStartTime).getTime()
  );
  let currentStreak = 0;
  let highestStreak = 0;
  let run = 0;
  const first = sorted[0] ? deriveResult(sorted[0]) : null;
  if (first === "won") {
    for (const e of sorted) {
      if (deriveResult(e) === "won") { run++; highestStreak = Math.max(highestStreak, run); } else break;
    }
    currentStreak = run;
  } else if (first === "lost") {
    for (const e of sorted) {
      if (deriveResult(e) === "lost") run++; else break;
    }
    currentStreak = -run;
  }
  // Highest win streak overall
  let tmpRun = 0;
  for (const e of sorted) {
    if (deriveResult(e) === "won") { tmpRun++; highestStreak = Math.max(highestStreak, tmpRun); }
    else tmpRun = 0;
  }

  // Favorite mode
  const modeCounts: Record<string, number> = {};
  for (const e of list) modeCounts[e.gameMode] = (modeCounts[e.gameMode] ?? 0) + 1;
  const favoriteMode = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  return {
    total:      list.length,
    wins:       wins.length,
    losses:     losses.length,
    cancelled:  cancelled.length,
    winRate:    completed.length > 0 ? Math.round((wins.length / completed.length) * 100) : 0,
    currentStreak,
    highestStreak,
    totalRewards,
    totalFees,
    netProfit: totalRewards - totalFees,
    totalKills,
    favoriteMode,
    avgKillsPerMatch: list.length > 0 ? Math.round((totalKills / list.length) * 10) / 10 : 0,
  };
}

/* ─── Animated counter ───────────────────────────────────────────────────────── */

function AnimCount({ to, suffix = "", prefix = "", duration = 1.2 }: {
  to: number; suffix?: string; prefix?: string; duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const controls = animate(0, to, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate(v) { node.textContent = prefix + Math.round(v).toLocaleString() + suffix; },
    });
    return controls.stop;
  }, [to]);
  return <span ref={ref}>{prefix}0{suffix}</span>;
}

/* ─── Stat tile ──────────────────────────────────────────────────────────────── */

function StatTile({ label, value, suffix = "", prefix = "", color, icon: Icon, sub }: {
  label: string; value: number; suffix?: string; prefix?: string;
  color: string; icon: any; sub?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex-1 min-w-[calc(50%-6px)] rounded-2xl p-3 flex flex-col gap-1"
      style={{ background: `${color}0d`, border: `1px solid ${color}22` }}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-[22px] font-extrabold leading-none" style={{ color }}>
        <AnimCount to={value} prefix={prefix} suffix={suffix} />
      </span>
      {sub && <span className="text-[10px] text-zinc-600">{sub}</span>}
    </motion.div>
  );
}

/* ─── Result badge ───────────────────────────────────────────────────────────── */

const RESULT_CFG = {
  won:       { label: "VICTORY",   color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.3)"  },
  lost:      { label: "DEFEAT",    color: "#f87171", bg: "rgba(239,68,68,0.10)",   border: "rgba(239,68,68,0.25)"  },
  cancelled: { label: "CANCELLED", color: "#71717a", bg: "rgba(113,113,122,0.10)", border: "rgba(113,113,122,0.22)"},
  pending:   { label: "PENDING",   color: "#60a5fa", bg: "rgba(59,130,246,0.10)",  border: "rgba(59,130,246,0.25)" },
};

function ResultBadge({ result }: { result: keyof typeof RESULT_CFG }) {
  const cfg = RESULT_CFG[result];
  return (
    <span
      className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      {cfg.label}
    </span>
  );
}

/* ─── Match card ─────────────────────────────────────────────────────────────── */

function MatchCard({ entry, index, onClick }: {
  entry: HistoryEntry; index: number; onClick: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const result  = deriveResult(entry);
  const cfg     = RESULT_CFG[result];
  const isWon   = result === "won";
  const isLost  = result === "lost";
  const profit  = (entry.diamondsWon ?? 0) - (entry.entryFeeDiamonds ?? 0);
  const dateObj = new Date(entry.tournamentStartTime);

  const bgGrad = isWon
    ? "linear-gradient(135deg,rgba(251,191,36,0.06) 0%,rgba(10,10,11,0) 60%)"
    : isLost
    ? "linear-gradient(135deg,rgba(239,68,68,0.04) 0%,rgba(10,10,11,0) 60%)"
    : "linear-gradient(135deg,rgba(255,255,255,0.015) 0%,rgba(10,10,11,0) 60%)";

  const accentColor = cfg.color;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl overflow-hidden"
      style={{ background: bgGrad, border: `1px solid ${isWon ? "rgba(251,191,36,0.18)" : isLost ? "rgba(239,68,68,0.14)" : "rgba(255,255,255,0.07)"}` }}
    >
      {/* ── Main row ── */}
      <button
        className="w-full text-left px-3.5 pt-3 pb-3 flex items-start gap-3 active:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(x => !x)}
      >
        {/* Icon */}
        <div
          className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center mt-0.5"
          style={{ background: `${accentColor}15`, border: `1px solid ${accentColor}28` }}
        >
          {isWon
            ? <Trophy className="w-5 h-5" style={{ color: accentColor }} />
            : isLost
            ? <Swords className="w-5 h-5" style={{ color: accentColor }} />
            : <Shield className="w-5 h-5" style={{ color: accentColor }} />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold text-[13px] text-white leading-tight truncate flex-1 pr-1">
              {entry.tournamentTitle}
            </p>
            <ResultBadge result={result} />
          </div>

          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[10px] text-zinc-500">{entry.gameMode}</span>
            <span className="text-[10px] text-zinc-700">·</span>
            <Clock className="w-2.5 h-2.5 text-zinc-600 shrink-0" />
            <span className="text-[10px] text-zinc-500">{format(dateObj, "MMM d · h:mm a")}</span>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-2">
            {(entry.kills ?? 0) > 0 && (
              <div className="flex items-center gap-1">
                <Target className="w-3 h-3 text-rose-400" />
                <span className="text-[11px] font-bold text-zinc-300">{entry.kills}K</span>
              </div>
            )}
            {(entry.diamondsWon ?? 0) > 0 && (
              <div className="flex items-center gap-1">
                <Gem className="w-3 h-3 text-cyan-400" />
                <span className="text-[11px] font-bold text-cyan-300">+{entry.diamondsWon}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              {profit >= 0
                ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                : <TrendingDown className="w-3 h-3 text-rose-400" />}
              <span className={`text-[11px] font-bold ${profit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {profit >= 0 ? "+" : ""}{profit}
              </span>
            </div>
            {entry.placement != null && (
              <div
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg"
                style={entry.placement === 1
                  ? { background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)" }
                  : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
              >
                <span className="text-[10px] font-extrabold" style={{ color: entry.placement === 1 ? "#fbbf24" : "#71717a" }}>
                  #{entry.placement}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Expand toggle */}
        <div className="shrink-0 mt-1">
          {expanded
            ? <ChevronUp className="w-4 h-4 text-zinc-500" />
            : <ChevronDown className="w-4 h-4 text-zinc-600" />}
        </div>
      </button>

      {/* ── Expanded detail ── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div
              className="mx-3.5 mb-3 rounded-xl p-3 space-y-2.5"
              style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Match Details</p>

              <div className="grid grid-cols-2 gap-2">
                <DetailRow label="Match ID" value={`#${entry.tournamentId}`} />
                <DetailRow label="Joined" value={format(new Date(entry.joinedAt), "MMM d, yyyy")} />
                <DetailRow label="Entry Fee" value={`${entry.entryFeeDiamonds ?? 0} 💎`} />
                <DetailRow label="Reward" value={entry.diamondsWon ? `${entry.diamondsWon} 💎` : "—"} />
                <DetailRow label="Kills" value={String(entry.kills ?? 0)} />
                <DetailRow label="Placement" value={entry.placement != null ? `#${entry.placement}` : "—"} />
                <DetailRow label="Mode" value={entry.gameMode} />
                <DetailRow
                  label="Net P/L"
                  value={`${profit >= 0 ? "+" : ""}${profit} 💎`}
                  valueColor={profit >= 0 ? "#4ade80" : "#f87171"}
                />
              </div>

              {/* View full detail */}
              <button
                onClick={e => { e.stopPropagation(); onClick(); }}
                className="w-full mt-1 h-9 rounded-xl text-[12px] font-bold transition-all active:scale-[0.98]"
                style={{ background: `${accentColor}18`, border: `1px solid ${accentColor}28`, color: accentColor }}
              >
                View Full Match Detail →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] text-zinc-600 uppercase tracking-wider font-semibold">{label}</span>
      <span className="text-[12px] font-bold text-zinc-300 truncate" style={valueColor ? { color: valueColor } : {}}>
        {value}
      </span>
    </div>
  );
}

/* ─── Skeleton ───────────────────────────────────────────────────────────────── */

function CardSkeleton({ i }: { i: number }) {
  return (
    <div
      className="rounded-2xl px-3.5 py-3 flex items-start gap-3"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
        animationDelay: `${i * 0.08}s` }}
    >
      <Skeleton className="w-11 h-11 rounded-xl shrink-0" style={{ background: "rgba(255,255,255,0.04)" }} />
      <div className="flex-1 space-y-2 pt-0.5">
        <Skeleton className="h-3.5 w-3/4 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
        <Skeleton className="h-2.5 w-1/2 rounded" style={{ background: "rgba(255,255,255,0.03)" }} />
        <div className="flex gap-2">
          <Skeleton className="h-4 w-12 rounded-full" style={{ background: "rgba(255,255,255,0.04)" }} />
          <Skeleton className="h-4 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.03)" }} />
        </div>
      </div>
    </div>
  );
}

/* ─── Custom Dropdown ────────────────────────────────────────────────────────── */

interface DropdownOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  color?: string;
}

function CustomDropdown<T extends string>({
  value, onChange, options, icon: Icon, accentColor = "#a78bfa",
}: {
  value: T;
  onChange: (v: T) => void;
  options: DropdownOption<T>[];
  icon: any;
  accentColor?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value)!;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative flex-1">
      <button
        onClick={() => setOpen(x => !x)}
        className="w-full h-11 px-3 rounded-2xl flex items-center gap-2 transition-all active:scale-[0.97]"
        style={{
          background: open ? `${accentColor}14` : "rgba(255,255,255,0.05)",
          border: `1px solid ${open ? `${accentColor}40` : "rgba(255,255,255,0.09)"}`,
        }}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: open ? accentColor : "#71717a" }} />
        <span className="flex-1 text-left text-[12px] font-bold truncate" style={{ color: open ? accentColor : "#d4d4d8" }}>
          {selected.label}
          {selected.count !== undefined && (
            <span className="ml-1 text-[10px] font-bold opacity-60">({selected.count})</span>
          )}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-3.5 h-3.5" style={{ color: open ? accentColor : "#52525b" }} />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-full left-0 right-0 mt-1.5 rounded-2xl overflow-hidden z-50"
            style={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 16px 40px rgba(0,0,0,0.6)" }}
          >
            {options.map(opt => {
              const isActive = opt.value === value;
              const color = opt.color ?? accentColor;
              return (
                <button
                  key={opt.value}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className="w-full px-3.5 py-3 flex items-center gap-3 transition-colors text-left"
                  style={{ background: isActive ? `${color}12` : "transparent" }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: isActive ? color : "rgba(255,255,255,0.1)" }}
                  />
                  <span className="flex-1 text-[13px] font-semibold" style={{ color: isActive ? color : "#a1a1aa" }}>
                    {opt.label}
                  </span>
                  {opt.count !== undefined && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={isActive
                        ? { background: `${color}20`, color }
                        : { background: "rgba(255,255,255,0.05)", color: "#52525b" }}
                    >
                      {opt.count}
                    </span>
                  )}
                  {isActive && <Check className="w-3.5 h-3.5 shrink-0" style={{ color }} />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Filter chip (kept for legacy, unused) ──────────────────────────────────── */

function FilterChip({ label, active, color, count, onClick }: {
  label: string; active: boolean; color: string; count?: number; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all active:scale-[0.96]"
      style={active
        ? { background: `${color}20`, border: `1px solid ${color}50`, color }
        : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#71717a" }}
    >
      {label}
      {count !== undefined && (
        <span
          className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full"
          style={active
            ? { background: `${color}28`, color }
            : { background: "rgba(255,255,255,0.06)", color: "#52525b" }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────────── */

export default function History() {
  const { data: rawHistory, isLoading, refetch } = useGetMyHistory();
  const [, navigate] = useLocation();
  const [search,    setSearch]    = useState("");
  const [filter,    setFilter]    = useState<FilterKey>("all");
  const [sort,      setSort]      = useState<SortKey>("latest");
  const [refreshing, setRefreshing] = useState(false);

  const rawList  = (rawHistory ?? []) as HistoryEntry[];
  const allPast  = useMemo(
    () => rawList
      .filter(e => e.status === "completed" || e.status === "cancelled")
      .sort((a, b) => new Date(b.tournamentStartTime).getTime() - new Date(a.tournamentStartTime).getTime()),
    [rawList]
  );

  const stats = useMemo(() => computeStats(allPast), [allPast]);

  const filtered = useMemo(() => {
    let list = allPast;
    if (filter === "won")       list = list.filter(e => deriveResult(e) === "won");
    if (filter === "lost")      list = list.filter(e => deriveResult(e) === "lost");
    if (filter === "cancelled") list = list.filter(e => deriveResult(e) === "cancelled");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.tournamentTitle.toLowerCase().includes(q) ||
        e.gameMode.toLowerCase().includes(q) ||
        String(e.tournamentId).includes(q)
      );
    }
    if (sort === "oldest")         list = [...list].sort((a, b) => new Date(a.tournamentStartTime).getTime() - new Date(b.tournamentStartTime).getTime());
    if (sort === "highest_reward") list = [...list].sort((a, b) => (b.diamondsWon ?? 0) - (a.diamondsWon ?? 0));
    if (sort === "lowest_reward")  list = [...list].sort((a, b) => (a.diamondsWon ?? 0) - (b.diamondsWon ?? 0));
    return list;
  }, [allPast, filter, search, sort]);

  // Timeline groups
  const grouped = useMemo(() => {
    const map: Record<string, HistoryEntry[]> = {};
    for (const e of filtered) {
      const label = groupLabel(new Date(e.tournamentStartTime));
      if (!map[label]) map[label] = [];
      map[label].push(e);
    }
    return GROUP_ORDER.filter(g => map[g]).map(g => ({ label: g, entries: map[g] }));
  }, [filtered]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch?.();
    setTimeout(() => setRefreshing(false), 600);
  }, [refetch]);

  // Pull-to-refresh
  const touchStartY = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd   = (e: React.TouchEvent) => {
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const atTop = (listRef.current?.scrollTop ?? 0) === 0;
    if (atTop && dy > 60) handleRefresh();
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "#0a0a0b" }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      {/* ── Header ── */}
      <div className="shrink-0 px-4 pt-5 pb-0">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="mb-4"
        >
          <h1 className="text-[20px] font-extrabold text-white tracking-tight flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-violet-400" />
            Completed Match History
          </h1>
          <p className="text-[11px] text-zinc-500 mt-0.5">Your full competitive record</p>
        </motion.div>
      </div>

      {/* ── Scrollable body ── */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto"
        style={{ scrollbarWidth: "none" }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* ── Search + Filters ── */}
        <div className="px-4 pb-3">
          {/* Search + Refresh */}
          <div className="flex items-center gap-2 mb-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, mode, ID…"
                className="w-full h-11 pl-9 pr-9 rounded-2xl text-[13px] text-white placeholder-zinc-600 outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
              <AnimatePresence>
                {search && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    <X className="w-3.5 h-3.5 text-zinc-500" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
            <button
              onClick={handleRefresh}
              className="shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center transition-all active:scale-90"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
            >
              <RefreshCw className={`w-4 h-4 text-zinc-400 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Filter + Sort dropdowns */}
          <div className="flex gap-2">
            <CustomDropdown
              value={filter}
              onChange={v => setFilter(v as FilterKey)}
              icon={Filter}
              accentColor="#a78bfa"
              options={[
                { value: "all",       label: "All Results",  count: allPast.length, color: "#a78bfa" },
                { value: "won",       label: "Victory",      count: stats.wins,     color: "#fbbf24" },
                { value: "lost",      label: "Defeat",       count: stats.losses,   color: "#f87171" },
                { value: "cancelled", label: "Cancelled",    count: stats.cancelled,color: "#71717a" },
              ]}
            />
            <CustomDropdown
              value={sort}
              onChange={v => setSort(v as SortKey)}
              icon={ArrowUpDown}
              accentColor="#60a5fa"
              options={[
                { value: "latest",         label: "Latest First"   },
                { value: "oldest",         label: "Oldest First"   },
                { value: "highest_reward", label: "Top Earning"    },
                { value: "lowest_reward",  label: "Lowest Earning" },
              ]}
            />
          </div>

          {/* Count */}
          {!isLoading && (
            <p className="text-[10px] text-zinc-600 mt-2">
              {filtered.length} {filtered.length === 1 ? "match" : "matches"}
              {search ? " found" : filter !== "all" ? " filtered" : ""}
            </p>
          )}
        </div>

        {/* ── Match list ── */}
        <div className="px-4 pb-28 space-y-6">
          {isLoading ? (
            <div className="space-y-3">
              {[0,1,2,3,4].map(i => <CardSkeleton key={i} i={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-20 gap-3"
            >
              <div
                className="w-16 h-16 rounded-3xl flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <Award className="w-7 h-7 text-zinc-700" />
              </div>
              <p className="text-zinc-400 text-[14px] font-bold">
                {allPast.length === 0 ? "No matches yet" : "No matches found"}
              </p>
              <p className="text-zinc-600 text-[11px] text-center max-w-[200px] leading-relaxed">
                {allPast.length === 0
                  ? "Completed matches will appear here"
                  : "Try adjusting your search or filters"}
              </p>
              {(search || filter !== "all") && (
                <button
                  onClick={() => { setSearch(""); setFilter("all"); }}
                  className="px-4 py-2 rounded-xl text-[12px] font-bold text-zinc-300 mt-1"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
                >
                  Clear filters
                </button>
              )}
            </motion.div>
          ) : (
            grouped.map(({ label, entries }) => (
              <div key={label}>
                {/* Group header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[11px] font-extrabold uppercase tracking-widest text-zinc-600">{label}</span>
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.05)" }} />
                  <span
                    className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(255,255,255,0.05)", color: "#52525b" }}
                  >
                    {entries.length}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {entries.map((entry, i) => (
                    <MatchCard
                      key={entry.id}
                      entry={entry}
                      index={i}
                      onClick={() => navigate(`/history/matches/${entry.tournamentId}`)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
