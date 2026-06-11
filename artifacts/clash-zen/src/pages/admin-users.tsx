import React, { useState, useEffect, useCallback } from "react";
import { CachedImg } from "@/components/CachedImg";
import { useLocation } from "wouter";
import {
  Users, Search, Shield, Ban, ArchiveX, Eye, ArrowLeft,
  Lock, EyeOff, RefreshCw, Gem, Crown, AlertTriangle,
  UserCheck, UserX, Clock, CheckCircle2, TrendingUp,
  Activity, UserPlus, Wifi, ChevronDown, ChevronUp, Trophy,
  Globe, MapPin, Languages, Swords, Timer, XCircle, Percent,
  CalendarClock, Zap, SlidersHorizontal, X, ArrowUpDown,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const REQUIRED_UC = "a464dfd00a173f6e10ac6a4774c62f52";
const SESSION_KEY = "czsa_v1_session";
const LOCKOUT_KEY = "czsa_v1_lockout";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

interface SASession { token: string; expiresAt: number; }
interface LockoutInfo { attempts: number; lockoutUntil: number | null; }

interface AdminUser {
  id: number; phone: string; inGameName: string | null; uid: string | null;
  profilePicture: string | null; diamondBalance: number; isAdmin: boolean;
  createdAt: string; status: string; isOnline: boolean; lastSeenAt: string | null;
  blockedReason: string | null; blockedUntil: string | null; blockedAt: string | null;
  deletedAt: string | null;
}

interface Analytics {
  totalUsers: number; onlineNow: number; dau: number; mau: number;
  newThisWeek: number; newThisMonth: number;
  newInPeriod: number; activeInPeriod: number;
  chart: { day: string; registrations: number; activeUsers: number; tournamentJoins: number }[];
}

interface GeoCountry { country: string; userCount: number; avgDiamonds: number; emulatorPct: number; activePct: number; }
interface GeoAnalytics {
  countries: GeoCountry[];
  languages: { language: string; count: number }[];
  regions: { region: string; count: number }[];
}

interface M2RMode { mode: string; cohortSize: number; returned: number; rate: number | null; avgReturnMs: number | null; }
interface M2RAnalytics {
  overall: { cohortSize: number; returned: number; rate: number | null; avgReturnMs: number | null };
  distribution: { bucket: string; count: number; pct: number }[];
  byMode: M2RMode[];
  chart: { day: string; cohort: number; returned: number; rate: number }[];
}

interface RetentionCohort {
  week: string; registered: number;
  d1: { eligible: number; retained: number; pct: number | null };
  d7: { eligible: number; retained: number; pct: number | null };
  d30: { eligible: number; retained: number; pct: number | null };
}
interface RetentionAnalytics {
  overall: {
    d1: { cohortSize: number; retained: number; pct: number | null };
    d7: { cohortSize: number; retained: number; pct: number | null };
    d30: { cohortSize: number; retained: number; pct: number | null };
  };
  cohorts: RetentionCohort[];
  chart: { day: string; registered: number; d1Retained: number; d1Pct: number }[];
}

interface ModeStat {
  mode: string; totalTournaments: number; totalParticipants: number; uniquePlayers: number;
  avgFillRate: number; cancelRate: number; retentionPct: number;
  avgKills: number; avgDiamondsWon: number; totalPrizePool: number;
}
interface ModeAnalytics {
  modes: ModeStat[];
  chart: Record<string, string | number>[];
  modeList: string[];
}

interface TournamentTop { id: number; title: string; gameMode: string; status: string; filledSlots: number; maxSlots: number; fillPct: number; entryFee: number; prizePool: number; startTime: string; createdAt: string; }
interface TournamentAnalytics {
  summary: {
    totalCreated: number; totalFilled: number; fillRate: number; avgJoinRate: number;
    totalCancelled: number; cancelRate: number;
    avgFillTimeMinutes: number | null; avgMatchDurationMinutes: number | null;
  };
  byStatus: { upcoming: number; ongoing: number; completed: number };
  chart: { day: string; created: number; filled: number; cancelled: number }[];
  top: TournamentTop[];
}


function getSession(): SASession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SASession;
    if (Date.now() > s.expiresAt) { localStorage.removeItem(SESSION_KEY); return null; }
    return s;
  } catch { return null; }
}
function getLockout(): LockoutInfo {
  try {
    const raw = sessionStorage.getItem(LOCKOUT_KEY);
    return raw ? JSON.parse(raw) : { attempts: 0, lockoutUntil: null };
  } catch { return { attempts: 0, lockoutUntil: null }; }
}
function recordFail(): LockoutInfo {
  const info = getLockout();
  const attempts = info.attempts + 1;
  const lockoutUntil = attempts >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : null;
  const next: LockoutInfo = { attempts, lockoutUntil };
  sessionStorage.setItem(LOCKOUT_KEY, JSON.stringify(next));
  return next;
}
function clearLockout() { sessionStorage.removeItem(LOCKOUT_KEY); }

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function saFetch<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Super-Admin-Token": token, ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError((err as { error?: string }).error ?? res.statusText, res.status);
  }
  return res.json();
}

function handleAuthError(navigate: (path: string) => void) {
  localStorage.removeItem(SESSION_KEY);
  navigate(`/286c81443d1fb388d1b9a8e3b280824c`);
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return ""; }
}

function StatusPill({ status }: { status: string }) {
  if (status === "blocked") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30">
      <Ban className="w-2.5 h-2.5" />BLOCKED
    </span>
  );
  if (status === "deleted") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
      <ArchiveX className="w-2.5 h-2.5" />BIN
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
      <CheckCircle2 className="w-2.5 h-2.5" />ACTIVE
    </span>
  );
}

