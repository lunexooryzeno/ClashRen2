import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Lock, Clock, Swords, CheckCircle2, AlertCircle,
  Hourglass, RefreshCw, ExternalLink, Trophy, Shield,
  Key, Eye, EyeOff, Gamepad2, Bell, Copy,
  ChevronDown, ChevronUp, Zap, RotateCcw, Skull,
  Play, Timer, Radio, CheckCheck, XCircle, Send,
  TriangleAlert, UserCheck, TrendingUp, Crown, Database, Pencil,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

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

interface PlayerStatus {
  id: number;
  slotMatchId: number;
  userId: number;
  viewedAt: string | null;
  gameOpenedAt: string | null;
  confirmedAt: string | null;
  notifiedAt: string | null;
}

interface MatchEvent {
  id: number;
  slotMatchId: number;
  actor: string;
  eventType: string;
  payload: string | null;
  createdAt: string;
}

interface SlotMatchPlayer {
  id: number;
  inGameName: string | null;
  uid: string | null;
  profilePicture: string | null;
  phone?: string;
}

interface PlayerVerification {
  id: number;
  slotMatchId: number;
  userId: number;
  ffUid: string | null;
  preSnapshotAt: string | null;
  preSnapshotData: string | null;
  postSnapshotAt: string | null;
  postSnapshotData: string | null;
  statDiff: string | null;
  isWinner: boolean | null;
  rewardGranted: boolean;
}

interface SlotMatchDetail {
  id: number;
  displayId: string | null;
  slotId: number;
  slotIndex: number;
  matchNumber: number;
  waveNumber: number;
  player1Id: number;
  player2Id: number | null;
  player1Seat: string | null;
  player2Seat: string | null;
  scheduledAt: string;
  roomUnlockAt: string | null;
  status: string;
  winnerId: number | null;
  roomId: string | null;
  roomPassword: string | null;
  notes: string | null;
  createdAt: string;
  releaseMode: string;
  credentialsHidden: boolean;
  credentialsReleasedAt: string | null;
  releaseOffsetMinutes: number | null;
  roomStatus: string;
  roomDirectLink: string | null;
  credentialShareMode: string;
  verificationStatus: string;
  gameMode: string | null;
  matchMode: string | null;
  prizeAmountDiamonds: number;
  rewardDistributedAt: string | null;
  player1: SlotMatchPlayer | null;
  player2: SlotMatchPlayer | null;
  playerStatuses: PlayerStatus[];
  events: MatchEvent[];
}

function fmtMatchId(m: { id: number; displayId?: string | null }) {
  return m.displayId ?? String(m.id).padStart(12, "0");
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
  if (s === "completed") return <CheckCircle2 className="w-3 h-3" />;
  if (s === "cancelled") return <AlertCircle className="w-3 h-3" />;
  if (s === "ongoing")   return <RefreshCw className="w-3 h-3" />;
  return <Hourglass className="w-3 h-3" />;
}

function roomStatusConfig(rs: string) {
  switch (rs) {
    case "open":      return { label: "Room Open", color: "#4ade80", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.3)", Icon: Key };
    case "live":      return { label: "Match Live", color: "#fb923c", bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.3)", Icon: Radio };
    case "expired":   return { label: "Expired", color: "#f87171", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)", Icon: XCircle };
    case "completed": return { label: "Completed", color: "#4ade80", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.3)", Icon: CheckCheck };
    case "hidden":    return { label: "Hidden", color: "#a1a1aa", bg: "rgba(161,161,170,0.1)", border: "rgba(161,161,170,0.25)", Icon: EyeOff };
    default:          return { label: "Waiting for Release", color: "#fbbf24", bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.3)", Icon: Timer };
  }
}

function verifStatusConfig(vs: string) {
  switch (vs) {
    case "pre_snapshot_stored": return { label: "Pre-Snapshot Stored", color: "#a5b4fc", bg: "rgba(99,102,241,0.12)", border: "rgba(99,102,241,0.3)" };
    case "winner_decided":      return { label: "Winner Decided", color: "#fbbf24", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.3)" };
    case "reward_distributed":  return { label: "Reward Distributed", color: "#4ade80", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.3)" };
    case "failed":              return { label: "Verification Failed", color: "#f87171", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)" };
    case "disputed":            return { label: "Disputed", color: "#fb923c", bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.3)" };
    default:                    return { label: "Pending", color: "#71717a", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)" };
  }
}

function eventLabel(eventType: string): string {
  const map: Record<string, string> = {
    credentials_set: "Credentials set",
    credentials_released: "Credentials released",
    credentials_auto_released: "Auto-released",
    credentials_hidden: "Credentials hidden",
    credentials_shown: "Credentials shown",
    room_replaced: "Room replaced & re-notified",
    notification_resent: "Notification resent",
    match_force_expired: "Force expired",
    player_viewed: "Player viewed credentials",
    player_game_opened: "Player opened game",
    player_confirmed: "Player confirmed ready",
    players_confirmed: "Players confirmed by admin",
    result_verified: "Result verified",
    match_disputed: "Match disputed",
    winner_overridden: "Winner manually overridden",
  };
  return map[eventType] ?? eventType.replace(/_/g, " ");
}

function actorBadge(actor: string) {
  if (actor === "system") return { label: "System", color: "#a5b4fc" };
  if (actor === "player") return { label: "Player", color: "#34d399" };
  return { label: "Admin", color: "#fb923c" };
}

