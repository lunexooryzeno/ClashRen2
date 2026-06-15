import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptics";
import {
  Trophy, Gem, Shield, CheckCircle2,
  Users, Swords, Wallet, Zap, Clock,
  ChevronRight,
} from "lucide-react";

const POST_WELCOME_REDIRECT_KEY = "clash-ren:post-welcome-redirect";

const STEPS = [
  {
    id: "join",
    accent: "#FF5520",
    glow: "rgba(255,85,32,0.35)",
    badge: "HOW IT WORKS  ·  1 OF 3",
    title: "Pick.\nPay.\nPlay.",
    body: "Browse open arenas, tap Join, pay your entry in Diamonds — and you're in. Room ID and password arrive in the app 10 minutes before start.",
    bullets: [
      { icon: Swords,  text: "Solo, Duo and Squad modes" },
      { icon: Gem,     text: "Entry fees from 5 – 50 Diamonds" },
      { icon: Clock,   text: "Room details unlock 10 min before" },
    ],
  },
  {
    id: "rewards",
    accent: "#FAAD14",
    glow: "rgba(250,173,20,0.30)",
    badge: "HOW IT WORKS  ·  2 OF 3",
    title: "Win.\nCollect.\nCash Out.",
    body: "Prizes land in your Clash Ren wallet the moment results are confirmed. Per-kill bonus diamonds stack up — withdraw to UPI anytime, no delays.",
    bullets: [
      { icon: Trophy, text: "Wallet credited instantly on win" },
      { icon: Gem,    text: "Bonus diamonds per kill" },
      { icon: Wallet, text: "Withdraw to UPI — zero holds" },
    ],
  },
  {
    id: "safety",
    accent: "#3B82F6",
    glow: "rgba(59,130,246,0.30)",
    badge: "HOW IT WORKS  ·  3 OF 3",
    title: "Verified.\nFair.\nTrusted.",
    body: "Every account is Free Fire UID-verified before joining. Admins confirm results with kill screenshots. Disputes are reviewed in under 2 hours.",
    bullets: [
      { icon: Shield,       text: "UID verified before every match" },
      { icon: CheckCircle2, text: "Results confirmed with screenshots" },
      { icon: CheckCircle2, text: "Disputes resolved in < 2 hours" },
    ],
  },
] as const;

// ── Visual: step 1 — Join ────────────────────────────────────────────────────
function JoinVisual({ accent }: { accent: string }) {
  return (
    <div className="relative flex items-center justify-center w-full h-full">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-72 h-72 rounded-full blur-3xl" style={{ background: `${accent}22` }} />
      </div>

      <div style={{ animation: "ob-float 3s ease-in-out infinite" }}>
        <div
          className="w-60 rounded-2xl overflow-hidden"
          style={{
            background: "rgba(14,14,16,0.97)",
            border: `1px solid ${accent}30`,
            boxShadow: `0 12px 40px rgba(0,0,0,0.7), 0 0 0 1px ${accent}10 inset, 0 0 36px ${accent}18`,
          }}
        >
          {/* Header */}
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-2 mb-3">
              <Swords className="w-4 h-4" style={{ color: accent }} />
              <span className="font-heading font-bold text-white text-sm tracking-widest">SOLO ARENA</span>
              <div className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/15 border border-green-500/25">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" style={{ animation: "ob-blink 1.2s ease-in-out infinite" }} />
                <span className="text-[10px] font-bold text-green-400">LIVE</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 mb-2.5">
              <Trophy className="w-4 h-4 text-yellow-400" />
              <span className="font-bold text-yellow-400 text-sm">500</span>
              <Gem className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-zinc-500 text-xs ml-auto">Prize Pool</span>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <Users className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <div className="flex-1 h-1 rounded-full bg-zinc-800/80 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: "75%", background: accent }} />
              </div>
              <span className="text-[10px] text-zinc-500 tabular-nums">24/32</span>
            </div>
          </div>

          <div className="h-px mx-4" style={{ background: `${accent}18` }} />

          <div className="px-4 py-3">
            <div
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm"
              style={{ background: `${accent}18`, border: `1px solid ${accent}35`, color: accent }}
            >
              <Zap className="w-4 h-4" />
              JOIN ARENA · 20 💎
            </div>
          </div>
        </div>

        <div className="mt-3 text-center">
          <span className="text-[11px] text-zinc-600">Room ID drops 10 min before start</span>
        </div>
      </div>
    </div>
  );
}

