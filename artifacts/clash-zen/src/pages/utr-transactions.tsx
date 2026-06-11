import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Gem, IndianRupee, Trash2, User, Clock, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SESSION_KEY = "czsa_v1_session";
const SA_PATH = "/286c81443d1fb388d1b9a8e3b280824c";

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

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function saFetch(path: string, opts?: RequestInit): Promise<Response> {
  const session = getSession();
  if (!session) return new Response(JSON.stringify({ error: "No session" }), { status: 401 });
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      "x-super-admin-token": session.token,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({})) as { error?: string };
    throw new ApiError((j.error as string) || `HTTP ${res.status}`, res.status);
  }
  return res;
}

interface UtrRecord {
  id: number;
  userId: number;
  rupees: number;
  diamonds: number;
  utr: string;
  verifiedAt: string | null;
  createdAt: string;
  phone: string | null;
  inGameName: string | null;
}

export default function UtrTransactionsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [records, setRecords] = useState<UtrRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session) { navigate(SA_PATH); return; }
    setTimeout(() => setMounted(true), 40);
  }, [navigate]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await saFetch("/super-admin/utr-transactions");
      const data = await res.json() as UtrRecord[];
      setRecords(data);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        localStorage.removeItem(SESSION_KEY);
        navigate(SA_PATH);
        return;
      }
      toast({ title: "Failed to load records", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, navigate]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await saFetch(`/super-admin/utr-transactions/${id}`, { method: "DELETE" });
      setRecords(prev => prev.filter(r => r.id !== id));
      toast({ title: "Record deleted" });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        localStorage.removeItem(SESSION_KEY);
        navigate(SA_PATH);
        return;
      }
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  function goToUser(phone: string | null, userId: number) {
    if (!phone) return;
    navigate(`${SA_PATH}/user_management/${encodeURIComponent(phone)}/${userId}`);
  }

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      + " · " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  }

  return (
    <div className="min-h-[100dvh] flex flex-col profile-page-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-white/5"
        style={{ animation: mounted ? "pay-slide-up 0.35s ease both" : "none", opacity: mounted ? 1 : 0 }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`${SA_PATH}/payments`)}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </button>
          <div>
            <h1 className="font-bold text-white text-base leading-tight">UTR Transactions</h1>
            <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold">Approved Top-ups</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold text-zinc-400"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          {records.length} records
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            <p className="text-zinc-500 text-sm">Loading transactions…</p>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <CheckCircle2 className="w-10 h-10 text-zinc-600" />
            <p className="text-zinc-500 text-sm">No approved UTR transactions yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {records.map((r, i) => (
              <div key={r.id}
                className="rounded-2xl overflow-hidden"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  animation: mounted ? `pay-slide-up 0.4s ${0.05 + i * 0.04}s ease both` : "none",
                  opacity: 0,
                }}>

                {/* Top row: UTR + delete */}
                <div className="flex items-center justify-between px-4 pt-3 pb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="font-mono text-white text-sm font-bold tracking-wide">{r.utr}</span>
                  </div>
                  {confirmId === r.id ? (
                    <div className="flex items-center gap-2 relative z-20">
                      <button onClick={() => setConfirmId(null)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-zinc-400"
                        style={{ background: "rgba(255,255,255,0.06)" }}>
                        Cancel
                      </button>
                      <button onClick={() => handleDelete(r.id)}
                        disabled={deletingId === r.id}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-red-400 flex items-center gap-1"
                        style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
                        {deletingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        Confirm
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmId(r.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-red-400 transition-colors"
                      style={{ background: "rgba(255,255,255,0.04)" }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Amount row */}
                <div className="flex items-center gap-3 px-4 pb-2">
                  <div className="flex items-center gap-1 text-xs font-bold text-orange-400">
                    <IndianRupee className="w-3 h-3" />{r.rupees}
                  </div>
                  <span className="text-zinc-600 text-xs">→</span>
                  <div className="flex items-center gap-1 text-xs font-bold text-sky-400">
                    <Gem className="w-3 h-3" />{r.diamonds} diamonds
                  </div>
                </div>

                {/* User row — tappable */}
                <button onClick={() => goToUser(r.phone, r.userId)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-white/5 active:bg-white/10 border-t border-white/5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.25)" }}>
                    <User className="w-3.5 h-3.5 text-violet-400" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-xs font-bold text-white leading-tight">{r.inGameName ?? "Unknown"}</p>
                    <p className="text-[10px] text-zinc-500">{r.phone ?? `User #${r.userId}`}</p>
                  </div>
                  <ChevronLeft className="w-3.5 h-3.5 text-zinc-600 rotate-180" />
                </button>

                {/* Date row */}
                <div className="flex items-center gap-1.5 px-4 py-2 border-t border-white/5">
                  <Clock className="w-3 h-3 text-zinc-600" />
                  <span className="text-[10px] text-zinc-500">{formatDate(r.verifiedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm dialog backdrop */}
      {confirmId !== null && (
        <div className="fixed inset-0 bg-black/40 z-10" onClick={() => setConfirmId(null)} />
      )}
    </div>
  );
}
