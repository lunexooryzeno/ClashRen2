import { useState, useMemo, useEffect, useCallback } from "react";
import { CachedImg } from "@/components/CachedImg";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Search, SlidersHorizontal, X, Trophy, Swords,
  Gem, Clock, CheckCircle2, AlertCircle, Hourglass,
  ChevronDown, Check, ChevronRight, Flame, ScrollText, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/* ─── Types ─────────────────────────────────────────────────────────────────── */

type UserStatus = "upcoming" | "live" | "won" | "lost" | "pending" | "rewarded";
type SortKey    = "latest" | "oldest" | "highest_reward";

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/api/")) return url;
  const clean = url.replace(/^\/objects\//, "");
  return `/api/storage/objects/${clean}`;
}

function authFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("clash_ren_token");
  return fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

function deriveUserStatus(t: any): UserStatus {
  const s = t.status ?? "";
  if (s === "upcoming") return "upcoming";
  if (s === "ongoing")  return "live";
  if (s === "completed" || s === "cancelled") {
    if (t.diamondsWon > 0 && t.placement === 1) return "won";
    if (t.diamondsWon > 0) return "rewarded";
    if (t.placement !== null && t.placement !== undefined) return "lost";
    return "pending";
  }
  return "upcoming";
}

/* ─── Filter/sort config ─────────────────────────────────────────────────────── */

const STATUS_FILTERS: { id: UserStatus; label: string }[] = [
  { id:"upcoming",  label:"Upcoming" },
  { id:"live",      label:"Live" },
  { id:"won",       label:"Won" },
  { id:"lost",      label:"Lost" },
  { id:"pending",   label:"Pending" },
  { id:"rewarded",  label:"Rewarded" },
];

const ACTIVE_STATUSES = new Set<UserStatus>(["upcoming", "live", "pending"]);

const SORTS: { id: SortKey; label: string }[] = [
  { id:"latest",         label:"Latest" },
  { id:"oldest",         label:"Oldest" },
  { id:"highest_reward", label:"Highest Reward" },
];

/* ─── User result badge config ───────────────────────────────────────────────── */

const USER_STATUS_CFG: Record<UserStatus, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  upcoming: { label:"UPCOMING", color:"#60a5fa", bg:"rgba(59,130,246,0.15)",  border:"rgba(59,130,246,0.35)", icon:Clock },
  live:     { label:"LIVE",     color:"#34d399", bg:"rgba(52,211,153,0.15)",  border:"rgba(52,211,153,0.35)", icon:Flame },
  won:      { label:"WON 🏆",   color:"#fbbf24", bg:"rgba(251,191,36,0.18)",  border:"rgba(251,191,36,0.4)",  icon:Trophy },
  lost:     { label:"LOST",     color:"#f87171", bg:"rgba(248,113,113,0.12)", border:"rgba(248,113,113,0.35)",icon:X },
  pending:  { label:"PENDING",  color:"#fb923c", bg:"rgba(251,146,60,0.15)",  border:"rgba(251,146,60,0.35)", icon:Hourglass },
  rewarded: { label:"REWARDED", color:"#34d399", bg:"rgba(52,211,153,0.12)",  border:"rgba(52,211,153,0.3)",  icon:CheckCircle2 },
};

/* ─── Filter/sort logic ──────────────────────────────────────────────────────── */

