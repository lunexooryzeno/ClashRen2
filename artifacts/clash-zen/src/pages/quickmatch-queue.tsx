import { useParams, useLocation } from "wouter";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  ArrowLeft, Users, Clock, Copy, Check, Shield, Crosshair,
  Heart, Scissors, Target, Map as MapIcon, X, Swords,
  CheckCircle2, Zap, RotateCcw, Cpu, KeyRound, ExternalLink, Trophy,
} from "lucide-react";
import { CoinIcon } from "@/components/CoinIcon";
import { apiFetch, apiPost } from "@/lib/api";

type GameType = "cs" | "br";

const MODE_META: Record<string, {
  name: string;
  format: string;
  accent: string;
  Icon: React.ElementType;
  mapName: string;
  maxPlayers: number;
}> = {
  duel:           { name: "1v1 Duel",       format: "1v1",  accent: "#ef4444", Icon: Crosshair, mapName: "Bermuda Duel Zone",  maxPlayers: 2  },
  healing:        { name: "Healing Battle",  format: "1v1",  accent: "#ec4899", Icon: Heart,     mapName: "Purgatory Arena",    maxPlayers: 2  },
  "clash-squad":  { name: "Clash Squad",     format: "4v4",  accent: "#f97316", Icon: Shield,    mapName: "Bermuda Clash Zone", maxPlayers: 8  },
  knife:          { name: "Knife Fight",     format: "1v1",  accent: "#a78bfa", Icon: Scissors,  mapName: "Kalahari Pit",       maxPlayers: 2  },
  "solo-drop":    { name: "Solo Drop",       format: "Solo", accent: "#3b82f6", Icon: Target,    mapName: "Bermuda Classic",    maxPlayers: 12 },
  "duo-rush":     { name: "Duo Rush",        format: "2v2",  accent: "#06b6d4", Icon: Users,     mapName: "Purgatory Rush",     maxPlayers: 4  },
  "squad-wipe":   { name: "Squad Wipe",      format: "4v4",  accent: "#8b5cf6", Icon: Swords,    mapName: "Kalahari Showdown",  maxPlayers: 8  },
  "zone-control": { name: "Zone Control",    format: "Solo", accent: "#22c55e", Icon: MapIcon,   mapName: "Alpine Zone",        maxPlayers: 10 },
};

const TYPE_LABEL: Record<GameType, string> = { cs: "Classic Survival", br: "Battle Royale" };

function pad(n: number) { return String(n).padStart(2, "0"); }
function formatTime(s: number) { return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; }

interface MatchInfo {
  roomId: string;
  password: string;
  mapName: string;
  format: string;
  maxPlayers: number;
  openInFfUrl: string | null;
  credentialsReadyAt: string | null;
}
interface PlayerInfo {
  userId: string;
  inGameName: string;
  profilePicture?: string | null;
  uid?: string | null;
}
interface QueueStats {
  cs: { total: number; modes: Record<string, number> };
  br: { total: number; modes: Record<string, number> };
}
type RoomStatus = "opponent_found" | "creating_room" | "booting_game" | "waiting_credentials" | "ready";
type Phase = "searching" | "preparing" | "found" | "joined" | "cancelled";

const STATUS_MESSAGES = [
  "Searching for opponent…",
  "Scanning active players…",
  "Matching skill levels…",
  "Almost there…",
];

const ROOM_STEPS: { key: RoomStatus | "ready"; label: string; Icon: React.ElementType }[] = [
  { key: "opponent_found",      label: "Opponent Found",          Icon: Zap        },
  { key: "creating_room",       label: "Creating Room",           Icon: RotateCcw  },
  { key: "booting_game",        label: "Booting Game",            Icon: Cpu        },
  { key: "waiting_credentials", label: "Waiting for Credentials", Icon: KeyRound   },
  { key: "ready",               label: "Room Ready!",             Icon: CheckCircle2 },
];

const STEP_ORDER: RoomStatus[] = [
  "opponent_found", "creating_room", "booting_game", "waiting_credentials", "ready",
];

let JOIN_WINDOW_SECONDS = 30; // overridden by /api/settings/public on mount

function stepIndex(s: RoomStatus | null) {
  if (!s) return -1;
  const i = STEP_ORDER.indexOf(s);
  return i === -1 ? 0 : i;
}

function Avatar({ src, name, size = 64, accent }: { src?: string | null; name: string; size?: number; accent: string }) {
  const initials = name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div
      className="rounded-full flex items-center justify-center overflow-hidden shrink-0"
      style={{ width: size, height: size, background: src ? "transparent" : `${accent}22`, border: `2px solid ${accent}55`, boxShadow: `0 0 24px ${accent}35` }}
    >
      {src
        ? <img src={src} alt={name} className="w-full h-full object-cover" />
        : <span className="font-black" style={{ fontSize: size * 0.32, color: accent }}>{initials}</span>
      }
    </div>
  );
}

