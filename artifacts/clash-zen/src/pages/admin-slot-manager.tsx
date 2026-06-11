import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { format, addDays, startOfDay, endOfDay, isSameDay } from "date-fns";
import {
  ArrowLeft, Plus, Trash2, RefreshCw, ChevronDown, ChevronUp,
  Clock, Users, Gem, Trophy, Zap, Shield, Eye, EyeOff,
  Swords, Copy, CheckCircle, XCircle, AlertTriangle, Play,
  Pause, Lock, Unlock, Calendar, RotateCcw, Edit3, Target,
  Wifi, WifiOff, Crown,
} from "lucide-react";
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

interface Player { id: number; inGameName: string; uid: string; profilePicture: string | null; }
interface SlotMatch {
  id: number; slotId: number; waveNumber: number; matchNumber: number;
  player1Id: number; player2Id: number | null;
  player1: Player | null; player2: Player | null;
  player1Seat: string | null; player2Seat: string | null;
  roomId: string | null; roomPassword: string | null;
  roomUnlockAt: string | null; scheduledAt: string;
  status: string; winnerId: number | null; notes: string | null;
}
interface Slot {
  id: number; title: string; gameMode: string; startTime: string;
  status: string; maxSlots: number; filledSlots: number;
  entryFeeDiamonds: number; prizePoolDiamonds: number;
  matchSlug: string | null; matchSettings: string | null;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  upcoming:  { label: "Upcoming",   color: "#60a5fa", bg: "rgba(59,130,246,0.15)" },
  ongoing:   { label: "Live",       color: "#4ade80", bg: "rgba(34,197,94,0.15)"  },
  completed: { label: "Completed",  color: "#a78bfa", bg: "rgba(139,92,246,0.15)" },
  cancelled: { label: "Cancelled",  color: "#f87171", bg: "rgba(239,68,68,0.15)"  },
  paused:    { label: "Paused",     color: "#fbbf24", bg: "rgba(251,191,36,0.15)" },
};

const MATCH_STATUS_META: Record<string, { label: string; color: string }> = {
  upcoming:  { label: "Pending",   color: "#71717a" },
  live:      { label: "Live",      color: "#4ade80" },
  completed: { label: "Done",      color: "#a78bfa" },
  forfeit:   { label: "Forfeit",   color: "#f87171" },
  disputed:  { label: "Disputed",  color: "#fbbf24" },
  cancelled: { label: "Cancelled", color: "#f87171" },
  "no-show": { label: "No Show",   color: "#f87171" },
};

function groupByWave(matches: SlotMatch[]): Map<number, SlotMatch[]> {
  const map = new Map<number, SlotMatch[]>();
  for (const m of matches) {
    if (!map.has(m.waveNumber)) map.set(m.waveNumber, []);
    map.get(m.waveNumber)!.push(m);
  }
  return map;
}

function WaveCard({
  wave, matches, onUpdateMatch, onDeleteMatch,
}: {
  wave: number; matches: SlotMatch[];
  onUpdateMatch: (mid: number, body: object) => Promise<void>;
  onDeleteMatch: (mid: number) => Promise<void>;
}) {
  const waveTime = matches[0]?.scheduledAt ? new Date(matches[0].scheduledAt) : null;
  const [showRooms, setShowRooms] = useState(false);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      {/* Wave header */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "rgba(139,92,246,0.10)", borderBottom: "1px solid rgba(139,92,246,0.15)" }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-violet-300" style={{ background: "rgba(139,92,246,0.25)" }}>
            {wave}
          </div>
          <span className="text-[12px] font-bold text-violet-300">Wave {wave}</span>
          {waveTime && <span className="text-[11px] text-zinc-500">· {format(waveTime, "h:mm a")}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-600">{matches.length} match{matches.length !== 1 ? "es" : ""}</span>
          <button onClick={() => setShowRooms(v => !v)} className="text-zinc-600 hover:text-zinc-400 transition-colors p-1">
            {showRooms ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Matches */}
      <div className="divide-y divide-white/5">
        {matches.map(m => (
          <MatchRow key={m.id} match={m} showRooms={showRooms}
            onUpdate={(body) => onUpdateMatch(m.id, body)}
            onDelete={() => onDeleteMatch(m.id)}
          />
        ))}
      </div>
    </div>
  );
}

