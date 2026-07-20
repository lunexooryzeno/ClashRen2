import { useParams, useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Trophy, XCircle, RotateCcw, ShieldOff, Users } from "lucide-react";
import { CoinIcon } from "@/components/CoinIcon";
import { apiFetch } from "@/lib/api";

interface MatchResult {
  matchId: string;
  resultType: "win" | "loss" | "refund" | "no_show" | "suspended";
  coinsEarned: number;
  entryFee: number;
  prizeAmount: number;
  rewardGranted: boolean;
  opponentName: string | null;
  opponentProfilePicture: string | null;
  settledAt: string | null;
}

type DisplayConfig = {
  label: string;
  sublabel: string;
  accent: string;
  Icon: React.ElementType;
  coinLabel: string;
  coinDisplay: string;
  coinColor: string;
  glowColor: string;
  bgGradient: string;
};

function getDisplayConfig(result: MatchResult): DisplayConfig {
  const { resultType, coinsEarned, entryFee } = result;

  switch (resultType) {
    case "win":
      return {
        label:       "Victory!",
        sublabel:    "You dominated the match",
        accent:      "#22c55e",
        Icon:        Trophy,
        coinLabel:   "Coins Earned",
        coinDisplay: `+${coinsEarned}`,
        coinColor:   "#4ade80",
        glowColor:   "#22c55e",
        bgGradient:  "radial-gradient(ellipse 80% 50% at 50% 0%, #22c55e18 0%, transparent 60%)",
      };

    case "loss":
      return {
        label:       "Defeated",
        sublabel:    "Good game — better luck next time",
        accent:      "#ef4444",
        Icon:        XCircle,
        coinLabel:   "Coins Lost",
        coinDisplay: entryFee > 0 ? `-${entryFee}` : "—",
        coinColor:   "#f87171",
        glowColor:   "#ef4444",
        bgGradient:  "radial-gradient(ellipse 80% 50% at 50% 0%, #ef444418 0%, transparent 60%)",
      };

    case "refund":
      return {
        label:       "Match Cancelled",
        sublabel:    coinsEarned > 0
          ? `Entry fee of ${coinsEarned} coins refunded`
          : "Match cancelled — entry fee refunded",
        accent:      "#f97316",
        Icon:        RotateCcw,
        coinLabel:   "Refunded",
        coinDisplay: coinsEarned > 0 ? `+${coinsEarned}` : "—",
        coinColor:   "#fb923c",
        glowColor:   "#f97316",
        bgGradient:  "radial-gradient(ellipse 80% 50% at 50% 0%, #f9731618 0%, transparent 60%)",
      };

    case "no_show":
      return {
        label:       "No-Show",
        sublabel:    entryFee > 0
          ? "You didn't join the room in time — entry fee forfeited"
          : "You didn't join the room in time",
        accent:      "#a78bfa",
        Icon:        RotateCcw,
        coinLabel:   "Forfeited",
        coinDisplay: entryFee > 0 ? `-${entryFee}` : "—",
        coinColor:   "#c4b5fd",
        glowColor:   "#a78bfa",
        bgGradient:  "radial-gradient(ellipse 80% 50% at 50% 0%, #a78bfa18 0%, transparent 60%)",
      };

    case "suspended":
      return {
        label:       "Suspended",
        sublabel:    "Credential sharing detected — 12h QuickMatch ban applied",
        accent:      "#f43f5e",
        Icon:        ShieldOff,
        coinLabel:   "Result",
        coinDisplay: "—",
        coinColor:   "#fb7185",
        glowColor:   "#f43f5e",
        bgGradient:  "radial-gradient(ellipse 80% 50% at 50% 0%, #f43f5e18 0%, transparent 60%)",
      };

    default:
      return {
        label:       "Match Complete",
        sublabel:    "Result recorded",
        accent:      "#71717a",
        Icon:        XCircle,
        coinLabel:   "Result",
        coinDisplay: "—",
        coinColor:   "#a1a1aa",
        glowColor:   "#71717a",
        bgGradient:  "radial-gradient(ellipse 80% 50% at 50% 0%, #71717a18 0%, transparent 60%)",
      };
  }
}

