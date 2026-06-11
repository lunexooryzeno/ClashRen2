import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Zap, Trophy, User, Users, Shield, ChevronDown, ListFilter, RefreshCw } from "lucide-react";
import { useListTournaments } from "@workspace/api-client-react";
import type { ListTournamentsStatus } from "@workspace/api-client-react";
import { TournamentCard } from "@/components/tournament-card";
import { Skeleton } from "@/components/ui/skeleton";

type Mode = "solo" | "duo" | "squad";

const MODE_META: Record<Mode, {
  label: string;
  tagline: string;
  accent: string;
  glow: string;
  border: string;
  icon: React.ElementType;
  image: string;
}> = {
  solo: {
    label: "Solo",
    tagline: "One player. No allies. Pure skill.",
    accent: "#ef4444",
    glow: "rgba(239,68,68,0.4)",
    border: "rgba(239,68,68,0.3)",
    icon: User,
    image: "/modes/solo.jpg",
  },
  duo: {
    label: "Duo",
    tagline: "Two fighters. One shared victory.",
    accent: "#a855f7",
    glow: "rgba(168,85,247,0.4)",
    border: "rgba(168,85,247,0.3)",
    icon: Users,
    image: "/modes/duo.webp",
  },
  squad: {
    label: "Squad",
    tagline: "Four warriors. One unstoppable force.",
    accent: "#f59e0b",
    glow: "rgba(245,158,11,0.4)",
    border: "rgba(245,158,11,0.3)",
    icon: Shield,
    image: "/modes/squad.jpg",
  },
};

const KNOCKOUT_TYPES = [
  { id: "all",         label: "All Matches",   desc: "Show all matches" },
  { id: "full-map",    label: "Full Map",      desc: "Classic battle royale" },
  { id: "clash-squad", label: "Clash Squad",   desc: "4v4 team deathmatch" },
  { id: "lone-wolf",   label: "Lone Wolf",     desc: "1v1 skill showdown" },
];