function MatchRow({ match, showRooms, onUpdate, onDelete }: {
  match: SlotMatch; showRooms: boolean;
  onUpdate: (body: object) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [roomId, setRoomId] = useState(match.roomId ?? "");
  const [roomPw, setRoomPw] = useState(match.roomPassword ?? "");
  const [editRoom, setEditRoom] = useState(false);
  const meta = MATCH_STATUS_META[match.status] ?? MATCH_STATUS_META.upcoming;

  const now = new Date();
  const isAutoNoShow = match.status === "upcoming" &&
    match.scheduledAt && new Date(match.scheduledAt).getTime() + 15 * 60 * 1000 < now.getTime();

  async function setWinner(winnerId: number | null, status: string) {
    setSaving(true);
    await onUpdate({ winnerId, status }).finally(() => setSaving(false));
  }

  async function saveRoom() {
    setSaving(true);
    await onUpdate({ roomId: roomId || null, roomPassword: roomPw || null }).finally(() => {
      setSaving(false); setEditRoom(false);
    });
  }

  return (
    <div className="px-4 py-3" style={{ opacity: match.status === "cancelled" ? 0.5 : 1 }}>
      {/* Match header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-600">M{match.matchNumber}</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: meta.color, background: `${meta.color}18` }}>
            {isAutoNoShow ? "No Show" : meta.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditRoom(v => !v)} className="text-zinc-600 hover:text-sky-400 transition-colors">
            <Edit3 className="w-3 h-3" />
          </button>
          <button onClick={onDelete} className="text-zinc-700 hover:text-red-400 transition-colors">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Players */}
      <div className="flex items-center gap-2 mb-2">
        {/* Player 1 */}
        <div className="flex-1">
          <PlayerChip player={match.player1} seat="A"
            isWinner={match.winnerId === match.player1Id}
            onClick={() => match.player1Id && setWinner(
              match.winnerId === match.player1Id ? null : match.player1Id,
              match.winnerId === match.player1Id ? "upcoming" : "completed"
            )}
          />
        </div>
        <span className="text-[10px] font-black text-zinc-700">VS</span>
        {/* Player 2 */}
        <div className="flex-1">
          {match.player2 ? (
            <PlayerChip player={match.player2} seat="B"
              isWinner={match.winnerId === match.player2Id}
              onClick={() => match.player2Id && setWinner(
                match.winnerId === match.player2Id ? null : match.player2Id,
                match.winnerId === match.player2Id ? "upcoming" : "completed"
              )}
            />
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <span className="text-[11px] text-zinc-600 italic">BYE</span>
            </div>
          )}
        </div>
      </div>

      {/* Room creds */}
      {showRooms && (match.roomId || match.roomPassword) && !editRoom && (
        <div className="flex items-center gap-3 mt-1.5 px-2.5 py-1.5 rounded-xl" style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.12)" }}>
          <Lock className="w-3 h-3 text-sky-500 shrink-0" />
          <span className="text-[11px] text-sky-300 font-mono">{match.roomId ?? "—"}</span>
          <span className="text-zinc-600 text-[10px]">|</span>
          <span className="text-[11px] text-sky-300 font-mono">{match.roomPassword ?? "—"}</span>
        </div>
      )}

      {/* Room edit */}
      {editRoom && (
        <div className="mt-2 flex gap-2">
          <input value={roomId} onChange={e => setRoomId(e.target.value)} placeholder="Room ID"
            className="flex-1 px-2.5 py-1.5 rounded-xl text-[12px] text-white bg-white/5 border border-white/10 outline-none focus:border-sky-500/40" />
          <input value={roomPw} onChange={e => setRoomPw(e.target.value)} placeholder="Password"
            className="flex-1 px-2.5 py-1.5 rounded-xl text-[12px] text-white bg-white/5 border border-white/10 outline-none focus:border-sky-500/40" />
          <button onClick={saveRoom} disabled={saving}
            className="px-3 py-1.5 rounded-xl text-[11px] font-bold text-sky-300 transition-all active:scale-95"
            style={{ background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.25)" }}>
            {saving ? "…" : "Save"}
          </button>
        </div>
      )}

      {/* Quick status actions */}
      {match.status !== "completed" && match.status !== "cancelled" && (
        <div className="flex gap-1.5 mt-2">
          {["disputed", "forfeit", "no-show", "cancelled"].map(s => (
            <button key={s} onClick={() => onUpdate({ status: s })}
              className="px-2 py-1 rounded-lg text-[10px] font-bold transition-all active:scale-95"
              style={{
                background: match.status === s ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${match.status === s ? "rgba(239,68,68,0.35)" : "rgba(255,255,255,0.08)"}`,
                color: match.status === s ? "#f87171" : "#52525b",
              }}>
              {s === "no-show" ? "No Show" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerChip({ player, seat, isWinner, onClick }: {
  player: Player | null; seat: string; isWinner: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-all active:scale-95 text-left"
      style={{
        background: isWinner ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${isWinner ? "rgba(34,197,94,0.30)" : "rgba(255,255,255,0.06)"}`,
      }}>
      <span className="text-[9px] font-black px-1 py-0.5 rounded" style={{ background: isWinner ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.08)", color: isWinner ? "#4ade80" : "#52525b" }}>
        {seat}
      </span>
      {player ? (
        <>
          <span className="text-[11px] font-semibold text-white truncate">{player.inGameName}</span>
          {isWinner && <Crown className="w-3 h-3 text-yellow-400 ml-auto shrink-0" />}
        </>
      ) : (
        <span className="text-[11px] text-zinc-600">—</span>
      )}
    </button>
  );
}

function GenerateMatchmakingSheet({ slot, onGenerated, onClose }: {
  slot: Slot; onGenerated: () => void; onClose: () => void;
}) {
  const [waveSize, setWaveSize] = useState(3);
  const [waveInterval, setWaveInterval] = useState(10);
  const [unlockMins, setUnlockMins] = useState(2);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function generate() {
    setLoading(true);
    try {
      const res = await authFetchAdmin(`/admin/slots/${slot.id}/generate-matchmaking`, {
        method: "POST",
        body: JSON.stringify({ waveSize, waveIntervalMinutes: waveInterval, roomUnlockMinutes: unlockMins }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({ title: `Matchmaking generated!`, description: `${data.matches} matches · ${data.waves} waves${data.byePlayerId ? " · 1 BYE" : ""}` });
      onGenerated();
      onClose();
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div className="relative w-full rounded-t-3xl p-5 space-y-5"
        style={{ background: "linear-gradient(180deg,#0e0a1a,#08051a)", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", animation: "slideUp 0.25s cubic-bezier(0.32,0.72,0,1)" }}>
        <div className="flex justify-center mb-1"><div className="w-10 h-1 rounded-full bg-white/20" /></div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(139,92,246,0.18)", border: "1px solid rgba(139,92,246,0.3)" }}>
            <Swords className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Generate</p>
            <p className="text-base font-extrabold text-white">1v1 Matchmaking</p>
          </div>
        </div>

        <div className="rounded-2xl p-3 space-y-1" style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.12)" }}>
          <p className="text-[11px] text-sky-400 font-bold">{slot.title}</p>
          <p className="text-[10px] text-zinc-500">{format(new Date(slot.startTime), "EEE, MMM d · h:mm a")} · {slot.filledSlots} players registered</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Matches / Wave", value: waveSize, min: 1, max: 10, set: setWaveSize },
            { label: "Wave Gap (min)", value: waveInterval, min: 1, max: 60, set: setWaveInterval },
            { label: "Room Unlock (min before)", value: unlockMins, min: 1, max: 10, set: setUnlockMins },
          ].map(({ label, value, min, max, set }) => (
            <div key={label}>
              <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">{label}</p>
              <div className="flex items-center gap-1">
                <button onClick={() => set(v => Math.max(min, v - 1))}
                  className="w-7 h-7 rounded-lg text-zinc-400 font-bold text-sm flex items-center justify-center active:scale-90"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>−</button>
                <span className="flex-1 text-center text-[14px] font-black text-white">{value}</span>
                <button onClick={() => set(v => Math.min(max, v + 1))}
                  className="w-7 h-7 rounded-lg text-zinc-400 font-bold text-sm flex items-center justify-center active:scale-90"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>+</button>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl px-3 py-2.5 text-[11px] text-zinc-500" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
          {slot.filledSlots} players → <span className="text-white font-bold">{Math.floor(slot.filledSlots / 2)} matches</span> · <span className="text-white font-bold">{Math.ceil(Math.floor(slot.filledSlots / 2) / waveSize)} waves</span>
          {slot.filledSlots % 2 !== 0 && <span className="text-amber-400 font-bold"> · 1 BYE</span>}
        </div>

        <button onClick={generate} disabled={loading || slot.filledSlots < 2}
          className="w-full py-3.5 rounded-2xl text-[14px] font-extrabold text-white transition-all active:scale-[0.98] disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)", boxShadow: "0 0 20px rgba(124,58,237,0.4)" }}>
          {loading ? "Generating…" : "Generate Matchmaking"}
        </button>
        <div className="pb-2" />
      </div>
    </div>
  );
}

function AddSlotSheet({ onAdded, onClose }: { onAdded: () => void; onClose: () => void }) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState(today);
  const [enabledSlots, setEnabledSlots] = useState<number[]>([18, 19, 20, 21, 22]);
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [entryFee, setEntryFee] = useState(0);
  const [prize, setPrize] = useState(0);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const SLOT_OPTIONS = [
    { hour: 18, label: "6:00 PM" },
    { hour: 19, label: "7:00 PM" },
    { hour: 20, label: "8:00 PM" },
    { hour: 21, label: "9:00 PM" },
    { hour: 22, label: "10:00 PM" },
  ];

  function toggleSlot(h: number) {
    setEnabledSlots(prev => prev.includes(h) ? prev.filter(x => x !== h) : [...prev, h].sort((a, b) => a - b));
  }

  async function create() {
    if (!date || enabledSlots.length === 0) {
      toast({ title: "Pick a date and at least one slot", variant: "destructive" }); return;
    }
    setLoading(true);
    const pad = (n: number) => String(n).padStart(2, "0");
    const created: number[] = [];
    const failed: number[] = [];
    for (const hour of enabledSlots) {
      const startTime = new Date(`${date}T${pad(hour)}:00:00`).toISOString();
      const title = `Lone Wolf 1v1 · ${format(new Date(startTime), "h:mm a")}`;
      const ms = JSON.stringify({ enabledSlots, waveSize: 3, waveIntervalMinutes: 10, roomUnlockMinutes: 2 });
      const res = await authFetchAdmin("/admin/tournaments", {
        method: "POST",
        body: JSON.stringify({
          title, gameMode: "Knockout", startTime, status: "upcoming",
          maxSlots: maxPlayers, entryFeeDiamonds: entryFee, prizePoolDiamonds: prize,
          matchSettings: ms,
        }),
      });
      if (res.ok) created.push(hour);
      else failed.push(hour);
    }
    setLoading(false);
    if (created.length > 0) {
      toast({ title: `${created.length} slot${created.length > 1 ? "s" : ""} created!` });
      onAdded(); onClose();
    } else {
      toast({ title: "Failed to create slots", variant: "destructive" });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div className="relative w-full rounded-t-3xl p-5 space-y-5 max-h-[85vh] overflow-y-auto"
        style={{ background: "linear-gradient(180deg,#0e0a1a,#080510)", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", animation: "slideUp 0.25s cubic-bezier(0.32,0.72,0,1)" }}>
        <div className="flex justify-center"><div className="w-10 h-1 rounded-full bg-white/20" /></div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.25)" }}>
            <Plus className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">New</p>
            <p className="text-base font-extrabold text-white">Add Slots</p>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Date</p>
          <div className="flex gap-2 mb-2 flex-wrap">
            {[0, 1, 2, 3].map(d => {
              const dt = format(addDays(new Date(), d), "yyyy-MM-dd");
              const label = d === 0 ? "Today" : d === 1 ? "Tomorrow" : format(addDays(new Date(), d), "MMM d");
              return (
                <button key={d} onClick={() => setDate(dt)}
                  className="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                  style={{
                    background: date === dt ? "rgba(56,189,248,0.15)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${date === dt ? "rgba(56,189,248,0.40)" : "rgba(255,255,255,0.08)"}`,
                    color: date === dt ? "#7dd3fc" : "#71717a",
                  }}>{label}</button>
              );
            })}
          </div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl text-[13px] text-white bg-white/5 border border-white/10 outline-none focus:border-sky-500/40"
            style={{ colorScheme: "dark" }} />
        </div>

        <div>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Time Slots</p>
          <div className="flex flex-wrap gap-2">
            {SLOT_OPTIONS.map(s => {
              const on = enabledSlots.includes(s.hour);
              return (
                <button key={s.hour} onClick={() => toggleSlot(s.hour)}
                  className="px-3.5 py-2 rounded-xl text-[12px] font-bold transition-all active:scale-95"
                  style={{
                    background: on ? "rgba(139,92,246,0.18)" : "rgba(255,255,255,0.04)",
                    border: `1.5px solid ${on ? "rgba(139,92,246,0.50)" : "rgba(255,255,255,0.08)"}`,
                    color: on ? "#c4b5fd" : "#52525b",
                  }}>{s.label}</button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Max Players", value: maxPlayers, set: setMaxPlayers, min: 2 },
            { label: "Entry (💎)", value: entryFee, set: setEntryFee, min: 0 },
            { label: "Prize (💎)", value: prize, set: setPrize, min: 0 },
          ].map(({ label, value, set, min }) => (
            <div key={label}>
              <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">{label}</p>
              <div className="flex items-center gap-1">
                <button onClick={() => set(v => Math.max(min, v - (label.includes("Entry") || label.includes("Prize") ? 5 : 2)))}
                  className="w-7 h-7 rounded-lg text-zinc-400 font-bold text-sm flex items-center justify-center active:scale-90"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>−</button>
                <span className="flex-1 text-center text-[13px] font-black text-white">{value}</span>
                <button onClick={() => set(v => v + (label.includes("Entry") || label.includes("Prize") ? 5 : 2))}
                  className="w-7 h-7 rounded-lg text-zinc-400 font-bold text-sm flex items-center justify-center active:scale-90"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>+</button>
              </div>
            </div>
          ))}
        </div>

        <button onClick={create} disabled={loading || enabledSlots.length === 0}
          className="w-full py-3.5 rounded-2xl text-[14px] font-extrabold text-white transition-all active:scale-[0.98] disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#059669,#047857)", boxShadow: "0 0 20px rgba(5,150,105,0.35)" }}>
          {loading ? "Creating…" : `Create ${enabledSlots.length} Slot${enabledSlots.length !== 1 ? "s" : ""}`}
        </button>
        <div className="pb-2" />
      </div>
    </div>
  );
}

function SlotCard({
  slot, onRefresh, onNavigateEdit,
}: {
  slot: Slot;
  onRefresh: () => void;
  onNavigateEdit: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [matches, setMatches] = useState<SlotMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [showGenSheet, setShowGenSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const sm = STATUS_META[slot.status] ?? STATUS_META.upcoming;
  const hasMatchmaking = matches.length > 0;
  const waves = groupByWave(matches);

  async function loadMatches() {
    setLoadingMatches(true);
    try {
      const res = await authFetchAdmin(`/admin/slots/${slot.id}/matches`);
      if (res.ok) setMatches(await res.json());
    } finally { setLoadingMatches(false); }
  }

  async function toggleExpand() {
    if (!expanded) await loadMatches();
    setExpanded(v => !v);
  }

  async function clearMatchmaking() {
    if (!confirm("Clear all matchmaking for this slot? This cannot be undone.")) return;
    setSaving(true);
    try {
      await authFetchAdmin(`/admin/slots/${slot.id}/clear-matchmaking`, { method: "POST" });
      setMatches([]);
      toast({ title: "Matchmaking cleared" });
    } finally { setSaving(false); }
  }

  async function updateStatus(status: string) {
    setSaving(true);
    try {
      const res = await authFetchAdmin(`/admin/tournaments/${slot.id}`, {
        method: "PUT", body: JSON.stringify({ status }),
      });
      if (res.ok) { onRefresh(); toast({ title: `Slot marked as ${status}` }); }
    } finally { setSaving(false); }
  }

  async function deleteSlot() {
    if (!confirm("Delete this slot? Players will be refunded.")) return;
    setSaving(true);
    try {
      const res = await authFetchAdmin(`/admin/tournaments/${slot.id}`, { method: "DELETE", body: JSON.stringify({}) });
      if (res.ok) { onRefresh(); toast({ title: "Slot deleted" }); }
    } finally { setSaving(false); }
  }

  async function updateMatch(mid: number, body: object) {
    const res = await authFetchAdmin(`/admin/slot-matches/${mid}`, { method: "PATCH", body: JSON.stringify(body) });
    if (res.ok) {
      const updated = await res.json() as SlotMatch;
      setMatches(prev => prev.map(m => m.id === mid ? updated : m));
    }
  }

  async function deleteMatch(mid: number) {
    if (!confirm("Delete this match?")) return;
    await authFetchAdmin(`/admin/slot-matches/${mid}`, { method: "DELETE" });
    setMatches(prev => prev.filter(m => m.id !== mid));
  }

  const slotTime = new Date(slot.startTime);
  const fillPct = slot.maxSlots > 0 ? Math.min(100, (slot.filledSlots / slot.maxSlots) * 100) : 0;

  return (
    <>
      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
        {/* Slot header */}
        <div className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl shrink-0"
                style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.20)" }}>
                <span className="text-[16px] font-black text-violet-300 leading-none">{format(slotTime, "h")}</span>
                <span className="text-[9px] font-bold text-zinc-500 leading-none">{format(slotTime, "a")}</span>
              </div>
              <div>
                <p className="text-[13px] font-extrabold text-white leading-tight">{slot.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: sm.color, background: sm.bg }}>
                    {sm.label}
                  </span>
                  {matches.length > 0 && (
                    <span className="text-[10px] text-violet-400 font-semibold">· {matches.length} matches</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => onNavigateEdit(slot.id)} className="p-1.5 rounded-xl text-zinc-600 hover:text-zinc-300 transition-colors" style={{ background: "rgba(255,255,255,0.04)" }}>
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button onClick={deleteSlot} disabled={saving} className="p-1.5 rounded-xl text-zinc-700 hover:text-red-400 transition-colors" style={{ background: "rgba(255,255,255,0.04)" }}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-xl px-2.5 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider">Players</p>
              <p className="text-[13px] font-black text-white">{slot.filledSlots}<span className="text-zinc-600 font-normal text-[10px]">/{slot.maxSlots}</span></p>
            </div>
            <div className="rounded-xl px-2.5 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider">Entry</p>
              <p className="text-[13px] font-black text-white">{slot.entryFeeDiamonds > 0 ? `💎${slot.entryFeeDiamonds}` : "Free"}</p>
            </div>
            <div className="rounded-xl px-2.5 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider">Prize</p>
              <p className="text-[13px] font-black text-white">{slot.prizePoolDiamonds > 0 ? `💎${slot.prizePoolDiamonds}` : "—"}</p>
            </div>
          </div>

          {/* Fill bar */}
          <div className="h-1 rounded-full overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${fillPct}%`, background: fillPct >= 90 ? "#f87171" : fillPct >= 60 ? "#fbbf24" : "#4ade80" }} />
          </div>

          {/* Action row */}
          <div className="flex gap-2">
            <button onClick={() => setShowGenSheet(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-bold transition-all active:scale-95"
              style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.30)", color: "#c4b5fd" }}>
              <Swords className="w-3.5 h-3.5" /> Generate Matchmaking
            </button>
            <button onClick={toggleExpand}
              className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-[12px] font-bold transition-all active:scale-95"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#71717a" }}>
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {expanded ? "Hide" : "Matches"}
            </button>
          </div>

          {/* Quick status */}
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {["upcoming", "ongoing", "completed", "paused", "cancelled"].map(s => (
              <button key={s} onClick={() => updateStatus(s)} disabled={slot.status === s || saving}
                className="px-2 py-1 rounded-lg text-[10px] font-bold transition-all active:scale-95 disabled:opacity-40"
                style={{
                  background: slot.status === s ? `${STATUS_META[s]?.bg ?? "rgba(255,255,255,0.08)"}` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${slot.status === s ? STATUS_META[s]?.color + "40" : "rgba(255,255,255,0.07)"}`,
                  color: slot.status === s ? STATUS_META[s]?.color : "#52525b",
                }}>
                {STATUS_META[s]?.label ?? s}
              </button>
            ))}
          </div>
        </div>

        {/* Expanded match view */}
        {expanded && (
          <div className="border-t border-white/5 p-4 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Matches by Wave</p>
              <div className="flex items-center gap-2">
                {matches.length > 0 && (
                  <button onClick={clearMatchmaking} disabled={saving}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-red-400 transition-all active:scale-95"
                    style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.20)" }}>
                    <RotateCcw className="w-3 h-3" /> Clear
                  </button>
                )}
                <button onClick={loadMatches} disabled={loadingMatches} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingMatches ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {loadingMatches && <div className="text-center py-4 text-zinc-600 text-[12px]">Loading matches…</div>}
            {!loadingMatches && matches.length === 0 && (
              <div className="text-center py-6">
                <Swords className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                <p className="text-[12px] text-zinc-600">No matchmaking generated yet</p>
                <p className="text-[11px] text-zinc-700 mt-1">Click "Generate Matchmaking" to pair players</p>
              </div>
            )}
            {!loadingMatches && waves.size > 0 && (
              <div className="space-y-3">
                {Array.from(waves.entries()).sort(([a], [b]) => a - b).map(([wave, wmatches]) => (
                  <WaveCard key={wave} wave={wave} matches={wmatches}
                    onUpdateMatch={updateMatch}
                    onDeleteMatch={deleteMatch}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showGenSheet && (
        <GenerateMatchmakingSheet slot={slot}
          onGenerated={() => { loadMatches(); setExpanded(true); }}
          onClose={() => setShowGenSheet(false)}
        />
      )}
    </>
  );
}

export default function AdminSlotManager() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [session] = useState(getSession);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddSheet, setShowAddSheet] = useState(false);

  useEffect(() => {
    if (!session) { navigate(SA_PATH); return; }
  }, [session, navigate]);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetchAdmin("/admin/tournaments");
      if (!res.ok) return;
      const all: Slot[] = await res.json();
      const dayStart = startOfDay(selectedDate).getTime();
      const dayEnd = endOfDay(selectedDate).getTime();
      const filtered = all
        .filter(s => {
          const t = new Date(s.startTime).getTime();
          return t >= dayStart && t <= dayEnd;
        })
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      setSlots(filtered);
    } finally { setLoading(false); }
  }, [selectedDate]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  const dateTabs = [-1, 0, 1, 2].map(d => addDays(new Date(), d));

  return (
    <div className="min-h-screen pb-32" style={{ background: "linear-gradient(180deg,#080510 0%,#05030d 100%)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={() => navigate(SA_PATH)} className="p-2 rounded-xl text-zinc-400 hover:text-white transition-colors" style={{ background: "rgba(255,255,255,0.05)" }}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Admin</p>
          <p className="text-[17px] font-extrabold text-white">Slot Manager</p>
        </div>
        <button onClick={() => setShowAddSheet(true)} className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold text-emerald-400 transition-all active:scale-95"
          style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)" }}>
          <Plus className="w-3.5 h-3.5" /> Add Slots
        </button>
      </div>

      {/* Date tabs */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto">
        {dateTabs.map(dt => {
          const isSelected = isSameDay(dt, selectedDate);
          const label = isSameDay(dt, new Date()) ? "Today"
            : isSameDay(dt, addDays(new Date(), -1)) ? "Yesterday"
            : isSameDay(dt, addDays(new Date(), 1)) ? "Tomorrow"
            : format(dt, "MMM d");
          return (
            <button key={dt.toISOString()} onClick={() => setSelectedDate(dt)}
              className="shrink-0 px-4 py-2 rounded-xl text-[12px] font-bold transition-all active:scale-95"
              style={{
                background: isSelected ? "rgba(139,92,246,0.18)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${isSelected ? "rgba(139,92,246,0.40)" : "rgba(255,255,255,0.07)"}`,
                color: isSelected ? "#c4b5fd" : "#52525b",
              }}>{label}</button>
          );
        })}
        <input type="date" value={format(selectedDate, "yyyy-MM-dd")} onChange={e => setSelectedDate(new Date(e.target.value + "T12:00:00"))}
          className="shrink-0 px-3 py-2 rounded-xl text-[11px] text-zinc-400 bg-white/4 border border-white/8 outline-none"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", colorScheme: "dark" }} />
      </div>

      {/* Slot list */}
      <div className="px-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold text-zinc-600 uppercase tracking-widest">
            {format(selectedDate, "EEEE, MMMM d")} · {slots.length} slot{slots.length !== 1 ? "s" : ""}
          </p>
          <button onClick={loadSlots} disabled={loading} className="text-zinc-600 hover:text-zinc-400 transition-colors p-1">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-36 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar className="w-10 h-10 text-zinc-700 mb-3" />
            <p className="text-[14px] font-bold text-zinc-600">No slots on this day</p>
            <p className="text-[12px] text-zinc-700 mt-1">Tap "Add Slots" to create sessions</p>
            <button onClick={() => setShowAddSheet(true)}
              className="mt-4 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-bold text-emerald-400"
              style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.22)" }}>
              <Plus className="w-3.5 h-3.5" /> Add Slots
            </button>
          </div>
        ) : (
          slots.map(slot => (
            <SlotCard key={slot.id} slot={slot}
              onRefresh={loadSlots}
              onNavigateEdit={id => navigate(`/286c81443d1fb388d1b9a8e3b280824c/matches_management/knockout/edit/${id}`)}
            />
          ))
        )}
      </div>

      {/* Add slot sheet */}
      {showAddSheet && <AddSlotSheet onAdded={loadSlots} onClose={() => setShowAddSheet(false)} />}
    </div>
  );
}
