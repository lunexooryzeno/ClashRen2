import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { User, Users, Shield, ArrowRight, Clock, Trophy, Flame, Zap } from "lucide-react";
import bgImage from "@assets/1782801646557_1782801792030.png";

const MODES = [
  {
    id: "solo",
    label: "Solo",
    tagline: "Last One Standing",
    icon: User,
    accent: "#ef4444",
    glow: "rgba(239,68,68,0.5)",
    border: "rgba(239,68,68,0.35)",
    delay: 150,
    image: "/modes/solo.jpg",
  },
  {
    id: "duo",
    label: "Duo",
    tagline: "Pair Up & Dominate",
    icon: Users,
    accent: "#a855f7",
    glow: "rgba(168,85,247,0.5)",
    border: "rgba(168,85,247,0.35)",
    delay: 230,
    image: "/modes/duo.webp",
  },
  {
    id: "squad",
    label: "Squad",
    tagline: "Unite Your Squad",
    icon: Shield,
    accent: "#f59e0b",
    glow: "rgba(245,158,11,0.5)",
    border: "rgba(245,158,11,0.35)",
    delay: 310,
    image: "/modes/squad.jpg",
  },
];

function SectionLabel({ children, delay, visible }: { children: React.ReactNode; delay: number; visible: boolean }) {
  return (
    <div
      className="flex items-center gap-2 px-1"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition: `opacity 0.35s ease ${delay}ms, transform 0.35s ease ${delay}ms`,
      }}
    >
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">{children}</span>
      <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, rgba(255,255,255,0.07), transparent)" }} />
    </div>
  );
}

