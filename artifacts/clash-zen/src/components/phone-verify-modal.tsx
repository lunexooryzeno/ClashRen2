import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, X, Shield, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptics";
import { sound } from "@/lib/sounds";
import { sendOtpViaBrowser, verifyOtpViaBrowser } from "@/lib/antcloud";
import { collectFingerprint } from "@/lib/fingerprint";

type ModalStep = "phone" | "otp";

function OtpBoxInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="relative flex gap-2 cursor-text" onClick={() => inputRef.current?.focus()}>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        autoFocus
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-default z-10"
      />
      {Array.from({ length: 6 }).map((_, i) => {
        const isFilled = !!value[i];
        const isActive = value.length === i;
        return (
          <div
            key={i}
            className={[
              "w-10 h-12 rounded-xl border text-xl font-bold text-white flex items-center justify-center select-none",
              "transition-[border-color,box-shadow,background] duration-150",
              isFilled
                ? "border-primary/70 bg-primary/15 shadow-[0_0_12px_rgba(139,92,246,0.3)]"
                : isActive
                ? "border-primary/60 bg-black/60"
                : "border-white/15 bg-white/[0.03]",
            ].join(" ")}
          >
            {isFilled && <span>{value[i]}</span>}
            {isActive && !isFilled && (
              <div className="w-0.5 h-5 bg-primary/70 rounded-full animate-pulse" />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface Props {
  isOpen: boolean;
  onComplete: () => void;
  onClose: () => void;
}

export default function PhoneVerifyModal({ isOpen, onComplete, onClose }: Props) {
  const { invalidateUser } = useAuth();

  const [step, setStep] = useState<ModalStep>("phone");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [otpValue, setOtpValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [sendError, setSendError] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [timer, setTimer] = useState(0);

  const browserTokenRef = useRef("");
  const phoneRef = useRef("");
  const isVerifyingRef = useRef(false);

  const startTimer = () => {
    setTimer(30);
    const interval = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) { clearInterval(interval); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  const handleClose = () => {
    setStep("phone");
    setPhone("");
    setOtpValue("");
    setSendError("");
    setVerifyError("");
    setPhoneError("");
    onClose();
  };

  const doSendOtp = async (digits: string): Promise<boolean> => {
    setIsSending(true);
    setSendError("");
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setSendError(err.error ?? "Failed to send OTP. Please try again.");
        setIsSending(false);
        return false;
      }
      const { browserToken } = await res.json().catch(() => ({})) as { browserToken?: string };
      browserTokenRef.current = browserToken ?? "";

      const antResult = await sendOtpViaBrowser(digits);
      setIsSending(false);
      if (!antResult.success) {
        setSendError(antResult.message ?? "Failed to send OTP.");
        return false;
      }
      return true;
    } catch {
      setIsSending(false);
      setSendError("Network error. Please try again.");
      return false;
    }
  };

  const handlePhoneSubmit = async () => {
    const digits = phone.replace(/\D/g, "");
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setPhoneError("Enter a valid 10-digit Indian mobile number (starts with 6–9).");
      return;
    }
    haptic.mediumTap();
    phoneRef.current = digits;
    const ok = await doSendOtp(digits);
    if (ok) {
      setStep("otp");
      setOtpValue("");
      startTimer();
    }
  };

  const handleVerifyOtp = useCallback(async (code: string) => {
    if (isVerifyingRef.current || code.length !== 6) return;
    isVerifyingRef.current = true;
    setIsVerifying(true);
    setVerifyError("");

    const antResult = await verifyOtpViaBrowser(phoneRef.current, code);
    if (!antResult.success) {
      isVerifyingRef.current = false;
      setIsVerifying(false);
      haptic.error(); sound.error();
      setVerifyError(antResult.message ?? "Invalid OTP. Please try again.");
      return;
    }

    const fp = await collectFingerprint().catch(() => null);
    const res = await fetch("/api/users/complete-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: phoneRef.current,
        browserToken: browserTokenRef.current,
        deviceId: fp?.deviceId ?? undefined,
        fingerprint: fp?.fingerprint ?? undefined,
      }),
      credentials: "include",
    });

    isVerifyingRef.current = false;
    setIsVerifying(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      haptic.error(); sound.error();
      setVerifyError(err.error ?? "Verification failed. Please try again.");
      return;
    }

    const data = await res.json().catch(() => ({})) as { token?: string };
    if (data.token) {
      localStorage.setItem("clash_ren_token", data.token);
    }

    haptic.reward(); sound.reward();
    invalidateUser();

    setStep("phone");
    setPhone("");
    setOtpValue("");
    onComplete();
  }, [invalidateUser, onComplete]);

  const handleResend = async () => {
    haptic.mediumTap();
    const ok = await doSendOtp(phoneRef.current);
    if (ok) startTimer();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4 sm:pb-0"
        onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      >
        <motion.div
          key="modal"
          initial={{ opacity: 0, y: 60, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.97 }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          className="relative w-full max-w-sm rounded-3xl overflow-hidden"
          style={{ background: "rgba(10,5,25,0.97)", border: "1px solid rgba(139,92,246,0.25)", boxShadow: "0 0 60px rgba(139,92,246,0.2), 0 24px 60px rgba(0,0,0,0.7)" }}
        >
          <div className="pointer-events-none absolute inset-0 rounded-3xl" style={{ background: "radial-gradient(ellipse at top, rgba(139,92,246,0.12) 0%, transparent 65%)" }} />

          <div className="relative p-6">
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.2)]">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-heading text-base font-bold text-white leading-tight">Complete Your Profile</h2>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Required to join matches & use wallet</p>
                </div>
              </div>
              <button onClick={handleClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-600 hover:text-white hover:bg-white/8 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <AnimatePresence mode="wait">
              {step === "phone" ? (
                <motion.div
                  key="phone"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col gap-4"
                >
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    Enter a valid 10-digit phone number to unlock wallets and matches.
                  </p>

                  <div className="flex gap-2">
                    <div className="flex items-center gap-1.5 px-3 rounded-xl border border-white/12 bg-white/[0.04] text-sm text-zinc-400 shrink-0">
                      <Phone className="w-3.5 h-3.5" />
                      <span>+91</span>
                    </div>
                    <Input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                        setPhoneError("");
                      }}
                      placeholder="Enter 10-digit number"
                      className="flex-1 h-11 rounded-xl bg-white/[0.04] border-white/12 text-white placeholder:text-zinc-600 focus-visible:ring-primary/40"
                      onKeyDown={(e) => e.key === "Enter" && handlePhoneSubmit()}
                    />
                  </div>

                  {(phoneError || sendError) && (
                    <p className="text-xs text-red-400">{phoneError || sendError}</p>
                  )}

                  <Button
                    onClick={handlePhoneSubmit}
                    disabled={isSending || phone.replace(/\D/g, "").length !== 10}
                    className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold tracking-wide shadow-[0_4px_20px_rgba(139,92,246,0.4)] transition-all active:scale-[0.98]"
                  >
                    {isSending ? "Sending OTP…" : "Send OTP"}
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="otp"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col gap-4"
                >
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    Enter the 6-digit code sent to{" "}
                    <span className="text-white font-semibold">+91 {phoneRef.current.slice(0, 5)} {phoneRef.current.slice(5)}</span>
                  </p>

                  <OtpBoxInput
                    value={otpValue}
                    onChange={(v) => {
                      setOtpValue(v);
                      setVerifyError("");
                      if (v.length === 6) handleVerifyOtp(v);
                    }}
                  />

                  {verifyError && <p className="text-xs text-red-400">{verifyError}</p>}

                  <Button
                    onClick={() => handleVerifyOtp(otpValue)}
                    disabled={isVerifying || otpValue.length !== 6}
                    className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold tracking-wide shadow-[0_4px_20px_rgba(139,92,246,0.4)] transition-all active:scale-[0.98]"
                  >
                    {isVerifying ? "Verifying…" : "Verify & Unlock"}
                  </Button>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                      onClick={() => { haptic.softTap(); setStep("phone"); setOtpValue(""); setVerifyError(""); }}
                    >
                      <ArrowLeft className="w-3 h-3" /> Change number
                    </button>
                    <button
                      onClick={handleResend}
                      disabled={timer > 0 || isSending}
                      className="text-xs font-semibold disabled:text-zinc-700 text-primary hover:text-primary/80 transition-colors disabled:cursor-not-allowed"
                    >
                      {timer > 0 ? `Resend in ${timer}s` : isSending ? "Sending…" : "Resend OTP"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
