import { useParams, useLocation } from "wouter";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  ArrowLeft, Users, Clock, Copy, Check, Shield, Crosshair,
  Heart, Scissors, Target, Wind, Map as MapIcon, X, Swords, CheckCircle2,
  Zap, RotateCcw, Cpu, KeyRound, ExternalLink,
} from "lucide-react";
import { CoinIcon } from "@/components/CoinIcon";
import { apiFetch, apiPost } from "@/lib/api";

type GameType = "cs" | "br";

const MODE_META: Record<string, {
  name: string;
  format: string;
  accent: string;
  Icon: React.ElementType;
  mapName: string;
  maxPlayers: number;
}> = {
  duel:           { name: "1v1 Duel",       format: "1v1",  accent: "#ef4444", Icon: Crosshair, mapName: "Bermuda Duel Zone",  maxPlayers: 2  },
  healing:        { name: "Healing Battle",  format: "1v1",  accent: "#ec4899", Icon: Heart,     mapName: "Purgatory Arena",    maxPlayers: 2  },
  "clash-squad":  { name: "Clash Squad",     format: "4v4",  accent: "#f97316", Icon: Shield,    mapName: "Bermuda Clash Zone", maxPlayers: 8  },
  knife:          { name: "Knife Fight",     format: "1v1",  accent: "#a78bfa", Icon: Scissors,  mapName: "Kalahari Pit",       maxPlayers: 2  },
  "solo-drop":    { name: "Solo Drop",       format: "Solo", accent: "#3b82f6", Icon: Target,    mapName: "Bermuda Classic",    maxPlayers: 12 },
  "duo-rush":     { name: "Duo Rush",        format: "2v2",  accent: "#06b6d4", Icon: Users,     mapName: "Purgatory Rush",     maxPlayers: 4  },
  "squad-wipe":   { name: "Squad Wipe",      format: "4v4",  accent: "#8b5cf6", Icon: Swords,    mapName: "Kalahari Showdown",  maxPlayers: 8  },
  "zone-control": { name: "Zone Control",    format: "Solo", accent: "#22c55e", Icon: MapIcon,   mapName: "Alpine Zone",        maxPlayers: 10 },
};

const TYPE_LABEL: Record<GameType, string> = {
  cs: "Classic Survival",
  br: "Battle Royale",
};

function pad(n: number) { return String(n).padStart(2, "0"); }
function formatTime(s: number) { return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; }

interface MatchInfo {
  roomId: string;
  password: string;
  mapName: string;
  format: string;
  maxPlayers: number;
  openInFfUrl: string | null;
  credentialsReadyAt: string | null;
}

interface PlayerInfo {
  userId: string;
  inGameName: string;
  profilePicture?: string | null;
  uid?: string | null;
}

interface QueueStats {
  cs: { total: number; modes: Record<string, number> };
  br: { total: number; modes: Record<string, number> };
}

type RoomStatus =
  | "opponent_found"
  | "creating_room"
  | "booting_game"
  | "waiting_credentials"
  | "ready";

type Phase = "searching" | "preparing" | "found" | "joined" | "cancelled";

const STATUS_MESSAGES = [
  "Searching for opponent…",
  "Scanning active players…",
  "Matching skill levels…",
  "Almost there…",
];

const ROOM_STEPS: { key: RoomStatus | "ready"; label: string; Icon: React.ElementType }[] = [
  { key: "opponent_found",      label: "Opponent Found",          Icon: Zap       },
  { key: "creating_room",       label: "Creating Room",           Icon: RotateCcw },
  { key: "booting_game",        label: "Booting Game",            Icon: Cpu       },
  { key: "waiting_credentials", label: "Waiting for Credentials", Icon: KeyRound  },
  { key: "ready",               label: "Room Ready!",             Icon: CheckCircle2 },
];

const STEP_ORDER: RoomStatus[] = [
  "opponent_found",
  "creating_room",
  "booting_game",
  "waiting_credentials",
  "ready",
];

const JOIN_WINDOW_SECONDS = 20;

function stepIndex(s: RoomStatus | null): number {
  if (!s) return -1;
  const i = STEP_ORDER.indexOf(s);
  return i === -1 ? 0 : i;
}

function Avatar({
  src,
  name,
  size = 64,
  accent,
}: { src?: string | null; name: string; size?: number; accent: string }) {
  const initials = name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div
      className="rounded-full flex items-center justify-center overflow-hidden shrink-0"
      style={{
        width: size,
        height: size,
        background: src ? "transparent" : `${accent}28`,
        border: `2px solid ${accent}55`,
        boxShadow: `0 0 20px ${accent}30`,
      }}
    >
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span className="font-black" style={{ fontSize: size * 0.32, color: accent }}>
          {initials}
        </span>
      )}
    </div>
  );
}

