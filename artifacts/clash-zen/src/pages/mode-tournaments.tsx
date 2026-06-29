import { useParams, useLocation } from "wouter";
import { useListTournaments, ListTournamentsStatus } from "@workspace/api-client-react";
import { TournamentCard } from "@/components/tournament-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Trophy, User, Users, Shield, Zap, Plus, Bell, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListTournamentsQueryKey } from "@workspace/api-client-react";

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

// ── YouTube-style nav hide/show on scroll ────────────────────────────────────
function useNavScrollHide(scrollRef: React.RefObject<HTMLDivElement | null>) {
  const lastY      = useRef(0);
  const ticking    = useRef(false);
  const navHidden  = useRef(false);

  const showNav = useCallback(() => {
    const nav = document.getElementById("bottom-nav");
    if (nav && navHidden.current) {
      nav.style.transform = "translateY(0)";
      navHidden.current = false;
    }
  }, []);

  const hideNav = useCallback(() => {
    const nav = document.getElementById("bottom-nav");
    if (nav && !navHidden.current) {
      nav.style.transform = "translateY(140%)";
      navHidden.current = true;
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function onScroll() {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const currentY = el!.scrollTop;
        const delta    = currentY - lastY.current;

        if (delta > 6 && currentY > 80) {
          hideNav();
        } else if (delta < -6) {
          showNav();
        }
        lastY.current = currentY;
        ticking.current = false;
      });
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      showNav(); // always restore when leaving page
    };
  }, [hideNav, showNav]);
}

// ── New match SSE listener ────────────────────────────────────────────────────
function useTournamentNewSSE(onNew: (mode: string, title: string) => void) {
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  useEffect(() => {
    const esRef = { current: null as EventSource | null };
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;

    function connect() {
      if (!mounted) return;
      const es = new EventSource("/api/users/sse", { withCredentials: true });
      esRef.current = es;

      es.addEventListener("tournament_new", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as { gameMode: string; title: string };
          onNewRef.current(data.gameMode ?? "", data.title ?? "");
        } catch { /* ignore */ }
      });

      es.addEventListener("error", () => {
        es.close();
        esRef.current = null;
        if (!mounted) return;
        reconnectTimer = setTimeout(connect, 5000);
      });
    }

    connect();
    return () => {
      mounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
    };
  }, []);
}

