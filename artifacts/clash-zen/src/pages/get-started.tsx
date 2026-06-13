import { useState, useEffect, useRef, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth, SESSION_SUPERSEDED_KEY } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { ArrowLeft, Ban, Trash2, ChevronRight, ShieldX, Shield } from "lucide-react";
import { collectFingerprint } from "@/lib/fingerprint";
import { haptic } from "@/lib/haptics";
import { sound } from "@/lib/sounds";
import { sendOtpViaBrowser, verifyOtpViaBrowser } from "@/lib/antcloud";

const WHATSAPP_NUMBER = "919999999999";

interface SuspendedData {
  suspended: boolean;
  status: "blocked" | "deleted";
  reason: string | null;
  blockedUntil: string | null;
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }); }
  catch { return ""; }
}

function WAIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function OtpBoxInput({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange: (val: string) => void;
  testId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
    onChange(digits);
  };

  return (
    <div
      className="relative flex gap-2 cursor-text"
      data-testid={testId}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Single invisible input — handles all typing, paste, and autocomplete natively */}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        autoFocus
        onChange={handleChange}
        data-testid={testId ? `${testId}-slot-0` : undefined}
        className="absolute inset-0 w-full h-full opacity-0 cursor-default z-10 select-all"
        style={{ caretColor: "transparent" }}
      />
      {/* 6 visual boxes reflecting single input value */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={[
            "w-10 h-12 rounded-lg border text-xl font-bold text-white flex items-center justify-center select-none transition-all duration-150",
            value[i]
              ? "border-primary/60 bg-primary/10"
              : value.length === i
              ? "border-primary/50 bg-black/50 ring-1 ring-primary/40"
              : "border-white/20 bg-black/50",
          ].join(" ")}
        >
          {value[i] ?? ""}
        </div>
      ))}
    </div>
  );
}

const LOGO_URL = "/icons/logo.png";

const phoneSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid Indian mobile number (starts with 6–9, 10 digits)"),
});

type Step = "phone" | "otp" | "2fa" | "suspended";

