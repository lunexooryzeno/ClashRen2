import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { sendOtpViaBrowser, verifyOtpViaBrowser } from "@/lib/antcloud";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Shield } from "lucide-react";

const phoneSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid Indian mobile number (starts with 6–9, 10 digits)"),
});

const otpSchema = z.object({
  otp: z.string().length(6, "OTP must be 6 digits"),
});

export default function AuthScreen() {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [timer, setTimer] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const browserTokenRef = useRef<string>("");
  const { invalidateUser } = useAuth();
  const { toast } = useToast();

  const phoneForm = useForm<z.infer<typeof phoneSchema>>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: "" },
  });

  const otpForm = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: "" },
  });

  const startTimer = () => {
    setTimer(60);
    const interval = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) { clearInterval(interval); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  const doSendOtp = async (digits: string): Promise<boolean> => {
    setIsSending(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Error", description: (err as { error?: string })?.error || "Failed to send OTP", variant: "destructive" });
        return false;
      }
      const { browserToken } = await res.json().catch(() => ({})) as { browserToken?: string };
      browserTokenRef.current = browserToken ?? "";

      const antcloudResult = await sendOtpViaBrowser(digits);
      if (!antcloudResult.success) {
        toast({ title: "Error", description: antcloudResult.message || "Failed to send OTP", variant: "destructive" });
        return false;
      }
      return true;
    } catch {
      toast({ title: "Error", description: "Network error. Please try again.", variant: "destructive" });
      return false;
    } finally {
      setIsSending(false);
    }
  };

  const onPhoneSubmit = async (data: z.infer<typeof phoneSchema>) => {
    const ok = await doSendOtp(data.phone);
    if (ok) {
      setPhone(data.phone);
      setStep("otp");
      startTimer();
      toast({ title: "OTP Sent", description: "Please check your messages." });
    }
  };

  const onOtpSubmit = async (data: z.infer<typeof otpSchema>) => {
    setIsVerifying(true);
    try {
      const antcloudResult = await verifyOtpViaBrowser(phone, data.otp);
      if (!antcloudResult.success) {
        toast({ title: "Invalid OTP", description: antcloudResult.message || "Please try again.", variant: "destructive" });
        return;
      }

      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, browserToken: browserTokenRef.current }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Login Failed", description: (err as { error?: string })?.error || "Please try again.", variant: "destructive" });
        return;
      }
      const result = await res.json().catch(() => ({}));
      if ((result as { token?: string }).token) {
        localStorage.setItem("clash_ren_token", (result as { token: string }).token);
      }
      invalidateUser();
      toast({ title: "Success", description: "Logged in successfully." });
    } catch {
      toast({ title: "Error", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    const ok = await doSendOtp(phone);
    if (ok) {
      startTimer();
      toast({ title: "OTP Resent", description: "A new code has been sent." });
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="glass-panel w-full max-w-sm rounded-2xl p-8 flex flex-col items-center gap-6 relative z-10">
        <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.3)]">
          <img 
            src="/icons/logo.png"
            alt="Clash Ren Logo" 
            className="w-14 h-14 object-contain"
          />
        </div>
        
        <div className="text-center">
          <h1 className="text-3xl mb-2" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontStyle: "italic", letterSpacing: "0.05em" }}>
            <span style={{ background: "linear-gradient(180deg,#fff 0%,#aaa 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CLASH </span><span style={{ color: "#e01010" }}>REN</span>
          </h1>
          <p className="text-sm text-muted-foreground">Compete. Win. Ascend.</p>
        </div>

        {step === "phone" ? (
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
                          <Shield className="w-3.5 h-3.5" />
                          <span className="text-xs font-bold text-zinc-300">+91</span>
                        </div>
                        <Input 
                          {...field} 
                          type="tel" 
                          placeholder="Phone Number" 
                          className="border-0 bg-transparent focus-visible:ring-0 rounded-none h-12 text-lg"
                          maxLength={10}
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
                className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-lg shadow-[0_0_15px_rgba(139,92,246,0.5)] transition-all active:scale-95"
                disabled={isSending}
                data-testid="button-submit-phone"
              >
                {isSending ? "Sending..." : "Continue"}
              </Button>
            </form>
          </Form>
        ) : (
          <Form {...otpForm}>
            <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} className="w-full flex flex-col items-center gap-6">
              <p className="text-sm text-muted-foreground text-center">
                Enter the code sent to <br/><span className="text-white">+91 {phone}</span>
              </p>
              
              <FormField
                control={otpForm.control}
                name="otp"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <InputOTP maxLength={6} {...field} data-testid="input-otp">
                        <InputOTPGroup className="gap-2">
                          {[0, 1, 2, 3, 4, 5].map((index) => (
                            <InputOTPSlot 
                              key={index} 
                              index={index} 
                              className="w-10 h-12 rounded-lg border-white/20 bg-black/50 text-xl font-bold focus:border-primary/60 focus:ring-1 focus:ring-primary/60"
                            />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="w-full space-y-4">
                <Button 
                  type="submit" 
                  className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-lg shadow-[0_0_15px_rgba(139,92,246,0.5)] transition-all active:scale-95"
                  disabled={isVerifying || otpForm.watch("otp").length !== 6}
                  data-testid="button-submit-otp"
                >
                  {isVerifying ? "Verifying..." : "Verify & Play"}
                </Button>
                
                <Button 
                  type="button" 
                  variant="ghost" 
                  className="w-full text-muted-foreground hover:text-white"
                  disabled={timer > 0 || isSending}
                  onClick={handleResend}
                  data-testid="button-resend-otp"
                >
                  {timer > 0 ? `Resend Code (${timer}s)` : "Resend Code"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </div>
    </div>
  );
}
