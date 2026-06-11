import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  Shield, Lock, Eye, EyeOff, LogOut, BarChart3, Trophy, Users, Swords,
  Bell, ClipboardList, Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  Search, RefreshCw, Download, X, Check, AlertTriangle, Gem, Crown,
  Activity, Send, Filter, Clock, ArrowUpRight, ArrowDownLeft, Loader2,
  Copy, UserCheck, UserX, ChevronLeft, Settings, Hash, Zap, Database, Menu, Images,
  KeyRound, CheckCircle2, Target,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────

const REQUIRED_UC = "a464dfd00a173f6e10ac6a4774c62f52";
const SESSION_KEY = "czsa_v1_session";
const LOCKOUT_KEY = "czsa_v1_lockout";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const SESSION_DURATION = 15 * 24 * 60 * 60 * 1000;
const INACTIVITY_MS = 15 * 60 * 1000;

interface SASession { token: string; expiresAt: number; }
interface LockoutInfo { attempts: number; lockoutUntil: number | null; }

type Tab = "dashboard" | "tournaments" | "users" | "squads" | "broadcast" | "logs" | "settings";

interface Stats {
  totalUsers: number; adminUsers: number;
  totalTournaments: number; activeTournaments: number;
  upcomingTournaments: number; completedTournaments: number;
  totalParticipants: number; totalDiamondsInCirculation: number;
  totalPrizesDistributed: number; totalTopups: number;
  totalEntryFees: number; totalSquads: number;
  totalTransactions: number; totalLogEntries: number;
}

interface AdminTournament {
  id: number; title: string; gameMode: string; status: string;
  entryFeeDiamonds: number; prizePoolDiamonds: number;
  maxSlots: number; filledSlots: number; startTime: string;
  roomId: string | null; roomPassword: string | null;
}

interface Participant {
  id: number; userId: number; inGameName: string | null; phone: string;
  kills: number; placement: number | null; diamondsWon: number; joinedAt: string;
}

interface AdminUser {
  id: number; phone: string; inGameName: string | null; uid: string | null;
  diamondBalance: number; isAdmin: boolean; createdAt: string;
}

interface AdminSquad {
  id: number; name: string; uid: string;
  leaderId: number; leaderName: string; leaderPhone: string;
  memberCount: number; createdAt: string;
}

interface SquadMember {
  id: number; userId: number; role: string; status: string;
  inGameName: string | null; phone: string | null; uid: string | null; joinedAt: string;
}

interface AdminLog {
  id: number; action: string; category: string;
  details: string | null; targetId: string | null; targetType: string | null; createdAt: string;
}

// ─── Session helpers ──────────────────────────────────────────────────────

function getSession(): SASession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SASession;
    if (Date.now() > s.expiresAt) { localStorage.removeItem(SESSION_KEY); return null; }
    return s;
  } catch { return null; }
}

function saveSession(token: string): SASession {
  const s: SASession = { token, expiresAt: Date.now() + SESSION_DURATION };
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  return s;
}

function getLockout(): LockoutInfo {
  try {
    const raw = sessionStorage.getItem(LOCKOUT_KEY);
    return raw ? JSON.parse(raw) : { attempts: 0, lockoutUntil: null };
  } catch { return { attempts: 0, lockoutUntil: null }; }
}

function recordFail(): LockoutInfo {
  const info = getLockout();
  const attempts = info.attempts + 1;
  const lockoutUntil = attempts >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : null;
  const next: LockoutInfo = { attempts, lockoutUntil };
  sessionStorage.setItem(LOCKOUT_KEY, JSON.stringify(next));
  return next;
}

function clearLockout() { sessionStorage.removeItem(LOCKOUT_KEY); }

// ─── API helpers ──────────────────────────────────────────────────────────

async function saFetch<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Super-Admin-Token": token,
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Format helpers ───────────────────────────────────────────────────────

function fmtTime(iso: string) {
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return ""; }
}

