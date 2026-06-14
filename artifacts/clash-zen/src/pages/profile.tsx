import React, { useState, useRef, useEffect } from "react";
import { CachedImg } from "@/components/CachedImg";
import { useAuth } from "@/lib/auth";
import { useLogout, useUpdateMe } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ThemePicker } from "@/components/theme-picker";
import { haptic, hapticSettings } from "@/lib/haptics";
import { useToast } from "@/hooks/use-toast";
import {
  Camera, Gem, Wallet, MessageCircle, Users, UserPlus, UserMinus,
  Shield, Bell, Edit3, Lock, LogOut, ChevronRight, X,
  User, TrendingUp, Sparkles, Crown, Plus, Share2, Trophy,
  Star, Zap, Award, Settings as SettingsIcon, Bookmark,
  QrCode, Image as ImageIcon, Trash2, Palette, Eye, EyeOff,
  Flag, Lightbulb, CheckCircle, Clock, XCircle, AlertTriangle,
  Loader2, Crosshair, Headset, Smartphone, Info,
} from "lucide-react";

interface ProfileAchievement {
  id: number; icon: string; bgColor: string; title: string;
  subtitle: string; description: string; isUnlocked: boolean;
}

// ─── Sheet helpers ──────────────────────────────────────────────────────────
function Overlay({ onClose }: { onClose: () => void }) {
  return <div className="fixed inset-0 bg-black/75 z-[70] backdrop-blur-sm" onClick={onClose} />;
}

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <Overlay onClose={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-[80] rounded-t-[28px] flex flex-col max-h-[82dvh]"
        style={{
          background: "hsl(var(--popover) / 0.98)",
          backdropFilter: "blur(36px)",
          borderTop: "1px solid hsl(var(--primary) / 0.18)",
          boxShadow: "0 -20px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}>
        <div className="mx-auto mt-2.5 mb-1 w-10 h-1 rounded-full bg-white/15" />
        <div className="flex items-center justify-between px-5 pt-3 pb-3 shrink-0">
          <h2 className="font-heading text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/8 flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-8">{children}</div>
      </div>
    </>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function Profile() {
  const { user, logout: contextLogout, invalidateUser } = useAuth();
  const logout = useLogout();
  const updateMe = useUpdateMe();
  const [, navigate] = useLocation();
  const [showPhone, setShowPhone] = useState(false);
  const [isLoading, setIsLoading] = useState(!user);
  useEffect(() => {
    if (user) setIsLoading(false);
  }, [user]);

  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const profilePicture = user?.profilePicture ?? null;
  const avatarUrl = profilePicture
    ? (profilePicture.startsWith("/api/") || profilePicture.startsWith("http") ? profilePicture : `/api/storage${profilePicture}`)
    : null;

  const [showFriends, setShowFriends] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hapticsEnabled, setHapticsEnabled] = useState(() => hapticSettings.isEnabled());
  const [showEditName, setShowEditName] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);

  function removeAvatar() {
    updateMe.mutate({ data: { profilePicture: null } }, {
      onSuccess: () => {
        invalidateUser();
        setShowPhotoSheet(false);
      },
    });
  }

  const [uidInput, setUidInput] = useState(user?.uid ?? "");
  const [fetchingName, setFetchingName] = useState(false);
  const [fetchNameError, setFetchNameError] = useState<string | null>(null);

  async function handleFetchName() {
    setFetchingName(true);
    setFetchNameError(null);
    try {
      const res = await fetch("/api/users/me/fetch-name", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: uidInput.trim() || undefined }),
      });
      const data = await res.json() as { error?: string; daysLeft?: number; inGameName?: string };
      if (!res.ok) {
        if (res.status === 429) {
          setFetchNameError(`Name change locked for ${data.daysLeft ?? "?"} more day${data.daysLeft !== 1 ? "s" : ""}. Contact support to unlock early.`);
          invalidateUser();
        } else {
          setFetchNameError(data.error ?? "Failed to fetch name. Try again.");
        }
      } else {
        invalidateUser();
        toast({ title: "Name updated!", description: `Your in-game name is now "${data.inGameName}"` });
        setShowEditName(false);
      }
    } catch {
      setFetchNameError("Network error. Please try again.");
    } finally {
      setFetchingName(false);
    }
  }

  const [friends, setFriends] = useState<{ id: string; name: string; level: number; online: boolean; avatar: string }[]>([]);

  const [showReportForm, setShowReportForm] = useState(false);
  const [reportCategory, setReportCategory] = useState("cheating");
  const [reportAccused, setReportAccused] = useState("");
  const [reportEvidence, setReportEvidence] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [myReports, setMyReports] = useState<{ id: number; category: string; status: string; createdAt: string; accusedName: string | null }[]>([]);
  const [reportsLoaded, setReportsLoaded] = useState(false);

  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackType, setFeedbackType] = useState("general");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [addInput, setAddInput] = useState("");

  const [userStats, setUserStats] = useState<{ tournamentsPlayed: number; totalKills: number; totalWins: number; diamondsEarned: number; diamondsSpent: number; rank: number | null } | null>(null);

  useEffect(() => {
    fetch("/api/users/me/stats", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setUserStats(data); })
      .catch(() => {});
  }, []);

  const [achievements, setAchievements] = useState<ProfileAchievement[]>([]);
  const [selectedAchievement, setSelectedAchievement] = useState<ProfileAchievement | null>(null);

  useEffect(() => {
    fetch("/api/users/me/achievements", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((data: ProfileAchievement[]) => setAchievements(data))
      .catch(() => {});
  }, []);

  const [notifTournaments, setNotifTournaments] = useState(true);
  const [notifResults, setNotifResults] = useState(true);
  const [notifUpdates, setNotifUpdates] = useState(true);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadingPhoto(true);
    try {
      // Upload directly to disk-based endpoint (Object Storage not configured)
      const uploadRes = await fetch("/api/users/me/upload-photo", {
        method: "POST",
        headers: { "Content-Type": file.type },
        credentials: "include",
        body: file,
      });
      if (!uploadRes.ok) {
        const errBody = await uploadRes.json().catch(() => ({})) as { error?: string };
        throw new Error(errBody.error ?? "Failed to upload photo");
      }
      const { url } = await uploadRes.json() as { url: string };

      await new Promise<void>((resolve, reject) => {
        updateMe.mutate({ data: { profilePicture: url } }, {
          onSuccess: () => { invalidateUser(); resolve(); },
          onError: reject,
        });
      });
      setShowPhotoSheet(false);
      toast({ title: "Photo updated!", description: "Your profile picture has been saved." });
    } catch (err) {
      toast({ title: "Upload failed", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
    }
  }
  function removeFriend(id: string) { setFriends((f) => f.filter((x) => x.id !== id)); }
  function addFriend() {
    if (!addInput.trim()) return;
    setFriends((f) => [...f, { id: `f${Date.now()}`, name: addInput.trim(), level: 50, online: false, avatar: "🎮" }]);
    setAddInput("");
  }
  async function handleLogout() {
    try {
      await logout.mutateAsync(undefined);
    } catch { /* ignore network errors */ }
    // Clear persisted React Query cache and push prompt state from localStorage
    try { localStorage.removeItem("cz:qcache"); } catch { /* ignore */ }
    try { localStorage.removeItem("cz:push-prompted"); } catch { /* ignore */ }
    try { localStorage.removeItem("clash_ren_token"); } catch { /* ignore */ }
    // Clear ALL service-worker caches so stale /api/users/me isn't served on reload
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch { /* ignore */ }
    // Hard redirect — destroys all JS state; app reboots with no cookie → landing page
    window.location.replace(import.meta.env.BASE_URL || "/");
  }

  if (isLoading) return (
    <div className="flex-1 overflow-y-auto pb-28 relative profile-page-bg">
      <div className="flex items-center justify-between px-4 pt-5 pb-2 relative z-10">
        <div className="w-10" />
        <span className="text-[11px] text-muted-foreground uppercase tracking-[0.18em] font-bold">My Profile</span>
        <div className="w-10" />
      </div>
      {/* Hero card skeleton */}
      <div className="px-4 pt-2 pb-2">
        <div className="rounded-3xl overflow-hidden" style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="h-1 w-full bg-white/10" />
          <div className="flex flex-col items-center text-center px-5 pt-6 pb-5 gap-3">
            <Skeleton className="w-28 h-28 rounded-full bg-white/8" />
            <Skeleton className="h-6 w-40 bg-white/8 rounded-xl" />
            <Skeleton className="h-7 w-52 bg-white/5 rounded-full" />
            <div className="grid grid-cols-3 gap-2 w-full mt-1">
              {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-2xl bg-white/5" />)}
            </div>
          </div>
        </div>
      </div>
      {/* Earnings card skeleton */}
      <div className="px-4 mb-4 mt-4">
        <Skeleton className="h-36 w-full rounded-3xl bg-white/5" />
      </div>
      {/* Quick actions skeleton */}
      <div className="px-4 mb-5">
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-20 rounded-2xl bg-white/5" />
          <Skeleton className="h-20 rounded-2xl bg-white/5" />
        </div>
      </div>
      {/* Settings rows skeleton */}
      <div className="px-4 mb-4">
        <Skeleton className="h-3 w-20 bg-white/5 rounded mb-3" />
        <div className="rounded-2xl overflow-hidden space-y-px" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          {[1,2].map(i => <Skeleton key={i} className="h-14 w-full bg-white/4" />)}
        </div>
      </div>
      {/* Achievements skeleton */}
      <div className="px-4 mb-4">
        <Skeleton className="h-3 w-24 bg-white/5 rounded mb-3" />
        <div className="grid grid-cols-3 gap-2.5">
          {[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-2xl bg-white/5" />)}
        </div>
      </div>
      {/* Menu sections skeleton */}
      {[1,2,3].map(s => (
        <div key={s} className="px-4 mb-4">
          <Skeleton className="h-3 w-16 bg-white/5 rounded mb-3" />
          <div className="rounded-2xl overflow-hidden space-y-px" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full bg-white/4" />)}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto pb-28 relative profile-page-bg">
      {/* ═══ CUSTOM HEADER (replaces hidden top nav) ═════════════ */}
      <div className="flex items-center justify-between px-4 pt-5 pb-2 relative z-10">
        <div className="w-10" />
        <span className="text-[11px] text-muted-foreground uppercase tracking-[0.18em] font-bold">My Profile</span>
        <div className="w-10" />
      </div>

      {/* ═══ HERO CARD ══════════════════════════════════════════ */}
      <div className="px-4 pt-2 pb-2">
        <div className="rounded-3xl overflow-hidden relative"
          style={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--primary) / 0.2)",
            boxShadow: "0 4px 32px rgba(0,0,0,0.35)",
          }}>
          {/* Subtle top accent strip */}
          <div className="h-1 w-full btn-primary-gradient" />

          <div className="flex flex-col items-center text-center px-5 pt-6 pb-5">
            {/* Avatar — image only, no camera overlay */}
            <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-primary/30 bg-zinc-900 mb-4">
              {avatarUrl ? (
                <CachedImg src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                  <User className="w-12 h-12 text-zinc-500" strokeWidth={1.5} />
                </div>
              )}
            </div>

            {/* Name */}
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground mb-1">
              {user?.inGameName ?? "Player"}
            </h1>

            {/* 3 action buttons in a row */}
            <div className="grid grid-cols-3 gap-2 w-full">
              <button
                onClick={() => !uploadingPhoto && (avatarUrl ? setShowPhotoSheet(true) : fileRef.current?.click())}
                disabled={uploadingPhoto}
                className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl active:scale-95 transition-transform disabled:opacity-60"
                style={{
                  background: "hsl(var(--primary) / 0.08)",
                  border: "1px solid hsl(var(--primary) / 0.2)",
                }}
                data-testid="btn-photo"
              >
                {uploadingPhoto ? (
                  <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-primary" />
                )}
                <span className="text-[11px] font-bold text-foreground leading-none">
                  {uploadingPhoto ? "Uploading" : avatarUrl ? "Photo" : "Set Photo"}
                </span>
              </button>

              <button
                onClick={() => setShowEditName(true)}
                className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl active:scale-95 transition-transform"
                style={{
                  background: "hsl(var(--primary) / 0.08)",
                  border: "1px solid hsl(var(--primary) / 0.2)",
                }}
                data-testid="btn-edit-info"
              >
                <Edit3 className="w-4 h-4 text-primary" />
                <span className="text-[11px] font-bold text-foreground leading-none">Edit Info</span>
              </button>

              <button
                onClick={async () => {
                  const url = `${window.location.origin}/#/landing`;
                  if (navigator.share) {
                    try {
                      await navigator.share({
                        title: `${user?.inGameName} on Clash Ren`,
                        text: `Add me on Clash Ren — UID: ${user?.uid}`,
                        url,
                      });
                    } catch { /* cancelled */ }
                  } else {
                    await navigator.clipboard.writeText(url);
                  }
                }}
                className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl active:scale-95 transition-transform"
                style={{
                  background: "hsl(var(--primary) / 0.08)",
                  border: "1px solid hsl(var(--primary) / 0.2)",
                }}
                data-testid="btn-share"
              >
                <Share2 className="w-4 h-4 text-primary" />
                <span className="text-[11px] font-bold text-foreground leading-none">Share</span>
              </button>
            </div>

            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
        </div>
      </div>

      {/* ═══ TOTAL EARNINGS — premium card ═══════════════════════ */}
      <div className="px-4 mb-4 mt-4 relative z-20">
        <div className="rounded-3xl p-5 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
            border: "1px solid hsl(var(--primary) / 0.3)",
            boxShadow: "0 12px 40px hsl(var(--primary) / 0.12), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}>
          {/* Decorative circle */}
          <div className="absolute -right-8 -top-8 w-44 h-44 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.25) 0%, transparent 70%)" }}
          />
          <div className="absolute right-3 top-3 opacity-30">
            <Gem className="w-20 h-20 text-primary" strokeWidth={1} />
          </div>

          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--primary) / 0.25), hsl(var(--primary) / 0.15))",
                  border: "1px solid hsl(var(--primary) / 0.4)",
                }}>
                <TrendingUp className="w-4 h-4 text-primary" strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-[10px] text-primary/70 uppercase tracking-[0.15em] font-bold">All-Time Earnings</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">Tournaments · Prizes · Rewards</p>
              </div>
            </div>

            <div className="flex items-end gap-2.5 mb-2">
              <span className="text-5xl font-extrabold font-heading leading-none tracking-tight bg-gradient-to-b from-foreground to-primary bg-clip-text text-transparent">
                {(userStats?.diamondsEarned ?? 0).toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between mt-3 pt-3"
              style={{ borderTop: "1px dashed hsl(var(--primary) / 0.15)" }}>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Current Balance</p>
                <p className="text-sm font-bold text-blue-400 flex items-center gap-1"><Gem className="w-3.5 h-3.5 text-blue-400" strokeWidth={2} />{(user?.diamondBalance ?? 0).toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Tournaments Won</p>
                <p className="text-sm font-bold text-primary">{userStats?.totalWins ?? 0} 🏆</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ QUICK ACTIONS row ═══════════════════════════════════ */}
      <div className="px-4 mb-5">
        <div className="grid grid-cols-2 gap-2">
          <QuickAction
            href="/wallet"
            icon={<Wallet className="w-5 h-5" />}
            label="Wallet"
            sub="Withdraw & Top Up"
            tint="primary"
            testId="quick-wallet"
            badge="24/7"
          />
          <QuickAction
            href="/support"
            icon={<MessageCircle className="w-5 h-5" />}
            label="Messages"
            sub="Support"
            tint="diamond"
            testId="quick-chat"
            badge="24/7"
          />
        </div>
      </div>

      {/* ═══ NOTIFICATIONS ══════════════════════════════════════ */}
      <div className="px-4 mb-5">
        <SectionTitle>Notifications</SectionTitle>
        <div className="rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))",
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
          <SettingsRow icon={<Bell className="w-4 h-4 text-primary" />} label="Notifications" sub="Achievements & received alerts" href="/notifications" onClick={() => {}} />
        </div>
      </div>

      {/* ═══ ACHIEVEMENTS ═══════════════════════════════════════ */}
      {achievements.length > 0 && (
        <div className="px-4 mb-5">
          <div className="flex items-end justify-between mb-3">
            <SectionTitle>Achievements</SectionTitle>
            <span className="text-[11px] text-primary/70 font-semibold">
              {achievements.filter(a => a.isUnlocked).length}/{achievements.length} earned
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {achievements.map(ach => (
              <button
                key={ach.id}
                onClick={() => ach.isUnlocked ? setSelectedAchievement(ach) : undefined}
                className="rounded-2xl p-3 text-center relative overflow-hidden transition-all active:scale-95 text-left w-full"
                style={{
                  background: ach.isUnlocked
                    ? `linear-gradient(135deg, ${ach.bgColor}33 0%, ${ach.bgColor}11 100%)`
                    : "rgba(255,255,255,0.03)",
                  border: ach.isUnlocked ? `1px solid ${ach.bgColor}44` : "1px solid rgba(255,255,255,0.05)",
                  boxShadow: ach.isUnlocked ? `0 0 20px ${ach.bgColor}18` : "none",
                }}
              >
                {ach.isUnlocked && (
                  <div className="absolute -top-2 -right-2 w-14 h-14 rounded-full opacity-30 pointer-events-none"
                    style={{ background: `radial-gradient(circle, ${ach.bgColor}cc 0%, transparent 70%)` }}
                  />
                )}
                {!ach.isUnlocked && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center border border-white/10">
                    <Lock className="w-2.5 h-2.5 text-zinc-500" strokeWidth={2.5} />
                  </div>
                )}
                <div
                  className="relative w-10 h-10 mx-auto rounded-xl flex items-center justify-center mb-2 text-2xl leading-none"
                  style={{
                    background: ach.isUnlocked ? `${ach.bgColor}22` : "rgba(0,0,0,0.3)",
                    border: ach.isUnlocked ? `1px solid ${ach.bgColor}44` : "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {ach.icon}
                </div>
                <div className={cn("text-[11px] font-bold leading-tight truncate", ach.isUnlocked ? "text-white" : "text-zinc-500")}>
                  {ach.title}
                </div>
                {ach.subtitle && (
                  <div className="text-[9px] text-zinc-600 mt-0.5 leading-tight truncate">{ach.subtitle}</div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Achievement detail modal */}
      {selectedAchievement && (
        <>
          <div className="fixed inset-0 bg-black/75 z-[70] backdrop-blur-sm" onClick={() => setSelectedAchievement(null)} />
          <div
            className="fixed bottom-0 left-0 right-0 z-[80] rounded-t-[28px] flex flex-col"
            style={{
              background: "hsl(var(--popover) / 0.98)",
              backdropFilter: "blur(36px)",
              borderTop: "1px solid hsl(var(--primary) / 0.18)",
              boxShadow: "0 -20px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            <div className="mx-auto mt-2.5 mb-1 w-10 h-1 rounded-full bg-white/15" />
            <div className="px-6 pt-4 pb-10 flex flex-col items-center text-center gap-4">
              {/* Big icon */}
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center text-5xl leading-none"
                style={{
                  background: `linear-gradient(135deg, ${selectedAchievement.bgColor}33 0%, ${selectedAchievement.bgColor}11 100%)`,
                  border: `2px solid ${selectedAchievement.bgColor}55`,
                  boxShadow: `0 8px 32px ${selectedAchievement.bgColor}33`,
                }}
              >
                {selectedAchievement.icon}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white mb-1">{selectedAchievement.title}</h2>
                {selectedAchievement.subtitle && (
                  <p className="text-sm font-semibold" style={{ color: selectedAchievement.bgColor }}>{selectedAchievement.subtitle}</p>
                )}
              </div>
              {selectedAchievement.description && (
                <p className="text-sm text-zinc-400 leading-relaxed">{selectedAchievement.description}</p>
              )}
              <div
                className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold"
                style={{ background: `${selectedAchievement.bgColor}22`, color: selectedAchievement.bgColor, border: `1px solid ${selectedAchievement.bgColor}44` }}
              >
                <Award className="w-3.5 h-3.5" /> Achievement Unlocked
              </div>
              <button
                onClick={() => setSelectedAchievement(null)}
                className="w-full py-3 rounded-2xl text-sm font-bold text-zinc-400 border border-white/8 bg-white/4 active:bg-white/8 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══ SQUAD & CLAN ════════════════════════════════════════ */}
      <SquadSection />

      {/* ═══ REFER A FRIEND ══════════════════════════════════════ */}
      <div className="px-4 mb-4">
        <SectionTitle>Refer a Friend</SectionTitle>
        <Link href="/profile/qr">
          <div className="rounded-2xl p-4 flex items-center gap-4 active:scale-[0.99] transition-transform cursor-pointer"
            style={{
              background: "linear-gradient(135deg, hsl(var(--primary) / 0.12) 0%, hsl(var(--card)) 80%)",
              border: "1px solid hsl(var(--primary) / 0.25)",
              boxShadow: "0 4px 16px hsl(var(--primary) / 0.08)",
            }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "hsl(var(--primary) / 0.15)", border: "1px solid hsl(var(--primary) / 0.3)" }}>
              <QrCode className="w-6 h-6 text-primary" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Share Your QR Code</p>
              <p className="text-[11px] text-zinc-500">Invite friends to join Clash Ren</p>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
          </div>
        </Link>
      </div>

      {/* ═══ REPORT A PLAYER ════════════════════════════════════ */}
      <div className="px-4 mb-4">
        <SectionTitle>Report &amp; Dispute</SectionTitle>
        <div className="flex flex-col gap-2">
          <button
            onClick={async () => {
              if (!reportsLoaded) {
                try {
                  const r = await fetch("/api/reports/mine", { credentials: "include" });
                  if (r.ok) setMyReports(await r.json());
                } catch { /* ignore */ }
                setReportsLoaded(true);
              }
              setShowReportForm(true);
            }}
            className="rounded-2xl p-4 flex items-center gap-4 active:scale-[0.99] transition-transform text-left w-full"
            style={{
              background: "linear-gradient(135deg, rgba(239,68,68,0.08) 0%, hsl(var(--card)) 80%)",
              border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
              <Flag className="w-6 h-6 text-red-400" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Report a Player</p>
              <p className="text-[11px] text-zinc-500">Cheating, abusive behavior, disputes</p>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
          </button>

          <button
            onClick={() => setShowFeedbackForm(true)}
            className="rounded-2xl p-4 flex items-center gap-4 active:scale-[0.99] transition-transform text-left w-full"
            style={{
              background: "linear-gradient(135deg, rgba(245,158,11,0.08) 0%, hsl(var(--card)) 80%)",
              border: "1px solid rgba(245,158,11,0.18)",
            }}
          >
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.22)" }}>
              <Lightbulb className="w-6 h-6 text-amber-400" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Send Feedback</p>
              <p className="text-[11px] text-zinc-500">Suggestions, bugs, general feedback</p>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
          </button>
        </div>
      </div>

      {/* ═══ SETTINGS ═══════════════════════════════════════════ */}
      <div className="px-4 mb-5">
        <SectionTitle>Settings</SectionTitle>
        <div className="rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))",
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
          <SettingsRow icon={<Edit3 className="w-4 h-4 text-primary" />} label="Edit Profile" sub="Name, avatar" onClick={() => setShowEditName(true)} />
          <Divider />
          <SettingsRow icon={<Lock className="w-4 h-4 text-primary" />} label="Privacy & Security" sub="Password, 2FA" href="/profile/security" onClick={() => {}} />
          <Divider />
          <SettingsRow icon={<SettingsIcon className="w-4 h-4 text-primary" />} label="App Theme" sub="Choose your look & feel" href="/profile/theme" onClick={() => {}} />
          <Divider />
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "hsl(var(--primary) / 0.1)", border: "1px solid hsl(var(--primary) / 0.2)" }}>
                <Smartphone className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Haptic Feedback</p>
                <p className="text-[11px] text-zinc-500">
                  {hapticSettings.isSupported() ? "Vibrations for key actions" : "Not available on this device"}
                </p>
              </div>
            </div>
            <button
              disabled={!hapticSettings.isSupported()}
              onClick={() => {
                const next = hapticSettings.toggle();
                setHapticsEnabled(next);
                if (next) haptic.mediumTap();
              }}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative flex items-center shrink-0 disabled:opacity-40",
                hapticsEnabled && hapticSettings.isSupported() ? "bg-primary" : "bg-white/10"
              )}
            >
              <span className={cn(
                "absolute w-5 h-5 rounded-full bg-white shadow transition-transform",
                hapticsEnabled && hapticSettings.isSupported() ? "translate-x-6" : "translate-x-0.5"
              )} />
            </button>
          </div>
          <Divider />
          <SettingsRow icon={<Info className="w-4 h-4 text-primary" />} label="About" sub="" href="/about" onClick={() => { haptic.lightTap(); }} />
        </div>

        {/* Account snippet */}
        <div className="mt-3 px-4 py-3 rounded-2xl flex items-center justify-between"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="text-[11px] text-zinc-500 leading-relaxed">
            <div className="flex items-center gap-1.5">
              {(() => {
                const raw = user?.phone ?? "";
                const digits = raw.replace(/^\+?91/, "").replace(/\D/g, "");
                const display = showPhone ? `+91 ${digits}` : `+91 ${digits.slice(0, 4)}••••••`;
                return <span className="font-mono">{display}</span>;
              })()}
              <button onClick={() => setShowPhone(v => !v)} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                {showPhone ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
            </div>
            <p>Member since {user?.createdAt ? format(new Date(user.createdAt), "MMM yyyy") : "—"}</p>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/25 text-emerald-300">
            Verified
          </span>
        </div>
      </div>

      {/* Logout */}
      <div className="px-4">
        <button
          onClick={handleLogout}
          disabled={logout.isPending}
          className="w-full h-12 rounded-2xl text-red-300 font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, rgba(239,68,68,0.1), rgba(127,29,29,0.05))",
            border: "1px solid rgba(239,68,68,0.25)",
          }}
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4" />
          {logout.isPending ? "Logging out…" : "Log Out"}
        </button>
      </div>

      {/* ═══ BOTTOM SHEETS ══════════════════════════════════════ */}
      {showThemePicker && <ThemePicker onClose={() => setShowThemePicker(false)} />}

      {showPhotoSheet && (
        <BottomSheet title="Profile Photo" onClose={() => setShowPhotoSheet(false)}>
          <div className="space-y-2">
            <button
              onClick={() => { setShowPhotoSheet(false); fileRef.current?.click(); }}
              className="w-full flex items-center gap-3 p-4 rounded-2xl text-left hover:bg-white/5 transition-colors"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              data-testid="btn-change-photo"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "hsl(var(--primary) / 0.15)", border: "1px solid hsl(var(--primary) / 0.3)" }}>
                <Camera className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">Change Photo</p>
                <p className="text-xs text-zinc-500">Pick a new image from your device</p>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600" />
            </button>

            <button
              onClick={removeAvatar}
              className="w-full flex items-center gap-3 p-4 rounded-2xl text-left hover:bg-white/5 transition-colors"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(244,63,94,0.18)" }}
              data-testid="btn-remove-photo"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-500/15 border border-rose-500/30">
                <Trash2 className="w-4 h-4 text-rose-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">Remove Photo</p>
                <p className="text-xs text-zinc-500">Go back to default avatar</p>
              </div>
            </button>
          </div>
        </BottomSheet>
      )}

      {showReportForm && (
        <BottomSheet title="Report a Player" onClose={() => setShowReportForm(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">Category</label>
              <select
                value={reportCategory}
                onChange={e => setReportCategory(e.target.value)}
                className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white outline-none focus:border-primary/40 appearance-none"
              >
                <option value="cheating">Cheating / Hacking</option>
                <option value="fake_winner">Fake Winner / Prize Manipulation</option>
                <option value="harassment">Harassment / Threats</option>
                <option value="abusive_behavior">Abusive Behavior</option>
                <option value="false_score">False Score / Kill Count</option>
                <option value="dispute">Match Dispute</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">Accused Player (IGN or Phone)</label>
              <input
                value={reportAccused}
                onChange={e => setReportAccused(e.target.value)}
                placeholder="Player name or phone number..."
                className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-primary/40"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">Evidence &amp; Details</label>
              <textarea
                value={reportEvidence}
                onChange={e => setReportEvidence(e.target.value)}
                placeholder="Describe what happened in detail. Include match ID, time, screenshots if any..."
                rows={4}
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-primary/40 resize-none"
              />
            </div>
            <button
              disabled={reportBusy || !reportEvidence.trim()}
              onClick={async () => {
                setReportBusy(true);
                try {
                  const res = await fetch("/api/reports", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      category: reportCategory,
                      evidence: reportEvidence.trim(),
                      accusedName: reportAccused.trim() || undefined,
                    }),
                  });
                  if (res.ok) {
                    const r = await res.json();
                    setMyReports(prev => [{ id: r.id, category: reportCategory, status: "pending", createdAt: r.createdAt, accusedName: reportAccused.trim() || null }, ...prev]);
                    setReportEvidence("");
                    setReportAccused("");
                    toast({ title: "Report submitted", description: "Our team will review it within 24-48 hours." });
                    setShowReportForm(false);
                  } else {
                    const e = await res.json().catch(() => ({}));
                    toast({ title: "Failed to submit", description: (e as { error?: string }).error ?? "Please try again.", variant: "destructive" });
                  }
                } finally { setReportBusy(false); }
              }}
              className="w-full h-12 rounded-xl text-white font-bold text-sm transition-transform active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.8), rgba(185,28,28,0.9))", boxShadow: "0 8px 24px rgba(239,68,68,0.25)" }}
            >
              <Flag className="w-4 h-4" />
              {reportBusy ? "Submitting..." : "Submit Report"}
            </button>

            {myReports.length > 0 && (
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-bold mb-2">Your Previous Reports</p>
                <div className="space-y-1.5">
                  {myReports.slice(0, 5).map(r => {
                    const statusConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
                      pending:   { icon: Clock,        color: "text-amber-400",   label: "Pending" },
                      resolved:  { icon: CheckCircle,  color: "text-emerald-400", label: "Resolved" },
                      rejected:  { icon: XCircle,      color: "text-zinc-500",    label: "Rejected" },
                      penalized: { icon: AlertTriangle, color: "text-red-400",    label: "Penalized" },
                    };
                    const sc = statusConfig[r.status] ?? statusConfig["pending"];
                    const Icon = sc.icon;
                    return (
                      <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white capitalize">{r.category.replace(/_/g, " ")}</p>
                          {r.accusedName && <p className="text-[10px] text-zinc-500 truncate">vs {r.accusedName}</p>}
                        </div>
                        <span className={cn("flex items-center gap-1 text-[10px] font-bold", sc.color)}>
                          <Icon className="w-3 h-3" />{sc.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </BottomSheet>
      )}

      {showFeedbackForm && (
        <BottomSheet title="Send Feedback" onClose={() => setShowFeedbackForm(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">Feedback Type</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "bug", label: "Bug Report" },
                  { value: "suggestion", label: "Suggestion" },
                  { value: "general", label: "General" },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFeedbackType(opt.value)}
                    className={cn(
                      "h-9 rounded-xl text-xs font-bold transition-colors border",
                      feedbackType === opt.value
                        ? "bg-primary/20 text-primary border-primary/40"
                        : "bg-white/4 text-zinc-400 border-white/8 hover:text-white"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">Your Message</label>
              <textarea
                value={feedbackMessage}
                onChange={e => setFeedbackMessage(e.target.value)}
                placeholder="Tell us what's on your mind. We read every message..."
                rows={5}
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-primary/40 resize-none"
              />
            </div>
            <button
              disabled={feedbackBusy || !feedbackMessage.trim()}
              onClick={async () => {
                setFeedbackBusy(true);
                try {
                  const res = await fetch("/api/feedback", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: feedbackType, message: feedbackMessage.trim() }),
                  });
                  if (res.ok) {
                    setFeedbackMessage("");
                    toast({ title: "Feedback sent", description: "Thank you! We appreciate your input." });
                    setShowFeedbackForm(false);
                  } else {
                    toast({ title: "Failed to send", variant: "destructive" });
                  }
                } finally { setFeedbackBusy(false); }
              }}
              className="w-full h-12 rounded-xl text-white font-bold text-sm transition-transform active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 btn-primary-gradient"
              style={{ boxShadow: "0 8px 24px hsl(var(--primary) / 0.35)" }}
            >
              <Lightbulb className="w-4 h-4" />
              {feedbackBusy ? "Sending..." : "Send Feedback"}
            </button>
          </div>
        </BottomSheet>
      )}

      {showFriends && (
        <BottomSheet title={`Friends (${friends.length})`} onClose={() => setShowFriends(false)}>
          <div className="flex gap-2 mb-4">
            <input
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addFriend()}
              placeholder="Add friend by name…"
              className="flex-1 h-11 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-primary/40"
            />
            <button onClick={addFriend} className="w-11 h-11 rounded-xl flex items-center justify-center text-primary hover:bg-primary/25 transition-colors"
              style={{ background: "hsl(var(--primary) / 0.15)", border: "1px solid hsl(var(--primary) / 0.3)" }}>
              <UserPlus className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            {friends.map((f) => (
              <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-xl">{f.avatar}</div>
                  <span className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background", f.online ? "bg-emerald-400" : "bg-zinc-600")} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{f.name}</p>
                  <p className="text-xs text-zinc-500">Lv. {f.level} · {f.online ? "Online" : "Offline"}</p>
                </div>
                <button onClick={() => removeFriend(f.id)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                  <UserMinus className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </BottomSheet>
      )}

      {showEditName && (
        <BottomSheet title="Edit Profile" onClose={() => { setShowEditName(false); setFetchNameError(null); }}>
          <div className="space-y-4">
            {/* Avatar */}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">Avatar</label>
              <button onClick={() => fileRef.current?.click()} className="w-full h-11 rounded-xl bg-white/5 border border-white/10 text-sm text-zinc-400 flex items-center justify-center gap-2 hover:bg-white/10 transition-colors">
                <Camera className="w-4 h-4" /> Upload Photo
              </button>
            </div>

            {/* Divider */}
            <div className="border-t border-white/6" />

            {/* In-Game Name via UID */}
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-wider mb-1 block">In-Game Name</label>
                <p className="text-[11px] text-zinc-600">Your name is fetched directly from your Free Fire account.</p>
              </div>

              {/* Current name */}
              {user?.inGameName && (
                <div className="rounded-xl bg-white/4 border border-white/8 px-3 py-2.5 flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500">Current name</span>
                  <span className="text-sm font-semibold text-white">{user.inGameName}</span>
                </div>
              )}

              {/* Cooldown check */}
              {(() => {
                const NAME_COOLDOWN_MS = 12 * 24 * 60 * 60 * 1000;
                const changedAt = user?.nameChangedAt ? new Date(user.nameChangedAt).getTime() : null;
                const remaining = changedAt ? NAME_COOLDOWN_MS - (Date.now() - changedAt) : 0;
                const inCooldown = remaining > 0 && !user?.nameChangeAllowed;
                const daysLeft = inCooldown ? Math.ceil(remaining / (24 * 60 * 60 * 1000)) : 0;

                if (inCooldown) {
                  return (
                    <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 p-3 space-y-2">
                      <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
                        <Clock className="w-3.5 h-3.5" />
                        Name change available in {daysLeft} day{daysLeft !== 1 ? "s" : ""}
                      </div>
                      <p className="text-[11px] text-zinc-400">You can update your name once every 12 days. Contact support if you need an early unlock.</p>
                      <button
                        onClick={() => { setShowEditName(false); navigate("/support"); }}
                        className="w-full flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold border border-amber-500/30 text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                      >
                        <Headset className="w-3.5 h-3.5" /> Contact Support
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    <div>
                      <label className="text-[11px] text-zinc-500 mb-1.5 block">Free Fire UID</label>
                      <input
                        value={uidInput}
                        onChange={(e) => setUidInput(e.target.value.replace(/\D/g, ""))}
                        placeholder="Enter your Free Fire UID"
                        maxLength={14}
                        inputMode="numeric"
                        className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white font-mono outline-none focus:border-primary/40 placeholder:text-zinc-600"
                      />
                    </div>
                    <button
                      onClick={handleFetchName}
                      disabled={fetchingName || !uidInput.trim()}
                      className="w-full h-11 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 btn-primary-gradient transition-transform active:scale-[0.98] disabled:opacity-50"
                      style={{ boxShadow: "0 6px 20px hsl(var(--primary) / 0.3)" }}
                    >
                      {fetchingName
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Fetching…</>
                        : <><Crosshair className="w-4 h-4" /> Fetch Name from UID</>}
                    </button>
                    {fetchNameError && (
                      <p className="text-xs text-red-400 text-center">{fetchNameError}</p>
                    )}
                    <p className="text-[10px] text-zinc-600 text-center">A 12-day cooldown applies after each name change.</p>
                  </div>
                );
              })()}
            </div>
          </div>
        </BottomSheet>
      )}

      {showSettings && (
        <BottomSheet title="Notifications" onClose={() => setShowSettings(false)}>
          <div className="space-y-3">
            {[
              { label: "Tournament Alerts", sub: "Upcoming & live tournaments", val: notifTournaments, set: setNotifTournaments },
              { label: "Match Results",     sub: "Win/loss notifications",      val: notifResults,     set: setNotifResults },
              { label: "App Updates",        sub: "New features & announcements", val: notifUpdates,     set: setNotifUpdates },
            ].map((n) => (
              <div key={n.label} className="flex items-center gap-3 p-3.5 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{n.label}</p>
                  <p className="text-xs text-zinc-500">{n.sub}</p>
                </div>
                <button
                  onClick={() => n.set(!n.val)}
                  className={cn("w-12 h-6 rounded-full transition-colors relative flex items-center",
                    n.val ? "bg-primary" : "bg-white/10"
                  )}
                >
                  <span className={cn("absolute w-5 h-5 rounded-full bg-white shadow transition-transform", n.val ? "translate-x-6" : "translate-x-0.5")} />
                </button>
              </div>
            ))}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-heading text-base font-bold text-white mb-3 flex items-center gap-2">
      <span className="w-1 h-5 rounded-full bg-primary" />
      {children}
    </h2>
  );
}

function Divider() {
  return <div className="h-px mx-4" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)" }} />;
}

const TINT_STYLES: Record<string, { bg: string; border: string; iconBg: string; iconText: string }> = {
  "primary":      { bg: "linear-gradient(135deg, hsl(var(--primary) / 0.12), hsl(var(--primary) / 0.06))",  border: "hsl(var(--primary) / 0.25)", iconBg: "hsl(var(--primary) / 0.2)",  iconText: "text-primary" },
  "primary-soft": { bg: "linear-gradient(135deg, hsl(var(--primary) / 0.09), hsl(var(--primary) / 0.04))",  border: "hsl(var(--primary) / 0.20)", iconBg: "hsl(var(--primary) / 0.15)", iconText: "text-primary" },
  "diamond":      { bg: "linear-gradient(135deg, hsl(var(--diamond) / 0.10), hsl(var(--diamond) / 0.04))",  border: "hsl(var(--diamond) / 0.25)", iconBg: "hsl(var(--diamond) / 0.2)",  iconText: "text-diamond" },
};

function QuickAction({ href, icon, label, sub, tint, testId, badge }: { href: string; icon: React.ReactNode; label: string; sub?: string; tint: keyof typeof TINT_STYLES; testId?: string; badge?: string }) {
  const t = TINT_STYLES[tint];
  return (
    <Link href={href}>
      <button
        className="w-full h-full min-h-[88px] rounded-2xl p-3 flex flex-col items-start gap-2 active:scale-[0.97] transition-transform relative"
        style={{ background: t.bg, border: `1px solid ${t.border}` }}
        data-testid={testId}
      >
        {badge && (
          <span className="absolute top-2.5 right-2.5 text-[9px] font-bold text-white/80 bg-white/10 rounded-md px-1.5 py-0.5 tracking-wider">
            {badge}
          </span>
        )}
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", t.iconText)}
          style={{ background: t.iconBg, border: `1px solid ${t.border}` }}>
          {icon}
        </div>
        <div className="text-left w-full">
          <p className="text-sm font-bold text-white leading-tight">{label}</p>
          {sub && <p className="text-[10px] text-zinc-400 truncate">{sub}</p>}
        </div>
      </button>
    </Link>
  );
}

function CardRow({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <button className="w-full rounded-2xl p-3.5 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "hsl(var(--primary) / 0.12)", border: "1px solid hsl(var(--primary) / 0.2)" }}>
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-white">{title}</p>
        <p className="text-[11px] text-zinc-500">{sub}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-600" />
    </button>
  );
}

function SettingsRow({ icon, label, sub, onClick, href }: { icon: React.ReactNode; label: string; sub: string; onClick: () => void; href?: string }) {
  const inner = (
    <button onClick={onClick} className="w-full p-4 flex items-center gap-3 text-left hover:bg-white/3 transition-colors">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.15)" }}>
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-xs text-zinc-500">{sub}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
    </button>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function SquadSection() {
  const [mySquad, setMySquad] = useState<{ name: string; uid: string; avatar?: string } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("clash-ren:my-squad");
      if (raw) setMySquad(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  return (
    <div className="px-4 mb-5">
      <SectionTitle>Squad & Clan</SectionTitle>

      {mySquad ? (
        <>
          {/* Squad card — tappable, navigates to manage page */}
          <Link href="/squad/create">
            <div className="rounded-2xl p-4 mb-2 relative overflow-hidden active:scale-[0.98] transition-transform cursor-pointer"
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary) / 0.16) 0%, hsl(var(--card)) 65%)",
                border: "1px solid hsl(var(--primary) / 0.32)",
                boxShadow: "0 4px 20px hsl(var(--primary) / 0.10)",
              }}>
              <div className="absolute inset-0 opacity-[0.07] pointer-events-none"
                style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent 0 16px, hsl(var(--primary)) 16px 17px)" }} />
              <div className="flex items-center gap-3 relative">
                {mySquad.avatar
                  ? <img src={mySquad.avatar} alt="" className="w-12 h-12 rounded-2xl object-cover shrink-0" style={{ border: "1.5px solid hsl(var(--primary)/0.45)" }} />
                  : <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ background: "hsl(var(--primary) / 0.22)", border: "1px solid hsl(var(--primary) / 0.4)" }}>
                      <Shield className="w-6 h-6 text-primary" strokeWidth={2} />
                    </div>
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-heading font-bold text-white text-base leading-tight truncate">{mySquad.name}</p>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "hsl(var(--primary) / 0.2)", color: "hsl(var(--primary))" }}>LEADER</span>
                  </div>
                  <p className="text-[11px] text-primary/55 font-mono tracking-wider mt-0.5">{mySquad.uid}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-primary/50 shrink-0" />
              </div>
            </div>
          </Link>

        </>
      ) : (
        /* No squad — create prompt */
        <Link href="/squad/create">
          <button className="w-full h-14 rounded-2xl flex items-center justify-center gap-2.5 mb-3 active:scale-[0.98] transition-transform font-bold text-sm"
            style={{ background: "rgba(255,255,255,0.03)", border: "1.5px dashed rgba(255,255,255,0.12)", color: "#a1a1aa" }}>
            <div className="w-7 h-7 rounded-xl flex items-center justify-center"
              style={{ background: "hsl(var(--primary)/0.15)", border: "1px solid hsl(var(--primary)/0.25)" }}>
              <Plus className="w-4 h-4 text-primary" />
            </div>
            <span className="text-zinc-400">Create a Squad</span>
          </button>
        </Link>
      )}

      <SquadOptionCard
        href="/squad/join"
        icon={<Users className="w-5 h-5 text-blue-400" />}
        title="Join Squad"
        sub="Enter UID or scan QR · View invitations"
        tint="blue"
      />
    </div>
  );
}

function SquadOptionCard({ href, icon, title, sub, tint }: { href: string; icon: React.ReactNode; title: string; sub: string; tint: "primary" | "blue" | "emerald" }) {
  const styles = {
    primary: { bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.07)", iconBg: "hsl(var(--primary) / 0.12)", iconBorder: "hsl(var(--primary) / 0.25)" },
    blue:    { bg: "rgba(59,130,246,0.05)",  border: "rgba(59,130,246,0.12)",  iconBg: "rgba(59,130,246,0.12)",        iconBorder: "rgba(59,130,246,0.25)" },
    emerald: { bg: "rgba(16,185,129,0.05)",  border: "rgba(16,185,129,0.12)",  iconBg: "rgba(16,185,129,0.12)",        iconBorder: "rgba(16,185,129,0.25)" },
  }[tint];

  return (
    <Link href={href}>
      <button className="w-full rounded-2xl p-3.5 flex items-center gap-3 text-left active:scale-[0.98] transition-transform mt-[10px] mb-[10px]"
        style={{ background: styles.bg, border: `1px solid ${styles.border}` }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: styles.iconBg, border: `1px solid ${styles.iconBorder}` }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">{title}</p>
          <p className="text-[11px] text-zinc-500 truncate">{sub}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
      </button>
    </Link>
  );
}
