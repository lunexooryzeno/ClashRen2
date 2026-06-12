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
  Phone, Flame, ChevronRight, AlertTriangle, Loader2, Check,
  Search, User, Hash, Star, RefreshCw,
} from "lucide-react";

const getWelcomeShownKey = (userId: number) => `clash-ren:welcomed:${userId}`;
const POST_WELCOME_REDIRECT_KEY = "clash-ren:post-welcome-redirect";

type FetchState = "idle" | "loading" | "done" | "error";

interface PlayerInfo {
  accountId: string;
  nickname: string;
  level: number | null;
  rank: number | null;
  region: string | null;
}

export default function SetupProfileScreen() {
  const updateMe = useUpdateMe();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [uid, setUid] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [inGameName, setInGameName] = useState("");
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [fetchError, setFetchError] = useState("");
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<{ uid?: string; name?: string; phone?: string }>({});
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

  const fetchPlayer = async () => {
    const trimmedUid = uid.trim();
    if (!trimmedUid || !/^\d{8,14}$/.test(trimmedUid)) {
      setErrors(v => ({ ...v, uid: "Enter a valid Free Fire UID (8–14 digits)." }));
      return;
    }
    setErrors(v => ({ ...v, uid: undefined }));
    setFetchState("loading");
    setFetchError("");
    setPlayer(null);

    try {
      const res = await fetch(`/api/freefire/hub-player?uid=${encodeURIComponent(trimmedUid)}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setFetchState("error");
        setFetchError(data.error || "Player not found. Check your UID and try again.");
        return;
      }
      setPlayer(data as PlayerInfo);
      setInGameName(data.nickname || "");
      setFetchState("done");
      haptic.softTap();
    } catch {
      setFetchState("error");
      setFetchError("Network error. Please try again.");
    }
  };

  function validate() {
    const e: { uid?: string; name?: string; phone?: string } = {};
    if (!uid.trim() || !/^\d{8,14}$/.test(uid.trim())) {
      e.uid = "Enter a valid Free Fire UID (8–14 digits).";
    }
    if (fetchState !== "done") {
      e.uid = "Look up your Free Fire UID first.";
    }
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
            <p className="text-sm text-zinc-500">Link your Free Fire account and add your contact</p>
          </div>

          {/* Form card */}
          <div
            className="rounded-2xl p-6 border border-white/10 space-y-5"
            style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(20px)" }}
          >

            {/* ── STEP 1: Free Fire UID ── */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                <Hash className="w-3 h-3" />Free Fire UID
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    value={uid}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 14);
                      setUid(v);
                      if (fetchState === "done") { setFetchState("idle"); setPlayer(null); setInGameName(""); }
                      setErrors(v2 => ({ ...v2, uid: undefined }));
                    }}
                    placeholder="e.g. 14105038766"
                    inputMode="numeric"
                    maxLength={14}
                    className="bg-black/60 border border-white/10 rounded-xl h-12 focus-visible:ring-1 focus-visible:ring-primary/60 focus-visible:border-primary/50 text-white placeholder:text-zinc-700 text-base font-mono"
                  />
                </div>
                <button
                  onClick={fetchPlayer}
                  disabled={fetchState === "loading" || !uid.trim()}
                  className="h-12 px-4 rounded-xl bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary font-bold text-sm flex items-center gap-1.5 transition-all disabled:opacity-50 shrink-0"
                >
                  {fetchState === "loading"
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : fetchState === "done"
                    ? <RefreshCw className="w-4 h-4" />
                    : <Search className="w-4 h-4" />}
                  {fetchState === "loading" ? "..." : fetchState === "done" ? "Re-fetch" : "Fetch"}
                </button>
              </div>
              {errors.uid && <p className="text-xs text-red-400">{errors.uid}</p>}
              {fetchState === "error" && <p className="text-xs text-red-400">{fetchError}</p>}
              <p className="text-[11px] text-zinc-600">Your Free Fire UID — find it in your in-game profile.</p>
            </div>

            {/* Player card (shown after fetch) */}
            {fetchState === "done" && player && (
              <div
                className="rounded-xl px-4 py-3 border border-emerald-500/25 flex items-center gap-3"
                style={{ background: "rgba(52,211,153,0.06)" }}
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-emerald-500 uppercase tracking-widest font-bold mb-0.5">Player Found</p>
                  <p className="text-sm font-bold text-white truncate">{player.nickname}</p>
                  <p className="text-[11px] text-zinc-500 font-mono">UID: {player.accountId}{player.level ? ` · Lv${player.level}` : ""}{player.region ? ` · ${player.region}` : ""}</p>
                </div>
                {player.rank && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Star className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-xs text-amber-300 font-bold">{player.rank}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 2: Confirm Nickname ── */}
            {fetchState === "done" && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                  <User className="w-3 h-3" />In-Game Nickname
                </label>
                <Input
                  value={inGameName}
                  onChange={e => { setInGameName(e.target.value.slice(0, 20)); setErrors(v => ({ ...v, name: undefined })); }}
                  placeholder="Your Free Fire nickname"
                  maxLength={20}
                  className="bg-black/60 border border-white/10 rounded-xl h-12 focus-visible:ring-1 focus-visible:ring-primary/60 focus-visible:border-primary/50 text-white placeholder:text-zinc-700 text-base"
                />
                {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
                <p className="text-[11px] text-zinc-600">Auto-filled from your Free Fire account. You can correct it if needed.</p>
              </div>
            )}

            {/* ── STEP 3: Contact Phone ── */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                <Phone className="w-3 h-3" />WhatsApp / Contact Number
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
              <p className="text-[11px] text-zinc-600">Used by admins to contact you. Not shown publicly.</p>
            </div>

            {/* Platform ID notice */}
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
                  You'll receive a unique <span className="text-white font-semibold">Clash Ren ID</span> (e.g.{" "}
                  <span className="font-mono text-amber-300">CR4K8X2M</span>) that identifies you across all tournaments.
                </p>
              </div>
            </div>

            <Button
              onClick={onSubmit}
              disabled={isSaving || fetchState !== "done"}
              className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-base shadow-[0_0_24px_rgba(234,88,12,0.4)] transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isSaving ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Setting up…</>
              ) : (
                <>Continue <ChevronRight className="w-4 h-4" /></>
              )}
            </Button>

            {fetchState !== "done" && (
              <p className="text-center text-[11px] text-zinc-600">Fetch your UID details first to continue.</p>
            )}
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
            Your Clash Ren ID is permanent and used to identify you in all tournaments.
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
