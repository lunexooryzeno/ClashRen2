import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Lock, Plus, Trash2, ChevronDown, X, Search,
  Calendar, Clock, Shuffle, AlertTriangle, UserX, CheckCircle2,
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
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { "x-super-admin-token": session.token } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  return res;
}

interface Participant {
  id: number;
  userId: number;
  inGameName: string | null;
  phone: string;
  kills: number;
  placement: number | null;
  slotIndex: number;
  joinedAt: string;
  hasSeenCredentials: boolean;
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  label: string;
}

interface MatchMeta {
  tournamentId: number;
  title: string;
  maxSlots: number;
  filledSlots: number;
  uniqueSlotCount: number;
  totalBookings: number;
  timeSlots: TimeSlot[];
}

type MatchType = "1v1" | "2v2" | "4v4";

const MATCH_TYPE_SIZES: Record<MatchType, number> = {
  "1v1": 1,
  "2v2": 2,
  "4v4": 4,
};

function formatSlotTime(slot: TimeSlot): string {
  try {
    const start = format(new Date(slot.startTime), "h:mm a");
    const end = format(new Date(slot.endTime), "h:mm a");
    return `${start} – ${end}`;
  } catch {
    return slot.label || "";
  }
}

interface MatchRow {
  id: string;
  teamA: (number | null)[];
  teamB: (number | null)[];
  scheduledTime: string | null;
}

function makeEmptyRow(type: MatchType): MatchRow {
  const size = MATCH_TYPE_SIZES[type];
  return {
    id: Math.random().toString(36).slice(2),
    teamA: Array(size).fill(null),
    teamB: Array(size).fill(null),
    scheduledTime: null,
  };
}

/* ─── Shuffle Utilities ──────────────────────────────────────── */

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildShuffledRows(
  playerIds: number[],
  matchType: MatchType,
): { newRows: MatchRow[]; unassigned: number[] } {
  const size = MATCH_TYPE_SIZES[matchType];
  const perMatch = size * 2;
  const shuffled = shuffleArray(playerIds);
  const newRows: MatchRow[] = [];

  for (let i = 0; i + perMatch <= shuffled.length; i += perMatch) {
    const group = shuffled.slice(i, i + perMatch);
    newRows.push({
      id: Math.random().toString(36).slice(2),
      teamA: group.slice(0, size),
      teamB: group.slice(size, perMatch),
      scheduledTime: null,
    });
  }

  const unassigned = shuffled.slice(newRows.length * perMatch);
  return { newRows, unassigned };
}

/* ─── Confirmation Dialog ────────────────────────────────────── */

interface ConfirmDialogProps {
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ message, confirmLabel = "Confirm", onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "#131316",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.3)" }}
          >
            <AlertTriangle className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <p className="text-[13px] font-black text-white mb-1">Replace Matches?</p>
            <p className="text-[11px] text-zinc-400 leading-relaxed">{message}</p>
          </div>
        </div>
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-95"
            style={{ background: "rgba(255,255,255,0.06)", color: "#a1a1aa" }}
          >
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(); }}
            className="flex-1 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg,#f97316,#ea580c)", color: "#fff" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Unassigned Warning Dialog ─────────────────────────────── */

interface UnassignedWarningDialogProps {
  players: { userId: number; name: string; phone: string }[];
  onSaveAnyway: () => void;
  onGoBack: () => void;
}

function UnassignedWarningDialog({ players, onSaveAnyway, onGoBack }: UnassignedWarningDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(6px)" }}
      onClick={onGoBack}
    >
      <div
        className="w-full max-w-xs rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "#131316",
          border: "1px solid rgba(245,158,11,0.3)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.35)" }}
          >
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-black text-white mb-1">Unassigned Players</p>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              {players.length} {players.length === 1 ? "player has" : "players have"} no match assigned. They will be left out if you save now.
            </p>
          </div>
        </div>
        <div className="px-5 pb-3 flex flex-col gap-1" style={{ maxHeight: 180, overflowY: "auto", scrollbarWidth: "none" }}>
          {players.map((p) => (
            <div
              key={p.userId}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl"
              style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.15)" }}
            >
              <div
                className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-[9px] font-black text-amber-300"
                style={{ background: "rgba(245,158,11,0.2)" }}
              >
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-white truncate">{p.name}</p>
                <p className="text-[9px] text-zinc-500 truncate">{p.phone}</p>
              </div>
            </div>
          ))}
        </div>
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          <button
            onClick={onGoBack}
            className="flex-1 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-95"
            style={{ background: "rgba(255,255,255,0.06)", color: "#a1a1aa" }}
          >
            Go Back
          </button>
          <button
            onClick={onSaveAnyway}
            className="flex-1 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg,#d97706,#b45309)", color: "#fff" }}
          >
            Save Anyway
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Assign To Slot Picker ──────────────────────────────────── */

