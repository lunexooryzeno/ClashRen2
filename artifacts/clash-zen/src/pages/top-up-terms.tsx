import React from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ScrollText, Gem, AlertCircle, CheckCircle2, HeadphonesIcon } from "lucide-react";

const TERMS = [
  {
    icon: <AlertCircle className="w-4 h-4 text-red-400" />,
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.2)",
    text: "Once purchased, diamonds cannot be refunded under any circumstances.",
  },
  {
    icon: <AlertCircle className="w-4 h-4 text-amber-400" />,
    bg: "rgba(245,158,11,0.1)",
    border: "rgba(245,158,11,0.2)",
    text: "Top-up diamonds are not withdrawable. They can only be used within the platform.",
  },
  {
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
    bg: "rgba(52,211,153,0.1)",
    border: "rgba(52,211,153,0.2)",
    text: "Only diamonds earned from winning tournaments are eligible for withdrawal.",
  },
  {
    icon: <Gem className="w-4 h-4 text-blue-400" />,
    bg: "rgba(59,130,246,0.1)",
    border: "rgba(59,130,246,0.2)",
    text: "Top-up diamonds are credited to your account instantly after a successful payment.",
  },
  {
    icon: <HeadphonesIcon className="w-4 h-4 text-violet-400" />,
    bg: "rgba(139,92,246,0.1)",
    border: "rgba(139,92,246,0.2)",
    text: "For any queries or issues regarding diamonds, please reach out to our customer support.",
  },
];

export default function TopUpTermsPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "hsl(var(--background))" }}>
      {/* Top accent bar */}
      <div className="h-[2px] w-full btn-primary-gradient opacity-80" />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <button
          onClick={() => navigate("/top-up")}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-95 bg-white/5 border border-white/10"
        >
          <ArrowLeft className="w-4 h-4 text-zinc-400" />
        </button>
        <h1 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Terms & Conditions</h1>
      </div>

      <div className="flex-1 px-4 pb-10 space-y-4 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        {/* Hero */}
        <div className="flex flex-col items-center py-6 gap-3">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.1))",
              border: "1px solid rgba(139,92,246,0.3)",
            }}>
            <ScrollText className="w-7 h-7 text-violet-400" />
          </div>
          <div className="text-center">
            <p className="text-lg font-black text-white">Diamond Store</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">Terms &amp; Conditions</p>
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
                style={{ background: "rgba(0,0,0,0.2)" }}>
                {t.icon}
              </div>
              <p className="text-[13px] text-zinc-300 leading-relaxed pt-1">{t.text}</p>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <p className="text-center text-[11px] text-zinc-600 pt-2 leading-relaxed">
          By completing a top-up, you agree to these terms.
        </p>
      </div>
    </div>
  );
}
