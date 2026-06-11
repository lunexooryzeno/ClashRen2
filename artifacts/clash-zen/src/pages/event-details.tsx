import { useParams, Link, useLocation } from "wouter";
import { CachedImg } from "@/components/CachedImg";
import { useGetTournament, useJoinTournament, getGetTournamentQueryKey, useListTournaments, ListTournamentsStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Calendar, Users, Trophy, Swords, ShieldAlert, ArrowLeft, Key, CheckCircle, Clock, Swords as SwordsIcon, Copy, Lock, Unlock, Gamepad2, ShieldCheck, Zap, BadgeCheck, Bot, AlertTriangle, FileSearch, Wallet, Crosshair, Gem, ChevronDown, ListFilter, Check, Monitor, Video, Ban } from "lucide-react";
import { useAuth } from "@/lib/auth";

import { useState, useEffect, useRef, useMemo } from "react";
import { haptic } from "@/lib/haptics";
import { sound } from "@/lib/sounds";
import { parseGameMode } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/api/")) return url;
  const clean = url.replace(/^\/objects\//, "");
  return `/api/storage/objects/${clean}`;
}

function useCountdown(targetDate: string | null) {
  const targetMs = useMemo(() => (targetDate ? new Date(targetDate).getTime() : null), [targetDate]);
  const [val, setVal] = useState<{ h: number; m: number; s: number } | null>(null);

  useEffect(() => {
    if (!targetMs) { setVal(null); return; }
    const tick = () => {
      const diff = targetMs - Date.now();
      if (diff <= 0) { setVal(null); return; }
      setVal({
        h: Math.floor(diff / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  return val;
}

function fmt(h: number, m: number, s: number) {
  if (h > 0) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function authFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("clash_ren_token");
  return fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

export default function EventDetails() {
  const params = useParams();
  const rawId = params.id || "";
  const numericId = /^\d+$/.test(rawId) ? parseInt(rawId, 10) : 0;
  const isSlug = numericId === 0 && rawId.length > 0;

  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [showShiftDialog, setShowShiftDialog] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [readyAt, setReadyAt] = useState<string | null>(null);
  const [readyLoading, setReadyLoading] = useState(false);
  const [slugData, setSlugData] = useState<any>(null);
  const [slugLoading, setSlugLoading] = useState(isSlug);
  const [isCutoffPassed, setIsCutoffPassed] = useState(false);
  const [isMatchStarted, setIsMatchStarted] = useState(false);
  const [slotDropOpen, setSlotDropOpen] = useState(false);
  const [showSlotHint, setShowSlotHint] = useState(() => !localStorage.getItem("cz_slot_hint_seen"));
  const dismissSlotHint = () => { setShowSlotHint(false); localStorage.setItem("cz_slot_hint_seen", "1"); };
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [bookedSlotIndices, setBookedSlotIndices] = useState<number[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const roomViewedRef = useRef(false);

  useEffect(() => {
    if (!isSlug) return;
    let cancelled = false;
    const doFetch = () => {
      const token = localStorage.getItem("clash_ren_token");
      fetch(`/api/tournaments/s/${rawId}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(r => r.json())
        .then(d => { if (!cancelled) { setSlugData(d); setSlugLoading(false); } })
        .catch(() => { if (!cancelled) setSlugLoading(false); });
    };
    setSlugLoading(true);
    doFetch();
    const interval = setInterval(doFetch, 20000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [rawId, isSlug]);

  const { data: tournament, isLoading: numLoading } = useGetTournament(numericId, {
    query: {
      queryKey: getGetTournamentQueryKey(numericId),
      enabled: !isSlug && numericId > 0,
      staleTime: 0,
      refetchInterval: 20000,
    }
  });

  const isLoading = isSlug ? slugLoading : numLoading;
  const resolvedTournament: any = isSlug ? slugData : tournament;

  useEffect(() => {
    if (resolvedTournament) {
      setIsReady(resolvedTournament.isReady ?? false);
      setReadyAt(resolvedTournament.readyAt ?? null);
    }
  }, [resolvedTournament]);

  // ── Load persisted slot selection when tournament resolves (default: first slot) ──
  useEffect(() => {
    if (!resolvedTournament?.id) return;
    const stored = localStorage.getItem(`czsl_${resolvedTournament.id}`);
    const slotIdx = stored !== null ? parseInt(stored, 10) : 0;
    setSelectedSlotIndex(slotIdx);

    const booked = localStorage.getItem(`czbl_${resolvedTournament.id}`);
    let indices: number[] = [];
    if (booked !== null) {
      try { indices = JSON.parse(booked); } catch { indices = [parseInt(booked, 10)]; }
      if (!Array.isArray(indices)) indices = [indices as unknown as number];
      indices = indices.filter((n) => typeof n === "number" && !isNaN(n));
    }
    if (indices.length === 0 && (resolvedTournament as any).isJoined) {
      // Backfill: user joined before slot tracking was added
      indices = [slotIdx];
      localStorage.setItem(`czbl_${resolvedTournament.id}`, JSON.stringify(indices));
    }
    setBookedSlotIndices(indices);
    // Always start with the first booked slot selected (if any)
    if (indices.length > 0) {
      setSelectedSlotIndex(indices[0]);
      localStorage.setItem(`czsl_${resolvedTournament.id}`, String(indices[0]));
    }
  }, [resolvedTournament?.id, resolvedTournament?.isJoined]);

  // ── Live clock (1 s ticks — drives slot disabling + countdown) ──
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const joinTournament = useJoinTournament();

  // ── Countdown hooks must be here (before any early returns) ──
  const _startTime = resolvedTournament?.status === "upcoming" ? (resolvedTournament as any).startTime : null;
  const countdown = useCountdown(_startTime);
  const _roomOpenTime = _startTime
    ? new Date(new Date(_startTime).getTime() - 60000).toISOString()
    : null;
  const roomOpenCountdown = useCountdown(_roomOpenTime);

  // ── Live cutoff detection (reads registrationCloseMinutes from matchSettings) ──
  const registrationCloseMinutes = useMemo(() => {
    if (!resolvedTournament) return 15;
    try {
      const ms = typeof (resolvedTournament as any).matchSettings === "string"
        ? JSON.parse((resolvedTournament as any).matchSettings)
        : ((resolvedTournament as any).matchSettings ?? {});
      return typeof ms.registrationCloseMinutes === "number" ? ms.registrationCloseMinutes : 15;
    } catch { return 15; }
  }, [resolvedTournament]);

  useEffect(() => {
    if (!_startTime) { setIsCutoffPassed(false); setIsMatchStarted(false); return; }
    const startMs = new Date(_startTime).getTime();
    const cutoff = startMs - registrationCloseMinutes * 60 * 1000;
    const check = () => {
      const now = Date.now();
      setIsCutoffPassed(now >= cutoff);
      setIsMatchStarted(now >= startMs);
    };
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, [_startTime, registrationCloseMinutes]);

  // ── 1v1 Match data (for joined players after matchmaking) ──
  const [myMatch, setMyMatch] = useState<null | {
    matchmaking: boolean;
    match?: {
      id: number; matchNumber: number; waveNumber: number;
      scheduledAt: string; roomUnlockAt: string | null;
      status: string; winnerId: number | null; notes: string | null;
      seat: string; roomId: string | null; roomPassword: string | null; isUnlocked: boolean;
    };
    opponent?: { id: number; inGameName: string; uid: string; profilePicture: string | null; } | null;
  }>(null);
  const [myMatchLoading, setMyMatchLoading] = useState(false);
  const [showMatchRoom, setShowMatchRoom] = useState(false);

  useEffect(() => {
    const tm = resolvedTournament as any;
    if (!tm?.isJoined || !tm?.id) return;
    let cancelled = false;
    const fetchMatch = async () => {
      setMyMatchLoading(true);
      try {
        const res = await authFetch(`/slots/${tm.id}/my-match`);
        if (!cancelled && res.ok) setMyMatch(await res.json());
      } catch {}
      finally { if (!cancelled) setMyMatchLoading(false); }
    };
    fetchMatch();
    const id = setInterval(fetchMatch, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [(resolvedTournament as any)?.id, (resolvedTournament as any)?.isJoined]);

  const matchUnlockCountdown = useCountdown(myMatch?.match?.roomUnlockAt ?? null);
  const matchBattleCountdown = useCountdown(myMatch?.match?.scheduledAt ?? null);

  // ── All upcoming matches for slot selector + next available ──
  const { data: allTournaments } = useListTournaments(
    { status: "upcoming" as ListTournamentsStatus },
    { query: { staleTime: 30000, refetchInterval: 30000 } }
  );
  const nextAvailableTournament = useMemo(() => {
    if (!resolvedTournament || !allTournaments) return null;
    const now = Date.now();
    const getCloseMin = (t: any) => {
      try {
        const ms = typeof t.matchSettings === "string" ? JSON.parse(t.matchSettings) : (t.matchSettings ?? {});
        return typeof ms.registrationCloseMinutes === "number" ? ms.registrationCloseMinutes : 15;
      } catch { return 15; }
    };
    return (allTournaments as any[])
      .filter(t =>
        t.id !== resolvedTournament.id &&
        ((t.gameMode ?? "") === (resolvedTournament as any).gameMode) &&
        t.status === "upcoming" &&
        new Date(t.startTime).getTime() - getCloseMin(t) * 60 * 1000 > now &&
        t.filledSlots < t.maxSlots
      )
      .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0] ?? null;
  }, [allTournaments, resolvedTournament, isCutoffPassed]);

  // ── All slots of the same game mode (for slot picker) ──
  const sameGameModeSlots = useMemo(() => {
    if (!resolvedTournament || !allTournaments) return [];
    const gm = (resolvedTournament as any).gameMode ?? "";
    const all = (allTournaments as any[]).filter(t => (t.gameMode ?? "") === gm);
    // Also include the current tournament even if it's not in the list
    const hasCurrentId = all.some(t => t.id === resolvedTournament.id);
    if (!hasCurrentId) all.push(resolvedTournament as any);
    return all.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [allTournaments, resolvedTournament]);

  const handleJoin = () => {
    if (!resolvedTournament) return;
    const tid = resolvedTournament.id;

    // Optimistic — close dialog and update UI instantly
    haptic.impact(); sound.success();
    setShowJoinDialog(false);
    queryClient.setQueryData(getGetTournamentQueryKey(tid), (old: any) =>
      old ? { ...old, isJoined: true, filledSlots: (old.filledSlots || 0) + 1 } : old
    );
    toast({ title: "Joined Successfully!", description: "You are now registered for this tournament." });

    // Persist booked slot (append to array)
    const newIndices = Array.from(new Set([...bookedSlotIndices, selectedSlotIndex ?? 0]));
    setBookedSlotIndices(newIndices);
    localStorage.setItem(`czbl_${tid}`, JSON.stringify(newIndices));

    authFetch(`/tournaments/${tid}/join`, {
      method: "POST",
      body: JSON.stringify({ slotIndex: selectedSlotIndex ?? 0 }),
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        haptic.error(); sound.error();
        // Rollback
        const rolledBack = newIndices.filter(i => i !== (selectedSlotIndex ?? 0));
        setBookedSlotIndices(rolledBack.length > 0 ? rolledBack : bookedSlotIndices);
        localStorage.setItem(`czbl_${tid}`, JSON.stringify(rolledBack.length > 0 ? rolledBack : bookedSlotIndices));
        queryClient.setQueryData(getGetTournamentQueryKey(tid), (old: any) =>
          old ? { ...old, isJoined: bookedSlotIndices.length > 0, filledSlots: Math.max(0, (old.filledSlots || 1) - 1) } : old
        );
        toast({ title: "Failed to join", description: (err as { error?: string })?.error || "An error occurred", variant: "destructive" });
      } else {
        queryClient.invalidateQueries({ queryKey: getGetTournamentQueryKey(tid) });
        sessionStorage.setItem("cz_join_success", JSON.stringify({ name: resolvedTournament?.title ?? "", matchId: rawId, ts: Date.now() }));
        navigate("/join-success");
      }
    }).catch(() => {
      haptic.error(); sound.error();
      toast({ title: "Failed to join", description: "Network error. Please try again.", variant: "destructive" });
    });
  };

  const handleReady = async () => {
    if (readyLoading || isReady || !resolvedTournament) return;
    setReadyLoading(true);
    try {
      const res = await authFetch(`/tournaments/${resolvedTournament.id}/ready`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        haptic.impact(); sound.success();
        setIsReady(true);
        setReadyAt(data.readyAt);
        toast({ title: "Marked as Ready", description: "You are ready for the match. Good luck!" });
      }
    } catch {
      haptic.error(); sound.error();
      toast({ title: "Failed", description: "Could not mark ready. Try again.", variant: "destructive" });
    } finally {
      setReadyLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-[100dvh] bg-background">
        <div className="h-64 bg-white/5 animate-pulse relative">
           <div className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/10" />
        </div>
        <div className="p-4 space-y-4">
          <Skeleton className="w-3/4 h-8 bg-white/5" />
          <Skeleton className="w-full h-4 bg-white/5" />
          <Skeleton className="w-5/6 h-4 bg-white/5" />
          <div className="grid grid-cols-2 gap-3 mt-6">
             <Skeleton className="h-24 bg-white/5 rounded-2xl" />
             <Skeleton className="h-24 bg-white/5 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!resolvedTournament) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] p-4 text-center bg-background">
        <ShieldAlert className="w-16 h-16 text-destructive/80 mb-6" />
        <h2 className="font-heading text-3xl font-black text-white mb-2 tracking-tight">Tournament Not Found</h2>
        <p className="text-muted-foreground mb-8 max-w-[280px]">The event you're looking for doesn't exist or has been removed from the arena.</p>
        <Link href="/matches">
          <Button variant="outline" className="rounded-2xl border-white/10 text-white hover:bg-white/5 px-8 h-12 font-bold">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Lobby
          </Button>
        </Link>
      </div>
    );
  }

  const tm = resolvedTournament;
  const isUpcoming = tm.status === "upcoming";
  const isOngoing = tm.status === "ongoing";
  const isFull = tm.filledSlots >= tm.maxSlots;
  const t = tm as any;

  const ms: Record<string, string | number | boolean> = (() => {
    try { return t.matchSettings ? JSON.parse(t.matchSettings) : {}; } catch { return {}; }
  })();
  const gameModeInfo    = parseGameMode(tm.gameMode ?? "");
  const msTeamFormat    = String(ms.teamFormat ?? (gameModeInfo.teamFormat ?? tm.gameMode));
  const msMinLevel      = String(ms.minLevel      ?? "40");
  const msRounds        = String(ms.rounds        ?? "9 (First to 5 wins)");
  const msHp            = String(ms.hp            ?? "200");
  const msEp            = String(ms.ep            ?? "0");
  const msMovementSpeed = String(ms.movementSpeed ?? "100%");
  const msJumpHeight    = String(ms.jumpHeight    ?? "100%");
  const msAmmoLimit     = ms.ammoLimit     ? "Yes" : "No";
  const msGunAttr       = ms.gunAttributes ? "Allowed" : "Not Allowed";
  const msWeaponSkins   = ms.weaponSkins   ? "Allowed" : "Not Allowed";
  const msOnlyHeadshot  = ms.onlyHeadshot  ? "Yes" : "No";
  const msEmulators     = ms.emulators     ? "Allowed" : "Not Allowed";

  const roomUnlocked = !roomOpenCountdown;
  const showRoomDetails = tm.isJoined && tm.roomId && t.credentialsReleased;

  if (showRoomDetails && !roomViewedRef.current) {
    roomViewedRef.current = true;
    authFetch(`/tournaments/${tm.id}/room-viewed`, { method: "POST" }).catch(() => {});
  }

  const getStatusColor = () => {
    if (tm.status === "upcoming") return "bg-primary/20 text-primary border-primary/40 shadow-[0_0_15px_rgba(var(--primary),0.3)]";
    if (tm.status === "ongoing") return "bg-green-500/20 text-green-400 border-green-500/40 shadow-[0_0_15px_rgba(34,197,94,0.3)]";
    return "bg-white/10 text-white/70 border-white/20";
  };

  const getStatusText = () => {
    if (tm.status === "upcoming") return "Upcoming Match";
    if (tm.status === "ongoing") return "Live Now";
    return "Completed";
  };

  return (
    <div className="flex-1 overflow-y-auto pb-28 bg-background relative selection:bg-primary/30">
      
      {/* ── 1. Hero Image Area (Cinematic) ── */}
      <div className="relative h-[340px] w-full shrink-0">
        <CachedImg
          src={resolveImageUrl(t.imageUrl) || "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80"}
          alt={tm.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Dark overlay for contrast */}
        <div className="absolute inset-0 bg-black/30" />
        {/* Cinematic gradient fade to background */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        {/* Subtle top gradient for back button */}
        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />

        <button
          className="absolute top-4 left-4 z-20 w-11 h-11 rounded-full flex items-center justify-center bg-black/40 border border-white/10 backdrop-blur-xl text-white transition-all active:scale-90 hover:bg-black/60"
          data-testid="button-back"
          onClick={() => window.history.back()}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="absolute bottom-0 left-0 right-0 p-5 z-10" style={{ animation: "sectionIn 0.6s cubic-bezier(0.22,1,0.36,1) both", animationDelay: "0ms" }}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
             <div className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border backdrop-blur-sm ${getStatusColor()}`}>
               {getStatusText()}
             </div>
             {gameModeInfo.isKnockout && (
                <div className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border border-amber-500/40 bg-amber-500/20 text-amber-400 backdrop-blur-sm shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center gap-1">
                  <Trophy className="w-3 h-3" /> Knockout
                </div>
             )}
          </div>
          
          <h1 className="font-heading text-4xl leading-[1.05] font-black text-white tracking-tight drop-shadow-md">
            {tm.title}
          </h1>
          <p className="text-[13px] text-zinc-300 mt-2 line-clamp-2 leading-relaxed max-w-[90%] drop-shadow-sm font-medium">
            {t.description || "Battle it out against the best players on the server. Only the sharpest reflexes make it to the top."}
          </p>
        </div>
      </div>

      {/* ── 3. Countdown Section (Only for Joined Upcoming) ── */}
      {tm.isJoined && isUpcoming && countdown && ms.showCountdown && (
        <div className="px-5 mt-2" style={{ animation: "sectionIn 0.6s cubic-bezier(0.22,1,0.36,1) both", animationDelay: "60ms" }}>
          <div className="relative rounded-2xl overflow-hidden bg-black/40 border border-primary/30 p-5 flex flex-col items-center justify-center">
            {/* Glowing orb behind countdown */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-primary/30 rounded-full blur-[40px] pointer-events-none" />
            
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-2 relative z-10">Match Starts In</p>
            <div className="font-mono font-black text-[2.75rem] leading-none text-white tabular-nums tracking-tight relative z-10 drop-shadow-[0_0_12px_rgba(var(--primary),0.8)]">
              {fmt(countdown.h, countdown.m, countdown.s)}
            </div>
            <p className="text-[11px] text-zinc-400 mt-2 font-medium relative z-10 flex items-center gap-1.5">
               <Calendar className="w-3.5 h-3.5" /> {format(new Date(tm.startTime), "EEEE, MMM d")}
            </p>
          </div>
        </div>
      )}

      {/* ── 4. Room Unlock Alert ── */}
      {tm.isJoined && tm.roomId && t.credentialsReleased && isUpcoming && (
        <div className="px-5 mt-4" style={{ animation: "sectionIn 0.6s cubic-bezier(0.22,1,0.36,1) both", animationDelay: "100ms" }}>
          <div className="rounded-2xl p-4 flex items-start gap-3 bg-emerald-950/30 border border-emerald-500/40 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 shadow-[0_0_10px_#10b981]" />
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 animate-pulse">
              <Key className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1 pt-0.5">
              <p className="text-sm font-bold text-emerald-400">Room Credentials Released</p>
              <p className="text-[12px] text-emerald-100/70 mt-0.5 leading-snug">Your Match Room ID and Password are ready. Join before the match starts.</p>
            </div>
          </div>
        </div>
      )}

      <div className="px-5 pt-6 pb-6 space-y-8">
        
        {/* ── 5. Slot Picker ── */}
        {(() => {
          const timeSlots = Array.isArray((ms as any).timeSlots)
            ? (ms as any).timeSlots as Array<{ startTime: string; endTime: string; label: string }>
            : null;

          const effectiveIndex = selectedSlotIndex !== null
            ? selectedSlotIndex
            : (tm.isJoined && bookedSlotIndices.length > 0 ? bookedSlotIndices[0] : null);
          const selSlot = (timeSlots && effectiveIndex !== null) ? timeSlots[effectiveIndex] : null;
          const triggerLabel = selSlot
            ? (tm.isJoined ? `Booked · ${selSlot.label}` : selSlot.label)
            : timeSlots && timeSlots.length > 0
              ? "Select Session Time"
              : ((ms as any).slotWindowLabel || format(new Date(tm.startTime), "MMM d, yyyy"));
          const hasSelection = selSlot !== null;

          return (
            <div className="space-y-3" style={{ animation: "sectionIn 0.6s cubic-bezier(0.22,1,0.36,1) both", animationDelay: "80ms" }}>
               <div className="flex items-center gap-2 mb-1">
                 <Clock className="w-4 h-4 text-zinc-400" />
                 <h3 className="font-heading text-lg font-bold text-white tracking-tight">Session Time</h3>
               </div>
              <button
                onClick={() => { setSlotDropOpen(true); dismissSlotHint(); }}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-card border shadow-sm active:scale-[0.98] transition-all"
                style={showSlotHint && !tm.isJoined ? {
                  borderColor: "rgba(139,92,246,0.6)",
                  boxShadow: "0 0 0 0 rgba(139,92,246,0.5)",
                  animation: "hintPulseRing 1.8s ease-out infinite",
                } : { borderColor: "hsl(var(--border))" }}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${hasSelection ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-white/5 border-white/10 text-zinc-400'}`}>
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-0.5">
                       {tm.isJoined ? "Your Schedule" : "Available Slot"}
                    </p>
                    <p className={`text-sm font-bold ${hasSelection ? 'text-white' : 'text-zinc-300'}`}>
                       {triggerLabel}
                    </p>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                </div>
              </button>

              {/* ── First-visit slot hint ── */}
              {showSlotHint && !tm.isJoined && (
                <div
                  className="relative mt-3"
                  style={{ animation: "fadeSlideUp 0.45s cubic-bezier(0.22,1,0.36,1) both" }}
                >
                  {/* Bouncing arrow pointing up */}
                  <div
                    className="absolute left-7"
                    style={{ top: "-14px", animation: "hintBounceArrow 1.2s ease-in-out infinite" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M7 1L7 13M7 1L2 6M7 1L12 6" stroke="rgba(139,92,246,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>

                  {/* Card with animated shimmer border */}
                  <div
                    className="rounded-2xl px-4 py-3.5 flex items-start gap-3 relative overflow-hidden"
                    style={{
                      background: "rgba(18,12,36,0.98)",
                      border: "1px solid rgba(139,92,246,0.35)",
                      boxShadow: "0 6px 32px rgba(139,92,246,0.18), inset 0 1px 0 rgba(255,255,255,0.05)",
                    }}
                  >
                    {/* Shimmer sweep */}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: "linear-gradient(105deg, transparent 40%, rgba(139,92,246,0.12) 50%, transparent 60%)",
                        backgroundSize: "200% 100%",
                        animation: "hintShimmer 2.4s linear infinite",
                      }}
                    />

                    {/* Pulsing icon */}
                    <div
                      className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 mt-0.5 relative"
                      style={{ animation: "hintIconPulse 2s ease-in-out infinite" }}
                    >
                      <div className="absolute inset-0 rounded-xl" style={{ background: "rgba(139,92,246,0.2)", animation: "hintIconRipple 2s ease-out infinite" }} />
                      <Clock className="w-4 h-4 text-primary relative z-10" />
                    </div>

                    <div className="flex-1 relative z-10">
                      <p className="text-[12px] font-bold text-white mb-0.5">Pick your session time</p>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">Tap the slot above to choose when you want to play. Each session is a separate match window — select one before joining.</p>
                    </div>
                    <button
                      onClick={dismissSlotHint}
                      className="text-zinc-600 active:text-zinc-300 transition-colors shrink-0 mt-0.5 text-[18px] leading-none relative z-10"
                    >×</button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── 6. Rewards & Entry ── */}
        <div className="space-y-3" style={{ animation: "sectionIn 0.6s cubic-bezier(0.22,1,0.36,1) both", animationDelay: "140ms" }}>
           <div className="flex items-center gap-2 mb-1">
             <Trophy className="w-4 h-4 text-zinc-400" />
             <h3 className="font-heading text-lg font-bold text-white tracking-tight">Rewards & Entry</h3>
           </div>
           
           <div className="grid grid-cols-2 gap-3">
              {/* Prize Pool */}
              <div className="bg-gradient-to-br from-amber-500/10 to-orange-600/5 rounded-2xl p-4 border border-amber-500/20 relative overflow-hidden group">
                 <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-[20px] -translate-y-1/2 translate-x-1/4 group-hover:bg-amber-500/20 transition-colors" />
                 <p className="text-[11px] font-bold text-amber-500/80 uppercase tracking-wider mb-1 relative z-10">Prize Pool</p>
                 <div className="flex items-end gap-1.5 relative z-10">
                    <span className="text-3xl font-black text-white tabular-nums leading-none tracking-tight">{tm.prizePoolDiamonds}</span>
                    <Gem className="w-5 h-5 text-amber-400 mb-0.5 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                 </div>
              </div>
              
              {/* Entry Fee */}
              <div className="bg-card rounded-2xl p-4 border border-border flex flex-col justify-center relative overflow-hidden">
                 <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Entry Fee</p>
                 <div className="flex items-end gap-1.5">
                    {tm.entryFeeDiamonds > 0 ? (
                      <>
                        <span className="text-2xl font-black text-white tabular-nums leading-none tracking-tight">{tm.entryFeeDiamonds}</span>
                        <Gem className="w-4 h-4 text-violet-400 mb-0.5" />
                      </>
                    ) : (
                      <span className="text-2xl font-black text-emerald-400 leading-none tracking-tight">FREE</span>
                    )}
                 </div>
              </div>
           </div>
           
           {/* Per Kill Bonus (Conditional) */}
           {tm.perKillDiamonds > 0 && (
             <div className="bg-gradient-to-r from-primary/10 to-transparent rounded-2xl p-3.5 border border-primary/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                     <Crosshair className="w-4 h-4 text-primary" />
                   </div>
                   <div>
                     <p className="text-sm font-bold text-white leading-tight">Per Kill Bonus</p>
                     <p className="text-[11px] text-zinc-400 mt-0.5">Extra diamonds for every elimination</p>
                   </div>
                </div>
                <div className="flex items-center gap-1 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
                   <span className="text-base font-black text-white tabular-nums">+{tm.perKillDiamonds}</span>
                   <Gem className="w-3.5 h-3.5 text-primary" />
                </div>
             </div>
           )}
        </div>

        {/* ── 13. Your 1v1 Match (only when matchmaking has a real match) ── */}
        {tm.isJoined && myMatch?.matchmaking && myMatch.match && (
          <div className="space-y-3" style={{ animation: "sectionIn 0.6s cubic-bezier(0.22,1,0.36,1) both", animationDelay: "200ms" }}>
             <div className="flex items-center gap-2 mb-1">
               <SwordsIcon className="w-4 h-4 text-amber-400" />
               <h3 className="font-heading text-lg font-bold text-white tracking-tight">Your Battle</h3>
             </div>
             
             {myMatch.match && myMatch.opponent ? (
               <div className="bg-gradient-to-b from-card to-background rounded-3xl border border-border shadow-xl overflow-hidden relative">
                  {/* Glowing battle background */}
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(var(--primary),0.15),transparent_50%)] pointer-events-none" />
                  
                  {/* Opponent Identity */}
                  <div className="p-6 pb-5 flex flex-col items-center text-center relative z-10">
                     <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3">Facing Against</p>
                     <div className="relative mb-3">
                        <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-primary/30 shadow-[0_0_20px_rgba(var(--primary),0.2)]">
                          <CachedImg 
                             src={resolveImageUrl(myMatch.opponent.profilePicture) || "/avatars/default.png"} 
                             alt={myMatch.opponent.inGameName}
                             className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-black border border-primary/40 text-[10px] font-black uppercase text-primary px-2.5 py-0.5 rounded-full shadow-lg">
                           Rival
                        </div>
                     </div>
                     <p className="text-xl font-black text-white mb-1 tracking-tight">{myMatch.opponent.inGameName}</p>
                     <p className="text-[11px] font-medium text-zinc-500 bg-white/5 px-2 py-0.5 rounded border border-white/5">UID: {myMatch.opponent.uid}</p>
                  </div>
                  
                  <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  
                  {/* Match Info */}
                  <div className="p-5 bg-black/20 grid grid-cols-2 gap-4 relative z-10">
                     <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> Battle Time</p>
                        <p className="text-sm font-bold text-white">{format(new Date(myMatch.match.scheduledAt), "h:mm a")}</p>
                     </div>
                     <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 flex items-center gap-1"><Lock className="w-3 h-3" /> Room Status</p>
                        {myMatch.match.isUnlocked ? (
                          <p className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                            <Unlock className="w-3.5 h-3.5" /> Unlocked
                          </p>
                        ) : (
                          <div className="text-sm font-bold text-amber-400 flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5" /> 
                            {matchUnlockCountdown ? fmt(matchUnlockCountdown.h, matchUnlockCountdown.m, matchUnlockCountdown.s) : "Soon"}
                          </div>
                        )}
                     </div>
                  </div>

                  {/* Credentials Reveal (if unlocked) */}
                  {myMatch.match.isUnlocked && (
                     <div className="p-5 pt-0 bg-black/20">
                       <div className="bg-black/60 rounded-xl p-4 border border-emerald-500/20 backdrop-blur-md">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-500 mb-3 text-center">Room Credentials</p>
                          <div className="space-y-2">
                             <div className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                               <span className="text-[12px] text-zinc-400">Room ID</span>
                               <div className="flex items-center gap-2">
                                  <span className="text-sm font-mono font-bold text-white">{myMatch.match.roomId || "Pending"}</span>
                                  {myMatch.match.roomId && (
                                     <button className="text-zinc-500 hover:text-white transition-colors" onClick={() => { navigator.clipboard.writeText(myMatch.match!.roomId!); toast({description:"Room ID Copied"}); }}>
                                       <Copy className="w-3.5 h-3.5" />
                                     </button>
                                  )}
                               </div>
                             </div>
                             <div className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                               <span className="text-[12px] text-zinc-400">Password</span>
                               <div className="flex items-center gap-2">
                                  <span className="text-sm font-mono font-bold text-white">{myMatch.match.roomPassword || "Pending"}</span>
                                  {myMatch.match.roomPassword && (
                                     <button className="text-zinc-500 hover:text-white transition-colors" onClick={() => { navigator.clipboard.writeText(myMatch.match!.roomPassword!); toast({description:"Password Copied"}); }}>
                                       <Copy className="w-3.5 h-3.5" />
                                     </button>
                                  )}
                               </div>
                             </div>
                          </div>
                       </div>
                     </div>
                  )}

                  {/* Admin Notes */}
                  {myMatch.match.notes && (
                     <div className="p-4 bg-amber-500/10 border-t border-amber-500/20 text-[12px] text-amber-200/90 text-center font-medium">
                       {myMatch.match.notes}
                     </div>
                  )}
               </div>
             ) : (
               <div className="bg-card rounded-2xl p-6 border border-border flex flex-col items-center justify-center text-center shadow-lg">
                  <FileSearch className="w-8 h-8 text-zinc-500 mb-3" />
                  <p className="text-sm font-bold text-zinc-300">Match data unavailable</p>
                  <p className="text-[12px] text-zinc-500 mt-1">Please refresh the page or contact support.</p>
               </div>
             )}
          </div>
        )}

        {/* ── 7. Match Details Grid ── */}
        <div className="space-y-3" style={{ animation: "sectionIn 0.6s cubic-bezier(0.22,1,0.36,1) both", animationDelay: "260ms" }}>
           <div className="flex items-center gap-2 mb-1">
             <Gamepad2 className="w-4 h-4 text-zinc-400" />
             <h3 className="font-heading text-lg font-bold text-white tracking-tight">Match Details</h3>
           </div>
           
           <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
             <div className="grid grid-cols-2 divide-x divide-y divide-border">
                <div className="p-3.5 flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Mode</span>
                  <span className="text-[13px] font-bold text-white">{tm.gameMode}</span>
                </div>
                <div className="p-3.5 flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Map</span>
                  <span className="text-[13px] font-bold text-white">{tm.mapName}</span>
                </div>
                <div className="p-3.5 flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Team Format</span>
                  <span className="text-[13px] font-bold text-white">{msTeamFormat}</span>
                </div>
                <div className="p-3.5 flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Min Level</span>
                  <span className="text-[13px] font-bold text-white">{msMinLevel}</span>
                </div>
                <div className="p-3.5 flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Rounds</span>
                  <span className="text-[13px] font-bold text-white">{msRounds}</span>
                </div>
                <div className="p-3.5 flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">HP / EP</span>
                  <span className="text-[13px] font-bold text-white">{msHp} / {msEp}</span>
                </div>
                <div className="p-3.5 flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Movement / Jump</span>
                  <span className="text-[13px] font-bold text-white">{msMovementSpeed} / {msJumpHeight}</span>
                </div>
                <div className="p-3.5 flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Ammo Limit</span>
                  <span className="text-[13px] font-bold text-white">{msAmmoLimit}</span>
                </div>
                <div className="p-3.5 flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Gun Attributes</span>
                  <span className="text-[13px] font-bold text-white">{msGunAttr}</span>
                </div>
                <div className="p-3.5 flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Weapon Skins</span>
                  <span className="text-[13px] font-bold text-white">{msWeaponSkins}</span>
                </div>
                <div className="p-3.5 flex flex-col gap-1 col-span-2">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Only Headshot / Emulators</span>
                  <span className="text-[13px] font-bold text-white">{msOnlyHeadshot} / {msEmulators}</span>
                </div>
             </div>
           </div>
        </div>

        {/* ── 8. Complaint Policy ── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(45,28,0,0.55)", border: "1px solid rgba(251,191,36,0.2)", animation: "sectionIn 0.6s cubic-bezier(0.22,1,0.36,1) both", animationDelay: "320ms" }}>
          <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "rgba(251,191,36,0.12)" }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(251,191,36,0.12)" }}>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <p className="text-[12px] font-black uppercase tracking-widest text-amber-400">1-Hour Complaint Window</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[12px] text-amber-100/60 leading-relaxed">
              Raised a dispute? Make sure it's within <span className="text-amber-300 font-semibold">1 hour</span> of the match result being announced. Anything after that window won't be entertained — no exceptions.
            </p>
          </div>
        </div>

        {/* ── 12. Match Rules ── */}
        <div className="space-y-3" style={{ animation: "sectionIn 0.6s cubic-bezier(0.22,1,0.36,1) both", animationDelay: "380ms" }}>
           <div className="flex items-center gap-2">
             <ShieldAlert className="w-4 h-4 text-zinc-400" />
             <h3 className="font-heading text-lg font-bold text-white tracking-tight">Match Rules</h3>
           </div>
           <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
             {(t.rules
               ? (t.rules as string).split("\n").filter(Boolean)
               : ["No emulators allowed", "No PC players allowed", "No teaming", "Proof required on dispute"]
             ).map((rule: string, i: number, arr: string[]) => {
               const r = rule.toLowerCase();
               let Icon = Check;
               let iconColor = "text-zinc-500";
               if (r.includes("emulat") || r.includes("pc") || r.includes("computer")) { Icon = Monitor; iconColor = "text-red-400/70"; }
               else if (r.includes("hack") || r.includes("script") || r.includes("cheat") || r.includes("mod")) { Icon = ShieldAlert; iconColor = "text-red-400/70"; }
               else if (r.includes("team") || r.includes("squad")) { Icon = Ban; iconColor = "text-orange-400/70"; }
               else if (r.includes("proof") || r.includes("video") || r.includes("record")) { Icon = Video; iconColor = "text-blue-400/70"; }
               else if (r.includes("account") || r.includes("register") || r.includes("uid")) { Icon = BadgeCheck; iconColor = "text-primary/70"; }
               else if (r.includes("respect") || r.includes("admin") || r.includes("decision")) { Icon = ShieldCheck; iconColor = "text-emerald-400/70"; }
               else if (r.includes("weapon") || r.includes("gun") || r.includes("ammo")) { Icon = Crosshair; iconColor = "text-zinc-400"; }
               else if (r.includes("join") || r.includes("slot") || r.includes("promptly") || r.includes("time")) { Icon = Clock; iconColor = "text-amber-400/70"; }
               else if (r.includes("fair") || r.includes("safe") || r.includes("secure")) { Icon = ShieldCheck; iconColor = "text-emerald-400/70"; }
               return (
                 <div
                   key={i}
                   className="flex items-center gap-3 px-4 py-3.5"
                   style={{
                     background: i % 2 === 0 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.12)",
                     borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                   }}
                 >
                   <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconColor}`} style={{ background: "rgba(255,255,255,0.04)" }}>
                     <Icon className="w-4 h-4" />
                   </div>
                   <span className="text-[13px] font-medium text-zinc-300 leading-snug">{rule}</span>
                 </div>
               );
             })}
           </div>
        </div>

        {/* ── 9. Trust & Security ── */}
        <div className="grid grid-cols-2 gap-3" style={{ animation: "sectionIn 0.6s cubic-bezier(0.22,1,0.36,1) both", animationDelay: "440ms" }}>
           <div className="bg-card rounded-2xl p-4 border border-border flex flex-col items-center text-center">
             <ShieldCheck className="w-6 h-6 text-emerald-400 mb-2" />
             <p className="text-[12px] font-bold text-white leading-tight">Anti-Cheat Monitored</p>
             <p className="text-[10px] text-zinc-500 mt-1">Strict bans applied</p>
           </div>
           <div className="bg-card rounded-2xl p-4 border border-border flex flex-col items-center text-center">
             <Zap className="w-6 h-6 text-amber-400 mb-2" />
             <p className="text-[12px] font-bold text-white leading-tight">Fast Rewards</p>
             <p className="text-[10px] text-zinc-500 mt-1">Directly to wallet</p>
           </div>
           <div className="bg-card rounded-2xl p-4 border border-border flex flex-col items-center text-center">
             <BadgeCheck className="w-6 h-6 text-blue-400 mb-2" />
             <p className="text-[12px] font-bold text-white leading-tight">Verified Match</p>
             <p className="text-[10px] text-zinc-500 mt-1">Fair play guaranteed</p>
           </div>
           <div className="bg-card rounded-2xl p-4 border border-border flex flex-col items-center text-center">
             <Bot className="w-6 h-6 text-primary mb-2" />
             <p className="text-[12px] font-bold text-white leading-tight">Auto-Moderated</p>
             <p className="text-[10px] text-zinc-500 mt-1">Smart dispute system</p>
           </div>
        </div>

        {/* ── 10. Zero Tolerance Policy ── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(25,4,4,0.7)", border: "1px solid rgba(239,68,68,0.18)", animation: "sectionIn 0.6s cubic-bezier(0.22,1,0.36,1) both", animationDelay: "500ms" }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: "rgba(239,68,68,0.1)" }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(239,68,68,0.12)" }}>
              <ShieldAlert className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <p className="text-[13px] font-black text-red-400 leading-tight">Zero Tolerance Policy</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">Hacking · Cheating · Unfair Play</p>
            </div>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Intro */}
            <p className="text-[12px] text-zinc-400 leading-relaxed">
              If you think your opponent was hacking or cheating, use Free Fire's built-in recording feature to save the match video and send it to us. Make sure the player's name and UID are visible in the footage.
            </p>

            {/* Three outcome rows */}
            <div className="space-y-2.5">

              <div className="flex items-start gap-3 rounded-xl px-3.5 py-3" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.14)" }}>
                <span className="text-red-400 text-[15px] leading-none mt-0.5 shrink-0">✕</span>
                <p className="text-[12px] text-zinc-400 leading-relaxed">
                  <span className="text-red-300 font-semibold">Wrong report?</span> Your trust score takes a hit and repeated false reports can get your account suspended or flagged for rule violations.
                </p>
              </div>

              <div className="flex items-start gap-3 rounded-xl px-3.5 py-3" style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.14)" }}>
                <span className="text-emerald-400 text-[15px] leading-none mt-0.5 shrink-0">✓</span>
                <p className="text-[12px] text-zinc-400 leading-relaxed">
                  <span className="text-emerald-300 font-semibold">Confirmed cheat?</span> You get a full refund plus a reward — straight to your wallet once our team verifies the proof.
                </p>
              </div>

              <div className="flex items-start gap-3 rounded-xl px-3.5 py-3" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.14)" }}>
                <span className="text-amber-400 text-[15px] leading-none mt-0.5 shrink-0">?</span>
                <p className="text-[12px] text-zinc-400 leading-relaxed">
                  <span className="text-amber-300 font-semibold">Not 100% sure?</span> Just report the suspicious activity and let us look into it. If we find something, you still get refunded and rewarded — though it may take a little longer to process.
                </p>
              </div>

            </div>
          </div>
        </div>

        {/* ── 11. After Joining Steps (Non-joined Upcoming only) ── */}
        {!tm.isJoined && isUpcoming && (
          <div className="bg-card rounded-2xl border border-border p-5 pb-6" style={{ animation: "sectionIn 0.6s cubic-bezier(0.22,1,0.36,1) both", animationDelay: "560ms" }}>
             <h3 className="font-heading text-lg font-bold text-white mb-5 tracking-tight">What Happens Next?</h3>
             
             <div className="relative space-y-6 before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-primary/50 before:to-transparent">
                <div className="relative flex items-start">
                   <div className="absolute left-0 flex items-center justify-center w-6 h-6 bg-background rounded-full border-2 border-primary/50 z-10 text-[10px] font-bold text-primary">1</div>
                   <div className="pl-10">
                      <p className="text-sm font-bold text-white mb-0.5">Secure Your Slot</p>
                      <p className="text-[11px] text-zinc-400">Pay the entry fee and confirm your session time.</p>
                   </div>
                </div>
                <div className="relative flex items-start">
                   <div className="absolute left-0 flex items-center justify-center w-6 h-6 bg-background rounded-full border-2 border-primary/50 z-10 text-[10px] font-bold text-primary">2</div>
                   <div className="pl-10">
                      <p className="text-sm font-bold text-white mb-0.5">Wait for Room Details</p>
                      <p className="text-[11px] text-zinc-400">Room ID & Password will be released here 5-10 mins before match.</p>
                   </div>
                </div>
                <div className="relative flex items-start">
                   <div className="absolute left-0 flex items-center justify-center w-6 h-6 bg-background rounded-full border-2 border-primary/50 z-10 text-[10px] font-bold text-primary">3</div>
                   <div className="pl-10">
                      <p className="text-sm font-bold text-white mb-0.5">Join Custom Room</p>
                      <p className="text-[11px] text-zinc-400">Open Free Fire Max and join the custom room using the credentials.</p>
                   </div>
                </div>
                <div className="relative flex items-start">
                   <div className="absolute left-0 flex items-center justify-center w-6 h-6 bg-background rounded-full border-2 border-primary/50 z-10 text-[10px] font-bold text-primary">4</div>
                   <div className="pl-10">
                      <p className="text-sm font-bold text-white mb-0.5">Dominate & Earn</p>
                      <p className="text-[11px] text-zinc-400">Win the match and get diamonds credited directly to your wallet.</p>
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>

      {/* ── 14. Fixed Bottom Action Bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 backdrop-blur-xl border-t border-white/8 p-4 pb-safe-offset-4" style={{ background: "rgba(8,5,16,0.96)", boxShadow: "0 -12px 40px rgba(0,0,0,0.6)" }}>
        <div className="max-w-md mx-auto flex items-center gap-3">

          <div className="flex flex-col items-center justify-center rounded-2xl px-4 py-2.5 shrink-0" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
            <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-500 mb-1">Entry</span>
            <div className="flex items-center gap-1">
               {tm.entryFeeDiamonds > 0 ? (
                 <>
                   <span className="text-[17px] font-black text-white leading-none tabular-nums">{tm.entryFeeDiamonds}</span>
                   <Gem className="w-3.5 h-3.5 text-violet-400" />
                 </>
               ) : (
                 <span className="text-[17px] font-black text-emerald-400 leading-none">FREE</span>
               )}
            </div>
          </div>

          <div className="flex-1 flex justify-end">
            {tm.isJoined && (bookedSlotIndices.length === 0 || bookedSlotIndices.includes(selectedSlotIndex ?? -1)) ? (
              <Button
                className="w-full h-14 rounded-2xl font-extrabold text-[15px] flex items-center justify-center gap-2 transition-all active:scale-95"
                style={{ background: "linear-gradient(135deg,#166534,#14532d)", boxShadow: "0 0 10px rgba(22,101,52,0.3)" }}
                onClick={() => {
                  const idx = bookedSlotIndices.length > 0 ? (selectedSlotIndex ?? bookedSlotIndices[0]) : undefined;
                  const qs = idx !== undefined ? `?slotIndex=${idx}` : "";
                  navigate(`/history/matches/${tm.matchSlug || tm.id}${qs}`);
                }}
                data-testid="button-joined"
              >
                <Swords className="w-4 h-4" /> View in My Matches
              </Button>
            ) : tm.isJoined && !bookedSlotIndices.includes(selectedSlotIndex ?? -1) ? (
              <Button className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-[15px] shadow-[0_0_20px_hsl(var(--primary)/0.4)]" onClick={() => { setRulesAccepted(false); setShowJoinDialog(true); }} data-testid="button-join">Join Now</Button>
            ) : !isUpcoming ? (
              <Button disabled className="w-full h-14 rounded-2xl bg-white/5 text-zinc-500 font-bold border border-white/5">
                Tournament Ended
              </Button>
            ) : isCutoffPassed ? (
              <Button disabled className="w-full h-14 rounded-2xl bg-white/5 text-zinc-500 font-bold border border-white/5">
                Registration Closed
              </Button>
            ) : isFull ? (
              <Button 
                onClick={() => setShowShiftDialog(true)}
                className="w-full h-14 rounded-2xl bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold shadow-[0_0_20px_rgba(245,158,11,0.3)]"
              >
                Slot Full — Find Next
              </Button>
            ) : (
              <Button 
                onClick={() => setShowJoinDialog(true)}
                className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-[15px] shadow-[0_0_20px_rgba(var(--primary),0.4)]"
              >
                Join Tournament
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── 15. Bottom Sheets / Dialogs ── */}
      
      {/* ── Join Confirm Dialog ── */}
      {showJoinDialog && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" 
            onClick={() => setShowJoinDialog(false)} 
          />
          
          {/* Sheet Content */}
          <div className="relative w-full rounded-t-[32px] overflow-hidden bg-card border-t border-border shadow-[0_-20px_60px_rgba(0,0,0,0.8)]" style={{ animation: "slideUp 0.3s cubic-bezier(0.32,0.72,0,1)" }}>
             <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />
             
             <div className="flex justify-center pt-3 pb-1">
               <div className="w-12 h-1.5 rounded-full bg-white/10" />
             </div>
             
             <div className="px-6 pt-4 pb-8 relative z-10">
                <div className="flex items-start justify-between mb-6">
                   <div>
                     <p className="text-[11px] font-bold text-primary uppercase tracking-widest mb-1">Confirmation</p>
                     <h2 className="font-heading text-2xl font-black text-white leading-tight">Enter Arena</h2>
                     <p className="text-[13px] text-zinc-400 mt-1 max-w-[250px] line-clamp-1">{tm.title}</p>
                   </div>
                   <button onClick={() => setShowJoinDialog(false)} className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 text-zinc-400 hover:text-white transition-colors">
                     ✕
                   </button>
                </div>

                <div className="bg-background rounded-2xl p-4 flex items-center justify-between mb-4 border border-border shadow-inner">
                   <div>
                     <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-0.5">Total Entry Fee</p>
                     <p className="text-[11px] text-zinc-400">Deducted from wallet balance</p>
                   </div>
                   <div className="flex items-end gap-1.5">
                     {tm.entryFeeDiamonds > 0 ? (
                       <>
                         <span className="text-2xl font-black text-white tabular-nums leading-none tracking-tight">{tm.entryFeeDiamonds}</span>
                         <Gem className="w-5 h-5 text-violet-400 mb-0.5 drop-shadow-[0_0_8px_rgba(167,139,250,0.4)]" />
                       </>
                     ) : (
                       <span className="text-2xl font-black text-emerald-400 leading-none">FREE</span>
                     )}
                   </div>
                </div>

                {user && tm.entryFeeDiamonds > user.diamondBalance && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex gap-3 mb-4">
                     <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                     <p className="text-[12px] text-red-200/90 leading-snug">Insufficient diamonds. Please top up your wallet to join this tournament.</p>
                  </div>
                )}

                <label className={`flex items-start gap-3 p-4 rounded-2xl mb-6 cursor-pointer transition-all border ${rulesAccepted ? 'bg-primary/10 border-primary/30' : 'bg-white/5 border-white/5'}`}>
                   <div className="shrink-0 mt-0.5">
                     <input type="checkbox" className="sr-only" checked={rulesAccepted} onChange={e => setRulesAccepted(e.target.checked)} />
                     <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${rulesAccepted ? 'bg-primary border-primary' : 'border-white/20'}`}>
                        {rulesAccepted && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                     </div>
                   </div>
                   <span className="text-[12px] text-zinc-300 leading-relaxed flex-1">
                     I confirm I have read and agree to all <strong className="text-white">match rules, settings & policies</strong> for this tournament.
                   </span>
                </label>

                <div className="flex gap-3">
                   <Button variant="outline" className="flex-1 h-14 rounded-2xl border-white/10 bg-transparent text-zinc-400 font-bold" onClick={() => setShowJoinDialog(false)}>
                     Cancel
                   </Button>
                   <Button 
                     className={`flex-[2] h-14 rounded-2xl font-black text-[15px] shadow-[0_0_20px_rgba(var(--primary),0.4)] transition-all ${!rulesAccepted || (user && tm.entryFeeDiamonds > user.diamondBalance) ? 'opacity-50 grayscale' : ''}`}
                     disabled={!rulesAccepted || joinTournament.isPending || (user ? tm.entryFeeDiamonds > user.diamondBalance : false)}
                     onClick={handleJoin}
                     data-testid="button-confirm-join"
                   >
                     {joinTournament.isPending ? "Processing..." : "Confirm Entry"}
                   </Button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* ── Auto-shift Dialog ── */}
      {showShiftDialog && nextAvailableTournament && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={() => setShowShiftDialog(false)} />
          <div className="relative w-full rounded-t-[32px] overflow-hidden bg-card border-t border-border shadow-[0_-20px_60px_rgba(0,0,0,0.8)]" style={{ animation: "slideUp 0.3s cubic-bezier(0.32,0.72,0,1)" }}>
             <div className="flex justify-center pt-3 pb-1">
               <div className="w-12 h-1.5 rounded-full bg-white/10" />
             </div>
             <div className="px-6 pt-4 pb-8 relative z-10">
                <div className="flex items-start justify-between mb-6">
                   <div>
                     <p className="text-[11px] font-bold text-amber-500 uppercase tracking-widest mb-1">Slot Unavailable</p>
                     <h2 className="font-heading text-2xl font-black text-white leading-tight">Missed Cutoff</h2>
                     <p className="text-[13px] text-zinc-400 mt-1 max-w-[280px]">
                        Registration closed for the {format(new Date(tm.startTime), "h:mm a")} match. Check out the next available slot.
                     </p>
                   </div>
                   <button onClick={() => setShowShiftDialog(false)} className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 text-zinc-400 hover:text-white transition-colors">
                     ✕
                   </button>
                </div>

                <div className="bg-amber-950/20 rounded-2xl p-5 border border-amber-500/20 mb-6">
                   <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-2">Next Available Match</p>
                   <p className="text-base font-extrabold text-white mb-2 leading-tight">{(nextAvailableTournament as any).title}</p>
                   <div className="flex items-center gap-2 mb-3">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span className="text-[13px] font-bold text-amber-100">
                        {format(new Date((nextAvailableTournament as any).startTime), "EEEE, MMM d — h:mm a")}
                      </span>
                   </div>
                   <div className="flex items-center gap-4 pt-3 border-t border-amber-500/10">
                      <div className="flex items-center gap-1.5 text-[12px] text-zinc-400">
                         <Users className="w-3.5 h-3.5" /> {(nextAvailableTournament as any).filledSlots}/{(nextAvailableTournament as any).maxSlots} Filled
                      </div>
                      <div className="w-px h-3 bg-white/10" />
                      <div className="flex items-center gap-1 text-[12px] font-bold text-white">
                         {(nextAvailableTournament as any).entryFeeDiamonds > 0 ? (
                            <><Gem className="w-3.5 h-3.5 text-violet-400" /> {(nextAvailableTournament as any).entryFeeDiamonds} Entry</>
                         ) : (
                            <span className="text-emerald-400">FREE ENTRY</span>
                         )}
                      </div>
                   </div>
                </div>

                <div className="flex gap-3">
                   <Button variant="outline" className="flex-1 h-14 rounded-2xl border-white/10 bg-transparent text-zinc-400 font-bold" onClick={() => setShowShiftDialog(false)}>
                     Dismiss
                   </Button>
                   <Button 
                     className="flex-[2] h-14 rounded-2xl bg-amber-500 hover:bg-amber-600 text-amber-950 font-black text-[15px] shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                     onClick={() => {
                       setShowShiftDialog(false);
                       const next = nextAvailableTournament as any;
                       navigate(next.matchSlug ? `/matches/${next.matchSlug}` : `/matches/${next.id}`);
                     }}
                   >
                     View Next Match
                   </Button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* ── Slot Picker Bottom Sheet ── */}
      {slotDropOpen && (() => {
        const sheetTimeSlots = Array.isArray((ms as any).timeSlots)
          ? (ms as any).timeSlots as Array<{ startTime: string; endTime: string; label: string }>
          : null;

        const dateLabel = format(new Date(tm.startTime), "EEE, MMM d");

        return (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity" onClick={() => setSlotDropOpen(false)} />
            <div className="relative w-full max-h-[80vh] rounded-t-[32px] overflow-hidden bg-card border-t border-border shadow-[0_-20px_60px_rgba(0,0,0,0.8)] flex flex-col" style={{ animation: "slideUp 0.3s cubic-bezier(0.32,0.72,0,1)" }}>
              <div className="flex justify-center pt-3 pb-2 shrink-0">
                <div className="w-12 h-1.5 rounded-full bg-white/10" />
              </div>

              <div className="px-6 pt-2 pb-4 flex items-center justify-between shrink-0 border-b border-white/5">
                <div>
                  <p className="text-[11px] font-bold text-primary uppercase tracking-widest mb-1">Pick a Slot</p>
                  <h2 className="font-heading text-xl font-black text-white leading-tight">Session Time</h2>
                </div>
                <div className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
                   <p className="text-[12px] font-bold text-zinc-300">{dateLabel}</p>
                </div>
              </div>

              <div className="overflow-y-auto p-4 space-y-2 pb-8">
                {(!sheetTimeSlots || sheetTimeSlots.length === 0) ? (
                  <div className="py-12 flex flex-col items-center text-center">
                    <Clock className="w-10 h-10 text-zinc-600 mb-3" />
                    <p className="text-sm font-bold text-zinc-300">No session times available</p>
                    <p className="text-[12px] text-zinc-500 mt-1">Please contact admin to set up slots.</p>
                  </div>
                ) : sheetTimeSlots.map((slot, i) => {
                  const slotPast    = nowMs > new Date(slot.startTime).getTime();
                  const isSelected  = selectedSlotIndex === i;
                  const isLocked    = !!tm.isJoined;
                  const isBookedSlot = isLocked && bookedSlotIndices.includes(i);
                  const isPlayed    = isBookedSlot && slotPast;
                  const isDisabled  = isBookedSlot || (slotPast && !isSelected);

                  let statusVisuals = {
                     border: "border-white/5",
                     bg: "bg-background",
                     text: "text-zinc-300",
                     subtext: "text-zinc-500",
                     indicator: "border-white/20",
                     icon: null as React.ReactNode,
                     badge: null as React.ReactNode
                  };

                  if (isPlayed) {
                     statusVisuals = {
                        border: "border-emerald-500/20", bg: "bg-emerald-500/5", text: "text-emerald-400", subtext: "text-emerald-500/60",
                        indicator: "border-emerald-500 bg-emerald-500", icon: <Check className="w-3 h-3 text-white" />,
                        badge: <div className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded uppercase tracking-wider">Played</div>
                     };
                  } else if (isBookedSlot) {
                     statusVisuals = {
                        border: "border-emerald-500/30", bg: "bg-emerald-500/10", text: "text-emerald-400", subtext: "text-emerald-400/80",
                        indicator: "border-emerald-500 bg-emerald-500", icon: <Check className="w-3 h-3 text-white" />,
                        badge: <div className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded uppercase tracking-wider">Your Slot</div>
                     };
                  } else if (isSelected) {
                     statusVisuals = {
                        border: "border-primary/40 shadow-[0_0_15px_rgba(var(--primary),0.15)]", bg: "bg-primary/10", text: "text-primary-foreground font-black", subtext: "text-primary/80",
                        indicator: "border-primary bg-primary", icon: <Check className="w-3 h-3 text-white" />,
                        badge: null
                     };
                  } else if (slotPast) {
                     statusVisuals = {
                        border: "border-transparent", bg: "bg-transparent opacity-40", text: "text-zinc-500", subtext: "text-zinc-600",
                        indicator: "border-white/10", icon: null,
                        badge: <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Closed</div>
                     };
                  }

                  return (
                    <button
                      key={i}
                      disabled={isDisabled}
                      onClick={() => {
                        if (isDisabled) return;
                        const next = isSelected ? null : i;
                        setSelectedSlotIndex(next);
                        if (resolvedTournament?.id) {
                          if (next === null) localStorage.removeItem(`czsl_${resolvedTournament.id}`);
                          else localStorage.setItem(`czsl_${resolvedTournament.id}`, String(next));
                        }
                        // Auto close on select if not locked
                        if (!isLocked && next !== null) {
                           setTimeout(() => setSlotDropOpen(false), 200);
                        }
                      }}
                      className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${statusVisuals.bg} ${statusVisuals.border} ${!isDisabled ? 'active:scale-[0.98]' : ''}`}
                    >
                      <div className="flex items-center gap-4">
                         <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${statusVisuals.indicator}`}>
                            {statusVisuals.icon}
                         </div>
                         <div className="text-left">
                            <p className={`text-sm ${statusVisuals.text}`}>{slot.label}</p>
                            {!isPlayed && !isBookedSlot && !slotPast && <p className={`text-[11px] mt-0.5 ${statusVisuals.subtext}`}>Available to join</p>}
                            {(isPlayed || isBookedSlot) && <p className={`text-[11px] mt-0.5 ${statusVisuals.subtext}`}>Registered session</p>}
                         </div>
                      </div>
                      {statusVisuals.badge}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        @keyframes sectionIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes hintPulseRing {
          0%   { box-shadow: 0 0 0 0 rgba(139,92,246,0.55); border-color: rgba(139,92,246,0.7); }
          60%  { box-shadow: 0 0 0 8px rgba(139,92,246,0); border-color: rgba(139,92,246,0.4); }
          100% { box-shadow: 0 0 0 0 rgba(139,92,246,0); border-color: rgba(139,92,246,0.7); }
        }
        @keyframes hintBounceArrow {
          0%, 100% { transform: translateY(0); opacity: 1; }
          50%       { transform: translateY(-5px); opacity: 0.6; }
        }
        @keyframes hintShimmer {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes hintIconPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.75; transform: scale(0.92); }
        }
        @keyframes hintIconRipple {
          0%   { transform: scale(1); opacity: 0.4; }
          70%  { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
    </div>
  );
}