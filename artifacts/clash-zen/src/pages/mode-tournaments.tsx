import { useParams, useLocation } from "wouter";
import { useListTournaments, ListTournamentsStatus } from "@workspace/api-client-react";
import { TournamentCard } from "@/components/tournament-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Trophy, User, Users, Shield, Zap, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";

type Mode = "solo" | "duo" | "squad";

const MODE_META: Record<Mode, {
  label: string;
  accent: string;
  glow: string;
  border: string;
  icon: React.ElementType;
}> = {
  solo:  { label: "Solo",  accent: "#ef4444", glow: "rgba(239,68,68,0.35)",  border: "rgba(239,68,68,0.3)",  icon: User   },
  duo:   { label: "Duo",   accent: "#a855f7", glow: "rgba(168,85,247,0.35)", border: "rgba(168,85,247,0.3)", icon: Users  },
  squad: { label: "Squad", accent: "#f59e0b", glow: "rgba(245,158,11,0.35)", border: "rgba(245,158,11,0.3)", icon: Shield },
};

const ADMIN_CREATE_PATH = "/286c81443d1fb388d1b9a8e3b280824c/matches_management/knockout/new";

export default function ModeTournaments() {
  const params = useParams<{ mode: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const mode = (params.mode ?? "solo") as Mode;
  const meta = MODE_META[mode] ?? MODE_META.solo;
  const Icon = meta.icon;

  const { data: allTournaments, isLoading } = useListTournaments({ status: undefined as unknown as ListTournamentsStatus }, { query: { refetchInterval: 20000 } });

  const tournaments = (allTournaments ?? []).filter(t => {
    const m = (t.gameMode ?? "").toLowerCase();
    if (mode === "solo")  return m.includes("solo");
    if (mode === "duo")   return m.includes("duo");
    if (mode === "squad") return m.includes("squad");
    return false;
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative" style={{ background: "hsl(var(--background))" }}>

      {/* ── Header ── */}
      <div className="relative shrink-0 px-4 pt-5 pb-5"
        style={{ background: "linear-gradient(180deg,#030303 0%,hsl(var(--background)) 100%)", borderBottom: `1px solid ${meta.border}` }}>
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${meta.glow} 0%, transparent 70%)` }} />

        <button
          onClick={() => navigate(`/matches/mode/${mode}`)}
          className="relative z-10 w-9 h-9 rounded-xl flex items-center justify-center mb-4"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: `${meta.accent}20`, border: `1.5px solid ${meta.accent}50`, boxShadow: `0 0 20px ${meta.glow}` }}>
            <Trophy className="w-6 h-6" style={{ color: meta.accent }} strokeWidth={1.8} />
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <Zap className="w-3 h-3" style={{ color: meta.accent }} />
              <span className="text-[10px] font-extrabold tracking-widest uppercase" style={{ color: meta.accent }}>
                {meta.label} · Tournaments
              </span>
            </div>
            <h1 className="font-heading text-2xl font-extrabold text-white tracking-tight leading-none">
              Tournaments
            </h1>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto pb-8 px-4 pt-5">

        {/* Patience quote */}
        <div className="rounded-xl px-4 py-3 mb-5"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <p className="text-[11px] text-zinc-500 leading-relaxed italic">
            "It usually takes patience to be a professional — because it takes more than one match to get there."
          </p>
        </div>

        {/* Tournament list */}
        {isLoading ? (
          <div className="flex flex-col gap-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-48 w-full rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }} />
            ))}
          </div>
        ) : tournaments.length > 0 ? (
          <div className="flex flex-col gap-4">
            {tournaments.map(t => <TournamentCard key={t.id} tournament={t} showJoinButton />)}
          </div>
        ) : (
          <div className="rounded-2xl p-8 text-center"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <Icon className="w-8 h-8 mx-auto mb-3" style={{ color: `${meta.accent}50` }} strokeWidth={1.5} />
            <p className="text-sm font-bold text-zinc-400">No {meta.label} arenas open right now</p>
            <p className="text-xs text-zinc-600 mt-1">New battles drop every week — check back soon</p>
          </div>
        )}
      </div>

      {/* ── Admin floating create button ── */}
      {user?.isAdmin && (
        <button
          onClick={() => navigate(ADMIN_CREATE_PATH)}
          className="absolute bottom-6 right-4 flex items-center gap-2 px-4 py-3 rounded-2xl text-[12px] font-extrabold text-white shadow-xl transition-all active:scale-95"
          style={{
            background: "linear-gradient(135deg,#7c3aed,#a855f7)",
            boxShadow: "0 0 24px rgba(139,92,246,0.45)",
          }}>
          <Plus className="w-4 h-4" />
          Create Matches
        </button>
      )}
    </div>
  );
}