export default function QuickMatchQueue() {
  const params = useParams<{ type: string; mode: string }>();
  const [, navigate] = useLocation();

  const typeKey = (params.type ?? "cs") as GameType;
  const modeId  = params.mode ?? "duel";
  const meta    = MODE_META[modeId] ?? MODE_META["duel"];
  const accent  = meta.accent;

  const [phase, setPhase]           = useState<Phase>("searching");
  const [elapsed, setElapsed]       = useState(0);
  const [queueCount, setQueueCount] = useState<number | null>(null);
  const [matchInfo, setMatchInfo]   = useState<MatchInfo | null>(null);
  const [copied, setCopied]         = useState<"room" | "pass" | null>(null);
  const [visible, setVisible]       = useState(false);
  const [statusIdx, setStatusIdx]   = useState(0);
  const [joining, setJoining]       = useState(false);
  const [mePlayer, setMePlayer]     = useState<PlayerInfo | null>(null);
  const [opponent, setOpponent]     = useState<PlayerInfo | null>(null);
  const [roomStatus, setRoomStatus] = useState<RoomStatus | null>(null);
  const [matchId, setMatchId]       = useState<string | null>(null);
  const [joinWindowSecs, setJoinWindowSecs] = useState<number | null>(null);
  const [entryFee, setEntryFee]     = useState(0);
  const [prizeAmount, setPrizeAmount] = useState(0);
  const [cancelReason, setCancelReason] = useState<string | null>(null);

  const leftRef    = useRef(false);
  const pollIdRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const windowIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIdRef.current) {
      clearInterval(pollIdRef.current);
      pollIdRef.current = null;
    }
  }, []);

  const stopJoinWindow = useCallback(() => {
    if (windowIdRef.current) {
      clearInterval(windowIdRef.current);
      windowIdRef.current = null;
    }
  }, []);

  const startJoinWindow = useCallback((credentialsReadyAt: string | null) => {
    const start = credentialsReadyAt ? new Date(credentialsReadyAt).getTime() : Date.now();
    const update = () => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const remaining = Math.max(0, JOIN_WINDOW_SECONDS - elapsed);
      setJoinWindowSecs(remaining);
      if (remaining === 0) stopJoinWindow();
    };
    update();
    windowIdRef.current = setInterval(update, 500);
  }, [stopJoinWindow]);

  const leaveQueue = useCallback(async () => {
    if (leftRef.current) return;
    leftRef.current = true;
    stopPolling();
    try {
      await apiPost("/quickmatch/search/leave", { gameType: typeKey, modeId });
    } catch { /* best effort */ }
  }, [typeKey, modeId, stopPolling]);

  const dismissActiveMatch = useCallback(async (id: string) => {
    try {
      await apiPost("/quickmatch/match/dismiss", { matchId: id });
    } catch { /* best effort */ }
  }, []);

  const trackAction = useCallback(async (action: string) => {
    try {
      await apiPost("/quickmatch/match/action", { action });
    } catch { /* best effort */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Elapsed timer — only while searching
  useEffect(() => {
    if (phase !== "searching") return;
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Status message rotation — only while searching
  useEffect(() => {
    if (phase !== "searching") return;
    const id = setInterval(() => setStatusIdx(i => (i + 1) % STATUS_MESSAGES.length), 3500);
    return () => clearInterval(id);
  }, [phase]);

  // Join queue + poll
  useEffect(() => {
    const storedEntry = Number(sessionStorage.getItem("qm_entry") ?? 0);
    const storedPrize = Number(sessionStorage.getItem("qm_prize") ?? 0);
    setEntryFee(storedEntry);
    setPrizeAmount(storedPrize);

    apiPost("/quickmatch/search/join", {
      gameType: typeKey,
      modeId,
      entryFee: storedEntry,
      prizeAmount: storedPrize,
    }).catch((err: Error) => {
      // 402 = insufficient balance; 403 = banned; any other error
      const msg = err?.message ?? "Unable to join match";
      setCancelReason(msg);
      setPhase("cancelled");
    });

    const poll = async () => {
      try {
        const stats = await apiFetch<QueueStats>("/quickmatch/stats");
        setQueueCount(stats[typeKey]?.modes?.[modeId] ?? 0);
      } catch { /* ignore */ }

      try {
        const match = await apiFetch<{
          status: string;
          matchId?: string;
          roomId?: string;
          password?: string;
          openInFfUrl?: string | null;
          roomStatus?: RoomStatus;
          credentialsReadyAt?: string | null;
          entryFee?: number;
          prizeAmount?: number;
          me?: PlayerInfo;
          opponent?: PlayerInfo;
        }>("/quickmatch/match");

        if (match.entryFee) setEntryFee(match.entryFee);
        if (match.prizeAmount) setPrizeAmount(match.prizeAmount);

        if (match.status === "waiting_room") {
          if (match.me)       setMePlayer(match.me);
          if (match.opponent) setOpponent(match.opponent);
          if (match.roomStatus) setRoomStatus(match.roomStatus);
          if (match.matchId)  setMatchId(match.matchId);
          setPhase("preparing");
        } else if (match.status === "ready" && match.roomId && match.password) {
          stopPolling();
          if (match.me)       setMePlayer(match.me);
          if (match.opponent) setOpponent(match.opponent);
          if (match.matchId)  setMatchId(match.matchId);
          setRoomStatus("ready");
          setPhase("found");
          setMatchInfo({
            roomId: match.roomId,
            password: match.password,
            mapName: meta.mapName,
            format: meta.format,
            maxPlayers: meta.maxPlayers,
            openInFfUrl: match.openInFfUrl ?? null,
            credentialsReadyAt: match.credentialsReadyAt ?? null,
          });
          startJoinWindow(match.credentialsReadyAt ?? null);
        } else if (match.status === "none") {
          setPhase((prev) => {
            if (prev === "preparing" || prev === "found") {
              stopPolling();
              return "cancelled";
            }
            return prev;
          });
        }
      } catch { /* ignore */ }
    };
    poll();
    pollIdRef.current = setInterval(poll, 2500);

    return () => {
      stopPolling();
      stopJoinWindow();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leave queue on unmount if still searching
  useEffect(() => {
    return () => {
      if (phase === "searching") leaveQueue();
    };
  }, [phase, leaveQueue]);

  const handleCancel = async () => {
    // Block cancel once match is formed (preparing or found)
    if (phase === "preparing" || phase === "found") return;
    stopPolling();
    stopJoinWindow();
    if (matchId) await dismissActiveMatch(matchId);
    await leaveQueue();
    navigate("/quickmatch");
  };

  const handleJoinRoom = async () => {
    if (joining) return;
    setJoining(true);
    stopJoinWindow();
    await leaveQueue();
    setPhase("joined");
    setJoining(false);
  };

  const handleOpenInFF = async () => {
    if (!matchInfo?.openInFfUrl) return;
    await trackAction("open_in_ff");
    window.open(matchInfo.openInFfUrl, "_blank");
  };

  function copyText(text: string, which: "room" | "pass") {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 2500);
    });
    const action = which === "room" ? "copy_room_id" : "copy_password";
    trackAction(action);
  }

  const Icon            = meta.Icon;
  const glow            = `${accent}35`;
  const currentStepIdx  = stepIndex(roomStatus);
  const isMatchLocked   = phase === "preparing" || phase === "found";

  return (
    <div
      className="min-h-[100dvh] flex flex-col relative overflow-hidden"
      style={{ background: "hsl(var(--background))" }}
    >
      <style>{`
        @keyframes radar-ring {
          0%   { transform: scale(0.5); opacity: 0.65; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        @keyframes spin-slow     { to { transform: rotate(360deg); } }
        @keyframes spin-slow-rev { to { transform: rotate(-360deg); } }
        @keyframes live-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.4; transform: scale(0.85); }
        }
        @keyframes status-fade {
          0%   { opacity: 0; transform: translateY(6px); }
          15%  { opacity: 1; transform: translateY(0); }
          85%  { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-6px); }
        }
        @keyframes found-pop {
          0%  { transform: scale(0.82); opacity: 0; }
          60% { transform: scale(1.04); }
          100%{ transform: scale(1);   opacity: 1; }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes joined-in {
          0%  { transform: scale(0.7) rotate(-6deg); opacity: 0; }
          70% { transform: scale(1.08) rotate(2deg); }
          100%{ transform: scale(1) rotate(0deg);    opacity: 1; }
        }
        @keyframes step-ping {
          0%   { transform: scale(1); opacity: 1; }
          60%  { transform: scale(1.9); opacity: 0; }
          100% { transform: scale(1.9); opacity: 0; }
        }
        @keyframes preparing-in {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes vs-glow {
          0%, 100% { box-shadow: 0 0 24px ${accent}40; }
          50%      { box-shadow: 0 0 48px ${accent}70; }
        }
        @keyframes icon-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 50% 38%, ${accent}12 0%, transparent 65%)` }}
      />

      {/* Header */}
      <div
        className="shrink-0 px-4 pt-14 pb-5 relative z-10"
        style={{ background: "linear-gradient(180deg,#030303 0%,transparent 100%)" }}
      >
        <div className="flex items-center justify-between">
          {/* Show back arrow only when NOT in a locked match */}
          {(phase === "joined" || isMatchLocked) ? (
            <div className="w-9 h-9" />
          ) : (
            <button
              onClick={handleCancel}
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
          )}

          <div className="flex flex-col items-end">
            <span className="text-[9px] font-black tracking-[0.2em] uppercase text-zinc-600">{TYPE_LABEL[typeKey]}</span>
            <span className="text-[13px] font-extrabold text-white leading-tight">{meta.name}</span>
          </div>
        </div>
      </div>

      {/* ── SEARCHING ── */}
      {phase === "searching" && (
        <div
          className="flex-1 flex flex-col items-center"
          style={{ opacity: visible ? 1 : 0, transition: "opacity 0.4s ease" }}
        >
          {/* Radar */}
          <div className="relative flex items-center justify-center mt-4 mb-6" style={{ width: 200, height: 200 }}>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="absolute rounded-full border"
                style={{
                  inset: 0,
                  borderColor: `${accent}${i === 0 ? "55" : i === 1 ? "40" : "30"}`,
                  animation: `radar-ring 2.4s ease-out ${i * 0.8}s infinite`,
                }}
              />
            ))}
            <div className="absolute rounded-full"
              style={{ width: 130, height: 130, border: `1.5px dashed ${accent}35`, animation: "spin-slow 9s linear infinite" }} />
            <div className="absolute rounded-full"
              style={{ width: 100, height: 100, border: `1.5px dashed ${accent}22`, animation: "spin-slow-rev 6s linear infinite" }} />
            <div
              className="relative w-20 h-20 rounded-full flex items-center justify-center z-10"
              style={{
                background: `radial-gradient(circle, ${accent}28 0%, ${accent}0a 100%)`,
                border: `2px solid ${accent}55`,
                boxShadow: `0 0 36px ${glow}`,
              }}
            >
              <Icon className="w-9 h-9" style={{ color: accent }} strokeWidth={1.6} />
            </div>
          </div>

          {/* Status */}
          <div className="h-8 flex items-center justify-center mb-1 overflow-hidden">
            <p key={statusIdx} className="text-[15px] font-semibold text-white/70"
              style={{ animation: "status-fade 3.5s ease both" }}>
              {STATUS_MESSAGES[statusIdx]}
            </p>
          </div>
          <p className="text-[11px] text-zinc-600 mb-6">{meta.format} · {meta.mapName}</p>

          {/* Prize row */}
          {entryFee > 0 && (
            <div className="flex items-center gap-3 mb-5 px-4 py-2.5 rounded-2xl"
              style={{ background: "rgba(250,204,21,0.07)", border: "1px solid rgba(250,204,21,0.18)" }}>
              <div className="flex items-center gap-1">
                <CoinIcon width={14} />
                <span className="text-[12px] font-bold text-zinc-400">Entry</span>
                <span className="text-[13px] font-black text-white ml-1">{entryFee}</span>
              </div>
              <div className="w-px h-4" style={{ background: "rgba(255,255,255,0.1)" }} />
              <div className="flex items-center gap-1">
                <CoinIcon width={14} />
                <span className="text-[12px] font-bold text-zinc-400">Prize</span>
                <span className="text-[13px] font-black text-white ml-1">{prizeAmount}</span>
              </div>
            </div>
          )}

          {/* Stats row */}
          <div
            className="flex items-center divide-x divide-white/8 rounded-2xl overflow-hidden w-full max-w-xs mx-4 mb-8"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="flex-1 py-3 flex flex-col items-center gap-1">
              <Clock className="w-4 h-4 text-zinc-500" />
              <span className="font-mono text-[15px] font-extrabold text-white tabular-nums">{formatTime(elapsed)}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Time</span>
            </div>
            <div className="flex-1 py-3 flex flex-col items-center gap-1">
              <Users className="w-4 h-4" style={{ color: accent }} />
              <span className="text-[15px] font-extrabold tabular-nums" style={{ color: accent }}>
                {queueCount === null ? "—" : queueCount}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">In Queue</span>
            </div>
            <div className="flex-1 py-3 flex flex-col items-center gap-1">
              <span className="w-2 h-2 rounded-full"
                style={{ background: accent, animation: "live-pulse 1.4s ease-in-out infinite" }} />
              <span className="text-[13px] font-extrabold uppercase tracking-widest" style={{ color: accent }}>
                {typeKey.toUpperCase()}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Type</span>
            </div>
          </div>

          {/* Spinner */}
          <div className="w-6 h-6 rounded-full mb-8"
            style={{ border: `2px solid ${accent}30`, borderTopColor: accent, animation: "spin-slow 1s linear infinite" }} />

          {/* Cancel */}
          <button
            onClick={handleCancel}
            className="flex items-center gap-2 px-7 py-3.5 rounded-2xl active:scale-95 transition-transform"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.28)" }}
          >
            <X className="w-4 h-4 text-red-400" strokeWidth={2.5} />
            <span className="text-[13px] font-extrabold text-red-400">Cancel Search</span>
          </button>
        </div>
      )}

      {/* ── PREPARING (opponent found, room being set up) ── */}
      {phase === "preparing" && (
        <div
          className="flex-1 flex flex-col items-center px-5 pb-10"
          style={{ animation: "preparing-in 0.5s ease both" }}
        >
          {/* "Match Found" badge */}
          <div
            className="mt-3 mb-5 px-5 py-2 rounded-full flex items-center gap-2"
            style={{
              background: `${accent}20`,
              border: `1.5px solid ${accent}55`,
              animation: "vs-glow 2s ease-in-out infinite",
            }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: accent, animation: "live-pulse 1s ease-in-out infinite" }} />
            <span className="text-[12px] font-extrabold tracking-widest uppercase" style={{ color: accent }}>
              Opponent Found!
            </span>
          </div>

          {/* Player VS card */}
          <div
            className="w-full rounded-3xl overflow-hidden mb-5"
            style={{
              background: `linear-gradient(135deg, ${accent}0c 0%, rgba(255,255,255,0.02) 100%)`,
              border: `1px solid ${accent}28`,
            }}
          >
            <div className="flex items-center justify-between px-4 py-4 gap-3">
              {/* Me */}
              <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
                <Avatar src={mePlayer?.profilePicture} name={mePlayer?.inGameName ?? "You"} size={60} accent={accent} />
                <div className="text-center min-w-0 w-full">
                  <p className="text-[13px] font-extrabold text-white truncate px-1">{mePlayer?.inGameName ?? "You"}</p>
                  {mePlayer?.uid && <p className="text-[10px] font-mono text-zinc-500 truncate">UID {mePlayer.uid}</p>}
                </div>
              </div>

              {/* VS */}
              <div
                className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  background: `${accent}18`,
                  border: `1.5px solid ${accent}45`,
                  boxShadow: `0 0 18px ${accent}30`,
                }}
              >
                <span className="text-[11px] font-black tracking-widest" style={{ color: accent }}>VS</span>
              </div>

              {/* Opponent */}
              <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
                <Avatar src={opponent?.profilePicture} name={opponent?.inGameName ?? "Opponent"} size={60} accent={accent} />
                <div className="text-center min-w-0 w-full">
                  <p className="text-[13px] font-extrabold text-white truncate px-1">{opponent?.inGameName ?? "Opponent"}</p>
                  {opponent?.uid && <p className="text-[10px] font-mono text-zinc-500 truncate">UID {opponent.uid}</p>}
                </div>
              </div>
            </div>

            {/* Mode / map strip */}
            <div
              className="px-5 py-2 flex items-center gap-2 justify-center"
              style={{ background: `${accent}08`, borderTop: `1px solid ${accent}18` }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: accent }} strokeWidth={2} />
              <span className="text-[11px] font-bold text-zinc-400">{meta.name} · {meta.mapName}</span>
            </div>
          </div>

          {/* Room preparation timeline */}
          <div
            className="w-full rounded-3xl overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div
              className="px-5 py-3 flex items-center gap-2"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <span className="text-[11px] font-black tracking-widest uppercase text-zinc-500">Preparing Room</span>
            </div>

            <div className="px-5 py-4 flex flex-col gap-0">
              {ROOM_STEPS.map((step, i) => {
                const isActive = i === currentStepIdx;
                const isDone   = i < currentStepIdx;
                const StepIcon = step.Icon;

                return (
                  <div key={step.key} className="flex items-start gap-3.5">
                    <div className="flex flex-col items-center" style={{ width: 28, paddingTop: 2 }}>
                      <div className="relative flex items-center justify-center" style={{ width: 28, height: 28 }}>
                        {isActive && (
                          <div
                            className="absolute rounded-full"
                            style={{
                              inset: -2,
                              background: `${accent}30`,
                              animation: "step-ping 1.6s ease-out infinite",
                            }}
                          />
                        )}
                        <div
                          className="relative rounded-full flex items-center justify-center"
                          style={{
                            width: 28,
                            height: 28,
                            background: isDone ? `${accent}30` : isActive ? `${accent}22` : "rgba(255,255,255,0.04)",
                            border: `1.5px solid ${isDone ? accent : isActive ? `${accent}aa` : "rgba(255,255,255,0.1)"}`,
                            transition: "all 0.4s ease",
                          }}
                        >
                          {isDone ? (
                            <Check className="w-3.5 h-3.5" style={{ color: accent }} strokeWidth={2.5} />
                          ) : (
                            <StepIcon
                              className="w-3.5 h-3.5"
                              style={{
                                color: isActive ? accent : "rgba(255,255,255,0.2)",
                                animation: isActive && step.key === "creating_room" ? "icon-spin 1.4s linear infinite" : undefined,
                              }}
                              strokeWidth={2}
                            />
                          )}
                        </div>
                      </div>

                      {i < ROOM_STEPS.length - 1 && (
                        <div
                          style={{
                            width: 1.5,
                            height: 22,
                            marginTop: 2,
                            background: isDone ? accent : "rgba(255,255,255,0.08)",
                            transition: "background 0.4s ease",
                            borderRadius: 2,
                          }}
                        />
                      )}
                    </div>

                    <div className="flex-1 pb-4" style={{ paddingTop: 4 }}>
                      <p
                        className="text-[13px] font-bold leading-tight"
                        style={{
                          color: isDone ? accent : isActive ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.22)",
                          transition: "color 0.4s ease",
                        }}
                      >
                        {step.label}
                        {isActive && (
                          <span className="ml-1.5 text-[11px] font-semibold" style={{ color: `${accent}bb` }}>…</span>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lock notice (no cancel once matched) */}
          <div
            className="mt-5 px-4 py-2.5 rounded-2xl flex items-center gap-2"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <Shield className="w-3.5 h-3.5 text-zinc-600" strokeWidth={2} />
            <span className="text-[11px] font-semibold text-zinc-600">Match locked — cannot cancel now</span>
          </div>
        </div>
      )}

      {/* ── MATCH FOUND (credentials ready) ── */}
      {phase === "found" && matchInfo && (
        <div
          className="flex-1 flex flex-col items-center px-5 pb-10"
          style={{ animation: "found-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) both" }}
        >
          {/* Badge + countdown */}
          <div className="mt-4 mb-4 flex flex-col items-center gap-2">
            <div
              className="px-5 py-2 rounded-full flex items-center gap-2"
              style={{ background: `${accent}20`, border: `1.5px solid ${accent}55`, boxShadow: `0 0 24px ${accent}35` }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: accent, animation: "live-pulse 1s ease-in-out infinite" }} />
              <span className="text-[12px] font-extrabold tracking-widest uppercase" style={{ color: accent }}>Room Ready!</span>
            </div>

            {/* Join window countdown */}
            {joinWindowSecs !== null && joinWindowSecs > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <Clock className="w-3 h-3 text-zinc-500" />
                <span className="text-[11px] font-bold text-zinc-500 tabular-nums">
                  Join window: {joinWindowSecs}s
                </span>
              </div>
            )}
            {joinWindowSecs === 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <span className="text-[11px] font-bold text-red-400">Join window expired</span>
              </div>
            )}
          </div>

          {/* Compact player VS row */}
          {(mePlayer || opponent) && (
            <div
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl mb-4 gap-2"
              style={{
                background: `${accent}0a`,
                border: `1px solid ${accent}22`,
                animation: "slide-up 0.4s ease 0.05s both",
              }}
            >
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <Avatar src={mePlayer?.profilePicture} name={mePlayer?.inGameName ?? "You"} size={36} accent={accent} />
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-white truncate">{mePlayer?.inGameName ?? "You"}</p>
                  {mePlayer?.uid && <p className="text-[10px] font-mono text-zinc-600 truncate">UID {mePlayer.uid}</p>}
                </div>
              </div>
              <span className="text-[10px] font-black text-zinc-600 shrink-0 px-1">VS</span>
              <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-end">
                <div className="text-right min-w-0">
                  <p className="text-[12px] font-bold text-white truncate">{opponent?.inGameName ?? "Opponent"}</p>
                  {opponent?.uid && <p className="text-[10px] font-mono text-zinc-600 truncate">UID {opponent.uid}</p>}
                </div>
                <Avatar src={opponent?.profilePicture} name={opponent?.inGameName ?? "Opponent"} size={36} accent={accent} />
              </div>
            </div>
          )}

          {/* Room details card */}
          <div
            className="w-full rounded-3xl overflow-hidden mb-4"
            style={{
              background: `linear-gradient(135deg, ${accent}0c 0%, rgba(255,255,255,0.02) 100%)`,
              border: `1px solid ${accent}28`,
              boxShadow: `0 4px 32px ${accent}12`,
              animation: "slide-up 0.4s ease 0.15s both",
            }}
          >
            <div
              className="px-5 py-3 flex items-center gap-2"
              style={{ background: `${accent}12`, borderBottom: `1px solid ${accent}20` }}
            >
              <Shield className="w-3.5 h-3.5" style={{ color: accent }} strokeWidth={2} />
              <span className="text-[11px] font-black tracking-widest uppercase" style={{ color: accent }}>Room Details</span>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-0.5">Room ID</p>
                  <p className="text-[20px] font-black text-white font-mono tracking-wider">{matchInfo.roomId}</p>
                </div>
                <button
                  onClick={() => copyText(matchInfo.roomId, "room")}
                  className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-transform"
                  style={{ background: `${accent}18`, border: `1px solid ${accent}35` }}
                >
                  {copied === "room" ? <Check className="w-4 h-4" style={{ color: accent }} /> : <Copy className="w-4 h-4" style={{ color: accent }} />}
                </button>
              </div>

              <div className="h-px" style={{ background: `${accent}15` }} />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-0.5">Password</p>
                  <p className="text-[20px] font-black text-white font-mono tracking-[0.35em]">{matchInfo.password}</p>
                </div>
                <button
                  onClick={() => copyText(matchInfo.password, "pass")}
                  className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-transform"
                  style={{ background: `${accent}18`, border: `1px solid ${accent}35` }}
                >
                  {copied === "pass" ? <Check className="w-4 h-4" style={{ color: accent }} /> : <Copy className="w-4 h-4" style={{ color: accent }} />}
                </button>
              </div>

              <div className="h-px" style={{ background: `${accent}15` }} />

              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-0.5">Map</p>
                  <p className="text-[13px] font-bold text-white">{matchInfo.mapName}</p>
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-0.5">Players</p>
                  <p className="text-[13px] font-bold text-white">{matchInfo.maxPlayers} Slots</p>
                </div>
              </div>
            </div>
          </div>

          {/* Open in FF button (if deep link available) */}
          {matchInfo.openInFfUrl && (
            <button
              onClick={handleOpenInFF}
              className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 active:scale-[0.97] transition-transform mb-3"
              style={{
                background: `linear-gradient(135deg, ${accent}, ${accent}bb)`,
                boxShadow: `0 8px 32px ${accent}45`,
                animation: "slide-up 0.4s ease 0.2s both",
              }}
            >
              <ExternalLink className="w-5 h-5 text-white" strokeWidth={2} />
              <span className="text-[15px] font-extrabold text-white tracking-wide">Open in Free Fire</span>
            </button>
          )}

          {/* Join Room CTA */}
          <button
            onClick={handleJoinRoom}
            disabled={joining}
            className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 active:scale-[0.97] transition-transform mb-3 disabled:opacity-70"
            style={{
              background: matchInfo.openInFfUrl
                ? "rgba(255,255,255,0.06)"
                : `linear-gradient(135deg, ${accent}, ${accent}bb)`,
              border: matchInfo.openInFfUrl ? "1px solid rgba(255,255,255,0.12)" : "none",
              boxShadow: matchInfo.openInFfUrl ? "none" : `0 8px 32px ${accent}45`,
              animation: "slide-up 0.4s ease 0.25s both",
            }}
          >
            <Wind className="w-5 h-5 text-white" strokeWidth={2} />
            <span className="text-[15px] font-extrabold text-white tracking-wide">
              {joining ? "Joining…" : "I'm In the Room"}
            </span>
          </button>
        </div>
      )}

      {/* ── MATCH CANCELLED (opponent left) ── */}
      {phase === "cancelled" && (
        <div
          className="flex-1 flex flex-col items-center justify-center px-5 pb-10"
          style={{ animation: "found-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both" }}
        >
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
            style={{ background: "rgba(239,68,68,0.12)", border: "1.5px solid rgba(239,68,68,0.35)" }}
          >
            <X className="w-9 h-9 text-red-400" strokeWidth={1.6} />
          </div>
          <h2 className="font-heading text-2xl font-black text-white tracking-tight mb-2">
            {cancelReason ? "Cannot Join Match" : "Match Cancelled"}
          </h2>
          <p className="text-[13px] text-zinc-500 text-center mb-8">
            {cancelReason ?? "Your opponent left before the room was ready."}
          </p>
          <button
            onClick={() => navigate(`/quickmatch/${typeKey}/${modeId}`)}
            className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 active:scale-[0.97] transition-transform mb-3"
            style={{
              background: `linear-gradient(135deg, ${accent}, ${accent}bb)`,
              boxShadow: `0 8px 32px ${accent}40`,
            }}
          >
            <span className="text-[15px] font-extrabold text-white tracking-wide">Search Again</span>
          </button>
          <button
            onClick={() => navigate("/quickmatch")}
            className="w-full py-3 rounded-2xl flex items-center justify-center active:scale-95 transition-transform"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <span className="text-[13px] font-bold text-zinc-500">Back to Modes</span>
          </button>
        </div>
      )}

      {/* ── IN ROOM (JOINED) ── */}
      {phase === "joined" && matchInfo && (
        <div
          className="flex-1 flex flex-col items-center px-5 pb-10"
          style={{ animation: "found-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) both" }}
        >
          <div
            className="mt-6 mb-4 flex items-center justify-center"
            style={{ animation: "joined-in 0.5s cubic-bezier(0.34,1.56,0.64,1) both" }}
          >
            <CheckCircle2 className="w-20 h-20" style={{ color: accent }} strokeWidth={1.3} />
          </div>

          <h2
            className="font-heading text-3xl font-black text-white tracking-tight mb-1"
            style={{ textShadow: `0 0 32px ${glow}` }}
          >
            You're In!
          </h2>
          <p className="text-[13px] text-zinc-500 mb-6 text-center">
            Good luck! Results are settled automatically after the game.
          </p>

          {/* Prize reminder */}
          {prizeAmount > 0 && (
            <div className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-2xl"
              style={{ background: "rgba(250,204,21,0.07)", border: "1px solid rgba(250,204,21,0.18)" }}>
              <CoinIcon width={16} />
              <span className="text-[12px] font-bold text-yellow-300">Win</span>
              <span className="text-[14px] font-black text-white tabular-nums ml-1">{prizeAmount} coins</span>
            </div>
          )}

          {/* Opponent reminder */}
          {opponent && (
            <div
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl mb-4"
              style={{ background: `${accent}0a`, border: `1px solid ${accent}20` }}
            >
              <Avatar src={opponent.profilePicture} name={opponent.inGameName} size={36} accent={accent} />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-0.5">Your Opponent</p>
                <p className="text-[13px] font-bold text-white truncate">{opponent.inGameName}</p>
                {opponent.uid && <p className="text-[10px] font-mono text-zinc-600">UID {opponent.uid}</p>}
              </div>
            </div>
          )}

          <div
            className="w-full rounded-3xl overflow-hidden mb-5"
            style={{
              background: `linear-gradient(135deg, ${accent}0e 0%, rgba(255,255,255,0.02) 100%)`,
              border: `1.5px solid ${accent}35`,
              boxShadow: `0 4px 32px ${accent}18`,
            }}
          >
            <div
              className="px-5 py-3 flex items-center gap-2"
              style={{ background: `${accent}14`, borderBottom: `1px solid ${accent}22` }}
            >
              <Shield className="w-3.5 h-3.5" style={{ color: accent }} strokeWidth={2} />
              <span className="text-[11px] font-black tracking-widest uppercase" style={{ color: accent }}>
                {meta.name} · {matchInfo.mapName}
              </span>
            </div>

            <div className="px-5 py-5 flex flex-col gap-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Room ID</p>
                <div className="flex items-center justify-between">
                  <p className="text-[28px] font-black text-white font-mono tracking-widest leading-none">{matchInfo.roomId}</p>
                  <button
                    onClick={() => copyText(matchInfo.roomId, "room")}
                    className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-transform"
                    style={{ background: `${accent}20`, border: `1px solid ${accent}40` }}
                  >
                    {copied === "room" ? <Check className="w-4 h-4" style={{ color: accent }} /> : <Copy className="w-4 h-4" style={{ color: accent }} />}
                  </button>
                </div>
              </div>

              <div className="h-px" style={{ background: `${accent}18` }} />

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Password</p>
                <div className="flex items-center justify-between">
                  <p className="text-[28px] font-black text-white font-mono tracking-[0.45em] leading-none">{matchInfo.password}</p>
                  <button
                    onClick={() => copyText(matchInfo.password, "pass")}
                    className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-transform"
                    style={{ background: `${accent}20`, border: `1px solid ${accent}40` }}
                  >
                    {copied === "pass" ? <Check className="w-4 h-4" style={{ color: accent }} /> : <Copy className="w-4 h-4" style={{ color: accent }} />}
                  </button>
                </div>
              </div>

              <div className="h-px" style={{ background: `${accent}18` }} />

              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-0.5">Format</p>
                  <p className="text-[14px] font-extrabold text-white">{matchInfo.format}</p>
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-0.5">Players</p>
                  <p className="text-[14px] font-extrabold text-white">{matchInfo.maxPlayers} Slots</p>
                </div>
              </div>
            </div>
          </div>

          {/* Open in FF (if available) */}
          {matchInfo.openInFfUrl && (
            <button
              onClick={handleOpenInFF}
              className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 active:scale-[0.97] transition-transform mb-3"
              style={{
                background: `linear-gradient(135deg, ${accent}, ${accent}bb)`,
                boxShadow: `0 8px 32px ${accent}40`,
              }}
            >
              <ExternalLink className="w-5 h-5 text-white" strokeWidth={2} />
              <span className="text-[15px] font-extrabold text-white tracking-wide">Open in Free Fire</span>
            </button>
          )}

          <button
            onClick={() => navigate("/")}
            className="w-full py-3 rounded-2xl flex items-center justify-center active:scale-95 transition-transform"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <span className="text-[13px] font-bold text-zinc-500">Back to Home</span>
          </button>
        </div>
      )}
    </div>
  );
}
