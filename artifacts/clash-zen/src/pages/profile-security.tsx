import { useState, useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { ArrowLeft, Lock, Shield, Check, ChevronRight, AlertCircle, Clock, Smartphone, X, KeyRound, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch, apiPost } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { sound } from "@/lib/sounds";

type Screen = "main" | "set-passcode" | "change-passcode";

interface TwoFaStatus {
  enabled: boolean;
  pending: boolean;
  pendingAt: string | null;
  autoApproveAt: string | null;
  withdrawalBlocked: boolean;
  withdrawalBlockExpiresAt: string | null;
}

export default function ProfileSecurityPage() {
  const [screen, setScreen] = useState<Screen>("main");
  const [status, setStatus] = useState<TwoFaStatus>({
    enabled: false, pending: false, pendingAt: null, autoApproveAt: null,
    withdrawalBlocked: false, withdrawalBlockExpiresAt: null,
  });
  const [statusLoading, setStatusLoading] = useState(true);

  function reload() {
    setStatusLoading(true);
    apiFetch<TwoFaStatus>("/users/me/2fa")
      .then(d => { setStatus(d); setStatusLoading(false); })
      .catch(() => setStatusLoading(false));
  }

  useEffect(() => { reload(); }, []);

  async function handleEnable(passcode: string) {
    await apiPost("/users/2fa/enable", { passcode });
    const now = new Date();
    const autoApproveAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    setStatus({ enabled: false, pending: true, pendingAt: now.toISOString(), autoApproveAt, withdrawalBlocked: true, withdrawalBlockExpiresAt: expiresAt });
  }

  async function handleReset(passcode: string) {
    await apiPost("/users/2fa/reset", { passcode });
    const now = new Date();
    const autoApproveAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    setStatus({ enabled: false, pending: true, pendingAt: now.toISOString(), autoApproveAt, withdrawalBlocked: true, withdrawalBlockExpiresAt: expiresAt });
  }

  async function handleDisable() {
    await apiPost("/users/2fa/disable", {});
    setStatus({ enabled: false, pending: false, pendingAt: null, autoApproveAt: null, withdrawalBlocked: false, withdrawalBlockExpiresAt: null });
  }

  return (
    <div className="min-h-[100dvh] flex flex-col profile-page-bg">
      {screen === "main"           && <MainScreen status={status} statusLoading={statusLoading} onDisable={handleDisable} setScreen={setScreen} />}
      {screen === "set-passcode"   && <SetPasscodeScreen setScreen={setScreen} onSave={handleEnable} />}
      {screen === "change-passcode"&& <ChangePasscodeScreen setScreen={setScreen} onSave={handleReset} />}
    </div>
  );
}

// ── Countdown helper ──────────────────────────────────────────────────────────
function useCountdown(targetIso: string | null) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!targetIso) return;
    function tick() {
      const diff = new Date(targetIso!).getTime() - Date.now();
      setRemaining(Math.max(0, diff));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  return { remaining, formatted: `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s` };
}

