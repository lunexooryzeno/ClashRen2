import { useState } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { WelcomeModal } from "@/components/welcome-modal";
import { haptic } from "@/lib/haptics";
import { apiPost } from "@/lib/api";
import { THEME_CATALOG } from "@/lib/themes";
import {
  Crosshair, Loader2, ChevronRight, AlertCircle, RotateCcw,
  Youtube, ShieldAlert, Palette, Check, User, Star, Trophy,
  Heart, Globe, ArrowLeft, Pencil, BadgeCheck,
} from "lucide-react";

const POST_WELCOME_REDIRECT_KEY = "clash-ren:post-welcome-redirect";
const getWelcomeShownKey = (userId: number) => `clash-ren:welcomed:${userId}`;

type FetchState = "idle" | "loading" | "error";
type Step = "uid" | "confirm" | "theme";

interface FetchedProfile {
  nickname: string;
  level: number;
  region: string;
  liked: number;
  rankingPoints: number;
  rank: number;
}

const ONBOARDING_THEMES = (() => {
  const list = THEME_CATALOG.filter(t => t.popular && !t.isSystem).slice(0, 12);
  if (!list.find(t => t.id === "molten")) {
    const molten = THEME_CATALOG.find(t => t.id === "molten");
    if (molten) list.unshift(molten);
  }
  return list;
})();

