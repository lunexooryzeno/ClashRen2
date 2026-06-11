import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, Trophy, CheckCircle2, Wallet, Info, Users,
  Check, Trash2, BellOff, Settings, X, Bell, BellRing, ShieldCheck,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  AppNotification, NotifType,
  fetchNotifications, apiMarkAllRead, apiMarkRead, apiDeleteNotification,
  formatNotifTime, groupNotifications,
} from "@/lib/notifications";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { haptic } from "@/lib/haptics";

const TYPE_META: Record<NotifType, { icon: React.ElementType; color: string; bg: string; border: string }> = {
  tournament:     { icon: Trophy,        color: "text-amber-400",   bg: "bg-amber-500/12",   border: "border-amber-500/25" },
  result:         { icon: CheckCircle2,  color: "text-emerald-400", bg: "bg-emerald-500/12", border: "border-emerald-500/25" },
  wallet:         { icon: Wallet,        color: "text-blue-400",    bg: "bg-blue-500/12",    border: "border-blue-500/25" },
  squad_request:  { icon: Users,         color: "text-primary",     bg: "bg-primary/12",     border: "border-primary/25" },
  squad_accepted: { icon: Users,         color: "text-emerald-400", bg: "bg-emerald-500/12", border: "border-emerald-500/25" },
  system:         { icon: Info,          color: "text-zinc-400",    bg: "bg-white/6",        border: "border-white/12" },
  security:       { icon: ShieldCheck,   color: "text-sky-400",     bg: "bg-sky-500/12",     border: "border-sky-500/25" },
};

const LS_PREFS = "clash-ren:notif-prefs";
interface NotifPrefs { tournament: boolean; result: boolean; system: boolean; security: boolean; }
function getPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(LS_PREFS);
    if (raw) return { tournament: true, result: true, system: true, security: true, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { tournament: true, result: true, system: true, security: true };
}
function savePrefs(p: NotifPrefs) {
  try { localStorage.setItem(LS_PREFS, JSON.stringify(p)); } catch { /* ignore */ }
}

