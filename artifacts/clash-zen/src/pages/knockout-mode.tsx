import { useParams, Link } from "wouter";
import { useListTournaments, ListTournamentsStatus } from "@workspace/api-client-react";
import { TournamentCard } from "@/components/tournament-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Zap, Users, User, Swords } from "lucide-react";
import { useState } from "react";

type Mode = "solo" | "duo" | "squad";

const MODE_META: Record<Mode, {
  label: string;
  accent: string;
  glow: string;
  bg: string;
  icon: React.ElementType;
  sub: string;
}> = {
  solo: {
    label: "Solo",
    accent: "#ef4444",
    glow: "rgba(239,68,68,0.35)",
    bg: "linear-gradient(135deg, rgba(239,68,68,0.18) 0%, rgba(239,68,68,0.05) 100%)",
    icon: User,
    sub: "1 vs All — Last one standing wins",
  },
  duo: {
    label: "Duo",
    accent: "#a855f7",
    glow: "rgba(168,85,247,0.35)",
    bg: "linear-gradient(135deg, rgba(168,85,247,0.18) 0%, rgba(168,85,247,0.05) 100%)",
    icon: Users,
    sub: "2-player teams — Outlast every duo",
  },
  squad: {
    label: "Squad",
    accent: "#f59e0b",
    glow: "rgba(245,158,11,0.35)",
    bg: "linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(245,158,11,0.05) 100%)",
    icon: Swords,
    sub: "4-player squads — Ultimate team battle",
  },
};

type Filter = ListTournamentsStatus | "free" | undefined;

const FILTERS: { label: string; value: Filter }[] = [
  { label: "All",       value: undefined },
  { label: "Upcoming",  value: "upcoming" as ListTournamentsStatus },
  { label: "🔴 Live",   value: "ongoing"  as ListTournamentsStatus },
  { label: "Completed", value: "completed" as ListTournamentsStatus },
  { label: "Free 🎁",   value: "free" as Filter },
];

export default function KnockoutMode() {
  const params = useParams<{ mode: string }>();
  const mode = (params.mode ?? "solo") as Mode;
  const meta = MODE_META[mode] ?? MODE_META.solo;
  const Icon = meta.icon;

  const [filter, setFilter] = useState<Filter>(undefined);
  const apiStatus = filter === "free" ? undefined : (filter as ListTournamentsStatus | undefined);
  const { data: allTournaments, isLoading } = useListTournaments({ status: apiStatus }, { query: { refetchInterval: 20000 } });

  const tournaments = (allTournaments ?? []).filter(t => {
    const m = (t.gameMode ?? "").toLowerCase().replace(/\s+/g, "_");
    if (!m.includes("knockout")) return false;
    if (m === "knockout") return true; // legacy: show on all mode pages
    if (m === "clash_squad_knockout") return true; // CS 1v1 is cross-mode, show everywhere
    return m.includes(mode);
  });

  const filtered = filter === "free" ? tournaments.filter(t => t.entryFeeDiamonds === 0) : tournaments;

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "hsl(var(--background))" }}>

      {/* Hero header */}
      <div className="relative overflow-hidden px-4 pt-6 pb-5"
        style={{ background: meta.bg, borderBottom: `1px solid ${meta.accent}22` }}>

        {/* Glow blob */}
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${meta.glow} 0%, transparent 70%)` }} />

        {/* Back */}
        <Link href="/matches">
          <button className="relative z-10 w-9 h-9 rounded-xl flex items-center justify-center mb-4 transition-colors active:opacity-70"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
        </Link>

        <div className="relative z-10 flex items-center gap-4">
          {/* Icon badge */}
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: `${meta.accent}22`, border: `1.5px solid ${meta.accent}55`, boxShadow: `0 0 20px ${meta.glow}` }}>
            <Icon className="w-7 h-7" style={{ color: meta.accent }} strokeWidth={1.8} />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Zap className="w-3.5 h-3.5" style={{ color: meta.accent }} />
              <span className="text-[11px] font-bold tracking-widest uppercase" style={{ color: meta.accent }}>
                Knockout
              </span>
            </div>
            <h1 className="font-heading text-3xl font-extrabold text-white tracking-tight leading-none">
              {meta.label}
            </h1>
            <p className="text-xs mt-1" style={{ color: `${meta.accent}bb` }}>{meta.sub}</p>
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar px-4 py-3 shrink-0">
        {FILTERS.map(f => (
          <button
            key={f.label}
            onClick={() => setFilter(f.value)}
            className="px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all"
            style={
              filter === f.value
                ? { background: meta.accent, color: "#fff", boxShadow: `0 0 12px ${meta.glow}` }
                : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.07)" }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Tournament list */}
      <div className="flex-1 overflow-y-auto pb-8">
        {isLoading ? (
          <div className="flex flex-col gap-4 px-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-48 w-full rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }} />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="flex flex-col gap-4 px-4">
            {filtered.map(t => <TournamentCard key={t.id} tournament={t} showJoinButton />)}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-4 px-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: `${meta.accent}15`, border: `1px solid ${meta.accent}30` }}>
              <Icon className="w-7 h-7" style={{ color: `${meta.accent}80` }} strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-zinc-400">No {meta.label} matches found</p>
              <p className="text-sm text-zinc-600 mt-1 max-w-xs mx-auto">
                No {meta.label.toLowerCase()} tournaments right now. Check back soon!
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
