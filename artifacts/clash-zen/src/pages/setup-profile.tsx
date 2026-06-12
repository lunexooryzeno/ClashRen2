import { useState, useEffect } from "react";
import { useUpdateMe } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { WelcomeModal } from "@/components/welcome-modal";
import { haptic } from "@/lib/haptics";
import {
  Phone, User, Flame, ChevronRight, AlertTriangle, Loader2, Check,
} from "lucide-react";

const getWelcomeShownKey = (userId: number) => `clash-ren:welcomed:${userId}`;
const POST_WELCOME_REDIRECT_KEY = "clash-ren:post-welcome-redirect";

type Step = "form" | "done";

export default function SetupProfileScreen() {
  const updateMe = useUpdateMe();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<Step>("form");
  const [inGameName, setInGameName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [showWelcome, setShowWelcome] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState("/");
  const [assignedId, setAssignedId] = useState<string | null>(null);

  useEffect(() => {
    const postWelcomeRedirect = sessionStorage.getItem(POST_WELCOME_REDIRECT_KEY);
    if (postWelcomeRedirect && user?.inGameName) {
      sessionStorage.removeItem(POST_WELCOME_REDIRECT_KEY);
      setLocation(postWelcomeRedirect);
    }
  }, [user?.inGameName, setLocation]);

  function validate() {
    const e: { name?: string; phone?: string } = {};
    if (!inGameName.trim() || inGameName.trim().length < 2) {
      e.name = "Enter your in-game nickname (at least 2 characters).";
    }
    if (!contactPhone.trim()) {
      e.phone = "Enter your WhatsApp / phone number.";
    } else if (!/^\+?\d[\d\s\-]{7,14}$/.test(contactPhone.trim())) {
      e.phone = "Enter a valid phone number (e.g. +91 98765 43210).";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const onSubmit = () => {
    if (!validate()) return;
    haptic.mediumTap();
    setIsSaving(true);

    updateMe.mutate(
      { data: { inGameName: inGameName.trim(), contactPhone: contactPhone.trim() } as any },
      {
        onSuccess: (data: any) => {
          queryClient.setQueryData(getGetMeQueryKey(), (old: any) =>
            old
              ? {
                  ...old,
                  inGameName: inGameName.trim(),
                  contactPhone: contactPhone.trim(),
                  platformId: data?.platformId ?? old.platformId,
                }
              : old
          );
          setAssignedId(data?.platformId ?? null);
          const raw = sessionStorage.getItem("redirectAfterLogin") || "/";
          sessionStorage.removeItem("redirectAfterLogin");
          const INVALID_REDIRECTS = ["/setup-profile", "/landing", "/get-started", "/onboarding"];
          const redirectTo = INVALID_REDIRECTS.includes(raw) ? "/" : raw;
          setPendingRedirect(redirectTo);
          setIsSaving(false);
          setShowWelcome(true);
        },
        onError: (err) => {
          toast({
            title: "Error",
            description: (err as any).data?.error || "Failed to save profile. Try again.",
            variant: "destructive",
          });
          setIsSaving(false);
        },
      }
    );
  };

  const handleWelcomeContinue = () => {
    if (user?.id) localStorage.setItem(getWelcomeShownKey(user.id), "true");
    setShowWelcome(false);
    setLocation(pendingRedirect);
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  };

  return (
    <>
      <div className="min-h-[100dvh] flex flex-col items-center justify-center py-8 px-4 relative overflow-hidden">
        {/* Ambient blobs */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[130px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[250px] h-[250px] bg-orange-700/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="w-full max-w-sm relative z-10">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-orange-700/20 border border-primary/30 mb-5 shadow-[0_0_30px_rgba(234,88,12,0.25)]">
              <Flame className="w-8 h-8 text-primary" strokeWidth={1.5} />
            </div>
            <h1 className="font-heading text-3xl font-bold tracking-tight text-white mb-2">
              SET UP PROFILE
            </h1>
            <p className="text-sm text-zinc-500">Tell us your in-game name and contact number</p>
          </div>

          {/* Form card */}
          <div
            className="rounded-2xl p-6 border border-white/10 space-y-5"
            style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(20px)" }}
          >
            {/* In-game name */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">
                In-Game Nickname
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <Input
                  value={inGameName}
                  onChange={e => { setInGameName(e.target.value.slice(0, 20)); setErrors(v => ({ ...v, name: undefined })); }}
                  placeholder="Your Free Fire nickname"
                  maxLength={20}
                  className="pl-10 bg-black/60 border border-white/10 rounded-xl h-12 focus-visible:ring-1 focus-visible:ring-primary/60 focus-visible:border-primary/50 text-white placeholder:text-zinc-700 text-base"
                />
              </div>
              {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
              <p className="text-[11px] text-zinc-600">Must match your exact in-game name. Admins may verify.</p>
            </div>

            {/* Phone number */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">
                WhatsApp / Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <Input
                  value={contactPhone}
                  onChange={e => { setContactPhone(e.target.value); setErrors(v => ({ ...v, phone: undefined })); }}
                  placeholder="+91 98765 43210"
                  type="tel"
                  className="pl-10 bg-black/60 border border-white/10 rounded-xl h-12 focus-visible:ring-1 focus-visible:ring-primary/60 focus-visible:border-primary/50 text-white placeholder:text-zinc-700 text-base"
                />
              </div>
              {errors.phone && <p className="text-xs text-red-400">{errors.phone}</p>}
              <p className="text-[11px] text-zinc-600">Used by admins to contact you about tournaments. Not shown publicly.</p>
            </div>

            {/* Notice */}
            <div
              className="rounded-xl overflow-hidden border border-amber-500/25 px-3.5 py-3 flex items-start gap-3"
              style={{ background: "rgba(245,158,11,0.06)" }}
            >
              <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-0.5">Clash Ren ID</p>
                <p className="text-[12px] text-zinc-300 leading-snug">
                  You will be assigned a unique <span className="text-white font-semibold">Clash Ren ID</span> (e.g.{" "}
                  <span className="font-mono text-amber-300">CR4K8X2M</span>) that identifies you across all tournaments.
                </p>
              </div>
            </div>

            <Button
              onClick={onSubmit}
              disabled={isSaving}
              className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-base shadow-[0_0_24px_rgba(234,88,12,0.4)] transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isSaving ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Setting up…</>
              ) : (
                <>Continue <ChevronRight className="w-4 h-4" /></>
              )}
            </Button>
          </div>

          {/* Platform ID reveal (post-save) */}
          {assignedId && (
            <div className="mt-4 rounded-2xl p-4 border border-primary/20 flex items-center gap-3" style={{ background: "rgba(234,88,12,0.06)" }}>
              <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center">
                <Check className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Your Clash Ren ID</p>
                <p className="font-mono text-lg font-bold text-primary tracking-wider">{assignedId}</p>
              </div>
            </div>
          )}

          <p className="text-center text-[11px] text-zinc-700 mt-4">
            Your ID is permanent and used to identify you in all tournaments.
          </p>
        </div>
      </div>

      <WelcomeModal
        open={showWelcome}
        playerName={inGameName || "Player"}
        onContinue={handleWelcomeContinue}
      />
    </>
  );
}
