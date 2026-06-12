import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useUpdateMe } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { WelcomeModal } from "@/components/welcome-modal";
import { haptic } from "@/lib/haptics";
import {
  Shield, Star, Heart, PawPrint, Pencil, Lock,
  User, Hash, Crown, CheckCircle2, Flame, ChevronRight, Check,
  AlertCircle, AlertTriangle, Loader2, RotateCcw, TrendingUp,
} from "lucide-react";

const getWelcomeShownKey = (userId: number) => `clash-ren:welcomed:${userId}`;
const POST_WELCOME_REDIRECT_KEY = "clash-ren:post-welcome-redirect";

const uidSchema = z.object({
  uid: z
    .string()
    .min(8, "UID must be at least 8 digits")
    .max(14, "UID must be at most 14 digits")
    .regex(/^\d+$/, "UID must contain numbers only"),
});

interface FreefireProfile {
  accountId: string;
  nickname: string;
  level: number;
  rank: number;
  rankingPoints: number;
  region: string;
  liked: number;
  exp: string;
  creditScore: number;
  primeLevel: number;
  signature: string;
  pet: { level: number; exp: number } | null;
}

type FetchState = "idle" | "loading" | "success" | "error" | "level_too_low";
type Step = "uid" | "manual" | "profile";

export default function SetupProfileScreen() {
  const updateMe = useUpdateMe();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<Step>("uid");
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [fetchError, setFetchError] = useState<string>("");
  const [profile, setProfile] = useState<FreefireProfile | null>(null);
  const [nickname, setNickname] = useState("");
  const [manualUid, setManualUid] = useState("");
  const [manualName, setManualName] = useState("");
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [signature, setSignature] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState("/");

  useEffect(() => {
    const postWelcomeRedirect = sessionStorage.getItem(POST_WELCOME_REDIRECT_KEY);
    if (postWelcomeRedirect && user?.inGameName) {
      sessionStorage.removeItem(POST_WELCOME_REDIRECT_KEY);
      setLocation(postWelcomeRedirect);
    }
  }, [user?.inGameName, setLocation]);

  const form = useForm<z.infer<typeof uidSchema>>({
    resolver: zodResolver(uidSchema),
    defaultValues: { uid: "" },
  });

  const onUidSubmit = async (data: z.infer<typeof uidSchema>) => {
    haptic.mediumTap();
    setFetchState("loading");
    setFetchError("");

    try {
      const res = await fetch(
        `/api/freefire/player?uid=${encodeURIComponent(data.uid)}&region=ind`,
        { credentials: "include" }
      );
      const json = await res.json() as FreefireProfile & { error?: string };

      if (!res.ok) {
        setFetchState("error");
        setFetchError(json.error ?? "Failed to fetch player. Try again.");
        return;
      }

      if (json.level < 40) {
        setFetchState("level_too_low");
        return;
      }

      setProfile(json);
      setNickname(json.nickname);
      setSignature(json.signature ?? "");
      setFetchState("success");
      setStep("profile");
    } catch {
      setFetchState("error");
      setFetchError("Network error. Check your connection and try again.");
    }
  };

  const goManual = () => {
    const uid = form.getValues("uid");
    setManualUid(uid || "");
    setManualName("");
    setStep("manual");
  };

  const onManualConfirm = () => {
    if (!manualUid || !manualName.trim()) return;
    haptic.mediumTap();
    setIsSaving(true);
    updateMe.mutate(
      { data: { inGameName: manualName.trim(), uid: manualUid } },
      {
        onSuccess: () => {
          queryClient.setQueryData(getGetMeQueryKey(), (old: any) =>
            old ? { ...old, inGameName: manualName.trim(), uid: manualUid } : old
          );
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
            description: (err as any).data?.error || "Failed to update profile",
            variant: "destructive",
          });
          setIsSaving(false);
        },
      }
    );
  };

  const onConfirm = () => {
    if (!profile) return;
    haptic.mediumTap();
    setIsSaving(true);
    updateMe.mutate(
      { data: { inGameName: nickname || profile.nickname, uid: profile.accountId } },
      {
        onSuccess: () => {
          queryClient.setQueryData(getGetMeQueryKey(), (old: any) =>
            old ? { ...old, inGameName: nickname || profile!.nickname, uid: profile!.accountId } : old
          );
          const raw = sessionStorage.getItem("redirectAfterLogin") || "/";
          sessionStorage.removeItem("redirectAfterLogin");
          // Never redirect back to auth/setup pages — always fall through to home
          const INVALID_REDIRECTS = ["/setup-profile", "/landing", "/get-started", "/onboarding"];
          const redirectTo = INVALID_REDIRECTS.includes(raw) ? "/" : raw;
          setPendingRedirect(redirectTo);
          setIsSaving(false);
          setShowWelcome(true);
        },
        onError: (err) => {
          toast({
            title: "Error",
            description: (err as any).data?.error || "Failed to update profile",
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
        {/* Ambient background blobs */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[130px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[250px] h-[250px] bg-orange-700/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-blue-600/8 rounded-full blur-[90px] pointer-events-none" />

        {/* ── STEP 1: UID entry ── */}
        {step === "uid" && (
          <div className="w-full max-w-sm relative z-10">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-orange-700/20 border border-primary/30 mb-5 shadow-[0_0_30px_rgba(234,88,12,0.25)]">
                <Flame className="w-8 h-8 text-primary" strokeWidth={1.5} />
              </div>
              <h1 className="font-heading text-3xl font-bold tracking-tight text-white mb-2">
                LINK ACCOUNT
              </h1>
              <p className="text-sm text-zinc-500">Enter your Free Fire UID to fetch your profile</p>
            </div>

            <div
              className="rounded-2xl p-6 border border-white/10"
              style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(20px)" }}
            >
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onUidSubmit)} className="space-y-5">
                  <FormField
                    control={form.control}
                    name="uid"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">
                          Free Fire UID
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                            <Input
                              {...field}
                              type="text"
                              inputMode="numeric"
                              placeholder="Enter your UID"
                              maxLength={14}
                              className="pl-10 bg-black/60 border border-white/10 rounded-xl h-12 focus-visible:ring-1 focus-visible:ring-primary/60 focus-visible:border-primary/50 text-white placeholder:text-zinc-700 text-base"
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, "").slice(0, 14);
                                field.onChange(val);
                              }}
                              data-testid="input-uid"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                        <div className="mt-2 rounded-xl overflow-hidden border border-amber-500/25" style={{ background: "rgba(245,158,11,0.06)" }}>
                          <div className="flex items-start gap-3 px-3.5 py-3">
                            <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            </div>
                            <div>
                              <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-0.5">Permanent UID</p>
                              <p className="text-[12px] text-zinc-300 leading-snug">Your UID <span className="text-white font-semibold">cannot be changed</span> after confirmation. Double-check before continuing.</p>
                            </div>
                          </div>
                        </div>
                      </FormItem>
                    )}
                  />

                  {/* Generic error banner + manual fallback */}
                  {fetchState === "error" && (
                    <div className="space-y-2">
                      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{fetchError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={goManual}
                        className="w-full py-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-sm text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                      >
                        Enter details manually instead →
                      </button>
                    </div>
                  )}

                  {/* Level too low banner */}
                  {fetchState === "level_too_low" && (
                    <div className="rounded-xl overflow-hidden border border-red-500/30" style={{ background: "rgba(239,68,68,0.07)" }}>
                      <div className="flex items-start gap-3 px-3.5 py-3.5">
                        <div className="w-8 h-8 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center shrink-0 mt-0.5">
                          <TrendingUp className="w-4 h-4 text-red-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-red-400 uppercase tracking-wider mb-1">
                            Level Too Low
                          </p>
                          <p className="text-[12px] text-zinc-300 leading-snug mb-3">
                            Your account must be at least{" "}
                            <span className="text-white font-bold">Level 40</span> to join Clash Ren.
                            Keep playing Free Fire to level up and come back!
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-lg border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200 hover:border-red-500/50 text-xs font-semibold gap-1.5 transition-all"
                            onClick={() => {
                              haptic.mediumTap();
                              setFetchState("idle");
                              form.reset();
                            }}
                          >
                            <RotateCcw className="w-3 h-3" />
                            Re-enter FF UID
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={fetchState === "loading" || fetchState === "level_too_low"}
                    className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-base shadow-[0_0_24px_rgba(234,88,12,0.4)] transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70"
                    data-testid="button-fetch-profile"
                  >
                    {fetchState === "loading" ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Fetching Profile…
                      </>
                    ) : (
                      <>
                        Fetch Profile <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </div>
            <p className="text-center text-[11px] text-zinc-700 mt-4">
              Find your UID in Free Fire → Profile → Settings
            </p>
          </div>
        )}

        {/* ── STEP 1b: Manual entry ── */}
        {step === "manual" && (
          <div className="w-full max-w-sm relative z-10">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-orange-700/20 border border-primary/30 mb-5 shadow-[0_0_30px_rgba(234,88,12,0.25)]">
                <Flame className="w-8 h-8 text-primary" strokeWidth={1.5} />
              </div>
              <h1 className="font-heading text-3xl font-bold tracking-tight text-white mb-2">MANUAL SETUP</h1>
              <p className="text-sm text-zinc-500">Enter your UID and in-game name directly</p>
            </div>

            <div className="rounded-2xl p-6 border border-white/10 space-y-5" style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(20px)" }}>
              {/* UID field */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Free Fire UID</label>
                <div className="relative">
                  <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={manualUid}
                    onChange={e => setManualUid(e.target.value.replace(/\D/g, "").slice(0, 14))}
                    placeholder="Your Free Fire UID"
                    maxLength={14}
                    className="w-full pl-10 pr-4 h-12 bg-black/60 border border-white/10 rounded-xl text-white placeholder:text-zinc-700 text-base outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/60 transition-colors"
                  />
                </div>
              </div>

              {/* Nickname field */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">In-Game Nickname</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                  <input
                    type="text"
                    value={manualName}
                    onChange={e => setManualName(e.target.value.slice(0, 20))}
                    placeholder="Your Free Fire nickname"
                    maxLength={20}
                    className="w-full pl-10 pr-4 h-12 bg-black/60 border border-white/10 rounded-xl text-white placeholder:text-zinc-700 text-base outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/60 transition-colors"
                  />
                </div>
                <p className="text-[11px] text-zinc-600">Must match your exact in-game name. Admin may verify.</p>
              </div>

              {/* Permanent UID warning */}
              <div className="rounded-xl overflow-hidden border border-amber-500/25" style={{ background: "rgba(245,158,11,0.06)" }}>
                <div className="flex items-start gap-3 px-3.5 py-3">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-0.5">Permanent UID</p>
                    <p className="text-[12px] text-zinc-300 leading-snug">Your UID <span className="text-white font-semibold">cannot be changed</span> after confirmation. Double-check before continuing.</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-12 rounded-xl border-white/10 bg-white/[0.02] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300"
                  onClick={() => { setStep("uid"); setFetchState("idle"); }}
                >
                  ← Back
                </Button>
                <Button
                  type="button"
                  disabled={manualUid.length < 8 || !manualName.trim() || isSaving}
                  onClick={onManualConfirm}
                  className="flex-[2] h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold shadow-[0_0_24px_rgba(234,88,12,0.4)] transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Confirm & Continue"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Profile card ── */}
        {step === "profile" && profile && (
          <div className="w-full max-w-sm flex flex-col gap-3 relative z-10">

            {/* ── Hero banner card ── */}
            <div
              className="rounded-2xl overflow-hidden border border-white/10 relative"
              style={{ background: "rgba(10,10,10,0.8)", backdropFilter: "blur(24px)" }}
            >
              {/* Decorative banner */}
              <div className="relative h-24 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/50 via-orange-700/30 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                <div
                  className="absolute inset-0 opacity-10"
                  style={{
                    backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)`,
                    backgroundSize: "20px 20px",
                  }}
                />
                {/* Level pill */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm border border-yellow-400/25 rounded-full px-2.5 py-1">
                  <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                  <span className="text-xs font-bold text-yellow-300">Level {profile.level}</span>
                </div>
              </div>

              {/* Avatar — overlapping banner */}
              <div className="px-5 pb-5 -mt-9 relative">
                <div className="flex items-end justify-between mb-3">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-2xl bg-primary/40 blur-[12px] scale-110" />
                    <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary via-orange-600 to-orange-800 border-2 border-primary/60 flex items-center justify-center shadow-[0_8px_24px_rgba(234,88,12,0.5)]">
                      <User className="w-8 h-8 text-white" strokeWidth={1.5} />
                    </div>
                    {profile.primeLevel > 0 && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 border-2 border-black flex items-center justify-center shadow-[0_0_8px_rgba(250,204,21,0.6)]">
                        <Crown className="w-3 h-3 text-black" strokeWidth={2.5} />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1 pb-1">
                    <div className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/25 rounded-full px-2.5 py-1">
                      <Shield className="w-3 h-3 text-blue-400" />
                      <span className="text-xs font-bold text-blue-300">Rank #{profile.rank}</span>
                    </div>
                    <span className="text-[10px] text-zinc-600 font-mono">{profile.rankingPoints.toLocaleString()} pts</span>
                  </div>
                </div>

                {/* Nickname row — editable */}
                <div className="flex items-center gap-2 mb-1.5">
                  {isEditingNickname ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        onBlur={() => setIsEditingNickname(false)}
                        onKeyDown={(e) => e.key === "Enter" && setIsEditingNickname(false)}
                        autoFocus
                        maxLength={20}
                        className="h-9 font-heading text-lg font-bold bg-white/5 border border-primary/40 rounded-xl text-white px-3 focus-visible:ring-1 focus-visible:ring-primary/60 flex-1"
                      />
                      <button
                        onClick={() => { haptic.mediumTap(); setIsEditingNickname(false); }}
                        className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center hover:bg-primary/30 transition-colors shrink-0"
                      >
                        <Check className="w-4 h-4 text-primary" />
                      </button>
                    </div>
                  ) : (
                    <span className="font-heading text-2xl font-bold text-white leading-tight tracking-tight truncate">
                      {nickname}
                    </span>
                  )}
                </div>

                {/* UID + India badge + Prime row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="flex items-center gap-1 text-xs text-zinc-600">
                    <Hash className="w-3 h-3" />{profile.accountId}
                  </span>
                  <span className="w-px h-3 bg-white/10" />
                  <span className="flex items-center gap-1 text-xs font-medium text-zinc-400 bg-white/[0.04] border border-white/10 rounded-full px-2 py-0.5">
                    🇮🇳 India
                  </span>
                  {profile.primeLevel > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-full px-2 py-0.5">
                      <Crown className="w-2.5 h-2.5" /> Prime {profile.primeLevel}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Stats row ── */}
            <div className="grid grid-cols-2 gap-2.5">
              <GlowStat
                icon={<Heart className="w-4 h-4" />}
                label="Likes"
                value={Number(profile.liked).toLocaleString()}
                gradient="from-pink-600/30 to-rose-800/20"
                border="border-pink-500/20"
                iconColor="text-pink-400"
                glow="rgba(236,72,153,0.2)"
              />
              <GlowStat
                icon={<CheckCircle2 className="w-4 h-4" />}
                label="Trust Score"
                value={`${profile.creditScore}/100`}
                gradient="from-emerald-600/30 to-green-800/20"
                border="border-emerald-500/20"
                iconColor="text-emerald-400"
                glow="rgba(52,211,153,0.2)"
              />
              <GlowStat
                icon={<Crown className="w-4 h-4" />}
                label="Prime Level"
                value={profile.primeLevel > 0 ? `Tier ${profile.primeLevel}` : "None"}
                gradient="from-yellow-600/30 to-amber-800/20"
                border="border-yellow-500/20"
                iconColor="text-yellow-400"
                glow="rgba(250,204,21,0.2)"
              />
              <GlowStat
                icon={<PawPrint className="w-4 h-4" />}
                label={profile.pet ? `Pet · Lv.${profile.pet.level}` : "Pet"}
                value={profile.pet ? `${profile.pet.exp.toLocaleString()} XP` : "None"}
                gradient="from-teal-600/30 to-cyan-800/20"
                border="border-teal-500/20"
                iconColor="text-teal-400"
                glow="rgba(20,184,166,0.2)"
              />
            </div>

            {/* ── Bio / Signature ── */}
            <div
              className="rounded-2xl p-4 border border-white/10"
              style={{ background: "rgba(255,255,255,0.025)", backdropFilter: "blur(16px)" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
                  <Pencil className="w-3 h-3 text-primary" />
                </div>
                <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest flex-1">
                  Bio / Signature
                </p>
                <span className="text-[10px] text-zinc-700">{signature.length}/80</span>
              </div>
              <Textarea
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                maxLength={80}
                rows={2}
                className="bg-black/40 border border-white/8 rounded-xl text-sm text-white/90 resize-none focus-visible:ring-1 focus-visible:ring-primary/50 focus-visible:border-primary/40 placeholder:text-zinc-700 leading-relaxed"
                placeholder="Your in-game bio..."
              />
            </div>

            {/* ── Read-only hint ── */}
            <div className="flex items-start gap-2 px-0.5">
              <Lock className="w-3 h-3 text-zinc-700 mt-0.5 shrink-0" />
              <p className="text-[11px] text-zinc-700 leading-relaxed">
                UID, rank &amp; stats are pulled live from your Free Fire account. Nickname and bio are yours to customise.
              </p>
            </div>

            {/* ── UID permanent warning ── */}
            <div className="rounded-xl overflow-hidden border border-amber-500/25" style={{ background: "rgba(245,158,11,0.06)" }}>
              <div className="flex items-start gap-3 px-3.5 py-3">
                <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-0.5">Permanent UID</p>
                  <p className="text-[12px] text-zinc-300 leading-snug">Your UID <span className="text-white font-semibold">cannot be changed</span> after confirmation. Double-check before continuing.</p>
                </div>
              </div>
            </div>

            {/* ── In-game name notice ── */}
            <div className="rounded-xl overflow-hidden border border-blue-500/20" style={{ background: "rgba(59,130,246,0.06)" }}>
              <div className="flex items-start gap-3 px-3.5 py-3">
                <div className="w-6 h-6 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertCircle className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-blue-400 uppercase tracking-wider mb-0.5">In-Game Name</p>
                  <p className="text-[12px] text-zinc-300 leading-snug">Use your <span className="text-white font-semibold">Free Fire in-game name</span> only. To change it later, contact our support team.</p>
                </div>
              </div>
            </div>

            {/* ── Action buttons ── */}
            <div className="flex gap-2.5 pt-1 pb-3">
              <Button
                variant="outline"
                className="flex-1 h-12 rounded-xl border-white/10 bg-white/[0.02] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300 hover:border-white/20 transition-all"
                onClick={() => { haptic.mediumTap(); setStep("uid"); setFetchState("idle"); setProfile(null); }}
                disabled={isSaving}
              >
                Change UID
              </Button>
              <Button
                className="flex-[2] h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold shadow-[0_0_28px_rgba(234,88,12,0.45)] transition-all active:scale-[0.98]"
                onClick={onConfirm}
                disabled={isSaving}
                data-testid="button-confirm-profile"
              >
                {isSaving ? "Saving..." : "Confirm & Continue"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <WelcomeModal
        open={showWelcome}
        playerName={nickname || profile?.nickname || "Player"}
        onContinue={handleWelcomeContinue}
      />
    </>
  );
}

function GlowStat({
  icon, label, value, gradient, border, iconColor, glow,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  gradient: string;
  border: string;
  iconColor: string;
  glow: string;
}) {
  return (
    <div
      className={`relative rounded-2xl p-3.5 border ${border} overflow-hidden`}
      style={{ background: "rgba(10,10,10,0.7)", backdropFilter: "blur(16px)" }}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-70`} />
      <div
        className="absolute top-0 right-0 w-16 h-16 rounded-full blur-[24px] opacity-40"
        style={{ background: glow }}
      />
      <div className="relative flex items-start gap-2.5">
        <div className={`mt-0.5 ${iconColor}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-[10px] text-zinc-500 leading-none mb-1">{label}</p>
          <p className="text-sm font-bold text-white truncate">{value}</p>
        </div>
      </div>
    </div>
  );
}
