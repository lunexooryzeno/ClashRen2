import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Users, Eye, ExternalLink, Lock, Clock, ChevronDown,
  SlidersHorizontal, ArrowUpDown, Layers, Swords, Trash2, CheckCircle2,
  AlertCircle, Hourglass, RefreshCw, UserX, Check, ChevronRight,
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

async function authFetchAdmin(path: string, opts?: RequestInit): Promise<Response> {
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

interface Participant {
  id: number; userId: number; inGameName: string | null; phone: string;
  kills: number; placement: number | null; slotIndex: number; joinedAt: string;
  hasSeenCredentials: boolean; matchNumber: number | null;
  waveNumber: number | null; seatNumber: number | null;
}

interface TimeSlot { startTime: string; endTime: string; label: string; }

interface MatchMeta {
  tournamentId: number; title: string; maxSlots: number; filledSlots: number;
  uniqueSlotCount: number; totalBookings: number; timeSlots: TimeSlot[];
}

interface SlotMatchPlayer {
  id: number; inGameName: string | null; uid: string | null;
  profilePicture: string | null; phone?: string;
}

interface SlotMatch {
  id: number; displayId: string | null; slotId: number; slotIndex: number; matchNumber: number;
  waveNumber: number; player1Id: number; player2Id: number | null;
  player1Seat: string | null; player2Seat: string | null;
  scheduledAt: string; status: string; winnerId: number | null; notes: string | null;
  player1: SlotMatchPlayer | null; player2: SlotMatchPlayer | null;
}

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function formatJoinedAt(iso: string) {
  try { return format(new Date(iso), "d MMM, h:mm a"); } catch { return iso; }
}
function formatSlotTime(slot: TimeSlot) {
  try { return `${format(new Date(slot.startTime), "h:mm a")} – ${format(new Date(slot.endTime), "h:mm a")}`; }
  catch { return slot.label || ""; }
}
function fmtMatchId(match: { id: number; displayId?: string | null }) {
  return match.displayId ?? String(match.id).padStart(12, "0");
}
function playerName(p: SlotMatchPlayer | null, uid: number) { return p?.inGameName || `User #${uid}`; }

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

/* ─── Created Match Card ────────────────────────────────────────────────────── */

function CreatedMatchCard({
  match, timeSlots, onDelete, deleting, onViewPlayers, showSlotBadge,
}: {
  match: SlotMatch; timeSlots: TimeSlot[];
  onDelete: (id: number) => void; deleting: boolean;
  onViewPlayers: (match: SlotMatch) => void; showSlotBadge: boolean;
}) {
  const st = statusStyle(match.status);
  const p1Name = playerName(match.player1, match.player1Id);
  const p2Name = match.player2Id ? playerName(match.player2, match.player2Id) : "TBD";
  const hasWinner = match.winnerId != null;
  const slotLabel = timeSlots[match.slotIndex]
    ? `Slot ${match.slotIndex + 1} · ${format(new Date(timeSlots[match.slotIndex].startTime), "h:mm a")}`
    : `Slot ${match.slotIndex + 1}`;

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
      {/* Top: ID + slot badge + status + delete */}
      <div className="flex items-center gap-1.5 px-3 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <span className="font-mono text-[9px] text-zinc-600 tracking-widest flex-1 truncate min-w-0">
          {fmtMatchId(match)}
        </span>
        {showSlotBadge && (
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
            style={{ background: "rgba(139,92,246,0.15)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.3)" }}>
            {slotLabel}
          </span>
        )}
        <span className="flex items-center gap-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0"
          style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
          <StatusIcon s={match.status} />
          {match.status}
        </span>
        <button onClick={() => !deleting && onDelete(match.id)} disabled={deleting}
          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all active:scale-95"
          style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", opacity: deleting ? 0.5 : 1 }}
          title="Delete match">
          {deleting
            ? <div className="w-3 h-3 border border-rose-400/40 border-t-rose-400 rounded-full animate-spin" />
            : <Trash2 className="w-3 h-3 text-rose-400" />}
        </button>
      </div>

      {/* Players */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold truncate"
            style={{ color: hasWinner && match.winnerId === match.player1Id ? "#fbbf24" : "#e4e4e7" }}>
            {p1Name}{hasWinner && match.winnerId === match.player1Id && <span className="ml-1 text-[9px] text-amber-400">★</span>}
          </p>
          <p className="text-[9px] text-zinc-600">Seat A</p>
        </div>
        <div className="shrink-0 px-2 py-0.5 rounded-md text-[9px] font-black"
          style={{ background: "rgba(249,115,22,0.12)", color: "#fb923c", border: "1px solid rgba(249,115,22,0.25)" }}>VS</div>
        <div className="flex-1 min-w-0 text-right">
          <p className="text-[11px] font-bold truncate"
            style={{ color: hasWinner && match.winnerId === match.player2Id ? "#fbbf24" : match.player2Id ? "#e4e4e7" : "#52525b" }}>
            {hasWinner && match.winnerId === match.player2Id && <span className="mr-1 text-[9px] text-amber-400">★</span>}
            {p2Name}
          </p>
          <p className="text-[9px] text-zinc-600">Seat B</p>
        </div>
      </div>

      {/* Footer: time + wave + view button */}
      <div className="flex items-center gap-2 px-3 py-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <Clock className="w-2.5 h-2.5 text-zinc-600 shrink-0" />
        <span className="text-[9px] text-zinc-500 flex-1 truncate">
          {format(new Date(match.scheduledAt), "MMM d, h:mm a")}
        </span>
        <span className="text-[9px] text-zinc-600 mr-1">W{match.waveNumber}·M{match.matchNumber}</span>
        <button
          onClick={() => onViewPlayers(match)}
          className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black transition-all active:scale-95"
          style={{ background: "rgba(99,102,241,0.18)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.35)" }}>
          View <ChevronRight className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export default function AdminMatchPlayersPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;

  const [authed, setAuthed] = useState(false);
  const [players, setPlayers] = useState<Participant[]>([]);
  const [meta, setMeta] = useState<MatchMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [reassigning, setReassigning] = useState<Record<number, boolean>>({});
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"error" | "success">("error");

  const [createdMatches, setCreatedMatches] = useState<SlotMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [deletingMatchId, setDeletingMatchId] = useState<number | null>(null);

  const [filterSlot, setFilterSlot] = useState<number | null>(() => {
    try {
      const hash = window.location.hash;
      const qIdx = hash.indexOf("?");
      if (qIdx === -1) return null;
      const p = new URLSearchParams(hash.slice(qIdx + 1));
      const slot = p.get("slot");
      if (slot === null) return null;
      const n = parseInt(slot, 10);
      return isNaN(n) ? null : n;
    } catch { return null; }
  });
  const [sortBy, setSortBy] = useState<"joinTime_asc" | "joinTime_desc" | "slot" | "name">("joinTime_desc");
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session) { navigate(`/286c81443d1fb388d1b9a8e3b280824c`); return; }
    setAuthed(true);
  }, []);

  useEffect(() => {
    if (!authed || !matchId) return;
    setLoading(true);
    async function fetchData() {
      try {
        const res = await authFetchAdmin(`/admin/tournaments/${matchId}/participants`);
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem(SESSION_KEY);
          navigate(`/286c81443d1fb388d1b9a8e3b280824c`);
          return;
        }
        if (res.ok) {
          const data = await res.json() as { meta: MatchMeta; participants: Participant[] };
          setMeta(data.meta);
          setPlayers(data.participants);
        }
      } catch { } finally { setLoading(false); }
    }
    fetchData();
  }, [authed, matchId]);

  /* Fetch matches — all slots when filterSlot is null, specific slot otherwise */
  const fetchMatches = useCallback(async (tournamentId: number, slotIndex: number | null) => {
    setLoadingMatches(true);
    try {
      const url = slotIndex !== null
        ? `/admin/slots/${tournamentId}/matches?slotIndex=${slotIndex}`
        : `/admin/slots/${tournamentId}/matches`;
      const res = await authFetchAdmin(url);
      if (res.ok) setCreatedMatches(await res.json() as SlotMatch[]);
    } catch { } finally { setLoadingMatches(false); }
  }, []);

  useEffect(() => {
    if (meta?.tournamentId) void fetchMatches(meta.tournamentId, filterSlot);
    else setCreatedMatches([]);
  }, [filterSlot, meta?.tournamentId, fetchMatches]);

  const assignedUserIds = useMemo(() => {
    const s = new Set<number>();
    for (const m of createdMatches) {
      s.add(m.player1Id);
      if (m.player2Id != null) s.add(m.player2Id);
    }
    return s;
  }, [createdMatches]);

  const userMatchMap = useMemo(() => {
    const map = new Map<number, SlotMatch>();
    for (const m of createdMatches) {
      map.set(m.player1Id, m);
      if (m.player2Id != null) map.set(m.player2Id, m);
    }
    return map;
  }, [createdMatches]);

  function showToast(msg: string, type: "error" | "success" = "error") {
    setToastMsg(msg); setToastType(type);
    setTimeout(() => setToastMsg(null), 2800);
  }

  async function handleSlotChange(participantId: number, userId: number, currentSlotIndex: number, newSlot: number) {
    setReassigning(prev => ({ ...prev, [participantId]: true }));
    setPlayers(prev => prev.map(p => p.id === participantId ? { ...p, slotIndex: newSlot } : p));
    try {
      const res = await authFetchAdmin(`/admin/tournaments/${matchId}/participants/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ slotIndex: newSlot, fromSlotIndex: currentSlotIndex }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        showToast(err.error ?? "Failed to reassign slot");
        const fr = await authFetchAdmin(`/admin/tournaments/${matchId}/participants`);
        if (fr.ok) { const d = await fr.json() as { meta: MatchMeta; participants: Participant[] }; setMeta(d.meta); setPlayers(d.participants); }
      }
    } catch {
      showToast("Failed to reassign slot");
      const fr = await authFetchAdmin(`/admin/tournaments/${matchId}/participants`).catch(() => null);
      if (fr?.ok) { const d = await fr.json() as { meta: MatchMeta; participants: Participant[] }; setMeta(d.meta); setPlayers(d.participants); }
    } finally { setReassigning(prev => ({ ...prev, [participantId]: false })); }
  }

  async function handleDeleteMatch(matchDbId: number) {
    setDeletingMatchId(matchDbId);
    try {
      const res = await authFetchAdmin(`/admin/slot-matches/${matchDbId}`, { method: "DELETE" });
      if (res.ok) {
        setCreatedMatches(prev => prev.filter(m => m.id !== matchDbId));
        showToast("Match deleted", "success");
        const fr = await authFetchAdmin(`/admin/tournaments/${matchId}/participants`);
        if (fr.ok) { const d = await fr.json() as { meta: MatchMeta; participants: Participant[] }; setMeta(d.meta); setPlayers(d.participants); }
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string };
        showToast(err.error ?? "Failed to delete match");
      }
    } catch { showToast("Network error deleting match"); }
    finally { setDeletingMatchId(null); }
  }

  function handleViewMatchPlayers(m: SlotMatch) {
    navigate(`/286c81443d1fb388d1b9a8e3b280824c/matches_management/joined_players/matches/${matchId}/slot-match/${m.displayId ?? m.id}`);
  }

  /* Derived */
  const timeSlots: TimeSlot[] = meta?.timeSlots ?? [];
  const slotOptions = timeSlots.map((_, i) => i);
  const totalBookings = meta?.totalBookings ?? players.length;

  const slotPlayerCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const p of players) counts[p.slotIndex] = (counts[p.slotIndex] ?? 0) + 1;
    return counts;
  }, [players]);

  /* Matches grouped by slot (for "All Slots" view) */
  const matchesBySlot = useMemo(() => {
    if (filterSlot !== null) return null;
    const map = new Map<number, SlotMatch[]>();
    for (const m of createdMatches) {
      if (!map.has(m.slotIndex)) map.set(m.slotIndex, []);
      map.get(m.slotIndex)!.push(m);
    }
    return map;
  }, [createdMatches, filterSlot]);

  const displayedPlayers = useMemo(() => {
    let list = [...players];
    if (filterSlot !== null) list = list.filter(p => p.slotIndex === filterSlot);
    if (showUnassignedOnly) list = list.filter(p => !assignedUserIds.has(p.userId) && p.matchNumber === null);
    list.sort((a, b) => {
      if (sortBy === "joinTime_asc") return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
      if (sortBy === "joinTime_desc") return new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime();
      if (sortBy === "slot") return a.slotIndex !== b.slotIndex ? a.slotIndex - b.slotIndex : (a.inGameName || "").localeCompare(b.inGameName || "");
      if (sortBy === "name") return (a.inGameName || "").localeCompare(b.inGameName || "");
      return 0;
    });
    return list;
  }, [players, filterSlot, sortBy, showUnassignedOnly, assignedUserIds]);

  const unassignedCount = useMemo(() => {
    const base = filterSlot !== null
      ? players.filter(p => p.slotIndex === filterSlot)
      : players;
    return base.filter(p => !assignedUserIds.has(p.userId) && p.matchNumber === null).length;
  }, [players, filterSlot, assignedUserIds]);

  if (!authed) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0b" }}>
      <div className="flex flex-col items-center gap-3">
        <Lock className="w-8 h-8 text-zinc-700" />
        <p className="text-zinc-600 text-sm">Verifying session…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a0a0b" }}>

      {/* ── Header ── */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3.5 border-b"
        style={{ borderColor: "rgba(255,255,255,0.07)", background: "#0f0f10" }}>
        <button onClick={() => navigate(`/286c81443d1fb388d1b9a8e3b280824c/matches_management`)}
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-95"
          style={{ background: "rgba(255,255,255,0.06)" }}>
          <ArrowLeft className="w-4 h-4 text-zinc-400" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-white truncate">Joined Players</p>
          {meta?.title && <p className="text-[10px] text-zinc-500 truncate">{meta.title}</p>}
        </div>
        {!loading && (
          <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 shrink-0">
            {totalBookings} {totalBookings === 1 ? "booking" : "bookings"}
          </span>
        )}
      </div>

      {/* ── Summary bar ── */}
      {!loading && meta && (
        <div className="mx-4 mt-3 px-3.5 py-2.5 rounded-xl flex items-center gap-3"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(99,102,241,0.15)" }}>
            <Users className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[13px] font-bold text-white">
              {totalBookings} <span className="text-zinc-500 font-normal">total {totalBookings === 1 ? "booking" : "bookings"}</span>
            </span>
            <p className="text-[10px] text-zinc-500">
              {meta.filledSlots} unique {meta.filledSlots === 1 ? "player" : "players"} · {meta.maxSlots} max per slot
            </p>
          </div>
          <div className="w-16 h-1.5 rounded-full overflow-hidden shrink-0" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div className="h-full rounded-full" style={{
              width: `${Math.min(100, Math.round((totalBookings / Math.max(1, meta.maxSlots * Math.max(1, timeSlots.length || 1))) * 100))}%`,
              background: "linear-gradient(90deg, #6366f1, #a855f7)",
            }} />
          </div>
        </div>
      )}

      {/* ── Filter / Sort bar ── */}
      {!loading && players.length > 0 && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-xl flex items-center gap-2 flex-wrap"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500 shrink-0" />

          {/* Slot filter */}
          <div className="relative shrink-0">
            <select value={filterSlot === null ? "" : String(filterSlot)}
              onChange={e => { setFilterSlot(e.target.value === "" ? null : parseInt(e.target.value)); setShowUnassignedOnly(false); }}
              className="appearance-none text-[10px] font-semibold pl-2 pr-5 py-1 rounded-lg focus:outline-none"
              style={{
                background: filterSlot !== null ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.06)",
                border: filterSlot !== null ? "1px solid rgba(99,102,241,0.4)" : "1px solid rgba(255,255,255,0.1)",
                color: filterSlot !== null ? "#a5b4fc" : "#a1a1aa",
              }}>
              <option value="" style={{ background: "#18181b" }}>All Slots</option>
              {slotOptions.map(si => {
                const count = slotPlayerCounts[si] ?? 0;
                const slotTime = timeSlots[si] ? formatSlotTime(timeSlots[si]) : `Slot ${si + 1}`;
                return (
                  <option key={si} value={si} style={{ background: "#18181b", color: count === 0 ? "#52525b" : undefined }}>
                    {`Slot ${si + 1} (${slotTime}) · ${count}`}
                  </option>
                );
              })}
            </select>
            <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-zinc-500 pointer-events-none" />
          </div>

          {/* Unassigned toggle — always visible */}
          <button onClick={() => setShowUnassignedOnly(v => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 transition-all active:scale-95"
            style={showUnassignedOnly
              ? { background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.45)", color: "#fbbf24" }
              : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#71717a" }}>
            <UserX className="w-3 h-3" />
            Unassigned
            {unassignedCount > 0 && (
              <span className="ml-0.5 px-1 py-0 rounded-full text-[9px] font-black"
                style={showUnassignedOnly ? { background: "rgba(245,158,11,0.3)", color: "#fbbf24" } : { background: "rgba(255,255,255,0.1)", color: "#a1a1aa" }}>
                {unassignedCount}
              </span>
            )}
          </button>

          <div className="w-px h-4 shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />
          <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />

          <div className="relative shrink-0">
            <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="appearance-none text-[10px] font-semibold pl-2 pr-5 py-1 rounded-lg focus:outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#a1a1aa" }}>
              <option value="joinTime_asc" style={{ background: "#18181b" }}>Join time ↑</option>
              <option value="joinTime_desc" style={{ background: "#18181b" }}>Join time ↓</option>
              <option value="slot" style={{ background: "#18181b" }}>Slot</option>
              <option value="name" style={{ background: "#18181b" }}>Name A–Z</option>
            </select>
            <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-zinc-500 pointer-events-none" />
          </div>

          {filterSlot !== null && (
            <button onClick={() => { setFilterSlot(null); setShowUnassignedOnly(false); }}
              className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full transition-all active:scale-95 shrink-0"
              style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", color: "#a5b4fc" }}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* ── Created Matches + Decide Matches Buttons ── */}
      {!loading && meta && (
        <div className="mx-4 mt-3 flex flex-col gap-2">
          <button
            onClick={() => {
              const slotParam = filterSlot !== null ? `?slot=${filterSlot}` : "";
              navigate(`/286c81443d1fb388d1b9a8e3b280824c/matches_management/joined_players/matches/${matchId}/all-matches${slotParam}`);
            }}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.08))",
              border: "1px solid rgba(99,102,241,0.35)",
            }}
          >
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(99,102,241,0.2)" }}>
              <Swords className="w-4 h-4 text-indigo-400" />
            </div>
            <span className="flex-1 text-left text-sm font-bold text-indigo-200">Created Matches</span>
            <ChevronRight className="w-4 h-4 text-indigo-400 shrink-0" />
          </button>

          <button
            onClick={() => navigate(`/286c81443d1fb388d1b9a8e3b280824c/matches_management/joined_players/matches/${matchId}/slot/${filterSlot ?? 0}/make_matches`)}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(52,211,153,0.10))",
              border: "1px solid rgba(16,185,129,0.4)",
            }}
          >
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(16,185,129,0.25)" }}>
              <Layers className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="flex-1 text-left text-sm font-bold text-emerald-200">Decide Matches</span>
            <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0" />
          </button>
        </div>
      )}

      {/* ── Player list ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ scrollbarWidth: "none" }}>
        {filterSlot !== null && !loading && (
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-wider flex-1">
              {showUnassignedOnly ? "Unassigned Players" : "Players"}
              <span className="ml-1.5 text-zinc-600">({displayedPlayers.length})</span>
            </p>
            {showUnassignedOnly && unassignedCount === 0 && !loadingMatches && (
              <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400">
                <Check className="w-3 h-3" /> All assigned
              </span>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
          </div>
        ) : players.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Users className="w-8 h-8 text-zinc-700" />
            <p className="text-zinc-600 text-sm font-medium">No players yet</p>
          </div>
        ) : displayedPlayers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            {showUnassignedOnly
              ? <><Check className="w-8 h-8 text-emerald-600" /><p className="text-emerald-700 text-sm font-medium">All players assigned!</p></>
              : <><SlidersHorizontal className="w-8 h-8 text-zinc-700" /><p className="text-zinc-600 text-sm font-medium">No players match the filter</p></>}
          </div>
        ) : (
          displayedPlayers.map((p, i) => {
            const slotTime = timeSlots[p.slotIndex] ? formatSlotTime(timeSlots[p.slotIndex]) : null;
            const assignedMatch = userMatchMap.get(p.userId) ?? null;
            const isAssigned = assignedMatch !== null || p.matchNumber !== null;

            return (
              <div key={p.id} className="rounded-xl overflow-hidden"
                style={{
                  background: isAssigned ? "rgba(99,102,241,0.06)" : "rgba(255,255,255,0.03)",
                  border: isAssigned ? "1px solid rgba(99,102,241,0.2)" : "1px solid rgba(255,255,255,0.07)",
                }}>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-black text-zinc-400"
                    style={{ background: "rgba(255,255,255,0.06)" }}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-white truncate">{p.inGameName || "Unknown"}</p>
                    <p className="text-[10px] text-zinc-500 truncate">{p.phone}</p>
                  </div>

                  {/* View Match badge */}
                  {isAssigned && assignedMatch && (
                    <button onClick={() => handleViewMatchPlayers(assignedMatch)}
                      className="flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 transition-all active:scale-95"
                      style={{ background: "rgba(99,102,241,0.18)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.35)" }}
                      title={`Match ${fmtMatchId(assignedMatch)}`}>
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      M{assignedMatch.matchNumber}
                    </button>
                  )}
                  {isAssigned && !assignedMatch && p.matchNumber !== null && (
                    <span className="flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0"
                      style={{ background: "rgba(99,102,241,0.18)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.35)" }}>
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      M{p.matchNumber}
                    </span>
                  )}

                  {p.hasSeenCredentials && (
                    <span title="Viewed credentials" className="w-5 h-5 flex items-center justify-center rounded-full shrink-0"
                      style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }}>
                      <Eye className="w-2.5 h-2.5 text-emerald-400" />
                    </span>
                  )}
                  {p.placement !== null && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full text-amber-300 shrink-0"
                      style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)" }}>
                      #{p.placement}
                    </span>
                  )}
                  <button onClick={() => navigate(`/286c81443d1fb388d1b9a8e3b280824c/user_management/${encodeURIComponent(p.phone)}/${p.userId}`)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all active:scale-95"
                    style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}
                    title="View in User Management">
                    <ExternalLink className="w-3 h-3 text-indigo-400" />
                  </button>
                </div>

                <div className="flex items-center gap-2 px-3 pb-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <Clock className="w-3 h-3 text-zinc-600 shrink-0" />
                  <span className="text-[10px] text-zinc-500 flex-1 truncate">{formatJoinedAt(p.joinedAt)}</span>
                  {slotOptions.length > 0 ? (
                    <div className="relative shrink-0">
                      <select value={p.slotIndex} disabled={!!reassigning[p.id]}
                        onChange={e => handleSlotChange(p.id, p.userId, p.slotIndex, parseInt(e.target.value))}
                        className="appearance-none text-[10px] font-bold text-violet-300 pl-2 pr-5 py-0.5 rounded-lg focus:outline-none disabled:opacity-50"
                        style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)" }}>
                        {slotOptions.map(si => (
                          <option key={si} value={si} style={{ background: "#18181b" }}>
                            {timeSlots[si] ? `Slot ${si + 1} (${formatSlotTime(timeSlots[si])})` : `Slot ${si + 1}`}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-violet-400 pointer-events-none" />
                    </div>
                  ) : (
                    <span className="text-[10px] font-bold text-violet-300 px-2 py-0.5 rounded-lg shrink-0"
                      style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)" }}>
                      {slotTime ?? `Slot ${p.slotIndex + 1}`}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white shadow-xl z-50 whitespace-nowrap"
          style={{
            background: toastType === "success" ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)",
            backdropFilter: "blur(8px)",
          }}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