const TOOLTIP_STYLE = {
  contentStyle: { background: "#12091e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 11 },
  labelStyle: { color: "#a1a1aa" },
  itemStyle: { color: "#e4e4e7" },
};

export default function AdminUsersPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [phase, setPhase] = useState<"checking" | "denied" | "gate" | "unlocked">("checking");
  const [token, setToken] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [gateLoading, setGateLoading] = useState(false);
  const [lockout, setLockout] = useState<LockoutInfo>({ attempts: 0, lockoutUntil: null });

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "blocked" | "deleted">("all");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "regular">("all");
  const [onlineFilter, setOnlineFilter] = useState<"all" | "online">("all");
  const [diamondFilter, setDiamondFilter] = useState<"all" | "zero" | "low" | "mid" | "high">("all");
  const [uidFilter, setUidFilter] = useState<"all" | "has" | "none">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "diamonds_desc" | "diamonds_asc" | "name">("newest");
  const [filterOpen, setFilterOpen] = useState(false);

  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(true);
  const [chartTab, setChartTab] = useState<"registrations" | "activeUsers" | "tournamentJoins">("registrations");

  const [geo, setGeo] = useState<GeoAnalytics | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoOpen, setGeoOpen] = useState(true);

  const [tourney, setTourney] = useState<TournamentAnalytics | null>(null);
  const [tourneyLoading, setTourneyLoading] = useState(false);
  const [tourneyOpen, setTourneyOpen] = useState(true);
  const [tourneyChartTab, setTourneyChartTab] = useState<"created" | "filled" | "cancelled">("created");

  const [modeData, setModeData] = useState<ModeAnalytics | null>(null);
  const [modeLoading, setModeLoading] = useState(false);
  const [modeOpen, setModeOpen] = useState(true);

  const [retention, setRetention] = useState<RetentionAnalytics | null>(null);
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [retentionOpen, setRetentionOpen] = useState(true);

  const [m2r, setM2r] = useState<M2RAnalytics | null>(null);
  const [m2rLoading, setM2rLoading] = useState(false);
  const [m2rOpen, setM2rOpen] = useState(true);

  const [analyticsPeriod, setAnalyticsPeriod] = useState<"7" | "30" | "180">("30");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uc = params.get("uc");
    if (uc !== null && uc !== REQUIRED_UC) { setPhase("denied"); return; }
    const existing = getSession();
    if (existing) { setToken(existing.token); setPhase("unlocked"); return; }
    const li = getLockout();
    setLockout(li);
    setPhase("gate");
  }, []);

  const loadUsers = useCallback(async (tok: string) => {
    setLoading(true);
    try {
      const [data, binned] = await Promise.all([
        saFetch<AdminUser[]>("/admin/users", tok),
        saFetch<AdminUser[]>("/admin/users/bin", tok),
      ]);
      setUsers([...data, ...binned]);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        toast({ title: "Session expired", description: "Please log in again.", variant: "destructive" });
        handleAuthError(navigate);
        return;
      }
      toast({ title: "Failed to load users", description: String(e), variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast, navigate]);

  const loadAnalytics = useCallback(async (tok: string, period: string) => {
    setAnalyticsLoading(true);
    try {
      const data = await saFetch<Analytics>(`/super-admin/analytics?days=${period}`, tok);
      setAnalytics(data);
    } catch { /* non-critical */ }
    finally { setAnalyticsLoading(false); }
  }, []);

  const loadGeo = useCallback(async (tok: string) => {
    setGeoLoading(true);
    try {
      const data = await saFetch<GeoAnalytics>("/super-admin/geo-analytics", tok);
      setGeo(data);
    } catch { /* non-critical */ }
    finally { setGeoLoading(false); }
  }, []);

  const loadTourney = useCallback(async (tok: string, period: string) => {
    setTourneyLoading(true);
    try {
      const data = await saFetch<TournamentAnalytics>(`/super-admin/tournament-analytics?days=${period}`, tok);
      setTourney(data);
    } catch { /* non-critical */ }
    finally { setTourneyLoading(false); }
  }, []);

  const loadModeData = useCallback(async (tok: string, period: string) => {
    setModeLoading(true);
    try {
      const data = await saFetch<ModeAnalytics>(`/super-admin/mode-analytics?days=${period}`, tok);
      setModeData(data);
    } catch { /* non-critical */ }
    finally { setModeLoading(false); }
  }, []);

  const loadRetention = useCallback(async (tok: string, period: string) => {
    setRetentionLoading(true);
    try {
      const data = await saFetch<RetentionAnalytics>(`/super-admin/retention-analytics?days=${period}`, tok);
      setRetention(data);
    } catch { /* non-critical */ }
    finally { setRetentionLoading(false); }
  }, []);

  const loadM2r = useCallback(async (tok: string, period: string) => {
    setM2rLoading(true);
    try {
      const data = await saFetch<M2RAnalytics>(`/super-admin/match-to-return?days=${period}`, tok);
      setM2r(data);
    } catch { /* non-critical */ }
    finally { setM2rLoading(false); }
  }, []);

  useEffect(() => {
    if (phase === "unlocked" && token) {
      loadUsers(token);
      loadAnalytics(token, analyticsPeriod);
      loadGeo(token);
      loadTourney(token, analyticsPeriod);
      loadModeData(token, analyticsPeriod);
      loadRetention(token, analyticsPeriod);
      loadM2r(token, analyticsPeriod);
    }
  }, [phase, token, loadUsers, loadAnalytics, loadGeo, loadTourney, loadModeData, loadRetention, loadM2r]);

  useEffect(() => {
    if (phase === "unlocked" && token) {
      loadAnalytics(token, analyticsPeriod);
      loadTourney(token, analyticsPeriod);
      loadModeData(token, analyticsPeriod);
      loadRetention(token, analyticsPeriod);
      loadM2r(token, analyticsPeriod);
    }
  }, [analyticsPeriod]);

  const handleAuth = async () => {
    const li = getLockout();
    if (li.lockoutUntil && Date.now() < li.lockoutUntil) {
      toast({ title: "Too many attempts", description: "Try again in 15 minutes.", variant: "destructive" });
      return;
    }
    if (!codeInput.trim()) return;
    const existing = getSession();
    if (!existing) {
      navigate(`/286c81443d1fb388d1b9a8e3b280824c`);
      return;
    }
    setGateLoading(true);
    try {
      const res = await fetch("/api/super-admin/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Super-Admin-Token": existing.token },
        body: JSON.stringify({ code: codeInput }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Invalid code");
      clearLockout();
      setToken(existing.token);
      setPhase("unlocked");
    } catch {
      const info = recordFail();
      setLockout(info);
      toast({ title: "Access denied", description: info.lockoutUntil ? "Account locked for 15 min." : `${MAX_ATTEMPTS - info.attempts} attempts left.`, variant: "destructive" });
    } finally { setGateLoading(false); }
  };

  const activeFilterCount = [
    statusFilter !== "all", roleFilter !== "all", onlineFilter !== "all",
    diamondFilter !== "all", uidFilter !== "all", sortBy !== "newest",
  ].filter(Boolean).length;

  const resetFilters = () => {
    setStatusFilter("all"); setRoleFilter("all"); setOnlineFilter("all");
    setDiamondFilter("all"); setUidFilter("all"); setSortBy("newest");
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase().trim();
    const matchSearch = !q
      || u.inGameName?.toLowerCase().includes(q)
      || u.phone.includes(q)
      || (u.uid?.toLowerCase().includes(q) ?? false);
    const matchStatus = statusFilter === "all" || u.status === statusFilter;
    const matchRole = roleFilter === "all" || (roleFilter === "admin" ? u.isAdmin : !u.isAdmin);
    const matchOnline = onlineFilter === "all" || u.isOnline;
    const matchDiamond = diamondFilter === "all"
      || (diamondFilter === "zero" ? u.diamondBalance === 0
        : diamondFilter === "low" ? u.diamondBalance >= 1 && u.diamondBalance < 100
        : diamondFilter === "mid" ? u.diamondBalance >= 100 && u.diamondBalance < 500
        : u.diamondBalance >= 500);
    const matchUid = uidFilter === "all" || (uidFilter === "has" ? !!u.uid : !u.uid);
    return matchSearch && matchStatus && matchRole && matchOnline && matchDiamond && matchUid;
  }).sort((a, b) => {
    if (sortBy === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (sortBy === "diamonds_desc") return b.diamondBalance - a.diamondBalance;
    if (sortBy === "diamonds_asc") return a.diamondBalance - b.diamondBalance;
    if (sortBy === "name") return (a.inGameName ?? "").localeCompare(b.inGameName ?? "");
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  if (phase === "checking") return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#0a0612]">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (phase === "denied") return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#0a0612] p-8 text-center">
      <Lock className="w-16 h-16 text-destructive mb-4" />
      <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
      <p className="text-zinc-500 text-sm">Invalid access token.</p>
    </div>
  );

  if (phase === "gate") {
    const isLocked = lockout.lockoutUntil !== null && Date.now() < lockout.lockoutUntil;
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#0a0612] p-4">
        <div className="w-full max-w-sm rounded-3xl p-6 flex flex-col gap-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mb-1">
              <Users className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-white font-heading">User Management</h1>
            <p className="text-xs text-zinc-500">Enter security code to access</p>
          </div>
          {isLocked && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-xs text-red-400">Too many attempts. Locked for 15 min.</p>
            </div>
          )}
          <div className="relative">
            <input
              type={showCode ? "text" : "password"}
              value={codeInput}
              onChange={e => setCodeInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !isLocked && handleAuth()}
              placeholder="Security code"
              disabled={isLocked}
              className="w-full rounded-xl bg-black/50 border border-white/15 text-white text-sm px-4 py-3 pr-10 placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 disabled:opacity-50"
            />
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white" onClick={() => setShowCode(v => !v)}>
              {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={handleAuth}
            disabled={isLocked || gateLoading || !codeInput.trim()}
            className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {gateLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Unlock"}
          </button>
        </div>
      </div>
    );
  }

  const chartData = analytics?.chart ?? [];

  const CHART_TABS: { key: typeof chartTab; label: string; color: string; fill: string }[] = [
    { key: "registrations",    label: "Registrations",   color: "#a855f7", fill: "url(#gReg)" },
    { key: "activeUsers",      label: "Daily Active",     color: "#06b6d4", fill: "url(#gDAU)" },
    { key: "tournamentJoins",  label: "Match Joins",      color: "#f59e0b", fill: "url(#gTour)" },
  ];

  const activeChartMeta = CHART_TABS.find(t => t.key === chartTab)!;

  return (
    <div className="min-h-[100dvh] bg-[#0a0612] flex flex-col">

      {/* ── Header ── */}
      <div className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3 border-b border-white/8"
        style={{ background: "rgba(10,6,18,0.95)", backdropFilter: "blur(12px)" }}>
        <button
          onClick={() => navigate(`/286c81443d1fb388d1b9a8e3b280824c`)}
          className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-white font-heading">User Management</h1>
          <p className="text-[10px] text-primary uppercase tracking-widest font-bold">{users.length} total users</p>
        </div>
        <button
          onClick={() => { loadUsers(token); loadAnalytics(token, analyticsPeriod); loadGeo(token); loadTourney(token, analyticsPeriod); loadModeData(token, analyticsPeriod); loadRetention(token, analyticsPeriod); loadM2r(token, analyticsPeriod); }}
          disabled={loading}
          className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      <div className="flex-1 flex flex-col">

        {/* ── Period Filter ── */}
        <div className="px-4 pt-4 pb-1 flex items-center gap-2">
          <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest shrink-0">Period</span>
          <div className="flex gap-1">
            {([["7", "7 Days"], ["30", "30 Days"], ["180", "6 Months"]] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setAnalyticsPeriod(val)}
                className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold transition-colors border",
                  analyticsPeriod === val
                    ? "bg-primary text-white border-primary"
                    : "bg-white/5 text-zinc-500 border-white/10 hover:text-zinc-300"
                )}
              >{label}</button>
            ))}
          </div>
        </div>

        {/* ── Analytics Panel ── */}
        <div className="px-4 pt-4">
          <button
            onClick={() => setAnalyticsOpen(v => !v)}
            className="w-full flex items-center justify-between mb-3 px-0.5"
          >
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-white">Analytics</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 border border-primary/25 text-primary uppercase tracking-wider">Live</span>
            </div>
            {analyticsOpen
              ? <ChevronUp className="w-4 h-4 text-zinc-500" />
              : <ChevronDown className="w-4 h-4 text-zinc-500" />}
          </button>

          {analyticsOpen && (
            <div className="flex flex-col gap-3 pb-4">

              {/* KPI grid */}
              {analyticsLoading && !analytics ? (
                <div className="grid grid-cols-3 gap-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
                  ))}
                </div>
              ) : analytics ? (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Total Users",   value: analytics.totalUsers,   icon: <Users className="w-3.5 h-3.5 text-violet-400" />,   color: "text-white",         bg: "rgba(139,92,246,0.07)",  border: "rgba(139,92,246,0.18)" },
                    { label: "Online Now",    value: analytics.onlineNow,    icon: <Wifi className="w-3.5 h-3.5 text-emerald-400" />,   color: "text-emerald-400",   bg: "rgba(16,185,129,0.07)",  border: "rgba(16,185,129,0.18)" },
                    { label: "DAU — Daily Active",   value: analytics.dau,             icon: <Activity className="w-3.5 h-3.5 text-cyan-400" />,   color: "text-cyan-400",      bg: "rgba(6,182,212,0.07)",   border: "rgba(6,182,212,0.18)" },
                    { label: "MAU — Monthly Active", value: analytics.mau,             icon: <UserCheck className="w-3.5 h-3.5 text-blue-400" />,  color: "text-blue-400",      bg: "rgba(59,130,246,0.07)",  border: "rgba(59,130,246,0.18)" },
                    { label: analyticsPeriod === "7" ? "New in 7 Days" : analyticsPeriod === "30" ? "New in 30 Days" : "New in 6 Months", value: analytics.newInPeriod ?? 0,   icon: <UserPlus className="w-3.5 h-3.5 text-pink-400" />,   color: "text-pink-400",      bg: "rgba(236,72,153,0.07)",  border: "rgba(236,72,153,0.18)" },
                    { label: analyticsPeriod === "7" ? "Active in 7 Days" : analyticsPeriod === "30" ? "Active in 30 Days" : "Active in 6 Months", value: analytics.activeInPeriod ?? 0, icon: <TrendingUp className="w-3.5 h-3.5 text-amber-400" />,color: "text-amber-400",     bg: "rgba(245,158,11,0.07)",  border: "rgba(245,158,11,0.18)" },
                  ].map(card => (
                    <div key={card.label} className="rounded-2xl px-2.5 py-3 flex flex-col gap-1.5"
                      style={{ background: card.bg, border: `1px solid ${card.border}` }}>
                      <div className="flex items-center justify-between">
                        {card.icon}
                      </div>
                      <p className={cn("text-xl font-extrabold leading-none", card.color)}>{card.value.toLocaleString()}</p>
                      <p className="text-[9px] text-zinc-500 uppercase tracking-wider font-bold leading-tight">{card.label}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Chart tab switcher */}
              {chartData.length > 0 && (
                <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="flex border-b border-white/6">
                    {CHART_TABS.map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setChartTab(tab.key)}
                        className={cn(
                          "flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors",
                          chartTab === tab.key ? "text-white border-b-2" : "text-zinc-600 hover:text-zinc-400"
                        )}
                        style={chartTab === tab.key ? { borderColor: tab.color } : {}}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="px-2 pt-3 pb-2">
                    <ResponsiveContainer width="100%" height={150}>
                      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gReg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#a855f7" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gDAU" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gTour" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="day" tick={{ fill: "#52525b", fontSize: 8 }} axisLine={false} tickLine={false} interval={2} />
                        <YAxis tick={{ fill: "#52525b", fontSize: 8 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip {...TOOLTIP_STYLE} />
                        <Area
                          type="monotone"
                          dataKey={chartTab}
                          name={activeChartMeta.label}
                          stroke={activeChartMeta.color}
                          strokeWidth={2}
                          fill={activeChartMeta.fill}
                          dot={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Combined bar chart */}
              {chartData.length > 0 && (
                <div className="rounded-2xl overflow-hidden px-2 pt-4 pb-2"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-3 px-1">All Metrics — Last 14 Days</p>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -30, bottom: 0 }} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="day" tick={{ fill: "#52525b", fontSize: 8 }} axisLine={false} tickLine={false} interval={2} />
                      <YAxis tick={{ fill: "#52525b", fontSize: 8 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 9, color: "#71717a", paddingTop: 4 }} />
                      <Bar dataKey="registrations"   name="Registrations" fill="#a855f7" radius={[3,3,0,0]} />
                      <Bar dataKey="activeUsers"     name="Active Users"  fill="#06b6d4" radius={[3,3,0,0]} />
                      <Bar dataKey="tournamentJoins" name="Match Joins"   fill="#f59e0b" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Breakdown stat row derived from users array */}
              {users.length > 0 && (() => {
                const now = Date.now();
                const activeCount = users.filter(u => u.status === "active").length;
                const blockedCount = users.filter(u => u.status === "blocked").length;
                const deletedCount = users.filter(u => u.status === "deleted").length;
                const adminCount = users.filter(u => u.isAdmin).length;
                const returning = users.filter(u => {
                  if (!u.lastSeenAt || !u.createdAt) return false;
                  const age = now - new Date(u.createdAt).getTime();
                  const seen = now - new Date(u.lastSeenAt).getTime();
                  return age > 7 * 86400000 && seen < 30 * 86400000;
                }).length;
                return (
                  <div className="rounded-2xl px-4 py-3 flex flex-col gap-2.5"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">User Breakdown</p>
                    {[
                      { label: "Active accounts",    value: activeCount,  total: users.length, color: "bg-emerald-500" },
                      { label: "Blocked accounts",   value: blockedCount, total: users.length, color: "bg-orange-500" },
                      { label: "Deleted (bin)",       value: deletedCount, total: users.length, color: "bg-red-500" },
                      { label: "Admins",             value: adminCount,   total: users.length, color: "bg-violet-500" },
                      { label: "Returning users",    value: returning,    total: users.length, color: "bg-cyan-500" },
                    ].map(row => (
                      <div key={row.label} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-zinc-400">{row.label}</span>
                          <span className="text-[11px] font-bold text-white">{row.value} <span className="text-zinc-600 font-normal">/ {row.total}</span></span>
                        </div>
                        <div className="h-1.5 rounded-full w-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                          <div className={cn("h-1.5 rounded-full", row.color)}
                            style={{ width: `${row.total > 0 ? Math.round((row.value / row.total) * 100) : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* ── Geographic Analytics Panel ── */}
        <div className="px-4 pb-1">
          <button
            onClick={() => setGeoOpen(v => !v)}
            className="w-full flex items-center justify-between mb-3 px-0.5"
          >
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-bold text-white">Geographic</span>
            </div>
            {geoOpen
              ? <ChevronUp className="w-4 h-4 text-zinc-500" />
              : <ChevronDown className="w-4 h-4 text-zinc-500" />}
          </button>

          {geoOpen && (
            <div className="flex flex-col gap-3 pb-4">
              {geoLoading && !geo ? (
                <div className="flex flex-col gap-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-12 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
                  ))}
                </div>
              ) : geo ? (
                <>
                  {/* Countries table */}
                  {geo.countries.length > 0 && (() => {
                    const maxUsers = geo.countries[0]?.userCount ?? 1;
                    return (
                      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <div className="px-4 py-2 border-b border-white/6 flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-zinc-500" />
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Top Countries</span>
                        </div>
                        <div className="divide-y divide-white/4">
                          {geo.countries.map((c, i) => (
                            <div key={c.country} className="px-4 py-2.5 flex flex-col gap-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[10px] font-bold text-zinc-600 w-4 shrink-0">#{i + 1}</span>
                                  <span className="text-xs font-semibold text-white truncate">{c.country}</span>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="text-[10px] text-zinc-500">{c.userCount} users</span>
                                  {c.emulatorPct > 0 && (
                                    <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full border", c.emulatorPct >= 20 ? "bg-red-500/15 border-red-500/25 text-red-300" : "bg-orange-500/10 border-orange-500/20 text-orange-400")}>
                                      {c.emulatorPct}% emu
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                                  <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.round((c.userCount / maxUsers) * 100)}%` }} />
                                </div>
                                <div className="flex items-center gap-2 shrink-0 text-[9px] text-zinc-600">
                                  <span className="flex items-center gap-0.5"><Gem className="w-2.5 h-2.5 text-cyan-500" />{c.avgDiamonds} avg</span>
                                  <span>{c.activePct}% active</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Languages */}
                  {geo.languages.length > 0 && (() => {
                    const maxLang = geo.languages[0]?.count ?? 1;
                    return (
                      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <div className="px-4 py-2 border-b border-white/6 flex items-center gap-1.5">
                          <Languages className="w-3.5 h-3.5 text-zinc-500" />
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Top Languages</span>
                        </div>
                        <div className="px-4 py-3 flex flex-col gap-2">
                          {geo.languages.map(l => (
                            <div key={l.language} className="flex items-center gap-3">
                              <span className="text-[11px] text-zinc-300 w-16 shrink-0">{l.language}</span>
                              <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                                <div className="h-1.5 rounded-full bg-violet-500" style={{ width: `${Math.round((l.count / maxLang) * 100)}%` }} />
                              </div>
                              <span className="text-[10px] text-zinc-500 w-8 text-right shrink-0">{l.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Regions */}
                  {geo.regions.length > 0 && (() => {
                    const maxReg = geo.regions[0]?.count ?? 1;
                    return (
                      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <div className="px-4 py-2 border-b border-white/6 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Top Regions</span>
                        </div>
                        <div className="px-4 py-3 flex flex-col gap-2">
                          {geo.regions.map(r => (
                            <div key={r.region} className="flex items-center gap-3">
                              <span className="text-[11px] text-zinc-300 flex-1 truncate">{r.region}</span>
                              <div className="w-24 h-1.5 rounded-full shrink-0" style={{ background: "rgba(255,255,255,0.06)" }}>
                                <div className="h-1.5 rounded-full bg-cyan-500" style={{ width: `${Math.round((r.count / maxReg) * 100)}%` }} />
                              </div>
                              <span className="text-[10px] text-zinc-500 w-6 text-right shrink-0">{r.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* No geo data yet */}
                  {geo.countries.length === 0 && (
                    <div className="rounded-2xl px-4 py-6 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <Globe className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                      <p className="text-xs text-zinc-500">No geographic data yet</p>
                      <p className="text-[10px] text-zinc-700 mt-0.5">Data populates after users' next heartbeat</p>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>

        {/* ── Tournament Analytics Panel ── */}
        <div className="px-4 pb-1">
          <button
            onClick={() => setTourneyOpen(v => !v)}
            className="w-full flex items-center justify-between mb-3 px-0.5"
          >
            <div className="flex items-center gap-2">
              <Swords className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-bold text-white">Tournaments</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-400 uppercase tracking-wider">Core</span>
            </div>
            {tourneyOpen
              ? <ChevronUp className="w-4 h-4 text-zinc-500" />
              : <ChevronDown className="w-4 h-4 text-zinc-500" />}
          </button>

          {tourneyOpen && (
            <div className="flex flex-col gap-3 pb-4">
              {tourneyLoading && !tourney ? (
                <div className="flex flex-col gap-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-14 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
                  ))}
                </div>
              ) : tourney ? (
                <>
                  {/* KPI grid — row 1 */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Created",     value: tourney.summary.totalCreated,   icon: <Trophy className="w-3.5 h-3.5 text-amber-400" />,   color: "text-white",        bg: "rgba(245,158,11,0.07)",  border: "rgba(245,158,11,0.18)" },
                      { label: "Filled",      value: tourney.summary.totalFilled,    icon: <Zap className="w-3.5 h-3.5 text-emerald-400" />,     color: "text-emerald-400",  bg: "rgba(16,185,129,0.07)",  border: "rgba(16,185,129,0.18)" },
                      { label: "Cancelled",   value: tourney.summary.totalCancelled, icon: <XCircle className="w-3.5 h-3.5 text-red-400" />,     color: "text-red-400",      bg: "rgba(239,68,68,0.07)",   border: "rgba(239,68,68,0.18)" },
                    ].map(k => (
                      <div key={k.label} className="rounded-2xl p-3 flex flex-col gap-1" style={{ background: k.bg, border: `1px solid ${k.border}` }}>
                        <div className="flex items-center justify-between">{k.icon}<span className="text-[9px] text-zinc-500">{k.label}</span></div>
                        <span className={`text-lg font-bold ${k.color}`}>{k.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* KPI grid — row 2: rates + timing */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Fill Rate",   value: `${tourney.summary.fillRate}%`,   icon: <Percent className="w-3.5 h-3.5 text-cyan-400" />,      color: "text-cyan-400",    bg: "rgba(6,182,212,0.07)",   border: "rgba(6,182,212,0.18)" },
                      { label: "Join Rate",   value: `${tourney.summary.avgJoinRate}%`, icon: <Activity className="w-3.5 h-3.5 text-violet-400" />,   color: "text-violet-400",  bg: "rgba(139,92,246,0.07)",  border: "rgba(139,92,246,0.18)" },
                      { label: "Cancel Rate", value: `${tourney.summary.cancelRate}%`,  icon: <TrendingUp className="w-3.5 h-3.5 text-orange-400" />, color: "text-orange-400",  bg: "rgba(249,115,22,0.07)",  border: "rgba(249,115,22,0.18)" },
                    ].map(k => (
                      <div key={k.label} className="rounded-2xl p-3 flex flex-col gap-1" style={{ background: k.bg, border: `1px solid ${k.border}` }}>
                        <div className="flex items-center justify-between">{k.icon}<span className="text-[9px] text-zinc-500">{k.label}</span></div>
                        <span className={`text-lg font-bold ${k.color}`}>{k.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Timing cards */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-2xl p-3 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <Timer className="w-5 h-5 text-cyan-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-zinc-500">Avg Fill Time</p>
                        <p className="text-sm font-bold text-white">
                          {tourney.summary.avgFillTimeMinutes != null
                            ? tourney.summary.avgFillTimeMinutes < 60
                              ? `${tourney.summary.avgFillTimeMinutes}m`
                              : `${Math.floor(tourney.summary.avgFillTimeMinutes / 60)}h ${tourney.summary.avgFillTimeMinutes % 60}m`
                            : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-2xl p-3 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <CalendarClock className="w-5 h-5 text-violet-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-zinc-500">Avg Match Duration</p>
                        <p className="text-sm font-bold text-white">
                          {tourney.summary.avgMatchDurationMinutes != null
                            ? tourney.summary.avgMatchDurationMinutes < 60
                              ? `${tourney.summary.avgMatchDurationMinutes}m`
                              : `${Math.floor(tourney.summary.avgMatchDurationMinutes / 60)}h ${tourney.summary.avgMatchDurationMinutes % 60}m`
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Status breakdown */}
                  <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Status Breakdown</p>
                    {[
                      { label: "Upcoming",  value: tourney.byStatus.upcoming,  total: tourney.summary.totalCreated, color: "bg-amber-500" },
                      { label: "Ongoing",   value: tourney.byStatus.ongoing,   total: tourney.summary.totalCreated, color: "bg-emerald-500" },
                      { label: "Completed", value: tourney.byStatus.completed, total: tourney.summary.totalCreated, color: "bg-violet-500" },
                    ].map(row => (
                      <div key={row.label} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-zinc-400">{row.label}</span>
                          <span className="text-[11px] font-bold text-white">{row.value} <span className="text-zinc-600 font-normal">/ {row.total}</span></span>
                        </div>
                        <div className="h-1.5 rounded-full w-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                          <div className={cn("h-1.5 rounded-full", row.color)} style={{ width: `${row.total > 0 ? Math.round((row.value / row.total) * 100) : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 14-day chart */}
                  {tourney.chart.some(d => d.created > 0) && (
                    <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">{analyticsPeriod === "7" ? "7-Day" : analyticsPeriod === "30" ? "30-Day" : "6-Month"} Activity</p>
                        <div className="flex gap-1">
                          {(["created", "filled", "cancelled"] as const).map(t => (
                            <button
                              key={t}
                              onClick={() => setTourneyChartTab(t)}
                              className={cn("text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider transition-colors", tourneyChartTab === t ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-zinc-600 hover:text-zinc-400")}
                            >{t}</button>
                          ))}
                        </div>
                      </div>
                      <div style={{ height: 120 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={tourney.chart} margin={{ top: 0, right: 12, left: -28, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="day" tick={{ fill: "#52525b", fontSize: 8 }} tickLine={false} axisLine={false} interval={3} />
                            <YAxis tick={{ fill: "#52525b", fontSize: 8 }} tickLine={false} axisLine={false} allowDecimals={false} />
                            <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} />
                            <Bar dataKey={tourneyChartTab} radius={[3,3,0,0]}
                              fill={tourneyChartTab === "created" ? "#f59e0b" : tourneyChartTab === "filled" ? "#10b981" : "#ef4444"} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Top tournaments table */}
                  {tourney.top.length > 0 && (
                    <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="px-4 py-2 border-b border-white/6 flex items-center gap-1.5">
                        <Trophy className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Top Tournaments by Fill Rate</span>
                      </div>
                      <div className="divide-y divide-white/4">
                        {tourney.top.map(t => {
                          const statusColor = t.status === "completed" ? "text-violet-400" : t.status === "ongoing" ? "text-emerald-400" : "text-amber-400";
                          const barColor = t.fillPct >= 100 ? "bg-emerald-500" : t.fillPct >= 70 ? "bg-cyan-500" : t.fillPct >= 40 ? "bg-amber-500" : "bg-red-500";
                          return (
                            <div key={t.id} className="px-4 py-2.5 flex flex-col gap-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold text-white truncate">{t.title}</p>
                                  <p className="text-[9px] text-zinc-600">{t.gameMode}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={cn("text-[9px] font-bold uppercase", statusColor)}>{t.status}</span>
                                  <span className="text-[10px] font-bold text-white">{t.fillPct}%</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                                  <div className={cn("h-1.5 rounded-full", barColor)} style={{ width: `${Math.min(t.fillPct, 100)}%` }} />
                                </div>
                                <span className="text-[9px] text-zinc-600 shrink-0">{t.filledSlots}/{t.maxSlots}</span>
                                {t.entryFee > 0 && (
                                  <span className="text-[9px] text-cyan-500 flex items-center gap-0.5 shrink-0">
                                    <Gem className="w-2.5 h-2.5" />{t.entryFee}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Empty state */}
                  {tourney.summary.totalCreated === 0 && (
                    <div className="rounded-2xl px-4 py-6 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <Trophy className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                      <p className="text-xs text-zinc-500">No tournaments yet</p>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>

        {/* ── Mode Popularity Panel ── */}
        {(() => {
          const modeLabel = (m: string) => {
            const map: Record<string, string> = {
              solo: "BR Solo", duo: "BR Duo", squad: "BR Squad",
              clash_squad: "Clash Squad", craftland: "Craftland",
              lone_wolf: "Lone Wolf", "Battle Royale": "Battle Royale",
            };
            return map[m] ?? m.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
          };
          const modeColor = (m: string): { bar: string; text: string; bg: string; border: string } => {
            const map: Record<string, { bar: string; text: string; bg: string; border: string }> = {
              solo: { bar: "#f59e0b", text: "text-amber-400", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)" },
              duo: { bar: "#06b6d4", text: "text-cyan-400", bg: "rgba(6,182,212,0.08)", border: "rgba(6,182,212,0.2)" },
              squad: { bar: "#8b5cf6", text: "text-violet-400", bg: "rgba(139,92,246,0.08)", border: "rgba(139,92,246,0.2)" },
              clash_squad: { bar: "#ef4444", text: "text-red-400", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)" },
              craftland: { bar: "#10b981", text: "text-emerald-400", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.2)" },
              lone_wolf: { bar: "#38bdf8", text: "text-sky-400", bg: "rgba(56,189,248,0.08)", border: "rgba(56,189,248,0.2)" },
              "Battle Royale": { bar: "#f97316", text: "text-orange-400", bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.2)" },
            };
            return map[m] ?? { bar: "#71717a", text: "text-zinc-400", bg: "rgba(113,113,122,0.08)", border: "rgba(113,113,122,0.2)" };
          };
          const CHART_COLORS: Record<string, string> = {
            solo: "#f59e0b", duo: "#06b6d4", squad: "#8b5cf6",
            clash_squad: "#ef4444", craftland: "#10b981", lone_wolf: "#38bdf8",
            "Battle Royale": "#f97316",
          };
          const chartColor = (m: string) => CHART_COLORS[m] ?? "#71717a";

          return (
            <div className="px-4 pb-1">
              <button
                onClick={() => setModeOpen(v => !v)}
                className="w-full flex items-center justify-between mb-3 px-0.5"
              >
                <div className="flex items-center gap-2">
                  <Swords className="w-4 h-4 text-rose-400" />
                  <span className="text-sm font-bold text-white">Mode Popularity</span>
                </div>
                {modeOpen
                  ? <ChevronUp className="w-4 h-4 text-zinc-500" />
                  : <ChevronDown className="w-4 h-4 text-zinc-500" />}
              </button>

              {modeOpen && (
                <div className="flex flex-col gap-3 pb-4">
                  {modeLoading && !modeData ? (
                    <div className="flex flex-col gap-2">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
                      ))}
                    </div>
                  ) : modeData && modeData.modes.length > 0 ? (
                    <>
                      {/* Mode cards — ranked by participation */}
                      {(() => {
                        const maxParts = modeData.modes[0]?.totalParticipants ?? 1;
                        return modeData.modes.map((m, i) => {
                          const c = modeColor(m.mode);
                          const retColor = m.retentionPct >= 50 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/25"
                            : m.retentionPct >= 25 ? "text-amber-400 bg-amber-500/10 border-amber-500/25"
                            : "text-red-400 bg-red-500/10 border-red-500/25";
                          return (
                            <div key={m.mode} className="rounded-2xl p-3.5 flex flex-col gap-2.5" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
                              {/* Header row */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[10px] font-bold text-zinc-600 shrink-0">#{i + 1}</span>
                                  <span className={cn("text-sm font-bold", c.text)}>{modeLabel(m.mode)}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border", retColor)}>
                                    {m.retentionPct}% retained
                                  </span>
                                </div>
                              </div>

                              {/* Participation bar */}
                              <div className="flex items-center gap-2.5">
                                <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.round((m.totalParticipants / maxParts) * 100)}%`, background: c.bar }} />
                                </div>
                                <span className="text-[10px] text-zinc-400 shrink-0 font-semibold">{m.totalParticipants} joins</span>
                              </div>

                              {/* Stat row */}
                              <div className="flex items-center gap-3 flex-wrap">
                                {[
                                  { label: "Tournaments", value: String(m.totalTournaments) },
                                  { label: "Unique players", value: String(m.uniquePlayers) },
                                  { label: "Fill rate", value: `${m.avgFillRate}%` },
                                  { label: "Cancel rate", value: `${m.cancelRate}%` },
                                  { label: "Avg kills", value: String(m.avgKills) },
                                  { label: "Avg diamonds", value: String(m.avgDiamondsWon) },
                                ].map(s => (
                                  <div key={s.label} className="flex flex-col gap-0.5">
                                    <span className="text-[8px] text-zinc-600 uppercase tracking-wider">{s.label}</span>
                                    <span className="text-[11px] font-bold text-white">{s.value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        });
                      })()}

                      {/* 14-day stacked participation chart */}
                      {modeData.chart.some(d => modeData.modeList.some(m => (d[m] as number) > 0)) && (
                        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                          <div className="px-4 pt-3 pb-2">
                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">14-Day Participation by Mode</p>
                          </div>
                          <div style={{ height: 140 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={modeData.chart} margin={{ top: 0, right: 12, left: -28, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                <XAxis dataKey="day" tick={{ fill: "#52525b", fontSize: 8 }} tickLine={false} axisLine={false} interval={3} />
                                <YAxis tick={{ fill: "#52525b", fontSize: 8 }} tickLine={false} axisLine={false} allowDecimals={false} />
                                <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} />
                                <Legend wrapperStyle={{ fontSize: 9, paddingBottom: 4 }} formatter={(v) => modeLabel(v)} />
                                {modeData.modeList.map(m => (
                                  <Bar key={m} dataKey={m} stackId="a" fill={chartColor(m)} radius={modeData.modeList.indexOf(m) === modeData.modeList.length - 1 ? [3,3,0,0] : [0,0,0,0]} />
                                ))}
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}

                      {/* Retention comparison bar */}
                      <div className="rounded-2xl p-3.5 flex flex-col gap-2.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Retention by Mode</p>
                        <p className="text-[10px] text-zinc-600">% of players who came back for a 2nd tournament in the same mode</p>
                        {modeData.modes.map(m => {
                          const c = modeColor(m.mode);
                          return (
                            <div key={m.mode} className="flex items-center gap-3">
                              <span className={cn("text-[10px] font-semibold w-20 shrink-0", c.text)}>{modeLabel(m.mode)}</span>
                              <div className="flex-1 h-2 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                                <div className="h-2 rounded-full" style={{ width: `${m.retentionPct}%`, background: c.bar }} />
                              </div>
                              <span className="text-[10px] font-bold text-white w-8 text-right shrink-0">{m.retentionPct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : modeData && modeData.modes.length === 0 ? (
                    <div className="rounded-2xl px-4 py-6 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <Swords className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                      <p className="text-xs text-zinc-500">No tournament data yet</p>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Retention Analytics Panel ── */}
        <div className="px-4 pb-1">
          <button
            onClick={() => setRetentionOpen(v => !v)}
            className="w-full flex items-center justify-between mb-3 px-0.5"
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-bold text-white">Retention</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 uppercase tracking-wider">Core</span>
            </div>
            {retentionOpen
              ? <ChevronUp className="w-4 h-4 text-zinc-500" />
              : <ChevronDown className="w-4 h-4 text-zinc-500" />}
          </button>

          {retentionOpen && (
            <div className="flex flex-col gap-3 pb-4">
              {retentionLoading && !retention ? (
                <div className="flex flex-col gap-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
                  ))}
                </div>
              ) : retention ? (() => {
                // Benchmark classifier
                const grade = (pct: number | null, d: 1 | 7 | 30): "good" | "avg" | "poor" | "na" => {
                  if (pct === null) return "na";
                  const thresholds = { 1: [40, 20], 7: [20, 10], 30: [10, 5] };
                  const [good, avg] = thresholds[d];
                  return pct >= good ? "good" : pct >= avg ? "avg" : "poor";
                };
                const gradeStyle = (g: ReturnType<typeof grade>) => ({
                  good: { label: "Good", color: "text-emerald-400", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.25)", bar: "#10b981" },
                  avg: { label: "Average", color: "text-amber-400", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)", bar: "#f59e0b" },
                  poor: { label: "Low", color: "text-red-400", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.25)", bar: "#ef4444" },
                  na: { label: "No data", color: "text-zinc-600", bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)", bar: "#3f3f46" },
                }[g]);

                const d1Grade = grade(retention.overall.d1.pct, 1);
                const d7Grade = grade(retention.overall.d7.pct, 7);
                const d30Grade = grade(retention.overall.d30.pct, 30);

                return (
                  <>
                    {/* ── 3 big KPI cards ── */}
                    <div className="flex flex-col gap-2">
                      {([
                        { label: "Day 1", sub: "Return next day", key: "d1" as const, day: 1 as const, bench: "Industry avg ~25%", grade: d1Grade, style: gradeStyle(d1Grade) },
                        { label: "Day 7", sub: "Return within a week", key: "d7" as const, day: 7 as const, bench: "Industry avg ~12%", grade: d7Grade, style: gradeStyle(d7Grade) },
                        { label: "Day 30", sub: "Still here after a month", key: "d30" as const, day: 30 as const, bench: "Industry avg ~5%", grade: d30Grade, style: gradeStyle(d30Grade) },
                      ]).map(item => {
                        const data = retention.overall[item.key];
                        const pctVal = data.pct ?? 0;
                        return (
                          <div key={item.label} className="rounded-2xl p-4 flex flex-col gap-2.5" style={{ background: item.style.bg, border: `1px solid ${item.style.border}` }}>
                            <div className="flex items-center justify-between">
                              <div>
                                <p className={`text-2xl font-black ${item.style.color}`}>
                                  {data.pct !== null ? `${data.pct}%` : "—"}
                                </p>
                                <p className="text-[10px] font-bold text-white mt-0.5">{item.label} Retention</p>
                                <p className="text-[9px] text-zinc-600">{item.sub}</p>
                              </div>
                              <div className="text-right">
                                <span className={`text-[9px] font-bold px-2 py-1 rounded-full border ${item.style.color}`} style={{ background: item.style.bg, borderColor: item.style.border }}>
                                  {item.style.label}
                                </span>
                                <p className="text-[9px] text-zinc-600 mt-1.5">{data.retained} / {data.cohortSize} users</p>
                                <p className="text-[9px] text-zinc-700 mt-0.5">{item.bench}</p>
                              </div>
                            </div>
                            <div className="h-1.5 rounded-full w-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                              <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(pctVal, 100)}%`, background: item.style.bar }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* ── 30-day D1 trend chart ── */}
                    {retention.chart.some(d => d.registered > 0) && (
                      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <div className="px-4 pt-3 pb-1">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Day 1 Retention — 30-Day Trend</p>
                          <p className="text-[9px] text-zinc-700 mt-0.5">% of new users who returned the next day</p>
                        </div>
                        <div style={{ height: 130 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={retention.chart} margin={{ top: 8, right: 12, left: -28, bottom: 0 }}>
                              <defs>
                                <linearGradient id="retGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                              <XAxis dataKey="day" tick={{ fill: "#52525b", fontSize: 8 }} tickLine={false} axisLine={false} interval={6} />
                              <YAxis tick={{ fill: "#52525b", fontSize: 8 }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                              <Tooltip
                                contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                                formatter={(v: number, name: string) => [name === "d1Pct" ? `${v}%` : v, name === "d1Pct" ? "Day 1 Return Rate" : "Registered"]}
                              />
                              <Area type="monotone" dataKey="d1Pct" stroke="#10b981" strokeWidth={1.5} fill="url(#retGrad)" dot={false} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* ── Weekly cohort table ── */}
                    {retention.cohorts.some(c => c.registered > 0) && (
                      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <div className="px-4 py-2 border-b border-white/6">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Weekly Cohort Breakdown</p>
                        </div>
                        {/* Header */}
                        <div className="grid grid-cols-5 px-4 py-1.5 border-b border-white/5">
                          {["Week of", "Joined", "Day 1", "Day 7", "Day 30"].map(h => (
                            <span key={h} className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider">{h}</span>
                          ))}
                        </div>
                        <div className="divide-y divide-white/4">
                          {[...retention.cohorts].reverse().map(c => {
                            const cell = (val: number | null) => {
                              if (val === null) return <span className="text-[10px] text-zinc-700">—</span>;
                              const g = val >= 30 ? "text-emerald-400" : val >= 15 ? "text-amber-400" : "text-red-400";
                              return <span className={`text-[10px] font-bold ${g}`}>{val}%</span>;
                            };
                            return (
                              <div key={c.week} className="grid grid-cols-5 px-4 py-2 items-center">
                                <span className="text-[10px] text-zinc-400">{c.week}</span>
                                <span className="text-[10px] text-white font-semibold">{c.registered}</span>
                                {cell(c.d1.pct)}
                                {cell(c.d7.pct)}
                                {cell(c.d30.pct)}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                );
              })() : null}
            </div>
          )}
        </div>

        {/* ── Match-to-Return Panel ── */}
        {(() => {
          const fmtMs = (ms: number | null) => {
            if (ms === null) return "—";
            const h = Math.floor(ms / 3600000);
            const m = Math.floor((ms % 3600000) / 60000);
            return h > 0 ? `${h}h ${m}m` : `${m}m`;
          };
          const modeLabel = (m: string) => {
            const map: Record<string, string> = { solo: "BR Solo", duo: "BR Duo", squad: "BR Squad", clash_squad: "Clash Squad", craftland: "Craftland", lone_wolf: "Lone Wolf", "Battle Royale": "Battle Royale" };
            return map[m] ?? m.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
          };
          const modeBar = (m: string) => ({ solo: "#f59e0b", duo: "#06b6d4", squad: "#8b5cf6", clash_squad: "#ef4444", craftland: "#10b981", lone_wolf: "#38bdf8", "Battle Royale": "#f97316" } as Record<string, string>)[m] ?? "#71717a";

          return (
            <div className="px-4 pb-1">
              <button
                onClick={() => setM2rOpen(v => !v)}
                className="w-full flex items-center justify-between mb-3 px-0.5"
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm font-bold text-white">Match-to-Return</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-500/15 border border-yellow-500/25 text-yellow-400 uppercase tracking-wider">Gold</span>
                </div>
                {m2rOpen ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
              </button>

              {m2rOpen && (
                <div className="flex flex-col gap-3 pb-4">
                  {m2rLoading && !m2r ? (
                    <div className="flex flex-col gap-2">
                      {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />)}
                    </div>
                  ) : m2r ? (() => {
                    const rate = m2r.overall.rate;
                    const rateGrade = rate === null ? "na" : rate >= 60 ? "good" : rate >= 35 ? "avg" : "poor";
                    const gradeStyle = { good: { color: "text-emerald-400", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.25)", bar: "#10b981", label: "Strong" }, avg: { color: "text-amber-400", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)", bar: "#f59e0b", label: "Average" }, poor: { color: "text-red-400", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.25)", bar: "#ef4444", label: "Needs work" }, na: { color: "text-zinc-500", bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.07)", bar: "#52525b", label: "No data" } }[rateGrade];

                    return (
                      <>
                        {/* ── Hero KPI ── */}
                        <div className="rounded-2xl p-4" style={{ background: gradeStyle.bg, border: `1px solid ${gradeStyle.border}` }}>
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                              <p className={`text-4xl font-black tracking-tight ${gradeStyle.color}`}>
                                {rate !== null ? `${rate}%` : "—"}
                              </p>
                              <p className="text-xs font-bold text-white mt-1">Match-to-Return Rate</p>
                              <p className="text-[10px] text-zinc-500 mt-0.5">% who return within 24h of their first match</p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${gradeStyle.color}`} style={{ background: gradeStyle.bg, borderColor: gradeStyle.border }}>
                                {gradeStyle.label}
                              </span>
                              <p className="text-[9px] text-zinc-600 mt-2">{m2r.overall.returned} returned</p>
                              <p className="text-[9px] text-zinc-700">{m2r.overall.cohortSize} total cohort</p>
                            </div>
                          </div>
                          <div className="h-2 rounded-full w-full mb-2" style={{ background: "rgba(255,255,255,0.06)" }}>
                            <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(rate ?? 0, 100)}%`, background: gradeStyle.bar }} />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] text-zinc-600">Industry avg ~40–60%</span>
                            <span className="text-[9px] text-zinc-500">Avg return time: <span className="text-white font-bold">{fmtMs(m2r.overall.avgReturnMs)}</span></span>
                          </div>
                        </div>

                        {/* ── Return time distribution ── */}
                        {m2r.overall.returned > 0 && (
                          <div className="rounded-2xl p-3.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-2.5">How quickly they return</p>
                            {/* Stacked bar */}
                            <div className="flex h-3 rounded-full overflow-hidden mb-3 gap-px">
                              {m2r.distribution.map((d, i) => {
                                const colors = ["#10b981", "#f59e0b", "#8b5cf6"];
                                return d.pct > 0 ? (
                                  <div key={d.bucket} className="h-full transition-all" style={{ width: `${d.pct}%`, background: colors[i] }} />
                                ) : null;
                              })}
                            </div>
                            <div className="flex gap-4 flex-wrap">
                              {m2r.distribution.map((d, i) => {
                                const colors = ["text-emerald-400", "text-amber-400", "text-violet-400"];
                                return (
                                  <div key={d.bucket} className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: ["#10b981", "#f59e0b", "#8b5cf6"][i] }} />
                                    <span className="text-[9px] text-zinc-500">{d.bucket}</span>
                                    <span className={`text-[9px] font-bold ${colors[i]}`}>{d.pct}%</span>
                                    <span className="text-[9px] text-zinc-700">({d.count})</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* ── By game mode ── */}
                        {m2r.byMode.length > 0 && (
                          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                            <div className="px-4 py-2 border-b border-white/6 flex items-center gap-1.5">
                              <Swords className="w-3.5 h-3.5 text-zinc-500" />
                              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">M2R by Mode</span>
                            </div>
                            <div className="px-4 py-3 flex flex-col gap-2.5">
                              {m2r.byMode.map(m => {
                                const barColor = modeBar(m.mode);
                                const rateVal = m.rate ?? 0;
                                const rateColor = rateVal >= 60 ? "text-emerald-400" : rateVal >= 35 ? "text-amber-400" : "text-red-400";
                                return (
                                  <div key={m.mode} className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: barColor }} />
                                        <span className="text-[11px] text-zinc-300 font-medium">{modeLabel(m.mode)}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[9px] text-zinc-600">{m.returned}/{m.cohortSize}</span>
                                        <span className={`text-[10px] font-bold ${rateColor}`}>{m.rate !== null ? `${m.rate}%` : "—"}</span>
                                        {m.avgReturnMs !== null && (
                                          <span className="text-[9px] text-zinc-600">avg {fmtMs(m.avgReturnMs)}</span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                                      <div className="h-1.5 rounded-full" style={{ width: `${rateVal}%`, background: barColor }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* ── 30-day trend chart ── */}
                        {m2r.chart.some(d => d.cohort > 0) && (
                          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                            <div className="px-4 pt-3 pb-1">
                              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">30-Day M2R Trend</p>
                              <p className="text-[9px] text-zinc-700 mt-0.5">Daily return rate after first match</p>
                            </div>
                            <div style={{ height: 130 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={m2r.chart} margin={{ top: 8, right: 12, left: -28, bottom: 0 }}>
                                  <defs>
                                    <linearGradient id="m2rGrad" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                                      <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                  <XAxis dataKey="day" tick={{ fill: "#52525b", fontSize: 8 }} tickLine={false} axisLine={false} interval={6} />
                                  <YAxis tick={{ fill: "#52525b", fontSize: 8 }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                                  <Tooltip
                                    contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                                    formatter={(v: number, name: string) => [name === "rate" ? `${v}%` : v, name === "rate" ? "Return Rate" : name === "cohort" ? "Played" : "Returned"]}
                                  />
                                  <Area type="monotone" dataKey="rate" stroke="#eab308" strokeWidth={1.5} fill="url(#m2rGrad)" dot={false} />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}

                        {/* Empty state */}
                        {m2r.overall.cohortSize === 0 && (
                          <div className="rounded-2xl px-4 py-8 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                            <Zap className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                            <p className="text-xs text-zinc-500">No match data yet</p>
                            <p className="text-[10px] text-zinc-700 mt-0.5">Populates once users have played matches 24h+ ago</p>
                          </div>
                        )}
                      </>
                    );
                  })() : null}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Search & Filter ── */}
        <div className="px-4 pb-3 flex flex-col gap-2">
          {/* Search row */}
          <div className="flex items-center gap-2">
            {/* Filter button */}
            <button
              onClick={() => setFilterOpen(true)}
              className={cn(
                "relative w-10 h-10 shrink-0 rounded-xl flex items-center justify-center border transition-colors",
                activeFilterCount > 0
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "bg-white/5 border-white/10 text-zinc-500 hover:text-white hover:border-white/20"
              )}
            >
              <SlidersHorizontal className="w-4 h-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-white text-[9px] font-black flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Search input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search IGN, phone, or UID…"
                className="w-full rounded-xl bg-white/5 border border-white/10 text-white text-sm pl-9 pr-8 py-2.5 placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                >
                  <X className="w-3 h-3 text-zinc-500" />
                </button>
              )}
            </div>
          </div>

          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {statusFilter !== "all" && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 border border-primary/25 text-primary text-[10px] font-bold">
                  {statusFilter === "deleted" ? "Bin" : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
                  <button onClick={() => setStatusFilter("all")}><X className="w-2.5 h-2.5" /></button>
                </span>
              )}
              {roleFilter !== "all" && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-400 text-[10px] font-bold">
                  {roleFilter === "admin" ? "Admin" : "Regular"}
                  <button onClick={() => setRoleFilter("all")}><X className="w-2.5 h-2.5" /></button>
                </span>
              )}
              {onlineFilter !== "all" && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-[10px] font-bold">
                  Online Now
                  <button onClick={() => setOnlineFilter("all")}><X className="w-2.5 h-2.5" /></button>
                </span>
              )}
              {diamondFilter !== "all" && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/25 text-cyan-400 text-[10px] font-bold">
                  {diamondFilter === "zero" ? "0 Diamonds" : diamondFilter === "low" ? "1–99" : diamondFilter === "mid" ? "100–499" : "500+"}
                  <button onClick={() => setDiamondFilter("all")}><X className="w-2.5 h-2.5" /></button>
                </span>
              )}
              {uidFilter !== "all" && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-400 text-[10px] font-bold">
                  {uidFilter === "has" ? "Has UID" : "No UID"}
                  <button onClick={() => setUidFilter("all")}><X className="w-2.5 h-2.5" /></button>
                </span>
              )}
              {sortBy !== "newest" && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-500/15 border border-zinc-500/25 text-zinc-400 text-[10px] font-bold">
                  {sortBy === "oldest" ? "Oldest first" : sortBy === "diamonds_desc" ? "Most Diamonds" : sortBy === "diamonds_asc" ? "Least Diamonds" : "By Name"}
                  <button onClick={() => setSortBy("newest")}><X className="w-2.5 h-2.5" /></button>
                </span>
              )}
              <button onClick={resetFilters} className="text-[10px] text-zinc-600 hover:text-zinc-400 px-1 transition-colors">
                Clear all
              </button>
            </div>
          )}

          {/* Result count */}
          <p className="text-[10px] text-zinc-600 font-medium">
            {filtered.length === users.length ? `${users.length} users` : `${filtered.length} of ${users.length} users`}
          </p>
        </div>

        {/* ── Filter Bottom Sheet ── */}
        {filterOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setFilterOpen(false)} />
            <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl flex flex-col gap-0 max-h-[85dvh] overflow-y-auto"
              style={{ background: "#0f0a1e", border: "1px solid rgba(255,255,255,0.1)" }}>
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/8 shrink-0">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-primary" />
                  <span className="text-sm font-bold text-white">Filters & Sort</span>
                  {activeFilterCount > 0 && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                      {activeFilterCount} active
                    </span>
                  )}
                </div>
                <button onClick={resetFilters} className="text-[11px] font-bold text-zinc-500 hover:text-primary transition-colors">
                  Reset all
                </button>
              </div>

              <div className="px-5 py-4 flex flex-col gap-5">
                {/* Status */}
                {(() => {
                  const opts: { val: typeof statusFilter; label: string; count: number; color: string }[] = [
                    { val: "all",     label: "All",     count: users.length,                                    color: "text-white" },
                    { val: "active",  label: "Active",  count: users.filter(u => u.status === "active").length,  color: "text-emerald-400" },
                    { val: "blocked", label: "Blocked", count: users.filter(u => u.status === "blocked").length, color: "text-orange-400" },
                    { val: "deleted", label: "Bin",     count: users.filter(u => u.status === "deleted").length, color: "text-red-400" },
                  ];
                  return (
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Status</span>
                      <div className="flex gap-2 flex-wrap">
                        {opts.map(o => (
                          <button key={o.val} onClick={() => setStatusFilter(o.val)}
                            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                              statusFilter === o.val ? "bg-primary/20 border-primary/40 text-primary" : "bg-white/5 border-white/10 text-zinc-400 hover:text-white")}>
                            <span className={statusFilter === o.val ? "text-primary" : o.color}>{o.label}</span>
                            <span className="opacity-50 text-[10px]">({o.count})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Role */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Role</span>
                  <div className="flex gap-2">
                    {([["all", "All"], ["admin", "Admin only"], ["regular", "Regular"]] as const).map(([val, label]) => (
                      <button key={val} onClick={() => setRoleFilter(val)}
                        className={cn("px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                          roleFilter === val ? "bg-violet-500/20 border-violet-500/40 text-violet-300" : "bg-white/5 border-white/10 text-zinc-400 hover:text-white")}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Activity */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Activity</span>
                  <div className="flex gap-2">
                    {([["all", "All"], ["online", "Online now"]] as const).map(([val, label]) => (
                      <button key={val} onClick={() => setOnlineFilter(val as typeof onlineFilter)}
                        className={cn("px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                          onlineFilter === val ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" : "bg-white/5 border-white/10 text-zinc-400 hover:text-white")}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Diamonds */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Diamonds</span>
                  <div className="flex gap-2 flex-wrap">
                    {([["all","Any"], ["zero","0"], ["low","1–99"], ["mid","100–499"], ["high","500+"]] as const).map(([val, label]) => (
                      <button key={val} onClick={() => setDiamondFilter(val)}
                        className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                          diamondFilter === val ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300" : "bg-white/5 border-white/10 text-zinc-400 hover:text-white")}>
                        {val !== "all" && <Gem className="w-3 h-3 text-cyan-400 opacity-60" />}{label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* UID */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Free Fire UID</span>
                  <div className="flex gap-2">
                    {([["all","Any"], ["has","Has UID"], ["none","No UID"]] as const).map(([val, label]) => (
                      <button key={val} onClick={() => setUidFilter(val)}
                        className={cn("px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                          uidFilter === val ? "bg-amber-500/20 border-amber-500/40 text-amber-300" : "bg-white/5 border-white/10 text-zinc-400 hover:text-white")}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sort */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                    <ArrowUpDown className="w-3 h-3" />Sort by
                  </span>
                  <div className="flex gap-2 flex-wrap">
                    {([
                      ["newest", "Newest first"],
                      ["oldest", "Oldest first"],
                      ["diamonds_desc", "Most Diamonds"],
                      ["diamonds_asc", "Least Diamonds"],
                      ["name", "Name A–Z"],
                    ] as const).map(([val, label]) => (
                      <button key={val} onClick={() => setSortBy(val)}
                        className={cn("px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                          sortBy === val ? "bg-zinc-500/30 border-zinc-400/40 text-white" : "bg-white/5 border-white/10 text-zinc-400 hover:text-white")}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Apply button */}
              <div className="px-5 pt-2 pb-8 shrink-0 border-t border-white/8">
                <button
                  onClick={() => setFilterOpen(false)}
                  className="w-full py-3 rounded-2xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                >
                  Show {filtered.length} {filtered.length === 1 ? "user" : "users"}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── User List ── */}
        <div className="flex-1 px-4 pb-8">
          {loading ? (
            <div className="flex flex-col gap-3 pt-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-20 rounded-2xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-16 text-center gap-2">
              <Users className="w-12 h-12 text-zinc-700" />
              <p className="text-zinc-500 text-sm">No users found</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 pt-2">
              {filtered.map(u => (
                <button
                  key={u.id}
                  onClick={() => navigate(`/286c81443d1fb388d1b9a8e3b280824c/user_management/${encodeURIComponent(u.phone)}/${u.id}`)}
                  className={cn(
                    "w-full text-left rounded-2xl p-3 flex items-center gap-3 transition-all",
                    "hover:scale-[1.01] active:scale-[0.99]",
                    "border",
                    u.status === "blocked" ? "bg-orange-500/5 border-orange-500/15" :
                    u.status === "deleted" ? "bg-red-500/5 border-red-500/15" :
                    "bg-white/4 border-white/8 hover:bg-white/7"
                  )}
                >
                  <div className="relative shrink-0">
                    <div className="w-11 h-11 rounded-xl overflow-hidden bg-white/10 flex items-center justify-center">
                      {u.profilePicture && (
                        <CachedImg src={u.profilePicture.startsWith("/api/") || u.profilePicture.startsWith("http") ? u.profilePicture : `/api/storage${u.profilePicture}`} alt="" className="w-full h-full object-cover"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      )}
                      {!u.profilePicture && (
                        <span className="text-lg font-bold text-white/40">{(u.inGameName?.[0] ?? u.phone[0]).toUpperCase()}</span>
                      )}
                    </div>
                    <span className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0a0612]",
                      u.isOnline ? "bg-emerald-400" : "bg-zinc-600"
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-bold text-white truncate">{u.inGameName ?? "No IGN"}</span>
                      {u.isAdmin && <Crown className="w-3 h-3 text-primary shrink-0" />}
                      <StatusPill status={u.status} />
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate">{u.phone}</div>
                    {u.uid && <div className="text-[10px] text-zinc-600 mt-0.5 truncate">UID: {u.uid}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1 text-sm font-bold text-cyan-300">
                      <Gem className="w-3.5 h-3.5" />{u.diamondBalance}
                    </div>
                    <div className="text-[10px] text-zinc-600">{fmtDate(u.createdAt)}</div>
                    <Eye className="w-3.5 h-3.5 text-zinc-600" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
