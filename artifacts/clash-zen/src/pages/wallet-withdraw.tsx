import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Gem, Trophy, ArrowDownLeft, CheckCircle,
  Banknote, AlertCircle, ChevronRight, X, SendHorizonal, Clock, Bell, BookmarkCheck, ShieldAlert,
} from "lucide-react";
import { apiFetch, apiPost } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { sound } from "@/lib/sounds";
import type { Transaction } from "./wallet-all";

const SAVED_UPIS_KEY = "clash-ren:saved-upi-ids";

export default function WalletWithdrawPage() {
  const { user } = useAuth();
  const [upiId, setUpiId] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [showInfo, setShowInfo] = useState(false);
  const [savedUpis, setSavedUpis] = useState<string[]>([]);
  const [depositDiamonds, setDepositDiamonds] = useState(0);
  const [winningDiamonds, setWinningDiamonds] = useState(0);
  const [txLoaded, setTxLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [rate, setRate] = useState(0.5);
  const [minWithdrawal, setMinWithdrawal] = useState(0);
  const [maxWithdrawal, setMaxWithdrawal] = useState(0);
  const [wdPaused, setWdPaused] = useState(false);
  const [wdPauseMessage, setWdPauseMessage] = useState("");
  const [wdWindowEnabled, setWdWindowEnabled] = useState(false);
  const [wdWindowStart, setWdWindowStart] = useState("10:00");
  const [wdWindowEnd, setWdWindowEnd] = useState("22:00");
  const [wdIsOpen, setWdIsOpen] = useState(true);
  const [wdProcessingNote, setWdProcessingNote] = useState("Most withdrawals are processed within 30 minutes · max 12 hours.");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    try {
      const stored = localStorage.getItem(SAVED_UPIS_KEY);
      if (stored) setSavedUpis(JSON.parse(stored));
    } catch {}

    fetch("/api/payment-settings").then(r => r.json()).then((s: {
      ratePerDiamond: number; minWithdrawal: number; maxWithdrawal: number;
      withdrawalPaused: boolean; withdrawalPauseMessage: string;
      withdrawalWindowEnabled: boolean; withdrawalWindowStart: string; withdrawalWindowEnd: string;
      withdrawalProcessingNote: string;
    }) => {
      setRate(s.ratePerDiamond);
      const globalMin = s.minWithdrawal ?? 20;
      setMaxWithdrawal(s.maxWithdrawal ?? 0);
      apiFetch<{ minWithdrawal: number | null }>("/users/me")
        .then(me => { setMinWithdrawal(me.minWithdrawal ?? globalMin); })
        .catch(() => { setMinWithdrawal(globalMin); });
      setWdPaused(s.withdrawalPaused ?? false);
      setWdPauseMessage(s.withdrawalPauseMessage ?? "");
      setWdWindowEnabled(s.withdrawalWindowEnabled ?? false);
      setWdWindowStart(s.withdrawalWindowStart ?? "10:00");
      setWdWindowEnd(s.withdrawalWindowEnd ?? "22:00");
      if (s.withdrawalProcessingNote) setWdProcessingNote(s.withdrawalProcessingNote);
      if (s.withdrawalWindowEnabled) {
        const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
        const nowMins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
        const [sh, sm] = (s.withdrawalWindowStart ?? "10:00").split(":").map(Number);
        const [eh, em] = (s.withdrawalWindowEnd ?? "22:00").split(":").map(Number);
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;
        const open = startMins <= endMins
          ? nowMins >= startMins && nowMins < endMins
          : nowMins >= startMins || nowMins < endMins;
        setWdIsOpen(open);
      }
    }).catch(() => {});

    apiFetch<Transaction[]>("/wallet/transactions")
      .then(txs => {
        const dep      = txs.filter(t => t.type === "topup").reduce((s, t) => s + Math.max(0, t.amount), 0);
        const prize    = txs.filter(t => t.type === "prize").reduce((s, t) => s + Math.max(0, t.amount), 0);
        const withdrawn = txs.filter(t => t.type === "withdraw").reduce((s, t) => s + Math.abs(Math.min(0, t.amount)), 0);
        const refunded = txs.filter(t => t.type === "withdraw_refund").reduce((s, t) => s + Math.max(0, t.amount), 0);
        setDepositDiamonds(dep);
        setWinningDiamonds(Math.max(0, prize - withdrawn + refunded));
      })
      .catch(() => { /* ignore */ })
      .finally(() => setTxLoaded(true));
  }, []);

  const canWithdrawDeposit = !!user?.allowDepositWithdrawal;
  const actualBalance = user?.diamondBalance ?? 0;

  const twoFaBlockActive = (() => {
    if (!user?.twoFaResetAt || user?.twoFaWithdrawalBypass) return false;
    const elapsed = Date.now() - new Date(user.twoFaResetAt).getTime();
    return elapsed < 24 * 60 * 60 * 1000;
  })();
  const twoFaBlockExpiresAt = twoFaBlockActive && user?.twoFaResetAt
    ? new Date(new Date(user.twoFaResetAt).getTime() + 24 * 60 * 60 * 1000).toISOString()
    : null;
  // Cap by actual balance — deposit/prize totals are lifetime sums and don't account for spent diamonds
  const maxWithdrawableDiamonds = Math.min(actualBalance, Math.max(0, winningDiamonds + (canWithdrawDeposit ? depositDiamonds : 0)));
  const maxRupees = maxWithdrawableDiamonds * rate;
  const effectiveDepositDiamonds = Math.min(depositDiamonds, actualBalance);
  const depositRupees = (effectiveDepositDiamonds * rate).toFixed(2);
  const maxRupeesStr = maxRupees.toFixed(2);

  const parsedAmount = parseFloat(amount) || 0;
  const effectiveMax = maxWithdrawal > 0 ? Math.min(maxRupees, maxWithdrawal) : maxRupees;
  const isAmountValid = parsedAmount >= minWithdrawal && parsedAmount <= effectiveMax;
  const diamondsNeeded = Math.ceil(parsedAmount / rate);

  const quickAmounts = [
    { label: "25%", value: (maxRupees * 0.25) },
    { label: "50%", value: (maxRupees * 0.5) },
    { label: "75%", value: (maxRupees * 0.75) },
    { label: "Max", value: maxRupees },
  ];

  function handleQuick(val: number) {
    setAmount(val % 1 === 0 ? val.toString() : val.toFixed(2));
  }

  function saveUpiToList(id: string) {
    const trimmed = id.trim();
    if (!trimmed || trimmed.length < 5) return;
    setSavedUpis(prev => {
      if (prev.includes(trimmed)) return prev;
      const next = [trimmed, ...prev].slice(0, 3);
      localStorage.setItem(SAVED_UPIS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function removeUpiFromList(id: string) {
    setSavedUpis(prev => {
      const next = prev.filter(u => u !== id);
      localStorage.setItem(SAVED_UPIS_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <div className="min-h-[100dvh] flex flex-col relative profile-page-bg">
      <div className="absolute top-0 right-0 w-72 h-72 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)" }} />
      <div className="absolute bottom-0 left-0 w-60 h-60 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, hsl(var(--primary)/0.07) 0%, transparent 70%)" }} />

      <div className="h-1 w-full btn-primary-gradient" />

      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowInfo(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm rounded-t-3xl p-6 pb-10"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--primary)/0.2)" }}
            onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowInfo(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center">
              <X className="w-4 h-4 text-zinc-400" />
            </button>
            <h3 className="font-heading font-bold text-lg text-foreground mb-4">Withdrawal Rules</h3>
            <div className="space-y-3">
              {[
                { icon: "💎", title: "Only Winnings are Withdrawable", desc: "Diamonds earned from tournament prizes can be withdrawn as cash." },
                { icon: "🚫", title: "Deposits are Non-Refundable", desc: "Top-up diamonds are used for tournament entry fees and cannot be withdrawn." },
                { icon: "⚡", title: "Processing Time", desc: "Most withdrawals complete within 30 minutes. Maximum wait is 12 hours." },
                { icon: "📱", title: "UPI Only", desc: "Payouts are sent to your UPI ID. Ensure it is correct before submitting." },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-2xl"
                  style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--primary)/0.08)" }}>
                  <span className="text-xl mt-0.5">{item.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-4 pt-5 pb-2 relative z-10">
        <Link href="/wallet">
          <button className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
        </Link>
        <span className="text-[11px] text-muted-foreground uppercase tracking-[0.18em] font-bold">Withdraw</span>
        <button onClick={() => setShowInfo(true)}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
          <AlertCircle className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="px-4 pt-2 flex flex-col gap-4 relative z-10 pb-10">

        {step !== "done" && (
          <div className="rounded-3xl overflow-hidden"
            style={{
              background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
              border: "1px solid hsl(var(--primary)/0.2)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            }}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] font-bold px-5 pt-4 pb-3">
              Balance Breakdown
            </p>

            <div className="flex items-center gap-4 px-5 py-3.5" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                style={canWithdrawDeposit
                  ? { background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)" }
                  : { background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.2)" }}>
                <ArrowDownLeft className={`w-4 h-4 ${canWithdrawDeposit ? "text-emerald-400" : "text-blue-400"}`} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Deposit Balance</p>
                <p className={`text-[11px] mt-0.5 ${canWithdrawDeposit ? "text-emerald-500/80 font-medium" : "text-zinc-500"}`}>
                  {canWithdrawDeposit ? "Withdrawable ✓ (admin approved)" : "From top-ups · not withdrawable"}
                </p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 justify-end">
                  <Gem className={`w-3 h-3 ${canWithdrawDeposit ? "text-emerald-400" : "text-blue-400"}`} strokeWidth={2} />
                  <span className={`text-sm font-bold ${canWithdrawDeposit ? "text-emerald-300" : "text-blue-300"}`}>{txLoaded ? effectiveDepositDiamonds.toLocaleString() : "—"}</span>
                </div>
                <p className="text-[10px] text-zinc-600 mt-0.5">₹{depositRupees}</p>
              </div>
            </div>

            <div className="mx-5" style={{ borderTop: "1px dashed rgba(255,255,255,0.06)" }} />

            <div className="flex items-center gap-4 px-5 py-3.5">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)" }}>
                <Trophy className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Winning Balance</p>
                <p className="text-[11px] text-emerald-500/80 mt-0.5 font-medium">Withdrawable ✓</p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 justify-end">
                  <Gem className="w-3 h-3 text-blue-400" strokeWidth={2} />
                  <span className="text-sm font-bold text-emerald-300">{txLoaded ? winningDiamonds.toLocaleString() : "—"}</span>
                </div>
                <p className="text-[11px] text-emerald-600/80 mt-0.5 font-semibold">₹{(winningDiamonds * rate).toFixed(2)}</p>
              </div>
            </div>
          </div>
        )}

        {step === "form" && (
          <>
            <div className="rounded-3xl p-5 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(16,185,129,0.03) 100%)",
                border: "1px solid rgba(16,185,129,0.25)",
              }}>
              <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full pointer-events-none"
                style={{ background: "radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)" }} />

              <p className="text-[10px] text-emerald-500/80 uppercase tracking-[0.15em] font-bold mb-4">
                Enter Withdrawal Amount
              </p>

              <div className="flex items-center gap-2 mb-1">
                <span className="text-4xl font-extrabold font-heading text-emerald-400 leading-none">₹</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9.]/g, "");
                    const parts = v.split(".");
                    setAmount(parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : v);
                  }}
                  placeholder="0"
                  className="flex-1 bg-transparent text-4xl font-extrabold font-heading text-foreground placeholder:text-zinc-700 outline-none leading-none w-0"
                />
              </div>

              <div className="mb-4 h-4">
                {amount !== "" && !isAmountValid && (
                  <p className="text-[11px] text-red-400">
                    {parsedAmount < minWithdrawal
                      ? `Minimum withdrawal is ₹${minWithdrawal}`
                      : maxWithdrawal > 0 && parsedAmount > maxWithdrawal
                        ? `Maximum withdrawal is ₹${maxWithdrawal}`
                        : `Max withdrawable is ₹${maxRupeesStr}`}
                  </p>
                )}
                {isAmountValid && (
                  <p className="text-[11px] text-emerald-500/80">
                    = {diamondsNeeded} diamonds redeemed
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                {quickAmounts.map(q => (
                  <button
                    key={q.label}
                    onClick={() => handleQuick(q.value)}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-xs font-bold transition-all active:scale-95",
                      parseFloat(amount) === parseFloat(q.value.toFixed(2)) || parseFloat(amount) === q.value
                        ? "text-white"
                        : "text-emerald-400"
                    )}
                    style={
                      parseFloat(amount) === parseFloat(q.value.toFixed(2)) || parseFloat(amount) === q.value
                        ? { background: "rgba(16,185,129,0.35)", border: "1px solid rgba(16,185,129,0.5)" }
                        : { background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }
                    }>
                    {q.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between mt-3 pt-3"
                style={{ borderTop: "1px dashed rgba(16,185,129,0.15)" }}>
                <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">Available</span>
                <span className="text-sm font-extrabold text-emerald-400 px-3 py-1 rounded-xl"
                  style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)" }}>
                  ₹{maxRupeesStr}
                </span>
              </div>
            </div>

            <div className="rounded-3xl p-5"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--primary)/0.2)" }}>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.2)" }}>
                    <Banknote className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Payout UPI ID</p>
                    <p className="text-[11px] text-zinc-500">Where should we send the money?</p>
                  </div>
                </div>
                {upiId.trim().length >= 5 && !savedUpis.includes(upiId.trim()) && savedUpis.length < 3 && (
                  <button
                    onClick={() => saveUpiToList(upiId)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-emerald-400 active:opacity-70 transition-opacity shrink-0"
                    style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }}>
                    <BookmarkCheck className="w-3 h-3" />
                    Save
                  </button>
                )}
              </div>

              <div className="rounded-2xl px-4 py-3 mb-3"
                style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--primary)/0.2)" }}>
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  name="upi-id-field"
                  value={upiId}
                  onChange={e => setUpiId(e.target.value)}
                  placeholder="Enter your UPI ID"
                  className="w-full bg-transparent text-base font-bold text-foreground placeholder:text-zinc-600 outline-none"
                />
              </div>

              {savedUpis.length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-[0.12em] font-bold mb-2">
                    Saved UPIs · tap to use
                  </p>
                  <div className="flex flex-col gap-2">
                    {savedUpis.map(u => (
                      <div key={u} className="flex items-center gap-2">
                        <button
                          onClick={() => setUpiId(u)}
                          className={cn(
                            "flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl text-left active:opacity-70 transition-all",
                            upiId === u ? "ring-1 ring-emerald-500/40" : ""
                          )}
                          style={{
                            background: upiId === u ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.03)",
                            border: upiId === u ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(255,255,255,0.07)",
                          }}>
                          <BookmarkCheck className={cn("w-3.5 h-3.5 shrink-0", upiId === u ? "text-emerald-400" : "text-zinc-500")} />
                          <span className={cn("text-xs font-bold truncate", upiId === u ? "text-emerald-300" : "text-zinc-300")}>{u}</span>
                          {upiId === u && <span className="ml-auto text-[9px] font-bold text-emerald-500 shrink-0">SELECTED</span>}
                        </button>
                        <button
                          onClick={() => { removeUpiFromList(u); if (upiId === u) setUpiId(""); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 active:opacity-70 transition-opacity"
                          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}>
                          <X className="w-3 h-3 text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {savedUpis.length < 3 && (
                    <p className="text-[9px] text-zinc-600 mt-2">{3 - savedUpis.length} slot{3 - savedUpis.length !== 1 ? "s" : ""} remaining</p>
                  )}
                  {savedUpis.length === 3 && (
                    <p className="text-[9px] text-zinc-600 mt-2">3/3 slots used · remove one to add another</p>
                  )}
                </div>
              )}
            </div>

            {/* ── 2FA passcode change withdrawal block ── */}
            {twoFaBlockActive && (
              <div className="rounded-2xl overflow-hidden"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>
                <div className="flex items-center gap-3 px-4 py-3"
                  style={{ background: "rgba(239,68,68,0.12)", borderBottom: "1px solid rgba(239,68,68,0.2)" }}>
                  <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.35)" }}>
                    <span className="text-sm">🔒</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-red-300 uppercase tracking-wider">Withdrawals Blocked</p>
                    <p className="text-[10px] text-red-400/70 mt-0.5">Security hold after passcode change</p>
                  </div>
                </div>
                <div className="px-4 py-3 flex flex-col gap-1.5">
                  <p className="text-[12px] text-red-300/80 leading-relaxed">
                    Your 2FA passcode was recently changed. For security, withdrawals are disabled for 24 hours to prevent unauthorised account access.
                  </p>
                  {twoFaBlockExpiresAt && (
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Unblocks: <span className="text-red-400/80 font-semibold">{new Date(twoFaBlockExpiresAt).toLocaleString()}</span>
                    </p>
                  )}
                  <p className="text-[11px] text-zinc-600 mt-0.5">For emergency access contact support.</p>
                </div>
              </div>
            )}

            {/* ── Withdrawal status banner ── */}
            {wdPaused ? (
              <div className="rounded-2xl overflow-hidden"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>
                <div className="flex items-center gap-3 px-4 py-3"
                  style={{ background: "rgba(239,68,68,0.12)", borderBottom: "1px solid rgba(239,68,68,0.2)" }}>
                  <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.35)" }}>
                    <span className="text-sm">🔴</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-red-300 uppercase tracking-wider">Withdrawals Paused</p>
                    <p className="text-[10px] text-red-400/70 mt-0.5">System maintenance in progress</p>
                  </div>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[12px] text-red-300/80 leading-relaxed">{wdPauseMessage || "Withdrawals are temporarily paused. Please try again later."}</p>
                </div>
              </div>
            ) : wdWindowEnabled && !wdIsOpen ? (
              <div className="rounded-2xl overflow-hidden"
                style={{ background: "rgba(234,179,8,0.07)", border: "1px solid rgba(234,179,8,0.25)" }}>
                <div className="flex items-center gap-3 px-4 py-3"
                  style={{ background: "rgba(234,179,8,0.1)", borderBottom: "1px solid rgba(234,179,8,0.18)" }}>
                  <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.3)" }}>
                    <span className="text-sm">⏰</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-yellow-300 uppercase tracking-wider">Withdrawal Window Closed</p>
                    <p className="text-[10px] text-yellow-400/70 mt-0.5">Outside active hours</p>
                  </div>
                  <span className="ml-auto text-[10px] font-bold text-yellow-300 px-2.5 py-1 rounded-full shrink-0"
                    style={{ background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.3)" }}>
                    Opens {wdWindowStart} IST
                  </span>
                </div>
                <div className="px-4 py-3 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-400/60 shrink-0" />
                  <p className="text-[11px] text-yellow-300/70">Withdrawals are open daily from <span className="font-bold text-yellow-300">{wdWindowStart}</span> to <span className="font-bold text-yellow-300">{wdWindowEnd}</span> IST</p>
                </div>
              </div>
            ) : wdWindowEnabled && wdIsOpen ? (
              <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
                style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.22)" }}>
                <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                <p className="text-[11px] text-emerald-300/80 flex-1">Withdrawal window open · closes at <span className="font-bold text-emerald-300">{wdWindowEnd} IST</span></p>
                <span className="text-[10px] font-bold text-emerald-400 px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)" }}>OPEN</span>
              </div>
            ) : null}

            {/* ── Processing note ── */}
            <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.18)" }}>
              <span className="text-base shrink-0">⚡</span>
              <p className="text-[11px] text-indigo-300/80 leading-relaxed">{wdProcessingNote}</p>
            </div>

            <button
              disabled={!isAmountValid || upiId.trim().length < 5 || wdPaused || !wdIsOpen || twoFaBlockActive}
              onClick={() => setStep("confirm")}
              className="w-full h-13 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all py-3.5 disabled:opacity-40 disabled:pointer-events-none"
              style={{
                background: "linear-gradient(135deg, #10b981, #059669)",
                boxShadow: "0 0 24px rgba(16,185,129,0.35)",
              }}>
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        {step === "confirm" && (
          <>
            <div className="rounded-3xl overflow-hidden"
              style={{ background: "hsl(var(--card))", border: "1px solid rgba(16,185,129,0.22)", boxShadow: "0 0 32px rgba(16,185,129,0.06)" }}>
              {/* Header */}
              <div className="px-5 py-3.5 flex items-center gap-2.5"
                style={{ background: "rgba(16,185,129,0.06)", borderBottom: "1px solid rgba(16,185,129,0.12)" }}>
                <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)" }}>
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2} />
                </div>
                <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-[0.12em]">Confirm Withdrawal</p>
              </div>

              {/* Amount hero */}
              <div className="px-5 py-5 flex items-center justify-between"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">You receive</p>
                  <p className="text-3xl font-bold text-emerald-400">
                    ₹{parsedAmount % 1 === 0 ? parsedAmount : parsedAmount.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Deducted</p>
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-xl font-bold text-white">{diamondsNeeded}</span>
                    <Gem className="w-4 h-4 text-cyan-400" />
                  </div>
                </div>
              </div>

              {/* Details rows */}
              <div className="px-5 py-1">
                <div className="flex justify-between items-center py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.2)" }}>
                      <Banknote className="w-3.5 h-3.5 text-violet-400" />
                    </div>
                    <span className="text-xs text-zinc-500">Sending To</span>
                  </div>
                  <span className="text-xs font-bold text-violet-400 ml-4 text-right break-all max-w-[55%]">{upiId}</span>
                </div>
                <div className="flex justify-between items-center py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.2)" }}>
                      <Clock className="w-3.5 h-3.5 text-yellow-400" />
                    </div>
                    <span className="text-xs text-zinc-500">Processing Time</span>
                  </div>
                  <span className="text-xs font-semibold text-zinc-400">Estimated 30 min – 12 hours</span>
                </div>
              </div>
            </div>

            {submitError && (
              <div className="rounded-2xl px-4 py-3 flex items-start gap-3"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-[12px] text-red-300 leading-relaxed">{submitError}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setStep("form"); setSubmitError(null); }}
                className="flex-1 h-13 rounded-2xl font-bold text-sm py-3.5 active:opacity-70 transition-opacity"
                style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--primary)/0.2)", color: "hsl(var(--muted-foreground))" }}>
                Edit
              </button>
              <button
                onClick={async () => {
                  setSubmitting(true);
                  setSubmitError(null);
                  try {
                    await apiPost("/wallet/withdraw", { rupees: parsedAmount, upiId });
                    haptic.impact(); sound.success();
                    setStep("done");
                  } catch (e: unknown) {
                    const msg = (e as { message?: string })?.message ?? String(e);
                    haptic.error(); sound.error();
                    if (msg.includes("passcode_changed") || msg.toLowerCase().includes("passcode")) {
                      setSubmitError("Withdrawals are blocked for 24 hours after a passcode change. Contact support for emergency access.");
                    } else {
                      setSubmitError(msg);
                    }
                  } finally {
                    setSubmitting(false);
                  }
                }}
                disabled={submitting}
                className="flex-[2] h-13 rounded-2xl text-white font-bold text-sm active:scale-[0.98] transition-all py-3.5 disabled:opacity-60"
                style={{
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  boxShadow: "0 0 24px rgba(16,185,129,0.35)",
                }}>
                {submitting ? "Submitting…" : "Confirm Withdrawal"}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-5 text-center pt-2">
            <div className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)" }}>
              <CheckCircle className="w-10 h-10 text-emerald-400" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="font-heading text-2xl font-bold text-foreground mb-1">Request Submitted!</h2>
              <p className="text-sm text-zinc-500">Your withdrawal is being processed</p>
            </div>
            <div className="w-full rounded-3xl p-5"
              style={{ background: "hsl(var(--card))", border: "1px solid rgba(16,185,129,0.2)" }}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Summary</p>
              <div className="space-y-3 text-left">
                {[
                  { icon: <SendHorizonal className="w-4 h-4 text-emerald-400" />, bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.25)", text: `₹${parsedAmount % 1 === 0 ? parsedAmount : parsedAmount.toFixed(2)} will be sent to ${upiId}` },
                  { icon: <Clock className="w-4 h-4 text-yellow-400" />, bg: "rgba(234,179,8,0.12)", border: "rgba(234,179,8,0.25)", text: "Estimated processing time: 30 min – 12 hours" },
                  { icon: <Bell className="w-4 h-4 text-blue-400" />, bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.25)", text: "You'll be notified once it's done" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: item.bg, border: `1px solid ${item.border}` }}>
                      {item.icon}
                    </div>
                    <p className="text-sm text-zinc-400 mt-1.5">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {savedUpis.includes(upiId.trim()) ? (
              <div className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl"
                style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }}>
                <BookmarkCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-emerald-300">UPI ID Saved</p>
                  <p className="text-[11px] text-zinc-500">Available to pick on your next withdrawal</p>
                </div>
              </div>
            ) : savedUpis.length < 3 ? (
              <button
                onClick={() => saveUpiToList(upiId)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl active:opacity-70 transition-opacity"
                style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--primary)/0.15)" }}>
                <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 bg-white/5 border border-white/20">
                  <BookmarkCheck className="w-3 h-3 text-zinc-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-foreground">Save this UPI ID</p>
                  <p className="text-[11px] text-zinc-500">Pick it quickly on your next withdrawal · {3 - savedUpis.length} slot{3 - savedUpis.length !== 1 ? "s" : ""} left</p>
                </div>
              </button>
            ) : null}

            <Link href="/wallet" className="w-full">
              <button className="w-full h-13 rounded-2xl text-white font-bold text-sm btn-primary-gradient shadow-[0_0_24px_rgba(234,88,12,0.35)] active:scale-[0.98] transition-all py-3.5">
                Back to Wallet
              </button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