function useCountdown(targetDate: string | null): string {
  const [display, setDisplay] = useState("");
  useEffect(() => {
    if (!targetDate) { setDisplay(""); return; }
    const tick = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) { setDisplay("Now"); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setDisplay(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);
  return display;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy}
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all active:scale-95"
      style={{ background: copied ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)", color: copied ? "#4ade80" : "#a1a1aa", border: `1px solid ${copied ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.1)"}` }}>
      {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function StatRow({ label, pre, post, diff }: { label: string; pre?: number; post?: number; diff?: number }) {
  const hasDiff = diff !== undefined && diff !== null;
  const positive = hasDiff && diff! > 0;
  return (
    <div className="flex items-center gap-2 py-1 border-b last:border-0" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
      <span className="text-[9px] text-zinc-500 w-20 shrink-0">{label}</span>
      {pre !== undefined && <span className="text-[10px] text-zinc-400 flex-1 text-right">{pre.toLocaleString()}</span>}
      {post !== undefined && <span className="text-[10px] text-white flex-1 text-right">{post.toLocaleString()}</span>}
      {hasDiff && (
        <span className="text-[10px] font-black w-14 text-right"
          style={{ color: positive ? "#4ade80" : diff === 0 ? "#52525b" : "#f87171" }}>
          {positive ? `+${diff}` : diff}
        </span>
      )}
    </div>
  );
}

function PlayerEngagementCard({
  player, userId, seat, playerStatus, credReleased, onResend, resending,
  selected, onSelect, selectable,
}: {
  player: SlotMatchPlayer | null;
  userId: number;
  seat: string;
  playerStatus: PlayerStatus | null;
  credReleased: boolean;
  onResend: () => void;
  resending: boolean;
  selected: boolean;
  onSelect: (v: boolean) => void;
  selectable: boolean;
}) {
  const name = player?.inGameName || `User #${userId}`;
  const initials = (name.trim().slice(0, 2) || "?").toUpperCase();
  const seatA = seat === "A";

  const pills = [
    { key: "notified", label: "Notified", active: !!playerStatus?.notifiedAt, icon: Bell, color: "#a5b4fc" },
    { key: "viewed",   label: "Viewed",   active: !!playerStatus?.viewedAt,   icon: Eye,  color: "#34d399" },
  ];

  const borderColor = selectable && selected
    ? "rgba(34,197,94,0.55)"
    : selectable
    ? "rgba(255,255,255,0.1)"
    : "rgba(255,255,255,0.07)";

  const bgColor = selectable && selected
    ? "rgba(34,197,94,0.07)"
    : "rgba(255,255,255,0.025)";

  return (
    <div
      onClick={selectable ? () => onSelect(!selected) : undefined}
      className="rounded-2xl overflow-hidden flex flex-col relative"
      style={{
        background: bgColor,
        border: `2px solid ${borderColor}`,
        transition: "all 0.18s",
        cursor: selectable ? "pointer" : "default",
        boxShadow: selectable && selected ? "0 0 0 3px rgba(34,197,94,0.12)" : "none",
      }}>

      {/* Selected tick badge */}
      {selectable && (
        <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center transition-all"
          style={{
            background: selected ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.07)",
            border: `1.5px solid ${selected ? "rgba(34,197,94,0.6)" : "rgba(255,255,255,0.18)"}`,
          }}>
          {selected && <CheckCircle2 className="w-3 h-3 text-green-400" />}
        </div>
      )}

      {/* Player info row */}
      <div className="flex items-center gap-3 px-3 pt-3 pb-2" style={{ paddingRight: selectable ? "2.5rem" : "0.75rem" }}>
        {player?.profilePicture ? (
          <img src={player.profilePicture} alt={name} className="w-10 h-10 rounded-xl object-cover shrink-0"
            style={{ border: "1.5px solid rgba(255,255,255,0.1)" }} />
        ) : (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[14px] font-black shrink-0"
            style={{ background: seatA ? "rgba(99,102,241,0.15)" : "rgba(249,115,22,0.15)", color: seatA ? "#a5b4fc" : "#fb923c", border: `1.5px solid ${seatA ? "rgba(99,102,241,0.25)" : "rgba(249,115,22,0.25)"}` }}>
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[13px] font-black text-white truncate">{name}</p>
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: seatA ? "rgba(99,102,241,0.2)" : "rgba(249,115,22,0.2)", color: seatA ? "#a5b4fc" : "#fb923c" }}>
              {seat}
            </span>
          </div>
          {player?.uid && <p className="text-[10px] text-zinc-500 font-mono">{player.uid}</p>}
        </div>
      </div>

      {/* Status pills */}
      <div className="px-3 pb-2.5 grid grid-cols-2 gap-1.5">
        {pills.map(({ key, label, active, icon: Icon, color }) => (
          <div key={key}
            className="flex flex-col items-center gap-0.5 py-1.5 rounded-xl"
            style={{ background: active ? `${color}15` : "rgba(255,255,255,0.03)", border: `1px solid ${active ? `${color}35` : "rgba(255,255,255,0.06)"}` }}>
            <Icon className="w-3 h-3" style={{ color: active ? color : "#3f3f46" }} />
            <span className="text-[8px] font-bold" style={{ color: active ? color : "#52525b" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Resend button — stop propagation so it doesn't toggle selection */}
      {credReleased && (
        <div className="px-3 pb-3" onClick={e => e.stopPropagation()}>
          <button
            onClick={onResend}
            disabled={resending}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[10px] font-bold transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", color: "#a5b4fc" }}>
            {resending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            Resend
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminSlotMatchDetailPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ matchId: string; slotMatchId: string }>();
  const { matchId, slotMatchId } = params;

  const [authed, setAuthed] = useState(false);
  const [match, setMatch] = useState<SlotMatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Room control state
  const [editRoomId, setEditRoomId] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editReleaseMode, setEditReleaseMode] = useState("manual");
  const [editOffsetMinutes, setEditOffsetMinutes] = useState(5);
  const [editRoomDirectLink, setEditRoomDirectLink] = useState("");
  const [editShareMode, setEditShareMode] = useState("both");
  const [savingCreds, setSavingCreds] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [roomEditMode, setRoomEditMode] = useState(false);
  const roomEditModeRef = useRef(false);
  const [statsProgress, setStatsProgress] = useState<{userId: number; playerName: string; step: string}[]>([]);

  // Resend state
  const [resending, setResending] = useState<number | "all" | null>(null);

  // Activity log
  const [logExpanded, setLogExpanded] = useState(false);

  // Emergency panel
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [replaceModal, setReplaceModal] = useState(false);
  const [newRoomId, setNewRoomId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [confirmExpire, setConfirmExpire] = useState(false);
  const [expiring, setExpiring] = useState(false);

  // ── Verification state ─────────────────────────────────────────────────────
  const [p1Selected, setP1Selected] = useState(true);
  const [p2Selected, setP2Selected] = useState(true);
  const [configGameMode, setConfigGameMode] = useState<"br" | "cs">("cs");
  const [configMatchMode, setConfigMatchMode] = useState<"normal" | "career" | "ranked">("career");
  const [configPrize, setConfigPrize] = useState(0);
  const [confirmingJoined, setConfirmingJoined] = useState(false);
  const [verifyingResult, setVerifyingResult] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [overrideWinnerId, setOverrideWinnerId] = useState<number | null>(null);
  const [overridePrize, setOverridePrize] = useState<number>(0);
  const [verifyConfirm, setVerifyConfirm] = useState(false);
  const [verifications, setVerifications] = useState<PlayerVerification[]>([]);
  const [refetchingStats, setRefetchingStats] = useState(false);
  const [rawApiExpanded, setRawApiExpanded] = useState(false);
  // ──────────────────────────────────────────────────────────────────────────

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  // Countdown targets
  const countdownTarget = match?.roomUnlockAt ?? match?.scheduledAt ?? null;
  const countdown = useCountdown(!match?.credentialsReleasedAt ? countdownTarget : null);

  // SSE ref
  const sseRef = useRef<EventSource | null>(null);
  // Guard so auto-verify only fires once per page load
  const autoVerifyTriggered = useRef(false);

  // Check auth
  useEffect(() => {
    const s = getSession();
    if (!s) {
      navigate("/286c81443d1fb388d1b9a8e3b280824c");
    } else {
      setAuthed(true);
    }
  }, [navigate]);

  // Load verifications
  const loadVerifications = useCallback(async (mid: string) => {
    try {
      const r = await authFetchAdmin(`/admin/slot-matches/${mid}/verifications`);
      if (r.ok) {
        const data = await r.json();
        setVerifications(data);
      }
    } catch { /* silent */ }
  }, []);

  // Fetch match
  const fetchMatch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await authFetchAdmin(`/admin/slot-matches/${slotMatchId}`);
      if (!r.ok) throw new Error(await r.text());
      const data: SlotMatchDetail = await r.json();
      setMatch(data);
      setEditRoomId(data.roomId ?? "");
      setEditPassword(data.roomPassword ?? "");
      setEditReleaseMode(data.releaseMode ?? "manual");
      setEditOffsetMinutes(data.releaseOffsetMinutes ?? 5);
      setEditRoomDirectLink(data.roomDirectLink ?? "");
      setEditShareMode(data.credentialShareMode ?? "both");
      if (data.gameMode) setConfigGameMode(data.gameMode as "br" | "cs");
      if (data.matchMode) setConfigMatchMode(data.matchMode as "normal" | "career" | "ranked");
      if (data.prizeAmountDiamonds) { setConfigPrize(data.prizeAmountDiamonds); setOverridePrize(data.prizeAmountDiamonds); }
      await loadVerifications(String(data.id));
    } catch (e: any) {
      setMatch(null);
      let msg = e.message ?? "Failed to load match";
      try { const parsed = JSON.parse(msg); if (parsed.error) msg = parsed.error; } catch { /* not JSON */ }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [slotMatchId, loadVerifications]);

  useEffect(() => {
    if (!authed) return;
    fetchMatch();
  }, [authed, fetchMatch]);

  // ── Auto-verify: when page opens with pre_snapshot_stored status ─────────────
  // Fires once per page load to fetch post-match stats and determine the winner,
  // then credits the prize automatically if a winner is found.
  useEffect(() => {
    if (autoVerifyTriggered.current) return;
    if (!match || !authed) return;
    if (match.verificationStatus !== "pre_snapshot_stored") return;
    // Only proceed if at least one player has a pre-snapshot stored
    if (!verifications.some(v => v.preSnapshotData)) return;
    // Only auto-verify after the match's scheduled time has passed — firing before
    // the game ends always returns stale stats (pre == post) and corrupts the status.
    const matchTime = match.scheduledAt ? new Date(match.scheduledAt) : null;
    if (matchTime && matchTime > new Date()) return;
    autoVerifyTriggered.current = true;
    // Run verify in background — the SSE will push match_update when done
    (async () => {
      try {
        const r = await authFetchAdmin(`/admin/slot-matches/${match.id}/verify-result`, { method: "POST" });
        const data = await r.json();
        if (data.verifications) setVerifications(data.verifications);
        // Re-fetch the full match so winner + status update instantly
        fetchMatch();
      } catch { /* silent — admin can still click manually */ }
    })();
  }, [match?.verificationStatus, verifications, authed, match, fetchMatch]);

  // SSE subscription — wait for match to load so we have the internal numeric ID
  const matchInternalId = match?.id;
  useEffect(() => {
    if (!authed || !matchInternalId) return;
    const session = getSession();
    if (!session) return;
    const url = `/api/admin/slot-matches/${matchInternalId}/sse?token=${encodeURIComponent(session.token)}`;
    const es = new EventSource(url);
    sseRef.current = es;
    let lastVerifStatus = "";
    es.addEventListener("match_update", (e) => {
      try {
        const data: SlotMatchDetail = JSON.parse((e as MessageEvent).data);
        setMatch(data);
        // Only reset form fields from SSE when the edit panel is closed —
        // otherwise SSE would overwrite whatever the admin is currently typing.
        if (!roomEditModeRef.current) {
          setEditRoomId(data.roomId ?? "");
          setEditPassword(data.roomPassword ?? "");
          setEditReleaseMode(data.releaseMode ?? "manual");
          setEditOffsetMinutes(data.releaseOffsetMinutes ?? 5);
          setEditRoomDirectLink(data.roomDirectLink ?? "");
          setEditShareMode(data.credentialShareMode ?? "both");
        }
        if (data.gameMode) setConfigGameMode(data.gameMode as "br" | "cs");
        if (data.matchMode) setConfigMatchMode(data.matchMode as "normal" | "career" | "ranked");
        if (data.prizeAmountDiamonds) { setConfigPrize(data.prizeAmountDiamonds); setOverridePrize(data.prizeAmountDiamonds); }
        // Only reload verifications when the verification status changes
        if (data.verificationStatus !== lastVerifStatus) {
          lastVerifStatus = data.verificationStatus;
          loadVerifications(String(data.id));
        }
      } catch { /* ignore */ }
    });
    es.addEventListener("stats_progress", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data);
        setStatsProgress(prev => {
          const idx = prev.findIndex(p => p.userId === d.userId);
          if (idx >= 0) { const next = [...prev]; next[idx] = d; return next; }
          return [...prev, d];
        });
      } catch { /* ignore */ }
    });
    return () => { es.close(); sseRef.current = null; };
  }, [authed, matchInternalId, loadVerifications]);

  // ── Room control actions ───────────────────────────────────────────────────
  async function saveCreds(): Promise<boolean> {
    setSavingCreds(true);
    try {
      const r = await authFetchAdmin(`/admin/slot-matches/${match!.id}/credentials`, {
        method: "PATCH",
        body: JSON.stringify({ roomId: editRoomId, roomPassword: editPassword, releaseMode: editReleaseMode, releaseOffsetMinutes: editOffsetMinutes, roomDirectLink: editRoomDirectLink, credentialShareMode: editShareMode }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({ error: "Save failed" }));
        throw new Error(body.error ?? "Save failed");
      }
      showToast("Credentials saved");
      return true;
    } catch (e: any) {
      showToast(e.message ?? "Failed to save", "err");
      return false;
    } finally {
      setSavingCreds(false);
    }
  }

  async function releaseNow() {
    setReleasing(true);
    try {
      const r = await authFetchAdmin(`/admin/slot-matches/${match!.id}/release`, { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      showToast("Released to players");
    } catch (e: any) { showToast(e.message ?? "Failed", "err"); }
    setReleasing(false);
  }

  async function toggleHide() {
    if (!match) return;
    setHiding(true);
    try {
      const r = await authFetchAdmin(`/admin/slot-matches/${match.id}/${match.credentialsHidden ? "show" : "hide"}`, { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      showToast(match.credentialsHidden ? "Credentials shown" : "Credentials hidden");
    } catch (e: any) { showToast(e.message ?? "Failed", "err"); }
    setHiding(false);
  }

  async function forceHide() {
    setHiding(true);
    try {
      const r = await authFetchAdmin(`/admin/slot-matches/${match!.id}/hide`, { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      showToast("Credentials hidden");
    } catch (e: any) { showToast(e.message ?? "Failed", "err"); }
    setHiding(false);
  }

  async function resendNotification(uid?: number) {
    const key = uid ?? "all";
    setResending(key);
    try {
      const r = await authFetchAdmin(`/admin/slot-matches/${match!.id}/resend-notification`, {
        method: "POST",
        body: JSON.stringify(uid ? { userId: uid } : {}),
      });
      if (!r.ok) throw new Error(await r.text());
      showToast(uid ? "Notification sent" : "Notifications sent to all");
    } catch (e: any) { showToast(e.message ?? "Failed", "err"); }
    setResending(null);
  }

  async function replaceRoom() {
    if (!newRoomId.trim() || !newPassword.trim()) return;
    setReplacing(true);
    try {
      const r = await authFetchAdmin(`/admin/slot-matches/${match!.id}/replace-room`, {
        method: "POST",
        body: JSON.stringify({ roomId: newRoomId.trim(), roomPassword: newPassword.trim() }),
      });
      if (!r.ok) throw new Error(await r.text());
      setReplaceModal(false);
      setNewRoomId(""); setNewPassword("");
      showToast("Room replaced & players re-notified");
    } catch (e: any) { showToast(e.message ?? "Failed", "err"); }
    setReplacing(false);
  }

  async function forceExpire() {
    setExpiring(true);
    try {
      const r = await authFetchAdmin(`/admin/slot-matches/${match!.id}/expire`, { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      setConfirmExpire(false);
      showToast("Match expired");
    } catch (e: any) { showToast(e.message ?? "Failed", "err"); }
    setExpiring(false);
  }

  // ── Verification actions ───────────────────────────────────────────────────
  async function confirmJoined() {
    if (!match) return;
    const playerIds = [
      p1Selected ? match.player1Id : null,
      p2Selected && match.player2Id ? match.player2Id : null,
    ].filter(Boolean) as number[];
    if (!playerIds.length) { showToast("Select at least one player", "err"); return; }
    setConfirmingJoined(true);
    try {
      const r = await authFetchAdmin(`/admin/slot-matches/${match!.id}/confirm-joined`, {
        method: "PATCH",
        body: JSON.stringify({ playerIds, gameMode: configGameMode, matchMode: configMatchMode }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      setVerifications(data.verifications ?? []);
      showToast("Players confirmed — fetching pre-match stats…");
    } catch (e: any) { showToast(e.message ?? "Failed", "err"); }
    finally { setConfirmingJoined(false); }
  }

  async function verifyResult() {
    setVerifyingResult(true);
    setVerifyConfirm(false);
    try {
      const r = await authFetchAdmin(`/admin/slot-matches/${match!.id}/verify-result`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      setVerifications(data.verifications ?? []);
      const statusMsg: Record<string, string> = {
        reward_distributed: "Winner found & reward distributed! 🏆",
        winner_decided: "Winner decided",
        failed: "No new game detected — check if match was played",
        disputed: "Tied scores — match marked as disputed",
      };
      showToast(statusMsg[data.status] ?? "Verification complete");
    } catch (e: any) { showToast(e.message ?? "Failed", "err"); }
    setVerifyingResult(false);
  }

  async function disputeMatch() {
    setDisputing(true);
    try {
      const r = await authFetchAdmin(`/admin/slot-matches/${match!.id}/dispute`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
      showToast("Match marked as disputed");
    } catch (e: any) { showToast(e.message ?? "Failed", "err"); }
    setDisputing(false);
  }

  async function refetchPreStats() {
    if (!match) return;
    setRefetchingStats(true);
    setStatsProgress([]);
    try {
      const r = await authFetchAdmin(`/admin/slot-matches/${match.id}/refetch-prestats`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      setVerifications(data.verifications ?? []);
      showToast("Re-fetching stats in background…");
    } catch (e: any) { showToast(e.message ?? "Failed", "err"); }
    finally { setRefetchingStats(false); }
  }

  async function overrideWinner() {
    if (!overrideWinnerId) { showToast("Select a winner", "err"); return; }
    setOverriding(true);
    try {
      const r = await authFetchAdmin(`/admin/slot-matches/${match!.id}/override-winner`, {
        method: "PATCH",
        body: JSON.stringify({ winnerId: overrideWinnerId, prizeAmountDiamonds: overridePrize }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      showToast(`Winner overridden & ${overridePrize > 0 ? `${overridePrize} 💎 credited` : "no prize set"}`);
      await loadVerifications(String(match!.id));
    } catch (e: any) { showToast(e.message ?? "Failed", "err"); }
    setOverriding(false);
  }

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (!authed) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0b" }}>
      <Lock className="w-8 h-8 text-zinc-700" />
    </div>
  );

  const st = match ? statusStyle(match.status) : null;
  const rs = match ? roomStatusConfig(match.roomStatus ?? "pending") : null;
  const credReleased = !!(match?.credentialsReleasedAt && !match.credentialsHidden);
  const p1Status = match?.playerStatuses.find(s => s.userId === match.player1Id) ?? null;
  const p2Status = match?.playerStatuses.find(s => s.userId === match.player2Id) ?? null;
  const unconfirmedCount = [match?.player1Id, match?.player2Id].filter(uid =>
    uid && !match?.playerStatuses.find(s => s.userId === uid)?.confirmedAt
  ).length;
  const vs = match ? verifStatusConfig(match.verificationStatus) : null;

  // Per-player verification records
  const p1Verif = verifications.find(v => v.userId === match?.player1Id) ?? null;
  const p2Verif = verifications.find(v => v.userId === match?.player2Id) ?? null;

  // Parsed stat diffs
  function parseStatDiff(vr: PlayerVerification | null) {
    if (!vr?.statDiff) return null;
    try { return JSON.parse(vr.statDiff); } catch { return null; }
  }
  function parseSnapshot(data: string | null) {
    if (!data) return null;
    try { return JSON.parse(data); } catch { return null; }
  }


  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a0a0b" }}>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[12px] font-bold shadow-xl transition-all"
          style={{
            background: toast.type === "ok" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
            border: `1px solid ${toast.type === "ok" ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
            color: toast.type === "ok" ? "#4ade80" : "#f87171",
            backdropFilter: "blur(12px)",
          }}>
          {toast.type === "ok" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          {toast.msg}
        </div>
      )}

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
          <p className="text-[13px] font-bold text-white truncate">Match Detail</p>
          {match && (
            <p className="text-[10px] font-mono text-zinc-500">#{fmtMatchId(match)}</p>
          )}
        </div>
        {match && st && (
          <span className="flex items-center gap-1.5 text-[10px] font-black uppercase px-2.5 py-1 rounded-full shrink-0"
            style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
            <StatusIcon s={match.status} />
            {match.status}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
        </div>
      ) : error || !match ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8">
          <Shield className="w-10 h-10 text-zinc-700" />
          <p className="text-zinc-500 text-sm font-medium text-center">{error ?? "Match not found"}</p>
          <button onClick={() => window.history.back()}
            className="px-4 py-2 rounded-xl text-[12px] font-bold text-indigo-400 transition-all"
            style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}>
            Go Back
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ scrollbarWidth: "none" }}>

          {/* Match ID card */}
          <div className="rounded-2xl px-4 py-3.5"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-1">Match ID</p>
            <p className="font-mono text-[22px] font-black tracking-widest"
              style={{ color: "#a5b4fc", letterSpacing: "0.12em" }}>
              {fmtMatchId(match)}
            </p>
          </div>

          {/* Info row */}
          <div className="grid grid-cols-1 gap-2">
            <div className="rounded-xl px-3 py-2.5 flex flex-col gap-0.5"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-[9px] uppercase tracking-wider text-zinc-600">Slot</p>
              <p className="text-[14px] font-black text-white">{match.slotIndex + 1}</p>
            </div>
          </div>

          {/* Schedule */}
          <div className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(99,102,241,0.15)" }}>
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-zinc-500">Scheduled</p>
              <p className="text-[12px] font-bold text-white">
                {format(new Date(match.scheduledAt), "d MMM yyyy, h:mm a")}
              </p>
            </div>
            {match.roomUnlockAt && (
              <div className="text-right shrink-0">
                <p className="text-[10px] text-zinc-500">Room Unlocks</p>
                <p className="text-[11px] font-semibold text-amber-400">
                  {format(new Date(match.roomUnlockAt), "h:mm a")}
                </p>
              </div>
            )}
          </div>

          {/* ════════════════════════════════════════════
              ROOM CONTROL PANEL
          ════════════════════════════════════════════ */}
          <div className="rounded-2xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(99,102,241,0.2)" }}>

            {/* Panel header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "rgba(99,102,241,0.15)", background: "rgba(99,102,241,0.06)" }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "rgba(99,102,241,0.2)" }}>
                <Key className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <p className="text-[12px] font-black text-white uppercase tracking-wider flex-1">Room Control</p>
              {rs && (
                <span className="flex items-center gap-1 text-[9px] font-black uppercase px-2 py-1 rounded-full"
                  style={{ background: rs.bg, color: rs.color, border: `1px solid ${rs.border}` }}>
                  <rs.Icon className="w-2.5 h-2.5" />
                  {rs.label}
                </span>
              )}
              <button
                onClick={() => { const next = !roomEditMode; roomEditModeRef.current = next; setRoomEditMode(next); }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all active:scale-95 ml-1"
                style={{
                  background: roomEditMode ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${roomEditMode ? "rgba(251,191,36,0.4)" : "rgba(255,255,255,0.1)"}`,
                  color: roomEditMode ? "#fbbf24" : "#a1a1aa",
                }}>
                <Pencil className="w-2.5 h-2.5" />
                {roomEditMode ? "Done" : "Edit"}
              </button>
            </div>

            <div className="px-4 py-4 space-y-4">

              {/* Countdown banner */}
              {!match.credentialsReleasedAt && countdown && (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
                  <Timer className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[9px] text-amber-600 uppercase tracking-wider">
                      {match.releaseMode === "auto" ? "Auto-release in" : "Match starts in"}
                    </p>
                    <p className="text-[16px] font-black text-amber-400 font-mono">{countdown}</p>
                  </div>
                </div>
              )}

              {/* Read-only credential display (when not editing) */}
              {!roomEditMode && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl px-3 py-2.5 flex flex-col gap-1"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <p className="text-[9px] uppercase tracking-wider text-zinc-600">Room ID</p>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[13px] font-black text-white flex-1 truncate">{match.roomId || "—"}</span>
                      {match.roomId && <CopyButton text={match.roomId} />}
                    </div>
                  </div>
                  <div className="rounded-xl px-3 py-2.5 flex flex-col gap-1"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <p className="text-[9px] uppercase tracking-wider text-zinc-600">Password</p>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[13px] font-black text-white flex-1 truncate">{match.roomPassword || "—"}</span>
                      {match.roomPassword && <CopyButton text={match.roomPassword} />}
                    </div>
                  </div>
                </div>
              )}

              {/* Editable credential inputs */}
              {roomEditMode && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1">Room ID</p>
                    <div className="flex gap-1.5">
                      <input
                        value={editRoomId}
                        onChange={e => setEditRoomId(e.target.value)}
                        placeholder="Enter Room ID"
                        className="flex-1 min-w-0 bg-transparent rounded-xl px-3 py-2 text-[12px] font-mono text-white placeholder:text-zinc-700 focus:outline-none"
                        style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1">Password</p>
                    <div className="flex gap-1.5">
                      <input
                        value={editPassword}
                        onChange={e => setEditPassword(e.target.value)}
                        placeholder="Enter Password"
                        className="flex-1 min-w-0 bg-transparent rounded-xl px-3 py-2 text-[12px] font-mono text-white placeholder:text-zinc-700 focus:outline-none"
                        style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}
                      />
                    </div>
                  </div>
                </div>

                {/* Free Fire direct link */}
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1">Free Fire Link</p>
                  <input
                    value={editRoomDirectLink}
                    onChange={e => setEditRoomDirectLink(e.target.value)}
                    placeholder="freefire://room?roomId=..."
                    className="w-full bg-transparent rounded-xl px-3 py-2 text-[12px] font-mono text-white placeholder:text-zinc-700 focus:outline-none"
                    style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}
                  />
                </div>

                {/* Credential display mode selector */}
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1.5">Credential Display Mode</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { key: "room_only", label: "A – Room Only" },
                      { key: "ff_only",   label: "B – FF Link" },
                      { key: "both",      label: "A+B – Both" },
                    ].map(({ key, label }) => (
                      <button key={key}
                        onClick={() => setEditShareMode(key)}
                        className="flex items-center justify-center py-2 rounded-xl text-[10px] font-bold transition-all active:scale-95"
                        style={{
                          background: editShareMode === key ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.04)",
                          border: `1px solid ${editShareMode === key ? "rgba(251,191,36,0.5)" : "rgba(255,255,255,0.08)"}`,
                          color: editShareMode === key ? "#fbbf24" : "#71717a",
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Release mode selector */}
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1.5">Distribution Mode</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { key: "manual", label: "Manual", icon: Play },
                      { key: "auto",   label: "Auto",   icon: Timer },
                      { key: "instant", label: "Instant", icon: Zap },
                    ].map(({ key, label, icon: Icon }) => (
                      <button key={key}
                        onClick={() => setEditReleaseMode(key)}
                        className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-bold transition-all active:scale-95"
                        style={{
                          background: editReleaseMode === key ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
                          border: `1px solid ${editReleaseMode === key ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.08)"}`,
                          color: editReleaseMode === key ? "#a5b4fc" : "#71717a",
                        }}>
                        <Icon className="w-3 h-3" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Auto offset picker */}
                {editReleaseMode === "auto" && (
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <Timer className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <p className="text-[10px] text-zinc-400 flex-1">Release credentials</p>
                    <input
                      type="number"
                      min={1} max={60}
                      value={editOffsetMinutes}
                      onChange={e => setEditOffsetMinutes(Math.max(1, Math.min(60, parseInt(e.target.value) || 1)))}
                      className="w-14 text-center bg-transparent rounded-lg px-2 py-1 text-[12px] font-bold text-indigo-400 focus:outline-none"
                      style={{ border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.1)" }}
                    />
                    <p className="text-[10px] text-zinc-500">min before start</p>
                  </div>
                )}

                {/* Save credentials button */}
                <button
                  onClick={async () => { const ok = await saveCreds(); if (ok) { roomEditModeRef.current = false; setRoomEditMode(false); } }}
                  disabled={savingCreds}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-95 disabled:opacity-50"
                  style={{ background: "rgba(99,102,241,0.18)", border: "1px solid rgba(99,102,241,0.35)", color: "#a5b4fc" }}>
                  {savingCreds ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {savingCreds ? "Saving…" : "Save Credentials & Mode"}
                </button>
              </div>
              )}

              {/* Action buttons row */}
              <div className="grid grid-cols-2 gap-2">
                {/* Release Now */}
                {!match.credentialsReleasedAt ? (
                  <button
                    onClick={releaseNow}
                    disabled={releasing || (!match.roomDirectLink && (!match.roomId || !match.roomPassword))}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-black transition-all active:scale-95 disabled:opacity-40"
                    style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.35)", color: "#4ade80" }}>
                    {releasing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    {releasing ? "Releasing…" : "Release Now"}
                  </button>
                ) : (
                  <button
                    onClick={releaseNow}
                    disabled={releasing || (!match.roomDirectLink && (!match.roomId || !match.roomPassword))}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-black transition-all active:scale-95 disabled:opacity-40"
                    style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.35)", color: "#a5b4fc" }}>
                    {releasing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    {releasing ? "Releasing…" : "Re-release"}
                  </button>
                )}

                {/* Hide toggle */}
                <button
                  onClick={toggleHide}
                  disabled={hiding}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-black transition-all active:scale-95 disabled:opacity-50"
                  style={{
                    background: match.credentialsHidden ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.05)",
                    border: `1px solid ${match.credentialsHidden ? "rgba(251,191,36,0.35)" : "rgba(255,255,255,0.1)"}`,
                    color: match.credentialsHidden ? "#fbbf24" : "#71717a",
                  }}>
                  {hiding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : match.credentialsHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  {match.credentialsHidden ? "Show Creds" : "Hide Creds"}
                </button>
              </div>

              {/* Resend all unconfirmed */}
              {credReleased && unconfirmedCount > 0 && (
                <button
                  onClick={() => resendNotification()}
                  disabled={resending === "all"}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-bold transition-all active:scale-95 disabled:opacity-50"
                  style={{ background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.25)", color: "#fb923c" }}>
                  {resending === "all" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
                  Resend to All Unconfirmed ({unconfirmedCount})
                </button>
              )}

              {/* Open in Free Fire deep-link button */}
              {credReleased && (match.roomId || match.roomDirectLink) && (
                <a
                  href={match.roomDirectLink || (match.roomId ? `freefire://room?roomId=${encodeURIComponent(match.roomId)}` : "#")}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                  style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)", color: "#fbbf24" }}>
                  <Gamepad2 className="w-3.5 h-3.5" />
                  Open in Free Fire
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              )}

              {/* Release info */}
              {match.credentialsReleasedAt && (
                <p className="text-[10px] text-zinc-600 text-center">
                  Released {formatDistanceToNow(new Date(match.credentialsReleasedAt), { addSuffix: true })}
                </p>
              )}
            </div>
          </div>

          {/* Notes */}
          {match.notes && (
            <div className="rounded-xl px-4 py-3"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1">Notes</p>
              <p className="text-[12px] text-zinc-300">{match.notes}</p>
            </div>
          )}

          {/* ════════════════════════════════════════════
              PLAYER ENGAGEMENT PANEL
          ════════════════════════════════════════════ */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: "rgba(249,115,22,0.15)" }}>
                  <Swords className="w-3 h-3 text-orange-400" />
                </div>
                <p className="text-[11px] font-black text-white uppercase tracking-wider">Players</p>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[9px] text-zinc-600">Live</span>
              </div>
            </div>

            {/* Player cards — tap to select */}
            <div className="flex gap-2">
              <div className="flex-1">
                <PlayerEngagementCard
                  player={match.player1}
                  userId={match.player1Id}
                  seat={match.player1Seat ?? "A"}
                  playerStatus={p1Status}
                  credReleased={credReleased}
                  onResend={() => resendNotification(match.player1Id)}
                  resending={resending === match.player1Id}
                  selected={p1Selected}
                  onSelect={setP1Selected}
                  selectable={true}
                />
              </div>

              {/* VS divider */}
              <div className="flex flex-col items-center justify-center gap-1.5 shrink-0 py-4">
                <div className="w-px flex-1" style={{ background: "rgba(255,255,255,0.06)" }} />
                <div className="px-2.5 py-1 rounded-lg text-[10px] font-black"
                  style={{ background: "rgba(249,115,22,0.12)", color: "#fb923c", border: "1px solid rgba(249,115,22,0.25)" }}>
                  VS
                </div>
                <div className="w-px flex-1" style={{ background: "rgba(255,255,255,0.06)" }} />
              </div>

              <div className="flex-1">
                <PlayerEngagementCard
                  player={match.player2}
                  userId={match.player2Id ?? 0}
                  seat={match.player2Seat ?? "B"}
                  playerStatus={p2Status}
                  credReleased={credReleased}
                  onResend={() => resendNotification(match.player2Id ?? undefined)}
                  resending={resending === match.player2Id}
                  selected={p2Selected}
                  onSelect={setP2Selected}
                  selectable={!!match.player2Id}
                />
              </div>
            </div>

            {/* ── Raw API Response (pre-snapshot) between players ── */}
            {(p1Verif?.preSnapshotData || p2Verif?.preSnapshotData) && (
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(99,102,241,0.2)", background: "rgba(99,102,241,0.04)" }}>
                <button
                  onClick={() => setRawApiExpanded(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Database className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300">Raw API Response (Pre-Snapshot)</span>
                  </div>
                  {rawApiExpanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />}
                </button>
                {rawApiExpanded && (
                  <div className="border-t px-3 pb-3 pt-2 space-y-3" style={{ borderColor: "rgba(99,102,241,0.15)" }}>
                    {[
                      { label: match.player1?.inGameName ?? `User #${match.player1Id}`, data: p1Verif?.preSnapshotData ?? null, color: "#a5b4fc" },
                      { label: match.player2?.inGameName ?? `User #${match.player2Id}`, data: p2Verif?.preSnapshotData ?? null, color: "#fb923c" },
                    ].map(({ label, data, color }) => (
                      <div key={label}>
                        <p className="text-[9px] font-black uppercase tracking-wider mb-1" style={{ color }}>{label}</p>
                        {data ? (
                          <pre className="text-[8px] leading-relaxed rounded-lg p-2 overflow-x-auto max-h-48 text-zinc-400 select-all"
                            style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.06)", fontFamily: "monospace" }}>
                            {JSON.stringify(JSON.parse(data), null, 2)}
                          </pre>
                        ) : (
                          <p className="text-[10px] text-zinc-600 italic">No data fetched yet</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Unified Match Control Panel ── */}
            {match && vs && (
              <div className="rounded-2xl overflow-hidden"
                style={{ border: `1px solid ${vs.border}`, background: "rgba(255,255,255,0.015)" }}>

                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b"
                  style={{ borderColor: vs.border, background: vs.bg }}>
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: vs.bg }}>
                    <TrendingUp className="w-3.5 h-3.5" style={{ color: vs.color }} />
                  </div>
                  <p className="text-[11px] font-black text-white uppercase tracking-wider flex-1">Match Control</p>
                  <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-full"
                    style={{ background: vs.bg, color: vs.color, border: `1px solid ${vs.border}` }}>
                    {vs.label}
                  </span>
                </div>

                <div className="p-4 space-y-4">

                  {/* Game Mode */}
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1.5">Game Mode</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(["br", "cs"] as const).map(gm => {
                        const locked = match.verificationStatus !== "pending";
                        const active = (locked ? match.gameMode : configGameMode) === gm;
                        return (
                          <button key={gm}
                            onClick={() => !locked && setConfigGameMode(gm)}
                            className="py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all active:scale-95"
                            style={{
                              background: active ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.04)",
                              border: `1px solid ${active ? "rgba(99,102,241,0.55)" : "rgba(255,255,255,0.08)"}`,
                              color: active ? "#a5b4fc" : "#52525b",
                              cursor: locked ? "default" : "pointer",
                            }}>
                            {gm === "br" ? "🎯 Battle Royale" : "⚔️ Clash Squad"}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Match Mode */}
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1.5">Match Mode</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(["normal", "career", "ranked"] as const).map(mm => {
                        const locked = match.verificationStatus !== "pending";
                        const active = (locked ? match.matchMode : configMatchMode) === mm;
                        return (
                          <button key={mm}
                            onClick={() => !locked && setConfigMatchMode(mm)}
                            className="py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95"
                            style={{
                              background: active ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.04)",
                              border: `1px solid ${active ? "rgba(251,191,36,0.55)" : "rgba(255,255,255,0.08)"}`,
                              color: active ? "#fbbf24" : "#52525b",
                              cursor: locked ? "default" : "pointer",
                            }}>
                            {mm}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── PENDING: Confirm Player(s) Join ── */}
                  {match.verificationStatus === "pending" && (
                    <>
                      {(!p1Selected && !p2Selected) && (
                        <p className="text-[9px] text-amber-500 text-center py-0.5">
                          Tap a player card above to select them
                        </p>
                      )}
                      <button
                        onClick={() => { setStatsProgress([]); confirmJoined(); }}
                        disabled={confirmingJoined || (!p1Selected && !p2Selected)}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[13px] font-black transition-all active:scale-95 disabled:opacity-35"
                        style={{ background: "rgba(34,197,94,0.18)", border: "1px solid rgba(34,197,94,0.45)", color: "#4ade80" }}>
                        <UserCheck className="w-4 h-4" /> Confirm Player(s) Join
                      </button>
                    </>
                  )}

                  {/* ── Stats fetch live progress ── */}
                  {statsProgress.length > 0 && (
                    <div className="rounded-xl px-3 py-2.5 space-y-2"
                      style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)" }}>
                      <p className="text-[9px] font-black uppercase tracking-wider text-indigo-400 mb-1">Stats Fetch Progress</p>
                      {statsProgress.map(p => {
                        const isFailed = p.step.startsWith("✗") || p.step.includes("No FF UID");
                        const isDone = p.step.startsWith("✓");
                        return (
                          <div key={p.userId} className="flex items-start gap-2">
                            <span className="text-[11px] font-bold text-white shrink-0 w-24 truncate">{p.playerName}</span>
                            <span className="text-[10px] leading-relaxed flex-1"
                              style={{ color: isDone ? "#4ade80" : isFailed ? "#f87171" : "#a1a1aa" }}>
                              {isDone || isFailed ? "" : <RefreshCw className="inline w-2.5 h-2.5 animate-spin mr-1" />}
                              {p.step}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── POST-CONFIRMATION ── */}
                  {match.verificationStatus !== "pending" && (
                    <>
                      {/* Re-fetch pre-stats button (shown when any player missing snapshot) */}
                      {verifications.some(v => !v.preSnapshotData) && (
                        <button
                          onClick={() => { setStatsProgress([]); refetchPreStats(); }}
                          disabled={refetchingStats}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-black transition-all active:scale-95 disabled:opacity-40"
                          style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.35)", color: "#a5b4fc" }}>
                          {refetchingStats ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                          {refetchingStats ? "Re-fetching…" : "Try Again — Re-fetch Pre-Stats"}
                        </button>
                      )}

                      {/* Snapshot fetch failures */}
                      {statsProgress.length === 0 && verifications.some(v => !v.preSnapshotData) && (
                        <div className="rounded-xl px-3 py-2 space-y-1"
                          style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
                          {verifications.filter(v => !v.preSnapshotData).map(v => {
                            const p = v.userId === match.player1Id ? match.player1 : match.player2;
                            return (
                              <p key={v.userId} className="text-[10px] text-red-400">
                                ⚠ {p?.inGameName ?? `User #${v.userId}`}: {v.ffUid ? "Both APIs failed — check UID" : "No FF UID set on profile"}
                              </p>
                            );
                          })}
                        </div>
                      )}

                      {/* Stats snapshot table */}
                      {(p1Verif?.preSnapshotData || p2Verif?.preSnapshotData) && (() => {
                        const gm = match.gameMode ?? "cs";
                        const key = gm === "cs" ? "csstats" : "brstats";
                        const p1pre = parseSnapshot(p1Verif?.preSnapshotData ?? null)?.data?.[key];
                        const p2pre = parseSnapshot(p2Verif?.preSnapshotData ?? null)?.data?.[key];
                        const p1diff = parseStatDiff(p1Verif);
                        const p2diff = parseStatDiff(p2Verif);
                        const hasPost = !!(p1Verif?.postSnapshotData || p2Verif?.postSnapshotData);
                        const rows = [
                          { label: "Games",    v1: p1pre?.gamesplayed,               v2: p2pre?.gamesplayed,               d1: p1diff?.gamesplayed,  d2: p2diff?.gamesplayed },
                          { label: "Wins",     v1: p1pre?.wins,                      v2: p2pre?.wins,                      d1: p1diff?.wins,         d2: p2diff?.wins },
                          { label: "Kills",    v1: p1pre?.kills,                     v2: p2pre?.kills,                     d1: p1diff?.kills,        d2: p2diff?.kills },
                          { label: "Damage",   v1: p1pre?.detailedstats?.damage,     v2: p2pre?.detailedstats?.damage,     d1: p1diff?.damage,       d2: p2diff?.damage },
                          { label: "Knockdns", v1: p1pre?.detailedstats?.knockDowns, v2: p2pre?.detailedstats?.knockDowns, d1: p1diff?.knockDowns,   d2: p2diff?.knockDowns },
                          { label: "MVP",      v1: p1pre?.detailedstats?.mvpCount,   v2: p2pre?.detailedstats?.mvpCount,   d1: p1diff?.mvpCount,     d2: p2diff?.mvpCount },
                          { label: "Assists",  v1: p1pre?.detailedstats?.assists,    v2: p2pre?.detailedstats?.assists,    d1: p1diff?.assists,      d2: p2diff?.assists },
                          { label: "Deaths",   v1: p1pre?.detailedstats?.deaths,     v2: p2pre?.detailedstats?.deaths,     d1: p1diff?.deaths,       d2: p2diff?.deaths },
                        ];
                        return (
                          <div>
                            <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-2">
                              {hasPost ? "Stat Comparison (Pre → Post Gain)" : "Pre-Match Stats Snapshot"}
                            </p>
                            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                              <div className="grid grid-cols-4 px-3 py-1.5"
                                style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                <span className="text-[8px] font-black uppercase text-zinc-600">Stat</span>
                                <span className="text-[8px] font-black uppercase text-right" style={{ color: "#a5b4fc" }}>
                                  {match.player1?.inGameName?.slice(0, 7) ?? "P1"}
                                </span>
                                <span className="text-[8px] font-black uppercase text-right" style={{ color: "#fb923c" }}>
                                  {match.player2?.inGameName?.slice(0, 7) ?? "P2"}
                                </span>
                                <span className="text-[8px] font-black uppercase text-right text-zinc-600">
                                  {hasPost ? "Gain" : "—"}
                                </span>
                              </div>
                              {rows.map(({ label, v1, v2, d1, d2 }) => (
                                <div key={label} className="grid grid-cols-4 px-3 py-1.5 border-b last:border-0"
                                  style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                                  <span className="text-[9px] text-zinc-500">{label}</span>
                                  <span className="text-[10px] text-right" style={{ color: "#a5b4fc" }}>{v1?.toLocaleString() ?? "—"}</span>
                                  <span className="text-[10px] text-right" style={{ color: "#fb923c" }}>{v2?.toLocaleString() ?? "—"}</span>
                                  {hasPost ? (
                                    <span className="text-[9px] text-right font-black"
                                      style={{ color: (d1 ?? 0) > (d2 ?? 0) ? "#4ade80" : (d2 ?? 0) > (d1 ?? 0) ? "#f87171" : "#52525b" }}>
                                      {d1 !== undefined ? `${(d1 ?? 0) >= 0 ? "+" : ""}${d1}/${(d2 ?? 0) >= 0 ? "+" : ""}${d2}` : "—"}
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-right text-zinc-700">—</span>
                                  )}
                                </div>
                              ))}
                            </div>
                            {p1Verif?.preSnapshotAt && (
                              <p className="text-[9px] text-zinc-700 mt-1 text-right">
                                Snapshot {formatDistanceToNow(new Date(p1Verif.preSnapshotAt), { addSuffix: true })}
                              </p>
                            )}
                          </div>
                        );
                      })()}

                      {/* Winner banner */}
                      {(match.verificationStatus === "winner_decided" || match.verificationStatus === "reward_distributed") && match.winnerId && (
                        <div className="flex items-center gap-3 px-3 py-3 rounded-2xl"
                          style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)" }}>
                          <Trophy className="w-6 h-6 text-amber-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[9px] text-amber-600 uppercase tracking-wider">Winner</p>
                            <p className="text-[13px] font-black text-white">
                              {match.winnerId === match.player1Id
                                ? (match.player1?.inGameName ?? `User #${match.player1Id}`)
                                : (match.player2?.inGameName ?? `User #${match.player2Id}`)}
                            </p>
                            {match.verificationStatus === "reward_distributed" && match.prizeAmountDiamonds > 0 && (
                              <p className="text-[10px] text-green-400 font-bold">+{match.prizeAmountDiamonds} 💎 credited to wallet</p>
                            )}
                          </div>
                          {match.rewardDistributedAt && (
                            <p className="text-[9px] text-zinc-600 text-right shrink-0">
                              {formatDistanceToNow(new Date(match.rewardDistributedAt), { addSuffix: true })}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Winner Before → After Stats Card */}
                      {match.winnerId && (() => {
                        const winnerVerif = verifications.find(v => v.userId === match.winnerId);
                        if (!winnerVerif?.preSnapshotData || !winnerVerif?.postSnapshotData) return null;
                        const gm = match.gameMode ?? "cs";
                        const key = gm === "cs" ? "csstats" : "brstats";
                        const pre = parseSnapshot(winnerVerif.preSnapshotData)?.data?.[key];
                        const post = parseSnapshot(winnerVerif.postSnapshotData)?.data?.[key];
                        const diff = parseStatDiff(winnerVerif);
                        if (!pre || !post) return null;
                        const winnerName = match.winnerId === match.player1Id
                          ? (match.player1?.inGameName ?? `User #${match.player1Id}`)
                          : (match.player2?.inGameName ?? `User #${match.player2Id}`);
                        const rows = [
                          { label: "Games",     pre: pre.gamesplayed,                  post: post.gamesplayed,                  gain: diff?.gamesplayed },
                          { label: "Wins",      pre: pre.wins,                         post: post.wins,                         gain: diff?.wins },
                          { label: "Kills",     pre: pre.kills,                        post: post.kills,                        gain: diff?.kills },
                          { label: "Damage",    pre: pre.detailedstats?.damage,        post: post.detailedstats?.damage,        gain: diff?.damage },
                          { label: "Knockdns",  pre: pre.detailedstats?.knockDowns,    post: post.detailedstats?.knockDowns,    gain: diff?.knockDowns },
                          { label: "MVP",       pre: pre.detailedstats?.mvpCount,      post: post.detailedstats?.mvpCount,      gain: diff?.mvpCount },
                          { label: "Assists",   pre: pre.detailedstats?.assists,       post: post.detailedstats?.assists,       gain: diff?.assists },
                          { label: "Deaths",    pre: pre.detailedstats?.deaths,        post: post.detailedstats?.deaths,        gain: diff?.deaths },
                        ].filter(r => r.pre !== undefined || r.post !== undefined);
                        return (
                          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(251,191,36,0.3)", background: "linear-gradient(135deg,rgba(251,191,36,0.07),rgba(0,0,0,0.4))" }}>
                            {/* Header */}
                            <div className="flex items-center gap-2.5 px-3 py-2.5 border-b" style={{ borderColor: "rgba(251,191,36,0.15)", background: "rgba(251,191,36,0.06)" }}>
                              <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-[9px] text-amber-600 uppercase tracking-wider font-black">Winner · Match Performance</p>
                                <p className="text-[12px] font-extrabold text-amber-300 truncate">{winnerName}</p>
                              </div>
                              {match.prizeAmountDiamonds > 0 && (
                                <span className="text-[11px] font-black text-green-400 shrink-0">+{match.prizeAmountDiamonds} 💎</span>
                              )}
                            </div>
                            {/* Stats table */}
                            <div className="px-3 pb-3 pt-2">
                              <div className="grid grid-cols-4 pb-1 mb-1 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                                <span className="text-[8px] font-black uppercase text-zinc-600">Stat</span>
                                <span className="text-[8px] font-black uppercase text-right text-zinc-500">Before</span>
                                <span className="text-[8px] font-black uppercase text-right text-amber-500">After</span>
                                <span className="text-[8px] font-black uppercase text-right text-green-500">Gain</span>
                              </div>
                              {rows.map(({ label, pre: pv, post: av, gain }) => {
                                const g = gain ?? ((av !== undefined && pv !== undefined) ? av - pv : undefined);
                                const isPos = g !== undefined && g > 0;
                                return (
                                  <div key={label} className="grid grid-cols-4 py-1 border-b last:border-0" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                                    <span className="text-[9px] text-zinc-500">{label}</span>
                                    <span className="text-[10px] text-right text-zinc-500">{pv?.toLocaleString() ?? "—"}</span>
                                    <span className="text-[10px] text-right font-bold text-amber-300">{av?.toLocaleString() ?? "—"}</span>
                                    <span className="text-[9px] text-right font-black"
                                      style={{ color: isPos ? "#4ade80" : g === 0 ? "#52525b" : g !== undefined ? "#f87171" : "#3f3f46" }}>
                                      {g !== undefined ? (isPos ? `+${g}` : String(g)) : "—"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Disputed banner + manual winner pick */}
                      {match.verificationStatus === "disputed" && (
                        <div className="rounded-2xl overflow-hidden space-y-0"
                          style={{ border: "1px solid rgba(249,115,22,0.35)", background: "rgba(249,115,22,0.05)" }}>

                          {/* Banner */}
                          <div className="flex items-center gap-3 px-3 py-3 border-b"
                            style={{ borderColor: "rgba(249,115,22,0.18)" }}>
                            <AlertCircle className="w-4 h-4 text-orange-400 shrink-0" />
                            <div>
                              <p className="text-[11px] text-orange-300 font-black">Match Disputed</p>
                              <p className="text-[10px] text-orange-500">Tap a player below to manually decide the winner, then confirm.</p>
                            </div>
                          </div>

                          {/* Player selector */}
                          <div className="flex gap-2 p-3">
                            {[
                              { id: match.player1Id, player: match.player1, label: "Player 1" },
                              ...(match.player2Id ? [{ id: match.player2Id, player: match.player2, label: "Player 2" }] : []),
                            ].map(({ id, player, label }) => {
                              const name = player?.inGameName ?? label;
                              const initials = name.slice(0, 2).toUpperCase();
                              const selected = overrideWinnerId === id;
                              return (
                                <button
                                  key={id}
                                  onClick={() => setOverrideWinnerId(selected ? null : id)}
                                  className="flex-1 flex flex-col items-center gap-2 py-3 rounded-xl transition-all active:scale-95"
                                  style={{
                                    background: selected ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)",
                                    border: `1.5px solid ${selected ? "rgba(34,197,94,0.55)" : "rgba(255,255,255,0.1)"}`,
                                    boxShadow: selected ? "0 0 0 3px rgba(34,197,94,0.1)" : "none",
                                  }}>
                                  {player?.profilePicture ? (
                                    <img src={player.profilePicture} className="w-9 h-9 rounded-full object-cover" />
                                  ) : (
                                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-black"
                                      style={{ background: selected ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.07)", color: selected ? "#4ade80" : "#71717a" }}>
                                      {initials}
                                    </div>
                                  )}
                                  <p className="text-[11px] font-black truncate max-w-full px-1"
                                    style={{ color: selected ? "#4ade80" : "#a1a1aa" }}>{name}</p>
                                  {selected && (
                                    <div className="flex items-center gap-1 text-[9px] font-black text-green-400">
                                      <CheckCircle2 className="w-3 h-3" /> Winner
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          {/* Prize input + confirm button */}
                          {overrideWinnerId && (
                            <div className="px-3 pb-3 space-y-2">
                              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                                <span className="text-[10px] text-zinc-500 shrink-0">Prize 💎</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={overridePrize}
                                  onChange={e => setOverridePrize(Number(e.target.value))}
                                  className="flex-1 bg-transparent text-white text-[12px] font-bold text-right outline-none"
                                  placeholder="0"
                                />
                              </div>
                              <button
                                onClick={overrideWinner}
                                disabled={overriding}
                                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[12px] font-black transition-all active:scale-95 disabled:opacity-50"
                                style={{ background: "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.45)", color: "#4ade80" }}>
                                {overriding
                                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Confirming…</>
                                  : <><Trophy className="w-3.5 h-3.5" /> Confirm Winner & Credit Prize</>}
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Failed banner */}
                      {match.verificationStatus === "failed" && (
                        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                          <p className="text-[11px] text-red-300 font-bold">No new game progress detected — re-verify after the match is played.</p>
                        </div>
                      )}

                      {/* Verify Result — shown when pre-snapshot is stored */}
                      {match.verificationStatus === "pre_snapshot_stored" && (
                        <div className="space-y-2">
                          {!verifyConfirm ? (
                            <button
                              onClick={() => setVerifyConfirm(true)}
                              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[12px] font-black transition-all active:scale-95"
                              style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", color: "#a5b4fc" }}>
                              <TrendingUp className="w-4 h-4" />
                              Verify Match Result
                            </button>
                          ) : (
                            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(99,102,241,0.4)" }}>
                              <p className="text-[10px] text-indigo-300 text-center py-2 font-bold px-4"
                                style={{ background: "rgba(99,102,241,0.1)" }}>
                                Fetches post-match stats &amp; auto-determines winner.
                              </p>
                              <div className="flex gap-2 p-2">
                                <button onClick={() => setVerifyConfirm(false)}
                                  className="flex-1 py-2 rounded-xl text-[10px] font-bold text-zinc-400"
                                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                                  Cancel
                                </button>
                                <button onClick={verifyResult} disabled={verifyingResult}
                                  className="flex-1 py-2 rounded-xl text-[10px] font-black disabled:opacity-50"
                                  style={{ background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.5)", color: "#a5b4fc" }}>
                                  {verifyingResult ? <><RefreshCw className="w-3 h-3 animate-spin inline mr-1" />Verifying…</> : "Confirm Verify"}
                                </button>
                              </div>
                            </div>
                          )}
                          <button
                            onClick={disputeMatch}
                            disabled={disputing}
                            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-bold transition-all active:scale-95 disabled:opacity-50"
                            style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)", color: "#fb923c" }}>
                            {disputing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <AlertCircle className="w-3 h-3" />}
                            Mark as Disputed
                          </button>
                        </div>
                      )}

                      {/* Re-verify — for failed or disputed */}
                      {(match.verificationStatus === "failed" || match.verificationStatus === "disputed") && (
                        <button
                          onClick={verifyResult}
                          disabled={verifyingResult}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 disabled:opacity-50"
                          style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc" }}>
                          {verifyingResult ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          Re-Verify Result
                        </button>
                      )}
                    </>
                  )}

                </div>
              </div>
            )}
          </div>

          {/* ════════════════════════════════════════════
              EMERGENCY CONTROLS
          ════════════════════════════════════════════ */}
          <div className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.04)" }}>
            <button
              onClick={() => setEmergencyOpen(v => !v)}
              className="w-full flex items-center gap-3 px-4 py-3"
              style={{ background: "rgba(239,68,68,0.05)" }}>
              <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "rgba(239,68,68,0.15)" }}>
                <TriangleAlert className="w-3 h-3 text-red-400" />
              </div>
              <p className="text-[11px] font-black text-red-400 uppercase tracking-wider flex-1 text-left">Emergency Controls</p>
              {emergencyOpen ? <ChevronUp className="w-4 h-4 text-red-600" /> : <ChevronDown className="w-4 h-4 text-red-600" />}
            </button>

            {emergencyOpen && (
              <div className="px-4 py-3 space-y-2.5">
                {/* Replace Room */}
                <button
                  onClick={() => { setReplaceModal(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                  style={{ background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.25)", color: "#fb923c" }}>
                  <RotateCcw className="w-3.5 h-3.5" />
                  Replace Room (New ID/Password & Re-notify)
                </button>

                {/* Force Hide */}
                <button
                  onClick={forceHide}
                  disabled={hiding}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 disabled:opacity-50"
                  style={{ background: "rgba(161,161,170,0.08)", border: "1px solid rgba(161,161,170,0.2)", color: "#a1a1aa" }}>
                  {hiding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <EyeOff className="w-3.5 h-3.5" />}
                  Force Hide Credentials
                </button>

                {/* Force Expire */}
                {!confirmExpire ? (
                  <button
                    onClick={() => setConfirmExpire(true)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                    style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}>
                    <Skull className="w-3.5 h-3.5" />
                    Force Expire Match
                  </button>
                ) : (
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(239,68,68,0.4)" }}>
                    <p className="text-[10px] text-red-400 text-center py-2 font-bold"
                      style={{ background: "rgba(239,68,68,0.1)" }}>
                      Confirm: permanently expire this match?
                    </p>
                    <div className="flex gap-2 p-2">
                      <button onClick={() => setConfirmExpire(false)}
                        className="flex-1 py-2 rounded-lg text-[10px] font-bold text-zinc-400"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                        Cancel
                      </button>
                      <button onClick={forceExpire} disabled={expiring}
                        className="flex-1 py-2 rounded-lg text-[10px] font-black text-red-400 disabled:opacity-50"
                        style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)" }}>
                        {expiring ? "Expiring…" : "Yes, Expire"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ════════════════════════════════════════════
              ACTIVITY LOG
          ════════════════════════════════════════════ */}
          <div className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
            <button
              onClick={() => setLogExpanded(v => !v)}
              className="w-full flex items-center gap-3 px-4 py-3">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "rgba(99,102,241,0.12)" }}>
                <Clock className="w-3 h-3 text-indigo-400" />
              </div>
              <p className="text-[11px] font-black text-zinc-300 uppercase tracking-wider flex-1 text-left">Activity Log</p>
              <span className="text-[9px] font-bold text-zinc-600 mr-2">{match.events.length} events</span>
              {logExpanded ? <ChevronUp className="w-4 h-4 text-zinc-600" /> : <ChevronDown className="w-4 h-4 text-zinc-600" />}
            </button>

            {logExpanded && (
              <div className="px-4 pb-3 space-y-2">
                {match.events.length === 0 ? (
                  <p className="text-[11px] text-zinc-600 text-center py-3">No events yet</p>
                ) : (
                  match.events.map(ev => {
                    const ab = actorBadge(ev.actor);
                    return (
                      <div key={ev.id} className="flex items-start gap-2.5 py-2 border-b last:border-0"
                        style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                        <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                          style={{ background: ab.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[9px] font-black uppercase" style={{ color: ab.color }}>{ab.label}</span>
                            <span className="text-[10px] text-zinc-300 font-medium">{eventLabel(ev.eventType)}</span>
                          </div>
                          <p className="text-[9px] text-zinc-600 mt-0.5">
                            {formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Created at */}
          <p className="text-center text-[9px] text-zinc-700 pb-2">
            Created {format(new Date(match.createdAt), "d MMM yyyy, h:mm a")}
          </p>
        </div>
      )}

      {/* ════════════════════════════════════════════
          REPLACE ROOM MODAL
      ════════════════════════════════════════════ */}
      {replaceModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setReplaceModal(false); }}>
          <div className="w-full max-w-md rounded-t-3xl p-6 space-y-4"
            style={{ background: "#131315", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(249,115,22,0.15)" }}>
                <RotateCcw className="w-4 h-4 text-orange-400" />
              </div>
              <div>
                <p className="text-[13px] font-black text-white">Replace Room</p>
                <p className="text-[10px] text-zinc-500">Players will be re-notified with new credentials</p>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1">New Room ID</p>
                <input
                  value={newRoomId}
                  onChange={e => setNewRoomId(e.target.value)}
                  placeholder="Enter new Room ID"
                  className="w-full bg-transparent rounded-xl px-3 py-2.5 text-[13px] font-mono text-white placeholder:text-zinc-700 focus:outline-none"
                  style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}
                />
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1">New Password</p>
                <input
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Enter new Password"
                  className="w-full bg-transparent rounded-xl px-3 py-2.5 text-[13px] font-mono text-white placeholder:text-zinc-700 focus:outline-none"
                  style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => { setReplaceModal(false); setNewRoomId(""); setNewPassword(""); }}
                className="flex-1 py-2.5 rounded-xl text-[12px] font-bold text-zinc-400 transition-all"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                Cancel
              </button>
              <button
                onClick={replaceRoom}
                disabled={replacing || !newRoomId.trim() || !newPassword.trim()}
                className="flex-1 py-2.5 rounded-xl text-[12px] font-black transition-all active:scale-95 disabled:opacity-40"
                style={{ background: "rgba(249,115,22,0.2)", border: "1px solid rgba(249,115,22,0.4)", color: "#fb923c" }}>
                {replacing ? "Replacing…" : "Replace & Notify"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