// ── PIN Input component ───────────────────────────────────────────────────────
function PinInput({ value, onChange, autoFocus = false }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const digits = value.split("").concat(Array(6).fill("")).slice(0, 6);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const filtered = e.target.value.replace(/\D/g, "").slice(0, 6);
    onChange(filtered);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
  }

  return (
    <div
      className="relative select-none"
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        autoFocus={autoFocus}
        maxLength={6}
        autoComplete="off"
        className="absolute inset-0 opacity-0 cursor-text w-full h-full z-10"
        style={{ caretColor: "transparent" }}
      />
      <div className="flex gap-2.5 justify-center">
        {digits.map((d, i) => {
          const isCursor = i === value.length && value.length < 6;
          return (
            <div
              key={i}
              className={cn(
                "w-[46px] h-[56px] rounded-xl flex items-center justify-center text-2xl font-bold font-mono border-2 transition-all duration-150",
                d
                  ? "bg-primary/12 border-primary/50 text-white"
                  : isCursor
                  ? "bg-white/5 border-primary/60"
                  : "bg-white/5 border-white/10"
              )}
            >
              {d ? (
                <span>•</span>
              ) : isCursor ? (
                <div className="w-0.5 h-6 bg-primary/80 animate-pulse rounded-full" />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
function MainScreen({ status, statusLoading, onDisable, setScreen }: {
  status: TwoFaStatus; statusLoading: boolean;
  onDisable: () => Promise<void>;
  setScreen: (s: Screen) => void;
}) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const { formatted: countdown } = useCountdown(status.autoApproveAt);
  const { formatted: blockCountdown } = useCountdown(status.withdrawalBlockExpiresAt);

  async function confirmDisable() {
    setDisabling(true);
    try { await onDisable(); } finally { setDisabling(false); setShowCancelConfirm(false); }
  }

  return (
    <>
      <div className="flex items-center gap-3 px-4 pt-6 pb-4">
        <Link href="/profile">
          <button className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
        </Link>
        <div>
          <h1 className="font-heading text-lg font-bold text-white tracking-tight">Privacy & Security</h1>
          <p className="text-xs text-zinc-500">Manage your account security</p>
        </div>
      </div>

      {statusLoading ? (
        <div className="px-4 space-y-3 pt-2 pb-10">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-2xl p-4 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <Skeleton className="w-9 h-9 rounded-xl bg-white/8 shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-32 bg-white/8 rounded" />
                <Skeleton className="h-2.5 w-48 bg-white/5 rounded" />
              </div>
              <Skeleton className="w-12 h-6 rounded-full bg-white/6 shrink-0" />
            </div>
          ))}
          <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <Skeleton className="w-9 h-9 rounded-xl bg-white/8 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-40 bg-white/8 rounded" />
              <Skeleton className="h-2.5 w-36 bg-white/5 rounded" />
            </div>
            <Skeleton className="w-16 h-8 rounded-xl bg-white/6 shrink-0" />
          </div>
        </div>
      ) : (
        <div className="px-4 space-y-4 pb-10">

          {/* Withdrawal block warning */}
          {status.withdrawalBlocked && (
            <div className="rounded-2xl p-4 flex items-start gap-3"
              style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.22)" }}>
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-red-400">Withdrawals Temporarily Blocked</p>
                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                  Your passcode was recently changed. For security, withdrawals are blocked for 24 hours. Contact support for emergency access.
                </p>
                {status.withdrawalBlockExpiresAt && (
                  <p className="text-xs text-red-400/80 font-mono font-bold mt-1.5">{blockCountdown}</p>
                )}
              </div>
            </div>
          )}

          {/* 2FA card */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Two-Factor Authentication</p>
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                status.enabled  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" :
                status.pending  ? "bg-amber-500/15 text-amber-400 border-amber-500/25" :
                                  "bg-white/5 text-zinc-500 border-white/10"
              )}>
                {status.enabled ? "Enabled" : status.pending ? "Pending" : "Disabled"}
              </span>
            </div>

            {status.enabled ? (
              <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-emerald-500/12 border border-emerald-500/25">
                    <Shield className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">2FA is Active</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Your account has a 6-digit passcode protection.</p>
                  </div>
                </div>
                <button onClick={() => setScreen("change-passcode")}
                  className="w-full h-10 rounded-xl font-bold text-xs text-primary border border-primary/25 bg-primary/8 active:bg-primary/15 transition-colors flex items-center justify-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5" /> Change Passcode
                </button>
                <button onClick={() => setShowCancelConfirm(true)}
                  className="w-full h-10 rounded-xl font-bold text-xs text-red-400 border border-red-500/20 bg-red-500/8 active:bg-red-500/15 transition-colors">
                  Disable 2FA
                </button>
              </div>
            ) : status.pending ? (
              <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/12 border border-amber-500/25">
                    <Clock className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">Awaiting Approval</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">An admin can approve this, or it auto-activates in:</p>
                    <p className="text-sm font-bold text-amber-400 font-mono mt-1">{countdown}</p>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white/3 border border-white/8 text-[11px] text-zinc-500 leading-relaxed">
                  Once approved your account will be secured with your 6-digit passcode. Reset at any time using your registered phone number.
                </div>
                <button onClick={() => setShowCancelConfirm(true)}
                  className="w-full h-10 rounded-xl font-bold text-xs text-red-400 border border-red-500/20 bg-red-500/8 active:bg-red-500/15 transition-colors">
                  Cancel Request
                </button>
              </div>
            ) : (
              <button onClick={() => setScreen("set-passcode")}
                className="w-full p-4 flex items-center gap-3 active:bg-white/5 transition-colors">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
                  <Lock className="w-5 h-5 text-zinc-500" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold text-zinc-300">Enable 2FA</p>
                  <p className="text-xs text-zinc-600">Set a 6-digit passcode as a second login layer</p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600" />
              </button>
            )}
          </div>

          {/* Shield description card */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: status.enabled ? "hsl(var(--primary)/0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${status.enabled ? "hsl(var(--primary)/0.3)" : "rgba(255,255,255,0.08)"}` }}>
                <KeyRound className={cn("w-5 h-5", status.enabled ? "text-primary" : "text-zinc-500")} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">6-Digit Passcode 2FA</p>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                  {status.enabled
                    ? "Your account is secured with a 6-digit passcode. Changing it triggers a 24-hour withdrawal hold for security."
                    : "Add a 6-digit numeric passcode as a second factor."}
                </p>
              </div>
            </div>
          </div>

          {/* Reset via phone */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="px-4 py-3 border-b border-white/5">
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Account Recovery</p>
            </div>
            <div className="px-4 py-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.22)" }}>
                <Smartphone className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-white">Reset via Phone Number</p>
                <p className="text-xs text-zinc-500 mt-0.5">Log in with your registered phone OTP to reset your 2FA passcode at any time.</p>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Cancel / disable confirmation modal */}
      {showCancelConfirm && (
        <>
          <div className="fixed inset-0 bg-black/75 z-[90] backdrop-blur-sm" onClick={() => setShowCancelConfirm(false)} />
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-5">
            <div className="w-full max-w-sm rounded-3xl p-6 relative"
              style={{ background: "hsl(var(--card))", border: "1px solid rgba(239,68,68,0.2)", boxShadow: "0 24px 60px rgba(0,0,0,0.7)" }}>
              <button onClick={() => setShowCancelConfirm(false)}
                className="absolute top-4 right-4 w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-zinc-400">
                <X className="w-4 h-4" />
              </button>
              <div className="flex flex-col items-center text-center mb-5">
                <div className="w-14 h-14 rounded-full bg-red-500/12 border border-red-500/25 flex items-center justify-center mb-3">
                  <Shield className="w-6 h-6 text-red-400" />
                </div>
                <h3 className="font-heading text-lg font-bold text-white mb-2">
                  {status.pending ? "Cancel 2FA Request?" : "Disable 2FA?"}
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {status.pending
                    ? "Your pending 2FA request will be cancelled and your passcode discarded."
                    : "Your 2FA passcode will be removed. Your account will rely on phone OTP only."}
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 h-11 rounded-2xl font-bold text-sm text-zinc-400 border border-white/10 bg-white/4 active:bg-white/8 transition-colors">
                  Keep
                </button>
                <button onClick={confirmDisable} disabled={disabling}
                  className="flex-1 h-11 rounded-2xl font-bold text-sm text-white bg-red-500/75 border border-red-500/40 active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-60">
                  {disabling ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ── Weak passcode check ───────────────────────────────────────────────────────
function weakPasscodeWarning(code: string): string | null {
  if (code.length !== 6) return null;
  if (/^(\d)\1{5}$/.test(code)) return "Too simple — all digits are the same.";
  const digits = code.split("").map(Number);
  const diffs = digits.slice(1).map((d, i) => d - digits[i]);
  if (diffs.every(d => d === 1)) return "Too simple — sequential digits are easy to guess.";
  if (diffs.every(d => d === -1)) return "Too simple — reversed sequence is easy to guess.";
  if (/^(\d{2})\1{2}$/.test(code) || /^(\d{3})\1$/.test(code)) return "Too simple — repeated pattern detected.";
  const COMMON = ["123456","654321","112233","121212","111222","000000","123123","456456","789789","159159","147147","246246"];
  if (COMMON.includes(code)) return "This is a very common passcode — please choose something harder to guess.";
  return null;
}

// ── Shared passcode form ───────────────────────────────────────────────────────
function PasscodeForm({ title, subtitle, notice, ctaLabel, onBack, onSave }: {
  title: string; subtitle: string; notice?: string; ctaLabel: string;
  onBack: () => void;
  onSave: (passcode: string) => Promise<void>;
}) {
  const [passcode, setPasscode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const passWarn = step === "enter" ? weakPasscodeWarning(passcode) : null;

  function handleNext() {
    setError("");
    if (passcode.length !== 6) { setError("Enter all 6 digits."); return; }
    setStep("confirm");
  }

  async function handleSave() {
    setError("");
    if (passcode.length !== 6) { haptic.error(); setError("Enter all 6 digits for your passcode."); return; }
    if (confirm !== passcode) { haptic.error(); sound.error(); setError("Passcodes do not match. Try again."); setConfirm(""); return; }
    setSaving(true);
    try {
      await onSave(passcode);
      haptic.impact(); sound.success();
      setSuccess(true);
    } catch (e: unknown) {
      haptic.error(); sound.error();
      setError((e as { message?: string })?.message ?? "Something went wrong.");
    } finally { setSaving(false); }
  }

  if (success) return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 gap-5">
      <div className="w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
        <Clock className="w-8 h-8 text-amber-400" />
      </div>
      <div className="text-center">
        <p className="font-heading text-xl font-bold text-white mb-1">Request Submitted</p>
        <p className="text-sm text-zinc-500 leading-relaxed">
          Your 2FA passcode change is pending admin approval and will auto-activate in 24 hours. Withdrawals are paused for 24 hours as a security measure.
        </p>
      </div>
      <button onClick={onBack}
        className="w-full max-w-xs h-12 rounded-2xl font-bold text-sm btn-primary-gradient text-white active:scale-95 transition-transform">
        Back to Security
      </button>
    </div>
  );

  return (
    <>
      <div className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button
          onClick={() => step === "confirm" ? (setStep("enter"), setConfirm(""), setError("")) : onBack()}
          className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <div>
          <h1 className="font-heading text-lg font-bold text-white">{title}</h1>
          <p className="text-xs text-zinc-500">{subtitle}</p>
        </div>
      </div>

      <div className="px-4 space-y-5 pb-10">
        {notice && (
          <div className="p-4 rounded-2xl flex items-start gap-3"
            style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.18)" }}>
            <Clock className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-zinc-400 leading-relaxed">{notice}</p>
          </div>
        )}

        {/* Step indicator */}
        <div className="flex items-center gap-2 justify-center">
          <div className={cn("w-2 h-2 rounded-full transition-colors", step === "enter" ? "bg-primary" : "bg-emerald-400")} />
          <div className={cn("h-px w-8 transition-colors", step === "confirm" ? "bg-primary/60" : "bg-white/10")} />
          <div className={cn("w-2 h-2 rounded-full transition-colors", step === "confirm" ? "bg-primary" : "bg-white/15")} />
        </div>

        <div className="text-center">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold mb-4">
            {step === "enter" ? "Enter new 6-digit passcode" : "Confirm your passcode"}
          </p>
          <PinInput
            key={step}
            value={step === "enter" ? passcode : confirm}
            onChange={v => { step === "enter" ? setPasscode(v) : setConfirm(v); setError(""); }}
            autoFocus
          />
        </div>

        {passWarn && !error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">{passWarn}</p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {step === "enter" ? (
          <button onClick={handleNext} disabled={passcode.length !== 6}
            className="w-full h-12 rounded-2xl font-bold text-sm btn-primary-gradient text-white active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-40">
            <ChevronRight className="w-4 h-4" /> Next — Confirm Passcode
          </button>
        ) : (
          <button onClick={handleSave} disabled={saving || confirm.length !== 6}
            className="w-full h-12 rounded-2xl font-bold text-sm btn-primary-gradient text-white active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-40">
            {saving ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <><Check className="w-4 h-4" /> {ctaLabel}</>}
          </button>
        )}
      </div>
    </>
  );
}

// ── Set passcode screen (enable 2FA) ──────────────────────────────────────────
function SetPasscodeScreen({ setScreen, onSave }: { setScreen: (s: Screen) => void; onSave: (passcode: string) => Promise<void> }) {
  return (
    <PasscodeForm
      title="Enable 2FA"
      subtitle="Set a 6-digit passcode as a second login layer"
      ctaLabel="Submit Request"
      onBack={() => setScreen("main")}
      onSave={onSave}
    />
  );
}

// ── Change passcode screen ────────────────────────────────────────────────────
function ChangePasscodeScreen({ setScreen, onSave }: { setScreen: (s: Screen) => void; onSave: (passcode: string) => Promise<void> }) {
  return (
    <PasscodeForm
      title="Change Passcode"
      subtitle="Update your 2FA 6-digit passcode"
      notice="Changing your passcode will pause withdrawals for 24 hours as a security measure. Contact support if you need emergency access."
      ctaLabel="Change Passcode"
      onBack={() => setScreen("main")}
      onSave={onSave}
    />
  );
}
