import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Lock, Clock, Swords, CheckCircle2, AlertCircle,
  Hourglass, RefreshCw, Trash2, ChevronRight, ChevronDown,
} from "lucide-react";
import { format } from "date-fns";

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

async function authFetch(path: string, opts?: RequestInit): Promise<Response> {
  const session = getSession();
  return fetch(`/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { "x-super-admin-token": session.token } : {}),
      ...(opts?.headers ?? {}),
    },
  });
}

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface TimeSlot { startTime: string; endTime: string; label: string; }

interface MatchMeta {
  tournamentId: number; title: string; timeSlots: TimeSlot[];
}

interface SlotMatchPlayer {
  id: number; inGameName: string | null; uid: string | null;
  profilePicture: string | null; phone?: string;
}

interface SlotMatch {
  id: number; displayId: string | null; slotId: number; slotIndex: number;
  matchNumber: number; waveNumber: number; player1Id: number; player2Id: number | null;
  scheduledAt: string; status: string; winnerId: number | null; notes: string | null;
  player1: SlotMatchPlayer | null; player2: SlotMatchPlayer | null;
}

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function fmtMatchId(m: { id: number; displayId?: string | null }) {
  return m.displayId ?? String(m.id).padStart(12, "0");
}
function pName(p: SlotMatchPlayer | null, uid: number) { return p?.inGameName || `User #${uid}`; }
function fmtTime(iso: string) {
  try { return format(new Date(iso), "d MMM, h:mm a"); } catch { return iso; }
}
function fmtSlotTime(slot: TimeSlot) {
  try { return `${format(new Date(slot.startTime), "h:mm a")} – ${format(new Date(slot.endTime), "h:mm a")}`; }
  catch { return slot.label || ""; }
}

function statusStyle(s: string) {
  switch (s) {
    case "completed": return { color: "#4ade80", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.3)" };
    case "cancelled": return { color: "#f87171", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)" };
    case "ongoing":   return { color: "#fb923c", bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.3)" };
    default:          return { color: "#a5b4fc", bg: "rgba(99,102,241,0.1)",  border: "rgba(99,102,241,0.25)" };
  }
}

function StatusIcon({ s }: { s: string }) {
  if (s === "completed") return <CheckCircle2 className="w-2.5 h-2.5" />;
  if (s === "cancelled") return <AlertCircle className="w-2.5 h-2.5" />;
  if (s === "ongoing")   return <RefreshCw className="w-2.5 h-2.5" />;
  return <Hourglass className="w-2.5 h-2.5" />;
}

/* ─── Match Card ─────────────────────────────────────────────────────────────── */

function MatchCard({
  match, timeSlots, onDelete, deleting, onView,
}: {
  match: SlotMatch; timeSlots: TimeSlot[];
  onDelete: (id: number) => void; deleting: boolean;
  onView: (match: SlotMatch) => void;
}) {
  const st = statusStyle(match.status);
  const p1Name = pName(match.player1, match.player1Id);
  const p2Name = match.player2Id ? pName(match.player2, match.player2Id) : "TBD";
  const hasWinner = match.winnerId != null;
  const slotLabel = timeSlots[match.slotIndex]
    ? `Slot ${match.slotIndex + 1} · ${format(new Date(timeSlots[match.slotIndex].startTime), "h:mm a")}`
    : `Slot ${match.slotIndex + 1}`;

  return (
    <div
      className="rounded-2xl overflow-hidden cursor-pointer active:scale-[0.99] transition-transform"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
      onClick={() => onView(match)}
    >

      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-2.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }}>

        {/* Match display ID */}
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[11px] font-black text-indigo-300 tracking-wider truncate">
            {fmtMatchId(match)}
          </p>
          <p className="text-[9px] text-zinc-600 mt-0.5">{slotLabel} · W{match.waveNumber} · M{match.matchNumber}</p>
        </div>

        {/* Status pill */}
        <span className="flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0"
          style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
          <StatusIcon s={match.status} />
          {match.status}
        </span>

        {/* Delete */}
        <button
          onClick={e => { e.stopPropagation(); !deleting && onDelete(match.id); }}
          disabled={deleting}
          className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-95"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.22)", opacity: deleting ? 0.5 : 1 }}>
          {deleting
            ? <div className="w-3 h-3 border border-rose-400/40 border-t-rose-400 rounded-full animate-spin" />
            : <Trash2 className="w-3.5 h-3.5 text-rose-400" />}
        </button>
      </div>

      {/* Players */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* P1 */}
        <div className="flex-1 min-w-0">
          {match.player1?.profilePicture ? (
            <img src={match.player1.profilePicture} className="w-8 h-8 rounded-xl object-cover mb-1.5 border border-white/10" />
          ) : (
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black mb-1.5"
              style={{ background: hasWinner && match.winnerId === match.player1Id ? "rgba(251,191,36,0.15)" : "rgba(99,102,241,0.15)", color: hasWinner && match.winnerId === match.player1Id ? "#fbbf24" : "#a5b4fc" }}>
              {(p1Name[0] || "?").toUpperCase()}
            </div>
          )}
          <p className="text-[12px] font-black truncate"
            style={{ color: hasWinner && match.winnerId === match.player1Id ? "#fbbf24" : "#e4e4e7" }}>
            {hasWinner && match.winnerId === match.player1Id && "★ "}{p1Name}
          </p>
          <p className="text-[9px] text-zinc-600">Seat A</p>
        </div>

        {/* VS */}
        <div className="shrink-0 flex flex-col items-center gap-1">
          <div className="px-2 py-0.5 rounded-lg text-[10px] font-black"
            style={{ background: "rgba(249,115,22,0.12)", color: "#fb923c", border: "1px solid rgba(249,115,22,0.25)" }}>VS</div>
          <Clock className="w-3 h-3 text-zinc-700" />
          <p className="text-[9px] text-zinc-600">{format(new Date(match.scheduledAt), "h:mm a")}</p>
        </div>

        {/* P2 */}
        <div className="flex-1 min-w-0 text-right">
          <div className="flex justify-end mb-1.5">
            {match.player2?.profilePicture ? (
              <img src={match.player2.profilePicture} className="w-8 h-8 rounded-xl object-cover border border-white/10" />
            ) : (
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black"
                style={{ background: hasWinner && match.winnerId === match.player2Id ? "rgba(251,191,36,0.15)" : "rgba(249,115,22,0.1)", color: hasWinner && match.winnerId === match.player2Id ? "#fbbf24" : "#fb923c" }}>
                {match.player2Id ? (p2Name[0] || "?").toUpperCase() : "?"}
              </div>
            )}
          </div>
          <p className="text-[12px] font-black truncate"
            style={{ color: hasWinner && match.winnerId === match.player2Id ? "#fbbf24" : match.player2Id ? "#e4e4e7" : "#52525b" }}>
            {hasWinner && match.winnerId === match.player2Id && "★ "}{p2Name}
          </p>
          <p className="text-[9px] text-zinc-600">Seat B</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-4 py-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <span className="text-[9px] text-zinc-600 flex-1 truncate">
          {fmtTime(match.scheduledAt)}
        </span>
        <span className="flex items-center gap-1 text-[10px] font-black"
          style={{ color: "#a5b4fc" }}>
          Open Match <ChevronRight className="w-3 h-3" />
        </span>
      </div>
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export default function AdminAllMatchesPage() {
  const [location, navigate] = useLocation();
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;

  /* Read initial slot from URL hash query (?slot=N before the #) */
  const initialSlot = useMemo(() => {
    try {
      const search = window.location.search;
      const p = new URLSearchParams(search);
      const n = parseInt(p.get("slot") ?? "", 10);
      return isNaN(n) ? null : n;
    } catch { return null; }
  }, []);

  const [authed, setAuthed] = useState(false);
  const [meta, setMeta] = useState<MatchMeta | null>(null);
  const [matches, setMatches] = useState<SlotMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [filterSlot, setFilterSlot] = useState<number | null>(initialSlot);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    const s = getSession();
    if (!s) { navigate(`/286c81443d1fb388d1b9a8e3b280824c`); return; }
    setAuthed(true);
  }, []);

  /* Fetch meta (tournament info + timeSlots) */
  useEffect(() => {
    if (!authed || !matchId) return;
    async function load() {
      setLoading(true);
      try {
        const res = await authFetch(`/admin/tournaments/${matchId}/participants`);
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem(SESSION_KEY);
          navigate(`/286c81443d1fb388d1b9a8e3b280824c`); return;
        }
        if (res.ok) {
          const data = await res.json() as { meta: MatchMeta };
          setMeta(data.meta);
        }
      } catch { } finally { setLoading(false); }
    }
    load();
  }, [authed, matchId]);

  /* Fetch matches whenever tournamentId or filterSlot changes */
  const fetchMatches = useCallback(async (tournamentId: number, slot: number | null) => {
    setLoadingMatches(true);
    try {
      const url = slot !== null
        ? `/admin/slots/${tournamentId}/matches?slotIndex=${slot}`
        : `/admin/slots/${tournamentId}/matches`;
      const res = await authFetch(url);
      if (res.ok) setMatches(await res.json() as SlotMatch[]);
    } catch { } finally { setLoadingMatches(false); }
  }, []);

  useEffect(() => {
    if (meta?.tournamentId) void fetchMatches(meta.tournamentId, filterSlot);
  }, [meta?.tournamentId, filterSlot, fetchMatches]);

  /* Auto-refresh when arriving from make_matches save */
  useEffect(() => {
    if (sessionStorage.getItem("czsa_all_matches_refresh") && meta?.tournamentId) {
      sessionStorage.removeItem("czsa_all_matches_refresh");
      void fetchMatches(meta.tournamentId, filterSlot);
    }
  }, [location, meta?.tournamentId, filterSlot, fetchMatches]);

  const timeSlots: TimeSlot[] = meta?.timeSlots ?? [];
  const slotOptions = timeSlots.map((_, i) => i);

  /* Count per slot */
  const countBySlot = useMemo(() => {
    const c: Record<number, number> = {};
    for (const m of matches) c[m.slotIndex] = (c[m.slotIndex] ?? 0) + 1;
    return c;
  }, [matches]);

  function showToast(msg: string, ok = false) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      const res = await authFetch(`/admin/slot-matches/${id}`, { method: "DELETE" });
      if (res.ok) {
        setMatches(prev => prev.filter(m => m.id !== id));
        showToast("Match deleted", true);
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string };
        showToast(err.error ?? "Failed to delete");
      }
    } catch { showToast("Network error"); }
    finally { setDeletingId(null); }
  }

  function handleView(m: SlotMatch) {
    navigate(`/286c81443d1fb388d1b9a8e3b280824c/matches_management/joined_players/matches/${matchId}/slot-match/${m.displayId ?? m.id}`);
  }

  if (!authed) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0b" }}>
      <Lock className="w-8 h-8 text-zinc-700" />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a0a0b" }}>

      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3.5 border-b"
        style={{ borderColor: "rgba(255,255,255,0.07)", background: "#0f0f10" }}>
        <button
          onClick={() => navigate(`/286c81443d1fb388d1b9a8e3b280824c/matches_management/joined_players/matches/${matchId}`)}
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-95"
          style={{ background: "rgba(255,255,255,0.06)" }}>
          <ArrowLeft className="w-4 h-4 text-zinc-400" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-white truncate">Created Matches</p>
          {meta?.title && <p className="text-[10px] text-zinc-500 truncate">{meta.title}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {matches.length > 0 && (
            <span className="text-[11px] font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20 shrink-0">
              {matches.length} {matches.length === 1 ? "match" : "matches"}
            </span>
          )}
          <button onClick={() => meta?.tournamentId && void fetchMatches(meta.tournamentId, filterSlot)}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95"
            style={{ background: "rgba(255,255,255,0.06)" }}>
            <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${loadingMatches ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Slot filter tabs */}
      {!loading && slotOptions.length > 0 && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {/* All */}
          <button
            onClick={() => setFilterSlot(null)}
            className="shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all active:scale-95 whitespace-nowrap"
            style={
              filterSlot === null
                ? { background: "rgba(99,102,241,0.25)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.5)" }
                : { background: "rgba(255,255,255,0.05)", color: "#71717a", border: "1px solid rgba(255,255,255,0.09)" }
            }>
            All Slots
            {filterSlot === null && matches.length > 0 && (
              <span className="ml-1.5 text-[9px]">{matches.length}</span>
            )}
          </button>

          {slotOptions.map(si => {
            const label = timeSlots[si] ? fmtSlotTime(timeSlots[si]) : `Slot ${si + 1}`;
            const count = filterSlot === si ? matches.length : (countBySlot[si] ?? 0);
            const active = filterSlot === si;
            return (
              <button key={si}
                onClick={() => setFilterSlot(si)}
                className="shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all active:scale-95 whitespace-nowrap"
                style={
                  active
                    ? { background: "rgba(139,92,246,0.25)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.5)" }
                    : { background: "rgba(255,255,255,0.05)", color: "#71717a", border: "1px solid rgba(255,255,255,0.09)" }
                }>
                Slot {si + 1} · {label}
                {count > 0 && <span className="ml-1.5 text-[9px]">{count}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Match list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ scrollbarWidth: "none" }}>
        {loading || loadingMatches ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
          </div>
        ) : matches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Swords className="w-10 h-10 text-zinc-800" />
            <p className="text-zinc-600 text-sm font-medium">No matches created yet</p>
            <p className="text-[11px] text-zinc-700 text-center px-8">
              Go to Joined Players, select a slot, and tap "Decide Matches" to create pairings
            </p>
            <button
              onClick={() => navigate(`/286c81443d1fb388d1b9a8e3b280824c/matches_management/joined_players/matches/${matchId}`)}
              className="mt-1 px-4 py-2 rounded-xl text-[11px] font-bold transition-all active:scale-95"
              style={{ background: "rgba(99,102,241,0.18)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.35)" }}>
              ← Back to Players
            </button>
          </div>
        ) : (
          matches.map(m => (
            <MatchCard
              key={m.id}
              match={m}
              timeSlots={timeSlots}
              onDelete={handleDelete}
              deleting={deletingId === m.id}
              onView={handleView}
            />
          ))
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white shadow-xl z-50 whitespace-nowrap"
          style={{
            background: toast.ok ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)",
            backdropFilter: "blur(8px)",
          }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