interface EmptySlotEntry {
  rowIdx: number;
  team: "teamA" | "teamB";
  slotIdx: number;
  label: string;
}

interface AssignSlotPickerProps {
  player: Participant;
  rows: MatchRow[];
  matchType: MatchType;
  onAssign: (rowIdx: number, team: "teamA" | "teamB", slotIdx: number) => void;
  onClose: () => void;
}

function AssignSlotPicker({ player, rows, matchType, onAssign, onClose }: AssignSlotPickerProps) {
  const emptySlots = useMemo<EmptySlotEntry[]>(() => {
    const slots: EmptySlotEntry[] = [];
    const size = MATCH_TYPE_SIZES[matchType];
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      row.teamA.forEach((v, si) => {
        if (v === null) {
          slots.push({
            rowIdx: ri, team: "teamA", slotIdx: si,
            label: size > 1
              ? `Match ${ri + 1} · Team A · Slot ${si + 1}`
              : `Match ${ri + 1} · Team A`,
          });
        }
      });
      row.teamB.forEach((v, si) => {
        if (v === null) {
          slots.push({
            rowIdx: ri, team: "teamB", slotIdx: si,
            label: size > 1
              ? `Match ${ri + 1} · Team B · Slot ${si + 1}`
              : `Match ${ri + 1} · Team B`,
          });
        }
      });
    }
    return slots;
  }, [rows, matchType]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl overflow-hidden flex flex-col"
        style={{
          background: "#131316",
          border: "1px solid rgba(255,255,255,0.1)",
          borderBottom: "none",
          boxShadow: "0 -24px 60px rgba(0,0,0,0.7)",
          maxHeight: "60vh",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.12)" }} />
        </div>
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div>
            <p className="text-[13px] font-black text-white">Assign to Slot</p>
            <p className="text-[11px] text-violet-400 font-semibold">
              {player.inGameName || player.phone}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <X className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 py-1" style={{ scrollbarWidth: "none" }}>
          {emptySlots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <p className="text-zinc-600 text-[12px]">No empty slots available.</p>
              <p className="text-zinc-700 text-[11px]">Add a new match row first.</p>
            </div>
          ) : (
            emptySlots.map((slot, i) => (
              <button
                key={i}
                onClick={() => { onAssign(slot.rowIdx, slot.team, slot.slotIdx); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 transition-all active:bg-white/5"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black"
                  style={{
                    background: slot.team === "teamA" ? "rgba(99,102,241,0.18)" : "rgba(249,115,22,0.15)",
                    color: slot.team === "teamA" ? "#a5b4fc" : "#fb923c",
                  }}
                >
                  {slot.team === "teamA" ? "A" : "B"}
                </div>
                <span className="text-[12px] font-semibold text-white">{slot.label}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Time Picker Modal ──────────────────────────────────────── */

interface TimePickerModalProps {
  initialIso: string | null;
  slotDate: Date;
  onDone: (iso: string) => void;
  onClear: () => void;
  onClose: () => void;
}

function TimePickerModal({ initialIso, slotDate, onDone, onClear, onClose }: TimePickerModalProps) {
  const initTime = useMemo(() => {
    if (initialIso) {
      const d = new Date(initialIso);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    }
    return "";
  }, [initialIso]);

  const [timeVal, setTimeVal] = useState(initTime);

  function buildIso() {
    const [hh, mm] = timeVal.split(":").map(Number);
    const date = new Date(slotDate);
    date.setHours(hh, mm, 0, 0);
    return date.toISOString();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-2xl overflow-hidden flex flex-col"
        style={{ background: "#131316", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 60px rgba(0,0,0,0.7)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4">
          <p className="text-[13px] font-black text-white mb-4">Set Start Time</p>
          <input
            type="time"
            value={timeVal}
            onChange={e => setTimeVal(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-[16px] font-bold text-white outline-none"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.13)", colorScheme: "dark" }}
          />
        </div>
        <div className="flex items-center gap-2 px-5 pb-5">
          <button
            onClick={() => { onClear(); onClose(); }}
            className="flex-1 py-2.5 rounded-xl text-[12px] font-bold"
            style={{ background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            Clear
          </button>
          <button
            onClick={() => { if (timeVal) { onDone(buildIso()); onClose(); } }}
            disabled={!timeVal}
            className="flex-1 py-2.5 rounded-xl text-[12px] font-bold"
            style={{ background: timeVal ? "#3f3f46" : "rgba(255,255,255,0.04)", color: timeVal ? "#fff" : "#52525b" }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Player Picker ──────────────────────────────────────────── */

interface PlayerPickerProps {
  players: Participant[];
  selectedId: number | null;
  usedIds: Set<number>;
  onSelect: (id: number | null) => void;
  onClose: () => void;
}

function PlayerPicker({ players, selectedId, usedIds, onSelect, onClose }: PlayerPickerProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter(p =>
      (p.inGameName || "").toLowerCase().includes(q) ||
      p.phone.toLowerCase().includes(q)
    );
  }, [players, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden flex flex-col"
        style={{ background: "#131316", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "70vh", boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3.5 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div>
            <p className="text-[13px] font-black text-white">Select Player</p>
            <p className="text-[10px] text-zinc-500">{players.length} available</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-95" style={{ background: "rgba(255,255,255,0.06)" }}>
            <X className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>
        <div className="px-4 py-2.5 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
            <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder="Search by name or phone…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-[12px] text-white placeholder-zinc-600 focus:outline-none"
            />
            {query && (
              <button onClick={() => setQuery("")} className="shrink-0">
                <X className="w-3 h-3 text-zinc-500" />
              </button>
            )}
          </div>
        </div>
        <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: "none" }}>
          {selectedId !== null && !query && (
            <button
              onClick={() => { onSelect(null); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors active:bg-white/5"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
            >
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
                <X className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <span className="text-[12px] text-rose-400 font-semibold">Clear selection</span>
            </button>
          )}
          {players.length === 0 && (
            <div className="py-10 text-center text-zinc-600 text-[12px]">No available players</div>
          )}
          {filtered.length === 0 && players.length > 0 && (
            <div className="py-10 text-center text-zinc-600 text-[12px]">No players match "{query}"</div>
          )}
          {filtered.map(p => {
            const alreadyUsed = usedIds.has(p.userId) && p.userId !== selectedId;
            const isSelected = p.userId === selectedId;
            return (
              <button
                key={p.userId}
                disabled={alreadyUsed}
                onClick={() => { if (!alreadyUsed) { onSelect(p.userId); onClose(); } }}
                className="w-full flex items-center gap-3 px-4 py-2.5 transition-all active:bg-white/5"
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  background: isSelected ? "rgba(99,102,241,0.08)" : "transparent",
                  opacity: alreadyUsed ? 0.35 : 1,
                }}
              >
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-[11px] font-black"
                  style={{
                    background: isSelected ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.06)",
                    color: isSelected ? "#a5b4fc" : "#71717a",
                    border: isSelected ? "1px solid rgba(99,102,241,0.4)" : "none",
                  }}
                >
                  {(p.inGameName || p.phone).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[12px] font-semibold text-white truncate">{p.inGameName || "Unknown"}</p>
                  <p className="text-[10px] text-zinc-500 truncate">{p.phone}</p>
                </div>
                {isSelected && (
                  <span className="text-[9px] font-bold text-indigo-400 px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "rgba(99,102,241,0.2)" }}>
                    Selected
                  </span>
                )}
                {alreadyUsed && (
                  <span className="text-[9px] font-bold text-zinc-600 shrink-0">In use</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface PlayerSlotButtonProps {
  playerId: number | null;
  players: Participant[];
  usedIds: Set<number>;
  onSelect: (id: number | null) => void;
}

function PlayerSlotButton({ playerId, players, usedIds, onSelect }: PlayerSlotButtonProps) {
  const [open, setOpen] = useState(false);
  const player = playerId !== null ? players.find(p => p.userId === playerId) ?? null : null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex-1 min-w-0 flex items-center gap-1.5 px-2.5 py-2 rounded-xl transition-all active:scale-95"
        style={{
          background: player ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.04)",
          border: player ? "1px solid rgba(99,102,241,0.35)" : "1px solid rgba(255,255,255,0.08)",
          minWidth: 0,
        }}
      >
        <span className="text-[11px] font-semibold truncate" style={{ color: player ? "#a5b4fc" : "#52525b" }}>
          {player ? (player.inGameName || player.phone) : "Select Player"}
        </span>
        <ChevronDown className="w-3 h-3 shrink-0" style={{ color: player ? "#818cf8" : "#3f3f46" }} />
      </button>
      {open && (
        <PlayerPicker
          players={players}
          selectedId={playerId}
          usedIds={usedIds}
          onSelect={onSelect}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/* ─── Match Row Card ─────────────────────────────────────────── */

interface MatchRowCardProps {
  row: MatchRow;
  index: number;
  matchType: MatchType;
  players: Participant[];
  allUsedIds: Set<number>;
  timeSlot: TimeSlot | null;
  onUpdate: (updated: MatchRow) => void;
  onRemove: () => void;
  onReshuffle: () => void;
  dupPlayerIds: Set<number>;
}

function MatchRowCard({
  row, index, matchType, players, allUsedIds, timeSlot,
  onUpdate, onRemove, onReshuffle, dupPlayerIds,
}: MatchRowCardProps) {
  const [timePickerOpen, setTimePickerOpen] = useState(false);

  const rowUsedIds = useMemo(() => {
    const ids = new Set<number>();
    for (const id of row.teamA) if (id !== null) ids.add(id);
    for (const id of row.teamB) if (id !== null) ids.add(id);
    return ids;
  }, [row]);

  const hasDup = useMemo(() => {
    for (const id of rowUsedIds) {
      if (dupPlayerIds.has(id)) return true;
    }
    return false;
  }, [rowUsedIds, dupPlayerIds]);

  function updateSlot(team: "teamA" | "teamB", slotIdx: number, userId: number | null) {
    const updated = { ...row, [team]: row[team].map((v, i) => i === slotIdx ? userId : v) };
    onUpdate(updated);
  }

  function setScheduledTime(iso: string | null) {
    onUpdate({ ...row, scheduledTime: iso });
  }

  const dateLabel = timeSlot ? format(new Date(timeSlot.startTime), "EEE, MMM d, yyyy") : null;
  const slotDate = timeSlot ? new Date(timeSlot.startTime) : new Date();

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: hasDup ? "1px solid rgba(239,68,68,0.45)" : "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-zinc-500">Match {index + 1}</span>
          {hasDup && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-rose-400" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
              Duplicate
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onReshuffle}
            title="Re-shuffle this match"
            className="w-6 h-6 rounded-lg flex items-center justify-center transition-all active:scale-95"
            style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}
          >
            <Shuffle className="w-3 h-3 text-violet-400" />
          </button>
          <button
            onClick={onRemove}
            className="w-6 h-6 rounded-lg flex items-center justify-center transition-all active:scale-95"
            style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            <Trash2 className="w-3 h-3 text-rose-400" />
          </button>
        </div>
      </div>

      <div className="px-3 py-3 flex items-center gap-2">
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          {row.teamA.map((pid, si) => (
            <PlayerSlotButton
              key={si}
              playerId={pid}
              players={players}
              usedIds={allUsedIds}
              onSelect={id => updateSlot("teamA", si, id)}
            />
          ))}
        </div>
        <div className="shrink-0 flex flex-col items-center">
          <span className="text-[10px] font-black px-2 py-1 rounded-lg" style={{ color: "#f97316", background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.25)" }}>
            VS
          </span>
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          {row.teamB.map((pid, si) => (
            <PlayerSlotButton
              key={si}
              playerId={pid}
              players={players}
              usedIds={allUsedIds}
              onSelect={id => updateSlot("teamB", si, id)}
            />
          ))}
        </div>
      </div>

      {timeSlot && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2 px-3 py-2.5">
            <Calendar className="w-3 h-3 text-zinc-600 shrink-0" />
            <span className="text-[10px] font-semibold text-zinc-500">{dateLabel}</span>
            <div className="ml-auto flex items-center gap-1.5">
              {row.scheduledTime && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.2)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.35)" }}>
                  {format(new Date(row.scheduledTime), new Date(row.scheduledTime).getSeconds() !== 0 ? "h:mm:ss a" : "h:mm a")}
                </span>
              )}
              <button
                onClick={() => setTimePickerOpen(true)}
                className="w-6 h-6 rounded-lg flex items-center justify-center transition-all active:scale-95"
                style={{
                  background: row.scheduledTime ? "rgba(139,92,246,0.18)" : "rgba(255,255,255,0.06)",
                  border: row.scheduledTime ? "1px solid rgba(139,92,246,0.4)" : "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <Clock className="w-3 h-3" style={{ color: row.scheduledTime ? "#c4b5fd" : "#52525b" }} />
              </button>
            </div>
          </div>
        </div>
      )}

      {timePickerOpen && (
        <TimePickerModal
          initialIso={row.scheduledTime}
          slotDate={slotDate}
          onDone={iso => setScheduledTime(iso)}
          onClear={() => setScheduledTime(null)}
          onClose={() => setTimePickerOpen(false)}
        />
      )}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────── */

export default function AdminMakeMatchesPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ matchId: string; slotIndex: string }>();
  const matchId = params.matchId;
  const slotIndex = parseInt(params.slotIndex ?? "0", 10);

  const [authed, setAuthed] = useState(false);
  const [meta, setMeta] = useState<MatchMeta | null>(null);
  const [allPlayers, setAllPlayers] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [matchType, setMatchType] = useState<MatchType>("1v1");
  const [rows, setRows] = useState<MatchRow[]>([makeEmptyRow("1v1")]);
  const [unassignedPlayers, setUnassignedPlayers] = useState<number[]>([]);
  // Players explicitly removed from the pool — excluded from shuffle and player picker
  const [excludedPlayerIds, setExcludedPlayerIds] = useState<Set<number>>(new Set());
  const [showShuffleConfirm, setShowShuffleConfirm] = useState(false);
  const [showUnassignedWarning, setShowUnassignedWarning] = useState(false);
  const [assigningPlayerId, setAssigningPlayerId] = useState<number | null>(null);

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
          setAllPlayers(data.participants);

          const tournamentId = data.meta.tournamentId;
          try {
            const composedRes = await authFetchAdmin(
              `/admin/slots/${tournamentId}/composed-matches?slotIndex=${slotIndex}`
            );
            if (composedRes.ok) {
              const composed = await composedRes.json() as {
                matchType: MatchType | null;
                rows: Array<{ teamA: number[]; teamB: number[]; scheduledTime: string | null }>;
              };
              if (composed.matchType && composed.rows.length > 0) {
                const size = MATCH_TYPE_SIZES[composed.matchType] ?? 1;
                const restoredRows: MatchRow[] = composed.rows.map(r => ({
                  id: Math.random().toString(36).slice(2),
                  teamA: Array(size).fill(null).map((_, i) => r.teamA[i] ?? null),
                  teamB: Array(size).fill(null).map((_, i) => r.teamB[i] ?? null),
                  scheduledTime: r.scheduledTime,
                }));
                setMatchType(composed.matchType);
                setRows(restoredRows);
                setUnassignedPlayers([]);
              }
            }
          } catch {
          }
        }
      } catch {
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [authed, matchId, slotIndex]);

  const slotPlayers = useMemo(
    () => allPlayers.filter(p => p.slotIndex === slotIndex),
    [allPlayers, slotIndex]
  );

  // Players available for shuffle and picker — excludes players removed from the pool
  const effectiveSlotPlayers = useMemo(
    () => slotPlayers.filter(p => !excludedPlayerIds.has(p.userId)),
    [slotPlayers, excludedPlayerIds]
  );

  const slotPlayerMap = useMemo(() => {
    const map = new Map<number, Participant>();
    for (const p of slotPlayers) map.set(p.userId, p);
    return map;
  }, [slotPlayers]);

  const allUsedIds = useMemo(() => {
    const ids = new Set<number>(excludedPlayerIds); // excluded players appear greyed out in picker
    for (const row of rows) {
      for (const id of row.teamA) if (id !== null) ids.add(id);
      for (const id of row.teamB) if (id !== null) ids.add(id);
    }
    return ids;
  }, [rows, excludedPlayerIds]);

  // Source-of-truth: slot players that are neither in any match row nor explicitly excluded.
  // This covers all cases (manual row edits, page load without shuffle, etc.) — unlike
  // `unassignedPlayers` which is only populated during shuffle/edit flows.
  const leftOutPlayers = useMemo(
    () => slotPlayers.filter(p => !allUsedIds.has(p.userId)),
    [slotPlayers, allUsedIds],
  );

  const dupPlayerIds = useMemo(() => {
    const seen = new Map<number, number>();
    for (const row of rows) {
      for (const id of [...row.teamA, ...row.teamB]) {
        if (id !== null) seen.set(id, (seen.get(id) ?? 0) + 1);
      }
    }
    const dups = new Set<number>();
    for (const [id, count] of seen) {
      if (count > 1) dups.add(id);
    }
    return dups;
  }, [rows]);

  const dupError = useMemo(() => {
    if (dupPlayerIds.size === 0) return null;
    const names = [...dupPlayerIds]
      .map(id => slotPlayerMap.get(id)?.inGameName || `User ${id}`)
      .join(", ");
    return `Duplicate players: ${names}. Fix before saving.`;
  }, [dupPlayerIds, slotPlayerMap]);

  function hasAnyContent(r: MatchRow[]) {
    return r.some(row => [...row.teamA, ...row.teamB].some(id => id !== null));
  }

  function doShuffle() {
    const playerIds = effectiveSlotPlayers.map(p => p.userId);
    const { newRows, unassigned } = buildShuffledRows(playerIds, matchType);
    setRows(newRows);
    setUnassignedPlayers(unassigned);
    setSaveSuccess(false);
  }

  function handleShuffleClick() {
    if (hasAnyContent(rows) || unassignedPlayers.length > 0) {
      setShowShuffleConfirm(true);
    } else {
      doShuffle();
    }
  }

  function changeMatchType(type: MatchType) {
    setMatchType(type);
    setRows([makeEmptyRow(type)]);
    setUnassignedPlayers([]);
    setExcludedPlayerIds(new Set());
    setSaveSuccess(false);
  }

  function addRow() {
    setRows(prev => [...prev, makeEmptyRow(matchType)]);
    setSaveSuccess(false);
  }

  function removeRow(idx: number) {
    const row = rows[idx];
    const freed = [...row.teamA, ...row.teamB].filter((id): id is number => id !== null);
    if (freed.length > 0) {
      setUnassignedPlayers(prev => {
        const existing = new Set(prev);
        return [...prev, ...freed.filter(id => !existing.has(id))];
      });
    }
    setRows(prev => prev.filter((_, i) => i !== idx));
    setSaveSuccess(false);
  }

  function updateRow(idx: number, updated: MatchRow) {
    const old = rows[idx];
    const oldIds = new Set([...old.teamA, ...old.teamB].filter((id): id is number => id !== null));
    const newIds = new Set([...updated.teamA, ...updated.teamB].filter((id): id is number => id !== null));

    const freed = [...oldIds].filter(id => !newIds.has(id));
    const acquired = [...newIds].filter(id => !oldIds.has(id));

    setUnassignedPlayers(prev => {
      let next = prev.filter(id => !acquired.includes(id));
      const existingSet = new Set(next);
      freed.forEach(id => {
        // Only return to unassigned if not excluded
        if (!existingSet.has(id) && !excludedPlayerIds.has(id)) {
          next = [...next, id];
        }
      });
      return next;
    });
    setRows(prev => prev.map((r, i) => i === idx ? updated : r));
    setSaveSuccess(false);
  }

  function reshuffleRow(idx: number) {
    const row = rows[idx];
    const size = MATCH_TYPE_SIZES[matchType];
    const perMatch = size * 2;

    const rowPlayers = [...row.teamA, ...row.teamB].filter((id): id is number => id !== null);
    // Pool = current unassigned + this row's players, minus excluded
    const pool = shuffleArray(
      [...unassignedPlayers, ...rowPlayers].filter(id => !excludedPlayerIds.has(id))
    );

    const picked = pool.slice(0, perMatch);
    const newUnassigned = pool.slice(perMatch);

    const newRow: MatchRow = {
      ...row,
      teamA: Array(size).fill(null).map((_, i) => picked[i] ?? null),
      teamB: Array(size).fill(null).map((_, i) => picked[size + i] ?? null),
    };

    setUnassignedPlayers(newUnassigned);
    setRows(prev => prev.map((r, i) => i === idx ? newRow : r));
    setSaveSuccess(false);
  }

  function removeUnassigned(userId: number) {
    setUnassignedPlayers(prev => prev.filter(id => id !== userId));
    setExcludedPlayerIds(prev => new Set([...prev, userId]));
  }

  function assignUnassignedToSlot(
    userId: number,
    rowIdx: number,
    team: "teamA" | "teamB",
    slotIdx: number,
  ) {
    const row = rows[rowIdx];
    const updated: MatchRow = {
      ...row,
      [team]: row[team].map((v, i) => i === slotIdx ? userId : v),
    };
    setUnassignedPlayers(prev => prev.filter(id => id !== userId));
    setRows(prev => prev.map((r, i) => i === rowIdx ? updated : r));
    setSaveSuccess(false);
  }

  const canSave = dupPlayerIds.size === 0 && rows.length > 0;

  function handleSave() {
    if (!canSave) return;
    if (leftOutPlayers.length > 0) {
      setShowUnassignedWarning(true);
      return;
    }
    void doSave();
  }

  async function doSave() {
    const tournamentId = meta?.tournamentId;
    if (!tournamentId) {
      alert("Tournament data not loaded yet. Please wait and try again.");
      return;
    }
    setSaving(true);
    setSaveSuccess(false);
    setShowUnassignedWarning(false);
    try {
      const res = await authFetchAdmin(`/admin/slots/${tournamentId}/composed-matches`, {
        method: "POST",
        body: JSON.stringify({
          slotIndex,
          matchType,
          rows: rows.map(row => ({
            teamA: row.teamA,
            teamB: row.teamB,
            scheduledTime: row.scheduledTime,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        alert(err.error ?? "Failed to save matches. Please try again.");
        return;
      }
      setSaveSuccess(true);

      if (matchType === "1v1") {
        const rowsMissingTimeNow = rows.filter(r => !r.scheduledTime);
        if (rowsMissingTimeNow.length === 0) {
          const finalizeRes = await authFetchAdmin(`/admin/slots/${tournamentId}/save-custom-matches`, {
            method: "POST",
            body: JSON.stringify({
              slotIndex,
              matchType,
              matches: rows.map(row => ({
                teamA: row.teamA,
                teamB: row.teamB,
                scheduledTime: row.scheduledTime,
              })),
            }),
          });
          if (finalizeRes.ok) {
            const slotParam = slotIndex !== null ? `?slot=${slotIndex}` : "";
            sessionStorage.setItem("czsa_all_matches_refresh", "1");
            navigate(
              `/286c81443d1fb388d1b9a8e3b280824c/matches_management/joined_players/matches/${matchId}/all-matches${slotParam}`
            );
          }
        }
      }
    } catch {
      alert("Network error. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const timeSlots: TimeSlot[] = meta?.timeSlots ?? [];
  const slotTimeStr = timeSlots[slotIndex] ? formatSlotTime(timeSlots[slotIndex]) : `Slot ${slotIndex + 1}`;
  const backUrl = `/286c81443d1fb388d1b9a8e3b280824c/matches_management/joined_players/matches/${matchId}?slot=${slotIndex}`;
  const assigningPlayer = assigningPlayerId !== null ? slotPlayerMap.get(assigningPlayerId) ?? null : null;

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0b" }}>
        <div className="flex flex-col items-center gap-3">
          <Lock className="w-8 h-8 text-zinc-700" />
          <p className="text-zinc-600 text-sm">Verifying session…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a0a0b" }}>
      {/* Header */}
      <div
        className="shrink-0 flex items-center gap-3 px-4 py-3.5 border-b"
        style={{ borderColor: "rgba(255,255,255,0.07)", background: "#0f0f10" }}
      >
        <button
          onClick={() => navigate(backUrl)}
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-95"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <ArrowLeft className="w-4 h-4 text-zinc-400" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-white truncate">Decide Matches</p>
          {meta?.title && (
            <p className="text-[10px] text-zinc-500 truncate">
              {meta.title} · <span className="text-violet-400">Slot {slotIndex + 1}</span>
              {timeSlots[slotIndex] ? ` · ${slotTimeStr}` : ""}
            </p>
          )}
        </div>
        {!loading && (
          <span className="text-[11px] font-bold text-violet-400 bg-violet-500/10 px-2.5 py-1 rounded-full border border-violet-500/20 shrink-0">
            {slotPlayers.length} {slotPlayers.length === 1 ? "player" : "players"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Match type picker */}
          <div className="px-4 pt-4 pb-2">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Match Type</p>
            <div
              className="flex items-center gap-1 p-1 rounded-xl"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              {(["1v1", "2v2", "4v4"] as MatchType[]).map(type => (
                <button
                  key={type}
                  onClick={() => changeMatchType(type)}
                  className="flex-1 py-1.5 rounded-lg text-[12px] font-bold transition-all active:scale-95"
                  style={
                    matchType === type
                      ? { background: "linear-gradient(135deg, #6366f1, #a855f7)", color: "#fff" }
                      : { color: "#71717a" }
                  }
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Slot info + Shuffle + Save buttons */}
          <div className="px-4 pb-3 flex flex-col gap-2">
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}
            >
              <span className="text-[10px] font-semibold text-violet-400">
                Slot {slotIndex + 1}{timeSlots[slotIndex] ? ` · ${slotTimeStr}` : ""}
              </span>
              <span className="text-[10px] text-zinc-500 ml-auto">
                {effectiveSlotPlayers.length} eligible players
                {excludedPlayerIds.size > 0 && (
                  <span className="text-zinc-600"> · {excludedPlayerIds.size} excluded</span>
                )}
              </span>
            </div>

            <div className="flex gap-2">
              {/* Shuffle Matches button */}
              <button
                onClick={effectiveSlotPlayers.length >= 2 ? handleShuffleClick : undefined}
                disabled={effectiveSlotPlayers.length < 2}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all active:scale-[0.98]"
                style={
                  effectiveSlotPlayers.length >= 2
                    ? { background: "linear-gradient(135deg, #7c3aed, #a855f7)", boxShadow: "0 0 20px rgba(139,92,246,0.35)" }
                    : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", cursor: "not-allowed" }
                }
              >
                <Shuffle className="w-4 h-4" style={{ color: effectiveSlotPlayers.length >= 2 ? "#fff" : "#52525b" }} />
                <span className="text-[12px] font-black" style={{ color: effectiveSlotPlayers.length >= 2 ? "#fff" : "#52525b" }}>
                  {effectiveSlotPlayers.length < 2 ? "Need ≥2 players" : "Shuffle Matches"}
                </span>
              </button>

              {/* Save Matches button — enabled for all match types when no duplicates and ≥1 row */}
              <button
                onClick={canSave && !saving ? handleSave : undefined}
                disabled={!canSave || saving}
                title={
                  dupPlayerIds.size > 0
                    ? "Fix duplicate players before saving"
                    : rows.length === 0
                    ? "Add at least one match row"
                    : undefined
                }
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all active:scale-[0.98]"
                style={
                  saveSuccess
                    ? { background: "rgba(34,197,94,0.18)", border: "1px solid rgba(34,197,94,0.4)" }
                    : canSave
                    ? { background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.35)" }
                    : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", cursor: "not-allowed" }
                }
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                ) : saveSuccess ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" style={{ color: canSave ? "#4ade80" : "#52525b" }} />
                )}
                <span className="text-[12px] font-black" style={{ color: saveSuccess ? "#4ade80" : canSave ? "#4ade80" : "#52525b" }}>
                  {saving ? "Saving…" : saveSuccess ? "Saved!" : "Save"}
                </span>
              </button>
            </div>
          </div>

          {/* Duplicate error banner */}
          {dupError && (
            <div
              className="mx-4 mb-3 flex items-start gap-2.5 px-3.5 py-3 rounded-xl"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.35)" }}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-[11px] font-semibold text-rose-400 leading-relaxed">{dupError}</p>
            </div>
          )}

          {/* Match rows */}
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3" style={{ scrollbarWidth: "none" }}>
            {rows.length === 0 && unassignedPlayers.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <p className="text-zinc-600 text-[13px]">No matches yet. Tap "Shuffle" or "Add Match" to begin.</p>
              </div>
            )}
            {rows.map((row, i) => (
              <MatchRowCard
                key={row.id}
                row={row}
                index={i}
                matchType={matchType}
                players={effectiveSlotPlayers}
                allUsedIds={allUsedIds}
                timeSlot={timeSlots[slotIndex] ?? null}
                onUpdate={updated => updateRow(i, updated)}
                onRemove={() => removeRow(i)}
                onReshuffle={() => reshuffleRow(i)}
                dupPlayerIds={dupPlayerIds}
              />
            ))}

            {/* Unassigned Players section */}
            {unassignedPlayers.length > 0 && (
              <div
                className="rounded-2xl overflow-hidden"
                style={{ border: "1.5px dashed rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.04)" }}
              >
                <div
                  className="flex items-center gap-2 px-3 py-2.5"
                  style={{ borderBottom: "1px solid rgba(245,158,11,0.15)" }}
                >
                  <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: "rgba(245,158,11,0.18)" }}>
                    <UserX className="w-3 h-3 text-amber-400" />
                  </div>
                  <span className="text-[11px] font-black text-amber-400">Unassigned Players</span>
                  <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full text-amber-300" style={{ background: "rgba(245,158,11,0.18)" }}>
                    {unassignedPlayers.length}
                  </span>
                </div>
                <div className="p-3 flex flex-col gap-1.5">
                  {unassignedPlayers.map(uid => {
                    const player = slotPlayerMap.get(uid);
                    if (!player) return null;
                    return (
                      <div
                        key={uid}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                      >
                        <div
                          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black text-zinc-400"
                          style={{ background: "rgba(255,255,255,0.07)" }}
                        >
                          {(player.inGameName || player.phone).charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-white truncate">{player.inGameName || "Unknown"}</p>
                          <p className="text-[9px] text-zinc-500 truncate">{player.phone}</p>
                        </div>
                        {/* Assign to a specific empty slot */}
                        <button
                          onClick={() => setAssigningPlayerId(uid)}
                          title="Assign to match slot"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold transition-all active:scale-95 shrink-0"
                          style={{ background: "rgba(99,102,241,0.18)", border: "1px solid rgba(99,102,241,0.35)", color: "#a5b4fc" }}
                        >
                          Assign
                        </button>
                        {/* Remove from pool entirely */}
                        <button
                          onClick={() => removeUnassigned(uid)}
                          title="Remove from pool"
                          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all active:scale-95"
                          style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}
                        >
                          <X className="w-3 h-3 text-rose-400" />
                        </button>
                      </div>
                    );
                  })}
                  <p className="text-[10px] text-zinc-600 text-center pt-1">
                    Tap <span className="text-indigo-500 font-semibold">Assign</span> to place a player into any empty slot, or <span className="text-rose-600 font-semibold">✕</span> to remove them from the pool.
                  </p>
                </div>
              </div>
            )}

            {/* Add Match button */}
            <button
              onClick={addRow}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl transition-all active:scale-[0.98]"
              style={{
                background: "rgba(99,102,241,0.08)",
                border: "1.5px dashed rgba(99,102,241,0.35)",
                color: "#818cf8",
              }}
            >
              <Plus className="w-4 h-4" />
              <span className="text-[12px] font-bold">Add Match</span>
            </button>
          </div>
        </>
      )}

      {/* Shuffle confirmation dialog */}
      {showShuffleConfirm && (
        <ConfirmDialog
          message="This will replace all current matches and unassigned players with a fresh random shuffle. Any manual changes will be lost."
          confirmLabel="Reshuffle All"
          onConfirm={() => { setShowShuffleConfirm(false); doShuffle(); }}
          onCancel={() => setShowShuffleConfirm(false)}
        />
      )}

      {/* Unassigned players warning dialog */}
      {showUnassignedWarning && (
        <UnassignedWarningDialog
          players={leftOutPlayers.map(p => ({ userId: p.userId, name: p.inGameName || "Unknown", phone: p.phone }))}
          onSaveAnyway={() => { void doSave(); }}
          onGoBack={() => setShowUnassignedWarning(false)}
        />
      )}

      {/* Assign to slot picker */}
      {assigningPlayer && assigningPlayerId !== null && (
        <AssignSlotPicker
          player={assigningPlayer}
          rows={rows}
          matchType={matchType}
          onAssign={(rowIdx, team, slotIdx) => assignUnassignedToSlot(assigningPlayerId, rowIdx, team, slotIdx)}
          onClose={() => setAssigningPlayerId(null)}
        />
      )}
    </div>
  );
}
