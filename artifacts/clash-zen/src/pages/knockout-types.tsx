import { useParams, useLocation } from "wouter";
import { ArrowLeft, Map, Swords, Target, Users, User, Shield, Crosshair, Zap } from "lucide-react";

type Mode = "solo" | "duo" | "squad";

const MODE_META: Record<Mode, { label: string; accent: string; glow: string; border: string; icon: React.ElementType; image: string }> = {
  solo:  { label: "Solo",  accent: "#ef4444", glow: "rgba(239,68,68,0.35)",  border: "rgba(239,68,68,0.3)",  icon: User,   image: "/modes/solo.jpg"  },
  duo:   { label: "Duo",   accent: "#a855f7", glow: "rgba(168,85,247,0.35)", border: "rgba(168,85,247,0.3)", icon: Users,  image: "/modes/duo.webp"  },
  squad: { label: "Squad", accent: "#f59e0b", glow: "rgba(245,158,11,0.35)", border: "rgba(245,158,11,0.3)", icon: Shield, image: "/modes/squad.jpg" },
};

type KnockoutType = {
  id: string;
  label: string;
  description: string;
  tag: string;
  icon: React.ElementType;
};

const KNOCKOUT_TYPES: Record<Mode, KnockoutType[]> = {
  solo: [
    { id: "full-map",    label: "Full Map Random",  description: "Drop anywhere on the full island. Scavenge, survive and be the last standing.",           tag: "BATTLE ROYALE", icon: Map },
    { id: "clash-squad", label: "Clash Squad",       description: "Fast-paced 4v4 combat in a small arena. Round-based — first to 6 round wins.",            tag: "QUICK MATCH",   icon: Swords },
    { id: "lone-wolf",   label: "Lone Wolf",         description: "Solo-only mode on a compact map. Pure skill, no squad advantage — only the best survive.", tag: "RANKED",        icon: Target },
  ],
  duo: [
    { id: "full-map-duo",  label: "Full Map Duo",     description: "Classic battle royale for two-player teams. Coordinate and outlast every duo.",           tag: "BATTLE ROYALE", icon: Map },
    { id: "clash-duo",     label: "Clash Squad Duo",  description: "2v2 intense arena combat. Round-based short matches for maximum action.",                 tag: "QUICK MATCH",   icon: Swords },
    { id: "training",      label: "Training Grounds", description: "Sharpen your duo synergy on the training map before competing in ranked events.",         tag: "PRACTICE",      icon: Crosshair },
  ],
  squad: [
    { id: "full-squad",   label: "Full Squad Battle", description: "The ultimate 4v4 battle royale. Claim the Booyah as a team across the full island.",     tag: "BATTLE ROYALE", icon: Map },
    { id: "clash-squad",  label: "Clash Squad 4v4",   description: "Classic 4v4 arena clash. Best of rounds — fast, furious, and unforgiving.",              tag: "QUICK MATCH",   icon: Swords },
    { id: "tdm",          label: "Team Deathmatch",   description: "Elimination-based squad warfare. Rack up kills and reach the target score to win.",       tag: "DEATHMATCH",    icon: Zap },
  ],
};

export default function KnockoutTypes() {
  const params = useParams<{ mode: string }>();
  const [, navigate] = useLocation();
  const mode = (params.mode ?? "solo") as Mode;
  const meta = MODE_META[mode] ?? MODE_META.solo;
  const Icon = meta.icon;
  const types = KNOCKOUT_TYPES[mode] ?? KNOCKOUT_TYPES.solo;

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "hsl(var(--background))" }}>

      {/* ── Header ── */}
      <div className="relative shrink-0 px-4 pt-5 pb-5"
        style={{ background: "linear-gradient(180deg, #030303 0%, hsl(var(--background)) 100%)", borderBottom: `1px solid ${meta.border}` }}>
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${meta.glow} 0%, transparent 70%)` }} />

        {/* Back */}
        <button
          onClick={() => navigate(`/matches/mode/${mode}`)}
          className="relative z-10 w-9 h-9 rounded-xl flex items-center justify-center mb-4"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: `${meta.accent}20`, border: `1.5px solid ${meta.accent}50`, boxShadow: `0 0 20px ${meta.glow}` }}>
            <Icon className="w-6 h-6" style={{ color: meta.accent }} strokeWidth={1.8} />
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <Zap className="w-3 h-3" style={{ color: meta.accent }} />
              <span className="text-[10px] font-extrabold tracking-widest uppercase" style={{ color: meta.accent }}>
                {meta.label} · Knockouts
              </span>
            </div>
            <h1 className="font-heading text-2xl font-extrabold text-white tracking-tight leading-none">
              Choose Match Type
            </h1>
          </div>
        </div>
      </div>

      {/* ── Match type cards ── */}
      <div className="flex-1 overflow-y-auto pb-8 px-4 pt-5">
        <div className="flex flex-col gap-4">
          {types.map((type, i) => {
            const TypeIcon = type.icon;
            return (
              <div
                key={type.id}
                role="button"
                tabIndex={0}
                className="relative overflow-hidden rounded-2xl cursor-pointer active:scale-[0.98] transition-transform duration-150"
                style={{
                  background: `linear-gradient(135deg, ${meta.accent}12 0%, ${meta.accent}06 100%)`,
                  border: `1.5px solid ${meta.accent}28`,
                  boxShadow: `0 4px 20px ${meta.glow.replace("0.35", "0.15")}`,
                  animationDelay: `${i * 60}ms`,
                }}
              >
                {/* Accent shimmer right */}
                <div className="absolute right-0 inset-y-0 w-28 pointer-events-none"
                  style={{ background: `radial-gradient(ellipse at right, ${meta.glow.replace("0.35", "0.2")} 0%, transparent 75%)` }} />

                <div className="relative z-10 p-4 flex items-center gap-4">
                  {/* Icon */}
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: `${meta.accent}18`, border: `1.5px solid ${meta.accent}40`, boxShadow: `0 0 16px ${meta.glow.replace("0.35","0.25")}` }}>
                    <TypeIcon className="w-6 h-6" style={{ color: meta.accent }} strokeWidth={1.8} />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full tracking-widest"
                        style={{ background: `${meta.accent}20`, color: meta.accent, border: `1px solid ${meta.accent}35` }}>
                        {type.tag}
                      </span>
                    </div>
                    <p className="font-heading text-lg font-extrabold text-white leading-tight tracking-tight">
                      {type.label}
                    </p>
                    <p className="text-[11px] text-zinc-500 leading-snug mt-0.5">
                      {type.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
