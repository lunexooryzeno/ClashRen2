import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { X, Trophy, XCircle, AlertCircle, CheckCircle2 } from "lucide-react";
import { CoinIcon } from "@/components/CoinIcon";

interface MatchResult {
  matchId: number;
  slotId: number;
  verificationStatus: string;
  winnerId: number | null;
  prize: number;
}

interface TopupResult {
  topupId: number;
  diamonds: number;
  rupees: number;
  utr: string;
}

interface QmResult {
  matchId: string;
  resultType: string;
  coinsEarned: number;
  entryFee: number;
  prizeAmount: number;
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

const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS  = 60_000;

export function MatchVerifyNotifier() {
  const { isAuthenticated, user, invalidateUser } = useAuth();
  const [, navigate] = useLocation();
  const [result, setResult]       = useState<(MatchResult & { isWin: boolean }) | null>(null);
  const [topupResult, setTopupResult] = useState<TopupResult | null>(null);
  const [qmResult, setQmResult]   = useState<QmResult | null>(null);

  const esRef             = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_BASE_MS);
  const mountedRef        = useRef(false);
  const userIdRef         = useRef<number | undefined>(undefined);
  userIdRef.current       = user?.id;

  // ── trigger slot-match auto-verify ────────────────────────────────────────
  const triggerVerify = useCallback(() => {
    authFetch("/my-matches/auto-verify-pending", { method: "POST" }).catch(() => {});
  }, []);