export default function ModeTournaments() {
  const params = useParams<{ mode: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const mode = (params.mode ?? "solo") as Mode;
  const meta = MODE_META[mode] ?? MODE_META.solo;
  const Icon = meta.icon;

  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Navbar scroll-hide ────────────────────────────────────────────────────
  useNavScrollHide(scrollRef);

  // ── Tournaments data (10s live refresh) ───────────────────────────────────
  const { data: allTournaments, isLoading, isFetching } = useListTournaments(
    { status: undefined as unknown as ListTournamentsStatus },
    { query: { refetchInterval: 10_000, refetchIntervalInBackground: false } }
  );

  const tournaments = (allTournaments ?? []).filter(t => {
    const m = (t.gameMode ?? "").toLowerCase();
    if (mode === "solo")  return m.includes("solo");
    if (mode === "duo")   return m.includes("duo");
    if (mode === "squad") return m.includes("squad");
    return false;
  });

  // ── New match banner ───────────────────────────────────────────────────────
  const seenIdsRef       = useRef<Set<number> | null>(null);
  const [newBanner, setNewBanner] = useState<{ count: number; title: string } | null>(null);
  const [bannerVisible, setBannerVisible]   = useState(false);
  const [bannerLeaving, setBannerLeaving]   = useState(false);

  // Track IDs from polling
  useEffect(() => {
    if (!allTournaments) return;
    const modeMatches = allTournaments.filter(t => {
      const m = (t.gameMode ?? "").toLowerCase();
      if (mode === "solo")  return m.includes("solo");
      if (mode === "duo")   return m.includes("duo");
      if (mode === "squad") return m.includes("squad");
      return false;
    });
    const ids = new Set(modeMatches.map(t => t.id));
    if (!seenIdsRef.current) {
      seenIdsRef.current = ids;
      return;
    }
    let count = 0;
    for (const id of ids) {
      if (!seenIdsRef.current.has(id)) count++;
    }
    if (count > 0 && !newBanner) {
      const newest = modeMatches.find(t => !seenIdsRef.current!.has(t.id));
      setNewBanner({ count, title: newest?.title ?? "" });
      setBannerVisible(true);
    }
  }, [allTournaments, mode]);

  // SSE-based instant detection
  useTournamentNewSSE(useCallback((gameMode: string, title: string) => {
    const m = gameMode.toLowerCase();
    const matches =
      (mode === "solo"  && m.includes("solo"))  ||
      (mode === "duo"   && m.includes("duo"))   ||
      (mode === "squad" && m.includes("squad"));
    if (!matches) return;
    // Trigger an immediate refetch and show banner
    queryClient.invalidateQueries({ queryKey: getListTournamentsQueryKey({ status: undefined as unknown as ListTournamentsStatus }) });
    setNewBanner(prev => prev ? { count: prev.count + 1, title } : { count: 1, title });
    setBannerVisible(true);
  }, [mode, queryClient]));

  function dismissBanner() {
    setBannerLeaving(true);
    setTimeout(() => {
      setBannerLeaving(false);
      setBannerVisible(false);
      setNewBanner(null);
      // Mark all current IDs as seen
      if (allTournaments) {
        seenIdsRef.current = new Set(allTournaments.map(t => t.id));
      }
      // Scroll to top so user sees the new card
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, 280);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative" style={{ background: "hsl(var(--background))" }}>

      {/* ── New match banner ── */}
      {bannerVisible && newBanner && (
        <button
          onClick={dismissBanner}
          className="absolute top-0 left-0 right-0 z-30 flex items-center justify-center"
          style={{ animation: bannerLeaving ? "banner-leave 0.28s ease both" : "banner-enter 0.32s cubic-bezier(0.34,1.4,0.64,1) both" }}>
          <div className="mx-4 mt-3 w-full max-w-sm rounded-2xl flex items-center gap-3 px-4 py-3"
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.92), rgba(139,92,246,0.92))",
              backdropFilter: "blur(16px)",
              boxShadow: "0 8px 32px rgba(99,102,241,0.4), 0 0 0 1px rgba(255,255,255,0.12) inset",
            }}>
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 text-white" strokeWidth={2} />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-[12px] font-extrabold text-white leading-tight">
                {newBanner.count === 1 ? "New match added!" : `${newBanner.count} new matches added!`}
              </p>
              {newBanner.title ? (
                <p className="text-[11px] text-white/70 truncate">{newBanner.title}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-1 shrink-0 px-3 py-1.5 rounded-xl bg-white/20">
              <span className="text-[11px] font-bold text-white">Tap to see</span>
            </div>
          </div>
        </button>
      )}

      {/* Banner CSS */}
      <style>{`
        @keyframes banner-enter {
          from { opacity: 0; transform: translateY(-100%); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes banner-leave {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(-100%); }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="relative shrink-0 px-4 pt-5 pb-5"
        style={{ background: "linear-gradient(180deg,#030303 0%,hsl(var(--background)) 100%)", borderBottom: `1px solid ${meta.border}` }}>
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${meta.glow} 0%, transparent 70%)` }} />

        <div className="flex items-center justify-between mb-4 relative z-10">
          <button
            onClick={() => navigate(`/matches/mode/${mode}`)}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>

          {/* Live refresh indicator */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="w-1.5 h-1.5 rounded-full"
              style={{ background: isFetching ? "#a3e635" : "rgba(163,230,53,0.4)",
                boxShadow: isFetching ? "0 0 6px #a3e635" : "none",
                transition: "all 0.4s ease" }} />
            <span className="text-[10px] text-zinc-500 font-semibold">LIVE</span>
            {isFetching && <RefreshCw className="w-2.5 h-2.5 text-zinc-500 animate-spin" />}
          </div>
        </div>

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
      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-8 px-4 pt-5">

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
