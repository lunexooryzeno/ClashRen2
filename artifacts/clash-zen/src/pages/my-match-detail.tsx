import { useParams, useLocation } from "wouter";
import { CachedImg } from "@/components/CachedImg";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Key, Lock, Copy, Gamepad2, CheckCircle, Clock,
  Trophy, Swords, Gem, Calendar, Users, ShieldAlert,
  CheckCircle2, Hourglass, Flame, XCircle,
  Crown, Skull, Star, Zap, Shield, AlertTriangle, ChevronRight, X,
  FileImage, ImagePlus, Timer, Send, RotateCcw, ClipboardList,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/lib/auth";

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/api/")) return url;
  const clean = url.replace(/^\/objects\//, "");
  return `/api/storage/objects/${clean}`;
}

function maskUid(uid: string | null | undefined): string {
  if (!uid) return "—";
  const s = String(uid);
  if (s.length <= 5) return s;
  return `${s.slice(0, 3)}•••${s.slice(-2)}`;
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

function useCountdown(targetDate: string | null) {
  const targetMs = useMemo(() => (targetDate ? new Date(targetDate).getTime() : null), [targetDate]);
  const [val, setVal] = useState<{ d: number; h: number; m: number; s: number } | null>(null);

  useEffect(() => {
    if (!targetMs) { setVal(null); return; }
    const tick = () => {
      const diff = targetMs - Date.now();
      if (diff <= 0) { setVal(null); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setVal({ d, h, m, s });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  return val;
}

function pad(n: number) { return String(n).padStart(2, "0"); }

/* ─── Step component ─────────────────────────────────────────────────────── */

function Step({ dot, label, sub, done, active }: { dot: string; label: string; sub: string; done?: boolean; active?: boolean; }) {
  return (
    <div className="flex items-start gap-3.5">
      <div className="flex flex-col items-center shrink-0 mt-0.5">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
          style={{
            background: done ? "rgba(34,197,94,0.2)" : active ? `${dot}22` : "rgba(255,255,255,0.04)",
            border: done ? "1px solid rgba(34,197,94,0.5)" : active ? `1px solid ${dot}55` : "1px solid rgba(255,255,255,0.09)",
            boxShadow: done ? "0 0 8px rgba(34,197,94,0.3)" : active ? `0 0 8px ${dot}44` : "none",
          }}
        >
          {done ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <div className="w-2 h-2 rounded-full" style={{ background: active ? dot : "rgba(255,255,255,0.15)", boxShadow: active ? `0 0 6px ${dot}` : "none" }} />
          )}
        </div>
      </div>
      <div className="pb-1 flex-1">
        <p className={`text-[13px] font-bold leading-snug ${done ? "text-green-300" : active ? "text-white" : "text-zinc-500"}`}>{label}</p>
        <p className="text-[11px] text-zinc-600 mt-0.5 leading-relaxed">{sub}</p>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function MyMatchDetailPage() {
  const params = useParams();
  const rawId = (params as any).id || "";
  const slotKey = (params as any).slotKey || "";       // e.g. "slot_0", "slot_1"
  const numericId = /^\d+$/.test(rawId) ? parseInt(rawId, 10) : 0;
  const isSlug = numericId === 0 && rawId.length > 0;

  // Parse slot index from path segment "slot_N" → N
  const slotIndexFromPath: number | null = /^slot_(\d+)$/.test(slotKey)
    ? parseInt(slotKey.slice(5), 10)
    : null;

  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user: authUser } = useAuth();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [readyAt, setReadyAt] = useState<string | null>(null);
  const [readyLoading, setReadyLoading] = useState(false);
  const [slotMatch, setSlotMatch] = useState<any>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDone, setReportDone] = useState(false);

  // ── Dispute state ────────────────────────────────────────────────────────
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState<string | null>(null);
  const [disputeDescription, setDisputeDescription] = useState("");
  const [disputeManualReview, setDisputeManualReview] = useState(false);
  const [disputeScreenshotFile, setDisputeScreenshotFile] = useState<File | null>(null);
  const [disputeScreenshotUrl, setDisputeScreenshotUrl] = useState<string | null>(null);
  const [disputeScreenshotUploading, setDisputeScreenshotUploading] = useState(false);
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeDone, setDisputeDone] = useState(false);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  const disputeDeadline = slotMatch?.match?.disputeDeadline ?? null;
  const disputeCountdown = useCountdown(disputeDeadline);
  const disputeWindowOpen = disputeDeadline ? new Date() < new Date(disputeDeadline) : false;

  const roomViewedRef = useRef(false);
  const gameOpenedRef = useRef(false);

  function fireGameOpened() {
    if (gameOpenedRef.current || !slotMatch?.match?.id) return;
    gameOpenedRef.current = true;
    authFetch(`/slot-matches/${slotMatch.match.id}/engagement`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "game_opened" }),
    }).catch(() => {});
  }

  async function handleScreenshotPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !data?.id) return;
    setDisputeScreenshotFile(file);
    setDisputeScreenshotUploading(true);
    try {
      const r = await fetch(`/api/slots/${data.id}/dispute/screenshot`, {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          ...(localStorage.getItem("clash_ren_token") ? { Authorization: `Bearer ${localStorage.getItem("clash_ren_token")}` } : {}),
        },
        body: file,
        credentials: "include",
      });
      const j = await r.json();
      if (j.url) setDisputeScreenshotUrl(j.url);
    } catch { /* ignore */ } finally {
      setDisputeScreenshotUploading(false);
    }
    e.target.value = "";
  }

  async function handleDisputeSubmit() {
    if (!disputeReason || !data?.id) return;
    if (disputeDescription.trim().length < 10) {
      toast({ title: "Please describe the issue in more detail", variant: "destructive" }); return;
    }
    setDisputeSubmitting(true);
    try {
      const r = await authFetch(`/slots/${data.id}/dispute`, {
        method: "POST",
        body: JSON.stringify({
          reason: disputeReason,
          description: disputeDescription.trim(),
          screenshotUrl: disputeScreenshotUrl ?? undefined,
          manualReviewRequested: disputeManualReview,
        }),
      });
      const j = await r.json();
      if (!r.ok) { toast({ title: j.error || "Failed to submit dispute", variant: "destructive" }); return; }
      haptic("success");
      setDisputeDone(true);
      setDisputeOpen(false);
    } catch {
      toast({ title: "Network error. Please try again.", variant: "destructive" });
    } finally { setDisputeSubmitting(false); }
  }

  useEffect(() => {
    setLoading(true);
    const path = isSlug ? `/tournaments/s/${rawId}` : `/tournaments/${numericId}`;
    authFetch(path)
      .then(r => r.json())
      .then(d => { setData(d); setIsReady(d.isReady ?? false); setReadyAt(d.readyAt ?? null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [rawId]);

  // Fetch slot-match data (with auto-polling every 10 s and on focus/visibility)
  const fetchSlotMatch = useCallback(() => {
    if (!data?.id) return;
    authFetch(`/slots/${data.id}/my-match`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setSlotMatch(d))
      .catch(() => {});
  }, [data?.id]);

  useEffect(() => {
    fetchSlotMatch();
    const poll = setInterval(fetchSlotMatch, 10_000);
    const onVisible = () => { if (document.visibilityState === "visible") fetchSlotMatch(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", fetchSlotMatch);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", fetchSlotMatch);
    };
  }, [fetchSlotMatch]);

  // Auto-refresh: when verification status transitions to a terminal result,
  // immediately re-fetch match data (don't wait for the next 10 s poll cycle)
  // and invalidate the user balance so diamonds show up in the header at once.
  const prevVerifStatusRef = useRef<string | undefined>(undefined);
  const { invalidateUser } = useAuth();
  useEffect(() => {
    const cur = slotMatch?.match?.verificationStatus;
    const prev = prevVerifStatusRef.current;
    prevVerifStatusRef.current = cur;
    if (!cur || cur === prev) return;
    const terminal = cur === "reward_distributed" || cur === "winner_decided" || cur === "disputed";
    if (terminal) {
      fetchSlotMatch();
      invalidateUser();
    }
  }, [slotMatch?.match?.verificationStatus, fetchSlotMatch, invalidateUser]);


  const t: any = data ?? {};

  /* ── matchSettings parse (for match details & rules) ── */
  const ms: Record<string, string | number | boolean> = (() => {
    try { return t.matchSettings ? JSON.parse(t.matchSettings) : {}; } catch { return {}; }
  })();
  const msTeamFormat    = String(ms.teamFormat    ?? t.gameMode ?? "—");
  const msMinLevel      = String(ms.minLevel      ?? "40");
  const msRounds        = String(ms.rounds        ?? "9 (First to 5 wins)");
  const msHp            = String(ms.hp            ?? "200");
  const msEp            = String(ms.ep            ?? "0");
  const msMovementSpeed = String(ms.movementSpeed ?? "100%");
  const msJumpHeight    = String(ms.jumpHeight    ?? "100%");
  const msAmmoLimit     = ms.ammoLimit     ? "Yes" : "No";
  const msGunAttr       = ms.gunAttributes ? "Allowed" : "Not Allowed";
  const msOnlyHeadshot  = ms.onlyHeadshot  ? "Yes" : "No";
  const msEmulators     = ms.emulators     ? "Allowed" : "Not Allowed";
  const matchRules: string[] = t.rules
    ? (t.rules as string).split("\n").filter(Boolean)
    : ["No emulators allowed", "No PC players allowed", "No teaming", "Proof required on dispute"];

  // Slot timing window (from matchSettings.timeSlots) — display only, NOT used for countdown
  const { slotStartTime, slotEndTime, slotLabel } = useMemo(() => {
    const slotIndex = slotIndexFromPath;
    if (slotIndex !== null && data) {
      try {
        const parsed = typeof t.matchSettings === "string" ? JSON.parse(t.matchSettings) : (t.matchSettings ?? {});
        const slots: Array<{ startTime: string; endTime?: string; label?: string }> = Array.isArray(parsed.timeSlots) ? parsed.timeSlots : [];
        const slot = slots[slotIndex];
        if (slot?.startTime) {
          return {
            slotStartTime: slot.startTime,
            slotEndTime: slot.endTime ?? null,
            slotLabel: slot.label || `Slot ${slotIndex + 1}`,
          };
        }
      } catch { /* fall through */ }
    }
    return { slotStartTime: null, slotEndTime: null, slotLabel: null };
  }, [slotIndexFromPath, data]);

  // Admin-confirmed match start time — only use per-match scheduledAt; null = not yet confirmed
  const confirmedStartTime: string | null = slotMatch?.match?.scheduledAt ?? null;
  const countdown = useCountdown(confirmedStartTime);

  /* Compute whether credentials should be visible:
     - admin manually released (credentialsReleased = true), OR
     - auto-unlock time has passed (credentialUnlockAt is in the past) */
  const credentialUnlockAt: string | null = t.credentialUnlockAt ?? null;
  const unlockCountdown = useCountdown(credentialUnlockAt);

  // Auto-release countdown: when releaseMode === "auto", derive release time from
  // scheduledAt minus the offset configured by admin (e.g. 5 min before start)
  const autoReleaseAt: string | null = useMemo(() => {
    const m = slotMatch?.match;
    if (!m || m.releaseMode !== "auto" || !m.scheduledAt) return null;
    const offset = m.releaseOffsetMinutes ?? 5;
    return new Date(new Date(m.scheduledAt).getTime() - offset * 60_000).toISOString();
  }, [slotMatch]);
  const autoReleaseCountdown = useCountdown(autoReleaseAt);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const autoUnlocked = credentialUnlockAt ? now >= new Date(credentialUnlockAt).getTime() : false;
  const slotMatchUnlocked: boolean = slotMatch?.match?.isUnlocked === true;
  const credentialsReleased: boolean = (t.credentialsReleased ?? false) || autoUnlocked || slotMatchUnlocked;
  // Prefer slot-match credentials (per-match), fall back to tournament-level
  const effectiveRoomId: string | null = slotMatch?.match?.roomId ?? t.roomId ?? null;
  const effectiveRoomPassword: string | null = slotMatch?.match?.roomPassword ?? t.roomPassword ?? null;
  const effectiveShareMode: string = slotMatch?.match?.credentialShareMode ?? t.credentialShareMode ?? "both";
  const effectiveDirectLink: string | null = slotMatch?.match?.roomDirectLink ?? t.roomDirectLink ?? null;
  const showCreds = credentialsReleased && !!effectiveRoomId;
  const showFF    = credentialsReleased && !!effectiveDirectLink;

  /* Derive real status from confirmed start time so the badge doesn't lag behind */
  const startMs = confirmedStartTime ? new Date(confirmedStartTime).getTime() : null;
  const startHasPassed = startMs !== null && startMs <= Date.now();
  const isUpcoming   = t.status === "upcoming" && !startHasPassed;
  const isOngoing    = t.status === "ongoing" || (t.status === "upcoming" && startHasPassed);
  const isCompleted  = t.status === "completed";
  const isCancelled  = t.status === "cancelled";

  useEffect(() => {
    if (credentialsReleased && data?.roomId && !roomViewedRef.current) {
      roomViewedRef.current = true;
      haptic.successTap();
      authFetch(`/tournaments/${data.id}/room-viewed`, { method: "POST" }).catch(() => {});
    }
  }, [credentialsReleased, data]);

  const handleReady = async () => {
    if (readyLoading || isReady || !data) return;
    setReadyLoading(true);
    try {
      const res = await authFetch(`/tournaments/${data.id}/ready`, { method: "POST" });
      if (res.ok) {
        const r = await res.json();
        haptic.mediumTap();
        setIsReady(true);
        setReadyAt(r.readyAt);
        toast({ title: "Marked as Ready", description: "You're ready for the match. Good luck!" });
      }
    } catch {
      haptic.errorTap();
      toast({ title: "Failed", description: "Could not mark ready. Try again.", variant: "destructive" });
    } finally {
      setReadyLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen p-4 gap-4" style={{ background: "#0a0a0b" }}>
        <Skeleton className="w-10 h-10 rounded-full" />
        <Skeleton className="w-full h-36 rounded-2xl mt-4" />
        <Skeleton className="w-3/4 h-6" />
        <Skeleton className="w-full h-24 rounded-2xl" />
        <Skeleton className="w-full h-24 rounded-2xl" />
      </div>
    );
  }

  if (!data || !data.isJoined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center" style={{ background: "#0a0a0b" }}>
        <ShieldAlert className="w-12 h-12 text-zinc-600 mb-4" />
        <p className="text-white font-bold text-lg mb-1">Match not found</p>
        <p className="text-zinc-500 text-sm mb-6">This match doesn't exist or you haven't joined it.</p>
        <button
          onClick={() => window.history.back()}
          className="px-6 py-2.5 rounded-2xl font-bold text-[13px] text-white"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
        >
          Back
        </button>
      </div>
    );
  }

  const coverUrl = resolveImageUrl(t.coverImageUrl);

  /* ─ Step states ─ */
  const stepRegistered = true;
  const stepCredentials = credentialsReleased;
  const stepReady = isReady;
  const stepPlay = isCompleted;

  return (
    <>
    <div className="min-h-screen pb-32" style={{ background: "#0a0a0b" }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      {/* Cover image */}
      {coverUrl && (
        <div className="relative w-full h-44 overflow-hidden">
          <CachedImg src={coverUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom,rgba(10,10,11,0.2) 0%,rgba(10,10,11,1) 100%)" }} />
        </div>
      )}

      {/* Header */}
      <div className={`px-4 ${coverUrl ? "-mt-8 relative z-10" : "pt-12"}`}>
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => window.history.back()}
            className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            <ArrowLeft className="w-4 h-4 text-zinc-300" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-0.5">My Match</p>
            <h1 className="text-[16px] font-extrabold text-white leading-tight line-clamp-1">{t.title}</h1>
          </div>
        </div>

        {/* Status pill */}
        {(isUpcoming || isOngoing) && (
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-4"
            style={{
              background: isOngoing ? "rgba(52,211,153,0.12)" : "rgba(96,165,250,0.12)",
              border: isOngoing ? "1px solid rgba(52,211,153,0.3)" : "1px solid rgba(96,165,250,0.3)",
            }}
          >
            {isOngoing && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
            {isOngoing ? <Flame className="w-3 h-3 text-emerald-400" /> : <Clock className="w-3 h-3 text-blue-400" />}
            <span className="text-[10px] font-extrabold tracking-wider" style={{ color: isOngoing ? "#34d399" : "#60a5fa" }}>
              {isOngoing ? "LIVE NOW" : "UPCOMING"}
            </span>
          </div>
        )}

        {/* Cancellation banner */}
        {isCancelled && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-4 mb-4"
            style={{ background: "linear-gradient(135deg,rgba(239,68,68,0.12),rgba(220,38,38,0.06))", border: "1px solid rgba(239,68,68,0.35)", boxShadow: "0 0 24px rgba(239,68,68,0.08)" }}
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <XCircle className="w-4 h-4 text-red-400" />
              </div>
              <div className="flex-1">
                <p className="text-[12px] font-extrabold text-red-400 uppercase tracking-wide mb-1">Match Cancelled</p>
                {t.cancelReason ? (
                  <p className="text-[12px] text-zinc-300 leading-relaxed">
                    <span className="text-zinc-500 text-[11px]">Reason: </span>{t.cancelReason}
                  </p>
                ) : (
                  <p className="text-[11px] text-zinc-500">This match has been cancelled by the administrator.</p>
                )}
                {t.entryFeeDiamonds > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-xl w-fit" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
                    <span className="text-green-400 text-[11px] font-bold">💎 {t.entryFeeDiamonds} refunded to your wallet</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Slot timing card — shown when navigated via slot_N path */}
        {slotLabel && slotStartTime && (
          <div className="rounded-2xl overflow-hidden mb-4"
            style={{ background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.25)" }}>
            {/* Header */}
            <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-white/5">
              <Clock className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-violet-400/80">
                {slotLabel} · {format(new Date(slotStartTime), "EEEE, MMM d, yyyy")}
              </span>
            </div>
            {/* Rows */}
            <div className="divide-y divide-white/5">
              {/* Slot window */}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-[11px] text-zinc-500">Slot Window</span>
                <span className="text-[13px] font-bold text-white">
                  {format(new Date(slotStartTime), "h:mm a")}
                  {slotEndTime
                    ? <span className="text-zinc-400"> – {format(new Date(slotEndTime), "h:mm a")}</span>
                    : null}
                </span>
              </div>
              {/* Admin-confirmed match start */}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-[11px] text-zinc-500">Match Start Time</span>
                {confirmedStartTime ? (
                  <span className="text-[13px] font-bold text-green-400">
                    {format(new Date(confirmedStartTime), "h:mm a")}
                  </span>
                ) : (
                  <span className="text-[13px] font-bold text-zinc-600 font-mono tracking-wider">--:--:--
                    <span className="text-[9px] text-zinc-700 font-sans ml-1.5 normal-case tracking-normal">not confirmed</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Countdown — only when admin has confirmed a start time and it hasn't passed yet */}
        {countdown && isUpcoming && confirmedStartTime ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-5 mb-4"
            style={{ background: "linear-gradient(135deg,rgba(139,92,246,0.1),rgba(99,102,241,0.06))", border: "1px solid rgba(139,92,246,0.25)", boxShadow: "0 0 30px rgba(139,92,246,0.1)" }}
          >
            <p className="text-[9px] text-purple-400/70 uppercase tracking-[0.2em] font-bold text-center mb-3">Match Starts In</p>
            <div className="flex items-end justify-center gap-2">
              {countdown.d > 0 && (
                <>
                  <div className="flex flex-col items-center">
                    <span className="font-mono font-black text-4xl text-white tabular-nums leading-none" style={{ textShadow: "0 0 24px rgba(139,92,246,0.7)" }}>{pad(countdown.d)}</span>
                    <span className="text-[9px] text-zinc-600 uppercase tracking-widest mt-1">days</span>
                  </div>
                  <span className="font-mono font-black text-3xl text-purple-500/50 pb-4">:</span>
                </>
              )}
              <div className="flex flex-col items-center">
                <span className="font-mono font-black text-4xl text-white tabular-nums leading-none" style={{ textShadow: "0 0 24px rgba(139,92,246,0.7)" }}>{pad(countdown.h)}</span>
                <span className="text-[9px] text-zinc-600 uppercase tracking-widest mt-1">hrs</span>
              </div>
              <span className="font-mono font-black text-3xl text-purple-500/50 pb-4">:</span>
              <div className="flex flex-col items-center">
                <span className="font-mono font-black text-4xl text-white tabular-nums leading-none" style={{ textShadow: "0 0 24px rgba(139,92,246,0.7)" }}>{pad(countdown.m)}</span>
                <span className="text-[9px] text-zinc-600 uppercase tracking-widest mt-1">min</span>
              </div>
              <span className="font-mono font-black text-3xl text-purple-500/50 pb-4">:</span>
              <div className="flex flex-col items-center">
                <span className="font-mono font-black text-4xl text-white tabular-nums leading-none" style={{ textShadow: "0 0 24px rgba(139,92,246,0.7)" }}>{pad(countdown.s)}</span>
                <span className="text-[9px] text-zinc-600 uppercase tracking-widest mt-1">sec</span>
              </div>
            </div>
          </motion.div>
        ) : isUpcoming && !confirmedStartTime ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl px-4 py-4 mb-4 flex items-start gap-3"
            style={{ background: "linear-gradient(135deg,rgba(245,158,11,0.08),rgba(0,0,0,0.3))", border: "1px solid rgba(245,158,11,0.2)" }}
          >
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)" }}>
              <Hourglass className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-[12px] font-bold text-amber-300 mb-0.5">Match Timing Pending</p>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                You'll get your match start timing once the Clash Ren team confirms your match. We'll notify you as soon as it's set!
              </p>
            </div>
          </motion.div>
        ) : null}

        {/* Info strip */}
        <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {[
            { icon: <Calendar className="w-3.5 h-3.5 text-zinc-500" />, label: slotLabel ? `Date · ${slotLabel}` : "Date", value: slotStartTime ? format(new Date(slotStartTime), "MMM d, yyyy") : (confirmedStartTime ? format(new Date(confirmedStartTime), "MMM d, yyyy") : "—") },
            { icon: <Gem className="w-3.5 h-3.5 text-blue-400" />, label: "Entry Fee", value: t.entryFeeDiamonds > 0 ? `${t.entryFeeDiamonds}` : "Free", isDiamond: t.entryFeeDiamonds > 0 },
            { icon: <Trophy className="w-3.5 h-3.5 text-yellow-400" />, label: "Prize Pool", value: t.prizePoolDiamonds ? `${t.prizePoolDiamonds}` : "—", isDiamond: !!t.prizePoolDiamonds },
          ].map((row, i, arr) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-3 ${i < arr.length - 1 ? "border-b border-white/5" : ""}`}>
              {row.icon}
              <span className="text-[11px] text-zinc-500 flex-1">{row.label}</span>
              <span className="text-[12px] font-bold text-zinc-200 flex items-center gap-1">
                {row.value}
                {row.isDiamond && <Gem className="w-3 h-3 text-blue-400" />}
              </span>
            </div>
          ))}
        </div>

        {/* ── Room Credentials (always visible when upcoming/ongoing) ── */}
        {(isUpcoming || isOngoing) && (
          <div className="mb-4">
            {credentialsReleased && (effectiveRoomId || effectiveDirectLink) ? (
              /* Released state */
              <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(34,197,94,0.3)", background: "linear-gradient(135deg,rgba(34,197,94,0.08),rgba(0,0,0,0.4))" }}>
                <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(34,197,94,0.15)" }}>
                      <Key className="w-3 h-3 text-green-400" />
                    </div>
                    <span className="text-xs font-bold text-green-400 uppercase tracking-wider">Room Credentials</span>
                  </div>
                </div>
                {showCreds && (
                  <div className="px-4 py-4 grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1.5 font-bold">Room ID</div>
                      <div className="flex items-center gap-2 bg-black/50 px-3 py-2.5 rounded-xl border border-white/5">
                        <span className="font-mono text-white text-xl font-black select-all flex-1">{effectiveRoomId}</span>
                        <button
                          className="shrink-0 text-zinc-500 hover:text-violet-400 active:scale-90 transition-all"
                          onClick={() => { haptic.mediumTap(); navigator.clipboard.writeText(effectiveRoomId ?? ""); toast({ title: "Copied", description: "Room ID copied." }); fireGameOpened(); }}
                        ><Copy className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1.5 font-bold">Password</div>
                      <div className="flex items-center gap-2 bg-black/50 px-3 py-2.5 rounded-xl border border-white/5">
                        <span className="font-mono text-white text-xl font-black select-all flex-1">{effectiveRoomPassword}</span>
                        <button
                          className="shrink-0 text-zinc-500 hover:text-violet-400 active:scale-90 transition-all"
                          onClick={() => { haptic.mediumTap(); navigator.clipboard.writeText(effectiveRoomPassword ?? ""); toast({ title: "Copied", description: "Password copied." }); fireGameOpened(); }}
                        ><Copy className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </div>
                )}
                {showFF && (
                  <div className={`px-4 pb-4 ${showCreds ? "pt-2" : "pt-4"}`}>
                    <button
                      className="relative w-full overflow-hidden rounded-2xl flex items-center gap-3.5 px-4 transition-transform duration-100 active:scale-[0.98]"
                      style={{
                        height: 68,
                        background: "linear-gradient(120deg,#c2410c 0%,#dc2626 50%,#b91c1c 100%)",
                        boxShadow: "0 2px 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                      onClick={() => { haptic.mediumTap(); fireGameOpened(); window.location.href = effectiveDirectLink || "freefire://"; }}
                    >
                      {/* left icon badge */}
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.1)" }}
                      >
                        <Swords className="w-5 h-5 text-orange-200" />
                      </div>
                      {/* text */}
                      <div className="flex-1 text-left">
                        <p className="text-[15px] font-extrabold text-white leading-none tracking-wide">Open in Free Fire</p>
                        <p className="text-[10px] text-red-200/60 font-medium mt-1 tracking-wide">Join your room directly in-game</p>
                      </div>
                      {/* right chevron */}
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: "rgba(0,0,0,0.2)" }}
                      >
                        <ArrowLeft className="w-3.5 h-3.5 text-white/60 rotate-180" />
                      </div>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Locked state — always shown */
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl px-4 py-5 flex flex-col items-center text-center gap-2"
                style={{ border: "1px solid rgba(168,85,247,0.18)", background: "linear-gradient(135deg, rgba(168,85,247,0.07) 0%, rgba(0,0,0,0.35) 100%)" }}
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-1" style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.3)" }}>
                  <Lock className="w-5 h-5 text-violet-400" />
                </div>
                <p className="text-xs font-bold text-violet-300 uppercase tracking-wider">Room Credentials Locked</p>
                {credentialUnlockAt && unlockCountdown ? (
                  <>
                    <p className="text-[11px] text-zinc-500">Credentials unlock in</p>
                    <div className="font-mono font-black text-2xl text-violet-300 tabular-nums" style={{ textShadow: "0 0 18px rgba(168,85,247,0.6)" }}>
                      {unlockCountdown.d > 0 ? `${pad(unlockCountdown.d)}d ` : ""}{pad(unlockCountdown.h)}:{pad(unlockCountdown.m)}:{pad(unlockCountdown.s)}
                    </div>
                    <p className="text-[10px] text-zinc-600">
                      Unlocks at {new Date(credentialUnlockAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </>
                ) : autoReleaseCountdown ? (
                  <>
                    <p className="text-[11px] text-zinc-500">Auto-releases in</p>
                    <div className="font-mono font-black text-2xl text-violet-300 tabular-nums" style={{ textShadow: "0 0 18px rgba(168,85,247,0.6)" }}>
                      {autoReleaseCountdown.d > 0 ? `${pad(autoReleaseCountdown.d)}d ` : ""}{pad(autoReleaseCountdown.h)}:{pad(autoReleaseCountdown.m)}:{pad(autoReleaseCountdown.s)}
                    </div>
                    <p className="text-[10px] text-zinc-600">
                      Releases {(slotMatch?.match?.releaseOffsetMinutes ?? 5)} min before match start
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] text-zinc-500">The ClashRen member will release the room credentials before the match begins.</p>
                )}
              </motion.div>
            )}
          </div>
        )}

        {/* ── Match Details ── */}
        {data && (
          <div className="mb-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600 mb-2.5">Match Details</p>
            <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
              {[
                { label: "Team Format",    value: msTeamFormat },
                { label: "Map",            value: t.map || "Iron Cage" },
                ...(t.region ? [{ label: "Region", value: t.region }] : []),
                ...(t.estimatedDuration ? [{ label: "Est. Duration", value: t.estimatedDuration }] : []),
                { label: "Minimum Level",  value: msMinLevel },
                { label: "Rounds",         value: msRounds },
                { label: "HP",             value: msHp },
                { label: "EP",             value: msEp },
                { label: "Movement Speed", value: msMovementSpeed },
                { label: "Jump Height",    value: msJumpHeight },
                { label: "Ammo Limit",     value: msAmmoLimit },
                { label: "Gun Attributes", value: msGunAttr },
                { label: "Only Headshot",  value: msOnlyHeadshot },
                { label: "Emulators",      value: msEmulators },
              ].map(({ label, value }, i, arr) => (
                <div key={label} className={`px-4 py-3 flex items-center justify-between ${i < arr.length - 1 ? "border-b border-white/5" : ""}`}>
                  <span className="text-[11px] text-zinc-500 font-medium">{label}</span>
                  <span className="text-[12px] font-bold text-white/90 capitalize">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Rules ── */}
        {data && (
          <div className="mb-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600 mb-2.5">Rules</p>
            <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
              {matchRules.map((rule, i) => (
                <div key={i} className={`flex items-start gap-3.5 px-4 py-4 ${i < matchRules.length - 1 ? "border-b border-white/5" : ""}`}>
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 font-black text-[11px]"
                    style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", color: "#c084fc" }}
                  >
                    {i + 1}
                  </div>
                  <p className="text-[14px] font-semibold text-zinc-200 leading-snug flex-1">{rule}</p>
                </div>
              ))}
            </div>
          </div>
        )}


        {/* ══════════════════════════════════════════════════════════
              BATTLE INTELLIGENCE — full breakdown for completed matches
            ══════════════════════════════════════════════════════════ */}
        {isCompleted && slotMatch?.matchmaking && slotMatch?.match && slotMatch?.opponent && (() => {
          const m = slotMatch.match;
          const opp = slotMatch.opponent;
          const iWon = m.winnerId != null && m.winnerId === authUser?.id;
          const oppWon = m.winnerId != null && m.winnerId === opp?.id;
          const isPending = m.winnerId == null;

          const resultLabel = isPending ? "RESULT PENDING" : iWon ? "VICTORY" : "DEFEAT";
          const resultColor = isPending ? "#71717a" : iWon ? "#fbbf24" : "#f87171";
          const resultGlow  = iWon ? "0 0 60px rgba(251,191,36,0.18)" : "none";

          const myKills  = m.myKills;
          const oppKills = m.opponentKills;
          const hasKills = myKills !== null || oppKills !== null;
          const netProfit = (t.diamondsWon ?? 0) - (t.entryFeeDiamonds ?? 0);

          function Avatar({ src, name, won, pending }: { src?: string | null; name?: string; won: boolean; pending: boolean }) {
            const ring = won ? "#fbbf24" : pending ? "#52525b" : "#ef4444";
            const glowColor = won ? "rgba(251,191,36,0.35)" : "none";
            return (
              <div className="relative w-[72px] h-[72px] shrink-0">
                {won && !pending && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <Crown className="w-5 h-5" style={{ color: "#fbbf24", filter: "drop-shadow(0 0 6px rgba(251,191,36,0.7))" }} />
                  </div>
                )}
                <div
                  className="w-full h-full rounded-2xl overflow-hidden"
                  style={{
                    border: `2px solid ${ring}`,
                    boxShadow: won ? `0 0 20px ${glowColor}` : "none",
                    opacity: (!won && !pending) ? 0.55 : 1,
                  }}
                >
                  {src ? (
                    <CachedImg src={src} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-[28px] font-black"
                      style={{ background: won ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.04)", color: ring }}
                    >
                      {(name || "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          return (
            <div className="mb-4">
              {/* ── Hero result banner ── */}
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-3xl overflow-hidden mb-3"
                style={{
                  background: iWon
                    ? "linear-gradient(160deg, rgba(251,191,36,0.1) 0%, rgba(245,158,11,0.04) 60%, rgba(0,0,0,0.5) 100%)"
                    : isPending
                    ? "rgba(39,39,42,0.6)"
                    : "linear-gradient(160deg, rgba(239,68,68,0.09) 0%, rgba(220,38,38,0.03) 60%, rgba(0,0,0,0.5) 100%)",
                  border: `1px solid ${iWon ? "rgba(251,191,36,0.28)" : isPending ? "rgba(82,82,91,0.4)" : "rgba(239,68,68,0.22)"}`,
                  boxShadow: resultGlow,
                }}
              >
                {/* Result header */}
                <div className="pt-6 pb-1 text-center relative">
                  {!isPending && (
                    <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${resultColor}40, transparent)` }} />
                  )}
                  <p className="text-[9px] font-extrabold uppercase tracking-[0.3em] mb-2" style={{ color: `${resultColor}80` }}>
                    Battle Result
                  </p>
                  <motion.p
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.15, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="text-[40px] font-black tracking-tight leading-none"
                    style={{
                      color: resultColor,
                      textShadow: iWon ? "0 0 48px rgba(251,191,36,0.5), 0 2px 4px rgba(0,0,0,0.8)" : "0 2px 4px rgba(0,0,0,0.6)",
                    }}
                  >
                    {resultLabel}
                  </motion.p>
                  <p className="text-[11px] mt-1.5 mb-4" style={{ color: iWon ? "#a16207" : isPending ? "#52525b" : "#7f1d1d" }}>
                    {iWon ? "You outplayed your opponent" : isPending ? "Awaiting admin decision" : "You were defeated in battle"}
                  </p>
                </div>

                {/* VS panel */}
                <div className="px-5 pb-5 flex items-center gap-0">
                  {/* My side */}
                  <div className="flex-1 flex flex-col items-center gap-2 pt-3">
                    <Avatar
                      src={authUser?.profilePicture ? resolveImageUrl(authUser.profilePicture) : null}
                      name={authUser?.inGameName}
                      won={iWon}
                      pending={isPending}
                    />
                    <div className="text-center min-w-0 w-full px-1">
                      <p className="text-[13px] font-extrabold text-white leading-tight truncate">{authUser?.inGameName ?? "You"}</p>
                      <p className="text-[9px] text-zinc-600 font-mono mt-0.5 tracking-wider">
                        {authUser?.uid ? maskUid(authUser.uid) : "—"}
                      </p>
                      <p className="text-[8px] text-zinc-700 uppercase tracking-[0.15em] mt-0.5 font-semibold">You</p>
                    </div>
                    {/* My result pill */}
                    {!isPending && (
                      <div
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide"
                        style={iWon
                          ? { background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)", color: "#fbbf24" }
                          : { background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
                      >
                        {iWon ? <Crown className="w-2.5 h-2.5" /> : <Shield className="w-2.5 h-2.5" />}
                        {iWon ? "Winner" : "Defeated"}
                      </div>
                    )}
                    {/* My kills */}
                    {myKills !== null && (
                      <div className="flex items-center gap-1.5">
                        <Skull className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="text-[22px] font-black text-white tabular-nums leading-none">{myKills}</span>
                        <span className="text-[10px] text-zinc-600 font-bold mt-1">kills</span>
                      </div>
                    )}
                  </div>

                  {/* Center divider */}
                  <div className="flex flex-col items-center gap-1.5 px-2 shrink-0 self-stretch justify-center">
                    <div className="w-px flex-1" style={{ background: "linear-gradient(to bottom, transparent, rgba(255,255,255,0.1), transparent)" }} />
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <Swords className="w-4 h-4 text-zinc-500" />
                    </div>
                    <div className="w-px flex-1" style={{ background: "linear-gradient(to bottom, transparent, rgba(255,255,255,0.1), transparent)" }} />
                  </div>

                  {/* Opponent side */}
                  <div className="flex-1 flex flex-col items-center gap-2 pt-3">
                    <Avatar
                      src={opp?.profilePicture ? resolveImageUrl(opp.profilePicture) : null}
                      name={opp?.inGameName}
                      won={oppWon}
                      pending={isPending}
                    />
                    <div className="text-center min-w-0 w-full px-1">
                      <p className="text-[13px] font-extrabold text-white leading-tight truncate">{opp?.inGameName ?? "Opponent"}</p>
                      <p className="text-[9px] text-zinc-600 font-mono mt-0.5 tracking-wider">
                        {opp?.uid ? maskUid(opp.uid) : "—"}
                      </p>
                      <p className="text-[8px] text-zinc-700 uppercase tracking-[0.15em] mt-0.5 font-semibold">Opponent</p>
                    </div>
                    {/* Opponent result pill */}
                    {!isPending && (
                      <div
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide"
                        style={oppWon
                          ? { background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)", color: "#fbbf24" }
                          : { background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
                      >
                        {oppWon ? <Crown className="w-2.5 h-2.5" /> : <Shield className="w-2.5 h-2.5" />}
                        {oppWon ? "Winner" : "Defeated"}
                      </div>
                    )}
                    {/* Opponent kills */}
                    {oppKills !== null && (
                      <div className="flex items-center gap-1.5">
                        <Skull className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="text-[22px] font-black text-white tabular-nums leading-none">{oppKills}</span>
                        <span className="text-[10px] text-zinc-600 font-bold mt-1">kills</span>
                      </div>
                    )}
                    {/* Report button — opponent only */}
                    <button
                      onClick={() => { setReportOpen(true); setReportReason(null); setReportDone(false); haptic("light"); }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide mt-0.5 transition-all active:scale-95"
                      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", color: "#f87171" }}
                    >
                      <AlertTriangle className="w-2.5 h-2.5" />
                      Report
                    </button>
                  </div>
                </div>

                {/* Kill differential bar — only when both are known */}
                {hasKills && myKills !== null && oppKills !== null && (myKills + oppKills) > 0 && (
                  <div className="px-5 pb-5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-bold text-zinc-500">{myKills}</span>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.round((myKills / (myKills + oppKills)) * 100)}%` }}
                          transition={{ delay: 0.3, duration: 0.6, ease: "easeOut" }}
                          className="h-full rounded-full"
                          style={{ background: iWon ? "linear-gradient(90deg,#fbbf24,#f59e0b)" : "linear-gradient(90deg,#f87171,#ef4444)" }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-zinc-500">{oppKills}</span>
                    </div>
                    <p className="text-center text-[9px] text-zinc-700 font-bold uppercase tracking-widest">Kill Ratio</p>
                  </div>
                )}

                {/* Admin notes */}
                {m.notes && (
                  <div className="mx-4 mb-4 px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Match Notes</p>
                    <p className="text-[12px] text-zinc-400 leading-relaxed">{m.notes}</p>
                  </div>
                )}
              </motion.div>

              {/* ── Match Result Panel ── */}
              {m.winnerId != null && (() => {
                const winnerName = m.winnerId === authUser?.id ? (authUser?.inGameName ?? "You") : (opp?.inGameName ?? "Opponent");
                const loserName  = m.winnerId === authUser?.id ? (opp?.inGameName ?? "Opponent") : (authUser?.inGameName ?? "You");
                const vType: string | null = m.verificationType ?? null;
                const vConf: number | null = m.verificationConfidence ?? null;

                const typeLabel  = vType === "auto" ? "Auto Verified" : vType === "manual" ? "Manually Reviewed" : null;
                const typeColor  = vType === "auto" ? "#34d399" : vType === "manual" ? "#a78bfa" : "#52525b";
                const typeBg     = vType === "auto" ? "rgba(34,197,94,0.12)" : vType === "manual" ? "rgba(167,139,250,0.12)" : "rgba(255,255,255,0.04)";
                const typeBorder = vType === "auto" ? "rgba(34,197,94,0.3)" : vType === "manual" ? "rgba(167,139,250,0.3)" : "rgba(255,255,255,0.08)";

                return (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.35, ease: "easeOut" }}
                    className="rounded-2xl overflow-hidden mb-3"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    {/* Header */}
                    <div className="px-4 pt-3 pb-2.5 border-b border-white/5 flex items-center gap-2">
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-zinc-500">Match Result</span>
                    </div>

                    {/* Winner / Loser rows */}
                    <div className="px-4 pt-3 pb-2 space-y-2.5">
                      {/* Winner */}
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)" }}>
                          <Crown className="w-3.5 h-3.5 text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-600 leading-none mb-0.5">Winner</p>
                          <p className="text-[14px] font-extrabold text-white truncate leading-tight">{winnerName}</p>
                        </div>
                        <div className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide shrink-0"
                          style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.28)", color: "#fbbf24" }}>
                          Victory
                        </div>
                      </div>

                      <div className="h-px bg-white/5 mx-1" />

                      {/* Loser */}
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                          <XCircle className="w-3.5 h-3.5 text-red-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-600 leading-none mb-0.5">Defeated</p>
                          <p className="text-[14px] font-extrabold text-zinc-400 truncate leading-tight">{loserName}</p>
                        </div>
                        <div className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide shrink-0"
                          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", color: "#f87171" }}>
                          Defeated
                        </div>
                      </div>
                    </div>

                    {/* Verification row */}
                    {typeLabel && (
                      <div className="mx-4 mb-3 mt-1 px-3 py-2.5 rounded-xl" style={{ background: typeBg, border: `1px solid ${typeBorder}` }}>
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3" style={{ color: typeColor }} />
                            <span className="text-[11px] font-extrabold" style={{ color: typeColor }}>{typeLabel}</span>
                          </div>
                          {vConf != null && (
                            <span className="text-[13px] font-black tabular-nums" style={{ color: typeColor }}>
                              {vConf}%
                            </span>
                          )}
                        </div>
                        {vConf != null && (
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: `linear-gradient(90deg, ${typeColor}aa, ${typeColor})` }}
                              initial={{ width: 0 }}
                              animate={{ width: `${vConf}%` }}
                              transition={{ delay: 0.4, duration: 0.7, ease: "easeOut" }}
                            />
                          </div>
                        )}
                        <p className="text-[9px] mt-1.5 leading-relaxed" style={{ color: `${typeColor}99` }}>
                          {vType === "auto"
                            ? "Outcome verified automatically against live Free Fire stats"
                            : "Outcome verified and confirmed by a Clash Ren admin"}
                        </p>
                      </div>
                    )}
                  </motion.div>
                );
              })()}

              {/* ── Reward Already Distributed — Security Banner ── */}
              {m.verificationStatus === "reward_distributed" && (() => {
                const isWinner    = m.winnerId === authUser?.id;
                const prize       = m.prizeAmountDiamonds ?? 0;
                const distributedAt = m.rewardDistributedAt
                  ? format(new Date(m.rewardDistributedAt), "MMM d, yyyy · h:mm a")
                  : null;

                return (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 0.18, duration: 0.35, ease: "easeOut" }}
                    className="rounded-2xl overflow-hidden mb-3"
                    style={{
                      background: isWinner
                        ? "linear-gradient(135deg, rgba(34,197,94,0.06) 0%, rgba(16,185,129,0.04) 100%)"
                        : "rgba(255,255,255,0.015)",
                      border: isWinner
                        ? "1px solid rgba(34,197,94,0.25)"
                        : "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    {/* Header row */}
                    <div className="px-4 pt-3 pb-2.5 border-b flex items-center justify-between"
                      style={{ borderColor: isWinner ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.05)" }}>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-lg flex items-center justify-center"
                          style={{
                            background: isWinner ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)",
                            border: isWinner ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.09)",
                          }}>
                          <CheckCircle className="w-3 h-3" style={{ color: isWinner ? "#34d399" : "#52525b" }} />
                        </div>
                        <span className="text-[9px] font-extrabold uppercase tracking-[0.22em]"
                          style={{ color: isWinner ? "#34d399" : "#52525b" }}>
                          Reward Already Distributed
                        </span>
                      </div>
                      {/* Tamper-proof lock badge */}
                      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <Lock className="w-2.5 h-2.5 text-zinc-600" />
                        <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-wide">Locked</span>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="px-4 py-3 space-y-2.5">
                      {/* Prize line */}
                      {prize > 0 && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Gem className="w-3.5 h-3.5 text-blue-400" />
                            <span className="text-[11px] font-semibold text-zinc-500">
                              {isWinner ? "Credited to your wallet" : "Credited to winner"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Gem className="w-3 h-3 text-blue-400" />
                            <span className="text-[15px] font-black tabular-nums"
                              style={{ color: isWinner ? "#60a5fa" : "#52525b" }}>
                              {prize.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Timestamp */}
                      {distributedAt && (
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3 text-zinc-700" />
                          <span className="text-[10px] text-zinc-600">Distributed {distributedAt}</span>
                        </div>
                      )}

                      {/* Security notice */}
                      <div className="flex items-start gap-2 pt-1 pb-0.5 px-3 py-2 rounded-xl"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <ShieldAlert className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-zinc-600 leading-relaxed">
                          This match is closed. No additional rewards can be issued.
                          {!isWinner && prize > 0
                            ? " If you believe this is an error, use the dispute system below."
                            : ""}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })()}

              {/* ── Earnings card ── */}
              {(t.diamondsWon > 0 || t.entryFeeDiamonds > 0) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.35, ease: "easeOut" }}
                  className="rounded-2xl overflow-hidden mb-3"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <div className="px-4 pt-3 pb-2 border-b border-white/5 flex items-center gap-2">
                    <Gem className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-zinc-500">Earnings Breakdown</span>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between gap-4">
                    {/* Prize */}
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold">Prize Won</span>
                      <span className="text-[18px] font-black" style={{ color: t.diamondsWon > 0 ? "#34d399" : "#52525b" }}>
                        {t.diamondsWon > 0 ? `+${t.diamondsWon}` : "—"}
                      </span>
                      {t.diamondsWon > 0 && <Gem className="w-3 h-3 text-blue-400 -mt-0.5" />}
                    </div>
                    {/* Divider */}
                    <div className="w-px h-10 bg-white/5" />
                    {/* Entry fee */}
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold">Entry Fee</span>
                      <span className="text-[18px] font-black text-zinc-500">
                        {t.entryFeeDiamonds > 0 ? `-${t.entryFeeDiamonds}` : "Free"}
                      </span>
                      {t.entryFeeDiamonds > 0 && <Gem className="w-3 h-3 text-blue-400 -mt-0.5" />}
                    </div>
                    {/* Divider */}
                    <div className="w-px h-10 bg-white/5" />
                    {/* Net */}
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold">Net</span>
                      <span
                        className="text-[18px] font-black"
                        style={{ color: netProfit > 0 ? "#34d399" : netProfit < 0 ? "#f87171" : "#52525b" }}
                      >
                        {netProfit > 0 ? `+${netProfit}` : netProfit === 0 ? "±0" : `${netProfit}`}
                      </span>
                      <Gem className="w-3 h-3 text-blue-400 -mt-0.5" />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── Match Status Timeline ── */}
              {(() => {
                const isRewarded = (t.diamondsWon ?? 0) > 0;
                const winnerKnown = m.winnerId != null;
                const verifDone = winnerKnown || m.verificationStatus === "completed";
                const battleStarted = m.status === "completed" || m.status === "ongoing";
                const roomReleased = m.credentialsReleasedAt != null || m.status === "completed";

                type TStep = {
                  label: string;
                  ts: string | null;
                  detail: string;
                  done: boolean;
                  color: string;
                  icon: React.ReactNode;
                };

                const steps: TStep[] = [
                  {
                    label: "Match Created",
                    ts: m.createdAt ? format(new Date(m.createdAt), "MMM d · h:mm a") : null,
                    detail: "Your 1v1 match was assigned by the system",
                    done: true,
                    color: "#a78bfa",
                    icon: <Zap className="w-3 h-3" />,
                  },
                  {
                    label: "Room Released",
                    ts: m.credentialsReleasedAt
                      ? format(new Date(m.credentialsReleasedAt), "MMM d · h:mm a")
                      : roomReleased ? "Before match start" : null,
                    detail: "Room ID & Password shared with both players",
                    done: roomReleased,
                    color: "#60a5fa",
                    icon: <Key className="w-3 h-3" />,
                  },
                  {
                    label: "Players Joined",
                    ts: m.scheduledAt && battleStarted
                      ? `By ${format(new Date(m.scheduledAt), "h:mm a")}`
                      : null,
                    detail: "Both players entered the custom room",
                    done: battleStarted,
                    color: "#34d399",
                    icon: <Users className="w-3 h-3" />,
                  },
                  {
                    label: "Battle Started",
                    ts: m.scheduledAt && battleStarted
                      ? format(new Date(m.scheduledAt), "MMM d · h:mm a")
                      : null,
                    detail: "1v1 combat commenced in Free Fire",
                    done: battleStarted,
                    color: "#f97316",
                    icon: <Swords className="w-3 h-3" />,
                  },
                  {
                    label: "Verification Running",
                    ts: verifDone
                      ? m.verificationStatus === "completed" ? "Auto-verified" : "Manually reviewed"
                      : null,
                    detail: "Kill counts & match outcome verified against in-game stats",
                    done: verifDone,
                    color: "#fbbf24",
                    icon: <Shield className="w-3 h-3" />,
                  },
                  {
                    label: "Winner Decided",
                    ts: winnerKnown
                      ? iWon ? `You won · ${authUser?.inGameName}` : `${opp?.inGameName ?? "Opponent"} won`
                      : null,
                    detail: winnerKnown
                      ? iWon ? "You outplayed your opponent" : "Your opponent prevailed"
                      : "Awaiting admin decision",
                    done: winnerKnown,
                    color: iWon ? "#fbbf24" : "#f87171",
                    icon: <Crown className="w-3 h-3" />,
                  },
                  {
                    label: "Reward Credited",
                    ts: isRewarded
                      ? `+${t.diamondsWon} 💎 added to wallet`
                      : winnerKnown && !iWon
                      ? "No reward — match lost"
                      : null,
                    detail: isRewarded
                      ? "Diamonds deposited to your Clash Ren wallet"
                      : "Winners receive the prize pool diamonds",
                    done: isRewarded || (winnerKnown && !iWon),
                    color: "#34d399",
                    icon: <Gem className="w-3 h-3" />,
                  },
                ];

                return (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25, duration: 0.35 }}
                    className="rounded-2xl overflow-hidden mb-3"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    {/* Header */}
                    <div className="px-4 pt-3.5 pb-2.5 border-b border-white/5 flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-zinc-500">Match Status Timeline</span>
                    </div>

                    {/* Steps */}
                    <div className="px-4 py-3 space-y-0">
                      {steps.map((step, i) => {
                        const isLast = i === steps.length - 1;
                        const nextDone = !isLast && steps[i + 1].done;
                        const lineColor = step.done && nextDone ? step.color : "rgba(255,255,255,0.05)";
                        return (
                          <div key={step.label} className="flex gap-3">
                            {/* Left: dot + connecting line */}
                            <div className="flex flex-col items-center shrink-0" style={{ width: 24 }}>
                              <motion.div
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: 0.3 + i * 0.06, duration: 0.3 }}
                                className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10"
                                style={step.done
                                  ? { background: `${step.color}1a`, border: `1.5px solid ${step.color}55`, color: step.color, boxShadow: `0 0 8px ${step.color}30` }
                                  : { background: "rgba(255,255,255,0.03)", border: "1.5px solid rgba(255,255,255,0.08)", color: "#52525b" }
                                }
                              >
                                {step.done
                                  ? <CheckCircle2 className="w-3 h-3" style={{ color: step.color }} />
                                  : <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                                }
                              </motion.div>
                              {!isLast && (
                                <motion.div
                                  className="w-px flex-1 my-0.5"
                                  style={{ minHeight: 24, background: lineColor }}
                                  initial={{ scaleY: 0, originY: 0 }}
                                  animate={{ scaleY: 1 }}
                                  transition={{ delay: 0.35 + i * 0.06, duration: 0.3 }}
                                />
                              )}
                            </div>

                            {/* Right: content */}
                            <div className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-3"}`}>
                              <div className="flex items-start justify-between gap-2 mb-0.5">
                                <p
                                  className="text-[12px] font-bold leading-snug"
                                  style={{ color: step.done ? "#e4e4e7" : "#52525b" }}
                                >
                                  {step.label}
                                </p>
                                {/* Icon badge */}
                                <div
                                  className="flex items-center justify-center w-5 h-5 rounded-lg shrink-0 mt-0.5"
                                  style={step.done
                                    ? { background: `${step.color}15`, color: step.color }
                                    : { background: "rgba(255,255,255,0.03)", color: "#52525b" }
                                  }
                                >
                                  {step.icon}
                                </div>
                              </div>
                              {step.ts && (
                                <p
                                  className="text-[10px] font-semibold mb-0.5"
                                  style={{ color: step.done ? step.color : "#3f3f46" }}
                                >
                                  {step.ts}
                                </p>
                              )}
                              <p className="text-[10px] text-zinc-600 leading-relaxed">{step.detail}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                );
              })()}

              {/* ── Verification Analysis ── */}
              {slotMatch.match.statAnalysis && (slotMatch.match.statAnalysis.mine?.hasData || slotMatch.match.statAnalysis.opponent?.hasData) && (() => {
                const sa   = slotMatch.match.statAnalysis!;
                const mine = sa.mine  as any;
                const opp  = sa.opponent as any;
                const iWon = m.winnerId === authUser?.id;

                const STATS = [
                  { key: "wins",        label: "Wins",        icon: <Trophy className="w-3 h-3" /> },
                  { key: "kills",       label: "Kills",       icon: <Skull  className="w-3 h-3" /> },
                  { key: "gamesplayed", label: "Games",       icon: <Gamepad2 className="w-3 h-3" /> },
                  { key: "damage",      label: "Damage",      icon: <Flame  className="w-3 h-3" /> },
                  { key: "mvpCount",    label: "MVP",         icon: <Star   className="w-3 h-3" /> },
                  { key: "knockDowns",  label: "Knockdowns",  icon: <Zap    className="w-3 h-3" /> },
                ] as const;

                // Verdict text
                const winnerData = iWon ? mine : opp;
                const parts: string[] = [];
                if (winnerData?.stats) {
                  const ws = winnerData.stats as any;
                  if ((ws.wins?.delta ?? 0) >= 1)        parts.push(`+${ws.wins.delta} win${ws.wins.delta > 1 ? "s" : ""}`);
                  if ((ws.kills?.delta ?? 0) >= 1)       parts.push(`+${ws.kills.delta} kill${ws.kills.delta > 1 ? "s" : ""}`);
                  if ((ws.gamesplayed?.delta ?? 0) >= 1) parts.push(`played ${ws.gamesplayed.delta} game${ws.gamesplayed.delta > 1 ? "s" : ""}`);
                  if ((ws.damage?.delta ?? 0) >= 1)      parts.push(`+${ws.damage.delta} dmg`);
                }
                const verdict = parts.length > 0
                  ? `Winner verified: ${parts.join(", ")} more than opponent.`
                  : "Winner determined via stat snapshot comparison.";

                return (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.36, duration: 0.35 }}
                    className="rounded-2xl overflow-hidden mb-3"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    {/* Header */}
                    <div className="px-4 pt-3 pb-2.5 border-b flex items-center justify-between"
                      style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-lg flex items-center justify-center"
                          style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}>
                          <ShieldAlert className="w-3 h-3 text-violet-400" />
                        </div>
                        <span className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-zinc-400">
                          Verification Analysis
                        </span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" }}>
                        <CheckCircle2 className="w-2.5 h-2.5 text-violet-400" />
                        <span className="text-[8px] font-bold text-violet-400 uppercase tracking-wide">
                          {m.verificationType === "auto" ? "Auto Verified" : "Manual Review"}
                        </span>
                      </div>
                    </div>

                    {/* Snapshot timestamps */}
                    {(mine?.preSnapshotAt || mine?.postSnapshotAt) && (
                      <div className="px-4 pt-2 flex items-center gap-4">
                        {mine.preSnapshotAt && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5 text-zinc-700" />
                            <span className="text-[9px] text-zinc-700">
                              Pre-match: {format(new Date(mine.preSnapshotAt), "h:mm a")}
                            </span>
                          </div>
                        )}
                        {mine.postSnapshotAt && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5 text-zinc-600" />
                            <span className="text-[9px] text-zinc-600">
                              Post-match: {format(new Date(mine.postSnapshotAt), "h:mm a")}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Column headers */}
                    <div className="px-4 pt-2.5 pb-1 grid grid-cols-[1fr_72px_72px] items-center gap-1">
                      <span className="text-[8px] font-bold text-zinc-700 uppercase tracking-widest">Stat</span>
                      <span className="text-[8px] font-bold uppercase tracking-widest text-center"
                        style={{ color: iWon ? "#34d399" : "#60a5fa" }}>You</span>
                      <span className="text-[8px] font-bold uppercase tracking-widest text-center"
                        style={{ color: iWon ? "#f87171" : "#34d399" }}>Opponent</span>
                    </div>

                    {/* Stat rows */}
                    <div className="px-4 pb-3 space-y-1">
                      {STATS.filter(s => {
                        const md = mine?.stats?.[s.key]?.delta;
                        const od = opp?.stats?.[s.key]?.delta;
                        return md != null || od != null;
                      }).map(stat => {
                        const myDelta  = mine?.stats?.[stat.key]?.delta ?? 0;
                        const oppDelta = opp?.stats?.[stat.key]?.delta  ?? 0;
                        const myBefore = mine?.stats?.[stat.key]?.before;
                        const myAfter  = mine?.stats?.[stat.key]?.after;
                        const myLeads  = myDelta > oppDelta;
                        const oppLeads = oppDelta > myDelta;

                        return (
                          <div key={stat.key}
                            className="grid grid-cols-[1fr_72px_72px] items-center gap-1 rounded-xl px-2.5 py-2"
                            style={{ background: myLeads ? "rgba(34,197,94,0.04)" : oppLeads ? "rgba(239,68,68,0.04)" : "rgba(255,255,255,0.02)" }}
                          >
                            {/* Stat label */}
                            <div className="flex items-center gap-2">
                              <span className="text-zinc-600">{stat.icon}</span>
                              <div>
                                <p className="text-[10px] font-semibold text-zinc-500">{stat.label}</p>
                                {myBefore != null && myAfter != null && (
                                  <p className="text-[8px] text-zinc-700">{myBefore} → {myAfter}</p>
                                )}
                              </div>
                            </div>

                            {/* My delta */}
                            <div className="flex flex-col items-center">
                              <span className={`text-[14px] font-black tabular-nums ${
                                myLeads ? "text-green-400" : myDelta === 0 ? "text-zinc-700" : "text-zinc-500"
                              }`}>
                                {myDelta >= 0 ? `+${myDelta}` : myDelta}
                              </span>
                              {myLeads && <div className="w-1 h-1 rounded-full bg-green-400" />}
                            </div>

                            {/* Opponent delta */}
                            <div className="flex flex-col items-center">
                              <span className={`text-[14px] font-black tabular-nums ${
                                oppLeads ? "text-red-400" : oppDelta === 0 ? "text-zinc-700" : "text-zinc-500"
                              }`}>
                                {oppDelta >= 0 ? `+${oppDelta}` : oppDelta}
                              </span>
                              {oppLeads && <div className="w-1 h-1 rounded-full bg-red-400" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Verdict */}
                    <div className="mx-4 mb-3 px-3 py-2 rounded-xl flex items-start gap-2"
                      style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.12)" }}>
                      <CheckCircle className="w-3 h-3 text-violet-500 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-violet-400/80 leading-relaxed">{verdict}</p>
                    </div>
                  </motion.div>
                );
              })()}

              {/* ── Dispute Panel ── */}
              {(() => {
                const alreadyFiled = slotMatch.match.alreadyDisputed || disputeDone;
                const windowOpen   = disputeWindowOpen;
                const deadline     = disputeDeadline ? new Date(disputeDeadline) : null;

                const DISPUTE_REASONS = [
                  { id: "wrong_result",    label: "Wrong Result",         desc: "The declared winner is incorrect" },
                  { id: "cheating",        label: "Cheating / Hacking",   desc: "Opponent used unfair means" },
                  { id: "no_show",         label: "Opponent No-Show",     desc: "Opponent didn't join the match" },
                  { id: "disconnect",      label: "Disconnect / Lag",     desc: "Technical issue affected the match" },
                  { id: "proof_of_win",    label: "I Have Proof",         desc: "I can provide evidence of winning" },
                  { id: "other",           label: "Other Issue",          desc: "Something else went wrong" },
                ];

                if (alreadyFiled) {
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.45, duration: 0.35 }}
                      className="rounded-2xl p-4"
                      style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.25)" }}>
                          <ClipboardList className="w-4.5 h-4.5 text-violet-400" />
                        </div>
                        <div>
                          <p className="text-[12px] font-bold text-violet-300">Dispute Filed — Under Review</p>
                          <p className="text-[10px] text-violet-500 mt-0.5">Our team will review your dispute within 24 hours</p>
                        </div>
                        <div className="ml-auto w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                      </div>
                    </motion.div>
                  );
                }

                if (!windowOpen) {
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.45, duration: 0.35 }}
                      className="rounded-2xl p-4"
                      style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                          <Lock className="w-4 h-4 text-zinc-600" />
                        </div>
                        <div>
                          <p className="text-[12px] font-bold text-zinc-500">Dispute Window Closed</p>
                          <p className="text-[10px] text-zinc-700 mt-0.5">
                            {deadline
                              ? `Closed ${format(deadline, "MMM d · h:mm a")} · disputes must be filed within 24h`
                              : "Disputes must be filed within 24h of match completion"}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                // Window is open
                const cdStr = disputeCountdown
                  ? disputeCountdown.h > 0
                    ? `${disputeCountdown.h}h ${pad(disputeCountdown.m)}m left`
                    : `${disputeCountdown.m}m ${pad(disputeCountdown.s)}s left`
                  : null;

                return (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.45, duration: 0.35 }}
                    className="rounded-2xl overflow-hidden"
                    style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)" }}
                  >
                    {/* Header */}
                    <div className="px-4 pt-3 pb-2.5 border-b border-red-500/10 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                        <span className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-red-500">Dispute This Match</span>
                      </div>
                      {cdStr && (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                          <Timer className="w-2.5 h-2.5 text-red-400" />
                          <span className="text-[9px] font-bold text-red-400">{cdStr}</span>
                        </div>
                      )}
                    </div>

                    {/* Body */}
                    <div className="px-4 py-3">
                      <p className="text-[11px] text-zinc-500 mb-3 leading-relaxed">
                        Something went wrong? File a dispute before the window closes.
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          {
                            icon: <AlertTriangle className="w-4 h-4" />,
                            label: "Report Problem",
                            color: "#ef4444",
                            bg: "rgba(239,68,68,0.1)",
                            border: "rgba(239,68,68,0.25)",
                            action: () => { setDisputeManualReview(false); setDisputeOpen(true); },
                          },
                          {
                            icon: <ClipboardList className="w-4 h-4" />,
                            label: "Manual Review",
                            color: "#a78bfa",
                            bg: "rgba(139,92,246,0.1)",
                            border: "rgba(139,92,246,0.25)",
                            action: () => {
                              setDisputeManualReview(true);
                              setDisputeReason("wrong_result");
                              setDisputeOpen(true);
                            },
                          },
                          {
                            icon: <ImagePlus className="w-4 h-4" />,
                            label: "Upload Proof",
                            color: "#38bdf8",
                            bg: "rgba(56,189,248,0.1)",
                            border: "rgba(56,189,248,0.25)",
                            action: () => {
                              setDisputeManualReview(false);
                              setDisputeOpen(true);
                              setTimeout(() => screenshotInputRef.current?.click(), 350);
                            },
                          },
                        ].map(({ icon, label, color, bg, border, action }) => (
                          <button
                            key={label}
                            onClick={() => { haptic("light"); action(); }}
                            className="flex flex-col items-center gap-2 py-3 px-1 rounded-xl active:scale-95 transition-transform"
                            style={{ background: bg, border: `1px solid ${border}` }}
                          >
                            <span style={{ color }}>{icon}</span>
                            <span className="text-[9px] font-bold text-center leading-tight" style={{ color }}>{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                );
              })()}

              {/* ── Room Details ── */}
              {(() => {
                const releaseTime = m.credentialsReleasedAt
                  ? format(new Date(m.credentialsReleasedAt), "h:mm a · MMM d")
                  : m.scheduledAt
                  ? `${format(new Date(new Date(m.scheduledAt).getTime() - (m.releaseOffsetMinutes ?? 5) * 60_000), "h:mm a")} (est.)`
                  : "—";
                const joinDeadline = m.scheduledAt ? format(new Date(m.scheduledAt), "h:mm a · MMM d") : "—";
                const slotTiming   = m.scheduledAt ? format(new Date(m.scheduledAt), "MMM d, yyyy · h:mm a") : "—";

                const infoRows = [
                  { label: "Slot Timing",    value: slotTiming,                           icon: <Calendar className="w-3 h-3" /> },
                  { label: "Room Released",  value: releaseTime,                          icon: <Key className="w-3 h-3" />      },
                  { label: "Join Deadline",  value: joinDeadline,                         icon: <Clock className="w-3 h-3" />    },
                  { label: "Wave",           value: m.waveNumber != null ? `Wave ${m.waveNumber}` : "—", icon: <Zap className="w-3 h-3" /> },
                  { label: "Seat",           value: m.seat ? `Seat ${m.seat}` : "—",     icon: <Users className="w-3 h-3" />    },
                  { label: "Mode",           value: t.gameMode ?? "—",                   icon: <Swords className="w-3 h-3" />   },
                  ...(t.map ? [{ label: "Map", value: t.map, icon: <Shield className="w-3 h-3" /> }] : []),
                ];

                return (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.35 }}
                    className="rounded-2xl overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    {/* Header */}
                    <div className="px-4 pt-3 pb-2.5 border-b border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-zinc-500">Room Details</span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}>
                        <Lock className="w-2.5 h-2.5 text-red-500" />
                        <span className="text-[9px] font-bold text-red-500 uppercase tracking-wide">Match Ended</span>
                      </div>
                    </div>

                    {/* Sensitive fields — blurred */}
                    <div className="px-4 pt-3 pb-2 space-y-2.5">
                      {/* Room ID */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                            <Key className="w-3 h-3 text-zinc-600" />
                          </div>
                          <span className="text-[11px] text-zinc-600 font-medium">Room ID</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-black text-zinc-700 select-none" style={{ filter: "blur(5px)", userSelect: "none" }}>
                            XXXXXXXX
                          </span>
                          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md"
                            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                            <Lock className="w-2.5 h-2.5 text-red-400" />
                            <span className="text-[8px] font-bold text-red-400 uppercase tracking-wide">Hidden</span>
                          </div>
                        </div>
                      </div>

                      {/* Password */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                            <Lock className="w-3 h-3 text-zinc-600" />
                          </div>
                          <span className="text-[11px] text-zinc-600 font-medium">Password</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-black text-zinc-700 select-none" style={{ filter: "blur(5px)", userSelect: "none" }}>
                            ••••••
                          </span>
                          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md"
                            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                            <Lock className="w-2.5 h-2.5 text-red-400" />
                            <span className="text-[8px] font-bold text-red-400 uppercase tracking-wide">Hidden</span>
                          </div>
                        </div>
                      </div>

                      {/* Open in FF — disabled */}
                      <div className="pt-0.5">
                        <div
                          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl opacity-30 cursor-not-allowed"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                        >
                          <Gamepad2 className="w-4 h-4 text-zinc-500" />
                          <span className="text-[12px] font-bold text-zinc-500">Open in Free Fire</span>
                          <Lock className="w-3 h-3 text-zinc-600" />
                        </div>
                        <p className="text-center text-[9px] text-zinc-700 mt-1.5">
                          Credentials hidden after match completion
                        </p>
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="mx-4 h-px bg-white/5 my-1" />

                    {/* Non-sensitive info rows */}
                    <div className="pb-2">
                      {infoRows.map(({ label, value, icon }, i) => (
                        <div key={label} className={`flex items-center justify-between px-4 py-2 ${i < infoRows.length - 1 ? "border-b border-white/[0.04]" : ""}`}>
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-700">{icon}</span>
                            <span className="text-[11px] text-zinc-600 font-medium">{label}</span>
                          </div>
                          <span className="text-[11px] font-bold text-zinc-300 capitalize">{value}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                );
              })()}

              {/* ── Match Activity Log ── */}
              {slotMatch.match.activityLog && slotMatch.match.activityLog.length > 0 && (() => {
                type EvMeta = { label: string; icon: React.ReactNode; color: string };
                const EVT: Record<string, EvMeta> = {
                  credentials_set:           { label: "Room Credentials Set",    icon: <Key className="w-3 h-3" />,          color: "#60a5fa" },
                  credentials_released:      { label: "Room Opened to Players",  icon: <Key className="w-3 h-3" />,          color: "#34d399" },
                  credentials_auto_released: { label: "Room Auto-Released",      icon: <Zap className="w-3 h-3" />,          color: "#34d399" },
                  credentials_hidden:        { label: "Credentials Hidden",      icon: <Lock className="w-3 h-3" />,         color: "#f87171" },
                  credentials_shown:         { label: "Credentials Revealed",    icon: <CheckCircle2 className="w-3 h-3" />, color: "#60a5fa" },
                  room_replaced:             { label: "Room Updated",            icon: <RotateCcw className="w-3 h-3" />,    color: "#60a5fa" },
                  players_confirmed:         { label: "Battle Started",          icon: <Swords className="w-3 h-3" />,       color: "#f59e0b" },
                  admin_confirmed_player:    { label: "Player Confirmed",        icon: <CheckCircle2 className="w-3 h-3" />, color: "#34d399" },
                  admin_unconfirmed_player:  { label: "Player Unconfirmed",      icon: <XCircle className="w-3 h-3" />,      color: "#f87171" },
                  auto_verified:             { label: "Stats Verified by System",icon: <ShieldAlert className="w-3 h-3" />,  color: "#a78bfa" },
                  auto_verify_retry:         { label: "Verification Retry",      icon: <RotateCcw className="w-3 h-3" />,    color: "#f59e0b" },
                  result_verified:           { label: "Winner Decided",          icon: <Trophy className="w-3 h-3" />,       color: "#f59e0b" },
                  match_disputed:            { label: "Dispute Escalated",       icon: <AlertTriangle className="w-3 h-3" />,color: "#f87171" },
                  player_dispute:            { label: "Dispute Filed by Player", icon: <AlertTriangle className="w-3 h-3" />,color: "#f87171" },
                  winner_overridden:         { label: "Winner Overridden",       icon: <Crown className="w-3 h-3" />,        color: "#a78bfa" },
                  match_force_expired:       { label: "Match Expired",           icon: <Clock className="w-3 h-3" />,        color: "#71717a" },
                  notification_resent:       { label: "Notification Resent",     icon: <Send className="w-3 h-3" />,         color: "#60a5fa" },
                };

                const events = slotMatch.match.activityLog as any[];

                return (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.55, duration: 0.35 }}
                    className="rounded-2xl overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    {/* Header */}
                    <div className="px-4 pt-3 pb-2.5 border-b flex items-center justify-between"
                      style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-lg flex items-center justify-center"
                          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                          <ClipboardList className="w-3 h-3 text-zinc-400" />
                        </div>
                        <span className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-zinc-400">
                          Match Activity
                        </span>
                      </div>
                      <div className="px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <span className="text-[9px] font-bold text-zinc-600 tabular-nums">{events.length} events</span>
                      </div>
                    </div>

                    {/* Event timeline */}
                    <div className="px-4 pt-3 pb-3">
                      {events.map((event: any, i: number) => {
                        const meta: EvMeta = EVT[event.eventType as string] ?? {
                          label: String(event.eventType).replace(/_/g, " "),
                          icon: <Zap className="w-3 h-3" />,
                          color: "#52525b",
                        };
                        const isLast = i === events.length - 1;

                        return (
                          <div key={event.id ?? i} className="flex gap-3">
                            {/* Timeline spine */}
                            <div className="flex flex-col items-center w-6 shrink-0">
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                                style={{
                                  background: `${meta.color}18`,
                                  border: `1px solid ${meta.color}35`,
                                  color: meta.color,
                                }}
                              >
                                {meta.icon}
                              </div>
                              {!isLast && (
                                <div className="flex-1 w-px mt-1 min-h-[16px]"
                                  style={{ background: "rgba(255,255,255,0.05)" }} />
                              )}
                            </div>

                            {/* Event content */}
                            <div className={`flex-1 ${isLast ? "pb-0" : "pb-3"}`}>
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-[11px] font-bold text-zinc-300 leading-snug">{meta.label}</p>
                                <span className="text-[9px] text-zinc-600 shrink-0 tabular-nums mt-0.5">
                                  {format(new Date(event.createdAt), "h:mm a")}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {event.actor && event.actor !== "system" && (
                                  <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                                    style={{ background: "rgba(255,255,255,0.04)", color: "#52525b" }}>
                                    {event.actor === "admin" ? "Admin" : "Player"}
                                  </span>
                                )}
                                <span className="text-[9px] text-zinc-700">
                                  {format(new Date(event.createdAt), "MMM d, yyyy")}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                );
              })()}
            </div>
          );
        })()}

        {/* ── Opponent (upcoming/ongoing only — for completed we use the battle view above) ── */}
        {!isCompleted && slotMatch?.matchmaking && slotMatch.match && slotMatch.opponent && (
          <div className="mb-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600 mb-2.5">Your Opponent</p>
            <div className="rounded-2xl flex items-center gap-4 px-4 py-4"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0"
                style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.25)" }}>
                {slotMatch.opponent.profilePicture ? (
                  <CachedImg
                    src={resolveImageUrl(slotMatch.opponent.profilePicture) ?? ""}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[18px] font-black text-red-400">
                    {(slotMatch.opponent.inGameName || "?").charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Vs</p>
                <p className="text-[17px] font-extrabold text-white leading-tight truncate">{slotMatch.opponent.inGameName}</p>
                <p className="text-[10px] text-zinc-600 font-mono mt-0.5">UID: {slotMatch.opponent.uid}</p>
              </div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.22)" }}>
                <Swords className="w-4 h-4 text-red-400" />
              </div>
            </div>
            {slotMatch.match.waveNumber && (
              <div className="flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-xl w-fit"
                style={{ background: "rgba(139,92,246,0.09)", border: "1px solid rgba(139,92,246,0.2)" }}>
                <span className="text-[10px] font-bold text-violet-400">
                  Wave {slotMatch.match.waveNumber} · Match #{slotMatch.match.matchNumber} · Seat {slotMatch.match.seat}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Next Steps ── */}
        {(isUpcoming || isOngoing) && (
          <div className="mb-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600 mb-3">What's Next</p>
            <div className="rounded-2xl overflow-hidden space-y-0" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="px-4 py-4 space-y-4">
                <Step
                  dot="#22c55e"
                  label="You're registered"
                  sub="Your slot is locked in. You'll receive updates here."
                  done={stepRegistered}
                />
                <Step
                  dot="#facc15"
                  label="Wait for room credentials"
                  sub={credentialsReleased ? "Room credentials have been released — check above." : "Admin will release the Room ID & Password before the match."}
                  done={stepCredentials}
                  active={!stepCredentials}
                />
                <Step
                  dot="#60a5fa"
                  label="Mark yourself ready"
                  sub={isReady ? `You marked ready at ${readyAt ? format(new Date(readyAt), "h:mm a") : "—"}.` : "Once credentials are out, confirm you're ready to play."}
                  done={stepReady}
                  active={stepCredentials && !stepReady}
                />
                <Step
                  dot="#f97316"
                  label="Open the room & play"
                  sub="Use the Room ID and password to join in Free Fire. Good luck!"
                  done={stepPlay}
                  active={stepCredentials && stepReady}
                />
              </div>
            </div>
          </div>
        )}

      </div>
    </div>

    {/* ── Report Modal (bottom sheet) ── */}
    <AnimatePresence>
      {reportOpen && (() => {
        const oppName = slotMatch?.opponent?.inGameName ?? "Opponent";
        const reasons = [
          { id: "cheating", label: "Cheating / Hacking", icon: <Shield className="w-4 h-4" /> },
          { id: "fake_result", label: "Fake screenshot / Result", icon: <AlertTriangle className="w-4 h-4" /> },
          { id: "abusive", label: "Abusive or toxic behaviour", icon: <XCircle className="w-4 h-4" /> },
          { id: "manipulation", label: "Match manipulation", icon: <Swords className="w-4 h-4" /> },
          { id: "impersonation", label: "Impersonation / Fake account", icon: <Users className="w-4 h-4" /> },
          { id: "other", label: "Other", icon: <ChevronRight className="w-4 h-4" /> },
        ];

        async function submitReport() {
          if (!reportReason) return;
          setReportSubmitting(true);
          haptic("medium");
          try {
            await authFetch(`/reports`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reportedUserId: slotMatch?.opponent?.id,
                matchId: slotMatch?.match?.id,
                reason: reportReason,
              }),
            });
          } catch {
            /* ignore — still show success */
          }
          setReportSubmitting(false);
          setReportDone(true);
          haptic("success");
        }

        return (
          <>
            {/* Backdrop */}
            <motion.div
              key="report-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setReportOpen(false)}
              className="fixed inset-0 z-50"
              style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
            />

            {/* Sheet */}
            <motion.div
              key="report-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl overflow-hidden"
              style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.1)", borderBottom: "none", maxHeight: "85vh" }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-9 h-1 rounded-full bg-zinc-700" />
              </div>

              {!reportDone ? (
                <div className="px-5 pb-8 overflow-y-auto" style={{ maxHeight: "calc(85vh - 24px)" }}>
                  {/* Header */}
                  <div className="flex items-start justify-between mb-5 pt-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.25)" }}>
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        </div>
                        <p className="text-[16px] font-extrabold text-white">Report Player</p>
                      </div>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Reporting <span className="text-zinc-300 font-semibold">{oppName}</span> · Our team will review this within 24h
                      </p>
                    </div>
                    <button
                      onClick={() => setReportOpen(false)}
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1"
                      style={{ background: "rgba(255,255,255,0.06)" }}
                    >
                      <X className="w-3.5 h-3.5 text-zinc-400" />
                    </button>
                  </div>

                  {/* Reason label */}
                  <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-zinc-600 mb-2.5">Select a reason</p>

                  {/* Reason list */}
                  <div className="space-y-2 mb-6">
                    {reasons.map((r) => {
                      const selected = reportReason === r.id;
                      return (
                        <button
                          key={r.id}
                          onClick={() => { setReportReason(r.id); haptic("light"); }}
                          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-all active:scale-[0.98]"
                          style={selected
                            ? { background: "rgba(239,68,68,0.12)", border: "1.5px solid rgba(239,68,68,0.4)" }
                            : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }
                          }
                        >
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                            style={selected
                              ? { background: "rgba(239,68,68,0.2)", color: "#f87171" }
                              : { background: "rgba(255,255,255,0.05)", color: "#52525b" }
                            }
                          >
                            {r.icon}
                          </div>
                          <span
                            className="text-[13px] font-semibold flex-1"
                            style={{ color: selected ? "#fca5a5" : "#a1a1aa" }}
                          >
                            {r.label}
                          </span>
                          {selected && (
                            <CheckCircle2 className="w-4 h-4 text-red-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Submit */}
                  <button
                    onClick={submitReport}
                    disabled={!reportReason || reportSubmitting}
                    className="w-full py-4 rounded-2xl text-[13px] font-extrabold uppercase tracking-wide transition-all active:scale-[0.98] disabled:opacity-40"
                    style={reportReason
                      ? { background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff", boxShadow: "0 4px 24px rgba(239,68,68,0.35)" }
                      : { background: "rgba(255,255,255,0.05)", color: "#52525b" }
                    }
                  >
                    {reportSubmitting ? "Submitting…" : "Submit Report"}
                  </button>

                  <p className="text-[10px] text-zinc-700 text-center mt-3 leading-relaxed">
                    False reports may result in account restrictions.
                  </p>
                </div>
              ) : (
                /* Success state */
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="px-6 py-10 flex flex-col items-center text-center gap-4"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 14, stiffness: 300, delay: 0.1 }}
                    className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(34,197,94,0.15)", border: "1.5px solid rgba(34,197,94,0.35)" }}
                  >
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </motion.div>
                  <div>
                    <p className="text-[20px] font-extrabold text-white mb-1.5">Report Submitted</p>
                    <p className="text-[12px] text-zinc-500 leading-relaxed max-w-[260px]">
                      Our moderation team will review your report against <span className="text-zinc-300 font-semibold">{oppName}</span> within 24 hours.
                    </p>
                  </div>
                  <button
                    onClick={() => setReportOpen(false)}
                    className="mt-2 px-6 py-3 rounded-2xl text-[13px] font-bold transition-all active:scale-[0.98]"
                    style={{ background: "rgba(255,255,255,0.07)", color: "#a1a1aa" }}
                  >
                    Close
                  </button>
                </motion.div>
              )}
            </motion.div>
          </>
        );
      })()}
    </AnimatePresence>

    {/* ── Hidden screenshot file input ── */}
    <input
      ref={screenshotInputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      className="hidden"
      onChange={handleScreenshotPick}
    />

    {/* ── Dispute Bottom Sheet ── */}
    <AnimatePresence>
      {disputeOpen && (() => {
        const DISPUTE_REASONS = [
          { id: "wrong_result",  label: "Wrong Result",       desc: "The declared winner is incorrect" },
          { id: "cheating",      label: "Cheating / Hacking", desc: "Opponent used unfair means" },
          { id: "no_show",       label: "Opponent No-Show",   desc: "Opponent didn't join the match" },
          { id: "disconnect",    label: "Disconnect / Lag",   desc: "Technical issue affected the match" },
          { id: "proof_of_win",  label: "I Have Proof",       desc: "I can provide evidence of winning" },
          { id: "other",         label: "Other Issue",        desc: "Something else went wrong" },
        ];
        const canSubmit = !!disputeReason && disputeDescription.trim().length >= 10 && !disputeSubmitting;

        return (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
              onClick={() => { if (!disputeSubmitting) setDisputeOpen(false); }}
            />

            {/* Sheet */}
            <motion.div
              initial={{ y: "100%", opacity: 0.6 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl overflow-hidden"
              style={{ background: "#0d0d0f", border: "1px solid rgba(255,255,255,0.08)", maxWidth: 480, margin: "0 auto" }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-9 h-1 rounded-full bg-white/10" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-white leading-none">
                      {disputeManualReview ? "Request Manual Review" : "Report a Problem"}
                    </p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">Match dispute · reviewed within 24h</p>
                  </div>
                </div>
                <button onClick={() => { if (!disputeSubmitting) setDisputeOpen(false); }}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.05)" }}>
                  <X className="w-3.5 h-3.5 text-zinc-500" />
                </button>
              </div>

              <div className="px-5 pb-8 pt-4 overflow-y-auto max-h-[75vh] space-y-4">

                {/* Manual Review badge */}
                {disputeManualReview && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                    style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.18)" }}>
                    <ClipboardList className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    <p className="text-[10px] text-violet-400">Admin will manually review this match's verification</p>
                  </div>
                )}

                {/* Reason selector */}
                <div>
                  <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-zinc-600 mb-2">What went wrong?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {DISPUTE_REASONS.map(r => (
                      <button
                        key={r.id}
                        onClick={() => setDisputeReason(r.id)}
                        className="text-left px-3 py-2.5 rounded-xl transition-all active:scale-[0.97]"
                        style={{
                          background: disputeReason === r.id ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.03)",
                          border: disputeReason === r.id ? "1px solid rgba(239,68,68,0.35)" : "1px solid rgba(255,255,255,0.07)",
                        }}
                      >
                        <p className={`text-[11px] font-bold leading-none ${disputeReason === r.id ? "text-red-400" : "text-zinc-400"}`}>{r.label}</p>
                        <p className="text-[9px] text-zinc-600 mt-1 leading-snug">{r.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-zinc-600 mb-2">Describe the issue</p>
                  <textarea
                    value={disputeDescription}
                    onChange={e => setDisputeDescription(e.target.value)}
                    placeholder="Explain what happened in detail… (min 10 characters)"
                    rows={3}
                    className="w-full text-[12px] text-zinc-300 placeholder-zinc-700 rounded-xl px-3.5 py-3 resize-none outline-none leading-relaxed"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                  <p className={`text-[9px] mt-1 text-right ${disputeDescription.length >= 10 ? "text-zinc-700" : "text-zinc-800"}`}>
                    {disputeDescription.length}/10 min
                  </p>
                </div>

                {/* Screenshot upload */}
                <div>
                  <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-zinc-600 mb-2">Screenshot (optional)</p>
                  {disputeScreenshotUrl ? (
                    <div className="relative">
                      <img
                        src={disputeScreenshotUrl}
                        alt="Dispute screenshot"
                        className="w-full max-h-40 object-cover rounded-xl"
                        style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                      />
                      <button
                        onClick={() => { setDisputeScreenshotUrl(null); setDisputeScreenshotFile(null); }}
                        className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ background: "rgba(0,0,0,0.7)" }}
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                      <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }}>
                        <CheckCircle className="w-2.5 h-2.5 text-green-400" />
                        <span className="text-[8px] font-bold text-green-400">Uploaded</span>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => screenshotInputRef.current?.click()}
                      disabled={disputeScreenshotUploading}
                      className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
                      style={{ background: "rgba(56,189,248,0.05)", border: "1.5px dashed rgba(56,189,248,0.2)" }}
                    >
                      {disputeScreenshotUploading ? (
                        <>
                          <RotateCcw className="w-4 h-4 text-sky-400 animate-spin" />
                          <span className="text-[12px] font-semibold text-sky-400">Uploading…</span>
                        </>
                      ) : (
                        <>
                          <FileImage className="w-4 h-4 text-sky-500" />
                          <span className="text-[12px] font-semibold text-sky-500">Add Screenshot</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Submit */}
                <button
                  onClick={handleDisputeSubmit}
                  disabled={!canSubmit}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-[13px] font-bold transition-all active:scale-[0.98] disabled:opacity-35 disabled:cursor-not-allowed"
                  style={{
                    background: canSubmit ? "linear-gradient(135deg, #ef4444, #dc2626)" : "rgba(255,255,255,0.05)",
                    color: canSubmit ? "#fff" : "#71717a",
                    boxShadow: canSubmit ? "0 4px 20px rgba(239,68,68,0.3)" : "none",
                  }}
                >
                  {disputeSubmitting ? (
                    <><RotateCcw className="w-4 h-4 animate-spin" /> Submitting…</>
                  ) : (
                    <><Send className="w-4 h-4" /> Submit Dispute</>
                  )}
                </button>

                <p className="text-center text-[9px] text-zinc-700 leading-relaxed pb-2">
                  False disputes may result in account penalties.{"\n"}Our team reviews all disputes fairly.
                </p>
              </div>
            </motion.div>
          </>
        );
      })()}
    </AnimatePresence>
    </>
  );
}
