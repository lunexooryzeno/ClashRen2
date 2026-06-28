import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  Shield, LogOut, Settings, CreditCard, ChevronLeft,
  Loader2, CheckCircle2, Clock, Ban,
  TrendingUp, Gem, IndianRupee, RefreshCw, Check, Copy,
  AlertTriangle, X, ArrowUpRight, Banknote, Package,
  Plus, Trash2, TriangleAlert, Hash, Search, Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const REQUIRED_UC = "a464dfd00a173f6e10ac6a4774c62f52";
const SESSION_KEY = "czsa_v1_session";

interface SASession { token: string; expiresAt: number; }
function getSession(): SASession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SASession;
    if (Date.now() > s.expiresAt) { localStorage.removeItem(SESSION_KEY); return null; }
    return s;
  } catch { return null; }
}
async function saFetch(path: string, opts?: RequestInit): Promise<Response> {
  const session = getSession();
  if (!session) {
    const fakeRes = new Response(JSON.stringify({ error: "No session" }), { status: 401 });
    return fakeRes;
  }
  return fetch(`/api${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      "x-super-admin-token": session.token,
      ...(opts?.headers ?? {}),
    },
  });
}

interface GatewayAlert { message: string; at: string; }
interface PaymentSettings {
  upiId: string; upiName: string; ratePerDiamond: number;
  minTopup: number; minWithdrawal: number; maxWithdrawal: number; isEnabled: boolean; withdrawalEnabled: boolean;
  withdrawalPaused: boolean; withdrawalPauseMessage: string;
  withdrawalWindowEnabled: boolean; withdrawalWindowStart: string; withdrawalWindowEnd: string;
  withdrawalProcessingNote: string;
  xsrfToken: string; bharatpeSession: string;
  bharatpeToken: string; bharatpeMerchantId: string;
  gatewayAlert: GatewayAlert | null;
  webhookUrl: string;
  webhookSecret: string;
}
interface TopupRequest {
  id: number; userId: number; rupees: number; diamonds: number;
  utr: string; status: "pending" | "verified" | "rejected";
  phone: string | null; inGameName: string | null;
  createdAt: string; verifiedAt: string | null;
  rejectedAt: string | null; rejectedReason: string | null;
  bharatpeData: unknown;
}
interface WithdrawalAdminRecord {
  id: number; userId: number; rupees: number; diamondsRedeemed: number;
  upiId: string; status: string; rejectedReason: string | null;
  createdAt: string; paidAt: string | null; rejectedAt: string | null;
  phone: string | null; inGameName: string | null;
}
interface GraphPoint { date: string; count: number; rupees: number; diamonds: number; }
interface Stats { total: number; totalRupees: number; totalDiamonds: number; }

// ── Tiny bar chart ──────────────────────────────────────────────────────────
function BarChart({ points, mode }: { points: GraphPoint[]; mode: "7d" | "30d" | "12w" }) {
  const maxRupees = Math.max(...points.map(p => p.rupees), 1);
  const fmtLabel = (iso: string) => {
    const d = new Date(iso);
    if (mode === "12w") return `W${Math.ceil(d.getDate() / 7)} ${d.toLocaleDateString("en-IN", { month: "short" })}`;
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  };

  if (points.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2">
        <TrendingUp className="w-8 h-8 text-zinc-700" />
        <p className="text-xs text-zinc-600">No verified transactions in this range</p>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-1 h-36 px-1" style={{ overflowX: "auto" }}>
      {points.map((p, i) => {
        const pct = p.rupees / maxRupees;
        const h = Math.max(pct * 100, p.rupees > 0 ? 8 : 2);
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-[28px]"
            style={{ animation: `pay-slide-up 0.4s ${i * 0.04}s ease both`, opacity: 0, animationFillMode: "both" }}>
            <div className="text-[8px] text-zinc-500 font-mono">
              {p.rupees > 0 ? `₹${p.rupees}` : ""}
            </div>
            <div className="w-full rounded-t-lg transition-all relative group"
              style={{
                height: `${h}%`,
                background: p.rupees > 0
                  ? "linear-gradient(180deg, rgba(234,88,12,0.9) 0%, rgba(239,68,68,0.5) 100%)"
                  : "rgba(255,255,255,0.06)",
                minHeight: "4px",
                boxShadow: p.rupees > 0 ? "0 0 12px rgba(234,88,12,0.3)" : "none",
              }}>
              {p.rupees > 0 && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-[8px] px-1.5 py-0.5 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {p.count} txn · ₹{p.rupees}
                </div>
              )}
            </div>
            <div className="text-[7px] text-zinc-600 text-center leading-tight">{fmtLabel(p.date)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function PaymentAdminPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [session, setSession] = useState<SASession | null>(null);
  const [view, setView] = useState<"home" | "transactions" | "settings" | "diamond-stock">("home");
  const [mounted, setMounted] = useState(false);

  const uc = new URLSearchParams(window.location.search).get("uc");
  if (uc !== null && uc !== REQUIRED_UC) {
    return <div className="min-h-[100dvh] flex items-center justify-center">
      <p className="text-destructive font-bold">Access Denied</p>
    </div>;
  }

  useEffect(() => {
    setSession(getSession());
    setTimeout(() => setMounted(true), 40);
  }, []);

  if (!session) {
    return <div className="min-h-[100dvh] flex items-center justify-center p-6">
      <div className="text-center">
        <Shield className="w-12 h-12 text-primary mx-auto mb-4" />
        <p className="text-white font-bold text-lg mb-2">Super Admin Session Required</p>
        <p className="text-zinc-400 text-sm mb-4">Please log in via the Super Admin panel first.</p>
        <button onClick={() => setLocation(`/286c81443d1fb388d1b9a8e3b280824c`)}
          className="px-5 py-2.5 rounded-xl text-white font-bold text-sm"
          style={{ background: "linear-gradient(135deg, rgba(234,88,12,0.9), rgba(239,68,68,0.7))" }}>
          Go to Super Admin
        </button>
      </div>
    </div>;
  }

  return (
    <div className="min-h-[100dvh] flex flex-col profile-page-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-white/5"
        style={{ animation: mounted ? "pay-slide-up 0.35s ease both" : "none" }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => view === "home"
              ? setLocation(`/286c81443d1fb388d1b9a8e3b280824c`)
              : setView("home")}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </button>
          <div>
            <h1 className="font-bold text-white text-base leading-tight">Payment Management</h1>
            <p className="text-[10px] text-orange-400 uppercase tracking-widest font-bold">
              {view === "home" ? "Super Admin" : view === "transactions" ? "All Transactions" : view === "withdrawals" ? "Withdrawals" : view === "diamond-stock" ? "Diamond Stock" : "Settings"}
            </p>
          </div>
        </div>
        <button onClick={() => { localStorage.removeItem(SESSION_KEY); setSession(null); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold text-zinc-400"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <LogOut className="w-3.5 h-3.5" /> Logout
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {view === "home" && <HomeView setView={setView} mounted={mounted} onNavigate={(path) => setLocation(path)} />}
        {view === "transactions" && <TransactionsView toast={toast} />}
        {view === "withdrawals" && <WithdrawalsView toast={toast} />}
        {view === "settings" && <SettingsView toast={toast} />}
        {view === "diamond-stock" && <DiamondStockView toast={toast} />}
      </div>
    </div>
  );
}

// ── Home view ───────────────────────────────────────────────────────────────
function HomeView({ setView, mounted, onNavigate }: { setView: (v: "transactions" | "withdrawals" | "settings" | "diamond-stock") => void; mounted: boolean; onNavigate: (path: string) => void }) {
  const cards = [
    {
      key: "transactions" as const,
      icon: TrendingUp,
      label: "All User\nTransactions",
      desc: "Revenue graph & transaction history",
      color: "rgba(234,88,12,0.12)",
      border: "rgba(234,88,12,0.25)",
      iconColor: "text-orange-400",
      glow: "rgba(234,88,12,0.3)",
    },
    {
      key: "withdrawals" as const,
      icon: Banknote,
      label: "Withdrawal\nRequests",
      desc: "Approve or reject user withdrawals",
      color: "rgba(16,185,129,0.1)",
      border: "rgba(16,185,129,0.25)",
      iconColor: "text-emerald-400",
      glow: "rgba(16,185,129,0.2)",
    },
    {
      key: "diamond-stock" as const,
      icon: Package,
      label: "Diamond\nStock",
      desc: "Inventory audit & suspicious alerts",
      color: "rgba(56,189,248,0.1)",
      border: "rgba(56,189,248,0.25)",
      iconColor: "text-sky-400",
      glow: "rgba(56,189,248,0.2)",
    },
    {
      key: "settings" as const,
      icon: Settings,
      label: "Payment\nSettings",
      desc: "UPI config & BharatPe credentials",
      color: "rgba(139,92,246,0.1)",
      border: "rgba(139,92,246,0.25)",
      iconColor: "text-violet-400",
      glow: "rgba(139,92,246,0.2)",
    },
  ];

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <button key={c.key} onClick={() => setView(c.key)}
              className="flex flex-col items-center gap-3 p-5 rounded-3xl text-center transition-all hover:scale-[1.02] active:scale-[0.97]"
              style={{
                background: c.color,
                border: `1px solid ${c.border}`,
                boxShadow: `0 8px 32px ${c.glow}`,
                animation: mounted ? `pay-slide-up 0.4s ${0.05 + i * 0.08}s ease both` : "none",
                opacity: 0,
              }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <Icon className={`w-7 h-7 ${c.iconColor}`} />
              </div>
              <div>
                <p className="text-sm font-bold text-white whitespace-pre-line leading-tight">{c.label}</p>
                <p className="text-[10px] text-zinc-500 mt-1 leading-tight">{c.desc}</p>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-bold"
                style={{ color: c.border }}>
                Open <ArrowUpRight className="w-3 h-3" />
              </div>
            </button>
          );
        })}
      </div>

      {/* UTR Transactions — full-width card */}
      <button
        onClick={() => onNavigate("/286c81443d1fb388d1b9a8e3b280824c/utr-transactions")}
        className="flex items-center gap-4 px-5 py-4 rounded-3xl text-left transition-all hover:scale-[1.01] active:scale-[0.98] w-full"
        style={{
          background: "rgba(16,185,129,0.08)",
          border: "1px solid rgba(16,185,129,0.22)",
          boxShadow: "0 8px 32px rgba(16,185,129,0.12)",
          animation: mounted ? `pay-slide-up 0.4s 0.37s ease both` : "none",
          opacity: 0,
        }}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <Hash className="w-6 h-6 text-emerald-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-white leading-tight">UTR Transactions</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">All approved top-up records · delete entries · view user profiles</p>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
          Open <ArrowUpRight className="w-3 h-3" />
        </div>
      </button>
    </div>
  );
}

// ── Transactions view ───────────────────────────────────────────────────────
function TransactionsView({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [range, setRange] = useState<"7d" | "30d" | "12w">("7d");
  const [graphData, setGraphData] = useState<GraphPoint[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, totalRupees: 0, totalDiamonds: 0 });
  const [requests, setRequests] = useState<TopupRequest[]>([]);
  const [loadingGraph, setLoadingGraph] = useState(true);
  const [loadingList, setLoadingList] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const hasFetchedList = useRef(false);

  const loadGraph = useCallback(async (r: string) => {
    setLoadingGraph(true);
    try {
      const res = await saFetch(`/super-admin/topup-stats?range=${r}`);
      if (res.status === 401 || res.status === 403) return;
      if (res.ok) {
        const data = await res.json();
        setGraphData(data.points ?? []);
        setStats(data.summary ?? { total: 0, totalRupees: 0, totalDiamonds: 0 });
      }
    } finally { setLoadingGraph(false); }
  }, []);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await saFetch("/super-admin/topup-requests");
      if (res.status === 401 || res.status === 403) return;
      if (res.ok) setRequests(await res.json());
    } finally { setLoadingList(false); }
  }, []);

  useEffect(() => { loadGraph(range); }, [range, loadGraph]);
  useEffect(() => {
    if (!hasFetchedList.current) { hasFetchedList.current = true; loadList(); }
  }, [loadList]);

  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const statusColor = (s: string) =>
    s === "verified" ? "rgba(16,185,129,0.25)" : s === "rejected" ? "rgba(239,68,68,0.2)" : "rgba(234,88,12,0.2)";
  const StatusIcon = ({ s }: { s: string }) =>
    s === "verified" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> :
    s === "rejected" ? <Ban className="w-3.5 h-3.5 text-red-400 shrink-0" /> :
    <Clock className="w-3.5 h-3.5 text-orange-400 shrink-0" />;

  return (
    <div className="px-4 py-4 flex flex-col gap-4">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2"
        style={{ animation: "pay-slide-up 0.35s ease both" }}>
        {[
          { label: "Transactions", val: stats.total, icon: <TrendingUp className="w-3.5 h-3.5 text-orange-400" /> },
          { label: "Revenue", val: `₹${stats.totalRupees}`, icon: <IndianRupee className="w-3.5 h-3.5 text-emerald-400" /> },
          { label: "Diamonds", val: stats.totalDiamonds, icon: <Gem className="w-3.5 h-3.5 text-cyan-400" /> },
        ].map((s, i) => (
          <div key={i} className="rounded-2xl p-3 flex flex-col gap-1"
            style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-1">{s.icon}<span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">{s.label}</span></div>
            <p className="text-base font-black text-white">{s.val}</p>
          </div>
        ))}
      </div>

      {/* Graph card */}
      <div className="rounded-3xl overflow-hidden"
        style={{
          background: "hsl(var(--card))",
          border: "1px solid rgba(255,255,255,0.07)",
          animation: "pay-slide-up 0.4s 0.06s ease both",
          opacity: 0,
        }}>
        <div className="px-4 pt-3 pb-2 flex items-center justify-between"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Revenue</span>
          </div>
          <div className="flex gap-1">
            {(["7d", "30d", "12w"] as const).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
                style={{
                  background: range === r ? "rgba(234,88,12,0.2)" : "rgba(255,255,255,0.04)",
                  border: range === r ? "1px solid rgba(234,88,12,0.4)" : "1px solid rgba(255,255,255,0.07)",
                  color: range === r ? "rgb(251,146,60)" : "rgba(255,255,255,0.4)",
                }}>{r}</button>
            ))}
          </div>
        </div>
        <div className="px-2 py-3">
          {loadingGraph
            ? <div className="flex justify-center items-center h-36"><Loader2 className="w-5 h-5 animate-spin text-orange-400" /></div>
            : <BarChart points={graphData} mode={range} />}
        </div>
      </div>

      {/* Transaction list */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">All Transactions</p>
        <button onClick={loadList} className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.05)" }}>
          <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${loadingList ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loadingList ? (
        <div className="flex flex-col gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 text-zinc-600 text-sm">No transactions yet</div>
      ) : (
        <div className="flex flex-col gap-2 pb-8">
          {requests.map((req, i) => (
            <div key={req.id}
              className="rounded-2xl overflow-hidden"
              style={{
                background: "hsl(var(--card))",
                border: `1px solid ${statusColor(req.status)}`,
                animation: `pay-slide-up 0.35s ${i * 0.03}s ease both`,
                opacity: 0,
              }}>
              <div className="px-3 py-2.5 flex items-center gap-2">
                <StatusIcon s={req.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{req.inGameName ?? req.phone ?? `User #${req.userId}`}</p>
                  <p className="text-[9px] text-zinc-600 font-mono">{fmt(req.createdAt)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-white">₹{req.rupees}</p>
                  <p className="text-[9px] text-cyan-400">{req.diamonds}💎</p>
                </div>
              </div>
              <div className="px-3 pb-2 flex items-center justify-between">
                <span className="text-[9px] font-mono text-zinc-500">UTR: {req.utr}</span>
                {req.bharatpeData && (
                  <button onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                    className="text-[9px] text-zinc-600 hover:text-zinc-400 transition-colors">
                    {expandedId === req.id ? "hide" : "show"} API
                  </button>
                )}
              </div>
              {expandedId === req.id && req.bharatpeData && (
                <pre className="mx-3 mb-2 text-[8px] text-zinc-400 bg-white/5 rounded-xl p-2 overflow-x-auto">
                  {JSON.stringify(req.bharatpeData, null, 2)}
                </pre>
              )}
              {req.status === "rejected" && req.rejectedReason && (
                <p className="px-3 pb-2 text-[9px] text-red-400">Reason: {req.rejectedReason}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Withdrawals view ─────────────────────────────────────────────────────────
function DepositWithdrawalPermission({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<{ id: number; phone: string; inGameName: string | null; allowDepositWithdrawal: boolean } | null>(null);
  const [toggling, setToggling] = useState(false);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setResult(null);
    try {
      const res = await saFetch(`/admin/users?phone=${encodeURIComponent(q)}`);
      if (!res.ok) { toast({ title: "User not found", variant: "destructive" }); return; }
      const users = await res.json() as Array<{ id: number; phone: string; inGameName: string | null; allowDepositWithdrawal: boolean }>;
      const found = users.find((u) => u.phone === q || String(u.id) === q);
      if (!found) { toast({ title: "User not found", variant: "destructive" }); return; }
      setResult(found);
    } catch { toast({ title: "Error", description: "Search failed", variant: "destructive" }); }
    finally { setSearching(false); }
  };

  const toggle = async () => {
    if (!result) return;
    setToggling(true);
    try {
      const newVal = !result.allowDepositWithdrawal;
      const res = await saFetch(`/admin/users/${result.id}/wallet/allow-deposit-withdrawal`, {
        method: "POST",
        body: JSON.stringify({ allow: newVal }),
      });
      if (res.ok) {
        setResult(prev => prev ? { ...prev, allowDepositWithdrawal: newVal } : prev);
        toast({ title: newVal ? "Deposit withdrawal allowed" : "Permission revoked", description: newVal ? `${result.inGameName ?? result.phone} can now withdraw their deposit balance.` : `Deposit withdrawal permission removed.` });
      } else {
        const e = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: "Failed", description: e.error ?? "Error", variant: "destructive" });
      }
    } finally { setToggling(false); }
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <Gem className="w-4 h-4 text-blue-400" />
        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Deposit Withdrawal Permission</span>
      </div>
      <div className="px-4 pb-3 flex flex-col gap-2">
        <p className="text-[11px] text-zinc-500">Search a user by phone number to grant or revoke permission to withdraw their top-up (deposit) balance.</p>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && search()}
            placeholder="Phone number…"
            className="flex-1 rounded-xl px-3 py-2 text-xs text-white outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          />
          <button onClick={search} disabled={searching}
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-50"
            style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)" }}>
            {searching ? <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" /> : <Search className="w-3.5 h-3.5 text-blue-400" />}
          </button>
        </div>
        {result && (
          <div className="rounded-xl px-3 py-2.5 flex items-center justify-between gap-3"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div>
              <p className="text-xs font-bold text-white">{result.inGameName ?? result.phone}</p>
              <p className="text-[10px] text-zinc-500">{result.phone} · ID {result.id}</p>
              <p className={`text-[10px] font-bold mt-0.5 ${result.allowDepositWithdrawal ? "text-emerald-400" : "text-zinc-500"}`}>
                {result.allowDepositWithdrawal ? "✓ Deposit withdrawal allowed" : "✗ Not allowed"}
              </p>
            </div>
            <button onClick={toggle} disabled={toggling}
              className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-50 transition-all"
              style={result.allowDepositWithdrawal
                ? { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }
                : { background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#34d399" }}>
              {toggling ? "…" : result.allowDepositWithdrawal ? "Revoke" : "Allow"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function WithdrawalsView({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [all, setAll] = useState<WithdrawalAdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectInput, setRejectInput] = useState("");
  const [acting, setActing] = useState<number | null>(null);
  const hasFetched = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await saFetch("/admin/withdrawals");
      if (res.ok) setAll(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!hasFetched.current) { hasFetched.current = true; load(); }
  }, [load]);

  const rows = filter === "pending" ? all.filter(r => r.status === "pending") : all;
  const pendingCount = all.filter(r => r.status === "pending").length;
  const pendingRupees = all.filter(r => r.status === "pending").reduce((s, r) => s + r.rupees, 0);

  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const pay = async (id: number) => {
    setActing(id);
    try {
      const res = await saFetch(`/admin/withdrawals/${id}/pay`, { method: "PATCH" });
      if (res.ok) {
        setAll(prev => prev.map(r => r.id === id ? { ...r, status: "paid", paidAt: new Date().toISOString() } : r));
        toast({ title: "Marked as paid", description: "User has been notified." });
      } else {
        const e = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: "Failed", description: e.error ?? "Error", variant: "destructive" });
      }
    } finally { setActing(null); }
  };

  const reject = async (id: number) => {
    if (!rejectInput.trim()) { toast({ title: "Rejection reason required", variant: "destructive" }); return; }
    setActing(id);
    try {
      const res = await saFetch(`/admin/withdrawals/${id}/reject`, { method: "PATCH", body: JSON.stringify({ reason: rejectInput.trim() }) });
      if (res.ok) {
        setAll(prev => prev.map(r => r.id === id ? { ...r, status: "rejected", rejectedAt: new Date().toISOString(), rejectedReason: rejectInput.trim() } : r));
        setRejectingId(null);
        setRejectInput("");
        toast({ title: "Rejected", description: "Diamonds refunded to user." });
      } else {
        const e = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: "Failed", description: e.error ?? "Error", variant: "destructive" });
      }
    } finally { setActing(null); }
  };

  const statusBg = (s: string) =>
    s === "paid" ? "rgba(16,185,129,0.1)" : s === "rejected" ? "rgba(239,68,68,0.08)" : "rgba(234,88,12,0.08)";
  const statusBorder = (s: string) =>
    s === "paid" ? "rgba(16,185,129,0.25)" : s === "rejected" ? "rgba(239,68,68,0.2)" : "rgba(234,88,12,0.2)";
  const StatusIcon = ({ s }: { s: string }) =>
    s === "paid" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> :
    s === "rejected" ? <Ban className="w-3.5 h-3.5 text-red-400 shrink-0" /> :
    <Clock className="w-3.5 h-3.5 text-orange-400 shrink-0" />;

  return (
    <div className="px-4 py-4 flex flex-col gap-4 pb-24">
      <DepositWithdrawalPermission toast={toast} />

      <div className="grid grid-cols-2 gap-2" style={{ animation: "pay-slide-up 0.35s ease both" }}>
        <div className="rounded-2xl p-3 flex flex-col gap-1"
          style={{ background: "hsl(var(--card))", border: "1px solid rgba(234,88,12,0.2)" }}>
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Pending</span>
          </div>
          <p className="text-xl font-black text-white">{pendingCount}</p>
          <p className="text-[10px] text-zinc-500">₹{pendingRupees} total</p>
        </div>
        <div className="rounded-2xl p-3 flex flex-col gap-1"
          style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-1">
            <Banknote className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Paid Out</span>
          </div>
          <p className="text-xl font-black text-white">₹{all.filter(r => r.status === "paid").reduce((s, r) => s + r.rupees, 0)}</p>
          <p className="text-[10px] text-zinc-500">{all.filter(r => r.status === "paid").length} requests</p>
        </div>
      </div>

      <div className="flex gap-2">
        {(["pending", "all"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="flex-1 py-2 rounded-xl text-xs font-bold transition-all capitalize"
            style={filter === f
              ? { background: "rgba(234,88,12,0.2)", border: "1px solid rgba(234,88,12,0.4)", color: "#f97316" }
              : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
            {f === "pending" ? `Pending (${pendingCount})` : `All (${all.length})`}
          </button>
        ))}
        <button onClick={() => { hasFetched.current = false; load(); }} disabled={loading}
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
          ))}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 gap-2">
          <Banknote className="w-10 h-10 text-zinc-700" />
          <p className="text-zinc-500 text-sm font-medium">
            {filter === "pending" ? "No pending withdrawals" : "No withdrawals yet"}
          </p>
        </div>
      )}

      {!loading && rows.map((wd, i) => (
        <div key={wd.id} className="rounded-2xl overflow-hidden"
          style={{
            background: statusBg(wd.status),
            border: `1px solid ${statusBorder(wd.status)}`,
            animation: `pay-slide-up 0.3s ${i * 0.04}s ease both`,
            opacity: 0,
          }}>
          <div className="px-4 py-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <StatusIcon s={wd.status} />
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{wd.status}</span>
              </div>
              <span className="text-base font-extrabold text-white">₹{wd.rupees}</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-white">{wd.inGameName ?? wd.phone ?? `User #${wd.userId}`}</p>
                <p className="text-[10px] text-zinc-500">{wd.phone}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold text-orange-300">{wd.upiId}</p>
                <p className="text-[9px] text-zinc-600">{wd.diamondsRedeemed} diamonds</p>
              </div>
            </div>
            <p className="text-[9px] text-zinc-600">{fmt(wd.createdAt)}</p>
            {wd.status === "rejected" && wd.rejectedReason && (
              <p className="text-[10px] text-red-400">Reason: {wd.rejectedReason}</p>
            )}
            {wd.status === "pending" && (
              rejectingId === wd.id ? (
                <div className="flex flex-col gap-2 pt-1">
                  <input
                    value={rejectInput}
                    onChange={e => setRejectInput(e.target.value)}
                    placeholder="Rejection reason..."
                    className="rounded-xl px-3 py-2 text-xs text-white outline-none"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(239,68,68,0.3)" }}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => { setRejectingId(null); setRejectInput(""); }}
                      className="flex-1 py-2 rounded-xl text-xs font-bold text-zinc-400"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                      Cancel
                    </button>
                    <button onClick={() => reject(wd.id)} disabled={acting === wd.id}
                      className="flex-1 py-2 rounded-xl text-xs font-bold text-red-300 disabled:opacity-50"
                      style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}>
                      {acting === wd.id ? "Rejecting…" : "Confirm Reject"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => pay(wd.id)} disabled={acting === wd.id}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold text-emerald-300 active:scale-[0.98] transition-all disabled:opacity-50"
                    style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)" }}>
                    {acting === wd.id ? "Processing…" : "Mark Paid"}
                  </button>
                  <button onClick={() => setRejectingId(wd.id)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold text-red-400 active:scale-[0.98] transition-all"
                    style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                    Reject
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Settings view ────────────────────────────────────────────────────────────
function SettingsView({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const emptyForm: PaymentSettings = {
    upiId: "", upiName: "", ratePerDiamond: 0.5, minTopup: 20, minWithdrawal: 20, maxWithdrawal: 0,
    isEnabled: true, withdrawalEnabled: false,
    withdrawalPaused: false, withdrawalPauseMessage: "",
    withdrawalWindowEnabled: false, withdrawalWindowStart: "10:00", withdrawalWindowEnd: "22:00",
    withdrawalProcessingNote: "",
    xsrfToken: "", bharatpeSession: "",
    bharatpeToken: "", bharatpeMerchantId: "69893818",
    gatewayAlert: null, webhookUrl: "", webhookSecret: "",
  };
  const [form, setForm] = useState<PaymentSettings>(emptyForm);
  const [saved, setSaved] = useState<PaymentSettings>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await saFetch("/super-admin/payment-settings");
      if (r.ok) {
        const data = await r.json();
        setForm(data);
        setSaved(data);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(saved);

  const save = async () => {
    setSaving(true);
    try {
      const r = await saFetch("/super-admin/payment-settings", { method: "PUT", body: JSON.stringify(form) });
      if (r.ok) {
        setSaved({ ...form });
        toast({ title: "Settings saved", description: "All payment settings updated successfully." });
      } else {
        toast({ title: "Save failed", description: "Could not update settings.", variant: "destructive" });
      }
    } finally { setSaving(false); }
  };

  const discard = () => setForm({ ...saved });

  const dismissAlert = async () => {
    const next = { ...form, gatewayAlert: null };
    setForm(next);
    setSaved(next);
    await saFetch("/super-admin/payment-settings", { method: "PUT", body: JSON.stringify(next) });
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" }}>
        <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
      </div>
      <p className="text-xs text-zinc-600">Loading settings...</p>
    </div>
  );

  const inputCls = "w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none transition-all focus:ring-1 focus:ring-violet-500/30";
  const inputStyle = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" };

  return (
    <div className="px-4 py-5 flex flex-col gap-4 pb-32">

      {/* Gateway alert */}
      {form.gatewayAlert && (
        <div className="rounded-2xl px-4 py-3.5 flex items-start gap-3"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", animation: "pay-slide-up 0.3s ease both" }}>
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-red-300">Gateway Alert</p>
            <p className="text-[10px] text-red-300/75 leading-relaxed mt-0.5">{form.gatewayAlert.message}</p>
            <p className="text-[9px] text-red-500/50 mt-1">{new Date(form.gatewayAlert.at).toLocaleString("en-IN")}</p>
          </div>
          <button onClick={dismissAlert}
            className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors shrink-0">
            <X className="w-3.5 h-3.5 text-red-400" />
          </button>
        </div>
      )}

      {/* ── UPI Settings card ── */}
      <div className="rounded-3xl overflow-hidden"
        style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(139,92,246,0.18)", backdropFilter: "blur(12px)", animation: "pay-slide-up 0.35s ease both" }}>
        <div className="px-4 py-3 flex items-center gap-2.5"
          style={{ background: "rgba(139,92,246,0.08)", borderBottom: "1px solid rgba(139,92,246,0.12)" }}>
          <div className="w-7 h-7 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.25)" }}>
            <CreditCard className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <div>
            <p className="text-xs font-bold text-white">UPI Settings</p>
            <p className="text-[9px] text-zinc-500">Payment receiver details</p>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-bold">UPI ID</label>
            <input type="text" value={form.upiId} placeholder="e.g. 9012345678@okbizaxis"
              onChange={e => setForm(f => ({ ...f, upiId: e.target.value }))}
              className={inputCls + " font-mono text-xs"} style={inputStyle} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-bold">UPI Name</label>
            <input type="text" value={form.upiName} placeholder="e.g. Clash Ren"
              onChange={e => setForm(f => ({ ...f, upiName: e.target.value }))}
              className={inputCls} style={inputStyle} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-bold">Rate / Diamond (₹)</label>
              <input type="number" value={form.ratePerDiamond} placeholder="0.50" step="0.01"
                onChange={e => setForm(f => ({ ...f, ratePerDiamond: parseFloat(e.target.value) || 0 }))}
                className={inputCls} style={inputStyle} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-bold">Min Top-Up (₹)</label>
              <input type="number" value={form.minTopup} placeholder="20"
                onChange={e => setForm(f => ({ ...f, minTopup: parseFloat(e.target.value) || 0 }))}
                className={inputCls} style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-bold">Min Withdrawal (₹)</label>
              <input type="text" inputMode="numeric" value={form.minWithdrawal === 0 ? "" : String(form.minWithdrawal)} placeholder="20"
                onChange={e => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  setForm(f => ({ ...f, minWithdrawal: v === "" ? 0 : parseInt(v, 10) }));
                }}
                className={inputCls} style={inputStyle} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-bold">Max Withdrawal (₹)</label>
              <input type="text" inputMode="numeric" value={form.maxWithdrawal === 0 ? "" : String(form.maxWithdrawal)} placeholder="0 = no limit"
                onChange={e => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  setForm(f => ({ ...f, maxWithdrawal: v === "" ? 0 : parseInt(v, 10) }));
                }}
                className={inputCls} style={inputStyle} />
              <p className="text-[9px] text-zinc-600 px-0.5">Leave blank or 0 for no limit</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Controls card ── */}
      <div className="rounded-3xl overflow-hidden"
        style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)", animation: "pay-slide-up 0.4s 0.06s ease both", opacity: 0 }}>
        <div className="px-4 py-3 flex items-center gap-2.5"
          style={{ background: "rgba(16,185,129,0.06)", borderBottom: "1px solid rgba(16,185,129,0.1)" }}>
          <div className="w-7 h-7 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.22)" }}>
            <Settings className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div>
            <p className="text-xs font-bold text-white">Platform Controls</p>
            <p className="text-[9px] text-zinc-500">Enable or disable features instantly</p>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-2.5">
          {(["isEnabled", "withdrawalEnabled"] as const).map((key) => {
            const label = key === "isEnabled" ? "Top-Up" : "Withdrawal";
            const sub = key === "isEnabled" ? "Allow users to purchase diamonds" : "Allow users to withdraw earnings";
            return (
              <button key={key}
                onClick={() => setForm(f => ({ ...f, [key]: !f[key] }))}
                className="flex items-center justify-between w-full p-3.5 rounded-2xl text-left transition-all active:scale-[0.98]"
                style={{
                  background: form[key] ? "rgba(16,185,129,0.07)" : "rgba(255,255,255,0.03)",
                  border: form[key] ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(255,255,255,0.07)",
                }}>
                <div>
                  <p className="text-sm font-semibold text-white">{label}</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">{sub}</p>
                </div>
                <div className="w-12 h-6 rounded-full relative shrink-0 transition-all duration-200"
                  style={{ background: form[key] ? "rgba(16,185,129,0.75)" : "rgba(255,255,255,0.1)" }}>
                  <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200"
                    style={{ left: form[key] ? "calc(100% - 22px)" : "2px" }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Withdrawal Schedule card ── */}
      <div className="rounded-3xl overflow-hidden"
        style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(99,102,241,0.18)", backdropFilter: "blur(12px)", animation: "pay-slide-up 0.4s 0.08s ease both", opacity: 0 }}>
        <div className="px-4 py-3 flex items-center gap-2.5"
          style={{ background: "rgba(99,102,241,0.07)", borderBottom: "1px solid rgba(99,102,241,0.12)" }}>
          <div className="w-7 h-7 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.28)" }}>
            <span className="text-sm">⏰</span>
          </div>
          <div>
            <p className="text-xs font-bold text-white">Withdrawal Schedule</p>
            <p className="text-[9px] text-zinc-500">Control when users can withdraw</p>
          </div>
          {form.withdrawalPaused && (
            <span className="ml-auto text-[9px] font-bold text-red-300 px-2 py-0.5 rounded-full"
              style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}>PAUSED</span>
          )}
        </div>
        <div className="p-4 flex flex-col gap-4">
          {/* Pause toggle */}
          <button onClick={() => setForm(f => ({ ...f, withdrawalPaused: !f.withdrawalPaused }))}
            className="flex items-center justify-between w-full p-3.5 rounded-2xl text-left transition-all active:scale-[0.98]"
            style={{
              background: form.withdrawalPaused ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)",
              border: form.withdrawalPaused ? "1px solid rgba(239,68,68,0.25)" : "1px solid rgba(255,255,255,0.07)",
            }}>
            <div>
              <p className="text-sm font-semibold text-white">Pause All Withdrawals</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">Show a maintenance message to users</p>
            </div>
            <div className="w-12 h-6 rounded-full relative shrink-0 transition-all duration-200"
              style={{ background: form.withdrawalPaused ? "rgba(239,68,68,0.75)" : "rgba(255,255,255,0.1)" }}>
              <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200"
                style={{ left: form.withdrawalPaused ? "calc(100% - 22px)" : "2px" }} />
            </div>
          </button>
          {form.withdrawalPaused && (
            <div className="flex flex-col gap-1.5 -mt-1">
              <label className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-bold">Pause Message (shown to users)</label>
              <textarea value={form.withdrawalPauseMessage}
                onChange={e => setForm(f => ({ ...f, withdrawalPauseMessage: e.target.value }))}
                placeholder="e.g. System under maintenance. Withdrawals will resume shortly."
                rows={2}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white resize-none outline-none"
                style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)" }} />
            </div>
          )}

          {/* Window toggle */}
          <button onClick={() => setForm(f => ({ ...f, withdrawalWindowEnabled: !f.withdrawalWindowEnabled }))}
            className="flex items-center justify-between w-full p-3.5 rounded-2xl text-left transition-all active:scale-[0.98]"
            style={{
              background: form.withdrawalWindowEnabled ? "rgba(99,102,241,0.07)" : "rgba(255,255,255,0.03)",
              border: form.withdrawalWindowEnabled ? "1px solid rgba(99,102,241,0.25)" : "1px solid rgba(255,255,255,0.07)",
            }}>
            <div>
              <p className="text-sm font-semibold text-white">Restrict to Time Window</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">Only allow withdrawals during set hours (IST)</p>
            </div>
            <div className="w-12 h-6 rounded-full relative shrink-0 transition-all duration-200"
              style={{ background: form.withdrawalWindowEnabled ? "rgba(99,102,241,0.75)" : "rgba(255,255,255,0.1)" }}>
              <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200"
                style={{ left: form.withdrawalWindowEnabled ? "calc(100% - 22px)" : "2px" }} />
            </div>
          </button>
          {form.withdrawalWindowEnabled && (
            <div className="grid grid-cols-2 gap-3 -mt-1">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-bold">Opens at (IST)</label>
                <input type="time" value={form.withdrawalWindowStart}
                  onChange={e => setForm(f => ({ ...f, withdrawalWindowStart: e.target.value }))}
                  className="w-full h-10 rounded-xl px-3 text-sm text-white outline-none"
                  style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.25)" }} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-bold">Closes at (IST)</label>
                <input type="time" value={form.withdrawalWindowEnd}
                  onChange={e => setForm(f => ({ ...f, withdrawalWindowEnd: e.target.value }))}
                  className="w-full h-10 rounded-xl px-3 text-sm text-white outline-none"
                  style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.25)" }} />
              </div>
            </div>
          )}

          {/* Processing note */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-bold">Processing Note (shown to users)</label>
            <input type="text" value={form.withdrawalProcessingNote}
              onChange={e => setForm(f => ({ ...f, withdrawalProcessingNote: e.target.value }))}
              placeholder="Most withdrawals are processed within 30 minutes · max 12 hours."
              className="w-full h-10 rounded-xl px-3 text-sm text-white outline-none"
              style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)" }} />
          </div>
        </div>
      </div>

      {/* ── BharatPe Auto-Detect card ── */}
      <div className="rounded-3xl overflow-hidden"
        style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(16,185,129,0.2)", backdropFilter: "blur(12px)", animation: "pay-slide-up 0.4s 0.1s ease both", opacity: 0 }}>
        <div className="px-4 py-3 flex items-center gap-2.5"
          style={{ background: "rgba(16,185,129,0.07)", borderBottom: "1px solid rgba(16,185,129,0.12)" }}>
          <div className="w-7 h-7 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.28)" }}>
            <span className="text-sm">⚡</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white">BharatPe Auto-Detect</p>
            <p className="text-[9px] text-zinc-500">Server polls every 5s and credits diamonds automatically</p>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full"
            style={{ background: form.bharatpeToken ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.06)", border: form.bharatpeToken ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(255,255,255,0.1)" }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: form.bharatpeToken ? "rgb(16,185,129)" : "rgb(113,113,122)" }} />
            <span className="text-[9px] font-bold" style={{ color: form.bharatpeToken ? "rgb(52,211,153)" : "rgb(113,113,122)" }}>
              {form.bharatpeToken ? "ACTIVE" : "NOT SET"}
            </span>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-bold">Merchant ID</label>
            <input type="text" value={form.bharatpeMerchantId}
              onChange={e => setForm(f => ({ ...f, bharatpeMerchantId: e.target.value }))}
              placeholder="e.g. 69893818"
              className={inputCls + " font-mono text-xs"} style={inputStyle} />
            <p className="text-[9px] text-zinc-600 px-0.5">Your BharatPe merchant ID from the dashboard URL</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-bold">API Token</label>
            <input type="password" value={form.bharatpeToken}
              onChange={e => setForm(f => ({ ...f, bharatpeToken: e.target.value }))}
              placeholder="Paste your BharatPe token header value"
              className={inputCls + " font-mono text-xs"} style={inputStyle} />
            <p className="text-[9px] text-zinc-600 px-0.5">From the <code className="text-zinc-400">token</code> request header when logged into enterprise.bharatpe.in</p>
          </div>
          <div className="rounded-xl px-3 py-2.5 flex items-start gap-2"
            style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.12)" }}>
            <span className="text-emerald-400 text-sm mt-px">ℹ</span>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Once set, the server automatically detects payments by matching the exact rupee amount (including paisa) against your BharatPe transaction history every 5 seconds. No UTR entry needed from users.
            </p>
          </div>
        </div>
      </div>

      {/* Floating save bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          transform: isDirty ? "translateY(0)" : "translateY(110%)",
          opacity: isDirty ? 1 : 0,
          pointerEvents: isDirty ? "auto" : "none",
        }}>
        <div className="mx-4 mb-5 rounded-3xl p-3 flex items-center gap-3"
          style={{
            background: "rgba(10,6,18,0.96)",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 -8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)",
          }}>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white">Unsaved changes</p>
            <p className="text-[10px] text-zinc-500">Tap Save to apply your edits</p>
          </div>
          <button onClick={discard}
            className="h-10 px-4 rounded-2xl text-xs font-bold text-zinc-400 transition-all active:scale-95"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
            Discard
          </button>
          <button onClick={save} disabled={saving}
            className="h-10 px-5 rounded-2xl text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 btn-primary-gradient">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Diamond Stock view ───────────────────────────────────────────────────────
interface DiamondStockStats {
  totalAllocated: number;
  totalDistributed: number;
  remaining: number;
  totalUserBalance: number;
  suspicious: boolean;
  suspiciousDiff: number;
}
interface DiamondStockEntry {
  id: number;
  diamonds: number;
  notes: string | null;
  createdAt: string;
}
interface DiamondUser {
  id: number;
  phone: string;
  inGameName: string | null;
  uid: string | null;
  diamondBalance: number;
}
interface UsedUTR {
  id: number;
  utr: string;
  rupees: number;
  diamonds: number;
  verifiedAt: string | null;
  createdAt: string;
  userId: number;
  phone: string;
  inGameName: string | null;
  uid: string | null;
}

function DiamondStockView({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [stats, setStats] = useState<DiamondStockStats | null>(null);
  const [history, setHistory] = useState<DiamondStockEntry[]>([]);
  const [users, setUsers] = useState<DiamondUser[]>([]);
  const [utrs, setUtrs] = useState<UsedUTR[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ diamonds: "", notes: "" });
  const [deleting, setDeleting] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [utrSearch, setUtrSearch] = useState("");
  const [copiedUtr, setCopiedUtr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, hRes, uRes, utrRes] = await Promise.all([
        saFetch("/super-admin/diamond-stock"),
        saFetch("/super-admin/diamond-stock/history"),
        saFetch("/super-admin/diamond-stock/users"),
        saFetch("/super-admin/diamond-stock/utrs"),
      ]);
      if (sRes.ok) setStats(await sRes.json());
      if (hRes.ok) setHistory(await hRes.json());
      if (uRes.ok) setUsers(await uRes.json());
      if (utrRes.ok) setUtrs(await utrRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  function copyUtr(utr: string) {
    navigator.clipboard.writeText(utr).then(() => {
      setCopiedUtr(utr);
      setTimeout(() => setCopiedUtr(null), 1800);
    });
  }

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    const diamonds = Number(form.diamonds);
    if (!diamonds || diamonds < 1) { toast({ title: "Enter valid diamond count", variant: "destructive" }); return; }
    setAdding(true);
    try {
      const res = await saFetch("/super-admin/diamond-stock/add", {
        method: "POST",
        body: JSON.stringify({ diamonds, notes: form.notes }),
      });
      if (!res.ok) { toast({ title: "Failed to add entry", variant: "destructive" }); return; }
      toast({ title: "Stock entry added" });
      setForm({ diamonds: "", notes: "" });
      setShowForm(false);
      await load();
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      const res = await saFetch(`/super-admin/diamond-stock/${id}`, { method: "DELETE" });
      if (!res.ok) { toast({ title: "Failed to delete", variant: "destructive" }); return; }
      toast({ title: "Entry deleted" });
      await load();
    } finally {
      setDeleting(null);
    }
  }

  const fmtDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="px-4 py-5 flex flex-col gap-5 pb-28">

      {/* Suspicious alert banner */}
      {stats?.suspicious && (
        <div className="flex items-start gap-3 p-4 rounded-2xl"
          style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)" }}>
          <TriangleAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-400">Suspicious Activity Detected</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              User balances exceed allocated stock by <span className="text-red-400 font-bold">{stats.suspiciousDiff.toLocaleString()} 💎</span>.
              This may indicate diamonds were issued outside of the topup system.
            </p>
          </div>
        </div>
      )}

      {/* Stats grid */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Total Allocated", value: stats.totalAllocated, icon: Package, color: "text-sky-400", bg: "rgba(56,189,248,0.1)", border: "rgba(56,189,248,0.25)" },
            { label: "Distributed", value: stats.totalDistributed, icon: Gem, color: "text-violet-400", bg: "rgba(139,92,246,0.1)", border: "rgba(139,92,246,0.25)" },
            { label: "Remaining Stock", value: stats.remaining, icon: Zap, color: stats.remaining < 0 ? "text-red-400" : "text-emerald-400", bg: stats.remaining < 0 ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)", border: stats.remaining < 0 ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.25)" },
            { label: "User Balances", value: stats.totalUserBalance, icon: TrendingUp, color: stats.suspicious ? "text-red-400" : "text-orange-400", bg: stats.suspicious ? "rgba(239,68,68,0.1)" : "rgba(234,88,12,0.1)", border: stats.suspicious ? "rgba(239,68,68,0.3)" : "rgba(234,88,12,0.25)" },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="rounded-2xl p-4 flex flex-col gap-2"
                style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${s.color}`} />
                  <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">{s.label}</span>
                </div>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
                <p className="text-[10px] text-zinc-500">💎 diamonds</p>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Add stock button / form */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center justify-center gap-2 w-full h-12 rounded-2xl font-bold text-sm text-sky-400 transition-all active:scale-95"
          style={{ background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.25)" }}>
          <Plus className="w-4 h-4" /> Add Diamond Stock Entry
        </button>
      ) : (
        <div className="rounded-2xl p-4 flex flex-col gap-4"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-sm font-bold text-white">New Stock Entry</p>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">Diamonds Purchased</label>
            <input
              type="number" min="1" placeholder="e.g. 5000"
              value={form.diamonds}
              onChange={e => setForm(f => ({ ...f, diamonds: e.target.value }))}
              className="w-full h-11 rounded-xl px-3 text-sm text-white bg-transparent outline-none"
              style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">Notes (optional)</label>
            <input
              type="text" placeholder="e.g. Garena purchase, order #123"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full h-11 rounded-xl px-3 text-sm text-white bg-transparent outline-none"
              style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }} />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 h-11 rounded-xl text-xs font-bold text-zinc-400 transition-all active:scale-95"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
              Cancel
            </button>
            <button
              onClick={handleAdd} disabled={adding}
              className="flex-1 h-11 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 btn-primary-gradient">
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {adding ? "Saving..." : "Save Entry"}
            </button>
          </div>
        </div>
      )}

      {/* History */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Allocation History</p>
          <button onClick={load} className="text-[10px] text-sky-400 flex items-center gap-1 font-bold">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>

        {history.length === 0 && !loading && (
          <div className="py-8 text-center">
            <Package className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-xs text-zinc-500">No stock entries yet. Add your first allocation above.</p>
          </div>
        )}

        {history.map(entry => (
          <div key={entry.id} className="flex items-center gap-3 p-4 rounded-2xl"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)" }}>
              <Package className="w-5 h-5 text-sky-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">+{entry.diamonds.toLocaleString()} 💎</span>
              </div>
              {entry.notes && <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{entry.notes}</p>}
              <p className="text-[10px] text-zinc-600 mt-0.5">{fmtDate(entry.createdAt)}</p>
            </div>
            <button
              onClick={() => handleDelete(entry.id)}
              disabled={deleting === entry.id}
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-90 disabled:opacity-40"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
              {deleting === entry.id
                ? <Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" />
                : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
            </button>
          </div>
        ))}
      </div>

      {/* User diamond breakdown */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">User Diamond Holdings</p>
          <span className="text-[10px] text-zinc-600">{users.length} users</span>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search by name, phone or UID…"
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            className="w-full h-10 rounded-xl pl-3 pr-3 text-sm text-white bg-transparent outline-none"
            style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }} />
        </div>

        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-sky-400 animate-spin" />
          </div>
        )}

        {!loading && users.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-xs text-zinc-500">No users found.</p>
          </div>
        )}

        {!loading && users
          .filter(u => {
            const q = userSearch.toLowerCase();
            if (!q) return true;
            return (
              u.phone.includes(q) ||
              (u.inGameName ?? "").toLowerCase().includes(q) ||
              (u.uid ?? "").toLowerCase().includes(q)
            );
          })
          .map((u, i) => {
            const pct = stats && stats.totalUserBalance > 0
              ? Math.round((u.diamondBalance / stats.totalUserBalance) * 100)
              : 0;
            const flagged = stats ? u.diamondBalance > stats.totalAllocated : false;
            return (
              <div key={u.id} className="flex items-center gap-3 p-3 rounded-2xl"
                style={{
                  background: flagged ? "rgba(239,68,68,0.07)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${flagged ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.07)"}`,
                }}>
                {/* Rank */}
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-bold"
                  style={{ background: "rgba(255,255,255,0.05)", color: i < 3 ? "#f59e0b" : "#52525b" }}>
                  {i + 1}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-white truncate">
                    {u.inGameName ?? "—"}
                    {flagged && <span className="ml-1.5 text-[10px] text-red-400 font-bold">⚠ HIGH</span>}
                  </p>
                  <p className="text-[10px] text-zinc-500 truncate">{u.phone}{u.uid ? ` · ${u.uid}` : ""}</p>
                  {/* Bar */}
                  <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: flagged ? "#ef4444" : "rgba(56,189,248,0.7)" }} />
                  </div>
                </div>
                {/* Balance */}
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${flagged ? "text-red-400" : "text-sky-400"}`}>
                    {u.diamondBalance.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-zinc-600">💎 {pct}%</p>
                </div>
              </div>
            );
          })}
      </div>

      {/* Used UTRs */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Used UTRs</p>
          <span className="text-[10px] text-zinc-600">{utrs.length} verified</span>
        </div>

        <div className="relative flex items-center">
          <Search className="absolute left-3 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search UTR, name, phone or UID…"
            value={utrSearch}
            onChange={e => setUtrSearch(e.target.value)}
            className="w-full h-10 rounded-xl pl-8 pr-3 text-sm text-white bg-transparent outline-none"
            style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }} />
        </div>

        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
          </div>
        )}

        {!loading && utrs.length === 0 && (
          <div className="py-6 text-center">
            <Hash className="w-7 h-7 text-zinc-700 mx-auto mb-2" />
            <p className="text-xs text-zinc-500">No verified UTRs yet.</p>
          </div>
        )}

        {!loading && utrs
          .filter(r => {
            const q = utrSearch.toLowerCase().trim();
            if (!q) return true;
            return (
              r.utr.toLowerCase().includes(q) ||
              r.phone.includes(q) ||
              (r.inGameName ?? "").toLowerCase().includes(q) ||
              (r.uid ?? "").toLowerCase().includes(q)
            );
          })
          .map(r => (
            <div key={r.id} className="rounded-2xl p-3 flex flex-col gap-2"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              {/* UTR row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Hash className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                  <span className="text-sm font-mono font-bold text-white tracking-wide truncate">{r.utr}</span>
                </div>
                <button
                  onClick={() => copyUtr(r.utr)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all active:scale-90 shrink-0"
                  style={{
                    background: copiedUtr === r.utr ? "rgba(52,211,153,0.15)" : "rgba(139,92,246,0.12)",
                    border: `1px solid ${copiedUtr === r.utr ? "rgba(52,211,153,0.4)" : "rgba(139,92,246,0.3)"}`,
                    color: copiedUtr === r.utr ? "#34d399" : "#a78bfa",
                  }}>
                  {copiedUtr === r.utr
                    ? <><Check className="w-3 h-3" /> Copied</>
                    : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
              </div>
              {/* Meta row */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[11px] text-zinc-400 font-bold">{r.inGameName ?? r.phone}</span>
                {r.uid && <span className="text-[10px] text-zinc-600">UID: {r.uid}</span>}
                <span className="ml-auto flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                  <Gem className="w-3 h-3" /> +{r.diamonds.toLocaleString()} 💎
                </span>
                <span className="text-[11px] text-zinc-500">₹{r.rupees.toLocaleString()}</span>
              </div>
              {/* Date */}
              <p className="text-[10px] text-zinc-600">
                Verified {r.verifiedAt ? fmtDate(r.verifiedAt) : fmtDate(r.createdAt)}
              </p>
            </div>
          ))}
      </div>
    </div>
  );
}