function fmtDateTime(iso: string) {
  try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

// ─── Category badge ───────────────────────────────────────────────────────

const CAT_COLORS: Record<string, { bg: string; text: string }> = {
  auth: { bg: "bg-purple-500/20", text: "text-purple-300" },
  tournament: { bg: "bg-amber-500/20", text: "text-amber-300" },
  user: { bg: "bg-blue-500/20", text: "text-blue-300" },
  squad: { bg: "bg-emerald-500/20", text: "text-emerald-300" },
  notification: { bg: "bg-pink-500/20", text: "text-pink-300" },
  general: { bg: "bg-zinc-500/20", text: "text-zinc-400" },
};

function CatBadge({ cat }: { cat: string }) {
  const c = CAT_COLORS[cat] ?? CAT_COLORS.general;
  return (
    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider", c.bg, c.text)}>
      {cat}
    </span>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    upcoming: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    ongoing: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    completed: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    cancelled: "bg-red-500/20 text-red-300 border-red-500/30",
  };
  return (
    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", map[status] ?? map.completed)}>
      {status}
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: React.ElementType; color: string;
}) {
  return (
    <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-500 truncate">{label}</p>
        <p className="text-lg font-bold text-white font-heading">{typeof value === "number" ? value.toLocaleString() : value}</p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // ── Security state
  const [phase, setPhase] = useState<"checking" | "denied" | "gate" | "unlocked">("checking");
  const [token, setToken] = useState("");
  const [session, setSession] = useState<SASession | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [lockoutInfo, setLockoutInfo] = useState<LockoutInfo>({ attempts: 0, lockoutUntil: null });
  const [lockoutLeft, setLockoutLeft] = useState(0);
  const [sessionLeft, setSessionLeft] = useState(0);
  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPassphraseLocked, setIsPassphraseLocked] = useState(false);
  const [lockPassInput, setLockPassInput] = useState("");
  const [lockPassError, setLockPassError] = useState("");
  const [lockPassLoading, setLockPassLoading] = useState(false);
  const [showLockPass, setShowLockPass] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");

  // ── Tab & data state
  const [tab, setTab] = useState<Tab>("dashboard");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tournaments, setTournaments] = useState<AdminTournament[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [squads, setSquads] = useState<AdminSquad[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);

  // ── Search & filter state
  const [tournamentSearch, setTournamentSearch] = useState("");
  const [tournamentStatusFilter, setTournamentStatusFilter] = useState("all");
  const [userSearch, setUserSearch] = useState("");
  const [squadSearch, setSquadSearch] = useState("");
  const [logSearch, setLogSearch] = useState("");
  const [logCategory, setLogCategory] = useState("all");

  // ── Modal state
  const [showCreateTournament, setShowCreateTournament] = useState(false);
  const [editingTournament, setEditingTournament] = useState<AdminTournament | null>(null);
  const [participantsFor, setParticipantsFor] = useState<AdminTournament | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const [diamondModal, setDiamondModal] = useState<{ user: AdminUser; mode: "add" | "sub" | "set" } | null>(null);
  const [diamondAmount, setDiamondAmount] = useState("");
  const [squadMembersFor, setSquadMembersFor] = useState<AdminSquad | null>(null);
  const [squadMembers, setSquadMembers] = useState<SquadMember[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteConfirmType, setDeleteConfirmType] = useState<"tournament" | "squad" | "user" | null>(null);
  const [notifModal, setNotifModal] = useState<{ user: AdminUser } | null>(null);
  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");
  const [notifType, setNotifType] = useState("system");
  const [notifLoading, setNotifLoading] = useState(false);

  // ── Payment settings state
  interface PaymentSettings { upiId: string; upiName: string; ratePerDiamond: number; minTopup: number; minWithdrawal: number; isEnabled: boolean; }
  const [paySettings, setPaySettings] = useState<PaymentSettings | null>(null);
  const [payForm, setPayForm] = useState({ upiId: "", upiName: "", ratePerDiamond: "", minTopup: "", minWithdrawal: "", isEnabled: true });
  const [paySaving, setPaySaving] = useState(false);
  const [payEditing, setPayEditing] = useState(false);

  // ── System settings (API keys) state
  interface SystemSettingsDisplay { freefireApiKeySet: boolean; freefireApiKeyPreview: string; }
  const [sysSettings, setSysSettings] = useState<SystemSettingsDisplay | null>(null);
  const [ffKeyInput, setFfKeyInput] = useState("");
  const [ffKeyVisible, setFfKeyVisible] = useState(false);
  const [ffKeySaving, setFfKeySaving] = useState(false);

  // ── Broadcast state
  const [bcastTarget, setBcastTarget] = useState<"all" | "user">("all");
  const [bcastUserId, setBcastUserId] = useState("");
  const [bcastType, setBcastType] = useState("system");
  const [bcastTitle, setBcastTitle] = useState("");
  const [bcastBody, setBcastBody] = useState("");
  const [bcastLoading, setBcastLoading] = useState(false);

  // ── Tournament form state
  const emptyTForm = () => ({
    title: "", gameMode: "Battle Royale", entryFeeDiamonds: 50,
    prizePoolDiamonds: 1000, maxSlots: 100,
    startTime: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    status: "upcoming", roomId: "", roomPassword: "",
  });
  const [tForm, setTForm] = useState(emptyTForm());

  // ── Participant edit state
  const [pEdit, setPEdit] = useState<{ kills: string; placement: string; diamonds: string }>({ kills: "", placement: "", diamonds: "" });

  // ─────────────────────────────────────────────────────────────────────────
  // Init: URL check + session restore
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uc = params.get("uc");
    if (uc !== null && uc !== REQUIRED_UC) { setPhase("denied"); return; }

    const saved = getSession();
    if (saved) {
      setSession(saved); setToken(saved.token); setPhase("unlocked");
    } else {
      setLockoutInfo(getLockout());
      setPhase("gate");
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Lockout countdown
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!lockoutInfo.lockoutUntil) return;
    const tick = () => setLockoutLeft(Math.max(0, Math.ceil((lockoutInfo.lockoutUntil! - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockoutInfo.lockoutUntil]);

  // ─────────────────────────────────────────────────────────────────────────
  // Session timer
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!session) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000));
      setSessionLeft(left);
      if (left === 0) handleLogout();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session]);

  // ─────────────────────────────────────────────────────────────────────────
  // Inactivity timer (15 min) — locks behind passphrase if inactive
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "unlocked") return;

    function resetTimer() {
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
      inactivityRef.current = setTimeout(() => {
        setIsPassphraseLocked(true);
        setLockPassInput(""); setLockPassError("");
      }, INACTIVITY_MS);
    }

    function onActivity() {
      if (!isPassphraseLocked) resetTimer();
    }

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }));
    resetTimer();

    return () => {
      events.forEach(e => window.removeEventListener(e, onActivity));
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
    };
  }, [phase, isPassphraseLocked]);

  // ─────────────────────────────────────────────────────────────────────────
  // Load data when tab changes
  // ─────────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async (t: Tab) => {
    if (!token) return;
    setLoading(true);
    try {
      if (t === "dashboard") {
        const [s, l] = await Promise.all([
          saFetch<Stats>("/super-admin/full-stats", token),
          saFetch<AdminLog[]>("/super-admin/logs?limit=20", token),
        ]);
        setStats(s); setLogs(l);
      } else if (t === "tournaments") {
        const data = await saFetch<AdminTournament[]>("/admin/tournaments", token);
        setTournaments(data);
      } else if (t === "users") {
        const data = await saFetch<AdminUser[]>("/admin/users", token);
        setUsers(data);
      } else if (t === "squads") {
        const data = await saFetch<AdminSquad[]>("/super-admin/squads", token);
        setSquads(data);
      } else if (t === "logs") {
        const data = await saFetch<AdminLog[]>("/super-admin/logs", token);
        setLogs(data);
      } else if (t === "settings") {
        const data = await saFetch<{ upiId: string; upiName: string; ratePerDiamond: number; minTopup: number; minWithdrawal: number; isEnabled: boolean }>("/super-admin/payment-settings", token);
        setPaySettings(data);
        setPayForm({ upiId: data.upiId, upiName: data.upiName, ratePerDiamond: String(data.ratePerDiamond), minTopup: String(data.minTopup), minWithdrawal: String(data.minWithdrawal ?? 50), isEnabled: data.isEnabled });
        setPayEditing(false);
        const sysData = await saFetch<{ freefireApiKeySet: boolean; freefireApiKeyPreview: string }>("/admin/system-settings", token);
        setSysSettings(sysData);
        setFfKeyInput("");
      }
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to load", variant: "destructive" });
    } finally { setLoading(false); }
  }, [token, toast]);

  useEffect(() => {
    if (phase === "unlocked" && token) loadData(tab);
  }, [tab, phase, token]);

  // ─────────────────────────────────────────────────────────────────────────
  // Activity logger
  // ─────────────────────────────────────────────────────────────────────────

  const logAction = useCallback(async (action: string, category: string, details: string, targetId?: string, targetType?: string) => {
    if (!token) return;
    try {
      await saFetch<unknown>("/super-admin/logs", token, {
        method: "POST",
        body: JSON.stringify({ action, category, details, targetId, targetType }),
      });
    } catch { /* non-blocking */ }
  }, [token]);

  // ─────────────────────────────────────────────────────────────────────────
  // Auth
  // ─────────────────────────────────────────────────────────────────────────

  async function handleAuth() {
    const li = getLockout();
    if (li.lockoutUntil && Date.now() < li.lockoutUntil) return;
    if (!usernameInput.trim()) { setCodeError("Enter your username."); return; }
    if (!passwordInput.trim()) { setCodeError("Enter your password."); return; }
    if (!codeInput.trim()) { setCodeError("Enter the security code."); return; }
    setAuthLoading(true); setCodeError("");
    try {
      const data = await fetch("/api/super-admin/auth", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: usernameInput.trim(), password: passwordInput.trim(), code: codeInput.trim() }),
      }).then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({ error: "Invalid credentials" })); throw new Error(e.error); }
        return r.json() as Promise<{ token: string; expiresIn: number }>;
      });
      clearLockout();
      const s = saveSession(data.token);
      setSession(s); setToken(data.token);
      setPhase("unlocked");
    } catch (err) {
      const info = recordFail();
      setLockoutInfo(info);
      if (info.lockoutUntil) {
        setCodeError(`Too many failed attempts. Locked for 15 minutes.`);
      } else {
        setCodeError(err instanceof Error ? err.message : `Authentication failed. ${MAX_ATTEMPTS - info.attempts} attempt${MAX_ATTEMPTS - info.attempts !== 1 ? "s" : ""} remaining.`);
      }
      setPasswordInput(""); setCodeInput("");
    } finally { setAuthLoading(false); }
  }

  function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    setSession(null); setToken(""); setPhase("gate");
    setIsPassphraseLocked(false); setLockPassInput(""); setLockPassError("");
    setUsernameInput(""); setPasswordInput(""); setCodeInput(""); setCodeError("");
    setStats(null); setTournaments([]); setUsers([]); setSquads([]); setLogs([]);
  }

  async function handleVerifyPassphrase() {
    if (!lockPassInput.trim()) { setLockPassError("Enter the security passphrase."); return; }
    setLockPassLoading(true); setLockPassError("");
    try {
      const res = await fetch("/api/super-admin/verify-code", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Super-Admin-Token": token },
        body: JSON.stringify({ code: lockPassInput.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: "Invalid passphrase" }));
        throw new Error((e as { error?: string }).error ?? "Invalid passphrase");
      }
      setIsPassphraseLocked(false);
      setLockPassInput(""); setLockPassError("");
    } catch (err) {
      setLockPassError(err instanceof Error ? err.message : "Invalid passphrase.");
      setLockPassInput("");
    } finally { setLockPassLoading(false); }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tournament actions
  // ─────────────────────────────────────────────────────────────────────────

  async function handleCreateTournament() {
    try {
      const body = { ...tForm, entryFeeDiamonds: Number(tForm.entryFeeDiamonds), prizePoolDiamonds: Number(tForm.prizePoolDiamonds), maxSlots: Number(tForm.maxSlots), startTime: new Date(tForm.startTime).toISOString(), roomId: tForm.roomId || null, roomPassword: tForm.roomPassword || null };
      await saFetch<unknown>("/admin/tournaments", token, { method: "POST", body: JSON.stringify(body) });
      await logAction("create_tournament", "tournament", `Created tournament "${tForm.title}"`);
      toast({ title: "Tournament created!" });
      setShowCreateTournament(false); setTForm(emptyTForm());
      loadData("tournaments");
    } catch (e: unknown) { toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" }); }
  }

  async function handleUpdateTournament() {
    if (!editingTournament) return;
    try {
      const body = { ...tForm, entryFeeDiamonds: Number(tForm.entryFeeDiamonds), prizePoolDiamonds: Number(tForm.prizePoolDiamonds), maxSlots: Number(tForm.maxSlots), startTime: new Date(tForm.startTime).toISOString(), roomId: tForm.roomId || null, roomPassword: tForm.roomPassword || null };
      await saFetch<unknown>(`/admin/tournaments/${editingTournament.id}`, token, { method: "PUT", body: JSON.stringify(body) });
      await logAction("update_tournament", "tournament", `Updated tournament "${tForm.title}"`, String(editingTournament.id), "tournament");
      toast({ title: "Tournament updated!" });
      setEditingTournament(null); loadData("tournaments");
    } catch (e: unknown) { toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" }); }
  }

  async function handleDeleteTournament(id: number) {
    const t = tournaments.find(x => x.id === id);
    try {
      await saFetch<unknown>(`/admin/tournaments/${id}`, token, { method: "DELETE" });
      await logAction("delete_tournament", "tournament", `Deleted tournament "${t?.title ?? id}"`, String(id), "tournament");
      toast({ title: "Tournament deleted" });
      setDeleteConfirmId(null); loadData("tournaments");
    } catch (e: unknown) { toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" }); }
  }

  async function loadParticipants(t: AdminTournament) {
    setParticipantsFor(t);
    try {
      const data = await saFetch<Participant[]>(`/admin/tournaments/${t.id}/participants`, token);
      setParticipants(data);
    } catch { setParticipants([]); }
  }

  async function handleUpdateParticipant() {
    if (!editingParticipant || !participantsFor) return;
    try {
      const body = {
        kills: Number(pEdit.kills) || 0,
        placement: pEdit.placement ? Number(pEdit.placement) : null,
        diamondsWon: Number(pEdit.diamonds) || 0,
      };
      await saFetch<unknown>(`/admin/tournaments/${participantsFor.id}/participants/${editingParticipant.userId}`, token, { method: "PATCH", body: JSON.stringify(body) });
      await logAction("update_participant", "tournament", `Updated participant ${editingParticipant.inGameName} in "${participantsFor.title}"`, String(editingParticipant.userId), "user");
      toast({ title: "Participant updated!" });
      setEditingParticipant(null); loadParticipants(participantsFor);
    } catch (e: unknown) { toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" }); }
  }

  async function handleRemoveParticipant(p: Participant) {
    if (!participantsFor) return;
    try {
      await saFetch<unknown>(`/admin/tournaments/${participantsFor.id}/participants/${p.userId}`, token, { method: "DELETE" });
      await logAction("remove_participant", "tournament", `Removed ${p.inGameName} from "${participantsFor.title}"`, String(p.userId), "user");
      toast({ title: "Participant removed + refunded" });
      loadParticipants(participantsFor);
    } catch (e: unknown) { toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" }); }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // User actions
  // ─────────────────────────────────────────────────────────────────────────

  async function handleAdjustDiamonds() {
    if (!diamondModal) return;
    const amt = Number(diamondAmount);
    if (isNaN(amt) || amt < 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
    let finalAmt: number;
    let logDesc: string;
    if (diamondModal.mode === "set") {
      finalAmt = amt - diamondModal.user.diamondBalance;
      logDesc = `Set balance to ${amt} diamonds for ${diamondModal.user.inGameName ?? diamondModal.user.phone}`;
    } else {
      if (amt === 0) { toast({ title: "Amount must be greater than 0", variant: "destructive" }); return; }
      finalAmt = diamondModal.mode === "sub" ? -amt : amt;
      logDesc = `${diamondModal.mode === "add" ? "Added" : "Removed"} ${amt} diamonds for ${diamondModal.user.inGameName ?? diamondModal.user.phone}`;
    }
    try {
      await saFetch<unknown>(`/admin/users/${diamondModal.user.id}/diamonds`, token, { method: "PATCH", body: JSON.stringify({ amount: finalAmt }) });
      await logAction("adjust_diamonds", "user", logDesc, String(diamondModal.user.id), "user");
      toast({ title: diamondModal.mode === "set" ? `Balance set to ${amt}💎` : `${diamondModal.mode === "add" ? "Added" : "Removed"} ${amt} diamonds!` });
      setDiamondModal(null); setDiamondAmount(""); loadData("users");
    } catch (e: unknown) { toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" }); }
  }

  async function handleNotifUser() {
    if (!notifModal) return;
    if (!notifTitle.trim() || !notifBody.trim()) { toast({ title: "Title and message required", variant: "destructive" }); return; }
    setNotifLoading(true);
    try {
      await saFetch<{ count: number }>("/super-admin/broadcast", token, {
        method: "POST",
        body: JSON.stringify({ type: notifType, title: notifTitle.trim(), body: notifBody.trim(), targetUserId: notifModal.user.id }),
      });
      await logAction("send_notification", "notification", `Sent "${notifTitle}" to ${notifModal.user.inGameName ?? notifModal.user.phone}`, String(notifModal.user.id), "user");
      toast({ title: `Notification sent to ${notifModal.user.inGameName ?? notifModal.user.phone}!` });
      setNotifModal(null); setNotifTitle(""); setNotifBody(""); setNotifType("system");
    } catch (e: unknown) { toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" }); }
    finally { setNotifLoading(false); }
  }

  async function handleToggleAdmin(user: AdminUser) {
    try {
      await saFetch<unknown>(`/admin/users/${user.id}/admin`, token, { method: "PATCH" });
      const action = user.isAdmin ? "revoked admin from" : "granted admin to";
      await logAction(user.isAdmin ? "revoke_admin" : "grant_admin", "user", `${action} ${user.inGameName ?? user.phone}`, String(user.id), "user");
      toast({ title: `Admin ${user.isAdmin ? "revoked" : "granted"}!` });
      loadData("users");
    } catch (e: unknown) { toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" }); }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Squad actions
  // ─────────────────────────────────────────────────────────────────────────

  async function handleDeleteSquad(id: number) {
    const s = squads.find(x => x.id === id);
    try {
      await saFetch<unknown>(`/super-admin/squads/${id}`, token, { method: "DELETE" });
      toast({ title: "Squad deleted" });
      setDeleteConfirmId(null); loadData("squads");
    } catch (e: unknown) { toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" }); }
  }

  async function loadSquadMembers(sq: AdminSquad) {
    setSquadMembersFor(sq);
    try {
      const data = await saFetch<SquadMember[]>(`/super-admin/squads/${sq.id}/members`, token);
      setSquadMembers(data);
    } catch { setSquadMembers([]); }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Broadcast
  // ─────────────────────────────────────────────────────────────────────────

  async function handleBroadcast() {
    if (!bcastTitle.trim() || !bcastBody.trim()) { toast({ title: "Title and message required", variant: "destructive" }); return; }
    setBcastLoading(true);
    try {
      const body: Record<string, unknown> = { type: bcastType, title: bcastTitle.trim(), body: bcastBody.trim() };
      if (bcastTarget === "user" && bcastUserId) body.targetUserId = Number(bcastUserId);
      const result = await saFetch<{ count: number }>("/super-admin/broadcast", token, { method: "POST", body: JSON.stringify(body) });
      await logAction("broadcast", "notification", `Broadcast "${bcastTitle}" to ${bcastTarget === "all" ? `all ${result.count} users` : `user #${bcastUserId}`}`);
      toast({ title: `Sent to ${result.count} user${result.count !== 1 ? "s" : ""}!` });
      setBcastTitle(""); setBcastBody("");
    } catch (e: unknown) { toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" }); }
    finally { setBcastLoading(false); }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Export logs as CSV
  // ─────────────────────────────────────────────────────────────────────────

  function exportLogs() {
    const filtered = filteredLogs();
    const csv = ["ID,Time,Category,Action,Details,Target"]
      .concat(filtered.map(l => [l.id, l.createdAt, l.category, l.action, `"${(l.details ?? "").replace(/"/g, '""')}"`, l.targetId ?? ""].join(",")))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `clash-ren-logs-${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Filtered data
  // ─────────────────────────────────────────────────────────────────────────

  function filteredTournaments() {
    return tournaments.filter(t => {
      const matchSearch = !tournamentSearch || t.title.toLowerCase().includes(tournamentSearch.toLowerCase());
      const matchStatus = tournamentStatusFilter === "all" || t.status === tournamentStatusFilter;
      return matchSearch && matchStatus;
    });
  }

  function filteredUsers() {
    if (!userSearch) return users;
    const q = userSearch.toLowerCase();
    return users.filter(u =>
      (u.inGameName ?? "").toLowerCase().includes(q) ||
      u.phone.includes(q) ||
      (u.uid ?? "").includes(q)
    );
  }

  function filteredSquads() {
    if (!squadSearch) return squads;
    const q = squadSearch.toLowerCase();
    return squads.filter(s =>
      s.name.toLowerCase().includes(q) || s.uid.includes(q) || s.leaderName.toLowerCase().includes(q)
    );
  }

  function filteredLogs() {
    return logs.filter(l => {
      const matchCat = logCategory === "all" || l.category === logCategory;
      const matchSearch = !logSearch || (l.action + " " + (l.details ?? "")).toLowerCase().includes(logSearch.toLowerCase());
      return matchCat && matchSearch;
    });
  }

  function fmtSessionLeft() {
    const d = Math.floor(sessionLeft / 86400);
    const h = Math.floor((sessionLeft % 86400) / 3600);
    const m = Math.floor((sessionLeft % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Renders: security phases
  // ─────────────────────────────────────────────────────────────────────────

  if (phase === "checking") return (
    <div className="min-h-[100dvh] bg-black flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-zinc-600 animate-spin" />
    </div>
  );

  if (phase === "denied") return (
    <div className="min-h-[100dvh] bg-[#030303] flex flex-col items-center justify-center px-6 text-center gap-4">
      <p className="text-zinc-700 text-7xl font-black">404</p>
      <p className="text-zinc-500 text-lg font-semibold">Page Not Found</p>
      <p className="text-zinc-700 text-sm max-w-xs">The page you're looking for doesn't exist or has been moved.</p>
      <button onClick={() => navigate("/")} className="mt-2 text-sm text-zinc-600 underline">Go home</button>
    </div>
  );

  if (phase === "gate") {
    const isLocked = lockoutInfo.lockoutUntil != null && Date.now() < lockoutInfo.lockoutUntil;
    return (
      <div className="min-h-[100dvh] bg-[#030303] flex flex-col items-center justify-center px-5">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full" style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.06) 0%, transparent 70%)" }} />
        </div>

        <div className="relative w-full max-w-sm">
          {/* Header */}
          <div className="flex flex-col items-center mb-8 gap-3">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(var(--primary)/0.2), hsl(var(--primary)/0.08))", border: "1px solid hsl(var(--primary)/0.3)" }}>
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <div className="text-center">
              <h1 className="font-heading text-2xl font-black text-white tracking-tight">Restricted Area</h1>
              <p className="text-zinc-600 text-sm mt-1">Enter your security passphrase to continue</p>
            </div>
          </div>

          {/* Security card */}
          <div className="rounded-3xl p-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2 mb-5">
              <Lock className="w-4 h-4 text-zinc-500" />
              <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold">Admin Credentials</p>
            </div>

            {isLocked ? (
              <div className="rounded-2xl p-4 text-center" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-red-300">Access Temporarily Locked</p>
                <p className="text-xs text-zinc-500 mt-1">Too many failed attempts</p>
                <div className="mt-3 text-2xl font-mono font-black text-red-400">
                  {Math.floor(lockoutLeft / 60)}:{String(lockoutLeft % 60).padStart(2, "0")}
                </div>
                <p className="text-xs text-zinc-600 mt-1">remaining</p>
              </div>
            ) : (
              <>
                {/* Username */}
                <div className="mb-3">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold mb-1.5">Username</p>
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={e => { setUsernameInput(e.target.value); setCodeError(""); }}
                    onKeyDown={e => e.key === "Enter" && handleAuth()}
                    placeholder="Admin username"
                    autoComplete="username"
                    className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-zinc-700 outline-none focus:border-primary/40"
                  />
                </div>

                {/* Password */}
                <div className="mb-3">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold mb-1.5">Password</p>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={passwordInput}
                      onChange={e => { setPasswordInput(e.target.value); setCodeError(""); }}
                      onKeyDown={e => e.key === "Enter" && handleAuth()}
                      placeholder="Admin password"
                      autoComplete="current-password"
                      className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-4 pr-10 text-sm text-white placeholder:text-zinc-700 outline-none focus:border-primary/40"
                    />
                    <button onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-3 text-zinc-600">
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Security code */}
                <div className="mb-4">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold mb-1.5">Security Passphrase</p>
                  <div className="relative">
                    <input
                      type={showCode ? "text" : "password"}
                      value={codeInput}
                      onChange={e => { setCodeInput(e.target.value); setCodeError(""); }}
                      onKeyDown={e => e.key === "Enter" && handleAuth()}
                      placeholder="Enter passphrase…"
                      autoComplete="new-password"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      name="security-code-no-save"
                      className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-4 pr-10 text-sm text-white placeholder:text-zinc-700 outline-none focus:border-primary/40 font-mono"
                    />
                    <button onClick={() => setShowCode(v => !v)} className="absolute right-3 top-3 text-zinc-600">
                      {showCode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {codeError && (
                  <p className="text-xs text-red-400 mb-3 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" /> {codeError}
                  </p>
                )}

                {!codeError && lockoutInfo.attempts > 0 && (
                  <p className="text-[11px] text-amber-500/70 mb-3">
                    {MAX_ATTEMPTS - lockoutInfo.attempts} attempts remaining
                  </p>
                )}

                <button
                  onClick={handleAuth}
                  disabled={authLoading}
                  className="w-full h-11 rounded-2xl font-bold text-sm text-white btn-primary-gradient active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Lock className="w-4 h-4" /> Authenticate</>}
                </button>
              </>
            )}
          </div>

          <p className="text-center text-xs text-zinc-800 mt-6">Unauthorized access attempts are logged and monitored.</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main admin panel
  // ─────────────────────────────────────────────────────────────────────────

  async function handleSavePaySettings() {
    setPaySaving(true);
    try {
      const body = {
        upiId: payForm.upiId.trim(),
        upiName: payForm.upiName.trim(),
        ratePerDiamond: Number(payForm.ratePerDiamond),
        minTopup: Number(payForm.minTopup),
        minWithdrawal: Number(payForm.minWithdrawal),
        isEnabled: payForm.isEnabled,
      };
      const updated = await saFetch<{ upiId: string; upiName: string; ratePerDiamond: number; minTopup: number; minWithdrawal: number; isEnabled: boolean }>(
        "/super-admin/payment-settings", token, { method: "PUT", body: JSON.stringify(body) }
      );
      setPaySettings(updated);
      setPayForm({ upiId: updated.upiId, upiName: updated.upiName, ratePerDiamond: String(updated.ratePerDiamond), minTopup: String(updated.minTopup), minWithdrawal: String(updated.minWithdrawal ?? 50), isEnabled: updated.isEnabled });
      setPayEditing(false);
      await logAction("update_payment_settings", "general", `UPI ID set to ${updated.upiId}`);
      toast({ title: "Payment settings saved!" });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to save", variant: "destructive" });
    } finally { setPaySaving(false); }
  }

  return (
    <div className="min-h-[100dvh] flex bg-[#06060a] relative overflow-hidden">

      {/* ── Ambient background glows ── */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 w-[560px] h-[560px] rounded-full" style={{ background: "radial-gradient(circle, hsl(var(--primary)/0.13) 0%, transparent 60%)", filter: "blur(80px)" }} />
        <div className="absolute -bottom-40 -right-32 w-[480px] h-[480px] rounded-full" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.09) 0%, transparent 60%)", filter: "blur(80px)" }} />
        <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] rounded-full" style={{ background: "radial-gradient(circle, rgba(234,88,12,0.04) 0%, transparent 60%)", filter: "blur(60px)" }} />
      </div>

      {/* ── Mobile sidebar backdrop ── */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm md:hidden"
          />
        )}
      </AnimatePresence>

      {/* ── Left Sidebar ── */}
      <aside
        className={cn(
          "fixed md:sticky md:top-0 z-40 md:z-auto inset-y-0 left-0 w-60 flex flex-col shrink-0 h-[100dvh] md:h-[100dvh] transition-transform duration-300 ease-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
        style={{ background: "rgba(6,6,10,0.92)", backdropFilter: "blur(28px) saturate(180%)", borderRight: "1px solid rgba(255,255,255,0.07)" }}
      >
        {/* Brand */}
        <div className="px-4 pt-5 pb-4 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, hsl(var(--primary)/0.28), hsl(var(--primary)/0.08))", border: "1px solid hsl(var(--primary)/0.35)", boxShadow: "0 0 16px hsl(var(--primary)/0.15)" }}>
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-heading text-sm font-black text-white tracking-tight leading-none">Super Admin</p>
              <p className="text-[9px] text-zinc-700 mt-0.5 tracking-wide">Clash Ren</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden w-6 h-6 rounded-lg flex items-center justify-center text-zinc-600 hover:text-zinc-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-5" style={{ scrollbarWidth: "none" }}>

          {/* Overview */}
          <div>
            <p className="px-2.5 mb-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-700">Overview</p>
            <SidebarItem icon={BarChart3} label="Dashboard" active={tab === "dashboard"} onClick={() => { setTab("dashboard"); setSidebarOpen(false); loadData("dashboard"); }} />
          </div>

          {/* Users */}
          <div>
            <p className="px-2.5 mb-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-700">Users</p>
            <SidebarItem icon={Users} label="Manage Users" external onClick={() => navigate(`/286c81443d1fb388d1b9a8e3b280824c/user_management`)} />
            <SidebarItem icon={Images} label="Banner Management" external onClick={() => navigate(`/286c81443d1fb388d1b9a8e3b280824c/banner_management`)} />
          </div>

          {/* Tournaments */}
          <div>
            <p className="px-2.5 mb-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-700">Tournaments</p>
            <SidebarItem icon={Swords} label="Matches Management" external onClick={() => navigate(`/286c81443d1fb388d1b9a8e3b280824c/matches_management`)} />
          </div>

          {/* Payments */}
          <div>
            <p className="px-2.5 mb-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-700">Payments</p>
            <SidebarItem icon={Gem} label="Payment Management" external onClick={() => navigate(`/286c81443d1fb388d1b9a8e3b280824c/payments`)} />
            <SidebarItem icon={Settings} label="Settings" active={tab === "settings"} onClick={() => { setTab("settings"); setSidebarOpen(false); loadData("settings"); }} />
          </div>

          {/* Communications */}
          <div>
            <p className="px-2.5 mb-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-700">Communications</p>
            <SidebarItem icon={Bell} label="Broadcast" active={tab === "broadcast"} onClick={() => { setTab("broadcast"); setSidebarOpen(false); }} />
          </div>

          {/* API Keys */}
          <div>
            <p className="px-2.5 mb-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-700">Configuration</p>
            <SidebarItem icon={KeyRound} label="Manage API Keys" external onClick={() => navigate(`/286c81443d1fb388d1b9a8e3b280824c/manage-keys`)} />
          </div>

          {/* Activity / Logs */}
          <div>
            <p className="px-2.5 mb-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-700">Activity</p>
            <SidebarItem icon={ClipboardList} label="Admin Logs" active={tab === "logs"} onClick={() => { setTab("logs"); setSidebarOpen(false); loadData("logs"); }} />
          </div>
        </nav>

        {/* Bottom: session + logout */}
        <div className="p-2.5 space-y-1 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="px-3 py-2 rounded-xl flex items-center gap-2" style={{ background: "rgba(255,255,255,0.03)" }}>
            <Clock className="w-3 h-3 text-zinc-700 shrink-0" />
            <span className={cn("text-[10px] font-mono truncate", sessionLeft < 86400 ? "text-amber-400" : "text-zinc-600")}>
              {fmtSessionLeft()} remaining
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-semibold text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150 active:scale-[0.98]"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-[100dvh] relative z-10">

        {/* Top header bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 h-14 shrink-0" style={{ background: "rgba(6,6,10,0.88)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {/* Mobile hamburger */}
          <button onClick={() => setSidebarOpen(v => !v)} className="md:hidden w-8 h-8 flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-all">
            <Menu className="w-4 h-4" />
          </button>

          {/* Page title */}
          <p className="hidden sm:block font-heading text-sm font-bold text-white capitalize shrink-0">
            {tab === "dashboard" ? "Dashboard" : tab === "logs" ? "Activity Logs" : tab === "broadcast" ? "Broadcast" : tab}
          </p>

          {/* Global search */}
          <div className="flex-1 max-w-xs relative sm:ml-2 ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600 pointer-events-none" />
            <input
              value={globalSearch}
              onChange={e => {
                const v = e.target.value;
                setGlobalSearch(v);
                if (tab === "tournaments") setTournamentSearch(v);
                else if (tab === "users") setUserSearch(v);
                else if (tab === "squads") setSquadSearch(v);
                else if (tab === "logs") setLogSearch(v);
              }}
              placeholder={
                tab === "users" ? "Search users..." :
                tab === "tournaments" ? "Search tournaments..." :
                tab === "squads" ? "Search squads..." :
                tab === "logs" ? "Search logs..." : "Search..."
              }
              className="w-full h-8 rounded-xl bg-white/[0.04] border border-white/[0.08] pl-8 pr-3 text-xs text-white placeholder:text-zinc-700 outline-none focus:border-primary/30 focus:bg-white/[0.06] transition-all"
            />
            {globalSearch && (
              <button onClick={() => { setGlobalSearch(""); setTournamentSearch(""); setUserSearch(""); setSquadSearch(""); setLogSearch(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-700 hover:text-zinc-500">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Refresh */}
          <button onClick={() => loadData(tab)} className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.08] transition-all active:scale-95" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="flex flex-col items-center gap-3">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 rounded-2xl" style={{ background: "hsl(var(--primary)/0.1)", border: "1px solid hsl(var(--primary)/0.2)" }} />
                  <Loader2 className="w-5 h-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
                </div>
                <p className="text-[11px] text-zinc-700">Loading data...</p>
              </div>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="p-4 md:p-6"
              >

                {/* ══ DASHBOARD ══ */}
                {tab === "dashboard" && (
                  <div className="max-w-5xl mx-auto space-y-6">
                    {stats ? (
                      <>
                        {/* Stat cards */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {[
                            { label: "Total Users", value: stats.totalUsers, icon: Users, grad: "from-blue-500/20 to-blue-700/5", ic: "text-blue-400", bd: "border-blue-500/15" },
                            { label: "Active Tournaments", value: stats.activeTournaments, icon: Trophy, grad: "from-amber-500/20 to-amber-700/5", ic: "text-amber-400", bd: "border-amber-500/15" },
                            { label: "Diamonds Circulating", value: stats.totalDiamondsInCirculation.toLocaleString(), icon: Gem, grad: "from-cyan-500/20 to-cyan-700/5", ic: "text-cyan-400", bd: "border-cyan-500/15" },
                            { label: "Total Squads", value: stats.totalSquads, icon: Swords, grad: "from-emerald-500/20 to-emerald-700/5", ic: "text-emerald-400", bd: "border-emerald-500/15" },
                            { label: "Transactions", value: stats.totalTransactions, icon: Activity, grad: "from-purple-500/20 to-purple-700/5", ic: "text-purple-400", bd: "border-purple-500/15" },
                            { label: "Prizes Distributed", value: stats.totalPrizesDistributed, icon: ArrowUpRight, grad: "from-rose-500/20 to-rose-700/5", ic: "text-rose-400", bd: "border-rose-500/15" },
                          ].map((s, i) => (
                            <motion.div
                              key={s.label}
                              initial={{ opacity: 0, y: 14, scale: 0.97 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              transition={{ delay: i * 0.055, duration: 0.28 }}
                              className={cn("rounded-2xl p-4 flex items-center gap-3 border backdrop-blur-sm", s.bd)}
                              style={{ background: "rgba(255,255,255,0.03)" }}
                            >
                              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br", s.grad)}>
                                <s.icon className={cn("w-5 h-5", s.ic)} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] text-zinc-600 truncate leading-none mb-1">{s.label}</p>
                                <p className="text-xl font-black text-white font-heading leading-none">{s.value}</p>
                              </div>
                            </motion.div>
                          ))}
                        </div>

                        {/* Charts row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Tournament bar chart */}
                          <motion.div
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.32, duration: 0.28 }}
                            className="rounded-2xl p-5 border border-white/[0.07]"
                            style={{ background: "rgba(255,255,255,0.025)", backdropFilter: "blur(12px)" }}
                          >
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Tournament Pipeline</p>
                            <ResponsiveContainer width="100%" height={155}>
                              <BarChart
                                data={[
                                  { name: "Upcoming", value: stats.upcomingTournaments, fill: "#3b82f6" },
                                  { name: "Live", value: stats.activeTournaments, fill: "#10b981" },
                                  { name: "Completed", value: stats.completedTournaments, fill: "#6366f1" },
                                ]}
                                margin={{ top: 5, right: 5, bottom: 0, left: -28 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis dataKey="name" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <Tooltip
                                  contentStyle={{ background: "#111118", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", fontSize: "11px", color: "#fff" }}
                                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                                />
                                <Bar dataKey="value" radius={[6, 6, 2, 2]}>
                                  {[
                                    { fill: "#3b82f6" },
                                    { fill: "#10b981" },
                                    { fill: "#6366f1" },
                                  ].map((entry, i) => (
                                    <Cell key={i} fill={entry.fill} fillOpacity={0.85} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </motion.div>

                          {/* Platform summary */}
                          <motion.div
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.38, duration: 0.28 }}
                            className="rounded-2xl p-5 border border-white/[0.07] space-y-1"
                            style={{ background: "rgba(255,255,255,0.025)", backdropFilter: "blur(12px)" }}
                          >
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Platform Summary</p>
                            {[
                              { label: "Total Tournaments", value: stats.totalTournaments, color: "text-white" },
                              { label: "Total Participants", value: stats.totalParticipants, color: "text-white" },
                              { label: "Admin Users", value: stats.adminUsers, color: "text-primary" },
                              { label: "Total Top-ups", value: stats.totalTopups, color: "text-emerald-400" },
                              { label: "Total Entry Fees", value: `${stats.totalEntryFees}💎`, color: "text-amber-400" },
                            ].map(r => (
                              <div key={r.label} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                <span className="text-xs text-zinc-600">{r.label}</span>
                                <span className={cn("text-sm font-bold", r.color)}>{typeof r.value === "number" ? r.value.toLocaleString() : r.value}</span>
                              </div>
                            ))}
                          </motion.div>
                        </div>

                        {/* Quick access */}
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42, duration: 0.28 }}>
                          <p className="text-[10px] text-zinc-700 uppercase tracking-widest font-bold mb-3">Quick Access</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                              onClick={() => navigate(`/286c81443d1fb388d1b9a8e3b280824c/user_management`)}
                              className="flex items-center gap-3.5 p-4 rounded-2xl text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
                              style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.16)" }}
                            >
                              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0">
                                <Users className="w-5 h-5 text-indigo-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white">Manage Users</p>
                                <p className="text-[11px] text-zinc-600 mt-0.5">Profiles, diamonds, notifications</p>
                              </div>
                              <ArrowUpRight className="w-4 h-4 text-indigo-400/50 shrink-0" />
                            </button>
                            <button
                              onClick={() => navigate(`/286c81443d1fb388d1b9a8e3b280824c/payments`)}
                              className="flex items-center gap-3.5 p-4 rounded-2xl text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
                              style={{ background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.16)" }}
                            >
                              <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
                                <Gem className="w-5 h-5 text-violet-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white">Payment Management</p>
                                <p className="text-[11px] text-zinc-600 mt-0.5">UPI, BharatPe, top-up requests</p>
                              </div>
                              <ArrowUpRight className="w-4 h-4 text-violet-400/50 shrink-0" />
                            </button>
                          </div>
                        </motion.div>

                        {/* Recent activity */}
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.46, duration: 0.28 }}>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] text-zinc-700 uppercase tracking-widest font-bold">Recent Activity</p>
                            <button onClick={() => { setTab("logs"); loadData("logs"); }} className="text-[11px] text-primary/60 hover:text-primary transition-colors">View all →</button>
                          </div>
                          <div className="space-y-1.5">
                            {logs.slice(0, 6).map((l, i) => (
                              <motion.div
                                key={l.id}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.48 + i * 0.04 }}
                                className="flex items-center gap-3 p-3 rounded-xl"
                                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
                              >
                                <CatBadge cat={l.category} />
                                <p className="flex-1 text-xs text-zinc-400 truncate">{l.details ?? l.action}</p>
                                <p className="text-[10px] text-zinc-700 shrink-0 whitespace-nowrap">{fmtTime(l.createdAt)}</p>
                              </motion.div>
                            ))}
                            {logs.length === 0 && <p className="text-xs text-zinc-700 text-center py-6">No activity yet</p>}
                          </div>
                        </motion.div>
                      </>
                    ) : (
                      <p className="text-zinc-700 text-center py-16 text-sm">No data available</p>
                    )}
                  </div>
                )}

                {/* ══ TOURNAMENTS ══ */}
                {tab === "tournaments" && (
                  <div className="max-w-5xl mx-auto space-y-4">
                    <div className="flex gap-2 flex-wrap">
                      <div className="relative flex-1 min-w-[160px]">
                        <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-zinc-600" />
                        <input value={tournamentSearch} onChange={e => { setTournamentSearch(e.target.value); setGlobalSearch(e.target.value); }} placeholder="Search tournaments…" className="w-full h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] pl-9 pr-3 text-xs text-white placeholder:text-zinc-700 outline-none focus:border-primary/30" />
                      </div>
                      <select value={tournamentStatusFilter} onChange={e => setTournamentStatusFilter(e.target.value)} className="h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 text-xs text-zinc-400 outline-none">
                        {["all", "upcoming", "ongoing", "completed", "cancelled"].map(s => <option key={s} value={s}>{s === "all" ? "All Status" : s}</option>)}
                      </select>
                      <button onClick={() => { setEditingTournament(null); setTForm(emptyTForm()); setShowCreateTournament(true); }} className="h-9 px-4 rounded-xl btn-primary-gradient text-xs font-bold text-white flex items-center gap-1.5 shrink-0 active:scale-95 transition-transform">
                        <Plus className="w-3.5 h-3.5" /> New Tournament
                      </button>
                    </div>
                    <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                              {["#", "Title", "Mode", "Status", "Slots", "Prize", "Start", "Actions"].map(h => (
                                <th key={h} className="px-3 py-3 text-left text-[9px] text-zinc-600 font-bold uppercase tracking-wider whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredTournaments().map((t, i) => (
                              <motion.tr key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.025 }} className="hover:bg-white/[0.02] transition-colors" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                <td className="px-3 py-2.5 text-zinc-600 font-mono">{t.id}</td>
                                <td className="px-3 py-2.5 text-white font-semibold max-w-[140px] truncate">{t.title}</td>
                                <td className="px-3 py-2.5 text-zinc-400 whitespace-nowrap">{t.gameMode}</td>
                                <td className="px-3 py-2.5"><StatusBadge status={t.status} /></td>
                                <td className="px-3 py-2.5 text-zinc-400 whitespace-nowrap">{t.filledSlots}/{t.maxSlots}</td>
                                <td className="px-3 py-2.5 text-emerald-400 font-mono">{t.prizePoolDiamonds}💎</td>
                                <td className="px-3 py-2.5 text-zinc-500 whitespace-nowrap">{fmtDate(t.startTime)}</td>
                                <td className="px-3 py-2.5">
                                  <div className="flex gap-1">
                                    <button onClick={() => loadParticipants(t)} className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors" title="Participants"><Users className="w-3 h-3" /></button>
                                    <button onClick={() => { setEditingTournament(t); setTForm({ title: t.title, gameMode: t.gameMode, entryFeeDiamonds: t.entryFeeDiamonds, prizePoolDiamonds: t.prizePoolDiamonds, maxSlots: t.maxSlots, startTime: t.startTime.slice(0, 16), status: t.status, roomId: t.roomId ?? "", roomPassword: t.roomPassword ?? "" }); setShowCreateTournament(true); }} className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors" title="Edit"><Pencil className="w-3 h-3" /></button>
                                    <button onClick={() => { setDeleteConfirmId(t.id); setDeleteConfirmType("tournament"); }} className="p-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors" title="Delete"><Trash2 className="w-3 h-3" /></button>
                                  </div>
                                </td>
                              </motion.tr>
                            ))}
                            {filteredTournaments().length === 0 && (
                              <tr><td colSpan={8} className="px-3 py-12 text-center text-xs text-zinc-700">No tournaments found</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ══ USERS ══ */}
                {tab === "users" && (
                  <div className="max-w-5xl mx-auto space-y-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="relative flex-1 min-w-[180px] max-w-sm">
                        <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-zinc-600" />
                        <input value={userSearch} onChange={e => { setUserSearch(e.target.value); setGlobalSearch(e.target.value); }} placeholder="Search by name, phone, or UID…" className="w-full h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] pl-9 pr-3 text-xs text-white placeholder:text-zinc-700 outline-none focus:border-primary/30" />
                      </div>
                      <button onClick={() => navigate(`/286c81443d1fb388d1b9a8e3b280824c/user_management`)} className="h-9 px-4 rounded-xl text-xs font-bold text-indigo-300 flex items-center gap-1.5 shrink-0 transition-all hover:scale-[1.02]" style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
                        <ArrowUpRight className="w-3.5 h-3.5" /> Manage Users
                      </button>
                    </div>
                    <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                              {["#", "Name", "Phone", "UID", "Diamonds", "Admin", "Actions"].map(h => (
                                <th key={h} className="px-3 py-3 text-left text-[9px] text-zinc-600 font-bold uppercase tracking-wider whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredUsers().map((u, i) => (
                              <motion.tr key={u.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="hover:bg-white/[0.02] transition-colors" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                <td className="px-3 py-2.5 text-zinc-600 font-mono">{u.id}</td>
                                <td className="px-3 py-2.5 text-white font-semibold max-w-[120px] truncate">{u.inGameName ?? "—"}</td>
                                <td className="px-3 py-2.5 text-zinc-400 font-mono">{u.phone}</td>
                                <td className="px-3 py-2.5 text-zinc-500 font-mono">{u.uid ?? "—"}</td>
                                <td className="px-3 py-2.5"><span className="flex items-center gap-1 text-cyan-400 font-mono font-bold">{u.diamondBalance} <Gem className="w-3 h-3 text-blue-400" /></span></td>
                                <td className="px-3 py-2.5">{u.isAdmin ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary/20 text-primary">Admin</span> : <span className="text-[10px] text-zinc-700">—</span>}</td>
                                <td className="px-3 py-2.5">
                                  <div className="flex gap-1 flex-wrap">
                                    <button onClick={() => { setDiamondModal({ user: u, mode: "add" }); setDiamondAmount(""); }} className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors" title="Add diamonds"><ArrowDownLeft className="w-3 h-3" /></button>
                                    <button onClick={() => { setDiamondModal({ user: u, mode: "sub" }); setDiamondAmount(""); }} className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors" title="Remove diamonds"><ArrowUpRight className="w-3 h-3" /></button>
                                    <button onClick={() => { setDiamondModal({ user: u, mode: "set" }); setDiamondAmount(String(u.diamondBalance)); }} className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors" title="Set balance"><Gem className="w-3 h-3" /></button>
                                    <button onClick={() => { setNotifModal({ user: u }); setNotifTitle(""); setNotifBody(""); setNotifType("system"); }} className="p-1.5 rounded-lg bg-pink-500/10 text-pink-400 border border-pink-500/20 hover:bg-pink-500/20 transition-colors" title="Send notification"><Bell className="w-3 h-3" /></button>
                                    <button onClick={() => handleToggleAdmin(u)} className={cn("p-1.5 rounded-lg border transition-colors", u.isAdmin ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20" : "bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/20")} title={u.isAdmin ? "Revoke admin" : "Grant admin"}>{u.isAdmin ? <UserX className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}</button>
                                  </div>
                                </td>
                              </motion.tr>
                            ))}
                            {filteredUsers().length === 0 && (
                              <tr><td colSpan={7} className="px-3 py-12 text-center text-xs text-zinc-700">No users found</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ══ SQUADS ══ */}
                {tab === "squads" && (
                  <div className="max-w-5xl mx-auto space-y-4">
                    <div className="relative max-w-sm">
                      <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-zinc-600" />
                      <input value={squadSearch} onChange={e => { setSquadSearch(e.target.value); setGlobalSearch(e.target.value); }} placeholder="Search by name, UID, or leader…" className="w-full h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] pl-9 pr-3 text-xs text-white placeholder:text-zinc-700 outline-none focus:border-primary/30" />
                    </div>
                    <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                              {["#", "Name", "UID", "Leader", "Members", "Created", "Actions"].map(h => (
                                <th key={h} className="px-3 py-3 text-left text-[9px] text-zinc-600 font-bold uppercase tracking-wider whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredSquads().map((s, i) => (
                              <motion.tr key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.025 }} className="hover:bg-white/[0.02] transition-colors" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                <td className="px-3 py-2.5 text-zinc-600 font-mono">{s.id}</td>
                                <td className="px-3 py-2.5 text-white font-semibold">{s.name}</td>
                                <td className="px-3 py-2.5 text-zinc-400 font-mono">{s.uid}</td>
                                <td className="px-3 py-2.5 text-zinc-300">{s.leaderName}</td>
                                <td className="px-3 py-2.5 text-zinc-400">{s.memberCount}</td>
                                <td className="px-3 py-2.5 text-zinc-600 whitespace-nowrap">{fmtDate(s.createdAt)}</td>
                                <td className="px-3 py-2.5">
                                  <div className="flex gap-1">
                                    <button onClick={() => loadSquadMembers(s)} className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors" title="View members"><Users className="w-3 h-3" /></button>
                                    <button onClick={() => { setDeleteConfirmId(s.id); setDeleteConfirmType("squad"); }} className="p-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors" title="Delete"><Trash2 className="w-3 h-3" /></button>
                                  </div>
                                </td>
                              </motion.tr>
                            ))}
                            {filteredSquads().length === 0 && (
                              <tr><td colSpan={7} className="px-3 py-12 text-center text-xs text-zinc-700">No squads found</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ══ BROADCAST ══ */}
                {tab === "broadcast" && (
                  <div className="max-w-lg mx-auto">
                    <div className="rounded-3xl p-6 space-y-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="w-4 h-4 text-primary" />
                        <p className="font-heading font-bold text-white text-base">Send Notification</p>
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">Target</label>
                        <div className="flex rounded-xl p-1 gap-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                          {(["all", "user"] as const).map(t => (
                            <button key={t} onClick={() => setBcastTarget(t)} className={cn("flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors", bcastTarget === t ? "btn-primary-gradient text-white" : "text-zinc-500")}>
                              {t === "all" ? "All Users" : "Specific User"}
                            </button>
                          ))}
                        </div>
                        {bcastTarget === "user" && (
                          <input value={bcastUserId} onChange={e => setBcastUserId(e.target.value.replace(/\D/g, ""))} placeholder="User ID (number)" inputMode="numeric" className="w-full h-10 rounded-xl bg-white/5 border border-white/8 px-3 text-xs text-white placeholder:text-zinc-700 outline-none focus:border-primary/30 mt-2 font-mono" />
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">Type</label>
                        <select value={bcastType} onChange={e => setBcastType(e.target.value)} className="w-full h-10 rounded-xl bg-white/5 border border-white/8 px-3 text-xs text-zinc-300 outline-none">
                          {["system", "tournament", "result", "wallet"].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">Title</label>
                        <input value={bcastTitle} onChange={e => setBcastTitle(e.target.value)} placeholder="Notification title…" className="w-full h-10 rounded-xl bg-white/5 border border-white/8 px-3 text-xs text-white placeholder:text-zinc-700 outline-none focus:border-primary/30" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">Message</label>
                        <textarea value={bcastBody} onChange={e => setBcastBody(e.target.value)} rows={4} placeholder="Write your message here…" className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 text-xs text-white placeholder:text-zinc-700 outline-none focus:border-primary/30 resize-none" />
                      </div>
                      {(bcastTitle || bcastBody) && (
                        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                          <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Preview</p>
                          <p className="text-sm font-bold text-white">{bcastTitle || "—"}</p>
                          <p className="text-xs text-zinc-400 mt-1">{bcastBody || "—"}</p>
                        </div>
                      )}
                      <button onClick={handleBroadcast} disabled={bcastLoading || !bcastTitle.trim() || !bcastBody.trim()} className="w-full h-11 rounded-2xl font-bold text-sm btn-primary-gradient text-white active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center gap-2">
                        {bcastLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Send Broadcast</>}
                      </button>
                    </div>
                  </div>
                )}

                {/* ══ SETTINGS ══ */}
                {tab === "settings" && (
                  <div className="max-w-lg mx-auto space-y-4">
                    <div className="rounded-3xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>
                      <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(234,88,12,0.06)" }}>
                        <div className="flex items-center gap-2">
                          <Gem className="w-3.5 h-3.5 text-orange-400" strokeWidth={2} />
                          <span className="text-[10px] text-orange-400/80 uppercase tracking-[0.15em] font-bold">Payment Settings</span>
                        </div>
                        {!payEditing && paySettings && (
                          <button onClick={() => setPayEditing(true)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-zinc-400 bg-white/5 border border-white/8 hover:bg-white/10 transition-colors">
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                        )}
                      </div>
                      <div className="p-5 space-y-4">
                        {paySettings && !payEditing ? (
                          <>
                            {[
                              { label: "UPI ID", value: paySettings.upiId, mono: true },
                              { label: "UPI Name", value: paySettings.upiName, mono: false },
                              { label: "Rate per Diamond", value: `₹${paySettings.ratePerDiamond}`, mono: false },
                              { label: "Minimum Top-up", value: `₹${paySettings.minTopup}`, mono: false },
                              { label: "Minimum Withdrawal", value: `₹${paySettings.minWithdrawal ?? 50}`, mono: false },
                            ].map(f => (
                              <div key={f.label} className="flex items-center justify-between py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                <span className="text-xs text-zinc-500">{f.label}</span>
                                <span className={cn("text-sm font-bold text-white", f.mono && "font-mono")}>{f.value}</span>
                              </div>
                            ))}
                            <div className="flex items-center justify-between py-2.5">
                              <span className="text-xs text-zinc-500">Top-up Enabled</span>
                              <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", paySettings.isEnabled ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-red-500/20 text-red-300 border border-red-500/30")}>
                                {paySettings.isEnabled ? "Enabled" : "Disabled"}
                              </span>
                            </div>
                          </>
                        ) : payEditing ? (
                          <div className="space-y-3">
                            {[
                              { label: "UPI ID", key: "upiId", placeholder: "e.g. 9038387188@okbizaxis", mono: true },
                              { label: "UPI Name", key: "upiName", placeholder: "e.g. Clash Ren", mono: false },
                              { label: "Rate per Diamond (₹)", key: "ratePerDiamond", placeholder: "0.5", mono: false },
                              { label: "Minimum Top-up (₹)", key: "minTopup", placeholder: "20", mono: false },
                              { label: "Minimum Withdrawal (₹)", key: "minWithdrawal", placeholder: "50", mono: false },
                            ].map(f => (
                              <div key={f.key}>
                                <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">{f.label}</label>
                                <input type="text" value={(payForm as Record<string, string | boolean>)[f.key] as string} onChange={e => setPayForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} className={cn("w-full h-10 rounded-xl bg-white/5 border border-white/8 px-3 text-sm text-white outline-none focus:border-orange-500/40", f.mono && "font-mono")} />
                              </div>
                            ))}
                            <div>
                              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2 block">Top-up Status</label>
                              <div className="flex rounded-xl p-0.5 gap-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                                {([true, false] as const).map(v => (
                                  <button key={String(v)} onClick={() => setPayForm(p => ({ ...p, isEnabled: v }))} className={cn("flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors", payForm.isEnabled === v ? v ? "bg-emerald-500/25 text-emerald-300" : "bg-red-500/25 text-red-300" : "text-zinc-600")}>
                                    {v ? "Enabled" : "Disabled"}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="flex gap-2 pt-1">
                              <button onClick={() => { setPayEditing(false); if (paySettings) setPayForm({ upiId: paySettings.upiId, upiName: paySettings.upiName, ratePerDiamond: String(paySettings.ratePerDiamond), minTopup: String(paySettings.minTopup), minWithdrawal: String(paySettings.minWithdrawal ?? 50), isEnabled: paySettings.isEnabled }); }} className="flex-1 h-10 rounded-xl font-bold text-xs text-zinc-400 bg-white/5 border border-white/8">Cancel</button>
                              <button onClick={handleSavePaySettings} disabled={paySaving} className="flex-[2] h-10 rounded-xl font-bold text-xs text-white btn-primary-gradient flex items-center justify-center gap-1.5 disabled:opacity-50">
                                {paySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" /> Save Changes</>}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-6 text-xs text-zinc-700">Loading…</div>
                        )}
                      </div>
                    </div>
                    {/* ── API Keys card ── */}
                    <div className="rounded-3xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>
                      <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(245,158,11,0.06)" }}>
                        <KeyRound className="w-3.5 h-3.5 text-amber-400" strokeWidth={2} />
                        <span className="text-[10px] text-amber-400/80 uppercase tracking-[0.15em] font-bold">API Keys</span>
                      </div>
                      <div className="p-5 space-y-4">
                        {sysSettings?.freefireApiKeySet && (
                          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-bold text-emerald-300">Free Fire API key active</span>
                              <span className="text-[11px] text-zinc-500 font-mono">{sysSettings.freefireApiKeyPreview}</span>
                            </div>
                          </div>
                        )}
                        <div>
                          <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 block">
                            {sysSettings?.freefireApiKeySet ? "Replace Free Fire API Key" : "Set Free Fire API Key"}
                          </label>
                          <div className="relative">
                            <input
                              type={ffKeyVisible ? "text" : "password"}
                              value={ffKeyInput}
                              onChange={e => setFfKeyInput(e.target.value)}
                              placeholder="Paste your API key here…"
                              autoComplete="off"
                              className="w-full h-10 rounded-xl bg-white/5 border border-white/8 px-3 pr-10 text-sm text-white font-mono outline-none focus:border-amber-500/40"
                            />
                            <button type="button" onClick={() => setFfKeyVisible(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                              {ffKeyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          <p className="text-[10px] text-zinc-600 mt-1">
                            Get your key at{" "}
                            <a href="https://developers.freefirecommunity.com/en/dashboard" target="_blank" rel="noopener noreferrer" className="text-amber-400/70 hover:text-amber-400 underline">
                              developers.freefirecommunity.com
                            </a>
                          </p>
                        </div>
                        <button
                          disabled={ffKeySaving || !ffKeyInput.trim()}
                          onClick={async () => {
                            if (ffKeySaving || !ffKeyInput.trim() || !token) return;
                            setFfKeySaving(true);
                            try {
                              const res = await fetch("/api/admin/system-settings", {
                                method: "PUT",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                credentials: "include",
                                body: JSON.stringify({ freefireApiKey: ffKeyInput.trim() }),
                              });
                              if (!res.ok) throw new Error("Failed to save");
                              const updated = await res.json() as { freefireApiKeySet: boolean; freefireApiKeyPreview: string };
                              setSysSettings(updated);
                              setFfKeyInput("");
                              toast({ title: "API key saved!" });
                            } catch {
                              toast({ title: "Failed to save API key", variant: "destructive" });
                            } finally { setFfKeySaving(false); }
                          }}
                          className="w-full h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 transition-colors"
                          style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.25)", color: "#fcd34d" }}
                        >
                          {ffKeySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" /> Save API Key</>}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl px-4 py-3 flex items-start gap-3" style={{ background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.15)" }}>
                      <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-yellow-400/70 leading-relaxed">Changes to UPI ID take effect immediately. Existing QR codes in active sessions use the old ID until the user refreshes.</p>
                    </div>
                  </div>
                )}

                {/* ══ LOGS ══ */}
                {tab === "logs" && (
                  <div className="max-w-5xl mx-auto space-y-4">
                    <div className="flex gap-2 flex-wrap">
                      <div className="relative flex-1 min-w-[160px]">
                        <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-zinc-600" />
                        <input value={logSearch} onChange={e => { setLogSearch(e.target.value); setGlobalSearch(e.target.value); }} placeholder="Search logs…" className="w-full h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] pl-9 pr-3 text-xs text-white placeholder:text-zinc-700 outline-none focus:border-primary/30" />
                      </div>
                      <select value={logCategory} onChange={e => setLogCategory(e.target.value)} className="h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 text-xs text-zinc-400 outline-none shrink-0">
                        {["all", "auth", "tournament", "user", "squad", "notification", "general"].map(c => (
                          <option key={c} value={c}>{c === "all" ? "All Categories" : c}</option>
                        ))}
                      </select>
                      <button onClick={exportLogs} className="h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-zinc-400 flex items-center gap-1.5 shrink-0 hover:bg-white/[0.08] transition-colors">
                        <Download className="w-3.5 h-3.5" /> Export
                      </button>
                    </div>
                    <p className="text-[11px] text-zinc-700">{filteredLogs().length} entries</p>
                    <div className="space-y-1.5">
                      {filteredLogs().map((l, i) => (
                        <motion.div
                          key={l.id}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: Math.min(i * 0.018, 0.28) }}
                          className="flex items-start gap-3 p-3 rounded-xl"
                          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                        >
                          <p className="text-[10px] text-zinc-700 font-mono whitespace-nowrap shrink-0 mt-0.5">{fmtDateTime(l.createdAt)}</p>
                          <CatBadge cat={l.category} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-zinc-400 font-mono">{l.action}</p>
                            {l.details && <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{l.details}</p>}
                          </div>
                          {l.targetId && <span className="text-[9px] text-zinc-700 font-mono shrink-0">#{l.targetId}</span>}
                        </motion.div>
                      ))}
                      {filteredLogs().length === 0 && (
                        <div className="text-center py-16">
                          <ClipboardList className="w-8 h-8 text-zinc-800 mx-auto mb-2" strokeWidth={1.5} />
                          <p className="text-xs text-zinc-700">No logs match your filter</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          MODALS
      ───────────────────────────────────────────────────────────────────── */}

      {/* Create/Edit Tournament modal */}
      {showCreateTournament && (
        <ModalBackdrop onClose={() => { setShowCreateTournament(false); setEditingTournament(null); }}>
          <div className="rounded-3xl p-5 w-full max-w-md max-h-[90dvh] overflow-y-auto" style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading font-bold text-white text-base">{editingTournament ? "Edit Tournament" : "Create Tournament"}</h2>
              <button onClick={() => { setShowCreateTournament(false); setEditingTournament(null); }} className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-zinc-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              {[
                { label: "Title", key: "title", type: "text" },
                { label: "Game Mode", key: "gameMode", type: "text" },
                { label: "Entry Fee (Diamonds)", key: "entryFeeDiamonds", type: "number" },
                { label: "Prize Pool (Diamonds)", key: "prizePoolDiamonds", type: "number" },
                { label: "Max Slots", key: "maxSlots", type: "number" },
                { label: "Start Time", key: "startTime", type: "datetime-local" },
                { label: "Room ID", key: "roomId", type: "text" },
                { label: "Room Password", key: "roomPassword", type: "text" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">{f.label}</label>
                  <input
                    type={f.type}
                    value={(tForm as Record<string, unknown>)[f.key] as string}
                    onChange={e => setTForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full h-9 rounded-xl bg-white/5 border border-white/8 px-3 text-xs text-white outline-none focus:border-primary/30"
                  />
                </div>
              ))}
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Status</label>
                <select value={tForm.status} onChange={e => setTForm(prev => ({ ...prev, status: e.target.value }))} className="w-full h-9 rounded-xl bg-white/5 border border-white/8 px-3 text-xs text-zinc-300 outline-none">
                  {["upcoming", "ongoing", "completed", "cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button onClick={editingTournament ? handleUpdateTournament : handleCreateTournament}
                className="w-full h-11 rounded-2xl font-bold text-sm btn-primary-gradient text-white active:scale-95 transition-transform mt-2">
                {editingTournament ? "Update Tournament" : "Create Tournament"}
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* Participants modal */}
      {participantsFor && (
        <ModalBackdrop onClose={() => { setParticipantsFor(null); setEditingParticipant(null); }}>
          <div className="rounded-3xl p-5 w-full max-w-2xl max-h-[90dvh] overflow-y-auto" style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-heading font-bold text-white text-base">{participantsFor.title}</h2>
                <p className="text-xs text-zinc-500">{participants.length} participants</p>
              </div>
              <button onClick={() => { setParticipantsFor(null); setEditingParticipant(null); }} className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-zinc-400"><X className="w-4 h-4" /></button>
            </div>

            {editingParticipant ? (
              <div className="space-y-3">
                <p className="text-sm font-bold text-white mb-3">Edit: {editingParticipant.inGameName}</p>
                {[
                  { label: "Kills", key: "kills" },
                  { label: "Placement", key: "placement" },
                  { label: "Diamonds Won", key: "diamonds" },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">{f.label}</label>
                    <input
                      type="number"
                      value={(pEdit as Record<string, string>)[f.key]}
                      onChange={e => setPEdit(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className="w-full h-9 rounded-xl bg-white/5 border border-white/8 px-3 text-xs text-white outline-none focus:border-primary/30"
                    />
                  </div>
                ))}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setEditingParticipant(null)} className="flex-1 h-10 rounded-xl font-bold text-xs text-zinc-400 bg-white/5 border border-white/8">Cancel</button>
                  <button onClick={handleUpdateParticipant} className="flex-[2] h-10 rounded-xl font-bold text-xs text-white btn-primary-gradient">Save Changes</button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {participants.map(p => (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{p.inGameName ?? "Unknown"}</p>
                      <p className="text-[10px] text-zinc-600">{p.phone} · Joined {fmtDate(p.joinedAt)}</p>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-zinc-500 shrink-0">
                      <span>⚔️ {p.kills}</span>
                      <span>#{p.placement ?? "—"}</span>
                      <span className="text-emerald-400">{p.diamondsWon}💎</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => { setEditingParticipant(p); setPEdit({ kills: String(p.kills), placement: String(p.placement ?? ""), diamonds: String(p.diamondsWon) }); }} className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => handleRemoveParticipant(p)} className="p-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
                {participants.length === 0 && <p className="text-xs text-zinc-700 text-center py-6">No participants yet</p>}
              </div>
            )}
          </div>
        </ModalBackdrop>
      )}

      {/* Diamond adjust modal */}
      {diamondModal && (
        <ModalBackdrop onClose={() => setDiamondModal(null)}>
          <div className="rounded-3xl p-5 w-full max-w-xs" style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading font-bold text-white text-base">
                {diamondModal.mode === "add" ? "Add Diamonds" : diamondModal.mode === "sub" ? "Remove Diamonds" : "Set Balance"}
              </h2>
              <button onClick={() => setDiamondModal(null)} className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-zinc-400"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-zinc-500 mb-3">{diamondModal.user.inGameName ?? diamondModal.user.phone} · Current: <span className="text-cyan-400 font-bold">{diamondModal.user.diamondBalance}💎</span></p>

            {/* Mode switcher */}
            <div className="flex rounded-xl p-0.5 mb-4" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}>
              {(["add", "sub", "set"] as const).map(m => (
                <button key={m} onClick={() => { setDiamondModal(d => d ? { ...d, mode: m } : d); setDiamondAmount(m === "set" ? String(diamondModal.user.diamondBalance) : ""); }}
                  className={cn("flex-1 py-1 rounded-lg text-[11px] font-bold transition-colors",
                    diamondModal.mode === m
                      ? m === "add" ? "bg-emerald-500/25 text-emerald-300" : m === "sub" ? "bg-red-500/25 text-red-300" : "bg-cyan-500/25 text-cyan-300"
                      : "text-zinc-600 hover:text-zinc-400"
                  )}>
                  {m === "add" ? "+ Add" : m === "sub" ? "− Remove" : "= Set"}
                </button>
              ))}
            </div>

            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">
              {diamondModal.mode === "set" ? "New Balance" : "Amount"}
            </label>
            <input type="number" value={diamondAmount} onChange={e => setDiamondAmount(e.target.value)} placeholder="0" inputMode="numeric" min={0}
              className="w-full h-10 rounded-xl bg-white/5 border border-white/8 px-3 text-sm text-white outline-none focus:border-primary/30 mb-4 font-mono" autoFocus />

            {diamondModal.mode === "set" && diamondAmount && (
              <p className="text-[11px] text-zinc-600 mb-3">
                Change: <span className={cn("font-bold", Number(diamondAmount) >= diamondModal.user.diamondBalance ? "text-emerald-400" : "text-red-400")}>
                  {Number(diamondAmount) >= diamondModal.user.diamondBalance ? "+" : ""}{Number(diamondAmount) - diamondModal.user.diamondBalance}💎
                </span>
              </p>
            )}

            <button onClick={handleAdjustDiamonds} className={cn("w-full h-11 rounded-2xl font-bold text-sm text-white active:scale-95 transition-transform",
              diamondModal.mode === "add" ? "btn-primary-gradient" : diamondModal.mode === "sub" ? "bg-red-500/80 border border-red-500/50" : "bg-cyan-600/80 border border-cyan-500/50"
            )}>
              {diamondModal.mode === "add" ? "Add Diamonds" : diamondModal.mode === "sub" ? "Remove Diamonds" : "Set Balance"}
            </button>
          </div>
        </ModalBackdrop>
      )}

      {/* Per-user notification modal */}
      {notifModal && (
        <ModalBackdrop onClose={() => setNotifModal(null)}>
          <div className="rounded-3xl p-5 w-full max-w-sm" style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading font-bold text-white text-base">Send Notification</h2>
              <button onClick={() => setNotifModal(null)} className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-zinc-400"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-zinc-500 mb-4 flex items-center gap-1.5">
              <Bell className="w-3 h-3 text-pink-400" />
              To: <span className="text-white font-semibold">{notifModal.user.inGameName ?? notifModal.user.phone}</span>
              <span className="text-zinc-700">· #{notifModal.user.id}</span>
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Type</label>
                <select value={notifType} onChange={e => setNotifType(e.target.value)} className="w-full h-9 rounded-xl bg-white/5 border border-white/8 px-3 text-xs text-zinc-300 outline-none">
                  {["system", "tournament", "result", "wallet"].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Title</label>
                <input value={notifTitle} onChange={e => setNotifTitle(e.target.value)} placeholder="Notification title…"
                  className="w-full h-9 rounded-xl bg-white/5 border border-white/8 px-3 text-xs text-white placeholder:text-zinc-700 outline-none focus:border-primary/30" autoFocus />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Message</label>
                <textarea value={notifBody} onChange={e => setNotifBody(e.target.value)} rows={3} placeholder="Write your message here…"
                  className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2 text-xs text-white placeholder:text-zinc-700 outline-none focus:border-primary/30 resize-none" />
              </div>
            </div>

            <button onClick={handleNotifUser} disabled={notifLoading || !notifTitle.trim() || !notifBody.trim()}
              className="w-full h-11 rounded-2xl font-bold text-sm text-white mt-4 active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #db2777, #9d174d)" }}>
              {notifLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Send Notification</>}
            </button>
          </div>
        </ModalBackdrop>
      )}

      {/* Squad members modal */}
      {squadMembersFor && (
        <ModalBackdrop onClose={() => setSquadMembersFor(null)}>
          <div className="rounded-3xl p-5 w-full max-w-sm max-h-[80dvh] overflow-y-auto" style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-heading font-bold text-white text-base">{squadMembersFor.name}</h2>
                <p className="text-xs text-zinc-500 font-mono">{squadMembersFor.uid}</p>
              </div>
              <button onClick={() => setSquadMembersFor(null)} className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-zinc-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2">
              {squadMembers.map(m => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: m.userId === squadMembersFor.leaderId ? "hsl(var(--primary)/0.2)" : "rgba(255,255,255,0.05)" }}>
                    {m.userId === squadMembersFor.leaderId ? <Crown className="w-4 h-4 text-primary" /> : <Users className="w-3 h-3 text-zinc-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{m.inGameName ?? "Unknown"}</p>
                    <p className="text-[10px] text-zinc-600">{m.role} · {m.status}</p>
                  </div>
                  {m.uid && <p className="text-[9px] text-zinc-700 font-mono shrink-0">{m.uid}</p>}
                </div>
              ))}
              {squadMembers.length === 0 && <p className="text-xs text-zinc-700 text-center py-4">No members found</p>}
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* Delete confirm modal */}
      {deleteConfirmId !== null && deleteConfirmType && (
        <ModalBackdrop onClose={() => { setDeleteConfirmId(null); setDeleteConfirmType(null); }}>
          <div className="rounded-3xl p-5 w-full max-w-xs text-center" style={{ background: "#111", border: "1px solid rgba(239,68,68,0.25)" }}>
            <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <h2 className="font-heading font-bold text-white text-base mb-2">Confirm Delete</h2>
            <p className="text-xs text-zinc-500 mb-5">This action cannot be undone. All associated data will be removed.</p>
            <div className="flex gap-2">
              <button onClick={() => { setDeleteConfirmId(null); setDeleteConfirmType(null); }} className="flex-1 h-10 rounded-xl font-bold text-xs text-zinc-400 bg-white/5 border border-white/8">Cancel</button>
              <button onClick={() => {
                if (deleteConfirmType === "tournament") handleDeleteTournament(deleteConfirmId);
                if (deleteConfirmType === "squad") handleDeleteSquad(deleteConfirmId);
              }} className="flex-1 h-10 rounded-xl font-bold text-xs text-white bg-red-500 border border-red-400 active:bg-red-600">
                Delete
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* ── Inactivity passphrase lock overlay ── */}
      {isPassphraseLocked && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center px-5" style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(16px)" }}>
          <div className="w-full max-w-sm">
            <div className="flex flex-col items-center mb-8 gap-3">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(var(--primary)/0.2), hsl(var(--primary)/0.08))", border: "1px solid hsl(var(--primary)/0.3)" }}>
                <Lock className="w-8 h-8 text-primary" />
              </div>
              <div className="text-center">
                <h2 className="font-heading text-2xl font-black text-white tracking-tight">Session Locked</h2>
                <p className="text-zinc-500 text-sm mt-1">You were inactive for 15 minutes.<br />Enter your security passphrase to continue.</p>
              </div>
            </div>

            <div className="rounded-3xl p-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-2 mb-5">
                <Shield className="w-4 h-4 text-zinc-500" />
                <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold">Verify Identity</p>
              </div>

              <div className="mb-4">
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold mb-1.5">Security Passphrase</p>
                <div className="relative">
                  <input
                    type={showLockPass ? "text" : "password"}
                    value={lockPassInput}
                    onChange={e => { setLockPassInput(e.target.value); setLockPassError(""); }}
                    onKeyDown={e => e.key === "Enter" && handleVerifyPassphrase()}
                    placeholder="Enter passphrase…"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    autoFocus
                    className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-4 pr-10 text-sm text-white placeholder:text-zinc-700 outline-none focus:border-primary/40 font-mono"
                  />
                  <button onClick={() => setShowLockPass(v => !v)} className="absolute right-3 top-3 text-zinc-600">
                    {showLockPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {lockPassError && (
                <p className="text-xs text-red-400 mb-3 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" /> {lockPassError}
                </p>
              )}

              <button
                onClick={handleVerifyPassphrase}
                disabled={lockPassLoading}
                className="w-full h-11 rounded-2xl font-bold text-sm text-white btn-primary-gradient active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2 mb-3"
              >
                {lockPassLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Shield className="w-4 h-4" /> Unlock Session</>}
              </button>

              <button
                onClick={handleLogout}
                className="w-full h-9 rounded-xl text-xs text-zinc-600 hover:text-red-400 transition-colors flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign out completely
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sidebar nav item ─────────────────────────────────────────────────────

function SidebarItem({
  icon: Icon,
  label,
  active,
  onClick,
  external,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
  external?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[12.5px] font-semibold transition-all duration-150 active:scale-[0.97]",
        active
          ? "text-primary"
          : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05]"
      )}
      style={active ? { background: "rgba(234,88,12,0.12)", border: "1px solid rgba(234,88,12,0.25)" } : {}}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1 text-left leading-none">{label}</span>
      {external && <ArrowUpRight className="w-3 h-3 opacity-40 shrink-0" />}
    </button>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────

function ModalBackdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-8" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div className="relative w-full flex justify-center" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
