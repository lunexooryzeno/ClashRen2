import { useState, useEffect, useCallback } from "react";
import { subscribeToSecondTick } from "@/lib/clock";
import { Link, useLocation } from "wouter";
import { CachedImg } from "@/components/CachedImg";
import { format } from "date-fns";
import { Users, Clock, Swords, Check, ShieldAlert, Gem, ChevronRight, X, Zap, Trophy } from "lucide-react";
import type { Tournament } from "@workspace/api-client-react";

function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/api/")) return url;
  const clean = url.replace(/^\/objects\//, "");
  return `/api/storage/objects/${clean}`;
}
import {
  useJoinTournament,
  getListTournamentsQueryKey,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { cn, parseGameMode } from "@/lib/utils";

interface TournamentCardProps {
  tournament: Tournament;
  showJoinButton?: boolean;
}

function useCountdown(targetTime: string) {
  const calc = useCallback(() => {
    const diff = new Date(targetTime).getTime() - Date.now();
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { h, m, s };
  }, [targetTime]);
  const [value, setValue] = useState(calc);
  useEffect(() => {
    setValue(calc());
    return subscribeToSecondTick(() => setValue(calc()));
  }, [calc]);
  return value;
}

export function TournamentCard({ tournament, showJoinButton = false }: TournamentCardProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [showConfirm, setShowConfirm] = useState(false);
  const [success, setSuccess] = useState(false);
  const joinMutation = useJoinTournament();

  const t = tournament as any;
  const perKill: number = t.perKillDiamonds ?? 0;
  const imageUrl: string | null = t.imageUrl ?? null;
  const matchSlug: string | null = t.matchSlug ?? null;
  const gameModeInfo = parseGameMode(tournament.gameMode ?? "");

  const isUpcoming = tournament.status === "upcoming";
  const isOngoing = tournament.status === "ongoing";
  const isFull = tournament.filledSlots >= tournament.maxSlots;
  const canJoin = isUpcoming && !isFull && !tournament.isJoined;
  const hasBalance = user ? user.diamondBalance >= tournament.entryFeeDiamonds : false;
  const countdown = useCountdown(tournament.startTime);
  const isCutoffPassed = isUpcoming && Date.now() >= new Date(tournament.startTime).getTime() - 15 * 60 * 1000;

  const targetPath = matchSlug ? `/matches/${matchSlug}` : `/matches/${tournament.id}`;

  function handleJoin() {
    joinMutation.mutate(
      { id: tournament.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTournamentsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          setShowConfirm(false);
          setSuccess(true);
          setTimeout(() => { setSuccess(false); window.location.reload(); }, 1000);
        },
        onError: () => setShowConfirm(false),
      }
    );
  }

  const STATUS_COLOR_MAP: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    green:  { bg: "bg-emerald-500/15", text: "text-emerald-400",  border: "border-emerald-500/30",  dot: "bg-emerald-400"  },
    red:    { bg: "bg-red-500/15",     text: "text-red-400",      border: "border-red-500/30",      dot: "bg-red-400"      },
    blue:   { bg: "bg-blue-500/15",    text: "text-blue-400",     border: "border-blue-500/30",     dot: "bg-blue-400"     },
    yellow: { bg: "bg-amber-500/15",   text: "text-amber-400",    border: "border-amber-500/30",    dot: "bg-amber-400"    },
    purple: { bg: "bg-purple-500/15",  text: "text-purple-400",   border: "border-purple-500/30",   dot: "bg-purple-400"   },
    orange: { bg: "bg-orange-500/15",  text: "text-orange-400",   border: "border-orange-500/30",   dot: "bg-orange-400"   },
    cyan:   { bg: "bg-cyan-500/15",    text: "text-cyan-400",     border: "border-cyan-500/30",     dot: "bg-cyan-400"     },
  };

  const defaultStyle = { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30", dot: "bg-emerald-400" };
  const inactiveStyle = { bg: "bg-white/8", text: "text-zinc-400", border: "border-white/15", dot: "bg-zinc-500" };

  const statusStyle = (isOngoing || isUpcoming)
    ? (STATUS_COLOR_MAP[t.statusColor ?? "green"] ?? defaultStyle)
    : inactiveStyle;

  const slotPct = Math.min(100, (tournament.filledSlots / tournament.maxSlots) * 100);

  const cardBorder = isOngoing
    ? "1px solid rgba(16,185,129,0.22)"
    : isUpcoming
    ? "1px solid hsl(var(--primary)/0.22)"
    : "1px solid rgba(255,255,255,0.08)";

  return (
    <>
      <div
        role="link"
        tabIndex={0}
        data-testid={`card-tournament-${tournament.id}`}
        className="rounded-2xl overflow-hidden relative cursor-pointer active:scale-[0.99] transition-transform"
        style={{ background: "hsl(var(--card))", border: cardBorder }}
        onClick={() => navigate(targetPath)}
        onKeyDown={e => e.key === "Enter" && navigate(targetPath)}
      >
        {/* ── Image frame ── */}
        <div className="relative w-full overflow-hidden" style={{ height: 140 }}>
          {imageUrl ? (
            <CachedImg
              src={resolveImageUrl(imageUrl) ?? imageUrl}
              alt={tournament.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <img
              src="https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80"
              alt="Tournament"
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
          )}

          {/* gradient overlay */}
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.65) 100%)" }} />


          {/* Cutoff passed dim overlay */}
          {isCutoffPassed && !tournament.isJoined && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: "rgba(180,83,9,0.85)", border: "1px solid rgba(251,146,60,0.5)" }}>
                <Clock className="w-3 h-3 text-amber-300" />
                <span className="text-[11px] font-bold text-amber-200">Booking Closed</span>
              </div>
            </div>
          )}

          {/* per-kill — top right, only when > 0 */}
          {perKill > 0 && (
            <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/60 border border-blue-400/30 rounded-full px-2.5 py-1">
              <Gem className="w-3 h-3 text-blue-400" />
              <span className="text-[10px] font-bold text-blue-300">+{perKill}/kill</span>
            </div>
          )}

          {/* title + description — bottom of image */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
            <h3 className="font-heading font-bold text-base text-white leading-tight line-clamp-1 drop-shadow-lg">
              {tournament.title}
            </h3>
          </div>
        </div>

        {/* ── Info row ── */}
        <div className={cn("px-4 py-3 grid gap-2 border-b border-white/5", perKill > 0 ? "grid-cols-4" : "grid-cols-3")}>
          {/* Start Time / Countdown — left */}
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Slot</span>
            <span className="text-[10px] font-medium text-zinc-300 tabular-nums">{format(new Date(tournament.startTime), "MMM d, yyyy")}</span>
          </div>

          {/* Prize Pool */}
          <div className="flex flex-col items-center gap-0.5 border-l border-white/5">
            <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Prize</span>
            <div className="flex items-center gap-0.5">
              <Gem className="w-3 h-3 text-orange-400" />
              <span className="text-[13px] font-bold text-orange-300">{tournament.prizePoolDiamonds.toLocaleString()}</span>
            </div>
          </div>

          {/* Per Kill — only when > 0 */}
          {perKill > 0 && (
            <div className="flex flex-col items-center gap-0.5 border-l border-white/5">
              <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Per Kill</span>
              <div className="flex items-center gap-0.5">
                <Gem className="w-3 h-3 text-blue-400" />
                <span className="text-[13px] font-bold text-blue-300">+{perKill}</span>
              </div>
            </div>
          )}

          {/* Entry Fee — right */}
          <div className="flex flex-col items-center gap-0.5 border-l border-white/5">
            <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Entry</span>
            {tournament.entryFeeDiamonds > 0 ? (
              <div className="flex items-center gap-0.5">
                <Gem className="w-3 h-3 text-blue-400" />
                <span className="text-[13px] font-bold text-white">{tournament.entryFeeDiamonds}</span>
              </div>
            ) : (
              <span className="text-[13px] font-bold text-emerald-400">FREE</span>
            )}
          </div>
        </div>

      </div>

      {/* ── Confirm bottom sheet ── */}
      {showConfirm && (
        <>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[80]" onClick={() => setShowConfirm(false)} />
          <div className="fixed inset-x-4 bottom-0 z-[90] pb-8">
            <div className="rounded-3xl overflow-hidden" style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/6">
                <p className="font-heading font-bold text-white text-lg">Confirm Entry</p>
                <button onClick={() => setShowConfirm(false)} className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center">
                  <X className="w-4 h-4 text-zinc-400" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-4">
                <div className="rounded-xl p-3.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="font-bold text-white text-sm leading-snug">{tournament.title}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{tournament.gameMode}</p>
                </div>

                <div className="flex items-center justify-between rounded-xl p-3.5" style={{ background: "hsl(var(--primary)/0.08)", border: "1px solid hsl(var(--primary)/0.2)" }}>
                  <span className="text-sm text-zinc-300">Entry Fee</span>
                  {tournament.entryFeeDiamonds > 0 ? (
                    <div className="flex items-center gap-1.5">
                      <Gem className="w-4 h-4 text-blue-400" />
                      <span className="font-bold text-white text-lg">{tournament.entryFeeDiamonds}</span>
                    </div>
                  ) : (
                    <span className="font-bold text-emerald-400 text-lg">FREE</span>
                  )}
                </div>

                {user && (
                  <div className="flex items-center justify-between text-sm px-1">
                    <span className="text-zinc-500">Your balance</span>
                    <div className="flex items-center gap-1">
                      <Gem className="w-3.5 h-3.5 text-blue-400" />
                      <span className={cn("font-bold", hasBalance ? "text-white" : "text-red-400")}>{user.diamondBalance}</span>
                    </div>
                  </div>
                )}

                {!hasBalance && user && (
                  <div className="flex items-center gap-2.5 rounded-xl p-3.5 bg-red-500/8 border border-red-500/20">
                    <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-red-300 font-medium">Not enough diamonds</p>
                      <p className="text-[11px] text-red-400/70 mt-0.5">You need {tournament.entryFeeDiamonds - user.diamondBalance} more 💎</p>
                    </div>
                    <Link href="/top-up">
                      <button onClick={() => setShowConfirm(false)} className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-500/15 border border-blue-500/25 text-blue-400 active:opacity-70">
                        Top Up
                      </button>
                    </Link>
                  </div>
                )}

                <button
                  disabled={!hasBalance || joinMutation.isPending}
                  onClick={handleJoin}
                  className="w-full h-12 rounded-2xl font-bold text-sm text-white transition-opacity disabled:opacity-40"
                  style={{ background: "hsl(var(--primary))", boxShadow: "0 0 20px hsl(var(--primary)/0.4)" }}
                  data-testid="button-confirm-join"
                >
                  {joinMutation.isPending ? "Registering…" : "Confirm & Register"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