// ── Visual: step 2 — Rewards ────────────────────────────────────────────────
function RewardsVisual({ accent }: { accent: string }) {
  return (
    <div className="relative flex items-center justify-center w-full h-full">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-72 h-72 rounded-full blur-3xl" style={{ background: `${accent}18` }} />
      </div>

      {/* Falling gems */}
      {[0, 1, 2, 3, 4].map(i => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${12 + i * 17}%`,
            top: "-8px",
            opacity: 0,
            animation: `ob-fall 2.6s ${i * 0.52}s ease-in infinite`,
          }}
        >
          <Gem className="w-4 h-4 text-blue-400" />
        </div>
      ))}

      {/* Wallet card */}
      <div style={{ animation: "ob-float 3.6s ease-in-out infinite" }}>
        <div
          className="w-56 rounded-2xl px-5 pt-5 pb-4"
          style={{
            background: "rgba(14,14,16,0.97)",
            border: `1px solid ${accent}28`,
            boxShadow: `0 12px 40px rgba(0,0,0,0.7), 0 0 32px ${accent}18`,
          }}
        >
          <div className="text-center mb-1.5">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Tournament Winnings</span>
          </div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <Gem className="w-6 h-6 text-blue-400" />
            <span className="font-heading text-4xl font-bold text-white tabular-nums">+500</span>
          </div>
          <div className="text-center mb-4">
            <span className="text-xs text-zinc-600">≈ ₹250.00</span>
          </div>
          <div
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm"
            style={{ background: `${accent}1A`, border: `1px solid ${accent}30`, color: accent }}
          >
            <Wallet className="w-4 h-4" />
            Withdraw to UPI
          </div>
        </div>

        {/* Credit toast */}
        <div
          className="mt-2.5 flex items-center gap-2.5 px-3 py-2.5 rounded-2xl"
          style={{
            background: "rgba(14,14,16,0.97)",
            border: "1px solid rgba(74,222,128,0.20)",
            animation: "ob-toast 3.5s ease-in-out infinite",
          }}
        >
          <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white leading-none mb-0.5">Prize credited</div>
            <div className="text-[10px] text-zinc-500">500 Diamonds added to wallet</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Visual: step 3 — Safety ─────────────────────────────────────────────────
const CHECKS = ["UID Verified", "Screenshots Reviewed", "Result Confirmed"];

function SafetyVisual({ accent }: { accent: string }) {
  return (
    <div className="relative flex items-center justify-center w-full h-full">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-64 h-64 rounded-full blur-3xl" style={{ background: `${accent}20` }} />
      </div>

      <div className="flex flex-col items-center">
        {/* Shield + rings */}
        <div className="relative" style={{ width: 96, height: 96 }}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                top: `-${(i + 1) * 14}px`,
                left: `-${(i + 1) * 14}px`,
                right: `-${(i + 1) * 14}px`,
                bottom: `-${(i + 1) * 14}px`,
                border: `1px solid ${accent}`,
                opacity: 0.25 - i * 0.07,
                animation: `ob-ring 2.2s ${i * 0.5}s ease-out infinite`,
              }}
            />
          ))}

          <div
            className="absolute inset-0 rounded-full flex items-center justify-center"
            style={{
              background: `${accent}1A`,
              border: `2px solid ${accent}50`,
              boxShadow: `0 0 44px ${accent}30`,
            }}
          >
            <Shield className="w-11 h-11" style={{ color: accent }} strokeWidth={1.5} />
          </div>

          <div
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center border-[2.5px] border-black"
            style={{ background: "#22c55e" }}
          >
            <CheckCircle2 className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
        </div>

        {/* Verification rows */}
        <div className="mt-10 space-y-2 w-56">
          {CHECKS.map((text, i) => (
            <div
              key={text}
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl"
              style={{
                background: "rgba(14,14,16,0.97)",
                border: "1px solid rgba(255,255,255,0.06)",
                animation: `ob-checkin 0.45s ${0.25 + i * 0.18}s both`,
              }}
            >
              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              <span className="text-xs text-zinc-300 font-medium">{text}</span>
              <div className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Keyframe injector ────────────────────────────────────────────────────────
const ANIM_CSS = `
@keyframes ob-float {
  0%, 100% { transform: translateY(0px); }
  50%       { transform: translateY(-9px); }
}
@keyframes ob-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.25; }
}
@keyframes ob-fall {
  0%   { transform: translateY(-12px); opacity: 0; }
  12%  { opacity: 1; }
  85%  { opacity: 0.9; }
  100% { transform: translateY(190px); opacity: 0; }
}
@keyframes ob-ring {
  0%   { opacity: 0.3; transform: scale(1); }
  100% { opacity: 0;   transform: scale(1.4); }
}
@keyframes ob-checkin {
  from { opacity: 0; transform: translateX(14px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes ob-toast {
  0%   { opacity: 0; transform: translateY(6px); }
  12%  { opacity: 1; transform: translateY(0); }
  75%  { opacity: 1; }
  100% { opacity: 0; transform: translateY(-4px); }
}
@keyframes ob-step-enter {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes ob-vis-enter {
  from { opacity: 0; transform: scale(0.96); }
  to   { opacity: 1; transform: scale(1); }
}
`;

// ── Main page ────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const touchX = useRef(0);

  const finish = useCallback(() => {
    if (user?.id) {
      localStorage.setItem(`cz:onboarded:${user.id}`, "true");
      localStorage.setItem(`clash-ren:welcomed:${user.id}`, "true");
    }
    const dest = sessionStorage.getItem(POST_WELCOME_REDIRECT_KEY) || "/";
    sessionStorage.removeItem(POST_WELCOME_REDIRECT_KEY);
    navigate(dest);
  }, [user, navigate]);

  const advance = useCallback(() => {
    haptic.softTap();
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else finish();
  }, [step, finish]);

  const back = useCallback(() => {
    if (step > 0) {
      haptic.softTap();
      setStep(s => s - 1);
    }
  }, [step]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) < 55) return;
    if (dx < 0) advance();
    else back();
  }, [advance, back]);

  const cur = STEPS[step];

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden select-none"
      style={{
        background: "#000",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <style>{ANIM_CSS}</style>

      {/* ── Progress bars ── */}
      <div className="flex gap-1.5 px-5 pt-4 pb-1 shrink-0">
        {STEPS.map((_, i) => (
          <div key={i} className="flex-1 h-[3px] rounded-full overflow-hidden bg-white/8">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: i < step ? "100%" : i === step ? "100%" : "0%",
                background: i <= step ? cur.accent : "transparent",
                transitionDelay: i === step ? "0ms" : "0ms",
              }}
            />
          </div>
        ))}
      </div>

      {/* ── Skip ── */}
      <div className="flex items-center justify-end px-5 py-2 shrink-0">
        <button
          onClick={() => { haptic.softTap(); finish(); }}
          className="text-zinc-500 text-sm font-medium active:text-zinc-300 transition-colors py-1 px-2"
        >
          Skip
        </button>
      </div>

      {/* ── Visual area ── */}
      <div
        key={`vis-${step}`}
        className="shrink-0 px-4"
        style={{ height: "38%", animation: "ob-vis-enter 0.4s ease-out both" }}
      >
        {step === 0 && <JoinVisual accent={cur.accent} />}
        {step === 1 && <RewardsVisual accent={cur.accent} />}
        {step === 2 && <SafetyVisual accent={cur.accent} />}
      </div>

      {/* ── Text area ── */}
      <div
        key={`txt-${step}`}
        className="flex-1 flex flex-col px-6 pt-2 overflow-hidden"
        style={{ animation: "ob-step-enter 0.38s ease-out both" }}
      >
        {/* Badge */}
        <p
          className="text-[10px] font-bold tracking-[0.18em] uppercase mb-2"
          style={{ color: cur.accent }}
        >
          {cur.badge}
        </p>

        {/* Title */}
        <h2 className="font-heading font-bold text-white leading-[1.05] mb-3" style={{ fontSize: "clamp(2rem,9vw,2.6rem)", whiteSpace: "pre-line" }}>
          {cur.title}
        </h2>

        {/* Body */}
        <p className="text-sm text-zinc-500 leading-relaxed mb-4">
          {cur.body}
        </p>

        {/* Bullets */}
        <div className="space-y-2.5">
          {cur.bullets.map(({ icon: Icon, text }, i) => (
            <div
              key={text}
              className="flex items-center gap-3"
              style={{ animation: `ob-step-enter 0.38s ${0.06 + i * 0.07}s both` }}
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${cur.accent}14`, border: `1px solid ${cur.accent}22` }}
              >
                <Icon className="w-4 h-4" style={{ color: cur.accent }} />
              </div>
              <span className="text-sm text-zinc-300 font-medium">{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 px-5 pb-5 pt-4">
        {/* Dot indicators */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => { haptic.softTap(); setStep(i); }}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === step ? 22 : 6,
                height: 6,
                background: i === step ? cur.accent : "rgba(255,255,255,0.18)",
              }}
            />
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={() => { haptic.mediumTap(); advance(); }}
          className="w-full py-4 rounded-2xl font-heading font-bold text-lg tracking-wide text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          style={{
            background: cur.accent,
            boxShadow: `0 4px 24px ${cur.glow}, 0 0 0 1px ${cur.accent}30 inset`,
          }}
        >
          {step < STEPS.length - 1 ? "Next" : "Start Playing"}
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
