import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Gem, Trophy, ArrowDownLeft, CheckCircle,
  Banknote, AlertCircle, ChevronRight, X, SendHorizonal,
  Clock, Bell, BookmarkCheck, ShieldAlert, Mail, MessageCircle,
  Youtube, HelpCircle, ChevronDown,
} from "lucide-react";
import { apiFetch, apiPost } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { sound } from "@/lib/sounds";
import type { Transaction } from "./wallet-all";

const SAVED_UPIS_KEY = "clash-ren:saved-upi-ids";

type Step     = "form" | "method" | "confirm" | "done";
type Method   = "upi" | "googleplay";
type GpDeliv  = "email" | "whatsapp";

export default function WalletWithdrawPage() {
  const { user } = useAuth();

  /* ── amount / balance ─────────────────────────────────────── */
  const [amount, setAmount]           = useState("");
  const [depositDiamonds, setDepositDiamonds] = useState(0);
  const [winningDiamonds, setWinningDiamonds] = useState(0);
  const [txLoaded, setTxLoaded]       = useState(false);
  const [rate, setRate]               = useState(0.5);
  const [minWithdrawal, setMinWithdrawal] = useState(0);
  const [maxWithdrawal, setMaxWithdrawal] = useState(0);

  /* ── settings / window ────────────────────────────────────── */
  const [wdPaused, setWdPaused]                   = useState(false);
  const [wdPauseMessage, setWdPauseMessage]       = useState("");
  const [wdWindowEnabled, setWdWindowEnabled]     = useState(false);
  const [wdWindowStart, setWdWindowStart]         = useState("10:00");
  const [wdWindowEnd, setWdWindowEnd]             = useState("22:00");
  const [wdIsOpen, setWdIsOpen]                   = useState(true);
  const [wdProcessingNote, setWdProcessingNote]   = useState("Most withdrawals are processed within 30 minutes · max 12 hours.");

  /* ── step / method ────────────────────────────────────────── */
  const [step, setStep]           = useState<Step>("form");
  const [method, setMethod]       = useState<Method | null>(null);
  const [gpDeliv, setGpDeliv]     = useState<GpDeliv | null>(null);
  const [showInfo, setShowInfo]   = useState(false);

  /* ── UPI ──────────────────────────────────────────────────── */
  const [upiId, setUpiId]         = useState("");
  const [savedUpis, setSavedUpis] = useState<string[]>([]);

  /* ── Google Play ──────────────────────────────────────────── */
  const [gpEmail, setGpEmail]     = useState("");

  /* ── submit ───────────────────────────────────────────────── */
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /* ── derived ──────────────────────────────────────────────── */
  const canWithdrawDeposit = !!user?.allowDepositWithdrawal;
  const actualBalance      = user?.diamondBalance ?? 0;
  const phone              = (user as unknown as { phone?: string })?.phone ?? "";

  const twoFaBlockActive = (() => {
    const u = user as unknown as { twoFaResetAt?: string; twoFaWithdrawalBypass?: boolean } | undefined;
    if (!u?.twoFaResetAt || u?.twoFaWithdrawalBypass) return false;
    return Date.now() - new Date(u.twoFaResetAt).getTime() < 24 * 60 * 60 * 1000;
  })();
  const twoFaBlockExpiresAt = twoFaBlockActive
    ? new Date(new Date((user as unknown as { twoFaResetAt: string }).twoFaResetAt).getTime() + 86400000).toISOString()
    : null;

  const maxWithdrawableDiamonds = Math.min(
    actualBalance,
    Math.max(0, winningDiamonds + (canWithdrawDeposit ? depositDiamonds : 0))
  );
  const maxRupees    = maxWithdrawableDiamonds * rate;
  const effectiveDepositDiamonds = Math.min(depositDiamonds, actualBalance);
  const depositRupees = (effectiveDepositDiamonds * rate).toFixed(2);
  const maxRupeesStr  = maxRupees.toFixed(2);

  const parsedAmount  = parseFloat(amount) || 0;
  const effectiveMax  = maxWithdrawal > 0 ? Math.min(maxRupees, maxWithdrawal) : maxRupees;
  const isAmountValid = parsedAmount >= minWithdrawal && parsedAmount <= effectiveMax;
  const diamondsNeeded = Math.ceil(parsedAmount / rate);

  const quickAmounts = [
    { label: "25%", value: maxRupees * 0.25 },
    { label: "50%", value: maxRupees * 0.5  },
    { label: "75%", value: maxRupees * 0.75 },
    { label: "Max", value: maxRupees         },
  ];

  /* ── method validation ────────────────────────────────────── */
  const upiValid    = method === "upi" && upiId.trim().length >= 5;
  const emailValid  = method === "googleplay" && gpDeliv === "email"    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gpEmail.trim());
  const waValid     = method === "googleplay" && gpDeliv === "whatsapp" && phone.length >= 6;
  const methodValid = upiValid || emailValid || waValid;

  /* ── what we encode in the upiId field for the API ───────── */
  function encodedDestination(): string {
    if (method === "upi")        return upiId.trim();
    if (gpDeliv === "email")     return `GPAY:EMAIL:${gpEmail.trim()}`;
    if (gpDeliv === "whatsapp")  return `GPAY:WA:${phone}`;
    return "";
  }

  /* ── display helpers ──────────────────────────────────────── */
  function methodLabel(): string {
    if (method === "upi")       return `UPI · ${upiId.trim()}`;
    if (gpDeliv === "email")    return `Google Play · Email to ${gpEmail.trim()}`;
    if (gpDeliv === "whatsapp") return `Google Play · WhatsApp to ${maskPhone(phone)}`;
    return "";
  }

  function maskPhone(p: string): string {
    if (p.length <= 4) return p;
    return p.slice(0, -5).replace(/./g, "•") + p.slice(-5).replace(/./g, "•").replace(/^.{0}/, "") ;
    // e.g. "+91 98765•••••" — show last 5 as dots
  }

  /* smarter mask: show +91 prefix + first 2 digits + 5 bullets */
  function nicePhone(p: string): string {
    const digits = p.replace(/\D/g, "");
    if (digits.length < 6) return p;
    const cc  = digits.length === 12 ? `+${digits.slice(0, 2)} ` : digits.length === 13 ? `+${digits.slice(0, 3)} ` : "";
    const num = cc ? digits.slice(cc.replace(/\D/g,"").length) : digits;
    const show = num.slice(0, 2);
    const hide = "•".repeat(Math.max(0, num.length - 2));
    return `${cc}${show}${hide}`;
  }

  /* ── load data ────────────────────────────────────────────── */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    try {
      const stored = localStorage.getItem(SAVED_UPIS_KEY);
      if (stored) setSavedUpis(JSON.parse(stored));
    } catch {}

    fetch("/api/payment-settings").then(r => r.json()).then((s: {
      ratePerDiamond: number; minWithdrawal: number; maxWithdrawal: number;
      withdrawalPaused: boolean; withdrawalPauseMessage: string;
      withdrawalWindowEnabled: boolean; withdrawalWindowStart: string;
      withdrawalWindowEnd: string; withdrawalProcessingNote: string;
    }) => {
      setRate(s.ratePerDiamond);
      const globalMin = s.minWithdrawal ?? 20;
      setMaxWithdrawal(s.maxWithdrawal ?? 0);
      apiFetch<{ minWithdrawal: number | null }>("/users/me")
        .then(me => { setMinWithdrawal((me as unknown as { minWithdrawal?: number }).minWithdrawal ?? globalMin); })
        .catch(() => setMinWithdrawal(globalMin));
      setWdPaused(s.withdrawalPaused ?? false);
      setWdPauseMessage(s.withdrawalPauseMessage ?? "");
      setWdWindowEnabled(s.withdrawalWindowEnabled ?? false);
      setWdWindowStart(s.withdrawalWindowStart ?? "10:00");
      setWdWindowEnd(s.withdrawalWindowEnd ?? "22:00");
      if (s.withdrawalProcessingNote) setWdProcessingNote(s.withdrawalProcessingNote);
      if (s.withdrawalWindowEnabled) {
        const ist   = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
        const nowM  = ist.getUTCHours() * 60 + ist.getUTCMinutes();
        const [sh, sm] = (s.withdrawalWindowStart ?? "10:00").split(":").map(Number);
        const [eh, em] = (s.withdrawalWindowEnd   ?? "22:00").split(":").map(Number);
        const sM = sh * 60 + sm, eM = eh * 60 + em;
        setWdIsOpen(sM <= eM ? nowM >= sM && nowM < eM : nowM >= sM || nowM < eM);
      }
    }).catch(() => {});

    apiFetch<Transaction[]>("/wallet/transactions")
      .then(txs => {
        const dep  = txs.filter(t => t.type === "topup").reduce((s, t) => s + Math.max(0, t.amount), 0);
        const prize = txs.filter(t => t.type === "prize").reduce((s, t) => s + Math.max(0, t.amount), 0);
        const wd   = txs.filter(t => t.type === "withdraw").reduce((s, t) => s + Math.abs(Math.min(0, t.amount)), 0);
        const ref  = txs.filter(t => t.type === "withdraw_refund").reduce((s, t) => s + Math.max(0, t.amount), 0);
        setDepositDiamonds(dep);
        setWinningDiamonds(Math.max(0, prize - wd + ref));
      })
      .catch(() => {})
      .finally(() => setTxLoaded(true));
  }, []);

  /* ── UPI saved list helpers ───────────────────────────────── */
  function saveUpiToList(id: string) {
    const t = id.trim();
    if (!t || t.length < 5) return;
    setSavedUpis(prev => {
      if (prev.includes(t)) return prev;
      const next = [t, ...prev].slice(0, 3);
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

  /* ── submit ───────────────────────────────────────────────── */
  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiPost("/wallet/withdraw", { rupees: parsedAmount, upiId: encodedDestination() });
      haptic.impact(); sound.success();
      if (method === "upi") saveUpiToList(upiId);
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
  }

  const blocked = wdPaused || (wdWindowEnabled && !wdIsOpen) || twoFaBlockActive;

  /* ════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-[100dvh] flex flex-col relative profile-page-bg">
      <div className="absolute top-0 right-0 w-72 h-72 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)" }} />
      <div className="absolute bottom-0 left-0 w-60 h-60 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, hsl(var(--primary)/0.07) 0%, transparent 70%)" }} />

      <div className="h-1 w-full btn-primary-gradient" />

      {/* ── Info sheet ── */}
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
                { icon: "💎", title: "Only Winnings are Withdrawable", desc: "Diamonds earned from tournament prizes can be withdrawn as cash or Google Play codes." },
                { icon: "🚫", title: "Deposits are Non-Refundable",   desc: "Top-up diamonds are used for tournament entry fees and cannot be withdrawn." },
                { icon: "⚡", title: "Processing Time",               desc: "Most withdrawals complete within 30 minutes. Maximum wait is 12 hours." },
                { icon: "📱", title: "UPI or Google Play",            desc: "Receive payout via UPI or as a Google Play Redeem Code sent by email or WhatsApp." },
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

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 pt-5 pb-2 relative z-10">
        {step === "method" ? (
          <button onClick={() => { haptic.lightTap?.(); setStep("form"); }}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
        ) : (
          <Link href="/wallet">
            <button className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
              <ArrowLeft className="w-4 h-4 text-foreground" />
            </button>
          </Link>
        )}
        <span className="text-[11px] text-muted-foreground uppercase tracking-[0.18em] font-bold">Withdraw</span>
        <button onClick={() => setShowInfo(true)}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
          <AlertCircle className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="px-4 pt-2 flex flex-col gap-4 relative z-10 pb-10">

        {/* ── Balance breakdown (hidden on done) ── */}
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
                  <span className={`text-sm font-bold ${canWithdrawDeposit ? "text-emerald-300" : "text-blue-300"}`}>
                    {txLoaded ? effectiveDepositDiamonds.toLocaleString() : "—"}
                  </span>
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

        {/* ════ STEP 1: Amount ════════════════════════════════════════ */}
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
                  type="text" inputMode="decimal" value={amount}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9.]/g, "");
                    const p = v.split(".");
                    setAmount(p.length > 2 ? p[0] + "." + p.slice(1).join("") : v);
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
                  <p className="text-[11px] text-emerald-500/80">= {diamondsNeeded} diamonds redeemed</p>
                )}
              </div>
              <div className="flex gap-2">
                {quickAmounts.map(q => (
                  <button key={q.label} onClick={() => {
                    const v = q.value;
                    setAmount(v % 1 === 0 ? v.toString() : v.toFixed(2));
                  }}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-xs font-bold transition-all active:scale-95",
                      parseFloat(amount) === parseFloat(q.value.toFixed(2)) ? "text-white" : "text-emerald-400"
                    )}
                    style={parseFloat(amount) === parseFloat(q.value.toFixed(2))
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

            {/* 2FA block */}
            {twoFaBlockActive && (
              <div className="rounded-2xl overflow-hidden"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>
                <div className="flex items-center gap-3 px-4 py-3"
                  style={{ background: "rgba(239,68,68,0.12)", borderBottom: "1px solid rgba(239,68,68,0.2)" }}>
                  <span className="text-sm">🔒</span>
                  <div>
                    <p className="text-xs font-bold text-red-300 uppercase tracking-wider">Withdrawals Blocked</p>
                    <p className="text-[10px] text-red-400/70 mt-0.5">Security hold after passcode change</p>
                  </div>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[12px] text-red-300/80 leading-relaxed">
                    Your 2FA passcode was recently changed. Withdrawals are disabled for 24 hours.
                  </p>
                  {twoFaBlockExpiresAt && (
                    <p className="text-[11px] text-zinc-500 mt-1">
                      Unblocks: <span className="text-red-400/80 font-semibold">{new Date(twoFaBlockExpiresAt).toLocaleString()}</span>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Withdrawal status banners */}
            {wdPaused ? (
              <div className="rounded-2xl overflow-hidden"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>
                <div className="flex items-center gap-3 px-4 py-3"
                  style={{ background: "rgba(239,68,68,0.12)", borderBottom: "1px solid rgba(239,68,68,0.2)" }}>
                  <span className="text-sm">🔴</span>
                  <p className="text-xs font-bold text-red-300 uppercase tracking-wider">Withdrawals Paused</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[12px] text-red-300/80">{wdPauseMessage || "Withdrawals are temporarily paused. Please try again later."}</p>
                </div>
              </div>
            ) : wdWindowEnabled && !wdIsOpen ? (
              <div className="rounded-2xl overflow-hidden"
                style={{ background: "rgba(234,179,8,0.07)", border: "1px solid rgba(234,179,8,0.25)" }}>
                <div className="flex items-center gap-3 px-4 py-3"
                  style={{ background: "rgba(234,179,8,0.1)", borderBottom: "1px solid rgba(234,179,8,0.18)" }}>
                  <span className="text-sm">⏰</span>
                  <p className="text-xs font-bold text-yellow-300 uppercase tracking-wider">Window Closed</p>
                  <span className="ml-auto text-[10px] font-bold text-yellow-300 px-2.5 py-1 rounded-full shrink-0"
                    style={{ background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.3)" }}>
                    Opens {wdWindowStart} IST
                  </span>
                </div>
                <div className="px-4 py-3 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-400/60 shrink-0" />
                  <p className="text-[11px] text-yellow-300/70">
                    Open daily <span className="font-bold text-yellow-300">{wdWindowStart}</span> – <span className="font-bold text-yellow-300">{wdWindowEnd}</span> IST
                  </p>
                </div>
              </div>
            ) : wdWindowEnabled && wdIsOpen ? (
              <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
                style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.22)" }}>
                <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                <p className="text-[11px] text-emerald-300/80 flex-1">
                  Withdrawal window open · closes at <span className="font-bold text-emerald-300">{wdWindowEnd} IST</span>
                </p>
                <span className="text-[10px] font-bold text-emerald-400 px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)" }}>OPEN</span>
              </div>
            ) : null}

            <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.18)" }}>
              <span className="text-base shrink-0">⚡</span>
              <p className="text-[11px] text-indigo-300/80 leading-relaxed">{wdProcessingNote}</p>
            </div>

            <button
              disabled={!isAmountValid || blocked}
              onClick={() => { haptic.mediumTap(); setStep("method"); }}
              className="w-full h-13 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all py-3.5 disabled:opacity-40 disabled:pointer-events-none"
              style={{ background: "linear-gradient(135deg, #10b981, #059669)", boxShadow: "0 0 24px rgba(16,185,129,0.35)" }}>
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* ════ STEP 2: Choose method ══════════════════════════════════ */}
        {step === "method" && (
          <>
            <div className="flex flex-col gap-1 mb-1">
              <h2 className="text-base font-black text-foreground">Choose Payout Method</h2>
              <p className="text-[12px] text-zinc-500">How would you like to receive ₹{parsedAmount % 1 === 0 ? parsedAmount : parsedAmount.toFixed(2)}?</p>
            </div>

            {/* ── Option 1: UPI ── */}
            <div
              className="rounded-3xl overflow-hidden transition-all"
              style={{
                border: method === "upi" ? "1.5px solid rgba(16,185,129,0.5)" : "1px solid rgba(255,255,255,0.10)",
                background: method === "upi" ? "rgba(16,185,129,0.05)" : "hsl(var(--card))",
                boxShadow: method === "upi" ? "0 0 20px rgba(16,185,129,0.1)" : undefined,
              }}>
              {/* Card header — always visible */}
              <button
                className="w-full flex items-center gap-4 px-5 py-4 text-left active:opacity-80 transition-opacity"
                onClick={() => { haptic.lightTap?.(); setMethod(m => m === "upi" ? null : "upi"); }}>
                {/* UPI icon */}
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden"
                  style={{ background: "linear-gradient(135deg,#00b9f1,#0073c0)", border: "1px solid rgba(255,255,255,0.12)" }}>
                  <span className="text-white font-black text-[11px] tracking-wide">UPI</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-foreground">Pay via UPI</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Direct bank transfer — instant</p>
                  {/* mini app badges */}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {[
                      { bg: "#5f259f", label: "PhonePe" },
                      { bg: "#1a73e8", label: "GPay"    },
                      { bg: "#00b9f1", label: "Paytm"   },
                      { bg: "#00a859", label: "BHIM"    },
                    ].map(a => (
                      <div key={a.label}
                        className="px-1.5 py-0.5 rounded text-[8px] font-bold text-white"
                        style={{ background: a.bg }}>
                        {a.label}
                      </div>
                    ))}
                  </div>
                </div>
                <ChevronDown className={cn("w-4 h-4 text-zinc-500 transition-transform shrink-0", method === "upi" ? "rotate-180" : "")} />
              </button>

              {/* Expanded content */}
              {method === "upi" && (
                <div className="px-5 pb-5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="pt-4 flex flex-col gap-3">

                    {/* How-to link */}
                    <a
                      href="https://www.youtube.com/results?search_query=how+to+find+upi+id+in+phonepe+gpay+paytm"
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl active:opacity-70 transition-opacity"
                      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
                      onClick={() => haptic.lightTap?.()}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: "#ff0000" }}>
                        <Youtube className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-red-300">Don't know your UPI ID?</p>
                        <p className="text-[10px] text-zinc-500 truncate">Watch how to find it in PhonePe / GPay / Paytm</p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                    </a>

                    {/* UPI input */}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">Your UPI ID</p>
                      <div className="rounded-2xl px-4 py-3 flex items-center gap-2"
                        style={{ background: "hsl(var(--background))", border: `1px solid ${upiId.trim().length >= 5 ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.10)"}` }}>
                        <Banknote className="w-4 h-4 text-zinc-500 shrink-0" />
                        <input
                          type="text" inputMode="text" autoComplete="new-password"
                          autoCorrect="off" autoCapitalize="none" spellCheck={false}
                          value={upiId} onChange={e => setUpiId(e.target.value)}
                          placeholder="yourname@paytm / @ybl / @okaxis"
                          className="flex-1 bg-transparent text-sm font-bold text-foreground placeholder:text-zinc-600 outline-none"
                        />
                        {upiId.trim().length >= 5 && (
                          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" strokeWidth={2} />
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-600 mt-1 px-1">Format: name@bank · e.g. rahul@ybl, 9876543210@paytm</p>
                    </div>

                    {/* UPI tip */}
                    <div className="rounded-xl p-3 flex items-start gap-2.5"
                      style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
                      <ShieldAlert className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-blue-300/80 leading-relaxed">
                        <span className="font-bold text-blue-300">Double-check before submitting.</span> Payouts sent to incorrect UPI IDs cannot be reversed.
                      </p>
                    </div>

                    {/* Saved UPIs */}
                    {savedUpis.length > 0 && (
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-[0.12em] font-bold mb-2">Saved UPIs · tap to use</p>
                        <div className="flex flex-col gap-2">
                          {savedUpis.map(u => (
                            <div key={u} className="flex items-center gap-2">
                              <button onClick={() => setUpiId(u)}
                                className={cn("flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl text-left active:opacity-70 transition-all",
                                  upiId === u ? "ring-1 ring-emerald-500/40" : "")}
                                style={{
                                  background: upiId === u ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.03)",
                                  border: upiId === u ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(255,255,255,0.07)",
                                }}>
                                <BookmarkCheck className={cn("w-3.5 h-3.5 shrink-0", upiId === u ? "text-emerald-400" : "text-zinc-500")} />
                                <span className={cn("text-xs font-bold truncate", upiId === u ? "text-emerald-300" : "text-zinc-300")}>{u}</span>
                                {upiId === u && <span className="ml-auto text-[9px] font-bold text-emerald-500 shrink-0">SELECTED</span>}
                              </button>
                              <button onClick={() => { removeUpiFromList(u); if (upiId === u) setUpiId(""); }}
                                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 active:opacity-70"
                                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}>
                                <X className="w-3 h-3 text-red-400" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Option 2: Google Play ── */}
            <div
              className="rounded-3xl overflow-hidden transition-all"
              style={{
                border: method === "googleplay" ? "1.5px solid rgba(52,168,83,0.55)" : "1px solid rgba(255,255,255,0.10)",
                background: method === "googleplay" ? "rgba(52,168,83,0.05)" : "hsl(var(--card))",
                boxShadow: method === "googleplay" ? "0 0 20px rgba(52,168,83,0.1)" : undefined,
              }}>
              <button
                className="w-full flex items-center gap-4 px-5 py-4 text-left active:opacity-80 transition-opacity"
                onClick={() => { haptic.lightTap?.(); setMethod(m => m === "googleplay" ? null : "googleplay"); }}>
                {/* Google Play icon */}
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 relative overflow-hidden"
                  style={{ background: "#1c1c1e", border: "1px solid rgba(255,255,255,0.12)" }}>
                  <GooglePlayIcon />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-foreground">Google Play Redeem Code</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Receive a gift code for the Play Store</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <div className="px-1.5 py-0.5 rounded text-[8px] font-bold text-white" style={{ background: "#34a853" }}>Email</div>
                    <div className="px-1.5 py-0.5 rounded text-[8px] font-bold text-white" style={{ background: "#25d366" }}>WhatsApp</div>
                  </div>
                </div>
                <ChevronDown className={cn("w-4 h-4 text-zinc-500 transition-transform shrink-0", method === "googleplay" ? "rotate-180" : "")} />
              </button>

              {method === "googleplay" && (
                <div className="px-5 pb-5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="pt-4 flex flex-col gap-3">
                    <p className="text-[11px] text-zinc-500">How should we send the code?</p>

                    {/* Delivery options */}
                    <div className="grid grid-cols-2 gap-2">
                      {/* Email */}
                      <button
                        onClick={() => { haptic.lightTap?.(); setGpDeliv("email"); }}
                        className="flex flex-col items-center gap-2 p-3.5 rounded-2xl transition-all active:scale-95"
                        style={{
                          border: gpDeliv === "email" ? "1.5px solid #34a853" : "1px solid rgba(255,255,255,0.10)",
                          background: gpDeliv === "email" ? "rgba(52,168,83,0.1)" : "rgba(255,255,255,0.03)",
                        }}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                          style={{ background: gpDeliv === "email" ? "#34a853" : "rgba(52,168,83,0.15)" }}>
                          <Mail className="w-4 h-4 text-white" />
                        </div>
                        <p className="text-xs font-bold text-foreground">Email</p>
                        <p className="text-[9px] text-zinc-500 text-center leading-tight">Code sent to your email</p>
                      </button>

                      {/* WhatsApp */}
                      <button
                        onClick={() => { haptic.lightTap?.(); setGpDeliv("whatsapp"); }}
                        className="flex flex-col items-center gap-2 p-3.5 rounded-2xl transition-all active:scale-95"
                        style={{
                          border: gpDeliv === "whatsapp" ? "1.5px solid #25d366" : "1px solid rgba(255,255,255,0.10)",
                          background: gpDeliv === "whatsapp" ? "rgba(37,211,102,0.08)" : "rgba(255,255,255,0.03)",
                        }}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                          style={{ background: gpDeliv === "whatsapp" ? "#25d366" : "rgba(37,211,102,0.15)" }}>
                          <MessageCircle className="w-4 h-4 text-white" />
                        </div>
                        <p className="text-xs font-bold text-foreground">WhatsApp</p>
                        <p className="text-[9px] text-zinc-500 text-center leading-tight">To your registered number</p>
                      </button>
                    </div>

                    {/* Email input */}
                    {gpDeliv === "email" && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">Your Email Address</p>
                        <div className="rounded-2xl px-4 py-3 flex items-center gap-2"
                          style={{ background: "hsl(var(--background))", border: `1px solid ${emailValid ? "rgba(52,168,83,0.45)" : "rgba(255,255,255,0.10)"}` }}>
                          <Mail className="w-4 h-4 text-zinc-500 shrink-0" />
                          <input
                            type="email" inputMode="email" value={gpEmail}
                            onChange={e => setGpEmail(e.target.value)}
                            placeholder="you@gmail.com"
                            className="flex-1 bg-transparent text-sm font-bold text-foreground placeholder:text-zinc-600 outline-none"
                          />
                          {emailValid && <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" strokeWidth={2} />}
                        </div>
                      </div>
                    )}

                    {/* WhatsApp info */}
                    {gpDeliv === "whatsapp" && (
                      <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3"
                        style={{ background: "rgba(37,211,102,0.07)", border: "1px solid rgba(37,211,102,0.22)" }}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: "#25d366" }}>
                          <MessageCircle className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-bold text-emerald-300">Sending to registered number</p>
                          <p className="text-[11px] text-zinc-400 mt-0.5 font-mono">{nicePhone(phone) || "Your registered number"}</p>
                        </div>
                        {waValid && <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" strokeWidth={2} />}
                      </div>
                    )}

                    {/* Google Play note */}
                    <div className="rounded-xl p-3 flex items-start gap-2.5"
                      style={{ background: "rgba(52,168,83,0.06)", border: "1px solid rgba(52,168,83,0.15)" }}>
                      <HelpCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        You'll receive a Google Play Redeem Code worth <span className="text-white font-bold">₹{parsedAmount % 1 === 0 ? parsedAmount : parsedAmount.toFixed(2)}</span>. Redeemable in the Play Store under <span className="text-white font-semibold">Payment methods → Redeem code</span>.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Continue button */}
            <button
              disabled={!methodValid}
              onClick={() => { haptic.mediumTap(); setStep("confirm"); setSubmitError(null); }}
              className="w-full h-13 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all py-3.5 disabled:opacity-40 disabled:pointer-events-none"
              style={{ background: "linear-gradient(135deg, #10b981, #059669)", boxShadow: "0 0 24px rgba(16,185,129,0.35)" }}>
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* ════ STEP 3: Confirm ════════════════════════════════════════ */}
        {step === "confirm" && (
          <>
            <div className="rounded-3xl overflow-hidden"
              style={{ background: "hsl(var(--card))", border: "1px solid rgba(16,185,129,0.22)", boxShadow: "0 0 32px rgba(16,185,129,0.06)" }}>
              <div className="px-5 py-3.5 flex items-center gap-2.5"
                style={{ background: "rgba(16,185,129,0.06)", borderBottom: "1px solid rgba(16,185,129,0.12)" }}>
                <CheckCircle className="w-4 h-4 text-emerald-400" strokeWidth={2} />
                <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-[0.12em]">Confirm Withdrawal</p>
              </div>
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
              <div className="px-5 py-1">
                <div className="flex justify-between items-center py-3.5"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: method === "googleplay" ? "rgba(52,168,83,0.15)" : "rgba(139,92,246,0.12)", border: "1px solid rgba(255,255,255,0.1)" }}>
                      {method === "googleplay"
                        ? <span className="text-[10px]">🎮</span>
                        : <Banknote className="w-3.5 h-3.5 text-violet-400" />}
                    </div>
                    <span className="text-xs text-zinc-500">{method === "googleplay" ? "Delivery" : "Sending To"}</span>
                  </div>
                  <span className="text-xs font-bold ml-4 text-right break-all max-w-[55%]"
                    style={{ color: method === "googleplay" ? "#34a853" : "#a78bfa" }}>
                    {method === "upi" && upiId.trim()}
                    {method === "googleplay" && gpDeliv === "email"    && `Email · ${gpEmail.trim()}`}
                    {method === "googleplay" && gpDeliv === "whatsapp" && `WhatsApp · ${nicePhone(phone)}`}
                  </span>
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
              <button onClick={() => { setStep("method"); setSubmitError(null); }}
                className="flex-1 h-13 rounded-2xl font-bold text-sm py-3.5 active:opacity-70 transition-opacity"
                style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--primary)/0.2)", color: "hsl(var(--muted-foreground))" }}>
                Edit
              </button>
              <button onClick={handleSubmit} disabled={submitting}
                className="flex-[2] h-13 rounded-2xl text-white font-bold text-sm active:scale-[0.98] transition-all py-3.5 disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #10b981, #059669)", boxShadow: "0 0 24px rgba(16,185,129,0.35)" }}>
                {submitting ? "Submitting…" : "Confirm Withdrawal"}
              </button>
            </div>
          </>
        )}

        {/* ════ STEP 4: Done ═══════════════════════════════════════════ */}
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
                  {
                    icon: <SendHorizonal className="w-4 h-4 text-emerald-400" />,
                    bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.25)",
                    text: method === "upi"
                      ? `₹${parsedAmount % 1 === 0 ? parsedAmount : parsedAmount.toFixed(2)} will be sent to ${upiId}`
                      : gpDeliv === "email"
                        ? `Google Play code (₹${parsedAmount % 1 === 0 ? parsedAmount : parsedAmount.toFixed(2)}) will be emailed to ${gpEmail.trim()}`
                        : `Google Play code (₹${parsedAmount % 1 === 0 ? parsedAmount : parsedAmount.toFixed(2)}) will be sent via WhatsApp`,
                  },
                  { icon: <Clock className="w-4 h-4 text-yellow-400" />,  bg: "rgba(234,179,8,0.12)",   border: "rgba(234,179,8,0.25)",  text: "Estimated processing time: 30 min – 12 hours" },
                  { icon: <Bell  className="w-4 h-4 text-blue-400" />,   bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.25)", text: "You'll be notified once it's done" },
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

/* ── Google Play coloured icon ─────────────────────────────────────────────── */
function GooglePlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
      <path d="M3.18 1.4a1.2 1.2 0 0 0-.52 1.01v19.18c0 .43.19.82.52 1.01l.07.06 10.75-10.75v-.26L3.25 1.34l-.07.06z" fill="#4285F4" />
      <path d="M17.58 15.6l-3.58-3.58v-.26l3.58-3.58.08.05 4.24 2.41c1.21.69 1.21 1.81 0 2.5l-4.24 2.41-.08.05z" fill="#FBBC04" />
      <path d="M17.66 15.55 14 11.9 3.18 22.6c.4.42 1.05.47 1.78.05l12.7-7.1z" fill="#34A853" />
      <path d="M17.66 8.45 4.96 1.35C4.23.93 3.58.98 3.18 1.4L14 12.1l3.66-3.65z" fill="#EA4335" />
    </svg>
  );
}
