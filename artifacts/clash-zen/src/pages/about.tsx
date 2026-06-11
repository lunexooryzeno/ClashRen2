import React from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Trophy, Zap, Users, Shield } from "lucide-react";

export default function AboutPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "hsl(var(--background))" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-4">
        <button
          onClick={() => navigate("/profile")}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-95"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <ArrowLeft className="w-4 h-4 text-zinc-400" />
        </button>
        <h1 className="text-base font-bold text-white">About</h1>
      </div>

      <div className="flex-1 px-4 pb-10 space-y-5 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        {/* Logo / Hero */}
        <div className="flex flex-col items-center py-8 gap-3">
          <img
            src="/icons/logo.png"
            alt="Clash Ren Logo"
            className="w-24 h-24 rounded-3xl shadow-lg object-contain"
            style={{ border: "1.5px solid rgba(220,30,30,0.3)", background: "#000" }}
          />
          <div className="text-center">
            <p className="text-2xl" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontStyle: "italic" }}>
              <span style={{ background: "linear-gradient(180deg,#fff 0%,#aaa 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CLASH </span><span style={{ color: "#e01010" }}>REN</span>
            </p>
            <p className="text-[12px] text-zinc-500 font-medium mt-0.5">Free Fire Max eSports Hub</p>
          </div>
        </div>

        {/* About card */}
        <div className="rounded-2xl px-5 py-5 space-y-3"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
            border: "1px solid rgba(255,255,255,0.07)",
          }}>
          <p className="text-[13px] text-zinc-300 leading-relaxed">
            Clash Ren is a premier tournament platform built exclusively for <span className="text-white font-semibold">Free Fire Max</span> players. We're on a mission to boost Free Fire eSports grinding to the next level — giving every player a competitive arena to prove their skills, climb the ranks, and win real rewards.
          </p>
          <p className="text-[13px] text-zinc-300 leading-relaxed">
            Whether you're a solo grinder or a squad legend, Clash Ren is your <span className="text-white font-semibold">eSports hub</span> — the best place for Free Fire Max players ready to compete, grow, and dominate.
          </p>
        </div>

        {/* Feature highlights */}
        {[
          { icon: <Trophy className="w-4 h-4 text-amber-400" />, bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.2)", title: "Real Tournaments", desc: "Compete in structured slots with real match IDs and room credentials." },
          { icon: <Zap className="w-4 h-4 text-primary" />, bg: "hsl(var(--primary) / 0.12)", border: "hsl(var(--primary) / 0.25)", title: "Next-Level Grinding", desc: "Every match counts — climb the leaderboard and prove your rank." },
          { icon: <Users className="w-4 h-4 text-sky-400" />, bg: "rgba(56,189,248,0.12)", border: "rgba(56,189,248,0.2)", title: "eSports Community", desc: "Join thousands of Free Fire Max players competing every day." },
          { icon: <Shield className="w-4 h-4 text-emerald-400" />, bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.2)", title: "Fair & Secure", desc: "Verified accounts, anti-fraud systems, and transparent results." },
        ].map(f => (
          <div key={f.title} className="flex items-start gap-3.5 rounded-2xl px-4 py-4"
            style={{ background: f.bg, border: `1px solid ${f.border}` }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(0,0,0,0.2)" }}>
              {f.icon}
            </div>
            <div>
              <p className="text-[13px] font-bold text-white">{f.title}</p>
              <p className="text-[11.5px] text-zinc-400 mt-0.5 leading-relaxed">{f.desc}</p>
            </div>
          </div>
        ))}

        {/* Footer tag */}
        <p className="text-center text-[11px] text-zinc-600 pt-2">
          Made with passion for the Free Fire eSports community
        </p>
      </div>
    </div>
  );
}
