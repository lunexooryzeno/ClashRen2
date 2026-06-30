import { useParams, useLocation } from "wouter";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  ArrowLeft, Users, Clock, Copy, Check, Shield, Crosshair,
  Heart, Scissors, Target, Wind, Map as MapIcon, X, Swords, CheckCircle2,
} from "lucide-react";
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
  "clash-squad":  { name: "Clash Squad",    format: "4v4",  accent: "#f97316", Icon: Shield,    mapName: "Bermuda Clash Zone", maxPlayers: 8  },
  knife:          { name: "Knife Fight",    format: "1v1",  accent: "#a78bfa", Icon: Scissors,  mapName: "Kalahari Pit",       maxPlayers: 2  },
  "solo-drop":    { name: "Solo Drop",      format: "Solo", accent: "#3b82f6", Icon: Target,    mapName: "Bermuda Classic",    maxPlayers: 12 },
  "duo-rush":     { name: "Duo Rush",       format: "2v2",  accent: "#06b6d4", Icon: Users,     mapName: "Purgatory Rush",     maxPlayers: 4  },
  "squad-wipe":   { name: "Squad Wipe",     format: "4v4",  accent: "#8b5cf6", Icon: Swords,    mapName: "Kalahari Showdown",  maxPlayers: 8  },
  "zone-control": { name: "Zone Control",   format: "Solo", accent: "#22c55e", Icon: MapIcon,   mapName: "Alpine Zone",        maxPlayers: 10 },
};

const TYPE_LABEL: Record<GameType, string> = {
  cs: "Classic Survival",
  br: "Battle Royale",
};

function generateRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "FF-";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function generatePassword(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function pad(n: number) { return String(n).padStart(2, "0"); }
function formatTime(s: number) { return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; }

interface MatchInfo {
  roomId: string;
  password: string;
  mapName: string;
  format: string;
  maxPlayers: number;
}

interface QueueStats {
  cs: { total: number; modes: Record<string, number> };
  br: { total: number; modes: Record<string, number> };
}

type Phase = "searching" | "found" | "joined";

const STATUS_MESSAGES = [
  "Searching for opponent…",
  "Scanning active players…",
  "Matching skill levels…",
  "Almost there…",
];

export default function QuickMatchQueue() {
  const params = useParams<{ type: string; mode: string }>();
  const [, navigate] = useLocation();

  const typeKey = (params.type ?? "cs") as GameType;
  const modeId = params.mode ?? "duel";
  const meta = MODE_META[modeId] ?? MODE_META["duel"];
  const accent = meta.accent;

  const [phase, setPhase] = useState<Phase>("searching");
  const [elapsed, setElapsed] = useState(0);
  const [queueCount, setQueueCount] = useState<number | null>(null);
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null);
  const [copied, setCopied] = useState<"room" | "pass" | null>(null);
  const [visible, setVisible] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);
  const [joining, setJoining] = useState(false);

  const leftRef = useRef(false);
  const pollIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIdRef.current) {
      clearInterval(pollIdRef.current);
      pollIdRef.current = null;
    }
  }, []);

  const leaveQueue = useCallback(async () => {
    if (leftRef.current) return;
    leftRef.current = true;
    stopPolling();
    try { await apiPost("/quickmatch/search/leave", { gameType: typeKey, modeId }); } catch { /* best effort */ }
  }, [typeKey, modeId, stopPolling]);

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

  // Join queue + poll + simulate match
  useEffect(() => {
    apiPost("/quickmatch/search/join", { gameType: typeKey, modeId }).catch(() => {});

    const poll = async () => {
      try {
        const stats = await apiFetch<QueueStats>("/quickmatch/stats");
        setQueueCount(stats[typeKey]?.modes?.[modeId] ?? 0);
      } catch { /* ignore poll errors */ }
    };
    poll();
    pollIdRef.current = setInterval(poll, 2000);

    const delay = 8000 + Math.random() * 9000;
    const matchTimer = setTimeout(() => {
      stopPolling();
      setPhase("found");
      setMatchInfo({
        roomId: generateRoomId(),
        password: generatePassword(),
        mapName: meta.mapName,
        format: meta.format,
        maxPlayers: meta.maxPlayers,
      });
    }, delay);

    return () => {
      stopPolling();
      clearTimeout(matchTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leave queue on unmount if still searching (e.g. browser back)
  useEffect(() => {
    return () => {
      if (phase === "searching") leaveQueue();
    };
  }, [phase, leaveQueue]);

  const handleCancel = async () => {
    stopPolling();
    await leaveQueue();
    navigate(`/quickmatch/${typeKey}`);
  };

  // "Join Room" — claim the slot, exit the queue, enter the room screen
  const handleJoinRoom = async () => {
    if (joining) return;
    setJoining(true);
    await leaveQueue(); // exit queue — slot is claimed
    setPhase("joined");
    setJoining(false);
  };

  function copyText(text: string, which: "room" | "pass") {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 2500);
    });
  }

  const Icon = meta.Icon;
  const glow = `${accent}35`;

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
          {phase === "joined" ? (
            <div className="w-9 h-9" /> /* spacer — no back button when in room */
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

      {/* ── MATCH FOUND ── */}
      {phase === "found" && matchInfo && (
        <div
          className="flex-1 flex flex-col items-center px-5 pb-10"
          style={{ animation: "found-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) both" }}
        >
          {/* Badge */}
          <div
            className="mt-4 mb-5 px-5 py-2 rounded-full flex items-center gap-2"
            style={{ background: `${accent}20`, border: `1.5px solid ${accent}55`, boxShadow: `0 0 24px ${accent}35` }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: accent, animation: "live-pulse 1s ease-in-out infinite" }} />
            <span className="text-[12px] font-extrabold tracking-widest uppercase" style={{ color: accent }}>Match Found!</span>
          </div>

          {/* Icon */}
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center mb-4"
            style={{ background: `${accent}18`, border: `2px solid ${accent}45`, boxShadow: `0 0 40px ${glow}` }}
          >
            <Icon className="w-9 h-9" style={{ color: accent }} strokeWidth={1.6} />
          </div>

          <h2 className="font-heading text-2xl font-black text-white tracking-tight mb-0.5">{meta.name}</h2>
          <p className="text-[12px] text-zinc-500 mb-5">{matchInfo.mapName} · {matchInfo.format}</p>

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
              {/* Room ID */}
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

              {/* Password */}
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

              {/* Map + slots */}
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

          {/* Join Room CTA — claims slot and enters room screen */}
          <button
            onClick={handleJoinRoom}
            disabled={joining}
            className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 active:scale-[0.97] transition-transform mb-3 disabled:opacity-70"
            style={{
              background: `linear-gradient(135deg, ${accent}, ${accent}bb)`,
              boxShadow: `0 8px 32px ${accent}45`,
              animation: "slide-up 0.4s ease 0.25s both",
            }}
          >
            <Wind className="w-5 h-5 text-white" strokeWidth={2} />
            <span className="text-[15px] font-extrabold text-white tracking-wide">
              {joining ? "Joining…" : "Join Room"}
            </span>
          </button>

          {/* Secondary: back to modes */}
          <button
            onClick={async () => {
              stopPolling();
              await leaveQueue();
              navigate(`/quickmatch/${typeKey}`);
            }}
            className="w-full py-3 rounded-2xl flex items-center justify-center active:scale-95 transition-transform"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              animation: "slide-up 0.4s ease 0.32s both",
            }}
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
          {/* Success icon */}
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
            Open Free Fire and enter the room credentials below
          </p>

          {/* Credentials — large, easy to read */}
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
              {/* Room ID — large */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Room ID</p>
                <div className="flex items-center justify-between">
                  <p className="text-[28px] font-black text-white font-mono tracking-widest leading-none">{matchInfo.roomId}</p>
                  <button
                    onClick={() => copyText(matchInfo.roomId, "room")}
                    className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-transform"
                    style={{ background: `${accent}20`, border: `1px solid ${accent}40` }}
                  >
                    {copied === "room"
                      ? <Check className="w-4 h-4" style={{ color: accent }} />
                      : <Copy className="w-4 h-4" style={{ color: accent }} />}
                  </button>
                </div>
              </div>

              <div className="h-px" style={{ background: `${accent}18` }} />

              {/* Password — large */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Password</p>
                <div className="flex items-center justify-between">
                  <p className="text-[28px] font-black text-white font-mono tracking-[0.45em] leading-none">{matchInfo.password}</p>
                  <button
                    onClick={() => copyText(matchInfo.password, "pass")}
                    className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-transform"
                    style={{ background: `${accent}20`, border: `1px solid ${accent}40` }}
                  >
                    {copied === "pass"
                      ? <Check className="w-4 h-4" style={{ color: accent }} />
                      : <Copy className="w-4 h-4" style={{ color: accent }} />}
                  </button>
                </div>
              </div>

              <div className="h-px" style={{ background: `${accent}18` }} />

              {/* Format + slots row */}
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

          {/* Done — go home */}
          <button
            onClick={() => navigate("/matches")}
            className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 active:scale-[0.97] transition-transform mb-3"
            style={{
              background: `linear-gradient(135deg, ${accent}, ${accent}bb)`,
              boxShadow: `0 8px 32px ${accent}40`,
            }}
          >
            <span className="text-[15px] font-extrabold text-white tracking-wide">Done</span>
          </button>

          {/* Find another match */}
          <button
            onClick={() => navigate(`/quickmatch/${typeKey}`)}
            className="w-full py-3 rounded-2xl flex items-center justify-center active:scale-95 transition-transform"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <span className="text-[13px] font-bold text-zinc-500">Find Another Match</span>
          </button>
        </div>
      )}
    </div>
  );
}