function rankLabel(rank: number): string {
  if (!rank || rank <= 0) return "Unranked";

  // Gameskinbo API returns 3-digit codes: 101=Bronze I, 202=Silver II, 303=Gold III…
  // 1xx=Bronze, 2xx=Silver, 3xx=Gold, 4xx=Platinum, 5xx=Diamond, 6xx=Heroic, 7xx=GM
  if (rank >= 100) {
    const tier = Math.floor(rank / 100);
    const sub  = rank % 100;
    const subs  = ["I", "II", "III"];
    const names = ["", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Heroic", "Grandmaster"];
    const name  = names[tier] ?? "Grandmaster";
    return sub >= 1 && sub <= 3 ? `${name} ${subs[sub - 1]}` : name;
  }

  // Fallback: sequential 1–17 format
  if (rank <= 3)  return `Bronze ${["I","II","III"][rank - 1]}`;
  if (rank <= 6)  return `Silver ${["I","II","III"][rank - 4]}`;
  if (rank <= 9)  return `Gold ${["I","II","III"][rank - 7]}`;
  if (rank <= 12) return `Platinum ${["I","II","III"][rank - 10]}`;
  if (rank <= 15) return `Diamond ${["I","II","III"][rank - 13]}`;
  if (rank === 16) return "Heroic";
  return "Grandmaster";
}

function rankColor(rank: number): string {
  const tier = rank >= 100 ? Math.floor(rank / 100) : (rank <= 3 ? 1 : rank <= 6 ? 2 : rank <= 9 ? 3 : rank <= 12 ? 4 : rank <= 15 ? 5 : rank === 16 ? 6 : 7);
  const colors: Record<number, string> = {
    0: "rgba(255,255,255,0.15)",
    1: "#cd7f32", // Bronze
    2: "#a8a9ad", // Silver
    3: "#ffd700", // Gold
    4: "#40e0d0", // Platinum
    5: "#00bfff", // Diamond
    6: "#ff6b35", // Heroic
    7: "#a855f7", // Grandmaster
  };
  return colors[tier] ?? colors[0];
}

export default function SetupProfileScreen() {
  const { theme: currentTheme, setTheme } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [uid, setUid] = useState("");
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [fetchError, setFetchError] = useState("");
  const [step, setStep] = useState<Step>("uid");
  const [profile, setProfile] = useState<FetchedProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [pickedTheme, setPickedTheme] = useState(currentTheme ?? "molten");
  const pendingRedirect = sessionStorage.getItem(POST_WELCOME_REDIRECT_KEY) ?? "/";

  const trimmedUid = uid.trim();
  const uidValid = /^\d{8,14}$/.test(trimmedUid);
  const isLoading = fetchState === "loading";

  /* ── Step 1: fetch UID info ────────────────────────────────────────────── */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!uidValid || isLoading) return;
    haptic.mediumTap();
    setFetchState("loading");
    setFetchError("");

    try {
      const res = await fetch(
        `/api/freefire/player?uid=${encodeURIComponent(trimmedUid)}&region=ind`,
        { credentials: "include", cache: "no-store" }
      );
      const json = await res.json() as {
        nickname?: string; level?: number; region?: string;
        liked?: number; rankingPoints?: number; rank?: number;
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

      haptic.successTap();
      setFetchState("idle");
      setProfile({
        nickname:      json.nickname,
        level:         json.level        ?? 0,
        region:        json.region       ?? "IND",
        liked:         json.liked        ?? 0,
        rankingPoints: json.rankingPoints ?? 0,
        rank:          json.rank         ?? 0,
      });
      setStep("confirm");
    } catch (err) {
      haptic.error();
      setFetchState("error");
      setFetchError(
        err instanceof Error && err.message
          ? err.message
          : "Network error. Check your connection and try again."
      );
    }
  }

  /* ── Step 2: confirm → save ────────────────────────────────────────────── */
  async function handleConfirm() {
    if (!profile || saving) return;
    haptic.mediumTap();
    setSaving(true);
    try {
      const patchRes = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ uid: trimmedUid, inGameName: profile.nickname }),
      });
      if (!patchRes.ok) {
        const errJson = await patchRes.json().catch(() => ({})) as { error?: string };
        throw new Error(errJson.error ?? "Failed to save profile.");
      }
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      if (user?.id) localStorage.setItem(getWelcomeShownKey(user.id), "true");
      haptic.successTap();
      setStep("theme");
    } catch (err) {
      haptic.error();
      setFetchState("error");
      setFetchError(err instanceof Error ? err.message : "Failed to save. Try again.");
      setStep("uid");
    } finally {
      setSaving(false);
    }
  }

  /* ── Step 3: theme pick ────────────────────────────────────────────────── */
  function applyTheme(id: string) {
    haptic.lightTap?.();
    setPickedTheme(id);
    setTheme(id);
    apiPost("/users/theme", { theme: id }).catch(() => {});
  }

  function finishThemeStep() {
    haptic.successTap();
    setShowWelcome(true);
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

          {/* ── STEP 1: Enter UID ─────────────────────────────────────────── */}
          {step === "uid" && (
            <>
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

                <div
                  className="rounded-xl p-3 flex items-start gap-3"
                  style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.22)" }}
                >
                  <ShieldAlert className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-[12px] text-blue-300/80 leading-relaxed">
                    <span className="font-bold text-blue-300">Enter carefully.</span> Once your UID is linked, changing it requires admin approval. Double-check before continuing.
                  </p>
                </div>

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
                    <>Look up UID <ChevronRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>

              <p className="text-center text-[11px] text-zinc-600 leading-relaxed">
                Your UID is shown in-game under your profile name.
              </p>
            </>
          )}

          {/* ── STEP 2: Confirm player ────────────────────────────────────── */}
          {step === "confirm" && profile && (
            <>
              <div className="flex flex-col items-center gap-3">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.6))",
                    boxShadow: "0 0 40px hsl(var(--primary) / 0.35)",
                  }}
                >
                  <BadgeCheck className="w-8 h-8 text-white" strokeWidth={2} />
                </div>
                <div className="text-center">
                  <h1 className="text-xl font-black text-white tracking-tight">Is this you?</h1>
                  <p className="text-sm text-zinc-400 mt-1">Confirm your Free Fire account before linking</p>
                </div>
              </div>

              {/* Player card */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              >
                {/* Top accent bar */}
                <div
                  className="h-1 w-full"
                  style={{ background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary)/0.3))" }}
                />

                <div className="px-5 pt-5 pb-4 flex flex-col gap-4">
                  {/* Avatar + name row */}
                  <div className="flex items-center gap-4">
                    <div
                      className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 relative overflow-hidden"
                      style={{
                        background: "linear-gradient(135deg, hsl(var(--primary)/0.35), hsl(var(--primary)/0.12))",
                        border: "1.5px solid hsl(var(--primary)/0.45)",
                        boxShadow: "0 0 18px hsl(var(--primary)/0.2)",
                      }}
                    >
                      <div className="absolute inset-0 opacity-10"
                        style={{ background: "repeating-linear-gradient(45deg,hsl(var(--primary)) 0px,transparent 1px,transparent 6px,hsl(var(--primary)) 7px)" }} />
                      <Crosshair className="w-7 h-7 relative z-10" style={{ color: "hsl(var(--primary))" }} strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-lg font-black text-white truncate leading-tight">{profile.nickname}</p>
                      <p className="text-[11px] text-zinc-500 font-mono mt-0.5">UID: {trimmedUid}</p>
                    </div>
                    <div
                      className="ml-auto shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold"
                      style={{
                        background: "hsl(var(--primary)/0.12)",
                        border: "1px solid hsl(var(--primary)/0.3)",
                        color: "hsl(var(--primary))",
                      }}
                    >
                      Lv {profile.level}
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2">
                    <StatChip icon={<Globe className="w-3 h-3" />} label="Region" value={profile.region} />
                    <StatChip icon={<Heart className="w-3 h-3" />} label="Likes" value={profile.liked.toLocaleString()} />
                    {/* BR Rank with tier color */}
                    <div
                      className="rounded-xl px-2 py-2.5 flex flex-col items-center gap-1 text-center"
                      style={{
                        background: `${rankColor(profile.rank)}12`,
                        border: `1px solid ${rankColor(profile.rank)}30`,
                      }}
                    >
                      <Trophy className="w-3 h-3" style={{ color: rankColor(profile.rank) }} />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">BR Rank</span>
                      <span className="text-[11px] font-bold leading-tight" style={{ color: rankColor(profile.rank) }}>
                        {rankLabel(profile.rank)}
                      </span>
                    </div>
                  </div>

                  {profile.rankingPoints > 0 && (
                    <div
                      className="rounded-xl px-3 py-2 flex items-center gap-2"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                    >
                      <Star className="w-3.5 h-3.5 shrink-0" style={{ color: "hsl(var(--primary))" }} />
                      <span className="text-[11px] text-zinc-400">Ranking Points:</span>
                      <span className="text-[11px] font-bold text-white ml-auto">{profile.rankingPoints.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={handleConfirm}
                  disabled={saving}
                  className="w-full h-12 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))",
                    boxShadow: "0 6px 24px hsl(var(--primary) / 0.35)",
                  }}
                >
                  {saving
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Linking account…</>
                    : <><Check className="w-4 h-4" /> Yes, this is me — Link account</>
                  }
                </button>

                <button
                  onClick={() => { haptic.lightTap?.(); setStep("uid"); setProfile(null); }}
                  disabled={saving}
                  className="w-full h-10 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40 text-zinc-300 hover:text-white"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit UID
                </button>
              </div>
            </>
          )}

          {/* ── STEP 3: Theme picker ──────────────────────────────────────── */}
          {step === "theme" && (
            <>
              <div className="flex flex-col items-center gap-3">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.6))",
                    boxShadow: "0 0 40px hsl(var(--primary) / 0.35)",
                  }}
                >
                  <Palette className="w-8 h-8 text-white" strokeWidth={2} />
                </div>
                <div className="text-center">
                  <div
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-2"
                    style={{ background: "hsl(var(--primary)/0.12)", color: "hsl(var(--primary))", border: "1px solid hsl(var(--primary)/0.25)" }}
                  >
                    Last step
                  </div>
                  <h1 className="text-xl font-black text-white tracking-tight">Choose Your Loadout</h1>
                  <p className="text-sm text-zinc-400 mt-1">Pick a theme. You can change it anytime.</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {ONBOARDING_THEMES.map(t => {
                  const isActive = pickedTheme === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => applyTheme(t.id)}
                      className="relative rounded-xl overflow-hidden flex flex-col transition-all active:scale-[0.96]"
                      style={{
                        border: isActive
                          ? "1.5px solid hsl(var(--primary)/0.7)"
                          : "1.5px solid rgba(255,255,255,0.08)",
                        boxShadow: isActive ? "0 0 12px hsl(var(--primary)/0.25)" : undefined,
                      }}
                    >
                      <div className="w-full h-10 relative overflow-hidden shrink-0" style={{ background: t.bg }}>
                        <div
                          className="absolute inset-0"
                          style={{ background: `linear-gradient(135deg,${t.accent}30 0%,transparent 60%)` }}
                        />
                        <div className="absolute bottom-1 left-1.5 flex gap-0.5">
                          <div className="w-3 h-3 rounded-sm shadow" style={{ background: t.accent }} />
                          <div className="w-2 h-2 rounded-sm shadow opacity-70 self-end" style={{ background: t.accent2 }} />
                        </div>
                        {isActive && (
                          <div
                            className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center shadow"
                            style={{ background: "hsl(var(--primary))" }}
                          >
                            <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                          </div>
                        )}
                      </div>
                      <div
                        className="px-1.5 py-1.5"
                        style={{ background: isActive ? "hsl(var(--primary)/0.08)" : "rgba(255,255,255,0.03)" }}
                      >
                        <p className="text-[9px] font-bold text-white leading-tight line-clamp-1">{t.name}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  onClick={finishThemeStep}
                  className="w-full h-12 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))",
                    boxShadow: "0 6px 24px hsl(var(--primary) / 0.35)",
                  }}
                >
                  Continue with {ONBOARDING_THEMES.find(t => t.id === pickedTheme)?.name ?? "this theme"} <ChevronRight className="w-4 h-4" />
                </button>

                <button
                  onClick={() => { haptic.lightTap?.(); finishThemeStep(); }}
                  className="w-full h-10 rounded-xl text-zinc-400 font-semibold text-sm flex items-center justify-center transition-all active:scale-[0.98] hover:text-zinc-300"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  Skip for now
                </button>
              </div>

              <p className="text-center text-[11px] text-zinc-600 leading-relaxed -mt-4">
                Default is Molten Volcanic — the OG loadout.
              </p>
            </>
          )}

        </div>
      </div>

      <WelcomeModal
        open={showWelcome}
        playerName={profile?.nickname ?? ""}
        onContinue={handleWelcomeDone}
      />
    </>
  );
}

/* ── Stat chip ─────────────────────────────────────────────────────────────── */
function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      className="rounded-xl px-2 py-2.5 flex flex-col items-center gap-1 text-center"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <span className="text-zinc-500">{icon}</span>
      <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
      <span className="text-[11px] font-bold text-white leading-tight">{value}</span>
    </div>
  );
}
