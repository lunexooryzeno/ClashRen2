import React, { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { CachedImg } from "@/components/CachedImg";
import { ArrowLeft, Search, UserPlus, Check, Users, Loader2, UserSearch } from "lucide-react";
import { cn } from "@/lib/utils";

interface Player {
  id: number;
  inGameName: string;
  uid: string;
  profilePicture?: string | null;
}

export default function SquadFriendsPage() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"find">("find");
  const [results, setResults] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [invited, setInvited] = useState<Set<number>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}`, { credentials: "include" });
        if (res.ok) {
          const data: Player[] = await res.json();
          setResults(data);
          setSearched(true);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  function invite(id: number) {
    setInvited(prev => new Set([...prev, id]));
  }

  return (
    <div className="min-h-[100dvh] flex flex-col profile-page-bg">
      <div className="flex items-center gap-3 px-4 pt-6 pb-4">
        <Link href="/profile">
          <button className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
        </Link>
        <div>
          <h1 className="font-heading text-lg font-bold text-foreground">Find Players</h1>
          <p className="text-xs text-muted-foreground">Search real players by name or UID</p>
        </div>
      </div>

      <div className="px-4 flex-1 pb-10 overflow-y-auto">
        {/* Search bar */}
        <div className="relative mb-5">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or UID…"
            className="w-full h-11 rounded-xl bg-white/5 border border-white/10 pl-10 pr-4 text-sm text-white outline-none focus:border-primary/40 placeholder:text-zinc-600"
            autoFocus
          />
          {loading && (
            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 animate-spin" />
          )}
        </div>

        {/* Empty / idle state */}
        {!query.trim() && (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <UserSearch className="w-7 h-7 text-zinc-600" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-semibold text-zinc-500">Find real players</p>
            <p className="text-xs text-zinc-700 max-w-[220px]">Type at least 2 characters to search by in-game name or Free Fire UID</p>
          </div>
        )}

        {/* No results */}
        {searched && results.length === 0 && !loading && (
          <div className="rounded-2xl p-6 flex flex-col items-center text-center"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <Users className="w-8 h-8 text-zinc-700 mb-2" strokeWidth={1.5} />
            <p className="text-sm font-semibold text-zinc-500">No players found</p>
            <p className="text-xs text-zinc-700 mt-1">Try a different name or UID</p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <>
            <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-3">
              Players · {results.length}
            </p>
            <div className="space-y-2">
              {results.map(p => (
                <div key={p.id} className="rounded-2xl p-3.5 flex items-center gap-3"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    {p.profilePicture
                      ? <CachedImg src={p.profilePicture.startsWith("/api/") || p.profilePicture.startsWith("http") ? p.profilePicture : `/api/storage${p.profilePicture}`} alt="" className="w-full h-full object-cover" />
                      : <span className="text-xl">🎮</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{p.inGameName}</p>
                    <p className="text-[10px] text-zinc-500 font-mono">{p.uid}</p>
                  </div>
                  <button
                    onClick={() => invite(p.id)}
                    disabled={invited.has(p.id)}
                    className={cn(
                      "text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors shrink-0 flex items-center gap-1",
                      invited.has(p.id)
                        ? "bg-white/5 text-zinc-600 cursor-not-allowed"
                        : "bg-primary/15 text-primary border border-primary/25 active:bg-primary/25"
                    )}
                  >
                    {invited.has(p.id)
                      ? <><Check className="w-3 h-3" /> Invited</>
                      : <><UserPlus className="w-3 h-3" /> Invite</>
                    }
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
