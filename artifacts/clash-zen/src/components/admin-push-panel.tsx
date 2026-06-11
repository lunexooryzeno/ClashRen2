import { useState, useEffect, useCallback } from "react";
import { Megaphone, Users, User, Send, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PushStats { totalSubscriptions: number; subscribedUsers: number }
interface SendResult { sent: number; failed: number; inApp?: number }

const TYPES = [
  { value: "system",     label: "Announcement",   emoji: "📢" },
  { value: "tournament", label: "Tournament",      emoji: "🏆" },
  { value: "result",     label: "Match Result",    emoji: "🎯" },
  { value: "wallet",     label: "Wallet/Payment",  emoji: "💎" },
];

async function fetchStats(): Promise<PushStats> {
  const res = await fetch("/api/admin/push/stats", { credentials: "include" });
  if (!res.ok) throw new Error("failed");
  return res.json();
}

async function doSend(payload: object): Promise<SendResult> {
  const res = await fetch("/api/admin/push/send", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error ?? "Send failed");
  }
  return res.json();
}

export function AdminPushPanel() {
  const [stats, setStats]       = useState<PushStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [target, setTarget]     = useState<"all" | "user">("all");
  const [userId, setUserId]     = useState("");
  const [title, setTitle]       = useState("");
  const [body, setBody]         = useState("");
  const [type, setType]         = useState("system");
  const [url, setUrl]           = useState("");
  const [sending, setSending]   = useState(false);
  const [result, setResult]     = useState<SendResult | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try { setStats(await fetchStats()); } catch { /* ignore */ }
    finally { setStatsLoading(false); }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) { setError("Title and body are required"); return; }
    if (target === "user" && !userId.trim()) { setError("Enter a user ID"); return; }
    setError(null);
    setResult(null);
    setSending(true);
    try {
      const res = await doSend({
        target,
        userId: target === "user" ? parseInt(userId) : undefined,
        title: title.trim(),
        body: body.trim(),
        type,
        url: url.trim() || "/notifications",
      });
      setResult(res);
      setTitle(""); setBody(""); setUrl("");
      if (target === "user") setUserId("");
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const canSend = !sending && !!title.trim() && !!body.trim() && (target === "all" || !!userId.trim());

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
            <Megaphone className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Push Notifications</h2>
            <p className="text-[11px] text-zinc-500">Send real-time alerts to users' phones</p>
          </div>
        </div>
        <button
          onClick={loadStats}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/8 hover:bg-white/8 transition-colors text-xs"
        >
          <Users className="w-3 h-3 text-primary" />
          <span className="text-zinc-300 font-semibold">
            {statsLoading ? "…" : `${stats?.subscribedUsers ?? 0} devices`}
          </span>
          <RefreshCw className={cn("w-3 h-3 text-zinc-600", statsLoading && "animate-spin")} />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {/* Target */}
        <div className="grid grid-cols-2 gap-2">
          {([
            ["all",  "All Users",      Users] as const,
            ["user", "Specific User",  User]  as const,
          ]).map(([val, label, Icon]) => (
            <button
              key={val}
              onClick={() => { setTarget(val); setResult(null); setError(null); }}
              className={cn(
                "flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all border",
                target === val
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "bg-white/4 border-white/8 text-zinc-500 hover:text-white",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* User ID (only when target = user) */}
        {target === "user" && (
          <Input
            value={userId}
            onChange={e => setUserId(e.target.value)}
            placeholder="User ID (number)"
            type="number"
            className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 h-10 text-sm"
          />
        )}

        {/* Title */}
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Title — e.g. New Tournament Live!"
          maxLength={80}
          className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 h-10 text-sm"
        />

        {/* Body */}
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Message — e.g. Squad mode is open. Join now to win big."
          maxLength={200}
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors"
        />
        <p className="text-[10px] text-zinc-600 -mt-1">{body.length}/200</p>

        {/* Type + URL */}
        <div className="grid grid-cols-2 gap-2">
          <select
            value={type}
            onChange={e => setType(e.target.value)}
            className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary/40"
          >
            {TYPES.map(t => (
              <option key={t.value} value={t.value} className="bg-zinc-900">
                {t.emoji} {t.label}
              </option>
            ))}
          </select>
          <Input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="Tap URL (optional)"
            className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 h-10 text-xs"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>
              Delivered to <span className="font-bold">{result.sent}</span> device{result.sent !== 1 ? "s" : ""}
              {(result.inApp ?? 0) > 0 && <span className="text-zinc-400"> · {result.inApp} in-app</span>}
              {result.failed > 0 && <span className="text-zinc-500"> · {result.failed} unreachable</span>}
            </span>
          </div>
        )}

        {/* Send */}
        <Button
          onClick={handleSend}
          disabled={!canSend}
          className="w-full font-bold rounded-xl h-11 gap-2"
        >
          {sending ? (
            <><RefreshCw className="w-4 h-4 animate-spin" /> Sending…</>
          ) : (
            <>
              <Send className="w-4 h-4" />
              {target === "all"
                ? `Broadcast to All (${stats?.subscribedUsers ?? "?"} devices)`
                : "Send to User"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
