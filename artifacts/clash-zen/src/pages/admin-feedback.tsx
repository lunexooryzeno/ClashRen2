import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, ExternalLink, Lightbulb, RefreshCw, Search, UserRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FeedbackItem {
  id: number;
  type: string;
  message: string;
  createdAt: string;
  user: { id: number; inGameName: string | null; phone: string } | null;
}

const TYPE_LABELS: Record<string, string> = {
  bug: "Bug report",
  suggestion: "Suggestion",
  general: "General",
};

export default function AdminFeedbackPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");

  async function loadFeedback() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/feedback", { credentials: "include" });
      if (!res.ok) throw new Error(res.status === 403 ? "Admin access required." : "Could not load feedback.");
      setItems(await res.json() as FeedbackItem[]);
    } catch (error) {
      toast({ title: "Failed to load feedback", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadFeedback(); }, []);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter(item => {
      if (type !== "all" && item.type !== type) return false;
      if (!query) return true;
      return [
        item.message,
        item.user?.inGameName ?? "",
        item.user?.phone ?? "",
      ].some(value => value.toLowerCase().includes(query));
    });
  }, [items, search, type]);

  return (
    <div className="min-h-[100dvh] bg-[#0a0612] text-white">
      <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-[#0a0612]/95 backdrop-blur-xl">
        <button
          onClick={() => navigate("/admin")}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10"
          aria-label="Back to admin"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-500/15 border border-amber-500/25">
          <Lightbulb className="w-5 h-5 text-amber-300" />
        </div>
        <div className="flex-1">
          <h1 className="font-heading text-base font-bold">User Feedback</h1>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
            {items.length} total message{items.length === 1 ? "" : "s"}
          </p>
        </div>
        <button
          onClick={loadFeedback}
          disabled={loading}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10"
          aria-label="Refresh feedback"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="rounded-2xl p-3 space-y-3 bg-white/[0.03] border border-white/[0.08]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search message, name, or phone"
              className="w-full rounded-xl bg-black/20 border border-white/10 pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-amber-400/50"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {["all", "bug", "suggestion", "general"].map(option => (
              <button
                key={option}
                onClick={() => setType(option)}
                className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold border transition-colors ${
                  type === option
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/35"
                    : "bg-white/[0.03] text-zinc-500 border-white/10 hover:text-white"
                }`}
              >
                {option === "all" ? "All" : TYPE_LABELS[option]}
              </button>
            ))}
          </div>
        </div>

        {loading && items.length === 0 && (
          <div className="py-16 text-center text-sm text-zinc-600">Loading feedback…</div>
        )}
        {!loading && filteredItems.length === 0 && (
          <div className="rounded-2xl py-16 text-center bg-white/[0.03] border border-white/[0.08]">
            <Lightbulb className="w-10 h-10 mx-auto mb-3 text-zinc-700" />
            <p className="text-sm font-bold text-zinc-500">No feedback found</p>
            <p className="text-xs text-zinc-700 mt-1">New messages from the Profile page will appear here.</p>
          </div>
        )}

        <div className="space-y-3">
          {filteredItems.map(item => (
            <article key={item.id} className="rounded-2xl p-4 bg-white/[0.03] border border-white/[0.08]">
              <div className="flex items-start justify-between gap-3 mb-3">
                <span className="rounded-full px-2.5 py-1 text-[10px] font-bold capitalize bg-amber-500/12 text-amber-300 border border-amber-500/25">
                  {TYPE_LABELS[item.type] ?? item.type}
                </span>
                <time className="text-[10px] text-zinc-600">
                  {new Date(item.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
                </time>
              </div>
              <p className="text-sm leading-relaxed text-zinc-200 whitespace-pre-wrap">{item.message}</p>
              <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between gap-3">
                {item.user ? (
                  <>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-violet-500/15 text-violet-300">
                        <UserRound className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{item.user.inGameName || "Unnamed user"}</p>
                        <p className="text-[10px] text-zinc-500">{item.user.phone}</p>
                      </div>
                    </div>
                    <Link
                      href={`/286c81443d1fb388d1b9a8e3b280824c/user_management/${encodeURIComponent(item.user.phone)}/${item.user.id}`}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold text-violet-300 bg-violet-500/10 border border-violet-500/25 hover:bg-violet-500/20"
                    >
                      View profile <ExternalLink className="w-3 h-3" />
                    </Link>
                  </>
                ) : (
                  <p className="text-[11px] text-zinc-600">Anonymous or deleted account</p>
                )}
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}