import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Gem, Copy, Check, Shield, Zap, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptics";

const DEFAULT_UPI_ID = "BHARATPE2V0D0M2C0A10930@unitype";
const DEFAULT_UPI_NAME = "BharatPe Merchant";
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface PaymentSettings {
  upiId: string;
  upiName: string;
  ratePerDiamond: number;
  minTopup: number;
  isEnabled: boolean;
}

type PollStatus = "pending" | "verified" | "rejected" | "timeout";

export default function TopUpPayPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { invalidateUser } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const rupees   = parseInt(params.get("rupees")   ?? "0");
  const diamonds = parseInt(params.get("diamonds") ?? "0");

  const [step, setStep]         = useState<"qr" | "utr" | "waiting">("qr");
  const [utr, setUtr]           = useState("");
  const [copied, setCopied]     = useState(false);
  const [mounted, setMounted]   = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pollStatus, setPollStatus]     = useState<PollStatus>("pending");
  const [pollElapsed, setPollElapsed]   = useState(0);
  const [rejectedReason, setRejectedReason] = useState<string | null>(null);
  const [settings, setSettings] = useState<PaymentSettings>({
    upiId: DEFAULT_UPI_ID,
    upiName: DEFAULT_UPI_NAME,
    ratePerDiamond: 0.5,
    minTopup: 20,
    isEnabled: true,
  });

  const topupIdRef    = useRef<number | null>(null);
  const pollTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const hardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef  = useRef<number>(0);
  const upiId  = settings.upiId;
  const upiName = settings.upiName;
  const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&cu=INR&tn=${encodeURIComponent("Pay To BharatPe Merchant")}&am=${rupees}`;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const t = setTimeout(() => setMounted(true), 40);
    fetch("/api/payment-settings").then(r => r.json()).then((s: PaymentSettings) => setSettings(s)).catch(() => {});
    return () => {
      clearTimeout(t);
      stopPolling();
    };
  }, []);

  function stopPolling() {
    if (pollTimerRef.current)   { clearInterval(pollTimerRef.current);   pollTimerRef.current = null; }
    if (elapsedRef.current)     { clearInterval(elapsedRef.current);      elapsedRef.current = null; }
    if (hardTimeoutRef.current) { clearTimeout(hardTimeoutRef.current);   hardTimeoutRef.current = null; }
  }

  function startPolling(topupId: number) {
    startTimeRef.current = Date.now();
    topupIdRef.current = topupId;

    // Elapsed counter (display only)
    elapsedRef.current = setInterval(() => {
      setPollElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    // Hard timeout — fires at exactly POLL_TIMEOUT_MS regardless of poll interval
    hardTimeoutRef.current = setTimeout(() => {
      stopPolling();
      setPollStatus("timeout");
    }, POLL_TIMEOUT_MS);

    // Shared poll function — checks status and stops polling on terminal state
    const doPoll = async () => {
      try {
        const res = await fetch(`/api/topup/status/${topupId}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json() as { status: string; diamonds: number; rejectedReason?: string };

        if (data.status === "verified") {
          stopPolling();
          setPollStatus("verified");
          haptic.successTap();
          invalidateUser();
          toast({ title: "Payment confirmed!", description: `${data.diamonds} diamonds have been added to your wallet.` });
          setTimeout(() => setLocation("/wallet"), 1800);
        } else if (data.status === "rejected") {
          stopPolling();
          setPollStatus("rejected");
          haptic.errorTap();
          setRejectedReason(data.rejectedReason ?? null);
          toast({ title: "Payment rejected", description: data.rejectedReason ?? "Your payment could not be verified.", variant: "destructive" });
        }
      } catch {
        // silently ignore network blips
      }
    };

    // Fire an immediate poll (no 3-second wait on first check)
    doPoll();

    // Poll loop — stops early if verified/rejected received before timeout
    pollTimerRef.current = setInterval(doPoll, POLL_INTERVAL_MS);
  }

  async function submitUtr() {
    if (utr.trim().length < 6 || isSubmitting) return;
    setIsSubmitting(true);
    const cleanUtr = utr.trim();

    // Navigate to waiting immediately — feels instant
    haptic.mediumTap();
    setStep("waiting");

    try {
      const res = await fetch("/api/topup/submit", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ utr: cleanUtr, rupees, diamonds }),
      });
      const data = await res.json() as { topupId?: number; verifyUrl?: string; error?: string };

      if (!res.ok || !data.topupId) {
        // Bounce back to UTR step on failure
        setStep("utr");
        toast({ title: "Submission failed", description: data?.error ?? "Could not submit your payment. Please try again.", variant: "destructive" });
        return;
      }

      // Fire the MacroDroid verification request from the browser (fire-and-forget)
      // Uses XMLHttpRequest to bypass Chrome extensions that hijack window.fetch
      if (data.verifyUrl) {
        try {
          const xhr = new XMLHttpRequest();
          xhr.open("GET", data.verifyUrl, true);
          xhr.send();
        } catch {
          // ignore any errors — this is fire-and-forget
        }
      }

      startPolling(data.topupId);
    } catch {
      setStep("utr");
      toast({ title: "Network error", description: "Could not reach the server. Please try again.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const stepIndex = step === "qr" ? 0 : step === "utr" ? 1 : 2;

  // ── Waiting screen ─────────────────────────────────────────────────────────
  if (step === "waiting") {
    const mins = Math.floor(pollElapsed / 60);
    const secs = pollElapsed % 60;
    const elapsedStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center relative overflow-hidden profile-page-bg px-6">
        <div className="absolute top-0 right-0 w-[260px] h-[260px] pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)" }} />
        <div className="h-[2px] w-full btn-primary-gradient opacity-80 absolute top-0 left-0" />

        <button
          onClick={() => { stopPolling(); setLocation("/top-up"); }}
          className="absolute top-5 left-4 w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>

        <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">

          {pollStatus === "pending" && (
            <>
              {/* Animated icon */}
              <div className="relative">
                <div className="w-20 h-20 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(234,88,12,0.1)", border: "1px solid rgba(234,88,12,0.25)" }}>
                  <Loader2 className="w-9 h-9 text-orange-400 animate-spin" />
                </div>
                {/* Pulse rings */}
                <div className="absolute inset-0 rounded-full animate-ping opacity-20"
                  style={{ background: "rgba(234,88,12,0.3)" }} />
              </div>

              <div>
                <h2 className="text-xl font-bold text-white mb-1.5">Verifying Payment</h2>
                <p className="text-[13px] text-zinc-400 leading-relaxed max-w-[260px]">
                  We're confirming your transaction. This usually takes a few seconds.
                </p>
              </div>

              {/* UTR summary */}
              <div className="w-full rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="text-left">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-0.5">UTR / Reference</p>
                  <p className="text-[14px] font-mono font-bold text-white tracking-widest">{utr}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-0.5">Amount</p>
                  <p className="text-[14px] font-bold text-white">₹{rupees}</p>
                </div>
              </div>

            </>
          )}

          {pollStatus === "verified" && (
            <>
              <div className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)" }}>
                <CheckCircle2 className="w-9 h-9 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white mb-1.5">Payment Confirmed!</h2>
                <p className="text-[13px] text-zinc-400">Your diamonds have been added. Redirecting to wallet…</p>
              </div>
            </>
          )}

          {(pollStatus === "rejected" || pollStatus === "timeout") && (
            <>
              <div className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
                <XCircle className="w-9 h-9 text-red-400" />
              </div>
              <div className="w-full">
                <h2 className="text-xl font-bold text-white mb-1.5">
                  {pollStatus === "timeout" ? "Verification Timed Out" : "Payment Rejected"}
                </h2>
                <p className="text-[13px] text-zinc-400 leading-relaxed">
                  {pollStatus === "timeout"
                    ? "We couldn't confirm your payment in time. If you paid, contact support with your UTR number."
                    : "Your transaction could not be verified. Please check your UTR and contact support if needed."}
                </p>
                {rejectedReason && (
                  <div className="mt-3 px-4 py-3 rounded-2xl text-left w-full"
                    style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    <p className="text-[10px] text-red-400/70 uppercase tracking-wider font-bold mb-1">Reason</p>
                    <p className="text-[13px] text-red-300 leading-relaxed">{rejectedReason}</p>
                  </div>
                )}
              </div>
              <button
                onClick={() => { setPollStatus("pending"); setPollElapsed(0); setStep("utr"); }}
                className="w-full h-12 rounded-2xl text-white font-bold text-sm btn-primary-gradient active:scale-[0.98] transition-transform">
                Try Again
              </button>
              <button
                onClick={() => setLocation("/support")}
                className="w-full h-12 rounded-2xl font-bold text-sm active:scale-[0.98] transition-transform"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>
                Contact Support
              </button>
              <button
                onClick={() => setLocation("/top-up")}
                className="text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors">
                Back to top-up
              </button>
            </>
          )}

        </div>
      </div>
    );
  }

  // ── Normal steps (QR + UTR) ────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden profile-page-bg">
      {/* Ambient glows */}
      <div className="absolute top-0 right-0 w-[260px] h-[260px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)" }} />
      <div className="absolute bottom-1/3 left-0 w-[180px] h-[180px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)" }} />

      {/* Top accent */}
      <div className="h-[2px] w-full btn-primary-gradient opacity-80" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-2 relative z-10"
        style={{ animation: mounted ? "pay-slide-up 0.35s ease both" : "none" }}>
        <button
          onClick={() => setLocation("/top-up")}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <span className="text-[11px] text-muted-foreground uppercase tracking-[0.2em] font-bold">
          Complete Payment
        </span>
        <div className="w-9" />
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 pt-1 pb-3 relative z-10"
          style={{ animation: mounted ? "pay-fade-in 0.4s 0.1s ease both" : "none", opacity: mounted ? 1 : 0 }}>
          {["Scan & Pay", "Enter UTR"].map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black transition-all duration-300"
                  style={{
                    background: i <= stepIndex
                      ? "linear-gradient(135deg, rgba(234,88,12,0.9), rgba(239,68,68,0.7))"
                      : "rgba(255,255,255,0.07)",
                    border: i <= stepIndex ? "none" : "1px solid rgba(255,255,255,0.1)",
                    color: i <= stepIndex ? "white" : "rgba(255,255,255,0.3)",
                  }}>
                  {i + 1}
                </div>
                <span className="text-[10px] font-semibold transition-colors duration-300"
                  style={{ color: i === stepIndex ? "white" : "rgba(255,255,255,0.3)" }}>
                  {label}
                </span>
              </div>
              {i < 1 && (
                <div className="w-8 h-px" style={{ background: stepIndex > i ? "rgba(234,88,12,0.6)" : "rgba(255,255,255,0.1)" }} />
              )}
            </div>
          ))}
        </div>

      {/* ── Step: QR ── */}
      {step === "qr" && (
        <div className="px-4 flex flex-col gap-3 relative z-10 pb-6">

          {/* Order summary */}
          <div className="rounded-2xl overflow-hidden"
            style={{
              background: "hsl(var(--card))",
              border: "1px solid rgba(139,92,246,0.2)",
              animation: mounted ? "pay-slide-up 0.4s 0.08s ease both" : "none",
            }}>
            <div className="px-4 py-2.5 flex items-center gap-2"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(139,92,246,0.06)" }}>
              <Gem className="w-3.5 h-3.5 text-violet-400" strokeWidth={2} />
              <span className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] font-bold">Order Summary</span>
            </div>
            <div className="px-4 py-3 flex justify-between items-center">
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5">You Pay</p>
                <p className="text-2xl font-extrabold font-heading text-white">₹{rupees}</p>
              </div>
              <div className="flex flex-col items-center px-3">
                <div className="w-px h-8" style={{ background: "rgba(255,255,255,0.08)" }} />
              </div>
              <div className="text-right">
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5">You Receive</p>
                <p className="text-2xl font-extrabold font-heading text-blue-300 flex items-center gap-1.5 justify-end">
                  <Gem className="w-5 h-5 text-blue-400" strokeWidth={1.5} />
                  {diamonds.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* QR card */}
          <div className="rounded-3xl relative overflow-hidden"
            style={{
              background: "linear-gradient(160deg, hsl(var(--card)) 0%, rgba(139,92,246,0.07) 100%)",
              border: "1px solid rgba(139,92,246,0.25)",
              boxShadow: "0 8px 40px rgba(139,92,246,0.12)",
              animation: mounted ? "pay-scale-in 0.45s 0.14s ease both" : "none",
            }}>
            {/* Shimmer sweep */}
            <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
              <div className="absolute top-0 bottom-0 w-1/3"
                style={{
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent)",
                  animation: "pay-shimmer 3s 1s infinite ease-in-out",
                }} />
            </div>

            <div className="flex flex-col items-center px-5 pt-5 pb-5 relative z-10">
              <p className="text-[10px] text-violet-400/80 uppercase tracking-[0.18em] font-bold mb-4">Scan & Pay via UPI</p>

              {/* QR code */}
              <div className="bg-white p-3 rounded-2xl mb-4"
                style={{ boxShadow: "0 4px 24px rgba(139,92,246,0.2)" }}>
                <QRCodeSVG value={upiUrl} size={180} />
              </div>

              {/* UPI ID row */}
              <div className="w-full rounded-2xl px-3 py-2.5 flex items-center justify-between gap-2"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(139,92,246,0.18)" }}>
                <div className="flex flex-col min-w-0">
                  <span className="text-[9px] text-zinc-500 uppercase tracking-widest mb-0.5">UPI ID</span>
                  <span className="text-[13px] font-mono font-semibold text-foreground truncate">{upiId}</span>
                </div>
                <button
                  onClick={() => { haptic.mediumTap(); navigator.clipboard.writeText(upiId); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                  style={{
                    background: copied ? "rgba(16,185,129,0.15)" : "rgba(139,92,246,0.15)",
                    border: copied ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(139,92,246,0.35)",
                    color: copied ? "rgb(52,211,153)" : "rgb(167,139,250)",
                  }}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

            </div>
          </div>

          {/* CTA */}
          <button
            onClick={() => { haptic.mediumTap(); setStep("utr"); }}
            className="w-full h-14 rounded-2xl text-white font-bold text-base btn-primary-gradient flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            style={{
              animation: mounted ? "pay-slide-up 0.4s 0.28s ease both" : "none",
              boxShadow: "0 0 32px rgba(234,88,12,0.4)",
            }}>
            I've Made Payment
          </button>
        </div>
      )}

      {/* ── Step: UTR ── */}
      {step === "utr" && (
        <div className="px-4 flex flex-col gap-3 relative z-10 pb-6"
          style={{ animation: "pay-step-in 0.35s ease both" }}>

          {/* Order recap */}
          <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
            style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.07)" }}>
            <span className="text-sm text-zinc-400">Amount paid</span>
            <span className="text-sm font-bold text-white">₹{rupees}</span>
          </div>

          {/* UTR input card */}
          <div className="rounded-3xl overflow-hidden"
            style={{
              background: "linear-gradient(160deg, hsl(var(--card)) 0%, rgba(59,130,246,0.06) 100%)",
              border: "1px solid rgba(59,130,246,0.2)",
              boxShadow: "0 8px 32px rgba(59,130,246,0.08)",
            }}>
            <div className="px-4 py-2.5 flex items-center gap-2"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(59,130,246,0.06)" }}>
              <Shield className="w-3.5 h-3.5 text-blue-400" strokeWidth={2} />
              <span className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] font-bold">Enter UTR / Reference No.</span>
            </div>
            <div className="px-4 py-4">
              <p className="text-[11px] text-zinc-500 mb-3">Find this in your UPI app's payment receipt</p>
              <div className="rounded-2xl px-4 py-3"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={utr}
                  onChange={e => setUtr(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter payment reference number"
                  maxLength={12}
                  autoFocus
                  className="w-full bg-transparent text-xl font-bold text-foreground placeholder:text-zinc-700 outline-none tracking-widest"
                />
              </div>
              <div className="mt-3 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Where to find your UTR</p>
                  <ul className="flex flex-col gap-1">
                    {[
                      "Open your UPI app (GPay, PhonePe, Paytm…)",
                      "Go to transaction history or recent payments",
                      "Tap the payment made to this merchant",
                      "Look for UTR / Reference No. — 12 digits",
                    ].map((step, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-orange-400 mt-px"
                          style={{ background: "rgba(234,88,12,0.12)", border: "1px solid rgba(234,88,12,0.2)" }}>
                          {i + 1}
                        </span>
                        <span className="text-[10px] text-zinc-500 leading-snug">{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <a
                  href="https://www.google.com/search?q=how+to+find+utr+number+in+upi+transaction"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-bold text-blue-400 hover:text-blue-300 transition-colors"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(59,130,246,0.05)" }}>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  Search how to find UTR number
                  <svg className="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={submitUtr}
            disabled={utr.trim().length !== 12 || isSubmitting}
            className="w-full h-14 rounded-2xl text-white font-bold text-base btn-primary-gradient flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40 disabled:pointer-events-none"
            style={{ boxShadow: utr.trim().length === 12 ? "0 0 32px rgba(234,88,12,0.4)" : "none" }}>
            {isSubmitting
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Submitting…</>
              : <>Find Transaction</>}
          </button>

        </div>
      )}

    </div>
  );
}
