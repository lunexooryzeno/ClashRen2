import { useLocation } from "wouter";
import { ArrowLeft, Trophy, Zap, Users } from "lucide-react";
import { useEffect, useState } from "react";

interface PrizePool {
  entry: number;
  prize: number;
}

const PRIZE_POOLS: PrizePool[] = [
  { entry: 12, prize: 20 },
  { entry: 30, prize: 50 },
  { entry: 42, prize: 70 },
];

function PrizePoolCard({
  pool,
  index,
  visible,
  onSelect,
}: {
  pool: PrizePool;
  index: number;
  visible: boolean;
  onSelect: () => void;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <div
      className="shrink-0 relative overflow-hidden rounded-2xl cursor-pointer select-none"
      style={{
        width: "72vw",
        maxWidth: 260,
        minWidth: 220,
        background: "linear-gradient(160deg, #0f1a14 0%, #0a0f0d 100%)",
        border: "1.5px solid rgba(16,185,129,0.35)",
        boxShadow: pressed
          ? "0 0 0px #10b981"
          : "0 0 28px rgba(16,185,129,0.18), inset 0 1px 0 rgba(16,185,129,0.08)",
        transform: visible
          ? pressed ? "scale(0.96)" : "scale(1)"
          : "translateY(32px)",
        opacity: visible ? 1 : 0,
        transition: `opacity 0.4s ease ${index * 80}ms, transform ${pressed ? "0.12s ease" : `0.45s cubic-bezier(0.34,1.2,0.64,1) ${index * 80}ms`}`,
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => { setPressed(false); onSelect(); }}
      onPointerLeave={() => setPressed(false)}
    >
      {/* Top neon line */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
        style={{ background: "linear-gradient(90deg, transparent 0%, #10b981 50%, transparent 100%)" }}
      />

      {/* WIN banner */}
      <div
        className="mx-4 mt-5 mb-4 rounded-xl flex items-center justify-center gap-2 py-3"
        style={{
          background: "linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(5,150,105,0.08) 100%)",
          border: "1px solid rgba(16,185,129,0.3)",
        }}
      >
        <Trophy className="w-4 h-4 shrink-0" style={{ color: "#10b981" }} strokeWidth={2} />
        <span className="text-[13px] font-black tracking-[0.15em] uppercase" style={{ color: "#10b981" }}>
          WIN
        </span>
        <span className="text-[20px] font-black leading-none" style={{ color: "#34d399" }}>
          ₹{pool.prize}
        </span>
      </div>

      {/* Breakdown */}
      <div className="px-4 pb-5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider">Entry Fee</span>
          <div
            className="px-3 py-1 rounded-lg"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <span className="text-[14px] font-black text-white">₹{pool.entry}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider">Prize Pool</span>
          <div
            className="px-3 py-1 rounded-lg"
            style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }}
          >
            <span className="text-[14px] font-black" style={{ color: "#34d399" }}>₹{pool.prize}</span>
          </div>
        </div>

        <div className="h-px mt-1" style={{ background: "rgba(255,255,255,0.06)" }} />

        {/* Fast match */}
        <div className="flex items-center justify-center gap-1.5 pt-0.5">
          <span
            className="w-1.5 h-1.5 rounded-full bg-emerald-400"
            style={{ boxShadow: "0 0 6px #34d399", animation: "pp-pulse 1.8s ease-in-out infinite" }}
          />
          <span className="text-[10px] font-bold text-emerald-400 tracking-wide">Fast Match</span>
        </div>
      </div>

      {/* Bottom shimmer */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-28 h-px"
        style={{ background: "linear-gradient(90deg, transparent, #10b981, transparent)" }}
      />
    </div>
  );
}

export default function QuickMatchPrizePool() {
  const [, navigate] = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  const handleSelect = (pool: PrizePool) => {
    sessionStorage.setItem("qm_entry", String(pool.entry));
    sessionStorage.setItem("qm_prize", String(pool.prize));
    navigate("/quickmatch/cs");
  };

  return (
    <div
      className="min-h-[100dvh] flex flex-col"
      style={{ background: "#06070a" }}
    >
      <style>{`
        @keyframes pp-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
        @keyframes pp-ring {
          0% { transform: scale(0.5); opacity: 0.7; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        .pp-scroll::-webkit-scrollbar { display: none; }
        .pp-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* ── Header ── */}
      <div
        className="shrink-0 px-4 relative"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 56px)",
          paddingBottom: 28,
          background: "linear-gradient(180deg, #030303 0%, #06070a 100%)",
        }}
      >
        {/* Emerald radial glow behind header */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 50% -10%, rgba(16,185,129,0.12) 0%, transparent 65%)",
          }}
        />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navigate("/quickmatch")}
              className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>

            {/* Live badge */}
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{
                background: "rgba(16,185,129,0.1)",
                border: "1px solid rgba(16,185,129,0.3)",
              }}
            >
              <div className="relative w-2 h-2">
                <div className="absolute inset-0 rounded-full bg-emerald-400/30"
                  style={{ animation: "pp-ring 1.8s ease-out infinite" }} />
                <div className="w-2 h-2 rounded-full bg-emerald-400"
                  style={{ animation: "pp-pulse 1.6s ease-in-out infinite" }} />
              </div>
              <span className="text-[10px] font-black tracking-[0.18em] uppercase text-emerald-400">
                Clash Squad
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" strokeWidth={2.5} />
            <span className="text-[10px] font-black tracking-[0.22em] uppercase text-zinc-500">Quick Match</span>
          </div>
          <h1
            className="font-heading font-black text-white leading-none mb-2"
            style={{ fontSize: 28, letterSpacing: "-0.02em" }}
          >
            Select Prize Pool
          </h1>
          <p className="text-[12px] text-zinc-500 leading-relaxed">
            Pick your entry stake — winner takes the full prize
          </p>
        </div>
      </div>

      {/* ── Cards row (swipeable) ── */}
      <div
        className="pp-scroll flex gap-4 px-4 pt-4 pb-6 overflow-x-auto"
        style={{
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          scrollPaddingLeft: "16px",
        }}
      >
        {PRIZE_POOLS.map((pool, i) => (
          <div key={pool.entry} style={{ scrollSnapAlign: "start" }}>
            <PrizePoolCard
              pool={pool}
              index={i}
              visible={visible}
              onSelect={() => handleSelect(pool)}
            />
          </div>
        ))}
        <div className="shrink-0 w-2" />
      </div>

      {/* ── Swipe hint ── */}
      <div
        className="mx-4 rounded-xl px-4 py-2.5 flex items-center justify-center gap-2"
        style={{
          background: "rgba(16,185,129,0.04)",
          border: "1px dashed rgba(16,185,129,0.15)",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.4s ease 320ms",
        }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 opacity-60" />
        <span className="text-[10px] text-zinc-500 font-semibold">Swipe to explore · Tap to enter</span>
      </div>

      {/* ── Players online strip ── */}
      <div
        className="mx-4 mt-4 rounded-2xl px-4 py-4 flex items-center gap-3"
        style={{
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.06)",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.4s ease 400ms",
        }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.2)" }}
        >
          <Users className="w-4 h-4 text-emerald-400" strokeWidth={2} />
        </div>
        <div>
          <p className="text-[12px] font-bold text-white leading-none mb-0.5">Matches fill fast</p>
          <p className="text-[11px] text-zinc-500">Average wait under 60 seconds</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"
            style={{ animation: "pp-pulse 1.6s ease-in-out infinite" }} />
          <span className="text-[11px] font-black text-emerald-400">Live</span>
        </div>
      </div>
    </div>
  );
}