function MyMatchesCard({ visible }: { visible: boolean }) {
  const [, navigate] = useLocation();
  const accent = "#06b6d4";
  const glow   = "rgba(6,182,212,0.5)";
  const border = "rgba(6,182,212,0.3)";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate("/matches/my_matches")}
      onKeyDown={e => e.key === "Enter" && navigate("/matches/my_matches")}
      className="relative overflow-hidden rounded-2xl cursor-pointer active:scale-[0.975] select-none flex flex-row"
      style={{
        border: `1px solid ${border}`,
        boxShadow: `0 4px 32px rgba(6,182,212,0.18), inset 0 1px 0 rgba(255,255,255,0.06)`,
        background: "#080808",
        minHeight: 96,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: "opacity 0.4s ease 0ms, transform 0.4s ease 0ms",
      }}
    >
      {/* Left — pure gradient panel, no photo */}
      <div
        className="relative shrink-0 flex items-center justify-center overflow-hidden rounded-l-2xl"
        style={{
          width: "42%",
          background: "linear-gradient(135deg, rgba(6,182,212,0.22) 0%, rgba(6,182,212,0.06) 60%, transparent 100%)",
        }}
      >
        {/* large watermark icon */}
        <Clock strokeWidth={0.5} style={{ width: 90, height: 90, color: accent, opacity: 0.18 }} />
        {/* small floating trophies */}
        <Trophy style={{ width: 18, height: 18, color: accent, opacity: 0.35, position: "absolute", top: 14, right: 18 }} />
        <Flame  style={{ width: 14, height: 14, color: "#22d3ee", opacity: 0.25, position: "absolute", bottom: 16, left: 16 }} />
        {/* right fade */}
        <div className="absolute inset-y-0 right-0 w-10 pointer-events-none"
          style={{ background: "linear-gradient(to right, transparent, #080808)" }} />
      </div>

      {/* Right — text */}
      <div className="relative flex-1 flex flex-col justify-between py-3.5 pr-3.5 pl-2 overflow-hidden">
        {/* bg glow */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at 120% 50%, rgba(6,182,212,0.13) 0%, transparent 65%)` }} />

        <div className="relative z-10 flex items-center justify-end mb-1">
          <div className="w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: `${accent}18`, border: `1px solid ${accent}40` }}>
            <ArrowRight className="w-3 h-3" style={{ color: accent }} />
          </div>
        </div>

        <div className="relative z-10">
          <h2 className="font-heading font-black text-white leading-none tracking-tight"
            style={{ fontSize: 26, textShadow: `0 0 18px ${glow}` }}>
            My Matches
          </h2>
          <p className="text-[11px] font-semibold mt-1 leading-tight" style={{ color: "#06b6d4aa" }}>
            View your match history
          </p>
        </div>
      </div>
    </div>
  );
}

function ModeCard({ mode, visible }: { mode: typeof MODES[number]; visible: boolean }) {
  const [, navigate] = useLocation();
  const Icon = mode.icon;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/matches/mode/${mode.id}`)}
      onKeyDown={e => e.key === "Enter" && navigate(`/matches/mode/${mode.id}`)}
      className="relative overflow-hidden rounded-2xl cursor-pointer active:scale-[0.975] select-none flex flex-row"
      style={{
        border: `1px solid ${mode.border}`,
        boxShadow: `0 4px 24px ${mode.glow.replace("0.5","0.2")}, inset 0 1px 0 rgba(255,255,255,0.06)`,
        background: "#080808",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.4s ease ${mode.delay}ms, transform 0.4s ease ${mode.delay}ms`,
      }}
    >
      {/* Left — photo */}
      <div className="relative shrink-0 overflow-hidden rounded-l-2xl" style={{ width: "46%" }}>
        <img
          src={mode.image}
          alt={mode.label}
          className="w-full h-auto block"
          draggable={false}
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-y-0 right-0 w-14 pointer-events-none"
          style={{ background: `linear-gradient(to right, transparent, #080808)` }} />
        <div className="absolute inset-x-0 top-0 h-8 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.4), transparent)" }} />
      </div>

      {/* Right — text */}
      <div className="relative flex-1 flex flex-col justify-between py-3 pr-3 pl-1 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at 120% 60%, ${mode.glow.replace("0.5","0.18")} 0%, transparent 65%)` }} />
        <div className="absolute -right-2 top-1/2 -translate-y-1/2 opacity-[0.06] pointer-events-none">
          <Icon strokeWidth={0.6} style={{ width: 88, height: 88, color: mode.accent }} />
        </div>
        <div className="relative z-10 flex items-center justify-end mb-1">
          <div className="w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: `${mode.accent}18`, border: `1px solid ${mode.accent}40` }}>
            <ArrowRight className="w-3 h-3" style={{ color: mode.accent }} />
          </div>
        </div>
        <div className="relative z-10">
          <h2 className="font-heading font-black text-white leading-none tracking-tight"
            style={{ fontSize: 28, textShadow: `0 0 20px ${mode.glow}` }}>
            {mode.label}
          </h2>
          <p className="text-[11px] font-semibold mt-1 leading-tight" style={{ color: `${mode.accent}bb` }}>
            {mode.tagline}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Events() {
  const [, navigate] = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="flex-1 overflow-y-auto pb-10 relative"
      style={{
        backgroundImage: `linear-gradient(rgba(5,5,12,0.82), rgba(5,5,12,0.88)), url(${bgImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "scroll",
      }}
    >
      <div className="px-4 pt-5 pb-2 flex flex-col gap-4">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-black tracking-tight leading-tight">
            <span className="text-white">Enter the </span>
            <span style={{ background: "linear-gradient(90deg,#ef4444,#a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Arena</span>
          </h1>
          <p className="text-[11px] text-zinc-500 mt-1">Compete &amp; climb the ranks</p>
        </div>

        {/* My Matches section */}
        <div className="flex flex-col gap-2.5">
          <SectionLabel delay={0} visible={visible}>My Activity</SectionLabel>
          <MyMatchesCard visible={visible} />
        </div>

        {/* Quick Match section */}
        <div className="flex flex-col gap-2.5">
          <SectionLabel delay={40} visible={visible}>Live Matchmaking</SectionLabel>
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate("/quickmatch")}
            onKeyDown={e => e.key === "Enter" && navigate("/quickmatch")}
            className="relative overflow-hidden rounded-2xl cursor-pointer active:scale-[0.975] select-none"
            style={{
              border: "1px solid rgba(239,68,68,0.3)",
              boxShadow: "0 4px 32px rgba(239,68,68,0.15), inset 0 1px 0 rgba(255,255,255,0.06)",
              background: "#080808",
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(24px)",
              transition: "opacity 0.4s ease 40ms, transform 0.4s ease 40ms",
            }}
          >
            {/* Top gradient bar */}
            <div className="absolute top-0 left-0 right-0 h-[2px]"
              style={{ background: "linear-gradient(90deg,#ef4444,#3b82f6,#ef4444)" }} />

            <div className="flex flex-row" style={{ minHeight: 96 }}>
              {/* Left — gradient panel */}
              <div
                className="relative shrink-0 flex items-center justify-center overflow-hidden rounded-l-2xl"
                style={{
                  width: "42%",
                  background: "linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(59,130,246,0.12) 60%, transparent 100%)",
                }}
              >
                {/* Radar rings watermark */}
                <div className="absolute" style={{ width: 100, height: 100 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} className="absolute inset-0 rounded-full border"
                      style={{ borderColor: "rgba(239,68,68,0.2)", transform: `scale(${0.4 + i * 0.25})` }} />
                  ))}
                </div>
                <Zap style={{ width: 36, height: 36, color: "#ef4444", opacity: 0.5 }} fill="currentColor" />
                <div className="absolute inset-y-0 right-0 w-10 pointer-events-none"
                  style={{ background: "linear-gradient(to right, transparent, #080808)" }} />
              </div>

              {/* Right — text */}
              <div className="relative flex-1 flex flex-col justify-between py-3.5 pr-3.5 pl-2 overflow-hidden">
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: "radial-gradient(ellipse at 120% 50%, rgba(239,68,68,0.12) 0%, transparent 65%)" }} />

                <div className="relative z-10 flex items-center justify-end mb-1">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                    style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"
                      style={{ animation: "qm-live 1.4s ease-in-out infinite" }} />
                    <span className="text-[9px] font-black text-red-400 tracking-widest uppercase">Live</span>
                  </div>
                </div>

                <div className="relative z-10">
                  <h2 className="font-heading font-black text-white leading-none tracking-tight"
                    style={{ fontSize: 24, textShadow: "0 0 18px rgba(239,68,68,0.5)" }}>
                    Quick Match
                  </h2>
                  <p className="text-[11px] font-semibold mt-1 leading-tight text-zinc-500">
                    CS · BR · Instant matchmaking
                  </p>
                </div>
              </div>
            </div>
          </div>
          <style>{`
            @keyframes qm-live {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.25; }
            }
          `}</style>
        </div>

        {/* Game Modes section */}
        <div className="flex flex-col gap-2.5">
          <SectionLabel delay={80} visible={visible}>Game Modes</SectionLabel>
          <div className="flex flex-col gap-3">
            {MODES.map(mode => (
              <ModeCard key={mode.id} mode={mode} visible={visible} />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
