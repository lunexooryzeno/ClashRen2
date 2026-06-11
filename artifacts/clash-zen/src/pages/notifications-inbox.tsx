import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Trophy, CheckCircle2, Wallet, Info, Users, Check, Trash2, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AppNotification, NotifType,
  fetchNotifications, apiMarkAllRead, apiMarkRead, apiDeleteNotification,
  formatNotifTime, groupNotifications,
} from "@/lib/notifications";

const TYPE_META: Record<NotifType, { icon: React.ElementType; color: string; bg: string; border: string }> = {
  tournament:     { icon: Trophy,       color: "text-amber-400",   bg: "bg-amber-500/12",   border: "border-amber-500/25" },
  result:         { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/12", border: "border-emerald-500/25" },
  wallet:         { icon: Wallet,       color: "text-blue-400",    bg: "bg-blue-500/12",    border: "border-blue-500/25" },
  squad_request:  { icon: Users,        color: "text-primary",     bg: "bg-primary/12",     border: "border-primary/25" },
  squad_accepted: { icon: Users,        color: "text-emerald-400", bg: "bg-emerald-500/12", border: "border-emerald-500/25" },
  system:         { icon: Info,         color: "text-zinc-400",    bg: "bg-white/6",        border: "border-white/12" },
};

export default function NotificationsInboxPage() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [tab, setTab] = useState<"all" | "unread">("all");

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setItems(data);
    } catch { setItems([]); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unreadCount = items.filter(n => !n.read).length;
  const visible = tab === "unread" ? items.filter(n => !n.read) : items;
  const { today, earlier } = groupNotifications(visible);

  async function handleMarkAllRead() {
    try {
      await apiMarkAllRead();
      setItems(prev => prev.map(n => ({ ...n, read: true })));
    } catch { /* ignore */ }
  }

  async function handleMarkRead(id: number) {
    try {
      await apiMarkRead(id);
      setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch { /* ignore */ }
  }

  async function handleDelete(id: number) {
    try {
      await apiDeleteNotification(id);
      setItems(prev => prev.filter(n => n.id !== id));
    } catch { /* ignore */ }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col profile-page-bg">
      <div className="flex items-center justify-between px-4 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()} className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div>
            <h1 className="font-heading text-lg font-bold text-white tracking-tight">Received</h1>
            <p className="text-xs text-zinc-500">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button onClick={handleMarkAllRead}
            className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl border active:opacity-70"
            style={{ background: "hsl(var(--primary)/0.1)", border: "1px solid hsl(var(--primary)/0.25)", color: "hsl(var(--primary))" }}>
            <Check className="w-3 h-3" /> Mark all read
          </button>
        )}
      </div>

      <div className="px-4 mb-4">
        <div className="flex rounded-2xl p-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {(["all", "unread"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("flex-1 h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all",
                tab === t ? "btn-primary-gradient text-white shadow" : "text-zinc-500")}>
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
    </div>
  );
}

export function NotifCard({ notif, onRead, onDelete }: {
  notif: AppNotification;
  onRead: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const meta = TYPE_META[notif.type] ?? TYPE_META.system;
  const Icon = meta.icon;

  return (
    <div
      onClick={() => !notif.read && onRead(notif.id)}
      className={cn("relative rounded-2xl p-3.5 flex items-start gap-3 transition-colors cursor-default", !notif.read ? "active:bg-white/5" : "")}
      style={{
        background: notif.read ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.05)",
        border: notif.read ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(255,255,255,0.1)",
      }}>
      {!notif.read && (
        <span className="absolute top-3.5 right-3.5 w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.8)]" />
      )}
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border", meta.bg, meta.border)}>
        <Icon className={cn("w-5 h-5", meta.color)} />
      </div>
      <div className="flex-1 min-w-0 pr-6">
        <p className={cn("text-sm font-bold leading-snug", notif.read ? "text-zinc-300" : "text-white")}>{notif.title}</p>
        <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{notif.body}</p>
        <p className="text-[10px] text-zinc-600 mt-1.5">{formatNotifTime(notif.createdAt)}</p>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete(notif.id); }}
        className="absolute bottom-3 right-3 w-6 h-6 rounded-lg flex items-center justify-center active:bg-red-500/25">
        <Trash2 className="w-3 h-3 text-zinc-600" />
      </button>
    </div>
  );
}