function Avatar({
  src,
  name,
  size = 40,
  accent,
}: {
  src?: string | null;
  name: string;
  size?: number;
  accent: string;
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <div
      className="rounded-full flex items-center justify-center overflow-hidden shrink-0"
      style={{
        width: size,
        height: size,
        background: src ? "transparent" : `${accent}22`,
        border: `2px solid ${accent}55`,
        boxShadow: `0 0 18px ${accent}30`,
      }}
    >
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span
          className="font-black"
          style={{ fontSize: size * 0.32, color: accent }}
        >
          {initials}
        </span>
      )}
    </div>
  );
}

export default function QuickMatchResultPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const [, navigate] = useLocation();
  const [result, setResult]   = useState<MatchResult | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (fetchedRef.current || !matchId) return;
    fetchedRef.current = true;

    apiFetch<MatchResult>(`/quickmatch/result/${matchId}`)
      .then((data) => {
        setResult(data);
        setLoading(false);
        // Mark as seen so the pending-result notification doesn't reappear
        const token = localStorage.getItem("clash_ren_token");
        fetch(`/api/quickmatch/result/${matchId}/seen`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        }).catch(() => {});
      })
      .catch((err: Error) => {
        setError(err.message ?? "Could not load result");
        setLoading(false);
      });
  }, [matchId]);

  const cfg = result ? getDisplayConfig(result) : null;

  return (
    <div
      className="min-h-[100dvh] flex flex-col relative overflow-hidden"
      style={{ background: "#050505" }}
    >
      <style>{`
        @keyframes result-pop {
          0%  { transform: scale(0.82); opacity: 0; }
          60% { transform: scale(1.05); }
          100%{ transform: scale(1);   opacity: 1; }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes coin-glow {
          0%,100% { text-shadow: 0 0 16px currentColor; }
          50%     { text-shadow: 0 0 36px currentColor, 0 0 8px currentColor; }
        }
        @keyframes icon-breathe {
          0%,100% { transform: scale(1); }
          50%     { transform: scale(1.08); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Atmospheric gradient */}
      {cfg && (
        <>
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: cfg.bgGradient }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 60% 40% at 50% 100%, rgba(0,0,0,0.6) 0%, transparent 70%)",
            }}
          />
        </>
      )}

      {/* Header */}
      <div
        className="shrink-0 px-4 pt-12 pb-4 relative z-10"
        style={{ background: "linear-gradient(180deg,#050505 0%,transparent 100%)" }}
      >
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/quickmatch")}
            className="w-10 h-10 rounded-2xl flex items-center justify-center active:scale-90 transition-transform"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <ArrowLeft className="w-4.5 h-4.5 text-white/70" />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-black tracking-[0.22em] uppercase text-zinc-600">
              QuickMatch
            </span>
            <span className="text-[14px] font-extrabold text-white leading-tight">
              Match Result
            </span>
          </div>
          <div className="w-10 h-10" />
        </div>
      </div>

      {/* Content */}
      <div
        className="flex-1 flex flex-col items-center px-5 pb-10 relative z-10"
        style={{ opacity: visible ? 1 : 0, transition: "opacity 0.4s ease" }}
      >
        {/* Loading */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div
              className="w-8 h-8 rounded-full"
              style={{
                border: "2px solid rgba(255,255,255,0.12)",
                borderTopColor: "rgba(255,255,255,0.6)",
                animation: "spin 0.9s linear infinite",
              }}
            />
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}
            >
              <XCircle className="w-8 h-8 text-red-400" strokeWidth={1.5} />
            </div>
            <p className="text-[15px] font-bold text-white">Result unavailable</p>
            <p className="text-[13px] text-zinc-500 max-w-xs">{error}</p>
            <button
              onClick={() => navigate("/quickmatch")}
              className="mt-2 px-6 py-3 rounded-2xl text-[13px] font-bold text-white active:scale-95 transition-transform"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              Back to QuickMatch
            </button>
          </div>
        )}

        {/* Result */}
        {result && cfg && (
          <div className="w-full flex flex-col items-center gap-5 mt-2">

            {/* Outcome icon */}
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center"
              style={{
                background: `radial-gradient(circle, ${cfg.accent}25 0%, ${cfg.accent}08 100%)`,
                border: `1.5px solid ${cfg.accent}55`,
                boxShadow: `0 0 48px ${cfg.glowColor}40`,
                animation: "result-pop 0.55s cubic-bezier(.22,1.2,.36,1) both, icon-breathe 3s ease-in-out 0.6s infinite",
              }}
            >
              <cfg.Icon
                className="w-11 h-11"
                style={{ color: cfg.accent }}
                strokeWidth={1.5}
              />
            </div>

            {/* Label + sublabel */}
            <div
              className="flex flex-col items-center gap-1"
              style={{ animation: "slide-up 0.45s ease 0.1s both" }}
            >
              <h1
                className="text-[30px] font-black text-white leading-none tracking-tight"
                style={{ textShadow: `0 0 32px ${cfg.glowColor}60` }}
              >
                {cfg.label}
              </h1>
              <p className="text-[13px] text-zinc-400 text-center max-w-xs">{cfg.sublabel}</p>
            </div>

            {/* Opponent card */}
            {result.opponentName && (
              <div
                className="w-full rounded-2xl px-4 py-4 flex items-center gap-3"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  animation: "slide-up 0.45s ease 0.18s both",
                }}
              >
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${cfg.accent}18` }}
                >
                  <Users className="w-4 h-4" style={{ color: cfg.accent }} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Opponent</p>
                  <p className="text-[14px] font-bold text-white truncate">{result.opponentName}</p>
                </div>
                <Avatar
                  src={result.opponentProfilePicture}
                  name={result.opponentName}
                  size={40}
                  accent={cfg.accent}
                />
              </div>
            )}

            {/* Entry / Prize breakdown */}
            {(result.entryFee > 0 || result.prizeAmount > 0) && (
              <div
                className="w-full rounded-2xl overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, rgba(250,204,21,0.08), rgba(250,204,21,0.03))",
                  border: "1px solid rgba(250,204,21,0.18)",
                  animation: "slide-up 0.45s ease 0.26s both",
                }}
              >
                <div className="flex">
                  {result.entryFee > 0 && (
                    <div className="flex-1 flex flex-col items-center gap-1 py-4 px-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-yellow-700">
                        Entry
                      </span>
                      <div className="flex items-center gap-1.5">
                        <CoinIcon width={14} />
                        <span className="text-[20px] font-black text-white tabular-nums">
                          {result.entryFee}
                        </span>
                      </div>
                    </div>
                  )}
                  {result.entryFee > 0 && result.prizeAmount > 0 && (
                    <div
                      className="w-px"
                      style={{ background: "rgba(250,204,21,0.12)", margin: "12px 0" }}
                    />
                  )}
                  {result.prizeAmount > 0 && (
                    <div className="flex-1 flex flex-col items-center gap-1 py-4 px-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-yellow-600">
                        Prize
                      </span>
                      <div className="flex items-center gap-1.5">
                        <CoinIcon width={14} />
                        <span className="text-[20px] font-black text-yellow-300 tabular-nums">
                          {result.prizeAmount}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Coins earned / lost — authoritative from backend */}
            <div
              className="w-full rounded-2xl flex flex-col items-center gap-2 py-6"
              style={{
                background: `linear-gradient(135deg, ${cfg.accent}10, ${cfg.accent}05)`,
                border: `1px solid ${cfg.accent}25`,
                animation: "slide-up 0.45s ease 0.34s both",
              }}
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                {cfg.coinLabel}
              </span>
              <div className="flex items-center gap-2">
                {cfg.coinDisplay !== "—" && <CoinIcon width={26} />}
                <span
                  className="text-[40px] font-black tabular-nums leading-none"
                  style={{
                    color: cfg.coinColor,
                    animation: cfg.coinDisplay !== "—"
                      ? "coin-glow 2.5s ease-in-out 0.6s infinite"
                      : undefined,
                  }}
                >
                  {cfg.coinDisplay}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div
              className="w-full flex flex-col gap-3 mt-2"
              style={{ animation: "slide-up 0.45s ease 0.42s both" }}
            >
              <button
                onClick={() => navigate("/quickmatch")}
                className="w-full py-4 rounded-2xl text-[14px] font-extrabold text-white active:scale-95 transition-transform"
                style={{
                  background: `linear-gradient(135deg, ${cfg.accent}cc, ${cfg.accent}99)`,
                  boxShadow: `0 0 24px ${cfg.glowColor}40`,
                }}
              >
                Play Again
              </button>
              <button
                onClick={() => navigate("/")}
                className="w-full py-3.5 rounded-2xl text-[13px] font-bold text-zinc-400 active:scale-95 transition-transform"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                Go Home
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
