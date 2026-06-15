import React, { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, Gem, CheckCircle, XCircle, Clock, RefreshCw,
  CreditCard, Hash, Calendar, IndianRupee, AlertTriangle,
  ChevronDown, ChevronUp, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

async function saFetch<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Super-Admin-Token": token, ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json();
}

function fmtDateTime(iso: string) {
  try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}
function fmtRelative(iso: string) {
  try {
    const d = new Date(iso); const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch { return ""; }
}

interface TopupRecord {
  id: number;
  rupees: number;
  diamonds: number;
  utr: string;
  status: string;
  rejectedReason: string | null;
  bharatpeData: Record<string, unknown> | null;
  actualPaise: number | null;
  sessionToken: string | null;
  verifiedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  verified: { label: "Verified",  color: "text-emerald-400", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.25)", icon: <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> },
  pending:  { label: "Pending",   color: "text-amber-400",   bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)", icon: <Clock className="w-3.5 h-3.5 text-amber-400" /> },
  rejected: { label: "Rejected",  color: "text-red-400",     bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)", icon: <XCircle className="w-3.5 h-3.5 text-red-400" /> },
};

export default function AdminUserTopupHistoryPage() {
  const { uid } = useParams<{ phone: string; uid: string }>();
  const [, navigate] = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [topups, setTopups] = useState<TopupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    const s = getSession();
    if (!s) { navigate(`/286c81443d1fb388d1b9a8e3b280824c`); return; }
    setToken(s.token);
  }, [navigate]);

  useEffect(() => {
    if (!token || !uid) return;
    setLoading(true);
    setError(null);
    saFetch<TopupRecord[]>(`/admin/users/${uid}/topup-history`, token)
      .then(setTopups)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, uid]);

  const filtered = filterStatus === "all" ? topups : topups.filter(t => t.status === filterStatus);

  const totalVerified  = topups.filter(t => t.status === "verified").reduce((s, t) => s + t.rupees, 0);
  const totalPending   = topups.filter(t => t.status === "pending").reduce((s, t) => s + t.rupees, 0);
  const totalRejected  = topups.filter(t => t.status === "rejected").length;
  const totalDiamonds  = topups.filter(t => t.status === "verified").reduce((s, t) => s + t.diamonds, 0);

  return (
    <div className="min-h-dvh pb-24" style={{ background: "linear-gradient(135deg, #0a0014 0%, #0f0020 50%, #0a0014 100%)" }}>
      {/* Header */}
      <div className="sticky top-0 z-40 px-4 pt-4 pb-3 flex items-center gap-3"
        style={{ background: "rgba(10,0,20,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={() => navigate(`/286c81443d1fb388d1b9a8e3b280824c/user_management`)}
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <ArrowLeft className="w-4 h-4 text-zinc-300" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">User #{uid}</p>
          <h1 className="text-base font-bold text-white leading-tight">Top-up History</h1>
        </div>
        <button onClick={() => {
          setLoading(true);
          saFetch<TopupRecord[]>(`/admin/users/${uid}/topup-history`, token!)
            .then(setTopups).catch(e => setError(e.message)).finally(() => setLoading(false));
        }} className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <RefreshCw className={cn("w-4 h-4 text-zinc-400", loading && "animate-spin")} />
        </button>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-4">
        {/* KPI row */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Verified (₹)",  value: `₹${totalVerified.toLocaleString()}`, color: "text-emerald-400", bg: "rgba(16,185,129,0.07)", border: "rgba(16,185,129,0.2)", icon: <CheckCircle className="w-4 h-4 text-emerald-400" /> },
            { label: "Diamonds Got",  value: totalDiamonds.toLocaleString() + " 💎", color: "text-violet-400",  bg: "rgba(139,92,246,0.07)", border: "rgba(139,92,246,0.2)", icon: <Gem className="w-4 h-4 text-violet-400" /> },
            { label: "Pending (₹)",   value: `₹${totalPending.toLocaleString()}`, color: "text-amber-400",   bg: "rgba(245,158,11,0.07)", border: "rgba(245,158,11,0.2)", icon: <Clock className="w-4 h-4 text-amber-400" /> },
            { label: "Rejected",      value: `${totalRejected} UTR${totalRejected !== 1 ? "s" : ""}`, color: "text-red-400", bg: "rgba(239,68,68,0.07)", border: "rgba(239,68,68,0.2)", icon: <XCircle className="w-4 h-4 text-red-400" /> },
          ].map(card => (
            <div key={card.label} className="rounded-2xl px-3 py-3 flex flex-col gap-1"
              style={{ background: card.bg, border: `1px solid ${card.border}` }}>
              <div className="flex items-center justify-between">
                <p className="text-[9px] text-zinc-500 uppercase tracking-wider font-bold">{card.label}</p>
                {card.icon}
              </div>
              <p className={cn("text-lg font-extrabold leading-none", card.color)}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {[
            { key: "all",      label: `All (${topups.length})` },
            { key: "verified", label: `Verified (${topups.filter(t => t.status === "verified").length})` },
            { key: "pending",  label: `Pending (${topups.filter(t => t.status === "pending").length})` },
            { key: "rejected", label: `Rejected (${totalRejected})` },
          ].map(tab => (
            <button key={tab.key} onClick={() => setFilterStatus(tab.key)}
              className={cn("flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all", filterStatus === tab.key ? "bg-primary text-white" : "text-zinc-500")}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-2xl px-4 py-8 text-center" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-400 font-semibold">Failed to load</p>
            <p className="text-xs text-zinc-600 mt-0.5">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)" }}>
              <CreditCard className="w-6 h-6 text-violet-400/50" />
            </div>
            <p className="text-zinc-400 text-sm font-medium">No top-ups found</p>
            <p className="text-zinc-600 text-xs">{filterStatus !== "all" ? "Try a different filter" : "This user has not made any top-up requests"}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(t => {
              const cfg = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.pending;
              const expanded = expandedId === t.id;
              return (
                <div key={t.id} className="rounded-2xl overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  {/* Main row */}
                  <button className="w-full px-4 py-3.5 flex items-center gap-3 text-left"
                    onClick={() => setExpandedId(expanded ? null : t.id)}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                      <IndianRupee className={cn("w-4 h-4", cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-white">₹{t.rupees.toLocaleString()}</p>
                        <span className="text-zinc-600 text-xs">→</span>
                        <div className="flex items-center gap-1">
                          <Gem className="w-3 h-3 text-violet-400" />
                          <span className="text-xs font-semibold text-violet-300">{t.diamonds.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <div className="flex items-center gap-1">
                          {cfg.icon}
                          <span className={cn("text-[10px] font-bold", cfg.color)}>{cfg.label}</span>
                        </div>
                        <span className="text-zinc-700 text-[10px]">·</span>
                        <span className="text-[10px] text-zinc-600">{fmtRelative(t.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] text-zinc-700 font-mono">#{t.id}</span>
                      {expanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {expanded && (
                    <div className="border-t px-4 py-3 flex flex-col gap-2.5" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                      {[
                        { label: "UTR Number", value: t.utr, icon: <Hash className="w-3.5 h-3.5 text-cyan-400" />, mono: true },
                        ...(t.actualPaise != null ? [{ label: "Actual Amount", value: `₹${(t.actualPaise / 100).toFixed(2)} (${t.actualPaise} paise)`, icon: <IndianRupee className="w-3.5 h-3.5 text-amber-400" />, mono: true }] : []),
                        ...(t.sessionToken ? [{ label: "Session Token", value: t.sessionToken, icon: <Hash className="w-3.5 h-3.5 text-violet-400" />, mono: true }] : []),
                        { label: "Submitted", value: fmtDateTime(t.createdAt), icon: <Calendar className="w-3.5 h-3.5 text-zinc-500" /> },
                        ...(t.verifiedAt ? [{ label: "Verified At", value: fmtDateTime(t.verifiedAt), icon: <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> }] : []),
                        ...(t.rejectedAt ? [{ label: "Rejected At", value: fmtDateTime(t.rejectedAt), icon: <XCircle className="w-3.5 h-3.5 text-red-400" /> }] : []),
                        ...(t.rejectedReason ? [{ label: "Rejection Reason", value: t.rejectedReason, icon: <AlertTriangle className="w-3.5 h-3.5 text-orange-400" /> }] : []),
                      ].map((row, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="shrink-0 mt-0.5">{row.icon}</div>
                          <span className="text-[10px] text-zinc-600 w-28 shrink-0 uppercase tracking-wider font-bold pt-0.5">{row.label}</span>
                          <span className={cn("text-xs text-white break-all", (row as { mono?: boolean }).mono && "font-mono")}>{row.value}</span>
                        </div>
                      ))}

                      {t.bharatpeData && Object.keys(t.bharatpeData).length > 0 && (
                        <div className="rounded-xl px-3 py-2.5 mt-1" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                          <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold mb-2">BharatPe Verification Data</p>
                          <div className="flex flex-col gap-1.5">
                            {Object.entries(t.bharatpeData).map(([k, v]) => (
                              <div key={k} className="flex items-start gap-2">
                                <span className="text-[10px] text-zinc-600 w-28 shrink-0 uppercase tracking-wider font-semibold">{k.replace(/_/g, " ")}</span>
                                <span className="text-[11px] text-zinc-300 break-all font-mono">{String(v)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
