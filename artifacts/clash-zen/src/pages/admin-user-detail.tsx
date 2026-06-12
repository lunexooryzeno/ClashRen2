import React, { useState, useEffect, useCallback, useRef } from "react";
import { CachedImg } from "@/components/CachedImg";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Gem, Crown, Ban, Unlock, ArchiveX, RotateCcw, Trash,
  Bell, Shield, AlertTriangle,
  Clock, Trophy, Wallet, RefreshCw, Send, Hash,
  User, Phone, Calendar, ChevronDown, ChevronUp, UserX,
  Swords, Target, Skull, Flame, Star, Medal, Zap,
  ArrowDownLeft, ArrowUpRight, ShieldCheck, ScrollText,
  Wifi, WifiOff, Info, Activity, MessageCircle, CheckCheck, Banknote,
  Check, X as XIcon, MessageSquare, ShieldAlert, CheckCircle,
  Smartphone, Monitor, CreditCard, TrendingUp, TrendingDown, Gift, Award,
  Loader2, UserCheck, LogOut, ChevronRight, IndianRupee,
  CheckCircle2, ShieldOff,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const REQUIRED_UC = "a464dfd00a173f6e10ac6a4774c62f52";
const SESSION_KEY = "czsa_v1_session";

interface SASession { token: string; expiresAt: number; }

function getSession(): SASession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SASession;
    if (Date.now() > s.expiresAt) { localStorage.removeItem(SESSION_KEY); return null; }
    return s;
  } catch { return null; }
}

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function saFetch<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Super-Admin-Token": token, ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError((err as { error?: string }).error ?? res.statusText, res.status);
  }
  return res.json();
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return ""; }
}
function fmtDateTime(iso: string) {
  try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}
function fmtRelative(iso: string) {
  try {
    const d = new Date(iso); const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    return fmtDate(iso);
  } catch { return ""; }
}

interface UserDetail {
  id: number; phone: string; inGameName: string | null; uid: string | null;
  profilePicture: string | null; diamondBalance: number; isAdmin: boolean;
  createdAt: string; status: string; isOnline: boolean; lastSeenAt: string | null;
  blockedReason: string | null; blockedUntil: string | null; blockedAt: string | null;
  deletedAt: string | null; deleteReason: string | null; theme: string | null;
  twoFaEnabled: boolean; twoFaPassword: string | null;
  twoFaPending: boolean; twoFaPendingAt: string | null; twoFaAutoApproveAt: string | null;
  tournamentBanned: boolean; tournamentBannedAt: string | null; tournamentBannedUntil: string | null;
  withdrawalBanned: boolean; withdrawalBannedAt: string | null;
  topupBanned: boolean; topupBannedAt: string | null;
  chatMuted: boolean; chatMutedAt: string | null; chatMutedUntil: string | null;
  walletFrozen: boolean; walletFrozenAt: string | null;
  allowDepositWithdrawal: boolean;
  minWithdrawal: number | null;
  minTopup: number | null;
  nameChangedAt: string | null;
  nameChangeAllowed: boolean;
  twoFaResetAt: string | null;
  twoFaWithdrawalBypass: boolean;
  platformId: string | null;
  contactPhone: string | null;
  isVerified: boolean;
  verifiedAt: string | null;
}
interface WalletTx { id: number; type: string; amount: number; label: string; tournamentId: number | null; createdAt: string; }
interface UserNotif { id: number; type: string; title: string; body: string; read: boolean; createdAt: string; }
interface UserTournament { id: number; tournamentId: number; kills: number; placement: number | null; diamondsWon: number; joinedAt: string; title: string; gameMode: string; entryFeeDiamonds: number; status: string; }
interface UserLog { id: number; action: string; category: string; details: string | null; createdAt: string; }
interface DeviceSession { id: number; ip: string | null; userAgent: string | null; fingerprint: string | null; deviceId: string | null; isEmulator: boolean; emulatorSignals: string | null; androidVersion: string | null; deviceType: string | null; appVersion: string | null; networkType: string | null; country: string | null; region: string | null; language: string | null; createdAt: string; lastSeenAt: string; }
interface LinkedAccount { id: number; phone: string; inGameName: string | null; status: string; createdAt: string; }
interface LoginHistory { id: number; ip: string | null; userAgent: string | null; deviceId: string | null; fingerprint: string | null; method: string; isNewUser: boolean; country: string | null; region: string | null; createdAt: string; }
interface ChatMessage { id: number; message: string; isFromAdmin: boolean; readByUser: boolean; createdAt: string; }
interface WithdrawalRecord { id: number; rupees: number; diamondsRedeemed: number; upiId: string; status: string; rejectedReason: string | null; createdAt: string; paidAt: string | null; rejectedAt: string | null; }
interface BalanceLog { id: number; adminId: number | null; amount: number; balanceBefore: number; balanceAfter: number; reason: string; source: string; createdAt: string; }
interface Achievement { id: number; userId: number; icon: string; bgColor: string; title: string; subtitle: string; description: string; isUnlocked: boolean; createdAt: string; }
interface WithdrawalRisk {
  riskScore: number; riskLevel: "low" | "medium" | "high" | "critical";
  diamondSources: { fromTopups: number; fromPrizes: number; fromGifts: number; totalInflow: number; topupPercent: number; prizePercent: number; giftPercent: number; };
  withdrawalStats: { totalWithdrawn: number; pendingWithdraw: number; totalRequests: number; paidRequests: number; rejectedRequests: number; recentCount: number; };
  topupStats: { total: number; verified: number; pending: number; rejected: number; verifiedRupees: number; };
  winRatio: number | null;
  flags: { flag: string; severity: "low" | "medium" | "high" | "critical"; detail: string }[];
  accountAgeDays: number;
}

type Section = "profile" | "wallet" | "tournaments" | "notifications" | "ffstats" | "logs" | "chat" | "withdrawals" | "comms" | "payments" | "achievements";

const ACH_ICONS = ["🏆","🥇","🎖️","💎","⭐","🔥","⚡","👑","🛡️","🎯","💪","🎮","🌟","💫","🎁","🦁","🐯","🏅","⚔️","🎲","🕹️","🌈","✨","🚀","💥","🔮","🌙","🌊","🐉","🍀","🎪","🏔️","🎭","🎊","🦊","🌸","🎵","🧿","🦅","🏋️"];
const ACH_COLORS = ["#f59e0b","#ef4444","#8b5cf6","#3b82f6","#10b981","#ec4899","#06b6d4","#f97316","#6366f1","#14b8a6","#84cc16","#e2e8f0"];