function applyAll(list: any[], query: string, statuses: Set<UserStatus>, sort: SortKey): any[] {
  let out = list;
  if (query.trim()) {
    const q = query.toLowerCase();
    out = out.filter(t => t.title.toLowerCase().includes(q) || (t.gameMode ?? "").toLowerCase().includes(q));
  }
  if (statuses.size > 0) out = out.filter(t => statuses.has(deriveUserStatus(t)));
  switch (sort) {
    case "latest":         return [...out].sort((a,b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    case "oldest":         return [...out].sort((a,b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    case "highest_reward": return [...out].sort((a,b) => (b.diamondsWon ?? 0) - (a.diamondsWon ?? 0));
    default:               return out;
  }
}

/* ─── Match Card ─────────────────────────────────────────────────────────────── */

const STATUS_COLOR_MAP: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  green:  { bg:"bg-emerald-500/15", text:"text-emerald-400",  border:"border-emerald-500/30",  dot:"bg-emerald-400"  },
  red:    { bg:"bg-red-500/15",     text:"text-red-400",      border:"border-red-500/30",      dot:"bg-red-400"      },
  blue:   { bg:"bg-blue-500/15",    text:"text-blue-400",     border:"border-blue-500/30",     dot:"bg-blue-400"     },
  yellow: { bg:"bg-amber-500/15",   text:"text-amber-400",    border:"border-amber-500/30",    dot:"bg-amber-400"    },
  purple: { bg:"bg-purple-500/15",  text:"text-purple-400",   border:"border-purple-500/30",   dot:"bg-purple-400"   },
  orange: { bg:"bg-orange-500/15",  text:"text-orange-400",   border:"border-orange-500/30",   dot:"bg-orange-400"   },
  cyan:   { bg:"bg-cyan-500/15",    text:"text-cyan-400",     border:"border-cyan-500/30",     dot:"bg-cyan-400"     },
};
const defaultStatusStyle = { bg:"bg-emerald-500/15", text:"text-emerald-400", border:"border-emerald-500/30", dot:"bg-emerald-400" };
const inactiveStatusStyle = { bg:"bg-white/8", text:"text-zinc-400", border:"border-white/15", dot:"bg-zinc-500" };

function MatchCard({ t, index, onClick }: { t: any; index: number; onClick: () => void }) {
  const userStatus  = deriveUserStatus(t);
  const uCfg        = USER_STATUS_CFG[userStatus];
  const UIcon       = uCfg.icon;
  const isUpcoming  = t.status === "upcoming";
  const isOngoing   = t.status === "ongoing";
  const isLive      = userStatus === "live";
  const isWon       = userStatus === "won";
  const perKill: number = t.perKillDiamonds ?? 0;
  const imageUrl    = resolveImageUrl(t.imageUrl);
  const diamondsWon: number = t.diamondsWon ?? 0;
  const placement: number | null = t.placement ?? null;
  const kills: number | null = t.kills ?? null;

  const statusStyle = (isOngoing || isUpcoming)
    ? (STATUS_COLOR_MAP[t.statusColor ?? "green"] ?? defaultStatusStyle)
    : inactiveStatusStyle;

  const cardBorder = isWon
    ? "1px solid rgba(251,191,36,0.35)"
    : isLive
    ? "1px solid rgba(16,185,129,0.28)"
    : isOngoing
    ? "1px solid rgba(16,185,129,0.22)"
    : isUpcoming
    ? "1px solid hsl(var(--primary)/0.22)"
    : "1px solid rgba(255,255,255,0.08)";

  return (
    <motion.div
      initial={{ opacity:0, y:14 }}
      animate={{ opacity:1, y:0 }}
      transition={{ duration:0.3, delay:index*0.04, ease:[0.22,1,0.36,1] }}
      className="rounded-2xl overflow-hidden cursor-pointer active:scale-[0.99] transition-transform"
      style={{ background:"hsl(var(--card))", border:cardBorder }}
      onClick={onClick}
    >
      {isLive && (
        <div className="h-0.5 w-full" style={{ background:"linear-gradient(90deg,#34d399,#10b981,#34d399)", backgroundSize:"200% 100%", animation:"shimmer 1.8s linear infinite" }} />
      )}

      {/* ── Image frame (same as TournamentCard) ── */}
      <div className="relative w-full overflow-hidden" style={{ height:136 }}>
        <CachedImg
          src={imageUrl ?? "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80"}
          alt={t.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0" style={{ background:"linear-gradient(180deg,rgba(0,0,0,0.25) 0%,rgba(0,0,0,0.7) 100%)" }} />

        {/* Admin status badge — top left */}
        <div className={cn("absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider", statusStyle.bg, statusStyle.text, statusStyle.border)}>
          {(isOngoing || isUpcoming) && <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", statusStyle.dot)} />}
          {(isOngoing || isUpcoming) ? (t.statusLabel || "Available") : t.status}
        </div>

        {/* Per-kill / slot label / game mode — top right */}
        <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
          {perKill > 0 && (
            <div className="flex items-center gap-1 bg-black/60 border border-blue-400/30 rounded-full px-2.5 py-1">
              <Gem className="w-3 h-3 text-blue-400" />
              <span className="text-[10px] font-bold text-blue-300">+{perKill}/kill</span>
            </div>
          )}
          {t._slotLabel ? (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold"
              style={{ background:"rgba(139,92,246,0.3)", border:"1px solid rgba(139,92,246,0.55)", color:"#c4b5fd" }}>
              <Clock className="w-2.5 h-2.5" />
              {t._slotLabel}
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-black/60 border border-white/15 rounded-full px-2.5 py-1">
              <Swords className="w-3 h-3 text-zinc-400" />
              <span className="text-[10px] font-bold text-zinc-300">{t.gameMode}</span>
            </div>
          )}
        </div>

        {/* Title + shortTitle — bottom of image */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
          <h3 className="font-heading font-bold text-base text-white leading-tight line-clamp-1 drop-shadow-lg">{t.title}</h3>
          <p className="text-[11px] text-white/60 mt-0.5 line-clamp-1 drop-shadow">
            {t.shortTitle || `${t.gameMode} · Free Fire Max Tournament`}
          </p>
        </div>
      </div>

      {/* ── Info row (same as TournamentCard) ── */}
      <div className={cn("px-4 py-3 grid gap-2 border-b border-white/5", perKill > 0 ? "grid-cols-4" : "grid-cols-3")}>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Starts</span>
          <span className="text-[10px] font-medium text-zinc-300 tabular-nums">{format(new Date(t.startTime),"MMM d, yyyy")}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5 border-l border-white/5">
          <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Prize</span>
          <div className="flex items-center gap-0.5">
            <Gem className="w-3 h-3 text-orange-400" />
            <span className="text-[13px] font-bold text-orange-300">{(t.prizePoolDiamonds ?? 0).toLocaleString()}</span>
          </div>
        </div>
        {perKill > 0 && (
          <div className="flex flex-col items-center gap-0.5 border-l border-white/5">
            <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Per Kill</span>
            <div className="flex items-center gap-0.5">
              <Gem className="w-3 h-3 text-blue-400" />
              <span className="text-[13px] font-bold text-blue-300">+{perKill}</span>
            </div>
          </div>
        )}
        <div className="flex flex-col items-center gap-0.5 border-l border-white/5">
          <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Entry</span>
          {t.entryFeeDiamonds > 0 ? (
            <div className="flex items-center gap-0.5">
              <Gem className="w-3 h-3 text-blue-400" />
              <span className="text-[13px] font-bold text-white">{t.entryFeeDiamonds}</span>
            </div>
          ) : (
            <span className="text-[13px] font-bold text-emerald-400">FREE</span>
          )}
        </div>
      </div>

      {/* ── My Result strip ── */}
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-white/5">
        {/* User result badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{ background:uCfg.bg, border:`1px solid ${uCfg.border}`, color:uCfg.color }}>
          {isLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          <UIcon className="w-3 h-3" />
          <span className="text-[9px] font-extrabold tracking-wider">{uCfg.label}</span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3">
          {placement !== null && (
            <div className="flex items-center gap-1">
              <Trophy className="w-3 h-3 text-zinc-500" />
              <span className="text-[11px] font-bold text-zinc-300">#{placement}</span>
            </div>
          )}
          {kills !== null && kills > 0 && (
            <div className="flex items-center gap-1">
              <Swords className="w-3 h-3 text-red-400" />
              <span className="text-[11px] font-bold text-zinc-300">{kills}</span>
            </div>
          )}
          {diamondsWon > 0 && (
            <div className="flex items-center gap-1">
              <Gem className="w-3 h-3 text-yellow-400" />
              <span className="text-[11px] font-bold text-yellow-300">+{diamondsWon}</span>
            </div>
          )}
          {placement === null && kills === null && diamondsWon === 0 && (
            <span className="text-[10px] text-zinc-600">No results yet</span>
          )}
        </div>
      </div>

      {/* ── Open match button ── */}
      <div className="px-4 pb-3 pt-2.5">
        <button
          onClick={e => { e.stopPropagation(); onClick(); }}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold text-white transition-all active:opacity-80"
          style={{ background:"linear-gradient(90deg,hsl(var(--primary)/0.85),hsl(var(--primary)))", boxShadow:"0 0 14px hsl(var(--primary)/0.35)", border:"1px solid hsl(var(--primary)/0.4)" }}
        >
          <ChevronRight className="w-3 h-3" /> Open My Match
        </button>
      </div>
    </motion.div>
  );
}

/* ─── Sort Dropdown ──────────────────────────────────────────────────────────── */

function SortDropdown({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  const label = SORTS.find(s => s.id === value)?.label ?? "Latest";
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 w-full rounded-xl px-3 py-2.5 text-[12px] font-bold transition-all"
        style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", color:"#e4e4e7" }}
      >
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${open?"rotate-180":""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity:0, y:-6, scale:0.97 }}
            animate={{ opacity:1, y:0,  scale:1 }}
            exit={{ opacity:0,  y:-6, scale:0.97 }}
            transition={{ duration:0.15 }}
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-10 rounded-2xl overflow-hidden"
            style={{ background:"#1c1c1e", border:"1px solid rgba(255,255,255,0.1)", boxShadow:"0 8px 24px rgba(0,0,0,0.5)" }}
          >
            {SORTS.map(s => (
              <button key={s.id} onClick={() => { onChange(s.id); setOpen(false); }}
                className="w-full flex items-center justify-between px-4 py-3 text-[12px] font-bold transition-colors"
                style={{ color:value===s.id?"hsl(var(--primary))":"#a1a1aa", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                {s.label}
                {value===s.id && <Check className="w-3.5 h-3.5" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Filter Sheet ───────────────────────────────────────────────────────────── */

interface FilterSheetProps {
  statuses: Set<UserStatus>;
  sort: SortKey;
  onApply: (s: Set<UserStatus>, so: SortKey) => void;
  onClose: () => void;
}

function FilterSheet({ statuses, sort, onApply, onClose }: FilterSheetProps) {
  const [localStatuses, setLocalStatuses] = useState(new Set(statuses));
  const [localSort,     setLocalSort]     = useState<SortKey>(sort);

  function toggleStatus(s: UserStatus) { setLocalStatuses(prev => { const n=new Set(prev); n.has(s)?n.delete(s):n.add(s); return n; }); }

  const totalActive = localStatuses.size + (localSort!=="latest"?1:0);

  return (
    <>
      <motion.div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm"
        initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} onClick={onClose} />
      <motion.div
        className="fixed inset-x-0 bottom-0 z-[61] rounded-t-3xl overflow-hidden"
        style={{ background:"#111113", border:"1px solid rgba(255,255,255,0.09)", maxHeight:"88dvh" }}
        initial={{ y:"100%" }} animate={{ y:0 }} exit={{ y:"100%" }}
        transition={{ type:"spring", stiffness:340, damping:32 }}
      >
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-white/10" /></div>
        <div className="flex items-center justify-between px-5 pt-2 pb-4" style={{ borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
          <div>
            <p className="text-[15px] font-extrabold text-white">Filter & Sort</p>
            {totalActive>0 && <p className="text-[10px] text-primary">{totalActive} active</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setLocalStatuses(new Set()); setLocalSort("latest"); }}
              className="text-[11px] text-zinc-500 px-3 py-1.5 rounded-xl active:text-zinc-300"
              style={{ background:"rgba(255,255,255,0.05)" }}>Reset</button>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background:"rgba(255,255,255,0.05)" }}>
              <X className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto px-5 pb-8 pt-4 space-y-5" style={{ maxHeight:"calc(88dvh - 120px)" }}>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-2.5">Sort By</p>
            <SortDropdown value={localSort} onChange={setLocalSort} />
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-2.5">My Result</p>
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map(f => {
                const active = localStatuses.has(f.id);
                const cfg    = USER_STATUS_CFG[f.id];
                return (
                  <button key={f.id} onClick={() => toggleStatus(f.id)}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                    style={{ background:active?cfg.bg:"rgba(255,255,255,0.04)", border:active?`1px solid ${cfg.border}`:"1px solid rgba(255,255,255,0.07)", color:active?cfg.color:"#71717a" }}>
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="px-5 pb-6 pt-3" style={{ borderTop:"1px solid rgba(255,255,255,0.07)" }}>
          <button
            onClick={() => { onApply(localStatuses, localSort); onClose(); }}
            className="w-full h-12 rounded-2xl font-bold text-[14px] text-white transition-all active:scale-[0.98]"
            style={{ background:"hsl(var(--primary))", boxShadow:"0 0 20px hsl(var(--primary)/0.35)" }}
          >Apply Filters</button>
        </div>
      </motion.div>
    </>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────────── */

export default function HistoryMatchesPage() {
  const [location, navigate] = useLocation();

  const [tournaments, setTournaments] = useState<any[]>([]);
  const [apiLoading,  setApiLoading]  = useState(true);
  const [query,       setQuery]       = useState("");
  const [statuses,    setStatuses]    = useState<Set<UserStatus>>(new Set());
  const [sort,        setSort]        = useState<SortKey>("latest");
  const [showFilter,  setShowFilter]  = useState(false);

  /* ── Fetch user's joined tournaments and expand multi-slot bookings ── */
  const fetchTournaments = useCallback(() => {
    setApiLoading(true);
    authFetch("/tournaments")
      .then(r => r.json())
      .then((list: any[]) => {
        const joined = (list || []).filter(t => t.isJoined);
        const expanded: any[] = [];
        for (const t of joined) {
          // Read booked slot indices from localStorage
          let bookedIndices: number[] = [];
          try { bookedIndices = JSON.parse(localStorage.getItem(`czbl_${t.id}`) ?? "[]"); } catch { bookedIndices = []; }
          // Parse timeSlots from matchSettings
          let timeSlots: Array<{ startTime: string; endTime: string; label: string }> = [];
          try {
            const ms = typeof t.matchSettings === "string" ? JSON.parse(t.matchSettings) : (t.matchSettings ?? {});
            if (Array.isArray(ms.timeSlots)) timeSlots = ms.timeSlots;
          } catch { timeSlots = []; }

          if (timeSlots.length > 0 && bookedIndices.length > 0) {
            // One card per booked slot with the slot's own startTime
            for (const idx of bookedIndices) {
              const slot = timeSlots[idx];
              if (!slot) continue;
              expanded.push({
                ...t,
                startTime: slot.startTime,
                _slotLabel: slot.label || `Slot ${idx + 1}`,
                _slotIndex: idx,
                _cardKey: `${t.id}_slot_${idx}`,
              });
            }
          } else {
            // No multi-slot — single entry as normal
            expanded.push({ ...t, _cardKey: String(t.id) });
          }
        }
        setTournaments(expanded);
      })
      .catch(() => {})
      .finally(() => setApiLoading(false));
  }, []);

  // Trigger auto-verification for any pending matches, then re-fetch list
  // after a short delay so the page reflects the updated result.
  const triggerAutoVerify = useCallback(() => {
    authFetch("/my-matches/auto-verify-pending", { method: "POST" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.triggered > 0) {
          // Verification is running in background — re-fetch after 4 s to
          // show the winner/reward status once it lands.
          setTimeout(() => fetchTournaments(), 4000);
        }
      })
      .catch(() => {});
  }, [fetchTournaments]);

  useEffect(() => {
    fetchTournaments();
    triggerAutoVerify();
  }, [fetchTournaments, triggerAutoVerify]);

  // Re-fetch and re-trigger auto-verify whenever the user navigates back
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        fetchTournaments();
        triggerAutoVerify();
      }
    };
    const onFocus = () => { fetchTournaments(); triggerAutoVerify(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchTournaments, triggerAutoVerify]);

  // Re-fetch when arriving here right after joining (join-success sets this flag)
  useEffect(() => {
    if (location === "/matches/my_matches" && sessionStorage.getItem("cz_history_needs_refresh")) {
      sessionStorage.removeItem("cz_history_needs_refresh");
      // Fetch immediately, then again after 1.2s to catch any DB propagation delay
      fetchTournaments();
      const t = setTimeout(() => fetchTournaments(), 1200);
      return () => clearTimeout(t);
    }
  }, [location, fetchTournaments]);

  // In My Matches mode only show active (not-yet-completed) entries
  const isMyMatchesMode = location === "/matches/my_matches";

  const baseList = useMemo(() => {
    if (!isMyMatchesMode) return tournaments;
    return tournaments.filter(t => ACTIVE_STATUSES.has(deriveUserStatus(t)));
  }, [tournaments, isMyMatchesMode]);

  const filtered = useMemo(
    () => applyAll(baseList, query, statuses, sort),
    [baseList, query, statuses, sort],
  );

  const activeFilterCount = statuses.size + (sort!=="latest"?1:0);
  const currentSortLabel  = SORTS.find(s => s.id===sort)?.label ?? "Latest";

  function handleApply(s: Set<UserStatus>, so: SortKey) { setStatuses(s); setSort(so); }
  function removeStatus(s: UserStatus) { setStatuses(prev => { const n=new Set(prev); n.delete(s); return n; }); }

  function openTournament(t: any) {
    const base = `/history/matches/${t.matchSlug || t.id}`;
    if (t._slotIndex !== undefined) {
      navigate(`${base}/slot_${t._slotIndex}`);
    } else {
      navigate(base);
    }
  }

  return (
    <>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      <div className="min-h-screen flex flex-col" style={{ background:"#0a0a0b" }}>

        {/* Header */}
        <div className="shrink-0 px-4 pt-10 pb-3" style={{ background:"linear-gradient(180deg,#0f0f10 0%,#0a0a0b 100%)" }}>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => window.history.back()}
              className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)" }}
            >
              <ArrowLeft className="w-4 h-4 text-zinc-300" />
            </button>
            <div className="flex-1">
              <h1 className="text-[17px] font-extrabold text-white tracking-tight">My Matches</h1>
              <p className="text-[10px] text-zinc-500">
                {apiLoading
                  ? "Loading…"
                  : isMyMatchesMode
                  ? `${baseList.length} active match${baseList.length!==1?"es":""}`
                  : `${tournaments.length} match${tournaments.length!==1?"es":""} participated`}
              </p>
            </div>
            {isMyMatchesMode && (
              <button
                onClick={() => navigate("/history")}
                className="flex items-center gap-1.5 px-3 py-2 rounded-2xl shrink-0 transition-all active:scale-95"
                style={{ background:"rgba(139,92,246,0.12)", border:"1px solid rgba(139,92,246,0.28)", color:"#a78bfa" }}
                title="Full match history"
              >
                <Clock className="w-3.5 h-3.5" />
                <span className="text-[11px] font-bold">History</span>
              </button>
            )}
            <button
              onClick={() => { fetchTournaments(); triggerAutoVerify(); }}
              disabled={apiLoading}
              className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 transition-all active:scale-95 disabled:opacity-40"
              style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)" }}
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 text-zinc-400 ${apiLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => navigate("/history/matches/terms")}
              className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 transition-all active:scale-95"
              style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)" }}
              title="Terms & Conditions"
            >
              <ScrollText className="w-4 h-4 text-zinc-400" />
            </button>
          </div>

          {/* Search + Filter */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilter(true)}
              className="shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center relative transition-all active:scale-95"
              style={{
                background: activeFilterCount>0?"hsl(var(--primary)/0.15)":"rgba(255,255,255,0.06)",
                border:     activeFilterCount>0?"1px solid hsl(var(--primary)/0.4)":"1px solid rgba(255,255,255,0.09)",
              }}
            >
              <SlidersHorizontal className="w-4 h-4" style={{ color:activeFilterCount>0?"hsl(var(--primary))":"#71717a" }} />
              {activeFilterCount>0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-extrabold text-white flex items-center justify-center"
                  style={{ background:"hsl(var(--primary))" }}>{activeFilterCount}</span>
              )}
            </button>
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Search matches…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full h-11 pl-9 pr-9 rounded-2xl text-[13px] text-white placeholder:text-zinc-600 outline-none"
                style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)" }}
              />
              {query && (
                <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-zinc-500" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Active filter chips */}
        <AnimatePresence>
          {(statuses.size>0||sort!=="latest") && (
            <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
              <div className="flex gap-2 px-4 pt-2 pb-1 overflow-x-auto" style={{ scrollbarWidth:"none" }}>
                {sort!=="latest" && (
                  <button onClick={() => setSort("latest")}
                    className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold"
                    style={{ background:"hsl(var(--primary)/0.12)", border:"1px solid hsl(var(--primary)/0.3)", color:"hsl(var(--primary))" }}>
                    {currentSortLabel}<X className="w-2.5 h-2.5" />
                  </button>
                )}
                {[...statuses].map(s => {
                  const cfg=USER_STATUS_CFG[s];
                  return (
                    <button key={s} onClick={() => removeStatus(s)}
                      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold"
                      style={{ background:cfg.bg, border:`1px solid ${cfg.border}`, color:cfg.color }}>
                      {cfg.label}<X className="w-2.5 h-2.5" />
                    </button>
                  );
                })}
                <button
                  onClick={() => { setStatuses(new Set()); setSort("latest"); }}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] text-zinc-500"
                  style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)" }}>
                  Clear all
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Count */}
        <div className="px-4 pt-3 pb-1">
          <span className="text-[11px] text-zinc-500">
            {apiLoading ? "Loading…" : `${filtered.length} match${filtered.length!==1?"es":""}`}
          </span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 pb-28 pt-1 space-y-3" style={{ scrollbarWidth:"none" }}>
          {apiLoading ? (
            [0,1,2].map(i => (
              <Skeleton key={i} className="w-full rounded-2xl" style={{ height:280, animationDelay:`${i*0.1}s` }} />
            ))
          ) : filtered.length===0 ? (
            <motion.div initial={{opacity:0,scale:0.96}} animate={{opacity:1,scale:1}}
              className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-16 h-16 rounded-3xl flex items-center justify-center"
                style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)" }}>
                <Swords className="w-7 h-7 text-zinc-700" />
              </div>
              <p className="text-zinc-500 text-sm font-medium">
                {baseList.length===0
                  ? (isMyMatchesMode ? "No active matches" : "No battles on record yet")
                  : "No arenas match your search"}
              </p>
              <p className="text-zinc-700 text-[11px]">
                {baseList.length===0
                  ? (isMyMatchesMode ? "Join a tournament to see it here" : "Join a tournament to see it here")
                  : "Try adjusting your filters or search"}
              </p>
              {tournaments.length>0 && (
                <button
                  onClick={() => { setQuery(""); setStatuses(new Set()); setSort("latest"); }}
                  className="px-4 py-2 rounded-xl text-[12px] font-bold text-zinc-300 mt-1"
                  style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)" }}>
                  Clear filters
                </button>
              )}
            </motion.div>
          ) : (
            filtered.map((t, i) => (
              <MatchCard key={t._cardKey ?? t.id} t={t} index={i} onClick={() => openTournament(t)} />
            ))
          )}
        </div>
      </div>

      {/* Filter sheet */}
      <AnimatePresence>
        {showFilter && (
          <FilterSheet statuses={statuses} sort={sort} onApply={handleApply} onClose={() => setShowFilter(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