function SlideSelector({ mode, accent, glow }: {
  mode: string;
  accent: string;
  glow: string;
}) {
  const [active, setActive] = useState<"knockouts" | "tournaments">("knockouts");
  const [dropOpen, setDropOpen] = useState(false);
  const [selected, setSelected] = useState(KNOCKOUT_TYPES[0]);

  useEffect(() => {
    const nav = document.getElementById("bottom-nav");
    if (nav) nav.style.display = dropOpen ? "none" : "";
    return () => { if (nav) nav.style.display = ""; };
  }, [dropOpen]);

  const { data: allTournaments, isLoading, isFetching, refetch } = useListTournaments(
    { status: undefined as unknown as ListTournamentsStatus },
    { query: { refetchInterval: 20000 } }
  );

  // Knockout matches filtered by current mode; legacy "knockout" and cross-mode formats show on all modes
  const knockoutList = (allTournaments ?? []).filter(t => {
    const m = (t.gameMode ?? "").toLowerCase().replace(/\s+/g, "_");
    if (!m.includes("knockout")) return false;
    if (m === "knockout") return true; // legacy: show on all mode pages
    if (m === "clash_squad_knockout") return true; // CS 1v1 is cross-mode, show everywhere
    return m.includes(mode);
  });

  // Regular tournaments filtered by mode (exclude all knockout variants)
  const tournamentList = (allTournaments ?? []).filter(t => {
    const m = (t.gameMode ?? "").toLowerCase();
    if (m.includes("knockout")) return false;
    if (mode === "solo"  && !m.includes("solo"))  return false;
    if (mode === "duo"   && !m.includes("duo"))   return false;
    if (mode === "squad" && !m.includes("squad")) return false;
    return true;
  });

  const tournaments = active === "knockouts" ? knockoutList : tournamentList;

  const TOURNAMENT_COLOR = "#eab308";

  const tabs = [
    { id: "knockouts"   as const, label: "Knockouts",  icon: Zap,    color: accent },
    { id: "tournaments" as const, label: "Tournaments", icon: Trophy, color: TOURNAMENT_COLOR },
  ];

  const activeColor = tabs.find(t => t.id === active)!.color;

  const handleTab = (id: "knockouts" | "tournaments") => {
    setActive(id);
    setDropOpen(false);
  };

  const handleType = (type: typeof KNOCKOUT_TYPES[number]) => {
    setSelected(type);
    setDropOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sticky header — tabs + filter */}
      <div className="shrink-0 px-4 pt-4 pb-3 flex flex-col gap-3">

        {/* Slide tabs */}
        <div className="relative flex rounded-2xl p-1"
          style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
          {(() => {
            const activeTab = tabs.find(t => t.id === active)!;
            return (
              <div
                className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl"
                style={{
                  left: active === "knockouts" ? 4 : "calc(50%)",
                  transition: "left 0.22s cubic-bezier(0.4,0,0.2,1)",
                  background: `linear-gradient(135deg, ${activeTab.color}28 0%, ${activeTab.color}10 100%)`,
                  border: `1px solid ${activeTab.color}45`,
                  boxShadow: `0 0 16px ${activeTab.color}33`,
                }}
              />
            );
          })()}
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTab(tab.id)}
                className="relative z-10 flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl transition-all duration-200"
              >
                <Icon className="w-4 h-4" style={{ color: isActive ? tab.color : "hsl(var(--muted-foreground))" }} strokeWidth={2} />
                <span className="text-sm font-bold tracking-tight" style={{ color: isActive ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filter trigger + refresh button row */}
        <div className="flex items-center gap-2">
          <button
              onClick={() => setDropOpen(true)}
              className="flex-1 flex items-center justify-between px-3.5 py-2.5 rounded-2xl active:opacity-75 transition-opacity"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
            >
              <div className="flex items-center gap-2">
                <ListFilter className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={2} />
                <span className="text-xs text-muted-foreground font-semibold">Match Type</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                  style={{
                    background: `${activeColor}15`,
                    border: `1px solid ${activeColor}35`,
                    boxShadow: `0 0 8px ${activeColor}25`,
                  }}>
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: activeColor }} />
                  <span className="text-[11px] font-bold" style={{ color: activeColor }}>
                    {selected.label}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={2} />
              </div>
            </button>

          {/* Refresh button */}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center active:opacity-70 transition-opacity"
            style={{
              background: "hsl(var(--card))",
              border: `1px solid ${isFetching ? activeColor + "55" : "hsl(var(--border))"}`,
              boxShadow: isFetching ? `0 0 10px ${activeColor}30` : "none",
            }}
          >
            <RefreshCw
              className="w-4 h-4"
              style={{
                color: isFetching ? activeColor : "hsl(var(--muted-foreground))",
                animation: isFetching ? "spin 0.8s linear infinite" : "none",
              }}
              strokeWidth={2.2}
            />
          </button>
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {isLoading ? (
          <div className="flex flex-col gap-4 pt-1">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-44 w-full rounded-2xl bg-muted" />
            ))}
          </div>
        ) : tournaments.length > 0 ? (
          <div className="flex flex-col gap-4 pt-1">
            {tournaments.map(t => <TournamentCard key={t.id} tournament={t} showJoinButton />)}
          </div>
        ) : (
          <div className="rounded-2xl p-8 text-center mt-1"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            {active === "knockouts"
              ? <Zap className="w-8 h-8 mx-auto mb-3" style={{ color: `${accent}80` }} strokeWidth={1.5} />
              : <Trophy className="w-8 h-8 mx-auto mb-3" style={{ color: `${accent}80` }} strokeWidth={1.5} />
            }
            <p className="text-sm font-bold text-muted-foreground">
              {active === "knockouts" ? "No knockout arenas open" : "No open tournaments"}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {active === "knockouts" ? "Lightning brackets drop regularly — check back soon" : "New battles are scheduled every day — drop in soon"}
            </p>
          </div>
        )}
      </div>

      {/* Bottom sheet */}
      {dropOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(3px)" }}
            onClick={() => setDropOpen(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl pb-10"
            style={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              animation: "slideUp 0.28s cubic-bezier(0.32,0.72,0,1)",
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-5">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Sheet header */}
            <div className="flex items-center gap-3 px-5 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${activeColor}18`, border: `1px solid ${activeColor}35` }}>
                <ListFilter className="w-4 h-4" style={{ color: activeColor }} strokeWidth={2} />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-[0.18em] font-bold leading-none mb-0.5">Filter</p>
                <p className="text-base font-extrabold text-foreground leading-none">Match Type</p>
              </div>
            </div>

            {KNOCKOUT_TYPES.map((type, i) => {
              const isSelected = selected.id === type.id;
              return (
                <button
                  key={type.id}
                  onClick={() => handleType(type)}
                  className="w-full flex items-center justify-between px-5 py-4 transition-colors active:opacity-80"
                  style={{
                    borderTop: i > 0 ? "1px solid hsl(var(--border))" : "none",
                    background: isSelected ? `${activeColor}08` : "transparent",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: isSelected ? `${activeColor}20` : "hsl(var(--muted))",
                        border: `1px solid ${isSelected ? activeColor + "50" : "hsl(var(--border))"}`,
                      }}
                    >
                      <Zap className="w-4 h-4" style={{ color: isSelected ? activeColor : "hsl(var(--muted-foreground))" }} strokeWidth={2} />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold leading-none mb-0.5"
                        style={{ color: isSelected ? activeColor : "hsl(var(--foreground))" }}>
                        {type.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{type.desc}</p>
                    </div>
                  </div>
                  <div
                    className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                    style={{
                      borderColor: isSelected ? activeColor : "hsl(var(--border))",
                      background: isSelected ? activeColor : "transparent",
                    }}
                  >
                    {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                </button>
              );
            })}
          </div>
          <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
        </>
      )}
    </div>
  );
}

export default function ModeDetail() {
  const params = useParams<{ mode: string }>();
  const [, navigate] = useLocation();
  const mode = (params.mode ?? "solo") as Mode;
  const meta = MODE_META[mode] ?? MODE_META.solo;

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "hsl(var(--background))" }}>

      {/* ── Hero ── */}
      <div className="relative shrink-0 mx-3 mt-3" style={{ borderRadius: 24, overflow: "hidden", height: 220 }}>
        <img
          src={meta.image}
          alt={meta.label}
          className="absolute inset-0 w-full h-full object-cover object-top"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.9) 100%)" }} />
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at 75% 30%, ${meta.glow} 0%, transparent 60%)` }} />
        <div className="absolute bottom-0 inset-x-0 h-16 pointer-events-none"
          style={{ background: "linear-gradient(to top, hsl(var(--background)), transparent)" }} />

        <button
          onClick={() => navigate("/matches")}
          className="absolute top-4 left-4 z-10 w-8 h-8 rounded-xl flex items-center justify-center backdrop-blur-sm"
          style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)" }}>
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>

        <div className="absolute bottom-4 left-4 right-4 z-10">
          <h1 className="font-heading text-4xl font-black text-white leading-none tracking-tight"
            style={{ textShadow: `0 0 30px ${meta.glow}` }}>
            {meta.label}
          </h1>
          <p className="text-[12px] font-medium mt-1.5 text-zinc-400">{meta.tagline}</p>
        </div>
      </div>

      {/* ── Slide selector + match list ── */}
      <SlideSelector mode={mode} accent={meta.accent} glow={meta.glow} />
    </div>
  );
}
