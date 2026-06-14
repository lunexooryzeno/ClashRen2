import { useState } from "react";
import { useUpdateMe } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { WelcomeModal } from "@/components/welcome-modal";
import { haptic } from "@/lib/haptics";
import { Crosshair, Loader2, ChevronRight, AlertCircle, RotateCcw, Youtube, ShieldAlert } from "lucide-react";

const POST_WELCOME_REDIRECT_KEY = "clash-ren:post-welcome-redirect";
const getWelcomeShownKey = (userId: number) => `clash-ren:welcomed:${userId}`;

type FetchState = "idle" | "loading" | "error";

interface FetchedProfile {
  nickname: string;
  level: number;
  region: string;
}

export default function SetupProfileScreen() {
  const updateMe = useUpdateMe();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [uid, setUid] = useState("");
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [fetchError, setFetchError] = useState("");
  const [showWelcome, setShowWelcome] = useState(false);
  const pendingRedirect = sessionStorage.getItem(POST_WELCOME_REDIRECT_KEY) ?? "/";

  const trimmedUid = uid.trim();
  const uidValid = /^\d{8,14}$/.test(trimmedUid);
  const isLoading = fetchState === "loading";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!uidValid || isLoading) return;
    haptic.mediumTap();
    setFetchState("loading");
    setFetchError("");

    try {
      const res = await fetch(
        `/api/freefire/player?uid=${encodeURIComponent(trimmedUid)}&region=ind`,
        { credentials: "include" }
      );
      const json = await res.json() as {
        nickname?: string; level?: number; region?: string;
        manual?: boolean; error?: string;
      };

      if (!res.ok || json.manual || !json.nickname) {
        haptic.error();
        setFetchState("error");
        setFetchError(
          json.error ??
          (json.manual
            ? "Could not find your account. Please check your UID and try again."
            : "Failed to fetch player data. Please try again.")
        );
        return;
      }

      // Save uid + fetched in-game name
      await updateMe.mutateAsync({ uid: trimmedUid, inGameName: json.nickname } as any);
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      if (user?.id) localStorage.setItem(getWelcomeShownKey(user.id), "true");
      haptic.success();
      setShowWelcome(true);
    } catch {
      haptic.error();
      setFetchState("error");
      setFetchError("Network error. Check your connection and try again.");
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
          {/* Icon + heading */}
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.6))",
                boxShadow: "0 0 40px hsl(var(--primary) / 0.35)",
              }}
            >
              <Crosshair className="w-8 h-8 text-white" strokeWidth={2} />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-black text-white tracking-tight">Link Your Account</h1>
              <p className="text-sm text-zinc-400 mt-1">Enter your Free Fire Max UID to get started</p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">
                  Free Fire UID
                </label>
                <a
                  href="https://www.youtube.com/results?search_query=How+to+copy+free+fire+uid"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold text-red-400 hover:text-red-300 transition-colors active:opacity-60"
                  style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.18)" }}
                  onClick={() => haptic.lightTap?.()}
                >
                  <Youtube className="w-3 h-3" />
                  How to find my UID?
                </a>
              </div>
              <input
                value={uid}
                onChange={e => {
                  setUid(e.target.value.replace(/\D/g, ""));
                  if (fetchState === "error") { setFetchState("idle"); setFetchError(""); }
                }}
                placeholder="Enter your 8–14 digit UID"
                maxLength={14}
                inputMode="numeric"
                autoFocus
                className="w-full h-12 rounded-xl px-4 text-base text-white font-mono font-semibold outline-none transition-all"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: `1px solid ${
                    fetchState === "error"
                      ? "rgba(239,68,68,0.5)"
                      : uidValid
                      ? "hsl(var(--primary) / 0.5)"
                      : "rgba(255,255,255,0.10)"
                  }`,
                  boxShadow: uidValid && fetchState !== "error"
                    ? "0 0 0 1px hsl(var(--primary) / 0.25)"
                    : undefined,
                }}
              />
              <div className="flex justify-between mt-1.5 px-0.5">
                <p className="text-[11px] text-zinc-500">8–14 digits only</p>
                <p className="text-[11px] tabular-nums text-zinc-500">{trimmedUid.length}/14</p>
              </div>
            </div>

            {/* Warning box */}
            <div
              className="rounded-xl p-3 flex items-start gap-3"
              style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.22)" }}
            >
              <ShieldAlert className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-[12px] text-blue-300/80 leading-relaxed">
                <span className="font-bold text-blue-300">Enter carefully.</span> Once your UID is linked, changing it requires admin approval. Double-check before continuing.
              </p>
            </div>

            {/* Error state */}
            {fetchState === "error" && (
              <div
                className="rounded-xl p-3 flex items-start gap-3"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
              >
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-300 leading-snug">{fetchError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!uidValid || isLoading}
              className="w-full h-12 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40"
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))",
                boxShadow: uidValid ? "0 6px 24px hsl(var(--primary) / 0.35)" : undefined,
              }}
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Looking up account…</>
              ) : fetchState === "error" ? (
                <><RotateCcw className="w-4 h-4" /> Try Again</>
              ) : (
                <>Continue <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="text-center text-[11px] text-zinc-600 leading-relaxed">
            Your UID is shown in-game under your profile name.
          </p>
        </div>
      </div>

      {showWelcome && (
        <WelcomeModal onDone={handleWelcomeDone} />
      )}
    </>
  );
}
