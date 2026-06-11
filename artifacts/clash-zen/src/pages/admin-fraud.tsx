import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, RefreshCw, ShieldAlert, AlertTriangle, AlertOctagon,
  Search, Filter, ChevronDown, ChevronUp, X, CheckCircle2, Clock,
  Smartphone, Wifi, User, Trophy, Wallet, ScrollText, MessageSquare,
  Flag, Zap, Eye, Lock, Unlock, Trash2, Send, TriangleAlert,
  Users, TrendingUp, Activity, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";

// ── API helper ────────────────────────────────────────────────────────────────
const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
async function apiFetch<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────
type RiskLevel = "critical" | "high" | "medium" | "low";

interface Stats {
  flaggedUsers: number;
  critical: number;
  high: number;
  medium: number;
  pending: number;
  alertsToday: number;
}

interface Alert {
  id: number;
  userId: number;
  type: string;
  severity: string;
  details: string | null;
  resolved: boolean;
  createdAt: string;
  inGameName: string | null;
  platformId: string | null;
}

interface RiskyUser {
  userId: number;
  inGameName: string | null;
  platformId: string | null;
  accountCreatedAt: string;
  withdrawalBanned: boolean;
  walletFrozen: boolean;
  tournamentBanned: boolean;
  status: string;
  flagCount: number;
  criticalFlags: number;
  highFlags: number;
  mediumFlags: number;
  unresolvedFlags: number;
  flagTypes: string[];
  lastFlaggedAt: string;
}

interface SecurityFlag {
  id: number;
  userId: number;
  type: string;
  severity: string;
  details: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface FraudFactor {
  factor: string;
  impact: number;
  detail: string;
}

interface FraudProfile {
  user: {
    id: number;
    inGameName: string | null;
    phone: string;
    platformId: string | null;
    uid: string | null;
    createdAt: string;
    status: string;
    tournamentBanned: boolean;
    withdrawalBanned: boolean;
    walletFrozen: boolean;
    topupBanned: boolean;
    diamondBalance: number;
  };
  trustScore: {
    score: number;
    riskLevel: RiskLevel;
    fraudConfidence: number;
    factors: FraudFactor[];
  };
  flags: SecurityFlag[];
  deviceSessions: {
    id: number;
    ip: string | null;
    fingerprint: string | null;
    isEmulator: boolean;
    deviceType: string | null;
    androidVersion: string | null;
    country: string | null;
    lastSeenAt: string;
    createdAt: string;
  }[];
  recentParticipations: {
    tournamentId: number;
    placement: number | null;
    kills: number | null;
    diamondsWon: number;
    createdAt: string;
  }[];
  recentWithdrawals: {
    id: number;
    rupees: number;
    status: string;
    upiId: string;
    createdAt: string;
  }[];
  relatedAccounts: {
    userId: number;
    inGameName: string | null;
    platformId: string | null;
    ip: string | null;
    fingerprint: string | null;
    matchType: string;
  }[];
  moderationHistory: {
    action: string;
    category: string;
    details: string;
    createdAt: string;
  }[];
  summary: {
    ageDays: number;
    unresolvedFlagCount: number;
    firstPlaces: number;
    totalDiamondsWon: number;
    withdrawalsIn24h: number;
  };
}

interface DashboardData {
  stats: Stats;
  recentAlerts: Alert[];
  riskyUsers: RiskyUser[];
}

// ── Constants ─────────────────────────────────────────────────────────────────
const FLAG_LABELS: Record<string, string> = {
  multi_account:        "Multi-Account",
  emulator_usage:       "Emulator",
  suspicious_win:       "Suspicious Wins",
  ip_cluster:           "IP Cluster",
  new_account_spending: "New Acct Spending",
  fake_winner:          "Fake Winner",
  rapid_withdrawal:     "Rapid Withdrawal",
  device_switch:        "Device Switching",
  spam_join:            "Spam Joins",
};

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bg: string; border: string; dot: string }> = {
  critical: { label: "CRITICAL", color: "text-red-400",    bg: "bg-red-500/15",    border: "border-red-500/40",    dot: "bg-red-400"    },
  high:     { label: "HIGH",     color: "text-orange-400", bg: "bg-orange-500/15", border: "border-orange-500/40", dot: "bg-orange-400" },
  medium:   { label: "MEDIUM",   color: "text-yellow-400", bg: "bg-yellow-500/15", border: "border-yellow-500/40", dot: "bg-yellow-400" },
  low:      { label: "LOW",      color: "text-emerald-400",bg: "bg-emerald-500/10",border: "border-emerald-500/30",dot: "bg-emerald-400"},
};

