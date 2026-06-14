import { useState } from "react";
import { useUpdateMe } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { WelcomeModal } from "@/components/welcome-modal";
import { haptic } from "@/lib/haptics";
import { Gamepad2, Loader2, ChevronRight } from "lucide-react";

const POST_WELCOME_REDIRECT_KEY = "clash-ren:post-welcome-redirect";
const getWelcomeShownKey = (userId: number) => `clash-ren:welcomed:${userId}`;

export default function SetupProfileScreen() {
  const updateMe = useUpdateMe();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const pendingRedirect = sessionStorage.getItem(POST_WELCOME_REDIRECT_KEY) ?? "/";

  const trimmedName = name.trim();
  const nameValid = trimmedName.length >= 2 && trimmedName.length <= 20;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nameValid || isSaving) return;
    haptic.mediumTap();
    setIsSaving(true);
    try {
      await updateMe.mutateAsync({ inGameName: trimmedName } as any);
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      if (user?.id) localStorage.setItem(getWelcomeShownKey(user.id), "true");
      setShowWelcome(true);
    } catch {
      toast({ title: "Failed to save", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }

  function handleWelcomeDone() {
    setShowWelcome(false);
    sessionStorage.removeItem(POST_WELCOME_REDIRECT_KEY);
    setLocation(pendingRedirect);
  }

  return (
    <>
      <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10 relative overflow-hidden">
        {/* Background glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] rounded-full opacity-20 blur-3xl"
            style={{ background: "radial-gradient(ellipse, hsl(var(--primary)) 0%, transparent 70%)" }}
          />
          <div
            className="absolute bottom-0 right-0 w-[300px] h-[300px] rounded-full opacity-10 blur-3xl"
            style={{ background: "radial-gradient(ellipse, hsl(var(--primary)) 0%, transparent 70%)" }}
          />
        </div>

        <div className="relative z-10 w-full max-w-sm flex flex-col gap-8">
          {/* Icon */}
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.6))",
                boxShadow: "0 0 40px hsl(var(--primary) / 0.35)",
              }}
            >
              <Gamepad2 className="w-8 h-8 text-white" strokeWidth={2} />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-black text-white tracking-tight">Set Up Your Profile</h1>
              <p className="text-sm text-zinc-400 mt-1">Enter the name you use in Free Fire Max</p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-2 block">
                In-Game Name
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your Free Fire nickname"
                maxLength={20}
                autoFocus
                className="w-full h-12 rounded-xl px-4 text-base text-white font-semibold outline-none transition-all"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: `1px solid ${nameValid || !name ? "rgba(255,255,255,0.10)" : "hsl(var(--primary) / 0.5)"}`,
                  boxShadow: nameValid ? "0 0 0 1px hsl(var(--primary) / 0.25)" : undefined,
                }}
              />
              <div className="flex justify-between mt-1.5 px-0.5">
                <p className="text-[11px] text-zinc-500">2–20 characters</p>
                <p className={`text-[11px] tabular-nums ${trimmedName.length > 18 ? "text-amber-400" : "text-zinc-500"}`}>
                  {trimmedName.length}/20
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={!nameValid || isSaving}
              className="w-full h-12 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40"
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))",
                boxShadow: nameValid ? "0 6px 24px hsl(var(--primary) / 0.35)" : undefined,
              }}
            >
              {isSaving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              ) : (
                <>Continue <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="text-center text-[11px] text-zinc-600 leading-relaxed">
            You can update your name later from your profile settings.
          </p>
        </div>
      </div>

      {showWelcome && (
        <WelcomeModal onDone={handleWelcomeDone} />
      )}
    </>
  );
}