export default function QuickMatchQueue() {
  const params = useParams<{ type: string; mode: string }>();
  const [, navigate] = useLocation();

  const typeKey  = (params.type ?? "cs") as GameType;
  const modeId   = params.mode ?? "duel";
  const meta     = MODE_META[modeId] ?? MODE_META["duel"];
  const accent   = meta.accent;
  const glow     = `${accent}40`;

  const [phase, setPhase]               = useState<Phase>("searching");
  const [elapsed, setElapsed]           = useState(0);
  const [queueCount, setQueueCount]     = useState<number | null>(null);
  const [matchInfo, setMatchInfo]       = useState<MatchInfo | null>(null);
  const [copied, setCopied]             = useState<"room" | "pass" | null>(null);
  const [visible, setVisible]           = useState(false);
  const [statusIdx, setStatusIdx]       = useState(0);
  const [joining, setJoining]           = useState(false);
  const [mePlayer, setMePlayer]         = useState<PlayerInfo | null>(null);
  const [opponent, setOpponent]         = useState<PlayerInfo | null>(null);
  const [roomStatus, setRoomStatus]     = useState<RoomStatus | null>(null);
  const [matchId, setMatchId]           = useState<string | null>(null);
  const [matchCreatedAt, setMatchCreatedAt] = useState<string | null>(null);
  const [joinWindowSecs, setJoinWindowSecs] = useState<number | null>(null);
  const [entryFee, setEntryFee]         = useState(0);
  const [prizeAmount, setPrizeAmount]   = useState(0);
  const [cancelReason, setCancelReason] = useState<string | null>(null);

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [checkingEnd, setCheckingEnd]           = useState(false);
  const [stillInMatch, setStillInMatch]         = useState(false);

  interface PreSnap {
    gamesPlayed: number; wins: number; kills: number;
    damage: number; deaths: number; assists: number; fetchedAt: string;
  }
  const [preSnap, setPreSnap]       = useState<PreSnap | null>(null);
  const [snapLoading, setSnapLoading] = useState(false);
  const [snapFailed, setSnapFailed]   = useState(false);
  const snapRetriesRef = useRef(0);

  const leftRef       = useRef(false);
  const pollIdRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const windowIdRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef        = useRef<EventSource | null>(null);
  const navAllowedRef = useRef(false);
  const pendingNavRef = useRef<(() => void) | null>(null);

  const stopPolling    = useCallback(() => { if (pollIdRef.current) { clearInterval(pollIdRef.current); pollIdRef.current = null; } }, []);
  const stopJoinWindow = useCallback(() => { if (windowIdRef.current) { clearInterval(windowIdRef.current); windowIdRef.current = null; } }, []);
  const closeSse       = useCallback(() => { if (sseRef.current) { sseRef.current.close(); sseRef.current = null; } }, []);

  useEffect(() => {
    fetch("/api/settings/public")
      .then(r => r.ok ? r.json() : null)
      .then((d: { joinWindowSeconds?: number } | null) => { if (d?.joinWindowSeconds) JOIN_WINDOW_SECONDS = d.joinWindowSeconds; })
      .catch(() => {});
  }, []);

  const safeNavigate = useCallback((url: string) => {
    navAllowedRef.current = true;
    navigate(url);
  }, [navigate]);

  const startJoinWindow = useCallback((credentialsReadyAt: string | null) => {
    const start = credentialsReadyAt ? new Date(credentialsReadyAt).getTime() : Date.now();
    const update = () => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const remaining = Math.max(0, JOIN_WINDOW_SECONDS - elapsed);
      setJoinWindowSecs(remaining);
      if (remaining === 0) stopJoinWindow();
    };
    update();
    windowIdRef.current = setInterval(update, 500);
  }, [stopJoinWindow]);

  const leaveQueue = useCallback(async () => {
    if (leftRef.current) return;
    leftRef.current = true;
    stopPolling();
    try { await apiPost("/quickmatch/search/leave", { gameType: typeKey, modeId }); } catch { /* best effort */ }
  }, [typeKey, modeId, stopPolling]);

  const dismissActiveMatch = useCallback(async (id: string) => {
    try { await apiPost("/quickmatch/match/dismiss", { matchId: id }); } catch { /* best effort */ }
  }, []);

  const trackAction = useCallback(async (action: string) => {
    try { await apiPost("/quickmatch/match/action", { action, matchId }); } catch { /* best effort */ }
  }, [matchId]);

  useEffect(() => { const t = setTimeout(() => setVisible(true), 60); return () => clearTimeout(t); }, []);

  useEffect(() => {
    if (phase !== "searching") return;
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "searching") return;
    const id = setInterval(() => setStatusIdx(i => (i + 1) % STATUS_MESSAGES.length), 3500);
    return () => clearInterval(id);
  }, [phase]);

  // Local step computation — replicates server getRoomStatus() every 1s so the
  // "Preparing Room" steps animate without needing a server round-trip.
  useEffect(() => {
    if (phase !== "preparing" || !matchCreatedAt) return;
    const THRESHOLDS: [number, RoomStatus][] = [
      [4000,  "opponent_found"],
      [12000, "creating_room"],
      [22000, "booting_game"],
    ];
    const computeStep = (): RoomStatus => {
      const age = Date.now() - new Date(matchCreatedAt).getTime();
      for (const [ms, status] of THRESHOLDS) {
        if (age < ms) return status;
      }
      return "waiting_credentials";
    };
    setRoomStatus(computeStep());
    const id = setInterval(() => setRoomStatus(computeStep()), 1000);
    return () => clearInterval(id);
  }, [phase, matchCreatedAt]);

  // Navigation blocker — active while searching / preparing / found
  const isBlocking = phase === "searching" || phase === "preparing" || phase === "found";
  useEffect(() => {
    if (!isBlocking) return;

    // Browser reload / tab-close → native dialog
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Push a sentinel state so the back button fires popstate instead of navigating
    window.history.pushState({ _qm: true }, "");
    const handlePopState = () => {
      if (navAllowedRef.current) return;
      // Re-push to prevent the back
      window.history.pushState({ _qm: true }, "");
      pendingNavRef.current = () => { navAllowedRef.current = true; window.history.go(-2); };
      setShowLeaveConfirm(true);
    };
    window.addEventListener("popstate", handlePopState);

    // Intercept wouter / in-app pushState calls
    const origPushState = window.history.pushState.bind(window.history);
    (window.history as any).__qmOrig = origPushState;
    (window.history.pushState as any) = function (state: unknown, title: string, url?: string | URL | null) {
      if (navAllowedRef.current || (state as any)?._qm) {
        return origPushState(state, title, url);
      }
      pendingNavRef.current = () => { navAllowedRef.current = true; origPushState(state, title, url); };
      setShowLeaveConfirm(true);
    };

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      const orig = (window.history as any).__qmOrig;
      if (orig) { window.history.pushState = orig; delete (window.history as any).__qmOrig; }
    };
  }, [isBlocking]);

  useEffect(() => {
    const storedEntry = Number(sessionStorage.getItem("qm_entry") ?? 0);
    const storedPrize = Number(sessionStorage.getItem("qm_prize") ?? 0);
    setEntryFee(storedEntry);
    setPrizeAmount(storedPrize);

    apiPost("/quickmatch/search/join", { gameType: typeKey, modeId, entryFee: storedEntry, prizeAmount: storedPrize })
      .catch((err: Error) => {
        setCancelReason(err?.message ?? "Unable to join match");
        setPhase("cancelled");
      });

    // Shared handler — called by both SSE and poll paths
    const applyMatchData = (match: {
      status: string;
      matchId?: string;
      createdAt?: string;
      roomId?: string;
      password?: string;
      openInFfUrl?: string | null;
      roomStatus?: RoomStatus;
      credentialsReadyAt?: string | null;
      entryFee?: number;
      prizeAmount?: number;
      me?: PlayerInfo;
      opponent?: PlayerInfo;
    }, fromSse = false) => {
      if (match.entryFee)    setEntryFee(match.entryFee);
      if (match.prizeAmount) setPrizeAmount(match.prizeAmount);

      if (match.status === "waiting_room") {
        if (match.me)        setMePlayer(match.me);
        if (match.opponent)  setOpponent(match.opponent);
        if (match.matchId)   setMatchId(match.matchId);
        if (match.createdAt) setMatchCreatedAt(match.createdAt);
        // roomStatus is driven locally by the timer effect — skip overwrite from poll
        if (fromSse && match.roomStatus) setRoomStatus(match.roomStatus);
        setPhase("preparing");
      } else if (match.status === "ready" && match.roomId && match.password) {
        stopPolling();
        if (match.me)       setMePlayer(match.me);
        if (match.opponent) setOpponent(match.opponent);
        if (match.matchId)  setMatchId(match.matchId);
        setRoomStatus("ready");
        setPhase("found");
        setMatchInfo({
          roomId: match.roomId,
          password: match.password,
          mapName: meta.mapName,
          format: meta.format,
          maxPlayers: meta.maxPlayers,
          openInFfUrl: match.openInFfUrl ?? null,
          credentialsReadyAt: match.credentialsReadyAt ?? null,
        });
        startJoinWindow(match.credentialsReadyAt ?? null);
      } else if (match.status === "none") {
        setPhase(prev => {
          if (prev === "preparing" || prev === "found") { stopPolling(); return "cancelled"; }
          return prev;
        });
      }
    };

    // ── SSE connection ────────────────────────────────────────────────────────
    const sse = new EventSource("/api/users/sse", { withCredentials: true });
    sseRef.current = sse;

    sse.addEventListener("quickmatch_match", (e: MessageEvent) => {
      try { applyMatchData(JSON.parse(e.data), true); } catch { /* ignore */ }
    });

    sse.addEventListener("quickmatch_stats", (e: MessageEvent) => {
      try {
        const stats = JSON.parse(e.data) as QueueStats;
        setQueueCount(stats[typeKey]?.modes?.[modeId] ?? 0);
      } catch { /* ignore */ }
    });

    // ── 8s fallback poll (SSE handles the fast path) ──────────────────────────
    const poll = async () => {
      try {
        const stats = await apiFetch<QueueStats>("/quickmatch/stats");
        setQueueCount(stats[typeKey]?.modes?.[modeId] ?? 0);
      } catch { /* ignore */ }

      try {
        const match = await apiFetch<Parameters<typeof applyMatchData>[0]>("/quickmatch/match");
        applyMatchData(match, false);
      } catch { /* ignore */ }
    };

    poll();
    pollIdRef.current = setInterval(poll, 8000);
    return () => { stopPolling(); stopJoinWindow(); closeSse(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => { if (phase === "searching") leaveQueue(); };
  }, [phase, leaveQueue]);

  const handleCancel = async () => {
    if (phase === "preparing" || phase === "found") return;
    stopPolling(); stopJoinWindow();
    if (matchId) await dismissActiveMatch(matchId);
    await leaveQueue();
    safeNavigate("/quickmatch");
  };

  const confirmLeave = async () => {
    setShowLeaveConfirm(false);
    stopPolling(); stopJoinWindow(); closeSse();
    if (matchId) await dismissActiveMatch(matchId);
    await leaveQueue();
    const pending = pendingNavRef.current;
    pendingNavRef.current = null;
    if (pending) { pending(); } else { safeNavigate("/quickmatch"); }
  };

  const handleJoinRoom = async () => {
    if (joining || phase === "joined") return;
    setJoining(true);
    stopJoinWindow();
    await leaveQueue();
    setPhase("joined");
    trackAction("joined").catch(() => {});
    setJoining(false);
  };

  // ── Fetch pre-snapshot from server when joined ────────────────────────────
  useEffect(() => {
    if (phase !== "joined") return;
    let cancelled = false;
    snapRetriesRef.current = 0;
    setSnapFailed(false);
    const MAX_RETRIES = 8; // ~40 s max (8 × 5 s)
    const fetchSnap = async () => {
      setSnapLoading(true);
      try {
        const token = localStorage.getItem("clash_ren_token");
        const resp = await fetch("/api/quickmatch/match/pre-snapshot", {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        if (resp.ok) {
          const data = await resp.json() as { snapshot: PreSnap | null; reason?: string };
          if (!cancelled && data.snapshot) {
            setPreSnap(data.snapshot);
            setSnapLoading(false);
            return;
          }
          if (!cancelled && data.reason === "pending" && snapRetriesRef.current < MAX_RETRIES) {
            snapRetriesRef.current++;
            setTimeout(fetchSnap, 5000);
            return;
          }
        }
      } catch { /* best-effort */ }
      // Exhausted retries or non-pending reason — give up
      if (!cancelled) { setSnapLoading(false); setSnapFailed(true); }
    };
    fetchSnap();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── App-focus check-end (phase === "joined") ───────────────────────────────
  // Polls every POLL_INTERVAL_MS while joined. Also fires immediately on
  // visibilitychange so returning from the game triggers detection right away.
  //
  // When the server says reason="no_pre_snapshots" we retry after a short
  // delay (pre-snapshots are fetched async and may not be ready yet).
  const POLL_INTERVAL_MS    = 30_000; // normal poll cadence
  const PRE_SNAP_RETRY_MS   = 8_000;  // retry interval while snapshots not yet ready
  const checkingEndRef      = useRef(false);
  const pollTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (phase !== "joined" || !matchId) return;

    const clearPollTimer = () => {
      if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
    };

    const scheduleNext = (delayMs: number) => {
      clearPollTimer();
      pollTimerRef.current = setTimeout(runCheck, delayMs);
    };

    const runCheck = async () => {
      if (checkingEndRef.current) return; // debounce concurrent calls
      checkingEndRef.current = true;
      setCheckingEnd(true);
      setStillInMatch(false);
      try {
        const token = localStorage.getItem("clash_ren_token");
        const resp = await fetch("/api/quickmatch/match/check-end", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ matchId }),
        });
        if (resp.ok) {
          const data = await resp.json() as { ended: boolean; reason?: string; matchId?: string };
          if (data.ended) {
            clearPollTimer();
            safeNavigate(`/quickmatch/result/${data.matchId ?? matchId}`);
            return;
          }
          if (data.reason === "no_pre_snapshots") {
            // Pre-snapshots still being fetched — retry quickly, no toast
            scheduleNext(PRE_SNAP_RETRY_MS);
          } else {
            // Stats unchanged or no active match — show toast, poll normally
            setStillInMatch(true);
            setTimeout(() => setStillInMatch(false), 4000);
            scheduleNext(POLL_INTERVAL_MS);
          }
        } else {
          scheduleNext(POLL_INTERVAL_MS);
        }
      } catch {
        scheduleNext(POLL_INTERVAL_MS);
      }
      setCheckingEnd(false);
      checkingEndRef.current = false;
    };

    // Immediate check on visibility restore (returning from game)
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      clearPollTimer(); // cancel pending timer; runCheck will reschedule
      runCheck();
    };

    document.addEventListener("visibilitychange", onVisibility);
    // Fire immediately — catches the case where the user is already in the app
    // when the match ends, and starts the polling loop.
    runCheck();

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearPollTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, matchId]);

  const handleOpenInFF = async () => {
    if (!matchInfo) return;
    const url = matchInfo.openInFfUrl
      ?? `freefire://customroom?roomid=${encodeURIComponent(matchInfo.roomId)}&password=${encodeURIComponent(matchInfo.password)}`;
    trackAction("open_ff").catch(() => {});
    window.open(url, "_blank");
    // Auto-advance to joined immediately — opening FF means they're going in
    handleJoinRoom();
  };

  function copyText(text: string, which: "room" | "pass") {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      // Auto-advance to joined after 600 ms — enough to see the ✓ tick
      setTimeout(() => handleJoinRoom(), 600);
      setTimeout(() => setCopied(null), 2500);
    });
    trackAction(which === "room" ? "copy_room" : "copy_pass").catch(() => {});
  }

  const Icon           = meta.Icon;
  const currentStepIdx = stepIndex(roomStatus);
  const isMatchLocked  = phase === "preparing" || phase === "found";
  const windowPct      = joinWindowSecs !== null ? (joinWindowSecs / JOIN_WINDOW_SECONDS) * 100 : 100;
  const windowUrgent   = joinWindowSecs !== null && joinWindowSecs <= 7;

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden" style={{ background: "#050505" }}>
      <style>{`
        @keyframes radar-ring {
          0%   { transform: scale(0.3); opacity: 0.7; }
          100% { transform: scale(3.2); opacity: 0; }
        }
        @keyframes spin-slow     { to { transform: rotate(360deg); } }
        @keyframes spin-slow-rev { to { transform: rotate(-360deg); } }
        @keyframes live-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.35; transform: scale(0.8); }
        }
        @keyframes status-fade {
          0%   { opacity: 0; transform: translateY(8px); }
          15%  { opacity: 1; transform: translateY(0); }
          85%  { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-8px); }
        }
        @keyframes found-pop {
          0%  { transform: scale(0.88); opacity: 0; }
          60% { transform: scale(1.03); }
          100%{ transform: scale(1);   opacity: 1; }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes joined-in {
          0%  { transform: scale(0.6) rotate(-8deg); opacity: 0; }
          65% { transform: scale(1.1) rotate(3deg); }
          100%{ transform: scale(1) rotate(0deg);   opacity: 1; }
        }
        @keyframes step-ping {
          0%   { transform: scale(1);   opacity: 0.9; }
          70%  { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes preparing-in {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes badge-glow {
          0%, 100% { box-shadow: 0 0 20px ${accent}40; }
          50%      { box-shadow: 0 0 44px ${accent}75; }
        }
        @keyframes icon-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes scan-line {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes credential-flash {
          0%   { background: ${accent}00; }
          30%  { background: ${accent}20; }
          100% { background: ${accent}00; }
        }
        @keyframes trophy-bounce {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-8px); }
        }
      `}</style>

      {/* Full-bleed atmospheric gradient */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `radial-gradient(ellipse 80% 50% at 50% 0%, ${accent}18 0%, transparent 60%)`
      }} />
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse 60% 40% at 50% 100%, rgba(0,0,0,0.6) 0%, transparent 70%)"
      }} />

      {/* Header */}
      <div className="shrink-0 px-4 pt-12 pb-4 relative z-10" style={{ background: "linear-gradient(180deg,#050505 0%,transparent 100%)" }}>
        <div className="flex items-center justify-between">
          {(phase === "joined" || isMatchLocked) ? (
            <div className="w-10 h-10" />
          ) : (
            <button
              onClick={handleCancel}
              className="w-10 h-10 rounded-2xl flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <ArrowLeft className="w-4.5 h-4.5 text-white/70" />
            </button>
          )}
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-black tracking-[0.22em] uppercase text-zinc-600">{TYPE_LABEL[typeKey]}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Icon className="w-3.5 h-3.5" style={{ color: accent }} strokeWidth={2} />
              <span className="text-[14px] font-extrabold text-white leading-tight">{meta.name}</span>
            </div>
          </div>
          <div className="w-10 h-10" />
        </div>
      </div>

      {/* ─────────────────── SEARCHING ─────────────────── */}
      {phase === "searching" && (
        <div className="flex-1 flex flex-col items-center px-5 pb-8" style={{ opacity: visible ? 1 : 0, transition: "opacity 0.5s ease" }}>

          {/* Radar scanner */}
          <div className="relative flex items-center justify-center mt-6 mb-8" style={{ width: 220, height: 220 }}>
            {/* Outer pulse rings */}
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="absolute rounded-full" style={{
                inset: 0,
                border: `1px solid ${accent}`,
                opacity: 0,
                animation: `radar-ring 3s ease-out ${i * 0.75}s infinite`,
              }} />
            ))}
            {/* Dashed orbit rings */}
            <div className="absolute rounded-full" style={{ width: 160, height: 160, border: `1px dashed ${accent}30`, animation: "spin-slow 12s linear infinite" }} />
            <div className="absolute rounded-full" style={{ width: 120, height: 120, border: `1px dashed ${accent}20`, animation: "spin-slow-rev 8s linear infinite" }} />
            {/* Scan sweep */}
            <div className="absolute rounded-full overflow-hidden" style={{ width: 160, height: 160, animation: "scan-line 3s linear infinite" }}>
              <div className="absolute inset-0" style={{
                background: `conic-gradient(from 0deg, transparent 70%, ${accent}35 100%)`,
              }} />
            </div>
            {/* Center icon */}
            <div className="relative w-20 h-20 rounded-full flex items-center justify-center z-10" style={{
              background: `radial-gradient(circle, ${accent}25 0%, ${accent}08 100%)`,
              border: `1.5px solid ${accent}55`,
              boxShadow: `0 0 40px ${glow}, inset 0 0 20px ${accent}10`,
            }}>
              <Icon className="w-9 h-9" style={{ color: accent }} strokeWidth={1.5} />
            </div>
          </div>

          {/* Status text */}
          <div className="h-7 flex items-center justify-center mb-1 overflow-hidden">
            <p key={statusIdx} className="text-[15px] font-semibold text-white/65" style={{ animation: "status-fade 3.5s ease both" }}>
              {STATUS_MESSAGES[statusIdx]}
            </p>
          </div>
          <p className="text-[11px] text-zinc-600 mb-6">{meta.format} · {meta.mapName}</p>

          {/* Prize pool banner */}
          {entryFee > 0 && (
            <div className="flex items-center gap-4 mb-5 px-5 py-3 rounded-2xl w-full max-w-xs" style={{
              background: "linear-gradient(135deg, rgba(250,204,21,0.08), rgba(250,204,21,0.04))",
              border: "1px solid rgba(250,204,21,0.2)",
            }}>
              <div className="flex-1 flex flex-col items-center gap-0.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-yellow-600">Entry</span>
                <div className="flex items-center gap-1">
                  <CoinIcon width={13} />
                  <span className="text-[18px] font-black text-white tabular-nums">{entryFee}</span>
                </div>
              </div>
              <div className="w-px h-8" style={{ background: "rgba(250,204,21,0.15)" }} />
              <div className="flex-1 flex flex-col items-center gap-0.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-yellow-500">Prize</span>
                <div className="flex items-center gap-1">
                  <CoinIcon width={13} />
                  <span className="text-[18px] font-black text-yellow-300 tabular-nums">{prizeAmount}</span>
                </div>
              </div>
            </div>
          )}

          {/* Stats grid */}
          <div className="flex items-stretch gap-2 w-full max-w-xs mb-8">
            <div className="flex-1 flex flex-col items-center gap-1 py-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <Clock className="w-4 h-4 text-zinc-500" />
              <span className="font-mono text-[17px] font-extrabold text-white tabular-nums">{formatTime(elapsed)}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Wait</span>
            </div>
            <div className="flex-1 flex flex-col items-center gap-1 py-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <Users className="w-4 h-4" style={{ color: accent }} />
              <span className="text-[17px] font-extrabold tabular-nums" style={{ color: accent }}>
                {queueCount === null ? "—" : queueCount}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Queue</span>
            </div>
            <div className="flex-1 flex flex-col items-center gap-1 py-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <span className="w-2 h-2 rounded-full" style={{ background: accent, animation: "live-pulse 1.4s ease-in-out infinite" }} />
              <span className="text-[13px] font-extrabold uppercase tracking-wider" style={{ color: accent }}>{typeKey}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Mode</span>
            </div>
          </div>

          {/* Spinner */}
          <div className="w-6 h-6 rounded-full mb-7" style={{
            border: `2px solid ${accent}25`,
            borderTopColor: accent,
            animation: "spin-slow 0.9s linear infinite",
          }} />

          {/* Cancel */}
          <button
            onClick={handleCancel}
            className="flex items-center gap-2 px-8 py-3.5 rounded-2xl active:scale-95 transition-transform"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            <X className="w-4 h-4 text-red-400" strokeWidth={2.5} />
            <span className="text-[13px] font-extrabold text-red-400">Cancel Search</span>
          </button>
        </div>
      )}

      {/* ─────────────────── PREPARING ─────────────────── */}
      {phase === "preparing" && (
        <div className="flex-1 flex flex-col items-center px-4 pb-10" style={{ animation: "preparing-in 0.5s ease both" }}>

          {/* Badge */}
          <div className="mt-2 mb-4 px-5 py-2 rounded-full flex items-center gap-2.5" style={{
            background: `${accent}18`,
            border: `1.5px solid ${accent}50`,
            animation: "badge-glow 2s ease-in-out infinite",
          }}>
            <span className="w-2 h-2 rounded-full" style={{ background: accent, animation: "live-pulse 1s ease-in-out infinite" }} />
            <span className="text-[12px] font-extrabold tracking-widest uppercase" style={{ color: accent }}>Opponent Found!</span>
          </div>

          {/* VS card */}
          <div className="w-full rounded-3xl overflow-hidden mb-4" style={{
            background: `linear-gradient(145deg, ${accent}0d 0%, rgba(255,255,255,0.018) 100%)`,
            border: `1px solid ${accent}30`,
          }}>
            <div className="flex items-center justify-between px-5 py-5 gap-3">
              {/* Me */}
              <div className="flex-1 flex flex-col items-center gap-2.5 min-w-0">
                <Avatar src={mePlayer?.profilePicture} name={mePlayer?.inGameName ?? "You"} size={64} accent={accent} />
                <div className="text-center w-full">
                  <p className="text-[13px] font-extrabold text-white truncate">{mePlayer?.inGameName ?? "You"}</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">You</p>
                </div>
              </div>
              {/* VS */}
              <div className="shrink-0 flex flex-col items-center gap-1">
                <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{
                  background: `${accent}15`,
                  border: `1.5px solid ${accent}40`,
                  boxShadow: `0 0 20px ${accent}30`,
                }}>
                  <span className="text-[11px] font-black tracking-wider" style={{ color: accent }}>VS</span>
                </div>
              </div>
              {/* Opponent */}
              <div className="flex-1 flex flex-col items-center gap-2.5 min-w-0">
                <Avatar src={opponent?.profilePicture} name={opponent?.inGameName ?? "Opponent"} size={64} accent={accent} />
                <div className="text-center w-full">
                  <p className="text-[13px] font-extrabold text-white truncate">{opponent?.inGameName ?? "Opponent"}</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">Opponent</p>
                </div>
              </div>
            </div>
            <div className="px-5 py-2.5 flex items-center gap-2 justify-center" style={{
              background: `${accent}08`, borderTop: `1px solid ${accent}18`,
            }}>
              <Icon className="w-3.5 h-3.5" style={{ color: accent }} strokeWidth={2} />
              <span className="text-[11px] font-semibold text-zinc-400">{meta.name} · {meta.mapName}</span>
            </div>
          </div>

          {/* Timeline */}
          <div className="w-full rounded-3xl overflow-hidden mb-4" style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}>
            <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="text-[10px] font-black tracking-widest uppercase text-zinc-600">Preparing Room</span>
            </div>
            <div className="px-5 py-4 flex flex-col gap-0">
              {ROOM_STEPS.map((step, i) => {
                const isActive = i === currentStepIdx;
                const isDone   = i < currentStepIdx;
                const StepIcon = step.Icon;
                return (
                  <div key={step.key} className="flex items-start gap-4">
                    <div className="flex flex-col items-center" style={{ width: 30, paddingTop: 2 }}>
                      <div className="relative flex items-center justify-center" style={{ width: 30, height: 30 }}>
                        {isActive && (
                          <div className="absolute rounded-full" style={{
                            inset: -3, background: `${accent}25`,
                            animation: "step-ping 1.8s ease-out infinite",
                          }} />
                        )}
                        <div className="relative rounded-full flex items-center justify-center" style={{
                          width: 30, height: 30,
                          background: isDone ? `${accent}28` : isActive ? `${accent}18` : "rgba(255,255,255,0.04)",
                          border: `1.5px solid ${isDone ? accent : isActive ? `${accent}aa` : "rgba(255,255,255,0.09)"}`,
                          transition: "all 0.35s ease",
                        }}>
                          {isDone
                            ? <Check className="w-3.5 h-3.5" style={{ color: accent }} strokeWidth={2.5} />
                            : <StepIcon className="w-3.5 h-3.5" strokeWidth={2} style={{
                                color: isActive ? accent : "rgba(255,255,255,0.18)",
                                animation: isActive && step.key === "creating_room" ? "icon-spin 1.4s linear infinite" : undefined,
                              }} />
                          }
                        </div>
                      </div>
                      {i < ROOM_STEPS.length - 1 && (
                        <div style={{
                          width: 1.5, height: 22, marginTop: 2,
                          background: isDone ? accent : "rgba(255,255,255,0.07)",
                          transition: "background 0.35s ease", borderRadius: 2,
                        }} />
                      )}
                    </div>
                    <div className="flex-1 pb-4" style={{ paddingTop: 5 }}>
                      <p className="text-[13px] font-semibold leading-tight" style={{
                        color: isDone ? accent : isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.2)",
                        transition: "color 0.35s ease",
                      }}>
                        {step.label}
                        {isActive && <span className="ml-1.5 text-[11px]" style={{ color: `${accent}aa` }}>…</span>}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lock notice */}
          <div className="px-4 py-2.5 rounded-2xl flex items-center gap-2" style={{
            background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <Shield className="w-3.5 h-3.5 text-zinc-700" strokeWidth={2} />
            <span className="text-[11px] font-semibold text-zinc-600">Match locked — cannot cancel</span>
          </div>
        </div>
      )}

      {/* ─────────────────── FOUND (credentials ready) ─────────────────── */}
      {phase === "found" && matchInfo && (
        <div className="flex-1 flex flex-col items-center px-4 pb-8" style={{ animation: "found-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) both" }}>

          {/* Badge + countdown */}
          <div className="mt-2 mb-4 flex flex-col items-center gap-2.5">
            <div className="px-6 py-2.5 rounded-full flex items-center gap-2.5" style={{
              background: `${accent}1a`,
              border: `1.5px solid ${accent}55`,
              boxShadow: `0 0 28px ${accent}35`,
              animation: "badge-glow 1.8s ease-in-out infinite",
            }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: accent, animation: "live-pulse 1s ease-in-out infinite" }} />
              <span className="text-[13px] font-extrabold tracking-widest uppercase" style={{ color: accent }}>Room Ready!</span>
            </div>

            {/* Join window progress bar */}
            {joinWindowSecs !== null && (
              <div className="w-full max-w-xs flex flex-col gap-1.5">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Join window</span>
                  <span className="text-[11px] font-black tabular-nums" style={{ color: windowUrgent ? "#ef4444" : "rgba(255,255,255,0.5)" }}>
                    {joinWindowSecs}s
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{
                    width: `${windowPct}%`,
                    background: windowUrgent
                      ? "linear-gradient(90deg, #ef4444, #f87171)"
                      : `linear-gradient(90deg, ${accent}, ${accent}bb)`,
                  }} />
                </div>
              </div>
            )}
          </div>

          {/* Compact VS row */}
          {(mePlayer || opponent) && (
            <div className="w-full flex items-center justify-between px-4 py-3 rounded-2xl mb-3 gap-2" style={{
              background: `${accent}09`, border: `1px solid ${accent}20`,
              animation: "slide-up 0.35s ease 0.05s both",
            }}>
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <Avatar src={mePlayer?.profilePicture} name={mePlayer?.inGameName ?? "You"} size={38} accent={accent} />
                <p className="text-[12px] font-bold text-white truncate">{mePlayer?.inGameName ?? "You"}</p>
              </div>
              <span className="text-[10px] font-black text-zinc-700 shrink-0 px-2">VS</span>
              <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-end">
                <p className="text-[12px] font-bold text-white truncate text-right">{opponent?.inGameName ?? "Opponent"}</p>
                <Avatar src={opponent?.profilePicture} name={opponent?.inGameName ?? "Opponent"} size={38} accent={accent} />
              </div>
            </div>
          )}

          {/* Credentials card */}
          <div className="w-full rounded-3xl overflow-hidden mb-3" style={{
            background: `linear-gradient(145deg, ${accent}0d 0%, rgba(255,255,255,0.018) 100%)`,
            border: `1.5px solid ${accent}35`,
            boxShadow: `0 8px 40px ${accent}18`,
            animation: "slide-up 0.35s ease 0.1s both",
          }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{
              background: `${accent}12`, borderBottom: `1px solid ${accent}22`,
            }}>
              <div className="flex items-center gap-2">
                <KeyRound className="w-3.5 h-3.5" style={{ color: accent }} strokeWidth={2} />
                <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: accent }}>Room Credentials</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Icon className="w-3 h-3 text-zinc-600" strokeWidth={2} />
                <span className="text-[10px] font-bold text-zinc-600">{matchInfo.format} · {matchInfo.maxPlayers}P</span>
              </div>
            </div>

            <div className="px-5 py-4 flex flex-col gap-3">
              {/* Room ID */}
              <button
                onClick={() => copyText(matchInfo.roomId, "room")}
                className="w-full flex items-center justify-between py-3 px-4 rounded-2xl active:scale-[0.98] transition-transform"
                style={{
                  background: copied === "room" ? `${accent}18` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${copied === "room" ? `${accent}50` : "rgba(255,255,255,0.09)"}`,
                  transition: "all 0.25s ease",
                }}
              >
                <div className="text-left">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-0.5">Room ID</p>
                  <p className="text-[22px] font-black text-white font-mono tracking-wider leading-none">{matchInfo.roomId}</p>
                </div>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{
                  background: `${accent}18`, border: `1px solid ${accent}35`,
                }}>
                  {copied === "room"
                    ? <Check className="w-4 h-4" style={{ color: accent }} strokeWidth={2.5} />
                    : <Copy className="w-4 h-4" style={{ color: accent }} strokeWidth={2} />
                  }
                </div>
              </button>

              {/* Password */}
              <button
                onClick={() => copyText(matchInfo.password, "pass")}
                className="w-full flex items-center justify-between py-3 px-4 rounded-2xl active:scale-[0.98] transition-transform"
                style={{
                  background: copied === "pass" ? `${accent}18` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${copied === "pass" ? `${accent}50` : "rgba(255,255,255,0.09)"}`,
                  transition: "all 0.25s ease",
                }}
              >
                <div className="text-left">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-0.5">Password</p>
                  <p className="text-[22px] font-black text-white font-mono tracking-[0.3em] leading-none">{matchInfo.password}</p>
                </div>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{
                  background: `${accent}18`, border: `1px solid ${accent}35`,
                }}>
                  {copied === "pass"
                    ? <Check className="w-4 h-4" style={{ color: accent }} strokeWidth={2.5} />
                    : <Copy className="w-4 h-4" style={{ color: accent }} strokeWidth={2} />
                  }
                </div>
              </button>

              {/* Map info */}
              <div className="flex items-center gap-2 px-1">
                <MapIcon className="w-3.5 h-3.5 text-zinc-600" strokeWidth={2} />
                <span className="text-[11px] font-semibold text-zinc-600">{matchInfo.mapName}</span>
              </div>
            </div>
          </div>

          {/* Open in Free Fire — primary CTA */}
          <button
            onClick={handleOpenInFF}
            className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 active:scale-[0.97] transition-transform mb-2.5"
            style={{
              background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
              boxShadow: `0 8px 32px ${accent}50`,
              animation: "slide-up 0.35s ease 0.2s both",
            }}
          >
            <ExternalLink className="w-5 h-5 text-white" strokeWidth={2} />
            <span className="text-[15px] font-extrabold text-white tracking-wide">Open in Free Fire</span>
          </button>

          {/* Hint — copy or open to auto-confirm */}
          <p
            className="text-[11px] text-zinc-600 text-center mt-0.5"
            style={{ animation: "slide-up 0.35s ease 0.25s both" }}
          >
            Copying credentials or opening Free Fire marks you as joined
          </p>
        </div>
      )}

      {/* ─────────────────── CANCELLED ─────────────────── */}
      {phase === "cancelled" && (
        <div className="flex-1 flex flex-col items-center justify-center px-5 pb-10" style={{ animation: "found-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both" }}>
          <div className="w-24 h-24 rounded-[28px] flex items-center justify-center mb-5" style={{
            background: "rgba(239,68,68,0.1)", border: "1.5px solid rgba(239,68,68,0.3)",
            boxShadow: "0 8px 40px rgba(239,68,68,0.15)",
          }}>
            <X className="w-11 h-11 text-red-400" strokeWidth={1.5} />
          </div>
          <h2 className="font-heading text-2xl font-black text-white tracking-tight mb-2">
            {cancelReason ? "Cannot Join" : "Match Cancelled"}
          </h2>
          <p className="text-[13px] text-zinc-500 text-center mb-8 leading-relaxed max-w-xs">
            {cancelReason ?? "Your opponent left before the room was ready."}
          </p>
          <button
            onClick={() => safeNavigate(`/quickmatch/${typeKey}/${modeId}`)}
            className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 active:scale-[0.97] transition-transform mb-2.5"
            style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, boxShadow: `0 8px 32px ${accent}40` }}
          >
            <span className="text-[15px] font-extrabold text-white tracking-wide">Search Again</span>
          </button>
          <button
            onClick={() => safeNavigate("/quickmatch")}
            className="w-full py-3.5 rounded-2xl flex items-center justify-center active:scale-95 transition-transform"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <span className="text-[13px] font-semibold text-zinc-500">Back to Modes</span>
          </button>
        </div>
      )}

      {/* ─────────────────── JOINED (in room) ─────────────────── */}
      {phase === "joined" && matchInfo && (
        <div className="flex-1 flex flex-col items-center px-4 pb-8" style={{ animation: "found-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) both" }}>

          {/* Trophy */}
          <div className="mt-6 mb-3 flex items-center justify-center">
            <div className="w-24 h-24 rounded-[28px] flex items-center justify-center" style={{
              background: `${accent}18`,
              border: `1.5px solid ${accent}40`,
              boxShadow: `0 12px 48px ${accent}30`,
              animation: "trophy-bounce 2.5s ease-in-out infinite",
            }}>
              <Trophy className="w-12 h-12" style={{ color: accent }} strokeWidth={1.4} />
            </div>
          </div>

          <h2 className="font-heading text-3xl font-black text-white tracking-tight mb-2" style={{ textShadow: `0 0 40px ${glow}` }}>
            You're In!
          </h2>

          {/* Snapshot captured badge / checking status */}
          {checkingEnd ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full mb-4" style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)" }}>
              <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ border: "2px solid rgba(99,102,241,0.3)", borderTopColor: "#818cf8", animation: "icon-spin 0.8s linear infinite" }} />
              <span className="text-[11px] font-bold text-indigo-400 tracking-wide">Checking match result…</span>
            </div>
          ) : stillInMatch ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full mb-4" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)" }}>
              <Clock className="w-3.5 h-3.5 text-amber-400" strokeWidth={2.5} />
              <span className="text-[11px] font-bold text-amber-400 tracking-wide">Still in match — check back when done</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full mb-4" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)" }}>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2.5} />
              <span className="text-[11px] font-bold text-emerald-400 tracking-wide">Stats snapshot captured</span>
            </div>
          )}

          {/* Prize reminder */}
          {prizeAmount > 0 && (
            <div className="flex items-center gap-2.5 mb-3 px-5 py-2.5 rounded-2xl" style={{
              background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.2)",
            }}>
              <CoinIcon width={16} />
              <span className="text-[12px] font-bold text-yellow-500">Prize Pool</span>
              <span className="text-[16px] font-black text-yellow-300 tabular-nums">{prizeAmount}</span>
              <span className="text-[11px] text-yellow-600">coins</span>
            </div>
          )}

          {/* Pre-snapshot stats card */}
          <div className="w-full rounded-2xl overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }}>
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-600">📸 Pre-game snapshot</span>
              {preSnap && (
                <span className="text-[9px] text-zinc-700">
                  {new Date(preSnap.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
            {snapLoading && !preSnap ? (
              <div className="px-4 py-3 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ border: "2px solid rgba(255,255,255,0.08)", borderTopColor: accent, animation: "icon-spin 0.8s linear infinite" }} />
                <span className="text-[11px] text-zinc-600">Capturing your stats…</span>
              </div>
            ) : preSnap ? (
              <div className="px-4 py-3 grid grid-cols-3 gap-2">
                {[
                  { label: "Games", value: preSnap.gamesPlayed },
                  { label: "Kills",  value: preSnap.kills },
                  { label: "Damage", value: preSnap.damage },
                  { label: "Wins",   value: preSnap.wins },
                  { label: "Deaths", value: preSnap.deaths },
                  { label: "Assists",value: preSnap.assists },
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-col items-center py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <span className="text-[16px] font-black text-white tabular-nums leading-none">{value.toLocaleString()}</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600 mt-1">{label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-3">
                <p className="text-[11px] text-zinc-600 text-center">
                  {snapFailed ? "Stats unavailable — match will still be detected automatically" : "Waiting for stats…"}
                </p>
              </div>
            )}
          </div>

          {/* What happens next */}
          <div className="w-full rounded-2xl overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }}>
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-600">What happens next</span>
            </div>
            <div className="px-4 py-3 flex flex-col gap-2.5">
              <div className="flex items-start gap-2.5">
                <span className="text-base leading-none mt-0.5">📸</span>
                <div>
                  <p className="text-[11px] font-bold text-zinc-300 leading-tight">Snapshot captured</p>
                  <p className="text-[10px] text-zinc-600 leading-relaxed">Your pre-game stats were recorded the moment credentials arrived.</p>
                </div>
              </div>
              <div className="h-px" style={{ background: "rgba(255,255,255,0.04)" }} />
              <div className="flex items-start gap-2.5">
                <span className="text-base leading-none mt-0.5">🎮</span>
                <div>
                  <p className="text-[11px] font-bold text-zinc-300 leading-tight">Play the match</p>
                  <p className="text-[10px] text-zinc-600 leading-relaxed">Wins are verified by comparing your stats before vs. after.</p>
                </div>
              </div>
              <div className="h-px" style={{ background: "rgba(255,255,255,0.04)" }} />
              <div className="flex items-start gap-2.5">
                <span className="text-base leading-none mt-0.5">🏆</span>
                <div>
                  <p className="text-[11px] font-bold text-zinc-300 leading-tight">Auto-settlement</p>
                  <p className="text-[10px] text-zinc-600 leading-relaxed">Results settle automatically. Prize credited if you win — refunded if opponent no-shows.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Opponent card */}
          {opponent && (
            <div className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl mb-4" style={{
              background: `${accent}09`, border: `1px solid ${accent}22`,
            }}>
              <Avatar src={opponent.profilePicture} name={opponent.inGameName} size={40} accent={accent} />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-0.5">Your Opponent</p>
                <p className="text-[14px] font-bold text-white truncate">{opponent.inGameName}</p>
              </div>
            </div>
          )}

          {/* Credentials reference */}
          <div className="w-full rounded-3xl overflow-hidden mb-4" style={{
            background: `linear-gradient(145deg, ${accent}0d 0%, rgba(255,255,255,0.018) 100%)`,
            border: `1.5px solid ${accent}30`,
          }}>
            <div className="px-5 py-3 flex items-center gap-2" style={{
              background: `${accent}10`, borderBottom: `1px solid ${accent}20`,
            }}>
              <Shield className="w-3.5 h-3.5" style={{ color: accent }} strokeWidth={2} />
              <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: accent }}>
                {meta.name} · {matchInfo.mapName}
              </span>
            </div>

            <div className="px-5 py-5 flex flex-col gap-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Room ID</p>
                <div className="flex items-center justify-between">
                  <p className="text-[28px] font-black text-white font-mono tracking-widest leading-none">{matchInfo.roomId}</p>
                  <button onClick={() => copyText(matchInfo.roomId, "room")}
                    className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-transform"
                    style={{ background: `${accent}18`, border: `1px solid ${accent}35` }}>
                    {copied === "room" ? <Check className="w-4 h-4" style={{ color: accent }} /> : <Copy className="w-4 h-4" style={{ color: accent }} />}
                  </button>
                </div>
              </div>
              <div className="h-px" style={{ background: `${accent}15` }} />
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Password</p>
                <div className="flex items-center justify-between">
                  <p className="text-[28px] font-black text-white font-mono tracking-[0.4em] leading-none">{matchInfo.password}</p>
                  <button onClick={() => copyText(matchInfo.password, "pass")}
                    className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-transform"
                    style={{ background: `${accent}18`, border: `1px solid ${accent}35` }}>
                    {copied === "pass" ? <Check className="w-4 h-4" style={{ color: accent }} /> : <Copy className="w-4 h-4" style={{ color: accent }} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Open in FF */}
          <button
            onClick={handleOpenInFF}
            className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 active:scale-[0.97] transition-transform mb-2.5"
            style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, boxShadow: `0 8px 32px ${accent}45` }}
          >
            <ExternalLink className="w-5 h-5 text-white" strokeWidth={2} />
            <span className="text-[15px] font-extrabold text-white tracking-wide">Open in Free Fire</span>
          </button>

          <button
            onClick={() => safeNavigate("/")}
            className="w-full py-3.5 rounded-2xl flex items-center justify-center active:scale-95 transition-transform"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <span className="text-[13px] font-semibold text-zinc-500">Back to Home</span>
          </button>
        </div>
      )}

      {/* ─── Leave-confirm overlay ─── */}
      {showLeaveConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}
        >
          <div
            className="w-full rounded-t-3xl px-5 pt-6 pb-safe"
            style={{
              background: "rgba(12,14,20,0.98)",
              border: "1px solid rgba(255,255,255,0.09)",
              borderBottom: "none",
              boxShadow: "0 -20px 60px rgba(0,0,0,0.6)",
              paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
              animation: "qhub-sheet-in 0.28s cubic-bezier(0.34,1.2,0.64,1) both",
            }}
          >
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "rgba(239,68,68,0.12)", border: "1.5px solid rgba(239,68,68,0.3)" }}
            >
              <X className="w-7 h-7 text-red-400" strokeWidth={1.6} />
            </div>
            <h3 className="text-[18px] font-black text-white text-center mb-1">Leave matchmaking?</h3>
            <p className="text-[13px] text-zinc-500 text-center mb-6 leading-relaxed px-2">
              {phase === "searching"
                ? "You'll be removed from the queue and your entry fee will be refunded."
                : "Leaving now will cancel your active match room. This may result in a ban if credentials were already sent."}
            </p>
            <button
              onClick={confirmLeave}
              className="w-full py-4 rounded-2xl mb-3 active:scale-[0.97] transition-transform"
              style={{ background: "rgba(239,68,68,0.18)", border: "1.5px solid rgba(239,68,68,0.35)" }}
            >
              <span className="text-[15px] font-extrabold text-red-400">Yes, Leave</span>
            </button>
            <button
              onClick={() => { pendingNavRef.current = null; setShowLeaveConfirm(false); }}
              className="w-full py-3.5 rounded-2xl active:scale-95 transition-transform"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <span className="text-[14px] font-semibold text-zinc-400">Stay in Queue</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