  // ── check for pending QuickMatch result ───────────────────────────────────
  const checkQmPending = useCallback(() => {
    authFetch("/quickmatch/pending-result")
      .then((r) => r.json())
      .then((data: { pending: boolean } & Partial<QmResult>) => {
        if (data.pending && data.matchId) {
          setQmResult({
            matchId:    data.matchId,
            resultType: data.resultType  ?? "no_show",
            coinsEarned: data.coinsEarned ?? 0,
            entryFee:   data.entryFee    ?? 0,
            prizeAmount: data.prizeAmount ?? 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  // ── mark QuickMatch result seen ───────────────────────────────────────────
  const markQmSeen = useCallback((matchId: string) => {
    authFetch(`/quickmatch/result/${matchId}/seen`, { method: "POST" }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    triggerVerify();
    checkQmPending();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        triggerVerify();
        checkQmPending();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", triggerVerify);
    window.addEventListener("focus", checkQmPending);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", triggerVerify);
      window.removeEventListener("focus", checkQmPending);
    };
  }, [isAuthenticated, triggerVerify, checkQmPending]);

  // ── SSE connection ────────────────────────────────────────────────────────
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    const es = new EventSource("/api/users/sse", { withCredentials: true });
    esRef.current = es;

    es.addEventListener("connected", () => {
      reconnectDelayRef.current = RECONNECT_BASE_MS;
    });

    es.addEventListener("match_verified", (e: MessageEvent) => {
      try {
        const data: MatchResult = JSON.parse(e.data);
        const uid = userIdRef.current;
        const isWin =
          data.verificationStatus === "reward_distributed" ||
          (data.verificationStatus === "winner_decided" && data.winnerId === uid);
        setResult({ ...data, isWin });
        invalidateUser();
      } catch { /* ignore */ }
    });

    es.addEventListener("topup_verified", (e: MessageEvent) => {
      try {
        const data: TopupResult = JSON.parse(e.data);
        setTopupResult(data);
        invalidateUser();
      } catch { /* ignore */ }
    });

    es.addEventListener("quickmatch_result", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as QmResult;
        if (data.matchId && data.resultType) {
          setQmResult(data);
          invalidateUser();
        }
      } catch { /* ignore */ }
    });

    es.addEventListener("error", () => {
      es.close();
      esRef.current = null;
      if (!mountedRef.current) return;
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 1.5, RECONNECT_MAX_MS);
      reconnectTimerRef.current = setTimeout(() => connectRef.current(), delay);
    });
  }, []);

  connectRef.current = connect;

  useEffect(() => {
    mountedRef.current = true;
    if (isAuthenticated) connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
    };
  }, [isAuthenticated, connect]);

  // ── dismiss handlers ──────────────────────────────────────────────────────
  const dismissQm = useCallback((navigate_to?: string) => {
    if (qmResult) markQmSeen(qmResult.matchId);
    setQmResult(null);
    if (navigate_to) navigate(navigate_to);
  }, [qmResult, markQmSeen, navigate]);

  // ── floating result card ──────────────────────────────────────────────────
  const status = result?.verificationStatus ?? "";
  const isDisputed = status === "disputed";
  const isFailed   = status === "failed";

  // QuickMatch result presentation
  const qmIsWin      = qmResult?.resultType === "win";
  const qmIsRefund   = qmResult?.resultType === "refund" || qmResult?.resultType === "no_show";
  const qmIsSuspend  = qmResult?.resultType === "suspended";

  return (
    <>
      <AnimatePresence>
        {topupResult && (
          <motion.div
            key="topup-verified-card"
            initial={{ opacity: 0, y: 80, scale: 0.92 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{ opacity: 0, y: 80, scale: 0.92 }}
            transition={{ type: "spring", damping: 22, stiffness: 300 }}
            className="fixed bottom-24 inset-x-4 z-[9999] mx-auto max-w-sm pointer-events-auto"
          >
            <div className="relative rounded-2xl p-5 shadow-2xl border backdrop-blur-md bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border-emerald-500/30">
              <button
                onClick={() => setTopupResult(null)}
                className="absolute top-3 right-3 p-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                <X className="w-4 h-4 text-white/70" />
              </button>
              <div className="flex items-center gap-4">
                <div className="shrink-0 p-3 rounded-xl bg-emerald-500/20">
                  <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-base leading-tight">Payment Confirmed!</p>
                  <div className="flex items-center gap-1 mt-1">
                    <CoinIcon className="w-4 h-4 text-blue-400" />
                    <span className="text-blue-300 font-bold text-sm">
                      +{topupResult.diamonds} Coins added to your wallet
                    </span>
                  </div>
                  <p className="text-emerald-300/60 text-xs mt-0.5">₹{topupResult.rupees} · UTR {topupResult.utr}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {result && (
          <motion.div
            key="match-verify-card"
            initial={{ opacity: 0, y: 80, scale: 0.92 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{ opacity: 0, y: 80, scale: 0.92 }}
            transition={{ type: "spring", damping: 22, stiffness: 300 }}
            className="fixed bottom-24 inset-x-4 z-[9999] mx-auto max-w-sm pointer-events-auto"
          >
            <div
              className={`relative rounded-2xl p-5 shadow-2xl border backdrop-blur-md ${
                result.isWin
                  ? "bg-gradient-to-br from-yellow-500/20 to-amber-600/20 border-yellow-500/30"
                  : isDisputed
                  ? "bg-gradient-to-br from-orange-500/20 to-red-600/20 border-orange-500/30"
                  : "bg-gradient-to-br from-slate-700/80 to-slate-800/80 border-white/10"
              }`}
            >
              <button
                onClick={() => setResult(null)}
                className="absolute top-3 right-3 p-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                <X className="w-4 h-4 text-white/70" />
              </button>

              <div className="flex items-center gap-4">
                <div
                  className={`shrink-0 p-3 rounded-xl ${
                    result.isWin ? "bg-yellow-500/20" :
                    isDisputed ? "bg-orange-500/20" :
                    "bg-white/5"
                  }`}
                >
                  {result.isWin  ? <Trophy      className="w-7 h-7 text-yellow-400" /> :
                   isDisputed    ? <AlertCircle className="w-7 h-7 text-orange-400" /> :
                                   <XCircle     className="w-7 h-7 text-slate-400"  />}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-base leading-tight">
                    {result.isWin   ? "You Won! 🎉"
                     : isDisputed   ? "Match Disputed"
                     : isFailed     ? "Verification Failed"
                     :               "Match Over"}
                  </p>

                  {result.isWin && result.prize > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <CoinIcon className="w-4 h-4 text-cyan-400" />
                      <span className="text-cyan-300 font-bold text-sm">
                        +{result.prize} Coins credited
                      </span>
                    </div>
                  )}

                  {!result.isWin && !isDisputed && !isFailed && (
                    <p className="text-slate-400 text-sm mt-0.5">Better luck next time!</p>
                  )}
                  {isDisputed && (
                    <p className="text-orange-300/80 text-sm mt-0.5">Admin will review the result.</p>
                  )}
                  {isFailed && (
                    <p className="text-slate-400 text-sm mt-0.5">Could not fetch stats. Contact support.</p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── QuickMatch result card ── */}
      <AnimatePresence>
        {qmResult && (
          <motion.div
            key="qm-result-card"
            initial={{ opacity: 0, y: 80, scale: 0.92 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{ opacity: 0, y: 80, scale: 0.92 }}
            transition={{ type: "spring", damping: 22, stiffness: 300 }}
            className="fixed bottom-24 inset-x-4 z-[9999] mx-auto max-w-sm pointer-events-auto"
          >
            <div
              className={`relative rounded-2xl p-5 shadow-2xl border backdrop-blur-md ${
                qmIsWin
                  ? "bg-gradient-to-br from-yellow-500/20 to-amber-600/20 border-yellow-500/30"
                  : qmIsRefund
                  ? "bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border-emerald-500/30"
                  : qmIsSuspend
                  ? "bg-gradient-to-br from-red-600/20 to-rose-700/20 border-red-500/30"
                  : "bg-gradient-to-br from-slate-700/80 to-slate-800/80 border-white/10"
              }`}
            >
              <button
                onClick={() => dismissQm()}
                className="absolute top-3 right-3 p-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                <X className="w-4 h-4 text-white/70" />
              </button>

              <div className="flex items-center gap-4">
                <div className={`shrink-0 p-3 rounded-xl ${
                  qmIsWin ? "bg-yellow-500/20" :
                  qmIsRefund ? "bg-emerald-500/20" :
                  qmIsSuspend ? "bg-red-500/20" :
                  "bg-white/5"
                }`}>
                  {qmIsWin     ? <Trophy       className="w-7 h-7 text-yellow-400"  /> :
                   qmIsRefund  ? <CheckCircle2 className="w-7 h-7 text-emerald-400" /> :
                   qmIsSuspend ? <AlertCircle  className="w-7 h-7 text-red-400"     /> :
                                 <XCircle      className="w-7 h-7 text-slate-400"   />}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-base leading-tight">
                    {qmIsWin     ? "QuickMatch Won! 🎉"
                     : qmIsSuspend ? "Suspended"
                     : qmIsRefund  ? "Entry Refunded"
                     :               "QuickMatch Over"}
                  </p>

                  {qmIsWin && qmResult.coinsEarned > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <CoinIcon className="w-4 h-4 text-cyan-400" />
                      <span className="text-cyan-300 font-bold text-sm">
                        +{qmResult.coinsEarned} Coins credited
                      </span>
                    </div>
                  )}
                  {qmIsRefund && qmResult.coinsEarned > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <CoinIcon className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-300 font-bold text-sm">
                        +{qmResult.coinsEarned} Coins refunded
                      </span>
                    </div>
                  )}
                  {!qmIsWin && !qmIsRefund && !qmIsSuspend && (
                    <p className="text-slate-400 text-sm mt-0.5">Better luck next time!</p>
                  )}
                  {qmIsSuspend && (
                    <p className="text-red-300/80 text-sm mt-0.5">Credential leak detected.</p>
                  )}

                  <button
                    onClick={() => dismissQm(`/quickmatch/result/${qmResult.matchId}`)}
                    className="mt-2 text-xs font-semibold underline underline-offset-2 opacity-70 hover:opacity-100 transition-opacity text-white"
                  >
                    View Result →
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