const COMM_TEMPLATES: Record<string, { label: string; defaultTitle: string; defaultBody: string; type: string; accentClass: string; bg: string }> = {
  warning:    { label: "Warning",      defaultTitle: "Account Warning",       defaultBody: "Your account has received a formal warning for violating our community guidelines. Further violations may result in suspension.",  type: "moderation", accentClass: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/25" },
  reminder:   { label: "Match Reminder", defaultTitle: "Match Starting Soon", defaultBody: "Your match is starting soon! Please join the room with the provided credentials and be ready on time. Good luck!",             type: "tournament", accentClass: "text-sky-400",    bg: "bg-sky-500/10 border-sky-500/25" },
  dispute:    { label: "Dispute",      defaultTitle: "Dispute Resolution",    defaultBody: "Your dispute has been reviewed by our admin team. A decision has been reached and any balance adjustments have been processed.",  type: "result",     accentClass: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/25" },
  payout:     { label: "Payout",       defaultTitle: "Payout Processed",      defaultBody: "Your prize payout has been successfully processed. Check your diamond balance — your winnings are now available.",               type: "wallet",     accentClass: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/25" },
  custom:     { label: "Custom",       defaultTitle: "",                       defaultBody: "",                                                                                                                                type: "general",    accentClass: "text-zinc-400",   bg: "bg-white/5 border-white/10" },
};

interface FFModeStats {
  accountid?: string;
  gamesplayed?: number;
  kills?: number;
  wins?: number;
  detailedstats?: {
    damage?: number; deaths?: number; headshotKills?: number; headshots?: number;
    highestKills?: number; knockDown?: number; ratingPoints?: number;
    ratingEnabledGames?: number; revives?: number; goldMedalCnt?: number;
    silverMedalCnt?: number; survivalTime?: number; topNTimes?: number; roadKills?: number;
  };
}
interface FFDetailedStats {
  damage?: number; deaths?: number; headshotKills?: number; headShotKills?: number;
  headshots?: number; highestKills?: number; knockDown?: number; knockDowns?: number;
  revives?: number; revivals?: number; survivalTime?: number; topNTimes?: number;
  assists?: number; doubleKills?: number; fourKills?: number; mvpCount?: number; tripleKills?: number;
  distanceTravelled?: number; roadKills?: number; pickUps?: number;
}
interface FFModeStats {
  accountid?: string; gamesplayed?: number; kills?: number; wins?: number;
  detailedstats?: FFDetailedStats;
}
interface FFStats {
  uid?: string;
  player?: {
    nickname: string | null; level: number | null; rank: number | null;
    rankingPoints: number | null; liked: number | null; region: string | null;
    creditScore: number | null; signature: string | null;
  } | null;
  br?: { solostats?: FFModeStats; duostats?: FFModeStats; quadstats?: FFModeStats; } | null;
  cs?: { csstats?: FFModeStats; } | null;
}

const NOTIF_TYPES = ["system", "wallet", "result", "tournament", "squad_request", "squad_accepted"];

const LOG_CATEGORY_COLOR: Record<string, string> = {
  auth: "rgba(139,92,246,0.2)",
  notification: "rgba(236,72,153,0.2)",
  general: "rgba(234,88,12,0.2)",
  squad: "rgba(16,185,129,0.2)",
  wallet: "rgba(250,204,21,0.12)",
  moderation: "rgba(239,68,68,0.12)",
  security: "rgba(99,102,241,0.15)",
  tournament: "rgba(20,184,166,0.12)",
  account: "rgba(148,163,184,0.1)",
};
const LOG_CATEGORY_TEXT: Record<string, string> = {
  auth: "text-violet-400",
  notification: "text-pink-400",
  general: "text-orange-400",
  squad: "text-emerald-400",
  wallet: "text-yellow-400",
  moderation: "text-red-400",
  security: "text-indigo-400",
  tournament: "text-teal-400",
  account: "text-slate-400",
};

function handleAuthError(navigate: (path: string) => void) {
  localStorage.removeItem(SESSION_KEY);
  navigate(`/286c81443d1fb388d1b9a8e3b280824c`);
}

export default function AdminUserDetailPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ phone: string; uid: string }>();
  const userId = parseInt(params.uid ?? "0");
  const { toast } = useToast();

  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);

  const [user, setUser] = useState<UserDetail | null>(null);
  const [wallet, setWallet] = useState<WalletTx[]>([]);
  const [notifs, setNotifs] = useState<UserNotif[]>([]);
  const [tournaments, setTournaments] = useState<UserTournament[]>([]);
  const [logs, setLogs] = useState<UserLog[]>([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [withdrawalsLoaded, setWithdrawalsLoaded] = useState(false);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [withdrawalRisk, setWithdrawalRisk] = useState<WithdrawalRisk | null>(null);
  const [withdrawalRiskLoading, setWithdrawalRiskLoading] = useState(false);
  const [rejectingWdId, setRejectingWdId] = useState<number | null>(null);
  const [rejectWdReason, setRejectWdReason] = useState("");
  const [wdActing, setWdActing] = useState<number | null>(null);

  const [section, setSection] = useState<Section>("profile");
  const [loading, setLoading] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);

  const [blockReason, setBlockReason] = useState("");
  const [blockUntil, setBlockUntil] = useState("");
  const [showBlockForm, setShowBlockForm] = useState(false);

  const [binReason, setBinReason] = useState("");
  const [showBinForm, setShowBinForm] = useState(false);

  const [diamondAmount, setDiamondAmount] = useState("");
  const [showDiamondForm, setShowDiamondForm] = useState(false);

  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");
  const [notifType, setNotifType] = useState("system");
  const [showNotifForm, setShowNotifForm] = useState(false);
  const [notifSending, setNotifSending] = useState(false);

  const [rate, setRate] = useState(0.5);
  const [commsBusy, setCommsBusy] = useState(false);
  const [commsTemplate, setCommsTemplate] = useState("custom");
  const [commsTitle, setCommsTitle] = useState("");
  const [commsBody, setCommsBody] = useState("");
  const [commsType, setCommsType] = useState("general");

  const [actionLoading, setActionLoading] = useState(false);
  const [confirmPermDelete, setConfirmPermDelete] = useState(false);
  const [allowNameChangeLoading, setAllowNameChangeLoading] = useState(false);
  const [allow2faWithdrawLoading, setAllow2faWithdrawLoading] = useState(false);
  const [forceLogoutLoading, setForceLogoutLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [localVerified, setLocalVerified] = useState<boolean | null>(null);
  const [localVerifiedAt, setLocalVerifiedAt] = useState<string | null>(null);

  const [minWdInput, setMinWdInput] = useState("");
  const [minWdSaving, setMinWdSaving] = useState(false);
  const [minTpInput, setMinTpInput] = useState("");
  const [minTpSaving, setMinTpSaving] = useState(false);

  const [restrictLoading, setRestrictLoading] = useState(false);
  const [restrictPanels, setRestrictPanels] = useState<Record<string, boolean>>({});
  const [restrictUntil, setRestrictUntil] = useState<Record<string, string>>({});

  const [balanceLogs, setBalanceLogs] = useState<BalanceLog[]>([]);
  const [balanceLogsLoaded, setBalanceLogsLoaded] = useState(false);
  const [balanceLogsLoading, setBalanceLogsLoading] = useState(false);

  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [loginHistory, setLoginHistory] = useState<LoginHistory[]>([]);
  const [linkedAccounts, setLinkedAccounts] = useState<Record<string, LinkedAccount[]>>({});
  const [expandedDevice, setExpandedDevice] = useState<number | null>(null);

  const [ffStats, setFfStats] = useState<FFStats | null>(null);
  const [ffStatsLoading, setFfStatsLoading] = useState(false);
  const [ffStatsError, setFfStatsError] = useState<string | null>(null);
  const [ffStatsLoaded, setFfStatsLoaded] = useState(false);

  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [achievementsLoaded, setAchievementsLoaded] = useState(false);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [showAchievementForm, setShowAchievementForm] = useState(false);
  const [editingAchievement, setEditingAchievement] = useState<Achievement | null>(null);
  const [achIcon, setAchIcon] = useState("🏆");
  const [achBgColor, setAchBgColor] = useState("#f59e0b");
  const [achTitle, setAchTitle] = useState("");
  const [achSubtitle, setAchSubtitle] = useState("");
  const [achDescription, setAchDescription] = useState("");
  const [achUnlocked, setAchUnlocked] = useState(true);
  const [achSaving, setAchSaving] = useState(false);
  const [achDeleting, setAchDeleting] = useState<number | null>(null);

  const loadFfStats = useCallback(async (tok: string, uid: string) => {
    setFfStatsLoading(true);
    setFfStatsError(null);
    try {
      const data = await saFetch<FFStats>(`/super-admin/freefire/stats?uid=${encodeURIComponent(uid)}&region=ind`, tok);
      setFfStats(data);
      setFfStatsLoaded(true);
    } catch (e) {
      setFfStatsError(String(e));
    } finally { setFfStatsLoading(false); }
  }, []);

  const loadLogs = useCallback(async (tok: string) => {
    setLogsLoading(true);
    try {
      const data = await saFetch<UserLog[]>(`/admin/users/${userId}/logs`, tok);
      setLogs(data);
    } catch { /* silently fail */ }
    finally { setLogsLoaded(true); setLogsLoading(false); }
  }, [userId]);

  const sendNotification = useCallback(async (tok: string) => {
    if (!notifTitle.trim() || !notifBody.trim()) {
      toast({ title: "Title and message are required", variant: "destructive" }); return;
    }
    setNotifSending(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/notify`, {
        method: "POST",
        headers: { "x-super-admin-token": tok, "content-type": "application/json" },
        body: JSON.stringify({ title: notifTitle.trim(), body: notifBody.trim(), type: notifType }),
      });
      if (res.ok) {
        const newNotif = await res.json();
        setNotifs(prev => [{ id: newNotif.id, type: notifType, title: notifTitle.trim(), body: notifBody.trim(), read: false, createdAt: newNotif.createdAt }, ...prev]);
        setNotifTitle("");
        setNotifBody("");
        toast({ title: "Notification sent", description: `"${notifTitle.trim()}" delivered to user.` });
      } else {
        const e = await res.json().catch(() => ({}));
        toast({ title: "Failed to send", description: (e as { error?: string }).error ?? "Error", variant: "destructive" });
      }
    } finally { setNotifSending(false); }
  }, [userId, notifTitle, notifBody, notifType, toast]);

  const loadWithdrawals = useCallback(async (tok: string) => {
    setWithdrawalsLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/withdrawals`, {
        headers: { "x-super-admin-token": tok, "content-type": "application/json" },
      });
      if (res.ok) setWithdrawals(await res.json());
    } finally {
      setWithdrawalsLoaded(true);
      setWithdrawalsLoading(false);
    }
  }, [userId]);

  const loadBalanceLogs = useCallback(async (tok: string) => {
    setBalanceLogsLoading(true);
    try {
      const data = await saFetch<BalanceLog[]>(`/admin/users/${userId}/balance-log`, tok);
      setBalanceLogs(data);
    } catch { /* silently fail */ }
    finally { setBalanceLogsLoaded(true); setBalanceLogsLoading(false); }
  }, [userId]);

  const handleWithdrawPay = useCallback(async (id: number, tok: string) => {
    setWdActing(id);
    try {
      const res = await fetch(`/api/admin/withdrawals/${id}/pay`, {
        method: "PATCH",
        headers: { "x-super-admin-token": tok, "content-type": "application/json" },
      });
      if (res.ok) {
        setWithdrawals(prev => prev.map(w => w.id === id ? { ...w, status: "paid", paidAt: new Date().toISOString() } : w));
        toast({ title: "Marked as paid", description: "User has been notified." });
      } else {
        const e = await res.json().catch(() => ({}));
        toast({ title: "Failed", description: (e as { error?: string }).error ?? "Error", variant: "destructive" });
      }
    } finally { setWdActing(null); }
  }, [toast]);

  const handleWithdrawReject = useCallback(async (id: number, reason: string, tok: string) => {
    if (!reason.trim()) { toast({ title: "Enter a rejection reason", variant: "destructive" }); return; }
    setWdActing(id);
    try {
      const res = await fetch(`/api/admin/withdrawals/${id}/reject`, {
        method: "PATCH",
        headers: { "x-super-admin-token": tok, "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (res.ok) {
        setWithdrawals(prev => prev.map(w => w.id === id ? { ...w, status: "rejected", rejectedAt: new Date().toISOString(), rejectedReason: reason.trim() } : w));
        setRejectingWdId(null);
        setRejectWdReason("");
        toast({ title: "Rejected", description: "Diamonds refunded to user." });
      } else {
        const e = await res.json().catch(() => ({}));
        toast({ title: "Failed", description: (e as { error?: string }).error ?? "Error", variant: "destructive" });
      }
    } finally { setWdActing(null); }
  }, [toast]);

  const loadChatMessages = useCallback(async (tok: string) => {
    setChatLoading(true);
    try {
      const data = await saFetch<ChatMessage[]>(`/admin/users/${userId}/messages`, tok);
      setChatMessages(data);
    } catch { /* silently fail */ }
    finally {
      setChatLoaded(true);
      setChatLoading(false);
      setTimeout(() => chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" }), 50);
    }
  }, [userId]);

  const handleSendAdminReply = async () => {
    if (!chatInput.trim() || chatSending) return;
    const text = chatInput.trim();
    setChatInput("");
    setChatSending(true);
    const optimistic: ChatMessage = { id: Date.now(), message: text, isFromAdmin: true, readByUser: false, createdAt: new Date().toISOString() };
    setChatMessages(prev => [...prev, optimistic]);
    setTimeout(() => chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" }), 50);
    try {
      const sent = await saFetch<ChatMessage>(`/admin/users/${userId}/messages`, token, { method: "POST", body: JSON.stringify({ message: text }) });
      setChatMessages(prev => prev.map(m => m.id === optimistic.id ? sent : m));
    } catch {
      setChatMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setChatInput(text);
      toast({ title: "Failed to send", variant: "destructive" });
    } finally { setChatSending(false); }
  };

  const loadAchievements = useCallback(async (tok: string) => {
    setAchievementsLoading(true);
    try {
      const data = await saFetch<Achievement[]>(`/admin/users/${userId}/achievements`, tok);
      setAchievements(data);
    } catch { /* silently fail */ }
    finally { setAchievementsLoaded(true); setAchievementsLoading(false); }
  }, [userId]);

  useEffect(() => {
    if (section === "achievements" && token && !achievementsLoaded && !achievementsLoading) {
      loadAchievements(token);
    }
  }, [section, token, achievementsLoaded, achievementsLoading, loadAchievements]);

  useEffect(() => {
    if (section === "ffstats" && user?.uid && token && !ffStatsLoaded && !ffStatsLoading) {
      loadFfStats(token, user.uid);
    }
  }, [section, user, token, ffStatsLoaded, ffStatsLoading, loadFfStats]);

  useEffect(() => {
    if (section === "logs" && token && !logsLoaded && !logsLoading) {
      loadLogs(token);
    }
  }, [section, token, logsLoaded, logsLoading, loadLogs]);

  useEffect(() => {
    if (section === "chat" && token && !chatLoaded && !chatLoading) {
      loadChatMessages(token);
    }
  }, [section, token, chatLoaded, chatLoading, loadChatMessages]);

  useEffect(() => {
    if (section === "withdrawals" && token && !withdrawalsLoaded && !withdrawalsLoading) {
      loadWithdrawals(token);
    }
  }, [section, token, withdrawalsLoaded, withdrawalsLoading, loadWithdrawals]);

  useEffect(() => {
    if (section === "wallet" && token && !balanceLogsLoaded && !balanceLogsLoading) {
      loadBalanceLogs(token);
    }
  }, [section, token, balanceLogsLoaded, balanceLogsLoading, loadBalanceLogs]);

  useEffect(() => {
    if (section === "payments" && token && user && !withdrawalRisk && !withdrawalRiskLoading) {
      setWithdrawalRiskLoading(true);
      saFetch<WithdrawalRisk>(`/admin/users/${user.id}/withdrawal-risk`, token)
        .then(setWithdrawalRisk)
        .catch(() => {})
        .finally(() => setWithdrawalRiskLoading(false));
    }
  }, [section, token, user, withdrawalRisk, withdrawalRiskLoading]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const uc = urlParams.get("uc");
    if (uc !== null && uc !== REQUIRED_UC) { setDenied(true); return; }
    const s = getSession();
    if (!s) { navigate(`/286c81443d1fb388d1b9a8e3b280824c/user_management`); return; }
    setToken(s.token);
    setReady(true);
    fetch("/api/payment-settings").then(r => r.json()).then((ps: { ratePerDiamond: number }) => { setRate(ps.ratePerDiamond); }).catch(() => {});
  }, [navigate]);

  const loadAll = useCallback(async (tok: string) => {
    if (!userId) return;
    setLoading(true);
    try {
      const [userData, walletData, notifsData, toursData, devicesData, loginHistoryData] = await Promise.all([
        saFetch<UserDetail>(`/admin/users/${userId}`, tok),
        saFetch<WalletTx[]>(`/admin/users/${userId}/wallet`, tok),
        saFetch<UserNotif[]>(`/admin/users/${userId}/notifications`, tok),
        saFetch<UserTournament[]>(`/admin/users/${userId}/tournaments`, tok),
        saFetch<DeviceSession[]>(`/admin/users/${userId}/devices`, tok),
        saFetch<LoginHistory[]>(`/admin/users/${userId}/login-history`, tok),
      ]);
      setUser(userData);
      setWallet(walletData);
      setNotifs(notifsData);
      setTournaments(toursData);
      setDevices(devicesData);
      setLoginHistory(loginHistoryData);
      setAllLoaded(true);

      const fps = [...new Set(devicesData.map(d => d.fingerprint).filter(Boolean))] as string[];
      const linkedMap: Record<string, LinkedAccount[]> = {};
      await Promise.all(fps.map(async fp => {
        try {
          const accounts = await saFetch<LinkedAccount[]>(`/admin/fingerprint/${fp}/accounts`, tok);
          linkedMap[fp] = accounts.filter(a => a.id !== userId);
        } catch { /* ignore */ }
      }));
      setLinkedAccounts(linkedMap);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        toast({ title: "Session expired", description: "Please log in again.", variant: "destructive" });
        handleAuthError(navigate);
        return;
      }
      toast({ title: "Failed to load user", description: String(e), variant: "destructive" });
    } finally { setLoading(false); }
  }, [userId, toast, navigate]);

  useEffect(() => {
    if (ready && token) loadAll(token);
  }, [ready, token, loadAll]);

  async function doAction(path: string, method: string, body?: object): Promise<boolean> {
    setActionLoading(true);
    try {
      await saFetch<unknown>(path, token, { method, body: body ? JSON.stringify(body) : undefined });
      await loadAll(token);
      return true;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        toast({ title: "Session expired", description: "Please log in again.", variant: "destructive" });
        handleAuthError(navigate);
        return false;
      }
      toast({ title: "Action failed", description: String(e), variant: "destructive" });
      return false;
    } finally { setActionLoading(false); }
  }

  const handleBlock = async () => {
    if (!blockReason.trim()) return;
    const ok = await doAction(`/admin/users/${userId}/block`, "PATCH", { reason: blockReason.trim(), blockedUntil: blockUntil || undefined });
    if (ok) { setShowBlockForm(false); setBlockReason(""); setBlockUntil(""); toast({ title: "User blocked" }); }
  };
  const handleUnblock = async () => {
    const ok = await doAction(`/admin/users/${userId}/unblock`, "PATCH", {});
    if (ok) toast({ title: "User unblocked" });
  };
  const handleBin = async () => {
    if (!binReason.trim()) return;
    const ok = await doAction(`/admin/users/${userId}/bin`, "PATCH", { reason: binReason.trim() });
    if (ok) { setShowBinForm(false); setBinReason(""); toast({ title: "User moved to bin" }); }
  };
  const handleRestore = async () => {
    const ok = await doAction(`/admin/users/${userId}/restore`, "PATCH", {});
    if (ok) toast({ title: "User restored" });
  };
  const handlePermDelete = async () => {
    const ok = await doAction(`/admin/users/${userId}/permanent`, "DELETE");
    if (ok) {
      toast({ title: "User permanently deleted" });
      const p = new URLSearchParams(window.location.search);
      navigate(`/286c81443d1fb388d1b9a8e3b280824c/user_management`);
    }
  };
  const handleDiamonds = async (mode: "add" | "deduct") => {
    const amt = parseInt(diamondAmount, 10);
    if (isNaN(amt) || amt <= 0) { toast({ title: "Enter a positive amount", variant: "destructive" }); return; }
    const finalAmt = mode === "deduct" ? -amt : amt;
    const ok = await doAction(`/admin/users/${userId}/diamonds`, "PATCH", { amount: finalAmt });
    if (ok) {
      setShowDiamondForm(false);
      setDiamondAmount("");
      toast({ title: mode === "add" ? `+${amt} diamonds added` : `-${amt} diamonds deducted`, description: "User has been notified." });
    }
  };
  const handleToggleAdmin = async () => {
    const ok = await doAction(`/admin/users/${userId}/admin`, "PATCH", {});
    if (ok) toast({ title: user?.isAdmin ? "Admin revoked" : "Admin granted" });
  };

  const handleForceLogout = async () => {
    setForceLogoutLoading(true);
    try {
      await saFetch<unknown>(`/admin/users/${userId}/force-logout`, token, { method: "PATCH" });
      toast({ title: "Force logout sent", description: "All active sessions have been invalidated." });
    } catch (e) {
      toast({ title: "Force logout failed", description: String(e), variant: "destructive" });
    } finally {
      setForceLogoutLoading(false);
    }
  };

  const handleRestrict = async (type: string, action: "apply" | "lift", until?: string) => {
    if (!user || !token) return;
    setRestrictLoading(true);
    try {
      const updated = await saFetch<UserDetail>(`/admin/users/${user.id}/restrict`, token, {
        method: "PATCH",
        body: JSON.stringify({ type, action, until: until || undefined }),
      });
      setUser(updated);
      setRestrictPanels(p => ({ ...p, [type]: false }));
      setRestrictUntil(p => ({ ...p, [type]: "" }));
      toast({ title: action === "apply" ? "Restriction applied" : "Restriction lifted" });
    } catch (e) {
      toast({ title: String(e), variant: "destructive" });
    } finally { setRestrictLoading(false); }
  };
  const handleSendNotif = async () => {
    if (!notifTitle.trim() || !notifBody.trim()) return;
    const ok = await doAction("/super-admin/broadcast", "POST", { type: notifType, title: notifTitle.trim(), body: notifBody.trim(), targetUserId: userId });
    if (ok) { setShowNotifForm(false); setNotifTitle(""); setNotifBody(""); toast({ title: "Notification sent" }); await loadAll(token); }
  };

  if (denied) return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#0a0612] p-8 text-center">
      <AlertTriangle className="w-16 h-16 text-destructive mb-4" />
      <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
    </div>
  );

  if (!ready || loading && !allLoaded) return (
    <div className="min-h-[100dvh] bg-[#0a0612] flex flex-col">
      <div className="px-4 py-3 flex items-center gap-3 border-b border-white/8">
        <button onClick={() => navigate(-1 as unknown as string)} className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center text-zinc-400">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="h-4 w-32 rounded bg-white/10 animate-pulse" />
      </div>
      <div className="p-4 flex flex-col gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-white/5 animate-pulse" />)}
      </div>
    </div>
  );

  const backUrl = `/286c81443d1fb388d1b9a8e3b280824c/user_management`;

  const SECTION_TABS: { key: Section; label: string; icon: React.ElementType; count?: number }[] = [
    { key: "profile", label: "Profile", icon: User },
    { key: "wallet", label: "Wallet", icon: Wallet },
    { key: "tournaments", label: "Matches", icon: Trophy, count: tournaments.length },
    { key: "notifications", label: "Notifs", icon: Bell, count: notifs.filter(n => !n.read).length || undefined },
    ...(user?.uid ? [{ key: "ffstats" as Section, label: "FF Stats", icon: Swords }] : []),
    { key: "logs", label: "Logs", icon: ScrollText, count: logs.length || undefined },
    { key: "chat", label: "Chat", icon: MessageCircle, count: chatMessages.filter(m => !m.isFromAdmin && !m.readByUser).length || undefined },
    { key: "withdrawals" as Section, label: "Withdraw", icon: Banknote, count: withdrawals.filter(w => w.status === "pending").length || undefined },
    { key: "payments" as Section, label: "Payments", icon: CreditCard },
    { key: "comms" as Section, label: "Comms", icon: MessageSquare },
    { key: "achievements" as Section, label: "Awards", icon: Award, count: achievements.filter(a => a.isUnlocked).length || undefined },
  ];

  return (
    <div className="min-h-[100dvh] bg-[#0a0612] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-white/8" style={{ background: "rgba(10,6,18,0.96)", backdropFilter: "blur(16px)" }}>
        <div className="px-3 py-2.5 flex items-center gap-2.5">
          {/* Back */}
          <button
            onClick={() => window.history.back()}
            className="w-8 h-8 rounded-xl hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-xl overflow-hidden bg-white/10 flex items-center justify-center"
              style={{ border: "1.5px solid rgba(255,255,255,0.08)" }}>
              {user?.profilePicture
                ? <CachedImg src={user.profilePicture.startsWith("/api/") || user.profilePicture.startsWith("http") ? user.profilePicture : `/api/storage${user.profilePicture}`} alt="" className="w-full h-full object-cover"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                : <span className="text-sm font-bold text-white/40">
                    {(user?.inGameName?.[0] ?? user?.phone?.[0] ?? "U").toUpperCase()}
                  </span>
              }
            </div>
            <span className={cn(
              "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-[2px] border-[#0a0612]",
              user?.isOnline ? "bg-emerald-400" : "bg-zinc-600"
            )} />
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-white leading-tight truncate max-w-[120px]">
                {user?.inGameName ?? "User"}
              </span>
              {user?.isAdmin && <Crown className="w-3 h-3 text-primary shrink-0" />}
              {user?.status === "blocked" && (
                <span className="text-[9px] font-black text-orange-300 bg-orange-500/20 px-1.5 py-0.5 rounded-full border border-orange-500/30 shrink-0">BLOCKED</span>
              )}
              {user?.status === "deleted" && (
                <span className="text-[9px] font-black text-red-300 bg-red-500/20 px-1.5 py-0.5 rounded-full border border-red-500/30 shrink-0">BIN</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-zinc-500 font-mono truncate">{user?.phone}</span>
              {user && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-cyan-300 shrink-0">
                  <Gem className="w-2.5 h-2.5" />{user.diamondBalance.toLocaleString()}
                </span>
              )}
              {user?.isOnline && (
                <span className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-400 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Online
                </span>
              )}
            </div>
          </div>

          {/* Refresh */}
          <button
            onClick={() => loadAll(token)}
            disabled={loading}
            className="w-8 h-8 rounded-xl hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors shrink-0"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>

        {/* Active section breadcrumb strip */}
        <div className="px-3 pb-2 flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">Section</span>
          <span className="text-[10px] text-zinc-600">/</span>
          <span className="text-[10px] font-bold text-primary capitalize">
            {SECTION_TABS.find(t => t.key === section)?.label ?? section}
          </span>
        </div>
      </div>

      {/* Body: left sidebar + right scrollable content */}
      <div className="flex flex-1 min-h-0">

        {/* ── Left Sidebar Nav ── */}
        {(() => {
          const ffStatsUrl = `/286c81443d1fb388d1b9a8e3b280824c/user_management/${encodeURIComponent(params.phone ?? "")}/${userId}/ff-stats`;
          return (
            <nav
              className="w-[58px] shrink-0 flex flex-col overflow-y-auto py-2 gap-0.5"
              style={{
                background: "rgba(6,3,12,0.9)",
                borderRight: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {SECTION_TABS.map(tab => {
                const isFFStats = tab.key === "ffstats";
                const isActive = !isFFStats && section === tab.key;
                const hasBadge = !isFFStats && tab.count !== undefined && tab.count > 0;
                return (
                  <button
                    key={tab.key}
                    onClick={() => isFFStats ? navigate(ffStatsUrl) : setSection(tab.key)}
                    className="relative flex flex-col items-center justify-center gap-1 py-2 mx-1.5 rounded-xl transition-all"
                    style={{
                      background: isActive
                        ? "linear-gradient(135deg, rgba(168,85,247,0.18) 0%, rgba(168,85,247,0.08) 100%)"
                        : "transparent",
                      border: isActive ? "1px solid rgba(168,85,247,0.2)" : "1px solid transparent",
                    }}
                  >
                    {/* Active glow dot */}
                    {isActive && (
                      <span
                        className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                        style={{ background: "var(--primary, #a855f7)", boxShadow: "0 0 4px rgba(168,85,247,0.8)" }}
                      />
                    )}

                    <span className="relative">
                      <tab.icon
                        className="w-[17px] h-[17px] transition-colors"
                        style={{
                          color: isFFStats ? "#fb923c"
                            : isActive ? "var(--primary, #a855f7)"
                            : "rgba(161,161,170,0.55)",
                          filter: isActive ? "drop-shadow(0 0 4px rgba(168,85,247,0.5))" : "none",
                        }}
                      />
                      {hasBadge && (
                        <span
                          className="absolute -top-1 -right-1.5 min-w-[13px] h-[13px] flex items-center justify-center rounded-full text-[7px] font-black leading-none px-[3px]"
                          style={{
                            background: isActive ? "var(--primary, #a855f7)" : "rgba(100,100,100,0.8)",
                            color: "#fff",
                            boxShadow: isActive ? "0 0 6px rgba(168,85,247,0.6)" : "none",
                          }}
                        >
                          {tab.count! > 99 ? "99+" : tab.count}
                        </span>
                      )}
                    </span>

                    <span
                      className="text-[7.5px] font-bold leading-none tracking-wide text-center px-0.5"
                      style={{
                        color: isFFStats ? "#fb923c"
                          : isActive ? "var(--primary, #a855f7)"
                          : "rgba(113,113,122,0.7)",
                      }}
                    >
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </nav>
          );
        })()}

        {/* ── Right: scrollable content ── */}
        <div className="flex-1 overflow-y-auto">

        {/* ── Hero user card (profile section only) ── */}
        {user && section === "profile" && (
        <div className="px-4 pt-4 pb-2">
          <div className="rounded-3xl overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {/* Top row: avatar + name + badges */}
            <div className="px-4 pt-4 pb-3 flex items-start gap-4">
              <div className="relative shrink-0">
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white/10 flex items-center justify-center">
                  {user.profilePicture
                    ? <CachedImg src={user.profilePicture.startsWith("/api/") || user.profilePicture.startsWith("http") ? user.profilePicture : `/api/storage${user.profilePicture}`} alt="" className="w-full h-full object-cover"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "flex"); }} />
                    : null}
                  <span className={cn("text-2xl font-bold text-white/40", user.profilePicture ? "hidden" : "flex")}>
                    {(user.inGameName?.[0] ?? user.phone[0]).toUpperCase()}
                  </span>
                </div>
                <span className={cn(
                  "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#0a0612]",
                  user.isOnline ? "bg-emerald-400" : "bg-zinc-600"
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-bold text-white leading-tight">{user.inGameName ?? "No IGN"}</span>
                  {user.isAdmin && <Crown className="w-4 h-4 text-primary shrink-0" />}
                </div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {user.status === "blocked" && <span className="flex items-center gap-1 text-[10px] font-bold text-orange-300 bg-orange-500/20 px-2 py-0.5 rounded-full border border-orange-500/30"><Ban className="w-2.5 h-2.5" />BLOCKED</span>}
                  {user.status === "deleted" && <span className="flex items-center gap-1 text-[10px] font-bold text-red-300 bg-red-500/20 px-2 py-0.5 rounded-full border border-red-500/30"><ArchiveX className="w-2.5 h-2.5" />BIN</span>}

                  {user.isOnline
                    ? <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/25">
                        <Wifi className="w-2.5 h-2.5" /> Online now
                      </span>
                    : <span className="flex items-center gap-1 text-[10px] font-bold text-zinc-500 bg-zinc-500/10 px-2 py-0.5 rounded-full border border-zinc-500/20">
                        <WifiOff className="w-2.5 h-2.5" />
                        {user.lastSeenAt ? `Last seen ${fmtRelative(user.lastSeenAt)}` : "Never online"}
                      </span>
                  }
                </div>
              </div>
            </div>

            {/* Info grid */}
            <div className="mx-4 mb-4 rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
              {[
                { icon: <Phone className="w-3.5 h-3.5 text-blue-400" />, label: "Login ID", value: user.phone },
                { icon: <Hash className="w-3.5 h-3.5 text-primary" />, label: "Platform ID", value: user.platformId ?? `#${user.id}` },
                ...(user.contactPhone ? [{ icon: <Phone className="w-3.5 h-3.5 text-emerald-400" />, label: "Contact Phone", value: user.contactPhone }] : []),
                {
                  icon: user.isVerified
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    : <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
                  label: "Verified",
                  value: user.isVerified
                    ? <span className="text-emerald-400 font-semibold">Verified{user.verifiedAt ? ` · ${fmtDate(user.verifiedAt)}` : ""}</span>
                    : <span className="text-amber-400 font-medium">Unverified</span>,
                },
                { icon: <Gem className="w-3.5 h-3.5 text-violet-400" />, label: "Diamond Balance", value: <span className="flex items-center gap-1">{user.diamondBalance.toLocaleString()} <Gem className="w-3 h-3 text-violet-400" /></span> },
                { icon: <Calendar className="w-3.5 h-3.5 text-emerald-400" />, label: "Registered", value: fmtDateTime(user.createdAt) },
                {
                  icon: <Clock className="w-3.5 h-3.5 text-zinc-500" />,
                  label: "Last Seen",
                  value: user.isOnline ? "Online right now" : (user.lastSeenAt ? fmtRelative(user.lastSeenAt) + " · " + fmtDateTime(user.lastSeenAt) : "Never"),
                },
              ].map((row, i, arr) => (
                <div key={i} className={cn("flex items-center gap-3 px-3 py-2.5", i < arr.length - 1 ? "border-b border-white/5" : "")}
                  style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent" }}>
                  <div className="shrink-0">{row.icon}</div>
                  <span className="text-[10px] text-zinc-600 w-28 shrink-0 uppercase tracking-wider font-bold">{row.label}</span>
                  <span className="text-xs text-white font-mono flex items-center gap-1 min-w-0">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="px-4 pb-8">

        {/* ── PROFILE SECTION ── */}
        {section === "profile" && user && (
          <div className="flex flex-col gap-3 pt-2">
            {user.status === "blocked" && (
              <div className="rounded-2xl p-3 border border-orange-500/20 bg-orange-500/5 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-orange-400 font-bold text-xs"><Ban className="w-4 h-4" />Account Blocked</div>
                {user.blockedReason && <p className="text-xs text-orange-300/80">{user.blockedReason}</p>}
                {user.blockedAt && <p className="text-[10px] text-zinc-600">Since {fmtDateTime(user.blockedAt)}{user.blockedUntil ? ` · Until ${fmtDate(user.blockedUntil)}` : " (indefinite)"}</p>}
              </div>
            )}
            {user.status === "deleted" && (
              <div className="rounded-2xl p-3 border border-red-500/20 bg-red-500/5 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-red-400 font-bold text-xs"><ArchiveX className="w-4 h-4" />In Bin (soft deleted)</div>
                {user.deleteReason && <p className="text-xs text-red-300/80">{user.deleteReason}</p>}
                {user.deletedAt && <p className="text-[10px] text-zinc-600">Deleted {fmtDateTime(user.deletedAt)}</p>}
              </div>
            )}

            {/* Identity */}
            {(() => {
              const rows: { label: string; value: string; mono?: boolean; dim?: boolean }[] = [
                { label: "Login ID", value: user.phone, mono: true },
                { label: "Platform ID", value: user.platformId ?? `#${user.id}`, mono: true },
                { label: "Nickname", value: user.inGameName ?? "—" },
                { label: "Contact Phone", value: user.contactPhone ?? "—", mono: true },
                { label: "Account ID", value: `#${user.id}`, mono: true },
              ];
              return (
                <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="px-4 py-2 border-b border-white/8 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Identity</div>
                  {rows.map((r, i) => (
                    <div key={r.label} className={cn("px-4 py-2.5 flex items-center justify-between gap-3", i < rows.length - 1 ? "border-b border-white/5" : "")}>
                      <span className="text-[11px] text-zinc-500 shrink-0 w-28">{r.label}</span>
                      <span className={cn("text-xs text-right break-all", r.mono ? "font-mono text-zinc-300" : "font-medium text-white", r.dim && "text-zinc-600")}>{r.value}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Verification Card */}
            {(() => {
              const isVerified = localVerified !== null ? localVerified : user.isVerified;
              const verifiedAt = localVerifiedAt !== null ? localVerifiedAt : user.verifiedAt;

              async function handleVerify() {
                setVerifyLoading(true);
                try {
                  await doAction(`/admin/users/${userId}/${isVerified ? "unverify" : "verify"}`, "POST");
                  setLocalVerified(!isVerified);
                  setLocalVerifiedAt(isVerified ? null : new Date().toISOString());
                  toast({ title: isVerified ? "Verification removed" : "Account verified", description: isVerified ? "This account is now unverified." : "Account marked as manually verified." });
                } catch { toast({ title: "Error", description: "Action failed. Try again.", variant: "destructive" }); }
                finally { setVerifyLoading(false); }
              }

              return (
                <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${isVerified ? "rgba(52,211,153,0.2)" : "rgba(245,158,11,0.2)"}` }}>
                  <div className={cn("px-4 py-2 border-b text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5", isVerified ? "border-emerald-500/20 text-emerald-500" : "border-amber-500/20 text-amber-500")}>
                    {isVerified ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
                    Account Verification
                  </div>
                  <div className="px-4 py-3 flex flex-col gap-3" style={{ background: isVerified ? "rgba(52,211,153,0.03)" : "rgba(245,158,11,0.03)" }}>
                    <div className="flex items-start gap-3">
                      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", isVerified ? "bg-emerald-500/15 border border-emerald-500/20" : "bg-amber-500/10 border border-amber-500/20")}>
                        {isVerified ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <ShieldOff className="w-4 h-4 text-amber-400" />}
                      </div>
                      <div>
                        <p className={cn("text-sm font-semibold", isVerified ? "text-emerald-400" : "text-amber-400")}>
                          {isVerified ? "Verified Account" : "Not Verified"}
                        </p>
                        {isVerified && verifiedAt && (
                          <p className="text-[11px] text-zinc-500 mt-0.5">Verified on {fmtDateTime(verifiedAt)}</p>
                        )}
                        {!isVerified && user.contactPhone && (
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            Contact: <span className="font-mono text-white">{user.contactPhone}</span>
                          </p>
                        )}
                        {!isVerified && !user.contactPhone && (
                          <p className="text-[11px] text-zinc-600 mt-0.5">No contact phone provided</p>
                        )}
                      </div>
                    </div>

                    {user.contactPhone && (
                      <div className="rounded-xl px-3 py-2 border border-white/8 flex items-center gap-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                        <Phone className="w-3.5 h-3.5 text-zinc-400" />
                        <div>
                          <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Contact Phone</p>
                          <p className="text-sm font-mono text-white">{user.contactPhone}</p>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleVerify}
                      disabled={verifyLoading}
                      className={cn(
                        "w-full h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-60",
                        isVerified
                          ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10"
                          : "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/25"
                      )}
                    >
                      {verifyLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : localVerified ? (
                        <><ShieldOff className="w-3.5 h-3.5" />Remove Verification</>
                      ) : (
                        <><CheckCircle2 className="w-3.5 h-3.5" />Mark as Verified</>
                      )}
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Name Change Status */}
            {(() => {
              const NAME_COOLDOWN_MS = 12 * 24 * 60 * 60 * 1000;
              const changedAt = user.nameChangedAt ? new Date(user.nameChangedAt).getTime() : null;
              const remaining = changedAt ? NAME_COOLDOWN_MS - (Date.now() - changedAt) : 0;
              const inCooldown = remaining > 0 && !user.nameChangeAllowed;
              const daysLeft = inCooldown ? Math.ceil(remaining / (24 * 60 * 60 * 1000)) : 0;

              async function handleAllowNameChange() {
                setAllowNameChangeLoading(true);
                try {
                  await doAction(`/admin/users/${userId}/allow-name-change`, "POST");
                  toast({ title: "Name change unlocked", description: "User can now update their name." });
                } finally { setAllowNameChangeLoading(false); }
              }

              return (
                <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="px-4 py-2 border-b border-white/8 text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5" />Name Change
                  </div>
                  <div className="px-4 py-3 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-zinc-500">Last changed</span>
                      <span className="text-xs text-zinc-300">{user.nameChangedAt ? new Date(user.nameChangedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Never"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-zinc-500">Status</span>
                      {inCooldown ? (
                        <span className="text-xs text-amber-400 font-medium">Locked · {daysLeft}d remaining</span>
                      ) : user.nameChangeAllowed ? (
                        <span className="text-xs text-emerald-400 font-medium">Override active</span>
                      ) : (
                        <span className="text-xs text-emerald-400 font-medium">Available</span>
                      )}
                    </div>
                    {(inCooldown || !user.nameChangeAllowed) && (
                      <button
                        onClick={handleAllowNameChange}
                        disabled={allowNameChangeLoading || user.nameChangeAllowed}
                        className="w-full flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold border border-emerald-500/30 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                      >
                        {allowNameChangeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                        {user.nameChangeAllowed ? "Already Unlocked" : "Allow Name Change"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Account Overview */}
            {(() => {
              const age = (() => {
                const days = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000);
                if (days < 1) return "Today";
                if (days < 30) return `${days}d`;
                if (days < 365) return `${Math.floor(days / 30)}mo`;
                const y = Math.floor(days / 365), m = Math.floor((days % 365) / 30);
                return m > 0 ? `${y}y ${m}mo` : `${y}yr`;
              })();
              const lastActive = user.lastSeenAt ? fmtRelative(user.lastSeenAt) : "Never";
              const latest = devices[0] ?? null;
              const deviceLabel = latest?.appVersion ?? (latest?.userAgent ? latest.userAgent.slice(0, 30) + "…" : "No data yet");
              const deviceTypeLabel = latest?.deviceType ? latest.deviceType.charAt(0).toUpperCase() + latest.deviceType.slice(1) : null;
              const androidLabel = latest?.androidVersion ? `Android ${latest.androidVersion}` : null;
              const platformLabel = [deviceTypeLabel, androidLabel].filter(Boolean).join(" · ") || "—";
              const ipLabel = latest?.ip ?? "No data yet";
              const uniqueIps = [...new Set(devices.map(d => d.ip).filter(Boolean))];
              const ipCount = uniqueIps.length;
              const rows: { label: string; value: string; mono?: boolean; dim?: boolean; color?: string; warn?: boolean }[] = [
                { label: "Account Age", value: age },
                { label: "Joined", value: fmtDate(user.createdAt) },
                { label: "Last Active", value: lastActive, color: user.isOnline ? "text-emerald-400" : undefined },
                { label: "Last IP", value: ipLabel, mono: !!latest?.ip, dim: !latest?.ip },
                { label: "IP Count", value: ipCount > 0 ? `${ipCount} unique IP${ipCount !== 1 ? "s" : ""}` : "—", dim: ipCount === 0, warn: ipCount > 5 },
                { label: "Platform", value: platformLabel, dim: !latest },
                { label: "Browser/App", value: deviceLabel, dim: !latest?.appVersion && !latest?.userAgent },
                { label: "Network", value: latest?.networkType ?? "—", dim: !latest?.networkType },
                { label: "Country", value: latest?.country ?? "—", dim: !latest?.country },
                { label: "Region", value: latest?.region ?? "—", dim: !latest?.region },
                { label: "Language", value: latest?.language ?? "—", dim: !latest?.language },
                { label: "Emulator", value: latest ? (latest.isEmulator ? `Detected (${latest.emulatorSignals ?? ""})` : "Clean") : "—", color: latest?.isEmulator ? "text-red-400" : latest ? "text-emerald-400" : undefined, dim: !latest },
              ];
              return (
                <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="px-4 py-2 border-b border-white/8 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Account Overview</div>
                  {rows.map((r, i) => (
                    <div key={r.label} className={cn("px-4 py-2.5 flex items-center justify-between gap-3", i < rows.length - 1 ? "border-b border-white/5" : "")}>
                      <span className="text-[11px] text-zinc-500 shrink-0 w-28">{r.label}</span>
                      <span className={cn("text-xs text-right break-all", r.mono ? "font-mono" : "font-medium", r.dim ? "text-zinc-600" : r.warn ? "text-orange-400" : r.color ? r.color : "text-white")}>{r.value}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Gaming Stats */}
            {(() => {
              const wins = tournaments.filter(t => t.placement === 1).length;
              const losses = tournaments.filter(t => t.placement !== null && t.placement !== 1).length;
              const totalKills = tournaments.reduce((s, t) => s + t.kills, 0);
              const totalEarnings = wallet.filter(t => t.type === "prize").reduce((s, t) => s + t.amount, 0);
              const totalSpent = wallet.filter(t => t.type === "entry").reduce((s, t) => s + Math.abs(t.amount), 0);
              const stats = [
                { label: "Matches", value: String(tournaments.length), color: "text-white" },
                { label: "Wins", value: String(wins), color: "text-emerald-400" },
                { label: "Losses", value: String(losses), color: "text-red-400" },
                { label: "Total Kills", value: String(totalKills), color: "text-orange-400" },
                { label: "Earnings", value: `${totalEarnings}`, color: "text-yellow-400" },
                { label: "Balance", value: String(user.diamondBalance), color: "text-cyan-300" },
              ];
              return (
                <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="px-4 py-2 border-b border-white/8 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Gaming Stats</div>
                  <div className="p-3 grid grid-cols-3 gap-2">
                    {stats.map(s => (
                      <div key={s.label} className="rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
                        <div className={cn("text-base font-bold leading-tight", s.color)}>{s.value}</div>
                        <div className="text-[9px] text-zinc-600 mt-0.5 uppercase tracking-wider">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[11px] text-zinc-500">Total Spent (entries)</span>
                    <span className="text-xs font-mono text-red-400 flex items-center gap-1">{totalSpent} <Gem className="w-3 h-3" /></span>
                  </div>
                </div>
              );
            })()}

            {/* Safety */}
            {(() => {
              const rows: { label: string; value: string; dim?: boolean; color?: string }[] = [
                { label: "Fraud Flags", value: "None detected", color: "text-emerald-400" },
                { label: "Dispute History", value: "Not tracked", dim: true },
              ];
              return (
                <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="px-4 py-2 border-b border-white/8 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Safety</div>
                  {rows.map((r, i) => (
                    <div key={r.label} className={cn("px-4 py-2.5 flex items-center justify-between gap-3", i < rows.length - 1 ? "border-b border-white/5" : "")}>
                      <span className="text-[11px] text-zinc-500 shrink-0 w-28">{r.label}</span>
                      <span className={cn("text-xs font-medium text-right", r.dim ? "text-zinc-600" : r.color ? r.color : "text-white")}>{r.value}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Devices & IP Tracking */}
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="px-4 py-2 border-b border-white/8 text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5" />Devices & IP ({devices.length})</span>
                {devices.some(d => d.isEmulator) && (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/25 text-red-300">Emulator Detected</span>
                )}
              </div>

              {devices.length === 0 ? (
                <div className="px-4 py-4 text-center">
                  <p className="text-xs text-zinc-600">No sessions recorded yet.</p>
                  <p className="text-[10px] text-zinc-700 mt-0.5">Data is collected on next login.</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {devices.map(d => {
                    const linked = d.fingerprint ? (linkedAccounts[d.fingerprint] ?? []) : [];
                    const isExpanded = expandedDevice === d.id;
                    const uaShort = d.userAgent
                      ? (() => {
                          const ua = d.userAgent;
                          if (/iPhone|iPad/.test(ua)) return "iOS Safari";
                          if (/Android/.test(ua) && /Chrome/.test(ua)) return "Android Chrome";
                          if (/Android/.test(ua)) return "Android Browser";
                          if (/Chrome/.test(ua)) return "Chrome";
                          if (/Firefox/.test(ua)) return "Firefox";
                          if (/Safari/.test(ua)) return "Safari";
                          return ua.slice(0, 24) + "…";
                        })()
                      : "Unknown";
                    return (
                      <div key={d.id}>
                        <button
                          className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/3 transition-colors"
                          onClick={() => setExpandedDevice(isExpanded ? null : d.id)}
                        >
                          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", d.isEmulator ? "bg-red-500/15" : "bg-white/6")}>
                            {/iPhone|iPad/.test(d.userAgent ?? "") || /Android/.test(d.userAgent ?? "")
                              ? <Smartphone className={cn("w-3.5 h-3.5", d.isEmulator ? "text-red-400" : "text-zinc-400")} />
                              : <Monitor className={cn("w-3.5 h-3.5", d.isEmulator ? "text-red-400" : "text-zinc-400")} />
                            }
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-white">{uaShort}</span>
                              {d.isEmulator && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 border border-red-500/20 text-red-300">Emulator</span>}
                              {linked.length > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/20 text-orange-300">{linked.length} linked</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-mono text-zinc-500">{d.ip ?? "no IP"}</span>
                              <span className="text-zinc-700">·</span>
                              <span className="text-[10px] text-zinc-600">{fmtRelative(d.lastSeenAt)}</span>
                            </div>
                          </div>
                          <ChevronDown className={cn("w-3.5 h-3.5 text-zinc-600 shrink-0 transition-transform", isExpanded && "rotate-180")} />
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-3 flex flex-col gap-2" style={{ background: "rgba(0,0,0,0.2)" }}>
                            <div className="rounded-xl overflow-hidden border border-white/6">
                              {[
                                { label: "IP Address",    value: d.ip ?? "—", mono: true },
                                { label: "Country",       value: d.country ?? "—" },
                                { label: "Region",        value: d.region ?? "—" },
                                { label: "Language",      value: d.language ?? "—" },
                                { label: "Device ID",     value: d.deviceId ? d.deviceId.slice(0, 20) + "…" : "—", mono: true },
                                { label: "Fingerprint",   value: d.fingerprint ? d.fingerprint.slice(0, 20) + "…" : "—", mono: true },
                                { label: "Device Type",   value: d.deviceType ? d.deviceType.charAt(0).toUpperCase() + d.deviceType.slice(1) : "—" },
                                { label: "Android Ver.",  value: d.androidVersion ? `Android ${d.androidVersion}` : "—" },
                                { label: "Browser/App",   value: d.appVersion ?? "—" },
                                { label: "Network",       value: d.networkType ?? "—" },
                                { label: "Emulator",      value: d.isEmulator ? `Yes — ${d.emulatorSignals ?? ""}` : "No", color: d.isEmulator ? "text-red-400" : "text-emerald-400" },
                                { label: "First seen",    value: fmtDateTime(d.createdAt) },
                                { label: "Last seen",     value: fmtDateTime(d.lastSeenAt) },
                              ].map((row, i, arr) => (
                                <div key={row.label} className={cn("px-3 py-2 flex items-center justify-between gap-3", i < arr.length - 1 ? "border-b border-white/5" : "")}>
                                  <span className="text-[10px] text-zinc-600 shrink-0 w-20">{row.label}</span>
                                  <span className={cn("text-[11px] text-right break-all", row.mono ? "font-mono text-zinc-400" : "", row.color ?? "text-white")}>{row.value}</span>
                                </div>
                              ))}
                            </div>

                            {linked.length > 0 && (
                              <div className="rounded-xl border border-orange-500/20 overflow-hidden" style={{ background: "rgba(249,115,22,0.05)" }}>
                                <div className="px-3 py-1.5 border-b border-orange-500/15 text-[10px] font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />Same Device — Other Accounts
                                </div>
                                {linked.map((acc, i) => (
                                  <button
                                    key={acc.id}
                                    className={cn("w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors", i < linked.length - 1 ? "border-b border-orange-500/10" : "")}
                                    onClick={() => navigate(`/286c81443d1fb388d1b9a8e3b280824c/user_management/${encodeURIComponent(acc.phone)}/${acc.id}`)}
                                  >
                                    <div className="text-left">
                                      <div className="text-xs font-medium text-orange-200">{acc.inGameName ?? acc.phone}</div>
                                      <div className="text-[10px] font-mono text-orange-400/60">{acc.phone}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full border font-bold",
                                        acc.status === "active" ? "bg-emerald-500/15 border-emerald-500/20 text-emerald-300" :
                                        acc.status === "blocked" ? "bg-red-500/15 border-red-500/20 text-red-300" :
                                        "bg-white/8 border-white/10 text-zinc-400"
                                      )}>{acc.status}</span>
                                      <ChevronDown className="w-3 h-3 text-orange-400/50 -rotate-90" />
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Login History */}
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="px-4 py-2 border-b border-white/8 text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Login History ({loginHistory.length})</span>
                {loginHistory.some(l => l.isNewUser) && (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-300">Has New-User Entry</span>
                )}
              </div>
              {loginHistory.length === 0 ? (
                <div className="px-4 py-4 text-center">
                  <p className="text-xs text-zinc-600">No login events recorded yet.</p>
                  <p className="text-[10px] text-zinc-700 mt-0.5">Captured on next successful login.</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {loginHistory.map((l, i) => {
                    const methodLabel = l.method === "2fa" ? "2FA" : l.method === "otp" ? "OTP" : l.method.toUpperCase();
                    const methodColor = l.method === "2fa" ? "text-purple-400 bg-purple-500/15 border-purple-500/20" : "text-emerald-400 bg-emerald-500/15 border-emerald-500/20";
                    const uaShort = l.userAgent
                      ? (() => {
                          const ua = l.userAgent;
                          if (/iPhone|iPad/.test(ua)) return "iOS";
                          if (/Android/.test(ua) && /Chrome/.test(ua)) return "Android · Chrome";
                          if (/Android/.test(ua)) return "Android";
                          if (/Chrome/.test(ua)) return "Chrome";
                          if (/Firefox/.test(ua)) return "Firefox";
                          if (/Safari/.test(ua)) return "Safari";
                          return ua.slice(0, 22) + "…";
                        })()
                      : "Unknown";
                    const loc = [l.region, l.country].filter(Boolean).join(", ") || (l.ip ? "IP only" : "—");
                    return (
                      <div key={l.id} className={cn("px-4 py-2.5 flex items-start gap-3", i % 2 === 0 ? "" : "bg-white/[0.01]")}>
                        <div className="w-7 h-7 rounded-lg bg-white/6 flex items-center justify-center shrink-0 mt-0.5">
                          <Activity className="w-3.5 h-3.5 text-zinc-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full border", methodColor)}>{methodLabel}</span>
                            {l.isNewUser && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-orange-500/15 border-orange-500/20 text-orange-300">New Account</span>}
                            <span className="text-[10px] text-zinc-500 font-mono">{l.ip ?? "no IP"}</span>
                            {l.country && <span className="text-[10px] text-zinc-600">{loc}</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-zinc-600">{uaShort}</span>
                            <span className="text-zinc-700">·</span>
                            <span className="text-[10px] text-zinc-700">{fmtDateTime(l.createdAt)}</span>
                          </div>
                          {l.fingerprint && (
                            <div className="mt-0.5 font-mono text-[9px] text-zinc-700 truncate">fp: {l.fingerprint}</div>
                          )}
                        </div>
                        <span className="text-[9px] text-zinc-700 shrink-0 mt-1">{fmtRelative(l.createdAt)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Theme */}
            {(() => {
              const THEME_META: Record<string, { name: string; bg: string; primary: string; secondary: string; isSystem?: boolean }> = {
                molten:  { name: "Molten Volcanic",  bg: "#020202", primary: "#ea580c", secondary: "#1c0a02" },
                dark:    { name: "Dark",              bg: "#0e0e12", primary: "#a0a0b8", secondary: "#1a1a22" },
                light:   { name: "Light",             bg: "#f8f8fa", primary: "#1f1f2e", secondary: "#ebebf2" },
                system:  { name: "System",            bg: "#f8f8fa", primary: "#1f1f2e", secondary: "#0e0e12", isSystem: true },
                glass:   { name: "Glass Morphism",   bg: "#060612", primary: "#38bdf8", secondary: "#0d0d1e" },
                neon:    { name: "Neon Cyber",        bg: "#06040a", primary: "#00ffff", secondary: "#c026d3" },
                forest:  { name: "Forest Night",     bg: "#040a06", primary: "#d97706", secondary: "#0a1a0d" },
                royal:   { name: "Royal Gold",       bg: "#060812", primary: "#eab308", secondary: "#0d1022" },
              };
              const effectiveThemeKey = user.theme ?? "molten";
              const t = THEME_META[effectiveThemeKey] ?? THEME_META["molten"];
              const isDefault = !user.theme;
              return (
                <div className="rounded-2xl p-3.5 bg-white/4 border border-white/8 flex items-center gap-3">
                  {t.isSystem ? (
                    <div className="w-10 h-10 rounded-xl overflow-hidden flex shrink-0">
                      <div className="flex-1 bg-[#f8f8fa]" /><div className="flex-1 bg-[#0e0e12]" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-xl overflow-hidden relative shrink-0" style={{ background: t.bg }}>
                      <div className="absolute bottom-1.5 left-1.5 w-3 h-3 rounded-md" style={{ background: t.primary }} />
                      <div className="absolute bottom-1.5 left-6 w-3 h-3 rounded-md opacity-70" style={{ background: t.secondary }} />
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">App Theme</div>
                    <div className="text-sm font-semibold text-white mt-0.5">{t.name}</div>
                    {isDefault && <div className="text-[10px] text-zinc-600 mt-0.5">default</div>}
                  </div>
                </div>
              );
            })()}

            {/* 2FA */}
            <div className={`rounded-2xl p-3.5 border flex flex-col gap-2 ${user.twoFaEnabled ? "bg-emerald-500/5 border-emerald-500/20" : "bg-white/4 border-white/8"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`w-4 h-4 ${user.twoFaEnabled ? "text-emerald-400" : user.twoFaPending ? "text-amber-400" : "text-zinc-500"}`} />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Two-Factor Auth</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${user.twoFaEnabled ? "bg-emerald-500/15 border border-emerald-500/25 text-emerald-300" : user.twoFaPending ? "bg-amber-500/15 border border-amber-500/25 text-amber-300" : "bg-white/5 border border-white/10 text-zinc-500"}`}>
                  {user.twoFaEnabled ? "Enabled" : user.twoFaPending ? "Pending Approval" : "Disabled"}
                </span>
              </div>
              {user.twoFaEnabled && user.twoFaPassword && (
                <div className="flex flex-col gap-1.5 mt-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500 w-16 shrink-0">Passcode</span>
                    <span className="text-xs font-mono text-white bg-black/30 rounded-lg px-2.5 py-1 flex-1 break-all">{user.twoFaPassword}</span>
                  </div>
                </div>
              )}
              {user.twoFaPending && (
                <TwoFaPendingCard userId={user.id} autoApproveAt={user.twoFaAutoApproveAt} onAction={(updated) => setUser(u => u ? { ...u, ...updated } : u)} />
              )}
              {/* 24h withdrawal block */}
              {(() => {
                if (!user.twoFaResetAt) return null;
                const elapsed = Date.now() - new Date(user.twoFaResetAt).getTime();
                const blockMs = 24 * 60 * 60 * 1000;
                if (elapsed >= blockMs) return null;
                const expiresAt = new Date(new Date(user.twoFaResetAt).getTime() + blockMs).toISOString();
                const hoursLeft = Math.ceil((blockMs - elapsed) / 3600000);
                return (
                  <div className="flex flex-col gap-1.5 mt-1 p-2.5 rounded-xl bg-red-500/8 border border-red-500/20">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Withdrawal Block Active</span>
                      <span className="text-[10px] text-red-400/70 font-mono">{hoursLeft}h left</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-relaxed">Passcode changed — withdrawals blocked until {new Date(expiresAt).toLocaleString()}</p>
                    {!user.twoFaWithdrawalBypass ? (
                      <button
                        disabled={allow2faWithdrawLoading}
                        onClick={async () => {
                          setAllow2faWithdrawLoading(true);
                          try {
                            const r = await fetch(`/api/admin/users/${user.id}/allow-2fa-withdrawal`, { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("clash-ren:token")}` } });
                            if (!r.ok) throw new Error("Failed");
                            setUser(u => u ? { ...u, twoFaWithdrawalBypass: true } : u);
                            toast({ title: "Withdrawal Unblocked", description: "User can now withdraw despite recent passcode change." });
                          } catch { toast({ title: "Error", description: "Failed to allow withdrawal.", variant: "destructive" }); }
                          finally { setAllow2faWithdrawLoading(false); }
                        }}
                        className="mt-0.5 w-full h-7 rounded-lg text-[11px] font-bold bg-red-500/20 border border-red-500/30 text-red-300 active:bg-red-500/30 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
                        {allow2faWithdrawLoading ? <div className="w-3 h-3 rounded-full border-2 border-red-300/30 border-t-red-300 animate-spin" /> : "Allow Withdrawal Now"}
                      </button>
                    ) : (
                      <span className="text-[10px] text-emerald-400 font-bold">✓ Bypass active — withdrawal allowed</span>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* ACTIONS */}
            <div className="rounded-2xl overflow-hidden border border-white/8 bg-white/3">
              <div className="px-4 py-2 border-b border-white/8 text-xs font-bold text-zinc-400 uppercase tracking-wider">Admin Actions</div>

              {/* Diamonds */}
              <div className="px-4 py-3 border-b border-white/5">
                <button className="flex items-center justify-between w-full" onClick={() => setShowDiamondForm(v => !v)}>
                  <div className="flex items-center gap-2 text-sm font-bold text-white"><Gem className="w-4 h-4 text-cyan-400" />Adjust Diamonds</div>
                  {showDiamondForm ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                </button>
                {showDiamondForm && (
                  <div className="mt-3 flex flex-col gap-2.5">
                    <p className="text-[11px] text-zinc-500 flex items-center gap-1">
                      Current balance: <span className="text-cyan-300 font-bold flex items-center gap-0.5">{user.diamondBalance} <Gem className="w-3 h-3 text-cyan-400" /></span>
                    </p>
                    <input
                      type="number"
                      min="1"
                      value={diamondAmount}
                      onChange={e => setDiamondAmount(e.target.value)}
                      placeholder="Amount (e.g. 100)"
                      className="w-full rounded-xl bg-black/50 border border-white/15 text-white text-sm px-3 py-2 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleDiamonds("add")}
                        disabled={actionLoading || !diamondAmount}
                        className="flex items-center justify-center gap-1.5 rounded-xl py-2 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-bold text-sm hover:bg-emerald-500/30 disabled:opacity-50 transition-colors">
                        <ArrowDownLeft className="w-3.5 h-3.5" />Add
                      </button>
                      <button
                        onClick={() => handleDiamonds("deduct")}
                        disabled={actionLoading || !diamondAmount}
                        className="flex items-center justify-center gap-1.5 rounded-xl py-2 bg-red-500/20 border border-red-500/30 text-red-300 font-bold text-sm hover:bg-red-500/30 disabled:opacity-50 transition-colors">
                        <ArrowUpRight className="w-3.5 h-3.5" />Deduct
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-600">User receives a wallet notification automatically.</p>
                  </div>
                )}
              </div>

              {/* Force Logout All Devices */}
              <div className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <LogOut className="w-4 h-4 text-rose-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white">Force Logout All Devices</p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">Invalidates all active sessions immediately. User must log in again.</p>
                    </div>
                  </div>
                  <button
                    onClick={handleForceLogout}
                    disabled={forceLogoutLoading}
                    className="shrink-0 flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/25 text-rose-300 hover:bg-rose-500/25 disabled:opacity-50 transition-colors"
                  >
                    {forceLogoutLoading
                      ? <div className="w-3 h-3 rounded-full border-2 border-rose-300/30 border-t-rose-300 animate-spin" />
                      : <><LogOut className="w-3 h-3" /><span className="ml-0.5">Kick Now</span></>
                    }
                  </button>
                </div>
              </div>

            </div>

            {/* ── USER STATUS CONTROLS ── */}
            {(() => {
              type RestrictionDef = {
                key: string;
                label: string;
                icon: React.ReactNode;
                active: boolean;
                since: string | null;
                until?: string | null;
                supportsUntil: boolean;
                color: string;
              };
              const restrictions: RestrictionDef[] = [
                {
                  key: "tournament_ban",
                  label: "Tournament Ban",
                  icon: <Trophy className="w-4 h-4" />,
                  active: user.tournamentBanned,
                  since: user.tournamentBannedAt,
                  until: user.tournamentBannedUntil,
                  supportsUntil: true,
                  color: "text-orange-400",
                },
                {
                  key: "withdrawal_ban",
                  label: "Withdrawal Ban",
                  icon: <ArrowUpRight className="w-4 h-4" />,
                  active: user.withdrawalBanned,
                  since: user.withdrawalBannedAt,
                  until: null,
                  supportsUntil: false,
                  color: "text-amber-400",
                },
                {
                  key: "topup_ban",
                  label: "Top-up Ban",
                  icon: <ArrowDownLeft className="w-4 h-4" />,
                  active: user.topupBanned,
                  since: user.topupBannedAt,
                  until: null,
                  supportsUntil: false,
                  color: "text-yellow-400",
                },
                {
                  key: "chat_mute",
                  label: "Chat Mute",
                  icon: <MessageSquare className="w-4 h-4" />,
                  active: user.chatMuted,
                  since: user.chatMutedAt,
                  until: user.chatMutedUntil,
                  supportsUntil: true,
                  color: "text-purple-400",
                },
              ];

              return (
                <div className="rounded-2xl overflow-hidden border border-white/8 bg-white/3">
                  <div className="px-4 py-2 border-b border-white/8 text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                    <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                    User Status Controls
                  </div>

                  {/* ── Block Account (interactive) ── */}
                  <div className="px-4 py-3 border-b border-white/5 flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <span className={cn("shrink-0", user.status === "blocked" ? "text-orange-400" : "text-zinc-600")}><Ban className="w-4 h-4" /></span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white">Account Block</p>
                        {user.status === "blocked" ? (
                          <p className="text-[10px] text-orange-400 mt-0.5">
                            Active since {user.blockedAt ? fmtDate(user.blockedAt) : "—"}
                            {user.blockedUntil ? ` · until ${fmtDate(user.blockedUntil)}` : " · permanent"}
                          </p>
                        ) : (
                          <p className="text-[10px] text-zinc-600 mt-0.5">Not active</p>
                        )}
                      </div>
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0",
                        user.status === "blocked"
                          ? "bg-orange-500/15 border-orange-500/25 text-orange-300"
                          : "bg-white/5 border-white/10 text-zinc-600"
                      )}>
                        {user.status === "blocked" ? "Active" : "None"}
                      </span>
                    </div>
                    {user.status === "blocked" ? (
                      <button
                        onClick={handleUnblock}
                        disabled={actionLoading}
                        className="self-start flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
                      >
                        <Unlock className="w-3 h-3" />Unblock Account
                      </button>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => setShowBlockForm(v => !v)}
                          className="self-start flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-orange-500/15 border border-orange-500/25 text-orange-300 hover:bg-orange-500/25 transition-colors"
                        >
                          <Ban className="w-3 h-3" />Block Account
                          {showBlockForm ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
                        </button>
                        {showBlockForm && (
                          <div className="flex flex-col gap-2 p-3 rounded-xl bg-black/30 border border-white/8">
                            <textarea value={blockReason} onChange={e => setBlockReason(e.target.value)} placeholder="Reason for blocking (required)..." rows={2} className="rounded-lg bg-black/50 border border-white/15 text-white text-xs px-3 py-2 resize-none placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50" />
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Expires (leave blank for permanent)</label>
                              <input type="date" value={blockUntil} onChange={e => setBlockUntil(e.target.value)} className="rounded-lg bg-black/50 border border-white/15 text-white text-xs px-3 py-1.5 focus:outline-none focus:border-orange-500/50" />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => setShowBlockForm(false)} className="flex-1 rounded-lg py-1.5 bg-white/8 text-zinc-400 font-bold text-xs hover:bg-white/15 transition-colors">Cancel</button>
                              <button onClick={handleBlock} disabled={actionLoading || !blockReason.trim()} className="flex-1 rounded-lg py-1.5 bg-orange-500/20 border border-orange-500/30 text-orange-300 font-bold text-xs hover:bg-orange-500/30 disabled:opacity-50 transition-colors">Confirm</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Move to Bin / Restore (interactive) ── */}
                  <div className="px-4 py-3 border-b border-white/5 flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <span className={cn("shrink-0", user.status === "deleted" ? "text-red-400" : "text-zinc-600")}><ArchiveX className="w-4 h-4" /></span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white">Bin / Deletion</p>
                        {user.status === "deleted" ? (
                          <p className="text-[10px] text-red-400 mt-0.5">In bin · permanent deletion in 15 days</p>
                        ) : (
                          <p className="text-[10px] text-zinc-600 mt-0.5">Not in bin</p>
                        )}
                      </div>
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0",
                        user.status === "deleted"
                          ? "bg-red-500/15 border-red-500/25 text-red-300"
                          : "bg-white/5 border-white/10 text-zinc-600"
                      )}>
                        {user.status === "deleted" ? "Binned" : "None"}
                      </span>
                    </div>
                    {user.status === "deleted" ? (
                      <div className="flex gap-2">
                        <button
                          onClick={handleRestore}
                          disabled={actionLoading}
                          className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />Restore from Bin
                        </button>
                        {!confirmPermDelete ? (
                          <button
                            onClick={() => setConfirmPermDelete(true)}
                            className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/25 text-red-300 hover:bg-red-500/25 transition-colors"
                          >
                            <Trash className="w-3 h-3" />Delete Forever
                          </button>
                        ) : (
                          <div className="flex flex-col gap-2 flex-1 p-3 rounded-xl bg-red-500/8 border border-red-500/20">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                              <p className="text-[11px] text-red-400">Cannot be undone. All data erased forever.</p>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => setConfirmPermDelete(false)} className="flex-1 rounded-lg py-1.5 bg-white/8 text-zinc-400 font-bold text-xs hover:bg-white/15 transition-colors">Cancel</button>
                              <button onClick={handlePermDelete} disabled={actionLoading} className="flex-1 rounded-lg py-1.5 bg-red-500/20 border border-red-500/30 text-red-300 font-bold text-xs hover:bg-red-500/30 disabled:opacity-50 transition-colors">Confirm Delete</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => setShowBinForm(v => !v)}
                          className="self-start flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/25 text-red-300 hover:bg-red-500/25 transition-colors"
                        >
                          <ArchiveX className="w-3 h-3" />Move to Bin
                          {showBinForm ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
                        </button>
                        {showBinForm && (
                          <div className="flex flex-col gap-2 p-3 rounded-xl bg-black/30 border border-white/8">
                            <p className="text-[10px] text-zinc-500">Account will be permanently deleted after 15 days unless restored.</p>
                            <textarea value={binReason} onChange={e => setBinReason(e.target.value)} placeholder="Reason for deletion (required)..." rows={2} className="rounded-lg bg-black/50 border border-white/15 text-white text-xs px-3 py-2 resize-none placeholder:text-zinc-600 focus:outline-none focus:border-red-500/50" />
                            <div className="flex gap-2">
                              <button onClick={() => setShowBinForm(false)} className="flex-1 rounded-lg py-1.5 bg-white/8 text-zinc-400 font-bold text-xs hover:bg-white/15 transition-colors">Cancel</button>
                              <button onClick={handleBin} disabled={actionLoading || !binReason.trim()} className="flex-1 rounded-lg py-1.5 bg-red-500/20 border border-red-500/30 text-red-300 font-bold text-xs hover:bg-red-500/30 disabled:opacity-50 transition-colors">Confirm</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {restrictions.map((r, idx) => (
                    <div key={r.key} className={cn("px-4 py-3 flex flex-col gap-2", idx < restrictions.length - 1 ? "border-b border-white/5" : "")}>
                      <div className="flex items-center gap-3">
                        <span className={cn("shrink-0", r.active ? r.color : "text-zinc-600")}>{r.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white">{r.label}</p>
                          {r.active ? (
                            <p className={cn("text-[10px] mt-0.5", r.color)}>
                              Since {r.since ? fmtDate(r.since) : "—"}
                              {r.until ? ` · until ${fmtDate(r.until)}` : r.supportsUntil ? " · permanent" : ""}
                            </p>
                          ) : (
                            <p className="text-[10px] text-zinc-600 mt-0.5">Not active</p>
                          )}
                        </div>
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0",
                          r.active
                            ? "bg-red-500/15 border-red-500/25 text-red-300"
                            : "bg-white/5 border-white/10 text-zinc-600"
                        )}>
                          {r.active ? "Active" : "None"}
                        </span>
                      </div>

                      {r.active ? (
                        <button
                          onClick={() => handleRestrict(r.key, "lift")}
                          disabled={restrictLoading}
                          className="self-start flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
                        >
                          <CheckCircle className="w-3 h-3" />Lift Restriction
                        </button>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => setRestrictPanels(p => ({ ...p, [r.key]: !p[r.key] }))}
                            className="self-start flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/25 text-red-300 hover:bg-red-500/25 transition-colors"
                          >
                            <Ban className="w-3 h-3" />Apply Restriction
                            {restrictPanels[r.key] ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
                          </button>

                          {restrictPanels[r.key] && (
                            <div className="flex flex-col gap-2 p-3 rounded-xl bg-black/30 border border-white/8">
                              {r.supportsUntil && (
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Expires (leave blank for permanent)</label>
                                  <input
                                    type="date"
                                    value={restrictUntil[r.key] ?? ""}
                                    onChange={e => setRestrictUntil(p => ({ ...p, [r.key]: e.target.value }))}
                                    className="rounded-lg bg-black/50 border border-white/15 text-white text-xs px-3 py-1.5 focus:outline-none focus:border-red-500/50"
                                  />
                                </div>
                              )}
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setRestrictPanels(p => ({ ...p, [r.key]: false }))}
                                  className="flex-1 rounded-lg py-1.5 bg-white/8 text-zinc-400 font-bold text-xs hover:bg-white/15 transition-colors"
                                >Cancel</button>
                                <button
                                  onClick={() => handleRestrict(r.key, "apply", restrictUntil[r.key] || undefined)}
                                  disabled={restrictLoading}
                                  className="flex-1 rounded-lg py-1.5 bg-red-500/20 border border-red-500/30 text-red-300 font-bold text-xs hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                                >
                                  Confirm
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── WALLET SECTION ── */}
        {section === "wallet" && user && (
          <div className="flex flex-col gap-3 pt-2">
            <div className="rounded-2xl p-4 relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(0,0,0,0.4) 100%)", border: "1px solid rgba(139,92,246,0.25)", boxShadow: "0 8px 32px rgba(139,92,246,0.1)" }}>
              <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)" }} />
              <div className="absolute right-3 top-3 opacity-20"><Gem className="w-14 h-14 text-primary" strokeWidth={1} /></div>
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.35)" }}>
                    <Wallet className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Diamond Balance</p>
                </div>
                <div className="flex items-end gap-2 mb-3">
                  <span className="text-4xl font-extrabold font-heading leading-none text-white">{user.diamondBalance.toLocaleString()}</span>
                  <Gem className="w-7 h-7 text-violet-400 pb-0.5" />
                </div>
                <div className="grid grid-cols-3 gap-2 pt-3" style={{ borderTop: "1px dashed rgba(139,92,246,0.2)" }}>
                  {(() => {
                    const topped = wallet.filter(t => t.type === "topup").reduce((s, t) => s + t.amount, 0);
                    const prizes = wallet.filter(t => t.type === "prize").reduce((s, t) => s + t.amount, 0);
                    const spent = wallet.filter(t => t.type === "entry").reduce((s, t) => s + Math.abs(t.amount), 0);
                    return [
                      { label: "Topped Up", value: topped, color: "text-emerald-400" },
                      { label: "Prizes Won", value: prizes, color: "text-yellow-400" },
                      { label: "Spent", value: spent, color: "text-red-400" },
                    ].map(s => (
                      <div key={s.label} className="text-center">
                        <p className={cn("text-sm font-bold", s.color)}>+{s.value}</p>
                        <p className="text-[9px] text-zinc-600 uppercase tracking-wider">{s.label}</p>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>

            {/* Wallet Controls */}
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="px-4 py-2 border-b border-white/8 text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />Wallet Controls
              </div>

              {/* Freeze Wallet */}
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white flex items-center gap-1.5">
                    {user.walletFrozen
                      ? <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                      : <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />}
                    {user.walletFrozen ? "Wallet Frozen" : "Wallet Active"}
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">
                    {user.walletFrozen ? `Frozen ${fmtRelative(user.walletFrozenAt)} — all transactions blocked` : "All transactions are permitted"}
                  </p>
                </div>
                <button
                  className={cn(
                    "text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-colors shrink-0",
                    user.walletFrozen
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20"
                      : "bg-red-500/10 border-red-500/20 text-red-300 hover:bg-red-500/20"
                  )}
                  onClick={async () => {
                    try {
                      const updated = await saFetch<UserDetail>(`/admin/users/${userId}/wallet/freeze`, token, {
                        method: "POST",
                        body: JSON.stringify({ action: user.walletFrozen ? "unfreeze" : "freeze" }),
                      });
                      setUser(updated);
                      toast({ title: user.walletFrozen ? "Wallet unfrozen" : "Wallet frozen" });
                    } catch { toast({ title: "Action failed", variant: "destructive" }); }
                  }}
                >
                  {user.walletFrozen ? "Unfreeze" : "Freeze Wallet"}
                </button>
              </div>

              {/* Hold Withdrawals */}
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white flex items-center gap-1.5">
                    {user.withdrawalBanned
                      ? <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                      : <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />}
                    {user.withdrawalBanned ? "Withdrawals On Hold" : "Withdrawals Allowed"}
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">
                    {user.withdrawalBanned ? `Hold placed ${fmtRelative(user.withdrawalBannedAt)}` : "User can request withdrawals normally"}
                  </p>
                </div>
                <button
                  className={cn(
                    "text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-colors shrink-0",
                    user.withdrawalBanned
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20"
                      : "bg-orange-500/10 border-orange-500/20 text-orange-300 hover:bg-orange-500/20"
                  )}
                  onClick={async () => {
                    try {
                      const updated = await saFetch<UserDetail>(`/admin/users/${userId}/wallet/hold-withdrawals`, token, {
                        method: "POST",
                        body: JSON.stringify({ action: user.withdrawalBanned ? "release" : "hold" }),
                      });
                      setUser(updated);
                      toast({ title: user.withdrawalBanned ? "Withdrawal hold released" : "Withdrawal hold placed" });
                    } catch { toast({ title: "Action failed", variant: "destructive" }); }
                  }}
                >
                  {user.withdrawalBanned ? "Release Hold" : "Hold Withdrawals"}
                </button>
              </div>

              {/* Allow Deposit Withdrawal */}
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white">Allow Deposit Withdrawal</p>
                  <p className={cn("text-[10px] font-semibold mt-0.5", user.allowDepositWithdrawal ? "text-emerald-400" : "text-zinc-500")}>
                    {user.allowDepositWithdrawal ? "✓ Allowed — user can withdraw top-up balance" : "✗ Locked — only prize winnings can be withdrawn"}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const updated = await saFetch<UserDetail>(`/admin/users/${userId}/wallet/allow-deposit-withdrawal`, token, {
                        method: "POST",
                        body: JSON.stringify({ allow: !user.allowDepositWithdrawal }),
                      });
                      setUser(updated);
                      toast({ title: !user.allowDepositWithdrawal ? "Deposit withdrawal allowed" : "Deposit withdrawal revoked" });
                    } catch { toast({ title: "Action failed", variant: "destructive" }); }
                  }}
                  className={cn(
                    "relative shrink-0 w-11 h-6 rounded-full border transition-all duration-200",
                    user.allowDepositWithdrawal
                      ? "bg-emerald-500 border-emerald-400"
                      : "bg-zinc-700 border-zinc-600"
                  )}
                  style={{ minWidth: 44 }}
                >
                  <span className={cn(
                    "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200",
                    user.allowDepositWithdrawal ? "left-[22px]" : "left-0.5"
                  )} />
                </button>
              </div>

              {/* Per-User Min Withdrawal */}
              <div className="px-4 py-3 border-b border-white/5">
                <p className="text-xs font-medium text-white mb-0.5">Min Withdrawal Override</p>
                <p className="text-[10px] text-zinc-500 mb-2.5">
                  {user.minWithdrawal !== null
                    ? `Custom: ₹${user.minWithdrawal} · overrides global setting`
                    : "Using global setting — set a custom value to override for this user"}
                </p>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 font-semibold">₹</span>
                    <input
                      type="number" min={1} step={1}
                      value={minWdInput}
                      onChange={e => setMinWdInput(e.target.value)}
                      placeholder="e.g. 100"
                      className="w-full h-8 pl-6 pr-3 rounded-lg text-xs text-white bg-white/5 border border-white/10 outline-none focus:border-indigo-400/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  <button
                    disabled={minWdSaving}
                    onClick={async () => {
                      const val = minWdInput.trim() === "" ? null : parseInt(minWdInput);
                      if (val !== null && (isNaN(val) || val < 1)) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
                      setMinWdSaving(true);
                      try {
                        const updated = await saFetch<UserDetail>(`/admin/users/${userId}/wallet/min-withdrawal`, token, {
                          method: "POST", body: JSON.stringify({ minWithdrawal: val }),
                        });
                        setUser(updated);
                        setMinWdInput(updated.minWithdrawal !== null ? String(updated.minWithdrawal) : "");
                        toast({ title: val !== null ? `Min withdrawal set to ₹${val}` : "Min withdrawal reset to global" });
                      } catch { toast({ title: "Failed to save", variant: "destructive" }); }
                      finally { setMinWdSaving(false); }
                    }}
                    className="h-8 px-3 rounded-lg text-xs font-semibold text-white bg-indigo-500/20 border border-indigo-500/30 hover:bg-indigo-500/30 transition-colors shrink-0 disabled:opacity-50"
                  >
                    {minWdSaving ? "Saving…" : "Save"}
                  </button>
                  {user.minWithdrawal !== null && (
                    <button
                      disabled={minWdSaving}
                      onClick={async () => {
                        setMinWdSaving(true);
                        try {
                          const updated = await saFetch<UserDetail>(`/admin/users/${userId}/wallet/min-withdrawal`, token, {
                            method: "POST", body: JSON.stringify({ minWithdrawal: null }),
                          });
                          setUser(updated);
                          setMinWdInput("");
                          toast({ title: "Min withdrawal reset to global" });
                        } catch { toast({ title: "Failed to reset", variant: "destructive" }); }
                        finally { setMinWdSaving(false); }
                      }}
                      className="h-8 px-3 rounded-lg text-xs font-semibold text-red-300 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors shrink-0 disabled:opacity-50"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Per-User Min Top-up */}
              <div className="px-4 py-3 border-b border-white/5">
                <p className="text-xs font-medium text-white mb-0.5">Min Top-up Override</p>
                <p className="text-[10px] text-zinc-500 mb-2.5">
                  {user.minTopup !== null
                    ? `Custom: ₹${user.minTopup} · overrides global setting`
                    : "Using global setting — set a custom value to override for this user"}
                </p>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 font-semibold">₹</span>
                    <input
                      type="number" min={1} step={1}
                      value={minTpInput}
                      onChange={e => setMinTpInput(e.target.value)}
                      placeholder="e.g. 50"
                      className="w-full h-8 pl-6 pr-3 rounded-lg text-xs text-white bg-white/5 border border-white/10 outline-none focus:border-indigo-400/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  <button
                    disabled={minTpSaving}
                    onClick={async () => {
                      const val = minTpInput.trim() === "" ? null : parseInt(minTpInput);
                      if (val !== null && (isNaN(val) || val < 1)) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
                      setMinTpSaving(true);
                      try {
                        const updated = await saFetch<UserDetail>(`/admin/users/${userId}/wallet/min-topup`, token, {
                          method: "POST", body: JSON.stringify({ minTopup: val }),
                        });
                        setUser(updated);
                        setMinTpInput(updated.minTopup !== null ? String(updated.minTopup) : "");
                        toast({ title: val !== null ? `Min top-up set to ₹${val}` : "Min top-up reset to global" });
                      } catch { toast({ title: "Failed to save", variant: "destructive" }); }
                      finally { setMinTpSaving(false); }
                    }}
                    className="h-8 px-3 rounded-lg text-xs font-semibold text-white bg-indigo-500/20 border border-indigo-500/30 hover:bg-indigo-500/30 transition-colors shrink-0 disabled:opacity-50"
                  >
                    {minTpSaving ? "Saving…" : "Save"}
                  </button>
                  {user.minTopup !== null && (
                    <button
                      disabled={minTpSaving}
                      onClick={async () => {
                        setMinTpSaving(true);
                        try {
                          const updated = await saFetch<UserDetail>(`/admin/users/${userId}/wallet/min-topup`, token, {
                            method: "POST", body: JSON.stringify({ minTopup: null }),
                          });
                          setUser(updated);
                          setMinTpInput("");
                          toast({ title: "Min top-up reset to global" });
                        } catch { toast({ title: "Failed to reset", variant: "destructive" }); }
                        finally { setMinTpSaving(false); }
                      }}
                      className="h-8 px-3 rounded-lg text-xs font-semibold text-red-300 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors shrink-0 disabled:opacity-50"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Reverse Reward */}
              {(() => {
                const prizes = wallet.filter(t => t.type === "prize" && t.amount > 0);
                return prizes.length > 0 ? (
                  <div className="px-4 py-3 border-b border-white/5">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Reverse Reward</p>
                    <div className="flex flex-col gap-1.5">
                      {prizes.slice(0, 5).map(tx => (
                        <div key={tx.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg bg-white/3">
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-white truncate">{tx.label}</p>
                            <p className="text-[10px] text-zinc-600">{fmtRelative(tx.createdAt)} · +{tx.amount} 💎</p>
                          </div>
                          <button
                            className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20 transition-colors shrink-0"
                            onClick={async () => {
                              if (!confirm(`Reverse reward of ${tx.amount} 💎 from "${tx.label}"?`)) return;
                              try {
                                const result = await saFetch<{ newBalance: number }>(`/admin/users/${userId}/wallet/reverse-reward`, token, {
                                  method: "POST", body: JSON.stringify({ transactionId: tx.id }),
                                });
                                setUser(u => u ? { ...u, diamondBalance: result.newBalance } : u);
                                setWallet(w => w.map(t => t.id === tx.id ? { ...t, amount: -1 } : t));
                                toast({ title: "Reward reversed" });
                              } catch { toast({ title: "Reversal failed", variant: "destructive" }); }
                            }}
                          >
                            Reverse
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Refund Entry Fee */}
              {(() => {
                const entries = wallet.filter(t => t.type === "entry" && t.amount < 0);
                return entries.length > 0 ? (
                  <div className="px-4 py-3">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Refund Entry Fee</p>
                    <div className="flex flex-col gap-1.5">
                      {entries.slice(0, 5).map(tx => (
                        <div key={tx.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg bg-white/3">
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-white truncate">{tx.label}</p>
                            <p className="text-[10px] text-zinc-600">{fmtRelative(tx.createdAt)} · {tx.amount} 💎</p>
                          </div>
                          <button
                            className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 transition-colors shrink-0"
                            onClick={async () => {
                              if (!confirm(`Refund entry fee of ${Math.abs(tx.amount)} 💎 for "${tx.label}"?`)) return;
                              try {
                                const result = await saFetch<{ newBalance: number }>(`/admin/users/${userId}/wallet/refund-entry`, token, {
                                  method: "POST", body: JSON.stringify({ transactionId: tx.id }),
                                });
                                setUser(u => u ? { ...u, diamondBalance: result.newBalance } : u);
                                setWallet(w => w.map(t => t.id === tx.id ? { ...t, amount: 1 } : t));
                                toast({ title: "Entry fee refunded" });
                              } catch { toast({ title: "Refund failed", variant: "destructive" }); }
                            }}
                          >
                            Refund
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
            </div>

            {/* Transaction History */}
            {wallet.length === 0 ? (
              <div className="flex flex-col items-center justify-center pt-10 gap-2 text-center">
                <Wallet className="w-10 h-10 text-zinc-700" />
                <p className="text-zinc-500 text-sm">No transactions yet</p>
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="px-4 py-2 border-b border-white/5 text-[10px] font-bold text-zinc-600 uppercase tracking-wider">Transaction History</div>
                {wallet.map((tx, i) => {
                  const isCredit = tx.amount > 0;
                  const typeColor: Record<string, string> = {
                    prize: "bg-yellow-500/15", topup: "bg-emerald-500/15",
                    refund: "bg-blue-500/15", reversal: "bg-red-500/15", entry: "bg-red-500/15",
                  };
                  const iconColor: Record<string, string> = {
                    prize: "text-yellow-400", topup: "text-emerald-400",
                    refund: "text-blue-400", reversal: "text-red-400", entry: "text-red-400",
                  };
                  return (
                    <div key={tx.id} className={cn("px-4 py-3 flex items-center gap-3", i < wallet.length - 1 ? "border-b border-white/5" : "")}>
                      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", typeColor[tx.type] ?? (isCredit ? "bg-emerald-500/15" : "bg-red-500/15"))}>
                        {isCredit ? <ArrowDownLeft className={cn("w-4 h-4", iconColor[tx.type] ?? "text-emerald-400")} /> : <ArrowUpRight className={cn("w-4 h-4", iconColor[tx.type] ?? "text-red-400")} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white font-medium truncate">{tx.label}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-white/5 text-zinc-500">{tx.type}</span>
                          <span className="text-[10px] text-zinc-600">{fmtDateTime(tx.createdAt)}</span>
                        </div>
                      </div>
                      <div className={cn("text-sm font-bold shrink-0", isCredit ? "text-emerald-400" : "text-red-400")}>
                        <span className="flex items-center gap-1">{isCredit ? "+" : ""}{tx.amount} <Gem className="w-3 h-3" /></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Balance Audit Log */}
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="px-4 py-2 border-b border-white/8 text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ScrollText className="w-3.5 h-3.5" />Balance Audit Log
                </span>
                {balanceLogsLoaded && (
                  <button
                    className="text-zinc-600 hover:text-zinc-400 transition-colors"
                    onClick={() => { setBalanceLogsLoaded(false); loadBalanceLogs(token); }}
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                )}
              </div>
              {balanceLogsLoading && (
                <div className="flex items-center justify-center py-6 gap-2">
                  <RefreshCw className="w-4 h-4 text-zinc-600 animate-spin" />
                  <span className="text-zinc-600 text-xs">Loading audit log...</span>
                </div>
              )}
              {!balanceLogsLoading && balanceLogs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
                  <ScrollText className="w-8 h-8 text-zinc-700" />
                  <p className="text-zinc-600 text-xs">No balance changes recorded</p>
                </div>
              )}
              {!balanceLogsLoading && balanceLogs.length > 0 && balanceLogs.map((log, i) => {
                const isCredit = log.amount > 0;
                const sourceLabel: Record<string, string> = {
                  prize_distribution: "Prize",
                  kick_refund: "Kick Refund",
                  admin_adjustment: "Admin Edit",
                  wallet_reverse_reward: "Reversal",
                  wallet_refund_entry: "Entry Refund",
                  withdrawal_reject_refund: "WD Rejected",
                  tournament_join: "Entry Fee",
                  topup_verified: "Top-up",
                  super_admin_topup: "SA Top-up",
                  withdrawal_request: "Withdrawal",
                };
                const sourceColor: Record<string, string> = {
                  prize_distribution: "text-yellow-400 bg-yellow-500/10",
                  kick_refund: "text-blue-400 bg-blue-500/10",
                  admin_adjustment: "text-violet-400 bg-violet-500/10",
                  wallet_reverse_reward: "text-red-400 bg-red-500/10",
                  wallet_refund_entry: "text-cyan-400 bg-cyan-500/10",
                  withdrawal_reject_refund: "text-orange-400 bg-orange-500/10",
                  tournament_join: "text-red-400 bg-red-500/10",
                  topup_verified: "text-emerald-400 bg-emerald-500/10",
                  super_admin_topup: "text-emerald-400 bg-emerald-500/10",
                  withdrawal_request: "text-red-400 bg-red-500/10",
                };
                const adminLabel = log.adminId === null ? "User" : log.adminId === -1 ? "Super Admin" : `Admin #${log.adminId}`;
                const adminColor = log.adminId === null ? "text-zinc-500" : log.adminId === -1 ? "text-amber-400" : "text-violet-400";
                return (
                  <div key={log.id} className={cn("px-4 py-3 flex items-start gap-3", i < balanceLogs.length - 1 ? "border-b border-white/5" : "")}>
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5", isCredit ? "bg-emerald-500/15" : "bg-red-500/15")}>
                      {isCredit
                        ? <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
                        : <ArrowUpRight className="w-3.5 h-3.5 text-red-400" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white font-medium truncate">{log.reason}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full", sourceColor[log.source] ?? "text-zinc-400 bg-zinc-800")}>
                          {sourceLabel[log.source] ?? log.source}
                        </span>
                        <span className={cn("text-[9px] font-medium", adminColor)}>{adminLabel}</span>
                        <span className="text-[9px] text-zinc-600">{fmtDateTime(log.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[9px] text-zinc-600">
                        <span>{log.balanceBefore} <Gem className="w-2.5 h-2.5 inline text-zinc-600" /></span>
                        <span>→</span>
                        <span className="text-zinc-400">{log.balanceAfter} <Gem className="w-2.5 h-2.5 inline text-zinc-500" /></span>
                      </div>
                    </div>
                    <div className={cn("text-sm font-bold shrink-0", isCredit ? "text-emerald-400" : "text-red-400")}>
                      <span className="flex items-center gap-0.5">{isCredit ? "+" : ""}{log.amount} <Gem className="w-3 h-3" /></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TOURNAMENTS SECTION ── */}
        {section === "tournaments" && (
          <div className="flex flex-col gap-3 pt-2">
            {tournaments.length === 0 ? (
              <div className="flex flex-col items-center justify-center pt-10 gap-2 text-center">
                <Trophy className="w-10 h-10 text-zinc-700" />
                <p className="text-zinc-500 text-sm">No matches joined</p>
              </div>
            ) : (
              tournaments.map(t => (
                <div key={t.id} className="rounded-2xl p-4 flex flex-col gap-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-white">{t.title}</p>
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wider">{t.gameMode} · {fmtDateTime(t.joinedAt)}</p>
                    </div>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0",
                      t.status === "completed" ? "text-emerald-300 bg-emerald-500/15 border-emerald-500/25" :
                      t.status === "ongoing" ? "text-orange-300 bg-orange-500/15 border-orange-500/25" :
                      "text-zinc-400 bg-zinc-500/15 border-zinc-500/25"
                    )}>{t.status}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { icon: <Skull className="w-3 h-3 text-red-400" />, val: t.kills, label: "Kills" },
                      { icon: <Medal className="w-3 h-3 text-yellow-400" />, val: t.placement ?? "–", label: "Place" },
                      { icon: <Gem className="w-3 h-3 text-violet-400" />, val: t.entryFeeDiamonds, label: "Entry" },
                      { icon: <Star className="w-3 h-3 text-cyan-400" />, val: t.diamondsWon, label: "Won" },
                    ].map(s => (
                      <div key={s.label} className="rounded-xl py-1.5 text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
                        <div className="flex justify-center mb-0.5">{s.icon}</div>
                        <p className="text-xs font-bold text-white">{s.val}</p>
                        <p className="text-[9px] text-zinc-600">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── NOTIFICATIONS SECTION ── */}
        {section === "notifications" && (
          <div className="flex flex-col gap-2 pt-2">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold px-1">Received Notifications ({notifs.length})</p>
            {notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                <Bell className="w-10 h-10 text-zinc-700" />
                <p className="text-zinc-500 text-sm">No notifications yet</p>
                <p className="text-zinc-700 text-xs">Notifications sent to this user will appear here</p>
              </div>
            ) : notifs.map((n, i) => (
              <div key={n.id}
                className={cn("rounded-2xl px-4 py-3 flex flex-col gap-1", n.read ? "opacity-50" : "")}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  animation: `pay-slide-up 0.3s ${i * 0.03}s ease both`,
                }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>{n.type}</span>
                  <div className="flex items-center gap-1.5">
                    {n.read && <span className="text-[9px] text-zinc-600">Read</span>}
                    <span className="text-[9px] text-zinc-600 shrink-0">{fmtRelative(n.createdAt)}</span>
                  </div>
                </div>
                <p className="text-xs font-bold text-white">{n.title}</p>
                <p className="text-[10px] text-zinc-400 leading-relaxed">{n.body}</p>
                <p className="text-[9px] text-zinc-700 font-mono">{fmtDateTime(n.createdAt)}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── FF STATS SECTION ── */}
        {section === "ffstats" && (
          <div className="flex flex-col gap-3 pt-2">
            {ffStatsLoading && (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-orange-400" />
                <p className="text-zinc-500 text-sm">Fetching stats from Free Fire servers...</p>
              </div>
            )}
            {ffStatsError && (
              <div className="rounded-2xl p-4 bg-red-500/10 border border-red-500/20 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{ffStatsError}</p>
              </div>
            )}
            {ffStats && !ffStatsLoading && !ffStatsError && (() => {
              const { player, br, cs } = ffStats;

              const StatCell = ({ icon, label, val, color }: { icon: React.ReactNode; label: string; val: string | number; color: string }) => (
                <div className="rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <div className={cn("flex justify-center mb-1", color)}>{icon}</div>
                  <p className="text-sm font-bold text-white">{val}</p>
                  <p className="text-[9px] text-zinc-600">{label}</p>
                </div>
              );

              const kdr = (kills: number = 0, deaths: number = 0) =>
                deaths > 0 ? (kills / deaths).toFixed(2) : kills > 0 ? kills.toFixed(2) : "0.00";

              const winRate = (wins: number = 0, games: number = 0) =>
                games > 0 ? ((wins / games) * 100).toFixed(1) + "%" : "0%";

              return (
                <>
                  {/* Player Info Header */}
                  {player && (
                    <div className="rounded-2xl p-4 flex items-center gap-4"
                      style={{ background: "linear-gradient(135deg, rgba(234,88,12,0.12), rgba(255,255,255,0.03))", border: "1px solid rgba(234,88,12,0.25)" }}>
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                        style={{ background: "rgba(234,88,12,0.15)", border: "1px solid rgba(234,88,12,0.3)" }}>
                        <Flame className="w-6 h-6 text-orange-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-white truncate">{player.nickname ?? user?.inGameName ?? "Unknown"}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {player.level != null && (
                            <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/20">
                              Lv {player.level}
                            </span>
                          )}
                          {player.rankingPoints != null && (
                            <span className="text-[10px] font-bold text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20">
                              {player.rankingPoints} BP
                            </span>
                          )}
                          {player.liked != null && (
                            <span className="text-[10px] text-zinc-500">{(player.liked as number).toLocaleString()} likes</span>
                          )}
                        </div>
                        {player.signature && (
                          <p className="text-[10px] text-zinc-500 mt-1 truncate italic">"{player.signature}"</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[9px] text-zinc-600 uppercase tracking-wider">UID</p>
                        <p className="text-[11px] font-mono text-zinc-400">{user?.uid}</p>
                      </div>
                    </div>
                  )}

                  {/* BR — Battle Royale */}
                  {br && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-px flex-1 bg-orange-500/15" />
                        <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Battle Royale</span>
                        <div className="h-px flex-1 bg-orange-500/15" />
                      </div>
                      <div className="flex flex-col gap-2">
                        {([
                          { key: "solostats", label: "Solo",  color: "text-blue-400",   bg: "rgba(59,130,246,0.07)",  border: "rgba(59,130,246,0.2)" },
                          { key: "duostats",  label: "Duo",   color: "text-purple-400", bg: "rgba(168,85,247,0.07)", border: "rgba(168,85,247,0.2)" },
                          { key: "quadstats", label: "Squad", color: "text-orange-400", bg: "rgba(234,88,12,0.07)",  border: "rgba(234,88,12,0.2)" },
                        ] as const).map(({ key, label, color, bg, border }) => {
                          const s = br[key];
                          if (!s) return null;
                          const d = s.detailedstats ?? {};
                          const hs = d.headshotKills ?? 0;
                          return (
                            <div key={key} className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${border}` }}>
                              <div className="px-4 py-2 flex items-center justify-between" style={{ background: bg, borderBottom: `1px solid ${border}` }}>
                                <span className={cn("text-xs font-bold uppercase tracking-wider", color)}>{label}</span>
                                <span className="text-[10px] text-zinc-500">{(s.gamesplayed ?? 0).toLocaleString()} matches</span>
                              </div>
                              <div className="p-3 grid grid-cols-3 gap-2">
                                <StatCell icon={<Skull className="w-3 h-3" />}  label="Kills"    val={(s.kills ?? 0).toLocaleString()}       color="text-red-400" />
                                <StatCell icon={<Star className="w-3 h-3" />}   label="Wins"     val={(s.wins ?? 0).toLocaleString()}        color="text-yellow-400" />
                                <StatCell icon={<Zap className="w-3 h-3" />}    label="K/D"      val={kdr(s.kills, d.deaths)}                color="text-orange-400" />
                                <StatCell icon={<Target className="w-3 h-3" />} label="Win Rate" val={winRate(s.wins, s.gamesplayed)}        color="text-emerald-400" />
                                <StatCell icon={<Target className="w-3 h-3" />} label="HS Kills" val={hs.toLocaleString()}                   color="text-pink-400" />
                                <StatCell icon={<Medal className="w-3 h-3" />}  label="Best"     val={(d.highestKills ?? 0).toLocaleString()} color="text-cyan-400" />
                              </div>
                              {(d.damage || d.survivalTime) && (
                                <div className="px-3 pb-3 flex gap-2">
                                  {d.damage != null && (
                                    <div className="flex-1 rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                                      <p className="text-[9px] text-zinc-600 uppercase tracking-wider">Total Damage</p>
                                      <p className="text-xs font-bold text-white">{d.damage.toLocaleString()}</p>
                                    </div>
                                  )}
                                  {d.survivalTime != null && (
                                    <div className="flex-1 rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                                      <p className="text-[9px] text-zinc-600 uppercase tracking-wider">Survival Time</p>
                                      <p className="text-xs font-bold text-white">{Math.floor((d.survivalTime ?? 0) / 3600)}h {Math.floor(((d.survivalTime ?? 0) % 3600) / 60)}m</p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* CS — Clash Squad */}
                  {cs?.csstats && (() => {
                    const s = cs.csstats!;
                    const d = s.detailedstats ?? {};
                    return (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-px flex-1 bg-emerald-500/15" />
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Clash Squad</span>
                          <div className="h-px flex-1 bg-emerald-500/15" />
                        </div>
                        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(16,185,129,0.25)" }}>
                          <div className="px-4 py-2 flex items-center justify-between" style={{ background: "rgba(16,185,129,0.07)", borderBottom: "1px solid rgba(16,185,129,0.18)" }}>
                            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">CS Career</span>
                            <span className="text-[10px] text-zinc-500">{(s.gamesplayed ?? 0).toLocaleString()} matches</span>
                          </div>
                          <div className="p-3 grid grid-cols-3 gap-2">
                            <StatCell icon={<Skull className="w-3 h-3" />}   label="Kills"     val={(s.kills ?? 0).toLocaleString()}            color="text-red-400" />
                            <StatCell icon={<Star className="w-3 h-3" />}    label="Wins"      val={(s.wins ?? 0).toLocaleString()}             color="text-yellow-400" />
                            <StatCell icon={<Zap className="w-3 h-3" />}     label="K/D"       val={kdr(s.kills, d.deaths)}                     color="text-orange-400" />
                            <StatCell icon={<Target className="w-3 h-3" />}  label="Win Rate"  val={winRate(s.wins, s.gamesplayed)}             color="text-emerald-400" />
                            <StatCell icon={<Target className="w-3 h-3" />}  label="HS Kills"  val={(d.headShotKills ?? 0).toLocaleString()}    color="text-pink-400" />
                            <StatCell icon={<Medal className="w-3 h-3" />}   label="MVP"       val={(d.mvpCount ?? 0).toLocaleString()}          color="text-cyan-400" />
                          </div>
                          <div className="px-3 pb-3 grid grid-cols-2 gap-2">
                            {[
                              { label: "Assists",       val: (d.assists ?? 0).toLocaleString() },
                              { label: "Total Damage",  val: (d.damage ?? 0).toLocaleString() },
                              { label: "Double Kills",  val: (d.doubleKills ?? 0).toLocaleString() },
                              { label: "Triple Kills",  val: (d.tripleKills ?? 0).toLocaleString() },
                              { label: "4-Kills",       val: (d.fourKills ?? 0).toLocaleString() },
                              { label: "Revivals",      val: (d.revivals ?? 0).toLocaleString() },
                            ].map(item => (
                              <div key={item.label} className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                                <p className="text-[9px] text-zinc-600 uppercase tracking-wider">{item.label}</p>
                                <p className="text-xs font-bold text-white">{item.val}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {!br && !cs && (
                    <div className="text-center py-8 text-zinc-600 text-sm">No stats available for this player.</div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* ── LOGS SECTION ── */}
        {section === "chat" && (
          <div className="flex flex-col pt-2 gap-0" style={{ minHeight: "calc(100vh - 120px)" }}>

            {/* ── Chat Header ── */}
            <div
              className="flex items-center gap-3 px-3 py-3 rounded-2xl mb-3 shrink-0"
              style={{ background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.18)" }}
            >
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white"
                  style={{ background: "linear-gradient(135deg,rgba(139,92,246,0.5),rgba(99,102,241,0.5))", border: "1px solid rgba(139,92,246,0.3)" }}>
                  {(user?.inGameName?.[0] ?? user?.phone?.[0] ?? "U").toUpperCase()}
                </div>
                <span className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0a0612]",
                  user?.isOnline ? "bg-emerald-400" : "bg-zinc-600"
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{user?.inGameName ?? user?.phone ?? "User"}</p>
                <p className="text-[10px] text-zinc-500">{user?.isOnline ? "Online now" : "Support thread"}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {chatMessages.filter(m => !m.isFromAdmin && !m.readByUser).length > 0 && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300">
                    {chatMessages.filter(m => !m.isFromAdmin && !m.readByUser).length} unread
                  </span>
                )}
                <button
                  onClick={() => { setChatLoaded(false); loadChatMessages(token); }}
                  className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <RefreshCw className={cn("w-3.5 h-3.5 text-zinc-400", chatLoading && "animate-spin")} />
                </button>
              </div>
            </div>

            {/* ── Messages area ── */}
            <div
              ref={chatScrollRef}
              className="flex-1 flex flex-col gap-1.5 overflow-y-auto pb-2 px-0.5"
              style={{ minHeight: 0 }}
            >
              {chatLoading && (
                <>
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className={cn("flex gap-2", i % 2 === 1 ? "flex-row-reverse" : "")}>
                      <div className="w-7 h-7 rounded-full animate-pulse shrink-0" style={{ background: "rgba(255,255,255,0.06)" }} />
                      <div
                        className="h-10 rounded-2xl animate-pulse"
                        style={{ background: "rgba(255,255,255,0.04)", width: `${45 + (i * 13) % 30}%` }}
                      />
                    </div>
                  ))}
                </>
              )}

              {!chatLoading && chatMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center flex-1 gap-3 py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)" }}>
                    <MessageCircle className="w-7 h-7 text-violet-400/50" />
                  </div>
                  <div>
                    <p className="text-zinc-400 text-sm font-medium">No messages yet</p>
                    <p className="text-zinc-600 text-xs mt-0.5">User support messages will appear here</p>
                  </div>
                </div>
              )}

              {!chatLoading && chatMessages.length > 0 && (() => {
                const items: React.ReactNode[] = [];
                let lastDateStr = "";
                chatMessages.forEach((m, idx) => {
                  const isAdmin = m.isFromAdmin;
                  const prevSameSide = idx > 0 && chatMessages[idx - 1].isFromAdmin === m.isFromAdmin;
                  const prevSameMinute = idx > 0 &&
                    Math.abs(new Date(m.createdAt).getTime() - new Date(chatMessages[idx - 1].createdAt).getTime()) < 60000 &&
                    chatMessages[idx - 1].isFromAdmin === m.isFromAdmin;
                  const dateStr = (() => {
                    try {
                      const d = new Date(m.createdAt);
                      const today = new Date();
                      const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
                      if (d.toDateString() === today.toDateString()) return "Today";
                      if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
                      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
                    } catch { return ""; }
                  })();
                  if (dateStr !== lastDateStr) {
                    lastDateStr = dateStr;
                    items.push(
                      <div key={`sep-${m.id}`} className="flex items-center gap-2 my-2">
                        <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
                        <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider px-1">{dateStr}</span>
                        <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
                      </div>
                    );
                  }
                  const timeStr = (() => {
                    try { return new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }); } catch { return ""; }
                  })();
                  items.push(
                    <div key={m.id} className={cn("flex gap-2 items-end", isAdmin ? "flex-row-reverse" : "flex-row", prevSameMinute ? "mt-0.5" : "mt-2")}>
                      <div className={cn("w-7 h-7 shrink-0", (prevSameSide) && "invisible")}>
                        <div className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center",
                          isAdmin
                            ? "bg-gradient-to-br from-violet-500/30 to-indigo-600/30 border border-violet-500/30"
                            : "bg-white/8 border border-white/10"
                        )}>
                          {isAdmin
                            ? <Shield className="w-3.5 h-3.5 text-violet-400" />
                            : <User className="w-3.5 h-3.5 text-zinc-400" />}
                        </div>
                      </div>
                      <div className={cn("flex flex-col gap-0.5", isAdmin ? "items-end" : "items-start")} style={{ maxWidth: "72%" }}>
                        <div className={cn(
                          "px-3.5 py-2.5 text-[13px] leading-relaxed break-words",
                          isAdmin
                            ? "text-white rounded-2xl rounded-br-sm"
                            : "text-zinc-100 rounded-2xl rounded-bl-sm",
                        )} style={isAdmin
                          ? { background: "linear-gradient(135deg,rgba(139,92,246,0.8),rgba(99,102,241,0.8))", border: "1px solid rgba(139,92,246,0.3)", boxShadow: "0 2px 12px rgba(139,92,246,0.2)" }
                          : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }
                        }>
                          {m.message}
                        </div>
                        {!prevSameMinute && (
                          <div className="flex items-center gap-1 px-1">
                            <span className="text-[9px] text-zinc-600">{timeStr}</span>
                            {isAdmin && (
                              <CheckCheck className={cn("w-3 h-3", m.readByUser ? "text-violet-400" : "text-zinc-600")} />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
                return items;
              })()}
            </div>

            {/* ── Compose bar ── */}
            <div
              className="shrink-0 mt-3 rounded-2xl overflow-hidden"
              style={{ border: "1px solid rgba(139,92,246,0.2)", background: "rgba(8,5,15,0.8)" }}
            >
              <div className="flex items-end gap-2 px-3 py-2.5">
                <textarea
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendAdminReply(); }
                  }}
                  placeholder="Write a support reply…"
                  rows={1}
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 outline-none resize-none leading-relaxed py-0.5"
                  style={{ maxHeight: "100px", overflowY: "auto" }}
                  onInput={e => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = Math.min(el.scrollHeight, 100) + "px";
                  }}
                />
                <button
                  onClick={handleSendAdminReply}
                  disabled={!chatInput.trim() || chatSending}
                  className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 mb-0.5",
                    chatInput.trim() && !chatSending
                      ? "text-white active:scale-95"
                      : "bg-white/5 text-zinc-700"
                  )}
                  style={chatInput.trim() && !chatSending
                    ? { background: "linear-gradient(135deg,#7c3aed,#4f46e5)", boxShadow: "0 0 14px rgba(124,58,237,0.45)" }
                    : {}}
                >
                  {chatSending
                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="px-3 pb-2 flex items-center gap-1.5">
                <span className="text-[9px] text-zinc-700">Enter to send</span>
                <span className="text-zinc-800">·</span>
                <span className="text-[9px] text-zinc-700">Shift+Enter for new line</span>
              </div>
            </div>

          </div>
        )}

        {section === "withdrawals" && (
          <div className="flex flex-col gap-2 pt-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Withdrawal History</p>
              <button onClick={() => { setWithdrawalsLoaded(false); loadWithdrawals(token); }}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                style={{ background: "rgba(255,255,255,0.05)" }}>
                <RefreshCw className={cn("w-3.5 h-3.5 text-zinc-400", withdrawalsLoading && "animate-spin")} />
              </button>
            </div>

            {withdrawalsLoading && (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
                ))}
              </div>
            )}

            {!withdrawalsLoading && withdrawals.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                <Banknote className="w-10 h-10 text-zinc-700" />
                <p className="text-zinc-500 text-sm">No withdrawal requests</p>
              </div>
            )}

            {!withdrawalsLoading && withdrawals.map(wd => {
              const statusBg = wd.status === "paid" ? "rgba(16,185,129,0.1)" : wd.status === "rejected" ? "rgba(239,68,68,0.08)" : "rgba(234,88,12,0.08)";
              const statusBorder = wd.status === "paid" ? "rgba(16,185,129,0.25)" : wd.status === "rejected" ? "rgba(239,68,68,0.2)" : "rgba(234,88,12,0.2)";
              const fmtDt = (iso: string) => { try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
              return (
                <div key={wd.id} className="rounded-2xl overflow-hidden"
                  style={{ background: statusBg, border: `1px solid ${statusBorder}` }}>
                  <div className="px-4 py-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className={cn("text-[10px] font-bold uppercase tracking-wider",
                        wd.status === "paid" ? "text-emerald-400" : wd.status === "rejected" ? "text-red-400" : "text-orange-400")}>
                        {wd.status}
                      </span>
                      <span className="text-sm font-extrabold text-white">₹{wd.rupees}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold text-orange-300">{wd.upiId}</p>
                      <p className="text-[10px] text-zinc-500">{wd.diamondsRedeemed} diamonds</p>
                    </div>
                    <p className="text-[9px] text-zinc-600">{fmtDt(wd.createdAt)}</p>
                    {wd.status === "rejected" && wd.rejectedReason && (
                      <p className="text-[10px] text-red-400">Reason: {wd.rejectedReason}</p>
                    )}
                    {wd.status === "pending" && (
                      rejectingWdId === wd.id ? (
                        <div className="flex flex-col gap-2 pt-1">
                          <input
                            value={rejectWdReason}
                            onChange={e => setRejectWdReason(e.target.value)}
                            placeholder="Rejection reason..."
                            className="rounded-xl px-3 py-2 text-xs text-white outline-none"
                            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(239,68,68,0.3)" }}
                          />
                          <div className="flex gap-2">
                            <button onClick={() => { setRejectingWdId(null); setRejectWdReason(""); }}
                              className="flex-1 py-1.5 rounded-xl text-xs font-bold text-zinc-400"
                              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              Cancel
                            </button>
                            <button onClick={() => handleWithdrawReject(wd.id, rejectWdReason, token)} disabled={wdActing === wd.id}
                              className="flex-1 py-1.5 rounded-xl text-xs font-bold text-red-300 disabled:opacity-50"
                              style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}>
                              {wdActing === wd.id ? "Rejecting…" : "Confirm"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => handleWithdrawPay(wd.id, token)} disabled={wdActing === wd.id}
                            className="flex-1 py-2 rounded-xl text-xs font-bold text-emerald-300 active:scale-[0.98] transition-all disabled:opacity-50"
                            style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)" }}>
                            {wdActing === wd.id ? "Processing…" : "Mark Paid"}
                          </button>
                          <button onClick={() => setRejectingWdId(wd.id)}
                            className="flex-1 py-2 rounded-xl text-xs font-bold text-red-400 active:scale-[0.98] transition-all"
                            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                            Reject
                          </button>
                        </div>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {section === "logs" && (
          <div className="flex flex-col gap-2 pt-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Admin Activity Logs</p>
              <button onClick={() => { setLogsLoaded(false); loadLogs(token); }}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                style={{ background: "rgba(255,255,255,0.05)" }}>
                <RefreshCw className={cn("w-3.5 h-3.5 text-zinc-400", logsLoading && "animate-spin")} />
              </button>
            </div>

            {logsLoading && (
              <div className="flex flex-col gap-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
                ))}
              </div>
            )}

            {!logsLoading && logs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                <ScrollText className="w-10 h-10 text-zinc-700" />
                <p className="text-zinc-500 text-sm">No admin logs for this user</p>
                <p className="text-zinc-700 text-xs">Actions like blocks, diamond adjustments and notifications will appear here</p>
              </div>
            )}

            {!logsLoading && logs.map((log, i) => (
              <div key={log.id} className="rounded-2xl px-4 py-3 flex flex-col gap-1"
                style={{
                  background: LOG_CATEGORY_COLOR[log.category] ?? "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  animation: `pay-slide-up 0.3s ${i * 0.03}s ease both`,
                  opacity: 0,
                }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Activity className={cn("w-3 h-3 shrink-0", LOG_CATEGORY_TEXT[log.category] ?? "text-zinc-500")} />
                    <span className={cn("text-[10px] font-bold uppercase tracking-wider font-mono", LOG_CATEGORY_TEXT[log.category] ?? "text-zinc-500")}>
                      {log.action.replace(/_/g, " ")}
                    </span>
                  </div>
                  <span className="text-[9px] text-zinc-600 shrink-0">{fmtRelative(log.createdAt)}</span>
                </div>
                {log.details && <p className="text-[10px] text-zinc-400 leading-relaxed">{log.details}</p>}
                <p className="text-[9px] text-zinc-700 font-mono">{fmtDateTime(log.createdAt)}</p>
              </div>
            ))}
          </div>
        )}

        {section === "payments" && (
          <div className="flex flex-col gap-4 pt-2">
            {(() => {
              const topups   = wallet.filter(t => t.type === "topup");
              const entries  = wallet.filter(t => t.type === "entry");
              const prizes   = wallet.filter(t => t.type === "prize");
              const gifts    = wallet.filter(t => t.type === "add");
              const deducts  = wallet.filter(t => t.type === "deduct");

              const totalTopup  = topups.reduce((s, t) => s + t.amount, 0);
              const totalEntry  = entries.reduce((s, t) => s + Math.abs(t.amount), 0);
              const totalPrize  = prizes.reduce((s, t) => s + t.amount, 0);
              const totalGift   = gifts.reduce((s, t) => s + t.amount, 0);
              const totalDeduct = deducts.reduce((s, t) => s + Math.abs(t.amount), 0);
              const netProfit   = totalEntry - totalPrize - totalGift;

              const monthMap: Record<string, { month: string; revenue: number; prizes: number; gifts: number }> = {};
              wallet.forEach(t => {
                try {
                  const d = new Date(t.createdAt);
                  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                  const label = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
                  if (!monthMap[key]) monthMap[key] = { month: label, revenue: 0, prizes: 0, gifts: 0 };
                  if (t.type === "entry")  monthMap[key].revenue += Math.abs(t.amount);
                  if (t.type === "topup")  monthMap[key].revenue += t.amount * 0;
                  if (t.type === "prize")  monthMap[key].prizes  += t.amount;
                  if (t.type === "add")    monthMap[key].gifts   += t.amount;
                } catch { /* skip */ }
              });
              const chartData = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => ({
                ...v,
                profit: Math.max(0, v.revenue - v.prizes - v.gifts),
              }));

              const typeBreakdown = [
                { label: "Topups",     value: totalTopup,  icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />, color: "text-emerald-400", bar: "bg-emerald-500" },
                { label: "Entry Fees", value: totalEntry,  icon: <CreditCard className="w-3.5 h-3.5 text-cyan-400" />,    color: "text-cyan-400",    bar: "bg-cyan-500" },
                { label: "Prizes Out", value: totalPrize,  icon: <Trophy className="w-3.5 h-3.5 text-amber-400" />,       color: "text-amber-400",   bar: "bg-amber-500" },
                { label: "Gifts Given",value: totalGift,   icon: <Gift className="w-3.5 h-3.5 text-pink-400" />,          color: "text-pink-400",    bar: "bg-pink-500" },
                { label: "Deducted",   value: totalDeduct, icon: <TrendingDown className="w-3.5 h-3.5 text-red-400" />,   color: "text-red-400",     bar: "bg-red-500" },
              ];
              const maxVal = Math.max(...typeBreakdown.map(r => r.value), 1);

              return (
                <>
                  {/* ── Top-up History button ── */}
                  <button
                    onClick={() => navigate(`/286c81443d1fb388d1b9a8e3b280824c/user_management/${encodeURIComponent(params.phone ?? "")}/${userId}/topup-history`)}
                    className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-all active:scale-[0.98]"
                    style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)" }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}>
                      <CreditCard className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-bold text-indigo-300">Top-up History</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">{topups.length} request{topups.length !== 1 ? "s" : ""} · all UTR & BharatPe data</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-indigo-500 shrink-0" />
                  </button>

                  {/* ── Hero KPI row ── */}
                  {(() => {
                    const userProfit = totalPrize - totalEntry;
                    const platformProfit = totalEntry - totalPrize - totalGift;
                    return (
                      <div className="grid grid-cols-2 gap-2">
                        {/* Platform (admin) perspective */}
                        <div className="col-span-2 rounded-2xl px-4 py-4 flex items-center gap-3"
                          style={{ background: platformProfit >= 0 ? "rgba(16,185,129,0.07)" : "rgba(239,68,68,0.07)", border: `1px solid ${platformProfit >= 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}` }}>
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: platformProfit >= 0 ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)" }}>
                            <Shield className={cn("w-5 h-5", platformProfit >= 0 ? "text-emerald-400" : "text-red-400")} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Platform (Admin)</p>
                              <span className={cn(
                                "text-[9px] font-bold px-2 py-0.5 rounded-full border",
                                platformProfit > 0
                                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                                  : platformProfit === 0
                                    ? "bg-zinc-500/15 border-zinc-500/30 text-zinc-400"
                                    : "bg-red-500/15 border-red-500/30 text-red-300"
                              )}>
                                {platformProfit > 0 ? "In Profit" : platformProfit === 0 ? "Break-even" : "At Loss"}
                              </span>
                            </div>
                            <p className={cn("text-xl font-extrabold leading-tight mt-0.5", platformProfit >= 0 ? "text-emerald-400" : "text-red-400")}>
                              {platformProfit >= 0 ? "+" : ""}₹{(platformProfit * rate).toLocaleString()}
                            </p>
                            <p className="text-[10px] text-zinc-600 mt-0.5">Entry fees − prizes − gifts</p>
                          </div>
                        </div>

                        {/* User perspective */}
                        <div className="col-span-2 rounded-2xl px-4 py-4 flex items-center gap-3"
                          style={{ background: userProfit >= 0 ? "rgba(6,182,212,0.07)" : "rgba(139,92,246,0.07)", border: `1px solid ${userProfit >= 0 ? "rgba(6,182,212,0.2)" : "rgba(139,92,246,0.2)"}` }}>
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: userProfit >= 0 ? "rgba(6,182,212,0.15)" : "rgba(139,92,246,0.15)" }}>
                            <User className={cn("w-5 h-5", userProfit >= 0 ? "text-cyan-400" : "text-violet-400")} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">User (Player)</p>
                              <span className={cn(
                                "text-[9px] font-bold px-2 py-0.5 rounded-full border",
                                userProfit > 0
                                  ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300"
                                  : userProfit === 0
                                    ? "bg-zinc-500/15 border-zinc-500/30 text-zinc-400"
                                    : "bg-violet-500/15 border-violet-500/30 text-violet-300"
                              )}>
                                {userProfit > 0 ? "In Profit" : userProfit === 0 ? "Break-even" : "At Loss"}
                              </span>
                            </div>
                            <p className={cn("text-xl font-extrabold leading-tight mt-0.5", userProfit >= 0 ? "text-cyan-400" : "text-violet-400")}>
                              {userProfit >= 0 ? "+" : ""}₹{(userProfit * rate).toLocaleString()}
                            </p>
                            <p className="text-[10px] text-zinc-600 mt-0.5">Prizes won − entry fees paid</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-2 gap-2">

                    {[
                      { label: "Total Topups",  value: totalTopup,  sub: `${topups.length} txn`,  color: "text-emerald-400", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.2)",  icon: <TrendingUp className="w-4 h-4 text-emerald-400" /> },
                      { label: "Entry Fees",    value: totalEntry,  sub: `${entries.length} txn`, color: "text-cyan-400",    bg: "rgba(6,182,212,0.08)",   border: "rgba(6,182,212,0.2)",   icon: <CreditCard className="w-4 h-4 text-cyan-400" /> },
                      { label: "Prizes Paid",   value: totalPrize,  sub: `${prizes.length} txn`,  color: "text-amber-400",   bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.2)",  icon: <Trophy className="w-4 h-4 text-amber-400" /> },
                      { label: "Gifts Sent",    value: totalGift,   sub: `${gifts.length} txn`,   color: "text-pink-400",    bg: "rgba(236,72,153,0.08)",  border: "rgba(236,72,153,0.2)",  icon: <Gift className="w-4 h-4 text-pink-400" /> },
                    ].map(item => (
                      <div key={item.label} className="rounded-2xl px-3 py-3 flex flex-col gap-1.5"
                        style={{ background: item.bg, border: `1px solid ${item.border}` }}>
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] text-zinc-500 uppercase tracking-wider font-bold">{item.label}</p>
                          {item.icon}
                        </div>
                        <p className={cn("text-xl font-extrabold leading-none", item.color)}>{item.value.toLocaleString()}</p>
                        <p className="text-[9px] text-zinc-600">{item.sub}</p>
                      </div>
                    ))}
                  </div>

                  {/* ── Winnings Source Breakdown ── */}
                  {prizes.length > 0 && (
                    <div className="rounded-2xl px-4 py-4 flex flex-col gap-3"
                      style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.18)" }}>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Winnings — Match Sources</p>
                        <div className="flex items-center gap-1">
                          <Trophy className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-[10px] text-amber-400 font-bold">{prizes.reduce((s, t) => s + t.amount, 0).toLocaleString()} 💎 total</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                        {prizes.slice().sort((a, b) => b.amount - a.amount).map(p => (
                          <div key={p.id} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                              style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.2)" }}>
                              <Trophy className="w-3.5 h-3.5 text-amber-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] text-zinc-300 font-medium truncate">{p.label || "Match Prize"}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-zinc-600">{fmtRelative(p.createdAt)}</span>
                                {p.tournamentId && <span className="text-[9px] text-zinc-700 font-mono">T#{p.tournamentId}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Gem className="w-3 h-3 text-amber-400" />
                              <span className="text-[12px] font-bold text-amber-300">+{p.amount.toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Monthly area chart ── */}
                  {chartData.length > 0 && (
                    <div className="rounded-2xl px-3 pt-4 pb-2"
                      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-3 px-1">Revenue vs Payouts — Monthly</p>
                      <ResponsiveContainer width="100%" height={160}>
                        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                          <defs>
                            <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.5} />
                              <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gPrize" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.45} />
                              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gGift" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#ec4899" stopOpacity={0.4} />
                              <stop offset="100%" stopColor="#ec4899" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="month" tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={{ background: "#12091e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 11 }}
                            labelStyle={{ color: "#a1a1aa" }}
                            itemStyle={{ color: "#e4e4e7" }}
                          />
                          <Legend wrapperStyle={{ fontSize: 9, color: "#71717a", paddingTop: 6 }} />
                          <Area type="monotone" dataKey="revenue" name="Entry Fees" stroke="#06b6d4" strokeWidth={2} fill="url(#gRev)" dot={false} />
                          <Area type="monotone" dataKey="prizes"  name="Prizes Out" stroke="#f59e0b" strokeWidth={2} fill="url(#gPrize)" dot={false} />
                          <Area type="monotone" dataKey="gifts"   name="Gifts"      stroke="#ec4899" strokeWidth={2} fill="url(#gGift)" dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* ── Monthly profit bar chart ── */}
                  {chartData.length > 0 && (
                    <div className="rounded-2xl px-3 pt-4 pb-2"
                      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-3 px-1">Net Profit — Monthly</p>
                      <ResponsiveContainer width="100%" height={120}>
                        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="month" tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={{ background: "#12091e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 11 }}
                            labelStyle={{ color: "#a1a1aa" }}
                            itemStyle={{ color: "#e4e4e7" }}
                          />
                          <Bar dataKey="profit" name="Net Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* ── Type breakdown bars ── */}
                  <div className="rounded-2xl px-4 py-4 flex flex-col gap-3"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Transaction Breakdown</p>
                    {typeBreakdown.map(row => (
                      <div key={row.label} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {row.icon}
                            <span className="text-[11px] text-zinc-400">{row.label}</span>
                          </div>
                          <span className={cn("text-[11px] font-bold", row.color)}>₹{row.value.toLocaleString()}</span>
                        </div>
                        <div className="h-1.5 rounded-full w-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                          <div className={cn("h-1.5 rounded-full transition-all", row.bar)}
                            style={{ width: `${Math.round((row.value / maxVal) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ── Withdrawal Risk Score ── */}
                  {withdrawalRiskLoading ? (
                    <div className="flex items-center justify-center gap-2 py-6 rounded-2xl"
                      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
                      <span className="text-xs text-zinc-600">Analysing withdrawal risk…</span>
                    </div>
                  ) : withdrawalRisk ? (() => {
                    const { riskScore, riskLevel, diamondSources, withdrawalStats, topupStats, winRatio, flags } = withdrawalRisk;
                    const riskCfg = {
                      low:      { label: "Low Risk",      color: "text-emerald-400", bg: "rgba(16,185,129,0.07)",  border: "rgba(16,185,129,0.2)",  barColor: "bg-emerald-500" },
                      medium:   { label: "Medium Risk",   color: "text-amber-400",   bg: "rgba(245,158,11,0.07)", border: "rgba(245,158,11,0.2)",  barColor: "bg-amber-500"   },
                      high:     { label: "High Risk",     color: "text-orange-400",  bg: "rgba(249,115,22,0.07)", border: "rgba(249,115,22,0.2)",  barColor: "bg-orange-500"  },
                      critical: { label: "Critical Risk", color: "text-red-400",     bg: "rgba(239,68,68,0.07)",  border: "rgba(239,68,68,0.2)",   barColor: "bg-red-500"     },
                    }[riskLevel];
                    const sevCfg = (s: string) => s === "critical" ? "text-red-400 bg-red-500/10 border-red-500/25" : s === "high" ? "text-orange-400 bg-orange-500/10 border-orange-500/20" : s === "medium" ? "text-amber-400 bg-amber-500/10 border-amber-500/20" : "text-zinc-400 bg-white/5 border-white/10";
                    return (
                      <div className="rounded-2xl px-4 py-4 flex flex-col gap-4"
                        style={{ background: riskCfg.bg, border: `1px solid ${riskCfg.border}` }}>
                        {/* Header */}
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: riskCfg.bg, border: `1px solid ${riskCfg.border}` }}>
                            <ShieldAlert className={cn("w-5 h-5", riskCfg.color)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Withdrawal Risk Score</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className={cn("text-2xl font-extrabold leading-none", riskCfg.color)}>{riskScore}</p>
                              <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border", riskCfg.color, riskCfg.border.replace("rgba", "rgba").replace("0.2", "0.25"))}
                                style={{ background: riskCfg.bg, borderColor: riskCfg.border }}>
                                {riskCfg.label}
                              </span>
                            </div>
                          </div>
                          <button onClick={() => {
                            setWithdrawalRisk(null);
                            setWithdrawalRiskLoading(true);
                            saFetch<WithdrawalRisk>(`/admin/users/${user!.id}/withdrawal-risk`, token!)
                              .then(setWithdrawalRisk).catch(() => {}).finally(() => setWithdrawalRiskLoading(false));
                          }} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                            <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
                          </button>
                        </div>

                        {/* Risk bar */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between text-[9px] text-zinc-600">
                            <span>0 — Safe</span><span>100 — Max Risk</span>
                          </div>
                          <div className="h-2 rounded-full w-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                            <div className={cn("h-2 rounded-full transition-all", riskCfg.barColor)} style={{ width: `${riskScore}%` }} />
                          </div>
                        </div>

                        {/* Diamond source origin */}
                        <div className="flex flex-col gap-2 rounded-xl px-3 py-3"
                          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                          <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold">Diamond Origin</p>
                          <div className="flex gap-1 h-3 rounded-full overflow-hidden w-full">
                            {diamondSources.topupPercent > 0 && <div className="bg-emerald-500 h-full transition-all" style={{ width: `${diamondSources.topupPercent}%` }} title="Top-ups" />}
                            {diamondSources.prizePercent > 0 && <div className="bg-amber-500 h-full transition-all" style={{ width: `${diamondSources.prizePercent}%` }} title="Prizes" />}
                            {diamondSources.giftPercent  > 0 && <div className="bg-pink-500 h-full transition-all" style={{ width: `${diamondSources.giftPercent}%` }} title="Gifts" />}
                          </div>
                          <div className="flex gap-3 flex-wrap">
                            {[
                              { label: "Top-ups", pct: diamondSources.topupPercent, val: diamondSources.fromTopups, color: "text-emerald-400", dot: "bg-emerald-500" },
                              { label: "Prizes",  pct: diamondSources.prizePercent, val: diamondSources.fromPrizes, color: "text-amber-400",   dot: "bg-amber-500"   },
                              { label: "Gifts",   pct: diamondSources.giftPercent,  val: diamondSources.fromGifts,  color: "text-pink-400",    dot: "bg-pink-500"    },
                            ].map(s => (
                              <div key={s.label} className="flex items-center gap-1.5">
                                <div className={cn("w-2 h-2 rounded-full shrink-0", s.dot)} />
                                <span className="text-[10px] text-zinc-500">{s.label}</span>
                                <span className={cn("text-[10px] font-bold", s.color)}>{s.pct}% ({s.val.toLocaleString()}💎)</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Stats row */}
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            { label: "Withdrawn",   value: `${withdrawalStats.totalWithdrawn.toLocaleString()}💎`, sub: `${withdrawalStats.paidRequests} paid` },
                            { label: "Pending WD",  value: `${withdrawalStats.pendingWithdraw.toLocaleString()}💎`, sub: `${withdrawalStats.totalRequests} total` },
                            { label: "Win Ratio",   value: winRatio !== null ? `${winRatio}x` : "N/A", sub: "prize ÷ entry" },
                            { label: "Verified ₹",  value: `₹${topupStats.verifiedRupees.toLocaleString()}`, sub: `${topupStats.verified}/${topupStats.total} topups` },
                            { label: "Rejected UTR",value: `${topupStats.rejected}`, sub: topupStats.rejected > 0 ? "suspicious" : "clean" },
                            { label: "7-day WDs",   value: `${withdrawalStats.recentCount}`, sub: "velocity" },
                          ].map(s => (
                            <div key={s.label} className="rounded-xl px-2.5 py-2 flex flex-col gap-0.5"
                              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                              <p className="text-[8px] text-zinc-600 uppercase tracking-wider font-bold">{s.label}</p>
                              <p className="text-[11px] font-bold text-white">{s.value}</p>
                              <p className="text-[9px] text-zinc-600">{s.sub}</p>
                            </div>
                          ))}
                        </div>

                        {/* Flags */}
                        {flags.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold">Risk Signals ({flags.length})</p>
                            {flags.map((f, i) => (
                              <div key={i} className={cn("flex items-start gap-2 rounded-xl px-3 py-2.5 border text-[11px]", sevCfg(f.severity))}>
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span className="text-zinc-300">{f.detail}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {flags.length === 0 && (
                          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                            style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="text-[11px] text-emerald-300">No risk signals detected — user looks clean</span>
                          </div>
                        )}
                      </div>
                    );
                  })() : null}

                  {/* ── No data fallback ── */}
                  {wallet.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                        style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)" }}>
                        <CreditCard className="w-6 h-6 text-violet-400/50" />
                      </div>
                      <div>
                        <p className="text-zinc-400 text-sm font-medium">No transactions yet</p>
                        <p className="text-zinc-600 text-xs mt-0.5">Payment data will appear once this user has activity</p>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {section === "comms" && user && (
          <div className="flex flex-col gap-4 pt-2">

            {/* Template chips */}
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2 px-0.5">Message Templates</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(COMM_TEMPLATES).map(([key, tmpl]) => (
                  <button
                    key={key}
                    className={cn(
                      "rounded-xl px-3 py-2.5 text-left border transition-all",
                      commsTemplate === key
                        ? `${tmpl.bg} ${tmpl.accentClass} font-bold`
                        : "bg-white/4 border-white/8 text-zinc-400 hover:text-white hover:bg-white/6"
                    )}
                    onClick={() => {
                      setCommsTemplate(key);
                      setCommsTitle(tmpl.defaultTitle);
                      setCommsBody(tmpl.defaultBody);
                      setCommsType(tmpl.type);
                    }}
                  >
                    <span className="text-[11px] font-semibold">{tmpl.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Compose */}
            <div className="rounded-2xl overflow-hidden border border-white/8">
              <div className="px-4 py-2.5 border-b border-white/5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                <Send className="w-3 h-3" /> Compose Message
              </div>
              <div className="p-4 flex flex-col gap-3">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Notification Type</label>
                  <select
                    value={commsType}
                    onChange={e => setCommsType(e.target.value)}
                    className="w-full rounded-lg bg-black/50 border border-white/10 text-white text-xs px-3 py-2 focus:outline-none focus:border-white/20"
                  >
                    {["general", "tournament", "wallet", "result", "moderation", "system"].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Title</label>
                  <input
                    value={commsTitle}
                    onChange={e => setCommsTitle(e.target.value)}
                    placeholder="Notification title..."
                    className="w-full rounded-lg bg-black/50 border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-white/20 placeholder:text-zinc-600"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Message</label>
                  <textarea
                    value={commsBody}
                    onChange={e => setCommsBody(e.target.value)}
                    placeholder="Write your message here..."
                    rows={4}
                    className="w-full rounded-lg bg-black/50 border border-white/10 text-white text-sm px-3 py-2 resize-none focus:outline-none focus:border-white/20 placeholder:text-zinc-600"
                  />
                </div>
                <button
                  disabled={!commsTitle.trim() || !commsBody.trim() || commsBusy}
                  onClick={async () => {
                    setCommsBusy(true);
                    try {
                      const result = await saFetch<{ id: number; createdAt: string }>(`/admin/users/${userId}/notify`, token, {
                        method: "POST",
                        body: JSON.stringify({ title: commsTitle.trim(), body: commsBody.trim(), type: commsType }),
                      });
                      setNotifs(prev => [{ id: result.id, type: commsType, title: commsTitle.trim(), body: commsBody.trim(), read: false, createdAt: result.createdAt }, ...prev]);
                      toast({ title: "Message sent", description: `"${commsTitle.trim()}" delivered to ${user.inGameName ?? user.phone}.` });
                      setCommsTitle("");
                      setCommsBody("");
                      setCommsTemplate("custom");
                    } catch (e) {
                      toast({ title: "Failed to send", description: String(e), variant: "destructive" });
                    } finally { setCommsBusy(false); }
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl py-2.5 bg-primary hover:bg-primary/90 text-white font-bold text-sm disabled:opacity-40 transition-colors"
                >
                  <Send className="w-4 h-4" />
                  {commsBusy ? "Sending..." : "Send Message"}
                </button>
              </div>
            </div>

            {/* Sent history */}
            {notifs.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2 px-0.5">Sent History ({notifs.length})</p>
                <div className="flex flex-col gap-2">
                  {notifs.slice(0, 15).map(n => (
                    <div key={n.id} className="rounded-xl px-4 py-3 border border-white/6 bg-white/3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{n.title}</p>
                          <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2 leading-relaxed">{n.body}</p>
                        </div>
                        <span className="text-[10px] text-zinc-600 shrink-0 mt-0.5">{fmtRelative(n.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-zinc-600 font-mono">{n.type}</span>
                        <span className="text-[10px] text-zinc-700">·</span>
                        <span className={cn("text-[10px] font-bold", n.read ? "text-emerald-600" : "text-zinc-600")}>
                          {n.read ? "Read" : "Unread"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {notifs.length === 0 && (
              <div className="text-center py-8 text-sm text-zinc-600">No messages sent yet</div>
            )}
          </div>
        )}

        {/* ── ACHIEVEMENTS SECTION ── */}
        {section === "achievements" && (
          <div className="flex flex-col gap-4 pt-2">
            {/* Header + Grant button */}
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                {achievements.length} achievement{achievements.length !== 1 ? "s" : ""} · {achievements.filter(a => a.isUnlocked).length} unlocked
              </p>
              <button
                onClick={() => {
                  setEditingAchievement(null);
                  setAchIcon("🏆");
                  setAchBgColor("#f59e0b");
                  setAchTitle("");
                  setAchSubtitle("");
                  setAchDescription("");
                  setAchUnlocked(true);
                  setShowAchievementForm(true);
                }}
                className="flex items-center gap-1.5 text-[11px] font-bold text-primary border border-primary/25 bg-primary/10 px-3 py-1.5 rounded-xl hover:bg-primary/20 transition-colors"
              >
                <Award className="w-3.5 h-3.5" /> Grant Achievement
              </button>
            </div>

            {achievementsLoading && (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-white/4 animate-pulse" />)}
              </div>
            )}

            {!achievementsLoading && achievements.length === 0 && !showAchievementForm && (
              <div className="text-center py-10 text-sm text-zinc-600">No achievements yet. Grant one above!</div>
            )}

            {!achievementsLoading && achievements.length > 0 && (
              <div className="grid grid-cols-3 gap-2.5">
                {achievements.map(ach => (
                  <button
                    key={ach.id}
                    className="rounded-2xl p-3 text-center relative overflow-hidden group cursor-pointer transition-all active:scale-95"
                    style={{
                      background: ach.isUnlocked
                        ? `linear-gradient(135deg, ${ach.bgColor}33 0%, ${ach.bgColor}11 100%)`
                        : "rgba(255,255,255,0.03)",
                      border: ach.isUnlocked ? `1px solid ${ach.bgColor}44` : "1px solid rgba(255,255,255,0.06)",
                    }}
                    onClick={() => {
                      setEditingAchievement(ach);
                      setAchIcon(ach.icon);
                      setAchBgColor(ach.bgColor);
                      setAchTitle(ach.title);
                      setAchSubtitle(ach.subtitle);
                      setAchDescription(ach.description);
                      setAchUnlocked(ach.isUnlocked);
                      setShowAchievementForm(true);
                    }}
                  >
                    {ach.isUnlocked && (
                      <div className="absolute -top-2 -right-2 w-12 h-12 rounded-full opacity-25 pointer-events-none"
                        style={{ background: `radial-gradient(circle, ${ach.bgColor}cc 0%, transparent 70%)` }}
                      />
                    )}
                    {!ach.isUnlocked && (
                      <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center border border-white/10">
                        <span className="text-[8px]">🔒</span>
                      </div>
                    )}
                    <div
                      className="relative w-10 h-10 mx-auto rounded-xl flex items-center justify-center mb-2 text-xl leading-none"
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
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                      <span className="text-[10px] font-bold text-white">Edit</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Achievement Form */}
            {showAchievementForm && (
              <div className="rounded-2xl border border-white/10 bg-white/3 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-2"><Award className="w-3 h-3" />{editingAchievement ? "Edit Achievement" : "Grant Achievement"}</span>
                  <button onClick={() => setShowAchievementForm(false)} className="text-zinc-600 hover:text-white transition-colors">
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="p-4 flex flex-col gap-4">
                  {/* Icon picker */}
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-2">Icon</label>
                    <div className="flex flex-wrap gap-1.5">
                      {ACH_ICONS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => setAchIcon(emoji)}
                          className="w-8 h-8 rounded-lg text-lg flex items-center justify-center transition-all"
                          style={{
                            background: achIcon === emoji ? `${achBgColor}33` : "rgba(255,255,255,0.04)",
                            border: achIcon === emoji ? `1.5px solid ${achBgColor}80` : "1px solid rgba(255,255,255,0.08)",
                            transform: achIcon === emoji ? "scale(1.15)" : "scale(1)",
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color picker */}
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-2">Background Color</label>
                    <div className="flex flex-wrap gap-2">
                      {ACH_COLORS.map(color => (
                        <button
                          key={color}
                          onClick={() => setAchBgColor(color)}
                          className="w-7 h-7 rounded-full transition-all"
                          style={{
                            background: color,
                            border: achBgColor === color ? "2px solid white" : "2px solid transparent",
                            transform: achBgColor === color ? "scale(1.2)" : "scale(1)",
                            boxShadow: achBgColor === color ? `0 0 8px ${color}99` : "none",
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Title */}
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Title *</label>
                    <input
                      value={achTitle}
                      onChange={e => setAchTitle(e.target.value)}
                      placeholder="e.g. Tournament King"
                      className="w-full rounded-lg bg-black/50 border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-white/20 placeholder:text-zinc-600"
                    />
                  </div>

                  {/* Subtitle */}
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Subtitle</label>
                    <input
                      value={achSubtitle}
                      onChange={e => setAchSubtitle(e.target.value)}
                      placeholder="e.g. Won 10+ tournaments"
                      className="w-full rounded-lg bg-black/50 border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-white/20 placeholder:text-zinc-600"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Description</label>
                    <textarea
                      value={achDescription}
                      onChange={e => setAchDescription(e.target.value)}
                      placeholder="Detailed description of this achievement..."
                      rows={2}
                      className="w-full rounded-lg bg-black/50 border border-white/10 text-white text-sm px-3 py-2 resize-none focus:outline-none focus:border-white/20 placeholder:text-zinc-600"
                    />
                  </div>

                  {/* Unlocked toggle */}
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <p className="text-xs font-bold text-white">Unlocked</p>
                      <p className="text-[10px] text-zinc-500">Visible on user's profile when unlocked</p>
                    </div>
                    <button
                      onClick={() => setAchUnlocked(p => !p)}
                      className={cn("w-11 h-6 rounded-full transition-colors relative", achUnlocked ? "bg-primary" : "bg-white/10")}
                    >
                      <span className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", achUnlocked ? "left-6" : "left-1")} />
                    </button>
                  </div>

                  {/* Live Preview */}
                  <div className="flex flex-col items-center py-3 rounded-xl border border-white/6 bg-black/20">
                    <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-3">Preview</p>
                    <div
                      className="rounded-2xl p-3 text-center relative overflow-hidden w-28"
                      style={{
                        background: achUnlocked
                          ? `linear-gradient(135deg, ${achBgColor}33 0%, ${achBgColor}11 100%)`
                          : "rgba(255,255,255,0.03)",
                        border: achUnlocked ? `1px solid ${achBgColor}44` : "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {achUnlocked && (
                        <div className="absolute -top-2 -right-2 w-10 h-10 rounded-full opacity-25 pointer-events-none"
                          style={{ background: `radial-gradient(circle, ${achBgColor}cc 0%, transparent 70%)` }}
                        />
                      )}
                      <div
                        className="relative w-10 h-10 mx-auto rounded-xl flex items-center justify-center mb-2 text-2xl leading-none"
                        style={{
                          background: achUnlocked ? `${achBgColor}22` : "rgba(0,0,0,0.3)",
                          border: achUnlocked ? `1px solid ${achBgColor}44` : "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        {achIcon}
                      </div>
                      <div className={cn("text-[11px] font-bold leading-tight truncate", achUnlocked ? "text-white" : "text-zinc-500")}>
                        {achTitle || "Title"}
                      </div>
                      {achSubtitle && (
                        <div className="text-[9px] text-zinc-600 mt-0.5 leading-tight truncate">{achSubtitle}</div>
                      )}
                    </div>
                  </div>

                  {/* Save / Delete */}
                  <div className="flex gap-2">
                    {editingAchievement && (
                      <button
                        onClick={async () => {
                          if (!editingAchievement) return;
                          setAchDeleting(editingAchievement.id);
                          try {
                            await saFetch<void>(`/admin/achievements/${editingAchievement.id}`, token, { method: "DELETE" });
                            setAchievements(prev => prev.filter(a => a.id !== editingAchievement.id));
                            setShowAchievementForm(false);
                            toast({ title: "Achievement deleted" });
                          } catch (e) {
                            toast({ title: String(e), variant: "destructive" });
                          } finally { setAchDeleting(null); }
                        }}
                        disabled={!!achDeleting || achSaving}
                        className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-4 border border-red-500/25 bg-red-500/10 text-red-400 text-sm font-bold disabled:opacity-40 hover:bg-red-500/20 transition-colors"
                      >
                        {achDeleting ? <div className="w-3.5 h-3.5 rounded-full border-2 border-red-400/30 border-t-red-400 animate-spin" /> : "Delete"}
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        if (!achTitle.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
                        setAchSaving(true);
                        try {
                          if (editingAchievement) {
                            const updated = await saFetch<Achievement>(`/admin/achievements/${editingAchievement.id}`, token, {
                              method: "PUT",
                              body: JSON.stringify({ icon: achIcon, bgColor: achBgColor, title: achTitle.trim(), subtitle: achSubtitle.trim(), description: achDescription.trim(), isUnlocked: achUnlocked }),
                            });
                            setAchievements(prev => prev.map(a => a.id === editingAchievement.id ? updated : a));
                            toast({ title: "Achievement updated" });
                          } else {
                            const created = await saFetch<Achievement>(`/admin/users/${userId}/achievements`, token, {
                              method: "POST",
                              body: JSON.stringify({ icon: achIcon, bgColor: achBgColor, title: achTitle.trim(), subtitle: achSubtitle.trim(), description: achDescription.trim(), isUnlocked: achUnlocked }),
                            });
                            setAchievements(prev => [...prev, created]);
                            toast({ title: "Achievement granted!" });
                          }
                          setShowAchievementForm(false);
                        } catch (e) {
                          toast({ title: String(e), variant: "destructive" });
                        } finally { setAchSaving(false); }
                      }}
                      disabled={achSaving || !!achDeleting || !achTitle.trim()}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 bg-primary hover:bg-primary/90 text-white font-bold text-sm disabled:opacity-40 transition-colors"
                    >
                      {achSaving
                        ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        : (editingAchievement ? "Save Changes" : "Grant Achievement")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

        </div>
      </div>

    </div>
  );
}

// ── 2FA Pending Card (admin approve/reject) ───────────────────────────────────
function TwoFaPendingCard({ userId, autoApproveAt, onAction }: {
  userId: number;
  autoApproveAt: string | null;
  onAction: (update: Partial<{ twoFaEnabled: boolean; twoFaPending: boolean; twoFaPendingAt: string | null; twoFaAutoApproveAt: string | null; twoFaPassword: string | null; }>) => void;
}) {
  const session = getSession();
  const token = session?.token ?? "";
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);
  const { toast } = useToast();

  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!autoApproveAt) return;
    function tick() { setRemaining(Math.max(0, new Date(autoApproveAt!).getTime() - Date.now())); }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [autoApproveAt]);
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const countdown = `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;

  async function handle(action: "approve" | "reject") {
    setActing(action);
    try {
      const res = await fetch(`/api/admin/users/${userId}/2fa/${action}`, {
        method: "POST",
        headers: { "x-super-admin-token": token, "content-type": "application/json" },
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast({ title: `Failed to ${action}`, description: (e as { error?: string }).error ?? "Error", variant: "destructive" });
        return;
      }
      toast({ title: action === "approve" ? "2FA Approved" : "2FA Rejected", description: action === "approve" ? "The user's 2FA is now active." : "The pending 2FA request was rejected." });
      onAction(action === "approve"
        ? { twoFaEnabled: true, twoFaPending: false, twoFaPendingAt: null, twoFaAutoApproveAt: null }
        : { twoFaPending: false, twoFaPendingAt: null, twoFaAutoApproveAt: null, twoFaPassword: null });
    } finally { setActing(null); }
  }

  return (
    <div className="mt-1 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[11px] text-amber-400">
        <Clock className="w-3 h-3" />
        <span>Auto-approves in <span className="font-mono font-bold">{countdown}</span></span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => handle("approve")}
          disabled={!!acting}
          className="flex-1 h-8 rounded-xl text-xs font-bold text-emerald-300 border border-emerald-500/25 bg-emerald-500/10 active:bg-emerald-500/20 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
          {acting === "approve" ? <div className="w-3 h-3 rounded-full border-2 border-emerald-300/30 border-t-emerald-300 animate-spin" /> : <><Check className="w-3 h-3" /> Approve</>}
        </button>
        <button
          onClick={() => handle("reject")}
          disabled={!!acting}
          className="flex-1 h-8 rounded-xl text-xs font-bold text-red-400 border border-red-500/25 bg-red-500/10 active:bg-red-500/20 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
          {acting === "reject" ? <div className="w-3 h-3 rounded-full border-2 border-red-400/30 border-t-red-400 animate-spin" /> : <><XIcon className="w-3 h-3" /> Reject</>}
        </button>
      </div>
    </div>
  );
}