export default function GetStartedPage() {
  const { isAuthenticated, isLoading, invalidateUser } = useAuth();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("phone");
  const [suspendedData, setSuspendedData] = useState<SuspendedData | null>(null);
  const [phone, setPhone] = useState("");
  const [displayPhone, setDisplayPhone] = useState("");
  const [timer, setTimer] = useState(0);
  const [otpValue, setOtpValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [otpSendState, setOtpSendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [otpSendError, setOtpSendError] = useState<string>("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaError, setTwoFaError] = useState("");
  const [isVerifying2fa, setIsVerifying2fa] = useState(false);

  // Refs to always hold current values — avoids stale closures in async callbacks
  const phoneRef = useRef(phone);
  // Honeypot — real users never fill this; bots typically auto-fill it
  const honeypotRef = useRef("");
  const otpValueRef = useRef(otpValue);
  const isVerifyingRef = useRef(false);
  const invalidateUserRef = useRef(invalidateUser);
  // Token returned by /api/auth/send-otp — presented to complete-login to prove
  // that rate-limiting was applied before antcloud was called from the browser.
  const browserTokenRef = useRef<string>("");

  useEffect(() => { phoneRef.current = phone; }, [phone]);
  useEffect(() => { otpValueRef.current = otpValue; }, [otpValue]);
  useEffect(() => { invalidateUserRef.current = invalidateUser; }, [invalidateUser]);

  const { toast } = useToast();

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_SUPERSEDED_KEY)) {
      sessionStorage.removeItem(SESSION_SUPERSEDED_KEY);
      toast({
        title: "Logged out",
        description: "You were signed in on another device. Please log in again.",
        variant: "destructive",
      });
    }
  }, []);

  const phoneForm = useForm<z.infer<typeof phoneSchema>>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: "" },
  });

  const formatPhoneDisplay = (digits: string) => {
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const redirect = sessionStorage.getItem("redirectAfterLogin");
      sessionStorage.removeItem("redirectAfterLogin");
      if (
        redirect &&
        redirect.startsWith("/") &&
        redirect !== "/landing" &&
        redirect !== "/get-started"
      ) {
        setLocation(redirect);
      } else {
        setLocation("/");
      }
    }
  }, [isAuthenticated, isLoading, setLocation]);

  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => setTimer((t) => t - 1), 1000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [timer]);

  // Core submit function — reads phone/code from parameters or refs, never from stale closures.
  // Flow: verify OTP with antcloud from browser → on success, call complete-login with browserToken.
  const submitWithCode = useCallback(async (code: string) => {
    if (isVerifyingRef.current) return;
    isVerifyingRef.current = true;
    setIsVerifying(true);

    // Step 1: verify OTP with antcloud from the browser (no credentials — avoids CORS)
    const antcloudResult = await verifyOtpViaBrowser(phoneRef.current, code);
    if (!antcloudResult.success) {
      isVerifyingRef.current = false;
      setIsVerifying(false);
      haptic.error(); sound.error();
      toast({
        title: "Invalid OTP",
        description: antcloudResult.message || "Incorrect code. Please try again.",
        variant: "destructive",
      });
      return;
    }

    // Step 2: complete login on our server using the browserToken from send-otp
    const fp = await collectFingerprint().catch(() => null);
    const res = await fetch("/api/auth/complete-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: phoneRef.current,
        browserToken: browserTokenRef.current,
        deviceId: fp?.deviceId ?? undefined,
        fingerprint: fp?.fingerprint ?? undefined,
        _hp: honeypotRef.current || undefined,
      }),
      credentials: "include",
    });

    isVerifyingRef.current = false;
    setIsVerifying(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 403 && (err as { suspended?: boolean }).suspended) {
        setSuspendedData(err as SuspendedData);
        setStep("suspended");
        return;
      }
      haptic.error(); sound.error();
      toast({
        title: "Login Failed",
        description: (err as { error?: string })?.error || "Something went wrong. Please try again.",
        variant: "destructive",
      });
      return;
    }

    const data = await res.json().catch(() => ({}));
    if ((data as { requires2fa?: boolean }).requires2fa) {
      haptic.softTap();
      setTwoFaCode("");
      setTwoFaError("");
      setStep("2fa");
      return;
    }

    if ((data as { token?: string }).token) {
      localStorage.setItem("clash_ren_token", (data as { token: string }).token);
    }

    haptic.impact(); sound.success();
    invalidateUserRef.current();
    toast({ title: "Verified!", description: "Welcome to Clash Ren." });
  // toast is stable; refs are mutable and don't need to be deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit2FA = useCallback(async (passcode: string) => {
    if (!passcode || passcode.length !== 6) {
      setTwoFaError("Enter your 6-digit passcode.");
      return;
    }
    haptic.mediumTap();
    setIsVerifying2fa(true);
    setTwoFaError("");

    const fp = await collectFingerprint().catch(() => null);
    const res = await fetch("/api/auth/complete-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: phoneRef.current,
        passcode,
        deviceId: fp?.deviceId ?? undefined,
        fingerprint: fp?.fingerprint ?? undefined,
      }),
      credentials: "include",
    });

    setIsVerifying2fa(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      haptic.error(); sound.error();
      setTwoFaError((err as { error?: string })?.error || "Invalid passcode. Please try again.");
      return;
    }

    const data2fa = await res.json().catch(() => ({}));
    if ((data2fa as { token?: string }).token) {
      localStorage.setItem("clash_ren_token", (data2fa as { token: string }).token);
    }

    haptic.reward(); sound.reward();
    invalidateUserRef.current();
    toast({ title: "Verified!", description: "Welcome to Clash Ren." });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const doSendOtp = async (digits: string) => {
    setIsSending(true);
    setOtpSendError("");
    try {
      // Step 1: rate-check with our server and get a browserToken
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits }),
        credentials: "include",
      });
      if (!res.ok) {
        setIsSending(false);
        const err = await res.json().catch(() => ({}));
        const msg = (err as { error?: string })?.error || "Failed to send OTP";
        setOtpSendError(msg);
        toast({ title: "Error", description: msg, variant: "destructive" });
        return false;
      }
      const { browserToken } = await res.json().catch(() => ({})) as { browserToken?: string };
      browserTokenRef.current = browserToken ?? "";

      // Step 2: send the actual SMS via antcloud from the browser (server-side is blocked by antcloud)
      const antcloudResult = await sendOtpViaBrowser(digits);
      setIsSending(false);
      if (!antcloudResult.success) {
        const msg = antcloudResult.message || "Failed to send OTP";
        setOtpSendError(msg);
        toast({ title: "Error", description: msg, variant: "destructive" });
        return false;
      }

      toast({ title: "OTP Sent", description: "Please check your messages." });
      return true;
    } catch {
      setIsSending(false);
      const msg = "Network error. Please try again.";
      setOtpSendError(msg);
      toast({ title: "Error", description: msg, variant: "destructive" });
      return false;
    }
  };

  const onPhoneSubmit = async (data: z.infer<typeof phoneSchema>) => {
    haptic.mediumTap();
    // Navigate immediately — don't block on OTP API call
    setPhone(data.phone);
    phoneRef.current = data.phone;
    setDisplayPhone(formatPhoneDisplay(data.phone));
    setStep("otp");
    setTimer(60);
    setOtpSendState("sending");
    const ok = await doSendOtp(data.phone);
    setOtpSendState(ok ? "sent" : "failed");
  };

  // Manual submit — reads current otpValue from ref to stay fresh
  const onOtpSubmit = () => { haptic.mediumTap(); submitWithCode(otpValueRef.current); };

  const handleResend = async () => {
    haptic.mediumTap();
    setTimer(60);
    setOtpSendState("sending");
    const ok = await doSendOtp(phone);
    setOtpSendState(ok ? "sent" : "failed");
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-5 px-8">
        <Skeleton className="w-16 h-16 rounded-full bg-white/8" />
        <div className="flex flex-col items-center gap-2.5 w-full max-w-xs">
          <Skeleton className="h-8 w-48 rounded-xl bg-white/8" />
          <Skeleton className="h-4 w-64 rounded bg-white/5" />
          <Skeleton className="h-4 w-52 rounded bg-white/4" />
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs mt-2">
          <Skeleton className="h-12 w-full rounded-2xl bg-white/6" />
          <Skeleton className="h-12 w-full rounded-2xl bg-white/4" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 w-[350px] h-[350px] bg-primary/20 rounded-full blur-[100px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 w-[250px] h-[250px] bg-purple-800/15 rounded-full blur-[80px]" />

      <button
        className="absolute top-5 left-5 flex items-center gap-1.5 text-muted-foreground hover:text-white transition-colors text-sm font-heading tracking-wide"
        onClick={() => { haptic.mediumTap(); setLocation("/landing"); }}
        data-testid="back-to-landing"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <div className="glass-panel w-full max-w-sm rounded-2xl p-8 flex flex-col items-center gap-6 relative z-10">
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.3)]">
            <img src={LOGO_URL} alt="Clash Ren Logo" className="w-11 h-11 object-contain" />
          </div>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontStyle: "italic", letterSpacing: "0.08em", fontSize: "0.8rem" }}>
            <span style={{ background: "linear-gradient(180deg,#e0e0e0 0%,#999 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CLASH </span><span style={{ color: "#e01010" }}>REN</span>
          </span>
        </div>

        {step === "suspended" && suspendedData ? (
          <>
            {/* Status icon */}
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${suspendedData.status === "blocked" ? "bg-orange-500/15 border border-orange-500/30 shadow-[0_0_30px_rgba(249,115,22,0.2)]" : "bg-red-500/15 border border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.2)]"}`}>
              {suspendedData.status === "blocked"
                ? <Ban className="w-8 h-8 text-orange-400" strokeWidth={1.5} />
                : <Trash2 className="w-8 h-8 text-red-400" strokeWidth={1.5} />
              }
            </div>

            {/* Title */}
            <div className="text-center -mt-2">
              <h1 className="font-heading text-xl font-bold tracking-tight text-white mb-0.5">
                {suspendedData.status === "blocked" ? "Account Blocked" : "Account Deleted"}
              </h1>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${suspendedData.status === "blocked" ? "bg-orange-500/20 text-orange-300" : "bg-red-500/20 text-red-300"}`}>
                {suspendedData.status === "blocked" ? "ACCESS RESTRICTED" : "ACCOUNT REMOVED"}
              </span>
            </div>

            {/* Info card */}
            <div className="w-full rounded-xl p-4 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-2">
                <ShieldX className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Reason from clash zen support team</span>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed pl-0.5">
                {suspendedData.reason ?? <span className="italic text-zinc-500">No reason provided</span>}
              </p>
              {suspendedData.status === "blocked" && (
                <div className="flex items-center justify-between pt-2 border-t border-white/6">
                  <span className="text-xs text-zinc-500">Blocked until</span>
                  <span className={`text-xs font-bold ${suspendedData.blockedUntil ? "text-orange-300" : "text-zinc-400"}`}>
                    {suspendedData.blockedUntil ? fmtDate(suspendedData.blockedUntil) : "Indefinite"}
                  </span>
                </div>
              )}
            </div>

            {/* Support buttons */}
            <div className="w-full flex flex-col gap-2.5">
              <p className="text-[10px] text-zinc-600 text-center uppercase tracking-widest font-bold">Contact Support</p>
              <button
                onClick={() => { haptic.mediumTap(); window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(suspendedData.status === "blocked" ? "Hi Clash Ren Support, my account has been blocked. I'd like to appeal this decision." : "Hi Clash Ren Support, my account was removed. I'd like to understand why or restore it.")}`, "_blank"); }}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl active:scale-[0.98] transition-all text-left"
                style={{ background: "rgba(37,211,102,0.10)", border: "1px solid rgba(37,211,102,0.25)" }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-[#25D366]" style={{ background: "rgba(37,211,102,0.15)" }}>
                  <WAIcon />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">WhatsApp Support</p>
                  <p className="text-[10px] text-zinc-500">Fastest response · Appeal your case</p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
              </button>
              <button
                onClick={() => { haptic.mediumTap(); setStep("phone"); setSuspendedData(null); setOtpValue(""); setDisplayPhone(""); phoneForm.reset(); }}
                className="w-full text-xs text-zinc-600 hover:text-zinc-400 transition-colors pt-1"
              >
                ← Try a different number
              </button>
            </div>
          </>
        ) : step === "2fa" ? (
          <>
            <div className="text-center w-full space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto mb-3 shadow-[0_0_20px_rgba(139,92,246,0.25)]">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <h1 className="font-heading text-2xl font-bold tracking-tight text-white">
                2FA Verification
              </h1>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Enter your 6-digit security passcode
              </p>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); submit2FA(twoFaCode); }}
              className="w-full flex flex-col items-center gap-5"
            >
              <OtpBoxInput
                value={twoFaCode}
                onChange={(v) => { setTwoFaCode(v); setTwoFaError(""); }}
              />

              {twoFaError && (
                <p className="text-xs text-red-400 text-center">{twoFaError}</p>
              )}

              <div className="w-full space-y-3">
                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-lg shadow-[0_0_15px_rgba(139,92,246,0.5)] transition-all active:scale-95 font-heading tracking-wide"
                  disabled={isVerifying2fa || twoFaCode.length !== 6}
                >
                  {isVerifying2fa ? "Verifying..." : "Unlock Account"}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground/60 hover:text-muted-foreground text-xs"
                  onClick={() => { haptic.mediumTap(); setStep("phone"); setOtpValue(""); setTwoFaCode(""); setTwoFaError(""); }}
                >
                  <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                  Start over
                </Button>
              </div>
            </form>
          </>
        ) : step === "phone" ? (
          <>
            <div className="text-center">
              <h1 className="font-heading text-2xl font-bold tracking-tight text-white mb-1">
                Enter Your Number
              </h1>
              <p className="text-xs text-muted-foreground">
                We'll send a quick OTP to verify it's you
              </p>
            </div>

            <Form {...phoneForm}>
              <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="w-full space-y-4">
                <FormField
                  control={phoneForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <div className="flex bg-black/50 border border-white/10 rounded-xl overflow-hidden focus-within:border-primary/50 transition-colors">
                          <div className="bg-white/5 px-3 flex items-center gap-1.5 text-muted-foreground border-r border-white/10 select-none shrink-0">
                            <span className="text-xs font-bold text-zinc-300">+91</span>
                          </div>
                          <Input
                            ref={field.ref}
                            name={field.name}
                            onBlur={field.onBlur}
                            type="tel"
                            inputMode="numeric"
                            placeholder="XXXXX XXXXX"
                            className="border-0 bg-transparent focus-visible:ring-0 rounded-none h-12 text-lg tracking-widest"
                            maxLength={12}
                            value={displayPhone}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                              const formatted = formatPhoneDisplay(digits);
                              setDisplayPhone(formatted);
                              field.onChange(digits);
                            }}
                            data-testid="input-phone"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-lg shadow-[0_0_15px_rgba(139,92,246,0.5)] transition-all active:scale-95 font-heading tracking-wide"
                  disabled={isSending}
                  data-testid="btn-send-otp"
                >
                  {isSending ? "Sending..." : "Send OTP"}
                </Button>
                {/* Honeypot — visually hidden, never shown to real users */}
                <input
                  type="text"
                  name="website"
                  autoComplete="off"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={e => { honeypotRef.current = e.target.value; }}
                  style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", opacity: 0, pointerEvents: "none" }}
                />
              </form>
            </Form>
          </>
        ) : (
          <>
            <div className="text-center w-full space-y-1">
              <h1 className="font-heading text-2xl font-bold tracking-tight text-white">
                Verify Your Number
              </h1>
              <p className="text-xs text-muted-foreground leading-relaxed">
                A 6-digit code has been sent to
              </p>
              <p className="text-sm font-semibold text-white tracking-wide">
                +91 {phone}
              </p>
              {otpSendState === "sending" && (
                <p className="text-[11px] text-amber-400/80 animate-pulse">Sending OTP…</p>
              )}
              {otpSendState === "failed" && (
                <p className="text-[11px] text-red-400">{otpSendError || "Failed to send — tap Resend below"}</p>
              )}
              {otpSendState !== "failed" && (
                <p className="text-[11px] text-zinc-500 leading-relaxed pt-1">
                  ⏳ OTP delivery can take <span className="text-zinc-300 font-medium">1–3 minutes</span>. Please wait before tapping Resend.
                </p>
              )}
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); onOtpSubmit(); }}
              className="w-full flex flex-col items-center gap-6"
            >
              <OtpBoxInput
                value={otpValue}
                onChange={setOtpValue}
                testId="input-otp"
              />

              <div className="w-full space-y-3">
                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-lg shadow-[0_0_15px_rgba(139,92,246,0.5)] transition-all active:scale-95 font-heading tracking-wide"
                  disabled={isVerifying || otpValue.length !== 6}
                  data-testid="btn-verify-otp"
                >
                  {isVerifying ? "Verifying..." : "Continue"}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground hover:text-white"
                  disabled={timer > 0 || isSending}
                  onClick={handleResend}
                  data-testid="btn-resend-otp"
                >
                  {timer > 0 ? `Resend Code (${timer}s)` : "Resend Code"}
                </Button>

              </div>
            </form>
          </>
        )}
      </div>

      {step !== "suspended" && (
        <p className="mt-6 text-xs text-muted-foreground/60 text-center max-w-xs">
          {step === "phone"
            ? "Step into the world of tournaments. Verify your number to continue."
            : step === "2fa"
            ? "Your account is protected with a 6-digit security passcode."
            : "By continuing, you agree to Clash Ren's terms. OTP sent via SMS to your mobile."}
        </p>
      )}
    </div>
  );
}
