import { useParams, useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { X, User } from "lucide-react";

const MODE_NAMES: Record<string, string> = {
  duel: "1v1 Duel",
  healing: "Healing Battle",
  "clash-squad": "Clash Squad",
  knife: "Knife Fight",
  "solo-drop": "Solo Drop",
  "duo-rush": "Duo Rush",
  "squad-wipe": "Squad Wipe",
  "zone-control": "Zone Control",
};

const TYPE_ACCENT: Record<string, string> = {
  cs: "#ef4444",
  br: "#3b82f6",
};

const TYPE_LABEL: Record<string, string> = {
  cs: "Classic Survival",
  br: "Battle Royale",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatTime(secs: number) {
  return `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
}

const STATUS_MESSAGES = [
  "Searching for opponent…",
  "Scanning active players…",
  "Matching skill levels…",
  "Almost there…",
];

async function callQueueApi(action: "join" | "leave", gameType: string, modeId: string) {
  const token = localStorage.getItem("clash_ren_token");
  if (!token) return;
  try {
    await fetch(`/api/quickmatch/search/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ gameType, modeId }),
    });
  } catch {}
}

export default function QuickMatchQueue() {
  const params = useParams<{ type: string; mode: string }>();
  const [, navigate] = useLocation();

  const typeKey = params.type ?? "cs";
  const modeKey = params.mode ?? "duel";
  const accent = TYPE_ACCENT[typeKey] ?? "#ef4444";
  const typeLabel = TYPE_LABEL[typeKey] ?? "Classic Survival";
  const modeName = MODE_NAMES[modeKey] ?? modeKey.replace(/-/g, " ");

  const [elapsed, setElapsed] = useState(0);
  const [statusIdx, setStatusIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    callQueueApi("join", typeKey, modeKey);
    return () => {
      callQueueApi("leave", typeKey, modeKey);
    };
  }, [typeKey, modeKey]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsed(s => s + 1);
    }, 1000);
    const msgTimer = setInterval(() => {
      setStatusIdx(i => (i + 1) % STATUS_MESSAGES.length);
    }, 3500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearInterval(msgTimer);
    };
  }, []);

  function handleCancel() {
    navigate(`/quickmatch/${typeKey}`);
  }

  const glow = accent.replace("#", "rgba(") + ",0.4)";

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-between relative overflow-hidden"
      style={{ background: "hsl(var(--background))" }}
    >
      <style>{`
        @keyframes radar-1 {
          0%   { transform: scale(0.5); opacity: 0.6; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        @keyframes radar-2 {
          0%   { transform: scale(0.5); opacity: 0.5; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        @keyframes radar-3 {
          0%   { transform: scale(0.5); opacity: 0.4; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        @keyframes spin-slow {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes spin-slow-rev {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(-360deg); }
        }
        @keyframes pulse-avatar {
          0%, 100% { box-shadow: 0 0 0 0 ${accent}55; }
          50%       { box-shadow: 0 0 0 14px transparent; }
        }
        @keyframes status-fade {
          0%   { opacity: 0; transform: translateY(6px); }
          15%  { opacity: 1; transform: translateY(0); }
          85%  { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-6px); }
        }
        @keyframes live-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>

      {/* Background radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 50% 40%, ${accent}12 0%, transparent 65%)` }}
      />

      {/* Top header */}
      <div className="w-full px-4 pt-14 pb-0 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] font-black tracking-[0.2em] uppercase text-zinc-500">{typeLabel}</span>
          <span className="text-[16px] font-extrabold text-white leading-tight">{modeName}</span>
        </div>

        {/* LIVE + timer */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full"
          style={{
            background: `${accent}15`,
            border: `1px solid ${accent}30`,
          }}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: accent, animation: "live-pulse 1.2s ease-in-out infinite" }}
          />
          <span className="font-mono text-[13px] font-extrabold tabular-nums" style={{ color: accent }}>
            {formatTime(elapsed)}
          </span>
        </div>
      </div>

      {/* Radar animation center */}
      <div className="flex-1 flex flex-col items-center justify-center relative" style={{ minHeight: 320 }}>

        {/* Radar rings */}
        <div className="absolute" style={{ width: 200, height: 200 }}>
          <div className="absolute inset-0 rounded-full border"
            style={{
              borderColor: `${accent}50`,
              animation: "radar-1 2.4s ease-out infinite",
              animationDelay: "0s",
            }} />
          <div className="absolute inset-0 rounded-full border"
            style={{
              borderColor: `${accent}40`,
              animation: "radar-2 2.4s ease-out infinite",
              animationDelay: "0.8s",
            }} />
          <div className="absolute inset-0 rounded-full border"
            style={{
              borderColor: `${accent}30`,
              animation: "radar-3 2.4s ease-out infinite",
              animationDelay: "1.6s",
            }} />
        </div>

        {/* Spinning ring */}
        <div
          className="absolute rounded-full"
          style={{
            width: 120, height: 120,
            border: `1.5px dashed ${accent}35`,
            animation: "spin-slow 8s linear infinite",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 92, height: 92,
            border: `1.5px dashed ${accent}25`,
            animation: "spin-slow-rev 5s linear infinite",
          }}
        />

        {/* Avatar circle */}
        <div
          className="relative w-20 h-20 rounded-full flex items-center justify-center z-10"
          style={{
            background: `linear-gradient(135deg, ${accent}30, ${accent}10)`,
            border: `2px solid ${accent}60`,
            animation: "pulse-avatar 2s ease-in-out infinite",
            boxShadow: `0 0 32px ${accent}35`,
          }}
        >
          <User className="w-9 h-9" style={{ color: accent }} strokeWidth={1.5} />
        </div>

        {/* VS placeholder dots */}
        <div className="flex items-center gap-2 mt-8">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full"
              style={{
                background: accent,
                opacity: 0.3 + i * 0.25,
                animation: `live-pulse 1.2s ease-in-out infinite`,
                animationDelay: `${i * 0.3}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Bottom section */}
      <div className="w-full px-4 pb-16 flex flex-col items-center gap-5">

        {/* Status text */}
        <div className="text-center h-10 flex items-center justify-center overflow-hidden">
          <p
            key={statusIdx}
            className="text-[15px] font-semibold text-white/70"
            style={{ animation: "status-fade 3.5s ease both" }}
          >
            {STATUS_MESSAGES[statusIdx]}
          </p>
        </div>

        {/* Stats row */}
        <div
          className="flex items-center divide-x divide-white/8 rounded-2xl overflow-hidden w-full max-w-xs"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="flex-1 py-3 text-center">
            <p className="text-[10px] text-zinc-600 mb-0.5 uppercase tracking-widest font-bold">Mode</p>
            <p className="text-[12px] font-extrabold text-white truncate px-2">{modeName}</p>
          </div>
          <div className="flex-1 py-3 text-center">
            <p className="text-[10px] text-zinc-600 mb-0.5 uppercase tracking-widest font-bold">Type</p>
            <p className="text-[12px] font-extrabold" style={{ color: accent }}>{typeKey.toUpperCase()}</p>
          </div>
          <div className="flex-1 py-3 text-center">
            <p className="text-[10px] text-zinc-600 mb-0.5 uppercase tracking-widest font-bold">Wait</p>
            <p className="font-mono text-[12px] font-extrabold text-white tabular-nums">{formatTime(elapsed)}</p>
          </div>
        </div>

        {/* Cancel button */}
        <button
          onClick={handleCancel}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl active:scale-95 transition-transform"
          style={{
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.3)",
            color: "#ef4444",
          }}
        >
          <X className="w-4 h-4" strokeWidth={2.5} />
          <span className="text-[13px] font-extrabold">Cancel Search</span>
        </button>
      </div>
    </div>
  );
}