function deriveRiskLevel(u: RiskyUser): RiskLevel {
  if (u.criticalFlags > 0) return "critical";
  if (u.highFlags > 0)     return "high";
  if (u.mediumFlags > 0)   return "medium";
  return "low";
}

function fraudConfidence(u: RiskyUser): number {
  const base = u.criticalFlags * 35 + u.highFlags * 20 + u.mediumFlags * 10;
  return Math.min(99, base);
}

// ── RiskBadge ─────────────────────────────────────────────────────────────────
function RiskBadge({ level, small }: { level: RiskLevel; small?: boolean }) {
  const c = RISK_CONFIG[level];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${c.bg} ${c.border} ${c.color} ${small ? "text-[9px] px-1.5" : ""}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

// ── FlagTypePill ──────────────────────────────────────────────────────────────
function FlagTypePill({ type }: { type: string }) {
  return (
    <span className="inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-white/8 border border-white/10 text-zinc-400 uppercase tracking-wide">
      {FLAG_LABELS[type] ?? type.replace(/_/g, " ")}
    </span>
  );
}

// ── ScoreRing ─────────────────────────────────────────────────────────────────
function ScoreRing({ score, riskLevel }: { score: number; riskLevel: RiskLevel }) {
  const c = RISK_CONFIG[riskLevel];
  const stroke    = 10;
  const r         = 45;
  const circ      = 2 * Math.PI * r;
  const dash      = (score / 100) * circ;
  return (
    <div className="relative flex items-center justify-center w-28 h-28">
      <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
        <circle cx="55" cy="55" r={r} fill="none" strokeWidth={stroke} stroke="rgba(255,255,255,0.06)" />
        <circle
          cx="55" cy="55" r={r} fill="none" strokeWidth={stroke}
          stroke={riskLevel === "critical" ? "#f87171" : riskLevel === "high" ? "#fb923c" : riskLevel === "medium" ? "#facc15" : "#34d399"}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-black ${c.color}`}>{score}</span>
        <span className="text-[9px] text-zinc-500 uppercase tracking-widest">Trust</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminFraudPage() {
  const { toast } = useToast();

  const [dashboard,      setDashboard]      = useState<DashboardData | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [lastRefreshed,  setLastRefreshed]  = useState<Date | null>(null);

  const [selectedUser,   setSelectedUser]   = useState<RiskyUser | null>(null);
  const [profile,        setProfile]        = useState<FraudProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [search,         setSearch]         = useState("");
  const [riskFilter,     setRiskFilter]     = useState<"all" | RiskLevel>("all");
  const [alertsOpen,     setAlertsOpen]     = useState(false);

  // Review panel state
  const [activeTab,      setActiveTab]      = useState<"flags" | "device" | "wins" | "withdrawals" | "history">("flags");
  const [actionNote,     setActionNote]     = useState("");
  const [submitting,     setSubmitting]     = useState(false);
  const [noteOpen,       setNoteOpen]       = useState(false);

  // ── Data loading ─────────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await apiFetch<DashboardData>("/api/admin/fraud/dashboard");
      setDashboard(data);
      setLastRefreshed(new Date());
    } catch (e: any) {
      if (!quiet) toast({ title: "Failed to load fraud dashboard", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  const loadProfile = useCallback(async (userId: number) => {
    setProfileLoading(true);
    setProfile(null);
    try {
      const data = await apiFetch<FraudProfile>(`/api/admin/fraud/users/${userId}/profile`);
      setProfile(data);
    } catch (e: any) {
      toast({ title: "Failed to load profile", description: e.message, variant: "destructive" });
    } finally {
      setProfileLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(() => loadDashboard(true), 60_000);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  useEffect(() => {
    if (selectedUser) {
      loadProfile(selectedUser.userId);
      setActiveTab("flags");
      setActionNote("");
      setNoteOpen(false);
    } else {
      setProfile(null);
    }
  }, [selectedUser, loadProfile]);

  // ── Review actions ───────────────────────────────────────────────────────────
  async function doAction(action: string, extra?: { note?: string; flagId?: number }) {
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      const result = await apiFetch<{ ok: boolean; message: string }>(
        `/api/admin/fraud/users/${selectedUser.userId}/review`,
        {
          method: "POST",
          body: JSON.stringify({ action, note: extra?.note, flagId: extra?.flagId }),
        },
      );
      toast({ title: "Action applied", description: result.message });
      setActionNote("");
      setNoteOpen(false);
      await Promise.all([loadProfile(selectedUser.userId), loadDashboard(true)]);
    } catch (e: any) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Filtered user list ────────────────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    let list = dashboard?.riskyUsers ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        u.inGameName?.toLowerCase().includes(q) ||
        String(u.userId).includes(q) ||
        u.platformId?.toLowerCase().includes(q),
      );
    }
    if (riskFilter !== "all") {
      list = list.filter(u => deriveRiskLevel(u) === riskFilter);
    }
    return list;
  }, [dashboard, search, riskFilter]);

  // ── Loading skeleton ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[100dvh] flex flex-col">
        <PageHeader onBack={() => {}} refreshing={false} lastRefreshed={null} onRefresh={() => {}} />
        <div className="flex-1 p-4 space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const stats = dashboard?.stats;

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        onBack={() => { if (selectedUser) setSelectedUser(null); }}
        showBack={!!selectedUser}
        refreshing={refreshing}
        lastRefreshed={lastRefreshed}
        onRefresh={() => loadDashboard(true)}
      />

      {selectedUser ? (
        /* ─── USER FRAUD PROFILE ──────────────────────────────────────────── */
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* User identity */}
          <div className="glass-card rounded-2xl p-4 border border-white/8">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-heading text-base font-bold text-white truncate">
                  {selectedUser.inGameName ?? `User #${selectedUser.userId}`}
                </p>
                <p className="text-xs text-zinc-500 font-mono">{selectedUser.platformId ?? "No UID"}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <RiskBadge level={deriveRiskLevel(selectedUser)} />
                  {selectedUser.withdrawalBanned && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-red-500/10 border border-red-500/25 text-red-400 rounded-full px-1.5 py-0.5 uppercase">
                      <Lock className="w-2.5 h-2.5" /> Rewards Held
                    </span>
                  )}
                  {selectedUser.walletFrozen && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-blue-500/10 border border-blue-500/25 text-blue-400 rounded-full px-1.5 py-0.5 uppercase">
                      <Lock className="w-2.5 h-2.5" /> Wallet Frozen
                    </span>
                  )}
                  {selectedUser.tournamentBanned && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-orange-500/10 border border-orange-500/25 text-orange-400 rounded-full px-1.5 py-0.5 uppercase">
                      <ShieldAlert className="w-2.5 h-2.5" /> Tourney Banned
                    </span>
                  )}
                </div>
              </div>
              {profile && !profileLoading && (
                <ScoreRing score={profile.trustScore.score} riskLevel={profile.trustScore.riskLevel} />
              )}
              {profileLoading && (
                <div className="w-28 h-28 rounded-full bg-white/5 animate-pulse" />
              )}
            </div>

            {/* Stats row */}
            {profile && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {[
                  { label: "Age", value: `${profile.summary.ageDays}d` },
                  { label: "Flags", value: profile.summary.unresolvedFlagCount },
                  { label: "1st Places", value: profile.summary.firstPlaces },
                  { label: "Fraud %", value: `${profile.trustScore.fraudConfidence}%` },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl bg-white/4 border border-white/6 p-2 text-center">
                    <p className="text-xs font-bold text-white">{value}</p>
                    <p className="text-[9px] text-zinc-500">{label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fraud signals */}
          {profile && profile.trustScore.factors.length > 0 && (
            <div className="glass-card rounded-2xl p-4 border border-white/8">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-3">
                Fraud Signals ({profile.trustScore.factors.length})
              </p>
              <div className="space-y-2">
                {profile.trustScore.factors.map((f, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="w-3 h-3 text-orange-400 shrink-0" />
                      <span className="text-xs text-zinc-300 truncate">{f.detail}</span>
                    </div>
                    <span className="text-xs font-bold text-red-400 shrink-0">{f.impact}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="glass-card rounded-2xl p-4 border border-white/8 space-y-3">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Moderator Actions</p>
            <div className="grid grid-cols-2 gap-2">
              {selectedUser.withdrawalBanned ? (
                <Button
                  size="sm"
                  className="rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs"
                  disabled={submitting}
                  onClick={() => doAction("release_rewards")}
                >
                  <Unlock className="w-3.5 h-3.5 mr-1.5" /> Release Rewards
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="rounded-xl bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 border border-orange-500/30 text-xs"
                  disabled={submitting}
                  onClick={() => doAction("hold_rewards")}
                >
                  <Lock className="w-3.5 h-3.5 mr-1.5" /> Hold Rewards
                </Button>
              )}
              <Button
                size="sm"
                className="rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 text-xs"
                disabled={submitting}
                onClick={() => doAction("clear_all_flags")}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Clear All Flags
              </Button>
              <Button
                size="sm"
                className="rounded-xl bg-violet-500/15 hover:bg-violet-500/25 text-violet-400 border border-violet-500/30 text-xs"
                disabled={submitting}
                onClick={() => doAction("escalate")}
              >
                <Send className="w-3.5 h-3.5 mr-1.5" /> Escalate Case
              </Button>
              <Button
                size="sm"
                className="rounded-xl bg-white/8 hover:bg-white/12 text-zinc-300 border border-white/10 text-xs"
                onClick={() => setNoteOpen(v => !v)}
              >
                <MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Add Note
              </Button>
            </div>
            {noteOpen && (
              <div className="space-y-2">
                <Input
                  className="rounded-xl bg-white/5 border-white/10 text-sm"
                  placeholder="Add a review note…"
                  value={actionNote}
                  onChange={e => setActionNote(e.target.value)}
                />
                <Button
                  size="sm"
                  className="w-full rounded-xl bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 text-xs"
                  disabled={submitting || !actionNote.trim()}
                  onClick={() => doAction("add_note", { note: actionNote })}
                >
                  {submitting ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : null}
                  Save Note
                </Button>
              </div>
            )}
            <Link href={`/users/${profile?.user.phone}/286c81443d1fb388d1b9a8e3b280824c`}>
              <Button size="sm" variant="ghost" className="w-full text-xs text-zinc-500 hover:text-zinc-200">
                <Eye className="w-3.5 h-3.5 mr-1.5" /> Open Full Admin Profile
              </Button>
            </Link>
          </div>

          {/* Detail tabs */}
          <div className="glass-card rounded-2xl border border-white/8 overflow-hidden">
            <div className="flex overflow-x-auto border-b border-white/8">
              {(["flags", "device", "wins", "withdrawals", "history"] as const).map(tab => {
                const icons = { flags: Flag, device: Smartphone, wins: Trophy, withdrawals: Wallet, history: ScrollText };
                const labels = { flags: "Flags", device: "Device/IP", wins: "Wins", withdrawals: "Withdrawals", history: "History" };
                const Icon = icons[tab];
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors ${
                      activeTab === tab ? "text-primary border-b-2 border-primary" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {labels[tab]}
                  </button>
                );
              })}
            </div>

            <div className="p-3 max-h-80 overflow-y-auto">
              {/* Flags tab */}
              {activeTab === "flags" && !profileLoading && (
                <div className="space-y-2">
                  {profile?.flags.filter(f => !f.resolved).length === 0 && (
                    <p className="text-xs text-zinc-500 text-center py-4">No active flags</p>
                  )}
                  {profile?.flags.filter(f => !f.resolved).map(flag => (
                    <div key={flag.id} className={`rounded-xl p-3 border ${
                      flag.severity === "critical" ? "bg-red-500/8 border-red-500/25" :
                      flag.severity === "high"     ? "bg-orange-500/8 border-orange-500/25" :
                                                     "bg-yellow-500/8 border-yellow-500/25"
                    }`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white capitalize">{FLAG_LABELS[flag.type] ?? flag.type.replace(/_/g, " ")}</p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">{formatDistanceToNow(new Date(flag.createdAt), { addSuffix: true })}</p>
                          {flag.details && <p className="text-[10px] text-zinc-400 mt-1 truncate">{flag.details}</p>}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-zinc-500 hover:text-emerald-400 shrink-0"
                          disabled={submitting}
                          onClick={() => doAction("clear_flag", { flagId: flag.id })}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {(profile?.flags.filter(f => f.resolved).length ?? 0) > 0 && (
                    <p className="text-[10px] text-zinc-600 text-center pt-2">
                      + {profile?.flags.filter(f => f.resolved).length} resolved flag(s)
                    </p>
                  )}
                </div>
              )}

              {/* Device tab */}
              {activeTab === "device" && !profileLoading && (
                <div className="space-y-3">
                  {profile?.relatedAccounts && profile.relatedAccounts.length > 0 && (
                    <div className="rounded-xl bg-red-500/8 border border-red-500/25 p-3 mb-3">
                      <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest mb-2">
                        {profile.relatedAccounts.length} Linked Account(s) Detected
                      </p>
                      {profile.relatedAccounts.map((acc, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1 border-t border-white/5 first:border-0">
                          <span className="text-zinc-300 font-semibold">{acc.inGameName ?? `User #${acc.userId}`}</span>
                          <span className="text-[9px] text-zinc-500 uppercase bg-white/5 rounded px-1.5 py-0.5">
                            {acc.matchType === "fingerprint" ? "Same Device" : "Same IP"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {profile?.deviceSessions.map((ds, i) => (
                    <div key={i} className="rounded-xl bg-white/4 border border-white/8 p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-300 font-semibold">{ds.deviceType ?? "Unknown Device"}</span>
                        {ds.isEmulator && (
                          <span className="text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/25 rounded px-1.5 py-0.5 uppercase">Emulator</span>
                        )}
                      </div>
                      <p className="text-zinc-500 font-mono text-[10px] truncate">{ds.ip ?? "No IP"}</p>
                      <p className="text-zinc-600 text-[10px]">Last seen {ds.lastSeenAt ? formatDistanceToNow(new Date(ds.lastSeenAt), { addSuffix: true }) : "–"}</p>
                    </div>
                  ))}
                  {!profile?.deviceSessions.length && <p className="text-xs text-zinc-500 text-center py-4">No device sessions</p>}
                </div>
              )}

              {/* Wins tab */}
              {activeTab === "wins" && !profileLoading && (
                <div className="space-y-2">
                  <p className="text-[10px] text-zinc-500 mb-2">Last 7 days · {profile?.summary.firstPlaces ?? 0} first-place finishes · {profile?.summary.totalDiamondsWon ?? 0} 💎 won</p>
                  {profile?.recentParticipations.map((p, i) => (
                    <div key={i} className={`rounded-xl p-2.5 border ${p.placement === 1 ? "bg-yellow-500/8 border-yellow-500/25" : "bg-white/4 border-white/8"}`}>
                      <div className="flex items-center justify-between text-xs">
                        <span className={p.placement === 1 ? "text-yellow-400 font-bold" : "text-zinc-400"}>
                          {p.placement === 1 ? "🏆 1st Place" : p.placement ? `#${p.placement}` : "No placement"}
                        </span>
                        <span className="text-emerald-400 font-semibold">+{p.diamondsWon ?? 0} 💎</span>
                      </div>
                      <p className="text-[10px] text-zinc-600 mt-0.5">{p.kills ?? 0} kills · {p.createdAt ? formatDistanceToNow(new Date(p.createdAt), { addSuffix: true }) : "–"}</p>
                    </div>
                  ))}
                  {!profile?.recentParticipations.length && <p className="text-xs text-zinc-500 text-center py-4">No recent tournaments</p>}
                </div>
              )}

              {/* Withdrawals tab */}
              {activeTab === "withdrawals" && !profileLoading && (
                <div className="space-y-2">
                  {profile?.recentWithdrawals.map((w, i) => (
                    <div key={i} className="rounded-xl bg-white/4 border border-white/8 p-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white font-semibold">₹{w.rupees}</span>
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          w.status === "paid"     ? "bg-emerald-500/15 text-emerald-400" :
                          w.status === "rejected" ? "bg-red-500/15 text-red-400" :
                                                    "bg-yellow-500/15 text-yellow-400"
                        }`}>{w.status}</span>
                      </div>
                      <p className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate">{w.upiId}</p>
                      <p className="text-[10px] text-zinc-600">{w.createdAt ? formatDistanceToNow(new Date(w.createdAt), { addSuffix: true }) : "–"}</p>
                    </div>
                  ))}
                  {!profile?.recentWithdrawals.length && <p className="text-xs text-zinc-500 text-center py-4">No withdrawal history</p>}
                </div>
              )}

              {/* History tab */}
              {activeTab === "history" && !profileLoading && (
                <div className="space-y-2">
                  {profile?.moderationHistory.map((h, i) => (
                    <div key={i} className="rounded-xl bg-white/4 border border-white/8 p-2.5">
                      <p className="text-xs text-zinc-300 font-semibold capitalize">{h.action.replace(/_/g, " ")}</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-2">{h.details}</p>
                      <p className="text-[10px] text-zinc-600">{h.createdAt ? formatDistanceToNow(new Date(h.createdAt), { addSuffix: true }) : "–"}</p>
                    </div>
                  ))}
                  {!profile?.moderationHistory.length && <p className="text-xs text-zinc-500 text-center py-4">No moderation history</p>}
                </div>
              )}

              {profileLoading && (
                <div className="space-y-2 py-2">
                  {[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded-xl bg-white/5 animate-pulse" />)}
                </div>
              )}
            </div>
          </div>
        </div>

      ) : (
        /* ─── DASHBOARD VIEW ──────────────────────────────────────────────── */
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Flagged Users", value: stats?.flaggedUsers ?? 0, color: "text-white",         icon: Users         },
              { label: "Critical",      value: stats?.critical     ?? 0, color: "text-red-400",       icon: AlertOctagon  },
              { label: "High Risk",     value: stats?.high         ?? 0, color: "text-orange-400",    icon: AlertTriangle },
              { label: "Medium Risk",   value: stats?.medium       ?? 0, color: "text-yellow-400",    icon: TriangleAlert },
              { label: "Pending",       value: stats?.pending      ?? 0, color: "text-zinc-300",      icon: Clock         },
              { label: "Today",         value: stats?.alertsToday  ?? 0, color: "text-primary",       icon: Activity      },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="glass-card rounded-2xl p-3 border border-white/8 text-center">
                <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
                <p className={`text-lg font-black ${color}`}>{value}</p>
                <p className="text-[9px] text-zinc-500 uppercase tracking-wider">{label}</p>
              </div>
            ))}
          </div>

          {/* Recent alerts accordion */}
          <div className="glass-card rounded-2xl border border-white/8 overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-3.5 text-left"
              onClick={() => setAlertsOpen(v => !v)}
            >
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold text-white">Live Alerts</span>
                {(stats?.alertsToday ?? 0) > 0 && (
                  <span className="text-[10px] font-bold bg-primary/15 border border-primary/30 text-primary rounded-full px-2 py-0.5">
                    {stats?.alertsToday} today
                  </span>
                )}
              </div>
              {alertsOpen ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
            </button>

            {alertsOpen && (
              <div className="border-t border-white/8 max-h-64 overflow-y-auto">
                {(dashboard?.recentAlerts ?? []).length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-6">No alerts in the last 24 hours</p>
                ) : (
                  (dashboard?.recentAlerts ?? []).map(alert => (
                    <div
                      key={alert.id}
                      className="flex items-center gap-3 px-3.5 py-2.5 border-t border-white/5 first:border-0 cursor-pointer hover:bg-white/4 transition-colors"
                      onClick={() => {
                        const u = dashboard?.riskyUsers.find(u => u.userId === alert.userId);
                        if (u) setSelectedUser(u);
                      }}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        alert.severity === "critical" ? "bg-red-400" :
                        alert.severity === "high"     ? "bg-orange-400" : "bg-yellow-400"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white font-semibold truncate">
                          {alert.inGameName ?? `User #${alert.userId}`} — {FLAG_LABELS[alert.type] ?? alert.type}
                        </p>
                        <p className="text-[10px] text-zinc-500">{formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}</p>
                      </div>
                      <span className={`text-[9px] font-bold uppercase shrink-0 ${
                        alert.severity === "critical" ? "text-red-400" :
                        alert.severity === "high"     ? "text-orange-400" : "text-yellow-400"
                      }`}>{alert.severity}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Search + filter */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <Input
                className="pl-8 rounded-xl bg-white/5 border-white/10 text-sm h-9"
                placeholder="Search by name, UID, ID…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {(["all", "critical", "high", "medium", "low"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setRiskFilter(f)}
                  className={`shrink-0 text-[10px] font-bold uppercase tracking-wider rounded-full px-2.5 py-1 border transition-colors ${
                    riskFilter === f
                      ? (f === "all" ? "bg-white/15 border-white/20 text-white" : `${RISK_CONFIG[f as RiskLevel]?.bg ?? ""} ${RISK_CONFIG[f as RiskLevel]?.border ?? ""} ${RISK_CONFIG[f as RiskLevel]?.color ?? ""}`)
                      : "bg-transparent border-white/10 text-zinc-500 hover:border-white/20"
                  }`}
                >
                  {f === "all" ? `All (${dashboard?.riskyUsers.length ?? 0})` : f}
                </button>
              ))}
            </div>
          </div>

          {/* Flagged users list */}
          <div className="glass-card rounded-2xl border border-white/8 overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-white/8 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-300">
                {filteredUsers.length} {riskFilter !== "all" ? riskFilter : "flagged"} user{filteredUsers.length !== 1 ? "s" : ""}
              </span>
              <Shield className="w-3.5 h-3.5 text-zinc-600" />
            </div>

            {filteredUsers.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-8">No users match the current filter</p>
            ) : (
              <div className="divide-y divide-white/5">
                {filteredUsers.map(u => {
                  const risk = deriveRiskLevel(u);
                  const conf = fraudConfidence(u);
                  return (
                    <button
                      key={u.userId}
                      onClick={() => setSelectedUser(u)}
                      className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-white/4 active:bg-white/6 transition-colors"
                    >
                      {/* Risk dot */}
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${RISK_CONFIG[risk].dot}`} />

                      {/* User info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-sm font-bold text-white truncate">
                            {u.inGameName ?? `User #${u.userId}`}
                          </span>
                          <RiskBadge level={risk} small />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-zinc-500">{u.unresolvedFlags} flag{u.unresolvedFlags !== 1 ? "s" : ""}</span>
                          {u.flagTypes?.slice(0, 2).map((t, i) => <FlagTypePill key={i} type={t} />)}
                          {(u.flagTypes?.length ?? 0) > 2 && (
                            <span className="text-[9px] text-zinc-600">+{(u.flagTypes?.length ?? 0) - 2}</span>
                          )}
                        </div>
                      </div>

                      {/* Confidence + last flagged */}
                      <div className="shrink-0 text-right">
                        <p className={`text-xs font-black ${RISK_CONFIG[risk].color}`}>{conf}%</p>
                        <p className="text-[9px] text-zinc-600">{u.lastFlaggedAt ? formatDistanceToNow(new Date(u.lastFlaggedAt), { addSuffix: true }) : "–"}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <p className="text-[10px] text-zinc-600 text-center pb-4">
            Auto-refreshes every 60 seconds · Tap a user to open fraud profile
          </p>
        </div>
      )}
    </div>
  );
}

// ── Page Header ───────────────────────────────────────────────────────────────
function PageHeader({
  onBack, showBack, refreshing, lastRefreshed, onRefresh,
}: {
  onBack: () => void;
  showBack?: boolean;
  refreshing: boolean;
  lastRefreshed: Date | null;
  onRefresh: () => void;
}) {
  return (
    <div className="glass-panel p-4 flex items-center gap-3 sticky top-0 z-50">
      {showBack ? (
        <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
      ) : (
        <Link href="/admin">
          <button className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/8 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
          <h1 className="font-heading text-base font-bold text-white tracking-wide truncate">FRAUD MONITOR</h1>
        </div>
        {lastRefreshed && (
          <p className="text-[9px] text-zinc-600">Updated {formatDistanceToNow(lastRefreshed, { addSuffix: true })}</p>
        )}
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/8 transition-colors disabled:opacity-40"
      >
        <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}