export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [showSettings, setShowSettings] = useState(false);
  const [prefs, setPrefs] = useState<NotifPrefs>(getPrefs);
  const [isLoading, setIsLoading] = useState(true);
  const push = usePushNotifications();

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setItems(data);
      // Auto mark all as read when the page is opened
      if (data.some(n => !n.read)) {
        apiMarkAllRead().catch(() => {});
        setItems(data.map(n => ({ ...n, read: true })));
      }
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unreadCount = items.filter(n => !n.read).length;
  const visible = tab === "unread" ? items.filter(n => !n.read) : items;
  const { today, earlier } = groupNotifications(visible);

  function handleMarkAllRead() {
    setItems(prev => prev.map(n => ({ ...n, read: true })));
    apiMarkAllRead().catch(() => {});
  }

  function handleMarkRead(id: number) {
    setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    apiMarkRead(id).catch(() => {});
  }

  function handleDelete(id: number) {
    setItems(prev => prev.filter(n => n.id !== id));
    apiDeleteNotification(id).catch(() => {});
  }

  function togglePref(key: keyof NotifPrefs) {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    savePrefs(updated);
  }

  if (isLoading) return (
    <div className="min-h-[100dvh] flex flex-col profile-page-bg">
      <div className="flex items-center justify-between px-4 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()} className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28 bg-white/8 rounded" />
            <Skeleton className="h-2.5 w-16 bg-white/5 rounded" />
          </div>
        </div>
        <Skeleton className="w-9 h-9 rounded-xl bg-white/5" />
      </div>
      <div className="px-4 mb-4">
        <Skeleton className="h-11 w-full rounded-2xl bg-white/5" />
      </div>
      <div className="px-4 mb-3">
        <Skeleton className="h-2.5 w-12 bg-white/5 rounded" />
      </div>
      <div className="px-4 space-y-2">
        {[1,2,3,4,5,6].map(i => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <Skeleton className="w-9 h-9 rounded-xl bg-white/8 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <Skeleton className={`h-3 bg-white/8 rounded ${i % 2 === 0 ? "w-3/4" : "w-full"}`} />
              <Skeleton className="h-2.5 w-1/2 bg-white/5 rounded" />
              <Skeleton className="h-2 w-16 bg-white/4 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col profile-page-bg">
      <div className="flex items-center justify-between px-4 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()} className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div>
            <h1 className="font-heading text-lg font-bold text-white tracking-tight">Notifications</h1>
            <p className="text-xs text-zinc-500">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button onClick={() => { haptic.mediumTap(); handleMarkAllRead(); }}
              className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl active:opacity-70"
              style={{ background: "hsl(var(--primary)/0.1)", border: "1px solid hsl(var(--primary)/0.25)", color: "hsl(var(--primary))" }}>
              <Check className="w-3 h-3" /> Mark all
            </button>
          )}
          <button
            onClick={() => { haptic.mediumTap(); setShowSettings(true); }}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
            <Settings className="w-4 h-4 text-zinc-400" />
          </button>
        </div>
      </div>

      <div className="px-4 mb-4">
        <div className="flex rounded-2xl p-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {(["all", "unread"] as const).map(t => (
            <button key={t} onClick={() => { haptic.mediumTap(); setTab(t); }}
              className={cn("flex-1 h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all",
                tab === t ? "btn-primary-gradient text-white shadow" : "text-zinc-500 hover:text-zinc-300")}>
              {t === "all" ? "All" : (
                <>Unread {unreadCount > 0 && <span className="w-4 h-4 rounded-full bg-white/15 flex items-center justify-center text-[9px]">{unreadCount}</span>}</>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 pb-10 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 gap-4">
            <div className="w-16 h-16 rounded-full bg-white/4 border border-white/8 flex items-center justify-center">
              <BellOff className="w-7 h-7 text-zinc-600" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-zinc-500">
                {tab === "unread" ? "All clear — no new alerts" : "Nothing here yet"}
              </p>
              <p className="text-xs text-zinc-700 mt-1">
                {tab === "unread" ? "You're fully caught up" : "Match results, rewards and invites will show up here"}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {today.length > 0 && (
              <section>
                <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2.5">Today</p>
                <div className="space-y-2">
                  {today.map(n => <NotifCard key={n.id} notif={n} onRead={handleMarkRead} onDelete={handleDelete} />)}
                </div>
              </section>
            )}
            {earlier.length > 0 && (
              <section>
                <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2.5">Earlier</p>
                <div className="space-y-2">
                  {earlier.map(n => <NotifCard key={n.id} notif={n} onRead={handleMarkRead} onDelete={handleDelete} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {showSettings && (
        <>
          <div className="fixed inset-0 bg-black/70 z-[90] backdrop-blur-sm" onClick={() => setShowSettings(false)} />
          <div className="fixed inset-x-4 bottom-0 z-[100] pb-8">
            <div className="rounded-3xl overflow-hidden" style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/6">
                <div className="flex items-center gap-2.5">
                  <Bell className="w-4 h-4 text-primary" />
                  <p className="font-heading font-bold text-white text-base">Notification Settings</p>
                </div>
                <button onClick={() => setShowSettings(false)}
                  className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center active:bg-white/10">
                  <X className="w-4 h-4 text-zinc-400" />
                </button>
              </div>
              <div className="px-5 py-3 space-y-1">
                {/* Push notifications master toggle */}
                {push.supported && push.state !== "unsupported" && (
                  <div className="flex items-center justify-between py-3.5 border-b border-white/8">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                        push.state === "subscribed" ? "bg-primary/15" : "bg-white/6")}>
                        <BellRing className={cn("w-4 h-4", push.state === "subscribed" ? "text-primary" : "text-zinc-500")} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">Push Notifications</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {push.state === "denied"
                            ? "Blocked — allow in browser settings"
                            : push.state === "subscribed"
                            ? "Real-time alerts enabled"
                            : "Room unlocks, results, rewards"}
                        </p>
                      </div>
                    </div>
                    {push.state === "denied" ? (
                      <span className="text-[10px] font-bold text-red-400/80 uppercase tracking-wide ml-3 shrink-0">Blocked</span>
                    ) : (
                      <button
                        disabled={push.state === "loading"}
                        onClick={() => push.state === "subscribed" ? push.disable() : push.enable()}
                        className={cn("w-12 h-6 rounded-full transition-colors relative flex items-center shrink-0 ml-4 disabled:opacity-40",
                          push.state === "subscribed" ? "bg-primary" : "bg-white/10")}>
                        <span className={cn("absolute w-5 h-5 rounded-full bg-white shadow transition-transform",
                          push.state === "subscribed" ? "translate-x-6" : "translate-x-0.5")} />
                      </button>
                    )}
                  </div>
                )}

                {([
                  { key: "tournament" as const, label: "Tournament Alerts",  sub: "Upcoming & live tournaments" },
                  { key: "result"     as const, label: "Match Results",      sub: "Win/loss notifications" },
                  { key: "security"   as const, label: "Login Alerts",       sub: "New sign-in notifications" },
                  { key: "system"     as const, label: "App Updates",        sub: "New features & announcements" },
                ] as const).map(({ key, label, sub }) => (
                  <div key={key} className="flex items-center justify-between py-3.5 border-b border-white/5 last:border-0">
                    <div>
                      <p className="text-sm font-bold text-white">{label}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>
                    </div>
                    <button onClick={() => togglePref(key)}
                      className={cn("w-12 h-6 rounded-full transition-colors relative flex items-center shrink-0 ml-4",
                        prefs[key] ? "bg-primary" : "bg-white/10")}>
                      <span className={cn("absolute w-5 h-5 rounded-full bg-white shadow transition-transform",
                        prefs[key] ? "translate-x-6" : "translate-x-0.5")} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NotifCard({ notif, onRead, onDelete }: {
  notif: AppNotification;
  onRead: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const meta = TYPE_META[notif.type] ?? TYPE_META.system;
  const Icon = meta.icon;

  return (
    <div
      onClick={() => { if (!notif.read) { haptic.mediumTap(); onRead(notif.id); } }}
      className={cn("relative rounded-2xl p-3.5 flex items-start gap-3 transition-colors cursor-default", !notif.read ? "active:bg-white/5" : "")}
      style={{
        background: notif.read ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.05)",
        border: notif.read ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(255,255,255,0.1)",
      }}>
      {!notif.read && (
        <span className="absolute top-3.5 right-10 w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.8)]" />
      )}
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border", meta.bg, meta.border)}>
        <Icon className={cn("w-5 h-5", meta.color)} />
      </div>
      <div className="flex-1 min-w-0 pr-8">
        <p className={cn("text-sm font-bold leading-snug", notif.read ? "text-zinc-300" : "text-white")}>{notif.title}</p>
        <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{notif.body}</p>
        <p className="text-[10px] text-zinc-600 mt-1.5">{formatNotifTime(notif.createdAt)}</p>
      </div>
      <button
        onClick={e => { e.stopPropagation(); haptic.mediumTap(); onDelete(notif.id); }}
        className="absolute top-3.5 right-3.5 w-6 h-6 rounded-lg flex items-center justify-center active:bg-red-500/20 transition-colors">
        <Trash2 className="w-3.5 h-3.5 text-zinc-600" />
      </button>
    </div>
  );
}
