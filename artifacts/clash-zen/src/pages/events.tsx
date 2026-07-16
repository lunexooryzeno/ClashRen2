import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { User, Users, Shield, ArrowRight, Gem } from "lucide-react";
import bgImage from "@assets/1782801646557_1782801792030.png";
import ibImage from "@assets/1783435012009_1-removebg-preview_1783435742788.png";

const MODES = [
  {
    id: "solo",
    label: "Solo",
    tagline: "Last One Standing",
    entry: "From 10 🪙 entry",
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
    entry: "From 20 🪙 entry",
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
    entry: "From 40 🪙 entry",
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
      <div className="relative shrink-0 overflow-hidden rounded-l-2xl" style={{ width: "46%" }}>
        <img src={mode.image} alt={mode.label} className="w-full h-auto block" draggable={false} loading="lazy" decoding="async" />
        <div className="absolute inset-y-0 right-0 w-14 pointer-events-none" style={{ background: `linear-gradient(to right, transparent, #080808)` }} />
        <div className="absolute inset-x-0 top-0 h-8 pointer-events-none" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.4), transparent)" }} />
      </div>
      <div className="relative flex-1 flex flex-col justify-between py-3 pr-3 pl-1 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 120% 60%, ${mode.glow.replace("0.5","0.18")} 0%, transparent 65%)` }} />
        <div className="absolute -right-2 top-1/2 -translate-y-1/2 opacity-[0.06] pointer-events-none">
          <Icon strokeWidth={0.6} style={{ width: 88, height: 88, color: mode.accent }} />
        </div>
        <div className="relative z-10 flex items-center justify-end mb-1">
          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: `${mode.accent}18`, border: `1px solid ${mode.accent}40` }}>
            <ArrowRight className="w-3 h-3" style={{ color: mode.accent }} />
          </div>
        </div>
        <div className="relative z-10">
          <h2 className="font-heading font-black text-white leading-none tracking-tight" style={{ fontSize: 28, textShadow: `0 0 20px ${mode.glow}` }}>
            {mode.label}
          </h2>
          <p className="text-[11px] font-semibold mt-1 leading-tight" style={{ color: `${mode.accent}bb` }}>{mode.tagline}</p>
          <div className="flex items-center gap-1 mt-2">
            <Gem className="w-2.5 h-2.5 shrink-0" style={{ color: `${mode.accent}99` }} />
            <span className="text-[10px] font-semibold" style={{ color: `${mode.accent}77` }}>{mode.entry}</span>
          </div>
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
          <p className="text-[11px] text-zinc-500 mt-1">Free Fire Max tournaments · Win real coins</p>
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

        {/* Instant Battle section */}
        <div className="flex flex-col gap-2.5 mt-2">
          <SectionLabel delay={40} visible={visible}>Instant Battle</SectionLabel>
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate("/quickmatch")}
            onKeyDown={e => e.key === "Enter" && navigate("/quickmatch")}
            className="relative overflow-hidden cursor-pointer active:scale-[0.99] select-none"
            style={{ borderRadius: "14px" }}
          >
            <img
              src={ibImage}
              alt="Instant Battle"
              loading="eager"
              decoding="async"
              draggable={false}
              style={{
                width: "100%",
                display: "block",
                objectFit: "cover",
                objectPosition: "center 20%",
              }}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
