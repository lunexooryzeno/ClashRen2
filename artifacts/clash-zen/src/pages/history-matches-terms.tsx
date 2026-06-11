import React from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ScrollText, Key, RefreshCw, AlertTriangle, Clock, HeadphonesIcon } from "lucide-react";

const TERMS = [
  {
    icon: <Key className="w-4 h-4 text-emerald-400" />,
    bg: "rgba(52,211,153,0.1)",
    border: "rgba(52,211,153,0.2)",
    text: "You can get your Room ID and Password for custom Free Fire Max rooms right here on this page.",
  },
  {
    icon: <RefreshCw className="w-4 h-4 text-sky-400" />,
    bg: "rgba(56,189,248,0.1)",
    border: "rgba(56,189,248,0.2)",
    text: "If a match is cancelled by the admin, you are entitled to a 100% full refund of your entry fee.",
  },
  {
    icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
    bg: "rgba(245,158,11,0.1)",
    border: "rgba(245,158,11,0.2)",
    text: "Don't miss your matches. If a player misses their scheduled match, it is not the admin's fault and entry fees are non-refundable.",
  },
  {
    icon: <Clock className="w-4 h-4 text-violet-400" />,
    bg: "rgba(139,92,246,0.1)",
    border: "rgba(139,92,246,0.2)",
    text: "The admin may send your Room ID and Password up to 10 minutes before the match begins. Stay ready and check this page.",
  },
  {
    icon: <HeadphonesIcon className="w-4 h-4 text-primary" />,
    bg: "hsl(var(--primary) / 0.1)",
    border: "hsl(var(--primary) / 0.25)",
    text: "For any remaining queries or issues, please contact our customer support team — we're here to help.",
  },
];

export default function HistoryMatchesTermsPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a0a0b" }}>
      {/* Top accent bar */}
      <div className="h-[2px] w-full btn-primary-gradient opacity-80" />

      {/* Header */}
      <div className="shrink-0 px-4 pt-10 pb-4" style={{ background: "linear-gradient(180deg,#0f0f10 0%,#0a0a0b 100%)" }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/matches/my_matches")}
            className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 transition-all active:scale-95"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
          >
            <ArrowLeft className="w-4 h-4 text-zinc-300" />
          </button>
          <div className="flex-1">
            <h1 className="text-[17px] font-extrabold text-white tracking-tight">Terms & Conditions</h1>
            <p className="text-[10px] text-zinc-500">My Matches · Rules &amp; Policies</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 pb-10 space-y-4 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        {/* Hero */}
        <div className="flex flex-col items-center py-6 gap-3">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, hsl(var(--primary) / 0.2), rgba(139,92,246,0.1))",
              border: "1px solid hsl(var(--primary) / 0.3)",
            }}>
            <ScrollText className="w-7 h-7 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-lg font-black text-white">Match Policies</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">Please read carefully before participating</p>
          </div>
        </div>

        {/* Terms list */}
        <div className="space-y-3">
          {TERMS.map((t, i) => (
            <div
              key={i}
              className="flex items-start gap-3.5 rounded-2xl px-4 py-4"
              style={{ background: t.bg, border: `1px solid ${t.border}` }}
            >
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(0,0,0,0.25)" }}>
                {t.icon}
              </div>
              <p className="text-[13px] text-zinc-300 leading-relaxed pt-1">{t.text}</p>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <p className="text-center text-[11px] text-zinc-600 pt-2 leading-relaxed">
          By joining a match you agree to these terms.
        </p>
      </div>
    </div>
  );
}
