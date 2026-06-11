import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Flame, Skull, Star, Zap, Target, Medal,
  RefreshCw, AlertTriangle, Shield, Activity, Users,
  User, TrendingUp, Crosshair, Award, Heart, Clock,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

async function saFetch<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Super-Admin-Token": token, ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json();
}

type Gamemode = "br" | "cs";
type Matchmode = "CAREER" | "RANKED" | "NORMAL";

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
interface PlayerInfo {
  nickname: string | null; level: number | null; rank: number | null;
  rankingPoints: number | null; liked: number | null; region: string | null;
  creditScore: number | null; signature: string | null;
}
interface FFStatsResponse {
  uid: string; gamemode: string; matchmode: string;
  player: PlayerInfo | null;
  stats: {
    solostats?: FFModeStats; duostats?: FFModeStats; quadstats?: FFModeStats;
    csstats?: FFModeStats;
  } | null;
}
interface UserDetail { id: number; phone: string; inGameName: string | null; uid: string | null; }

const kdr = (kills = 0, deaths = 0) =>
  deaths > 0 ? (kills / deaths).toFixed(2) : kills > 0 ? kills.toFixed(2) : "0.00";
const winRate = (wins = 0, games = 0) =>
  games > 0 ? ((wins / games) * 100).toFixed(1) + "%" : "0%";
const fmtTime = (sec = 0) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

function StatCell({ icon, label, val, color }: { icon: React.ReactNode; label: string; val: string | number; color: string }) {
  return (
    <div className="rounded-2xl p-3 text-center flex flex-col items-center gap-1.5"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className={cn("w-7 h-7 rounded-xl flex items-center justify-center", color.replace("text-", "bg-").replace("400", "500/15"))}>
        <div className={color}>{icon}</div>
      </div>
      <p className="text-base font-bold text-white leading-none">{val}</p>
      <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-bold">{label}</p>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden animate-pulse" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="h-10 bg-white/5" />
      <div className="p-4 grid grid-cols-3 gap-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-white/5" />
        ))}
      </div>
    </div>
  );
}

function BRStatsContent({ stats, matchmode }: { stats: FFStatsResponse["stats"]; matchmode: Matchmode }) {
  const modes = [
    { key: "solostats" as const, label: "Solo",  Icon: User,  accent: { text: "text-sky-400", bg: "rgba(14,165,233,0.08)", border: "rgba(14,165,233,0.22)", badge: "bg-sky-500/15 text-sky-400 border-sky-500/25" } },
    { key: "duostats"  as const, label: "Duo",   Icon: Users, accent: { text: "text-violet-400", bg: "rgba(139,92,246,0.08)", border: "rgba(139,92,246,0.22)", badge: "bg-violet-500/15 text-violet-400 border-violet-500/25" } },
    { key: "quadstats" as const, label: "Squad", Icon: Shield, accent: { text: "text-orange-400", bg: "rgba(234,88,12,0.08)", border: "rgba(234,88,12,0.22)", badge: "bg-orange-500/15 text-orange-400 border-orange-500/25" } },
  ];

  const anyData = modes.some(m => stats?.[m.key]);

  if (!anyData) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-16 h-16 rounded-3xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <Flame className="w-8 h-8 text-zinc-700" />
        </div>
        <p className="text-zinc-500 text-sm font-medium">No BR stats for {matchmode}</p>
        <p className="text-zinc-700 text-xs">Try switching to CAREER mode</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {modes.map(({ key, label, Icon, accent }) => {
        const s = stats?.[key];
        if (!s) return null;
        const d = s.detailedstats ?? {};
        return (
          <div key={key} className="rounded-2xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${accent.border}` }}>
            <div className="px-4 py-3 flex items-center justify-between"
              style={{ background: accent.bg, borderBottom: `1px solid ${accent.border}` }}>
              <div className="flex items-center gap-2.5">
                <div className={cn("w-7 h-7 rounded-xl flex items-center justify-center", accent.badge.split(" ").slice(0,1).join(" "))}>
                  <Icon className={cn("w-3.5 h-3.5", accent.text)} />
                </div>
                <span className={cn("text-sm font-bold uppercase tracking-wider", accent.text)}>{label}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", accent.badge)}>
                  {(s.gamesplayed ?? 0).toLocaleString()} matches
                </span>
              </div>
            </div>
            <div className="p-3 grid grid-cols-3 gap-2">
              <StatCell icon={<Activity className="w-3.5 h-3.5" />} label="Games"    val={(s.gamesplayed ?? 0).toLocaleString()}       color="text-blue-400" />
              <StatCell icon={<Skull className="w-3.5 h-3.5" />}    label="Kills"    val={(s.kills ?? 0).toLocaleString()}             color="text-red-400" />
              <StatCell icon={<Star className="w-3.5 h-3.5" />}     label="Wins"     val={(s.wins ?? 0).toLocaleString()}              color="text-yellow-400" />
              <StatCell icon={<Zap className="w-3.5 h-3.5" />}      label="K/D Ratio" val={kdr(s.kills, d.deaths)}                   color="text-orange-400" />
              <StatCell icon={<TrendingUp className="w-3.5 h-3.5" />} label="Win Rate" val={winRate(s.wins, s.gamesplayed)}          color="text-emerald-400" />
              <StatCell icon={<Crosshair className="w-3.5 h-3.5" />} label="HS Kills" val={(d.headshotKills ?? 0).toLocaleString()}  color="text-pink-400" />
              <StatCell icon={<Award className="w-3.5 h-3.5" />}    label="Best Kill" val={(d.highestKills ?? 0).toLocaleString()}   color="text-cyan-400" />
            </div>
            <div className="px-3 pb-3 grid grid-cols-2 gap-2">
              {d.damage != null && (
                <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-bold mb-0.5">Total Damage</p>
                  <p className="text-sm font-bold text-white">{d.damage.toLocaleString()}</p>
                </div>
              )}
              {d.survivalTime != null && (
                <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-bold mb-0.5">Survival Time</p>
                  <p className="text-sm font-bold text-white">{fmtTime(d.survivalTime)}</p>
                </div>
              )}
              {d.topNTimes != null && (
                <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-bold mb-0.5">Top 3 Finishes</p>
                  <p className="text-sm font-bold text-white">{d.topNTimes.toLocaleString()}</p>
                </div>
              )}
              {d.knockDown != null && (
                <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-bold mb-0.5">Knockdowns</p>
                  <p className="text-sm font-bold text-white">{d.knockDown.toLocaleString()}</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CSStatsContent({ stats, matchmode }: { stats: FFStatsResponse["stats"]; matchmode: Matchmode }) {
  const s = stats?.csstats;

  if (!s) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-16 h-16 rounded-3xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <Shield className="w-8 h-8 text-zinc-700" />
        </div>
        <p className="text-zinc-500 text-sm font-medium">No CS stats for {matchmode}</p>
        <p className="text-zinc-700 text-xs">Try switching to CAREER mode</p>
      </div>
    );
  }

  const d = s.detailedstats ?? {};

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(16,185,129,0.25)" }}>
        <div className="px-4 py-3 flex items-center justify-between"
          style={{ background: "rgba(16,185,129,0.08)", borderBottom: "1px solid rgba(16,185,129,0.2)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <span className="text-sm font-bold text-emerald-400 uppercase tracking-wider">Clash Squad</span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-400 border-emerald-500/25">
            {(s.gamesplayed ?? 0).toLocaleString()} matches
          </span>
        </div>
        <div className="p-3 grid grid-cols-3 gap-2">
          <StatCell icon={<Activity className="w-3.5 h-3.5" />}   label="Games"     val={(s.gamesplayed ?? 0).toLocaleString()}    color="text-blue-400" />
          <StatCell icon={<Skull className="w-3.5 h-3.5" />}      label="Kills"     val={(s.kills ?? 0).toLocaleString()}          color="text-red-400" />
          <StatCell icon={<Star className="w-3.5 h-3.5" />}       label="Wins"      val={(s.wins ?? 0).toLocaleString()}           color="text-yellow-400" />
          <StatCell icon={<Zap className="w-3.5 h-3.5" />}        label="K/D Ratio" val={kdr(s.kills, d.deaths)}                  color="text-orange-400" />
          <StatCell icon={<TrendingUp className="w-3.5 h-3.5" />} label="Win Rate"  val={winRate(s.wins, s.gamesplayed)}          color="text-emerald-400" />
          <StatCell icon={<Crosshair className="w-3.5 h-3.5" />}  label="HS Kills"  val={(d.headShotKills ?? 0).toLocaleString()} color="text-pink-400" />
          <StatCell icon={<Award className="w-3.5 h-3.5" />}      label="MVP"       val={(d.mvpCount ?? 0).toLocaleString()}      color="text-cyan-400" />
        </div>
        <div className="px-3 pb-3 grid grid-cols-2 gap-2">
          {[
            { label: "Total Damage",  val: (d.damage ?? 0).toLocaleString() },
            { label: "Assists",       val: (d.assists ?? 0).toLocaleString() },
            { label: "Double Kills",  val: (d.doubleKills ?? 0).toLocaleString() },
            { label: "Triple Kills",  val: (d.tripleKills ?? 0).toLocaleString() },
            { label: "4-Kill Rounds", val: (d.fourKills ?? 0).toLocaleString() },
            { label: "Knockdowns",    val: (d.knockDowns ?? 0).toLocaleString() },
            { label: "Revivals",      val: (d.revivals ?? 0).toLocaleString() },
            { label: "Deaths",        val: (d.deaths ?? 0).toLocaleString() },
          ].map(item => (
            <div key={item.label} className="rounded-xl px-3 py-2.5"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-bold mb-0.5">{item.label}</p>
              <p className="text-sm font-bold text-white">{item.val}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminFFStatsPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ phone: string; uid: string }>();
  const phone = decodeURIComponent(params.phone ?? "");
  const userId = parseInt(params.uid ?? "0");

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserDetail | null>(null);

  const [gamemode, setGamemode] = useState<Gamemode>("br");
  const [matchmode, setMatchmode] = useState<Matchmode>("CAREER");

  const [data, setData] = useState<FFStatsResponse | null>(null);
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playerFetched = useRef(false);

  const backUrl = `/286c81443d1fb388d1b9a8e3b280824c/user_management/${encodeURIComponent(phone)}/${userId}`;

  useEffect(() => {
    const s = getSession();
    if (!s) { navigate(`/286c81443d1fb388d1b9a8e3b280824c/user_management`); return; }
    setToken(s.token);
    saFetch<UserDetail>(`/admin/users/${userId}`, s.token)
      .then(u => setUser(u))
      .catch(() => {});
  }, []);

  const fetchStats = useCallback(async (tok: string, ffUid: string, gm: Gamemode, mm: Matchmode) => {
    setLoading(true);
    setError(null);
    try {
      const res = await saFetch<FFStatsResponse>(
        `/super-admin/freefire/stats?uid=${encodeURIComponent(ffUid)}&gamemode=${gm}&matchmode=${mm}`,
        tok,
      );
      setData(res);
      if (!playerFetched.current && res.player) {
        setPlayer(res.player);
        playerFetched.current = true;
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token || !user?.uid) return;
    fetchStats(token, user.uid, gamemode, matchmode);
  }, [token, user, gamemode, matchmode]);

  const handleGamemode = (gm: Gamemode) => {
    if (gm === gamemode) return;
    setGamemode(gm);
    if (gm === "cs") setMatchmode("CAREER");
  };

  const handleMatchmode = (mm: Matchmode) => {
    if (mm === matchmode) return;
    setMatchmode(mm);
  };

  const displayName = player?.nickname ?? user?.inGameName ?? "Unknown Player";
  const ffUid = user?.uid ?? "";

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "#0a0612" }}>
      {/* Ambient background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-72 h-72 rounded-full opacity-[0.06]"
          style={{ background: "radial-gradient(circle, #ea580c, transparent)" }} />
        <div className="absolute top-1/2 -right-24 w-64 h-64 rounded-full opacity-[0.04]"
          style={{ background: "radial-gradient(circle, #10b981, transparent)" }} />
      </div>

      {/* Sticky header */}
      <div className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3"
        style={{ background: "rgba(10,6,18,0.92)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={() => navigate(backUrl)}
          className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <ArrowLeft className="w-4.5 h-4.5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">Free Fire Stats</p>
          <p className="text-[10px] text-zinc-600 truncate">{displayName}</p>
        </div>
        <button
          onClick={() => { if (token && user?.uid) fetchStats(token, user.uid, gamemode, matchmode); }}
          disabled={loading || !user?.uid}
          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-orange-400 disabled:opacity-40 transition-colors"
          style={{ background: "rgba(255,255,255,0.05)" }}>
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </button>
      </div>

      <div className="flex-1 px-4 pb-10 flex flex-col gap-4 pt-4 relative z-10">
        {/* Player identity card */}
        {(player || user) && (
          <div className="rounded-3xl p-4 flex items-center gap-4"
            style={{ background: "linear-gradient(135deg, rgba(234,88,12,0.14) 0%, rgba(255,255,255,0.03) 100%)", border: "1px solid rgba(234,88,12,0.28)" }}>
            <div className="relative shrink-0">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, rgba(234,88,12,0.3), rgba(234,88,12,0.1))", border: "1px solid rgba(234,88,12,0.4)" }}>
                <Flame className="w-7 h-7 text-orange-400" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-white truncate leading-tight">{displayName}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {player?.level != null && (
                  <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/20">
                    Lv {player.level}
                  </span>
                )}
                {player?.rankingPoints != null && (
                  <span className="text-[10px] font-bold text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20">
                    {(player.rankingPoints as number).toLocaleString()} BP
                  </span>
                )}
                {player?.liked != null && (
                  <span className="text-[10px] text-zinc-500 flex items-center gap-0.5">
                    <Heart className="w-2.5 h-2.5" />{(player.liked as number).toLocaleString()}
                  </span>
                )}
              </div>
              {player?.signature && (
                <p className="text-[10px] text-zinc-500 mt-1 truncate italic">"{player.signature}"</p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[8px] text-zinc-700 uppercase tracking-widest mb-0.5">FF UID</p>
              <p className="text-[11px] font-mono text-zinc-400">{ffUid}</p>
            </div>
          </div>
        )}

        {/* Game mode switcher */}
        <div className="flex flex-col gap-2">
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold px-1">Game Mode</p>
          <div className="flex gap-2">
            {([
              { gm: "br" as Gamemode, label: "Battle Royale", icon: Flame,  active: "bg-orange-500/20 text-orange-400 border-orange-500/40", inactive: "bg-white/[0.04] text-zinc-500 border-white/[0.08] hover:text-white" },
              { gm: "cs" as Gamemode, label: "Clash Squad",   icon: Shield, active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40", inactive: "bg-white/[0.04] text-zinc-500 border-white/[0.08] hover:text-white" },
            ]).map(({ gm, label, icon: Icon, active, inactive }) => (
              <button
                key={gm}
                onClick={() => handleGamemode(gm)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold border transition-all",
                  gamemode === gm ? active : inactive
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Match mode switcher */}
        <div className="flex flex-col gap-2">
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold px-1">Match Mode</p>
          <div className="flex gap-1.5">
            {(["CAREER", "RANKED", "NORMAL"] as Matchmode[]).map(mm => {
              const isActive = matchmode === mm;
              const colors: Record<Matchmode, string> = {
                CAREER: isActive ? "bg-blue-500/20 text-blue-400 border-blue-500/35" : "",
                RANKED: isActive ? "bg-amber-500/20 text-amber-400 border-amber-500/35" : "",
                NORMAL: isActive ? "bg-zinc-400/15 text-zinc-300 border-zinc-400/25" : "",
              };
              return (
                <button
                  key={mm}
                  onClick={() => handleMatchmode(mm)}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all tracking-wide",
                    isActive ? colors[mm] : "bg-white/[0.04] text-zinc-600 border-white/[0.08] hover:text-zinc-400"
                  )}
                >
                  {mm}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content area */}
        {!user?.uid && !loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-16 h-16 rounded-3xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <Flame className="w-8 h-8 text-zinc-700" />
            </div>
            <p className="text-zinc-500 text-sm font-medium">No Free Fire UID set</p>
            <p className="text-zinc-700 text-xs">This user has not linked a Free Fire account</p>
          </div>
        )}

        {user?.uid && error && (
          <div className="rounded-2xl p-4 flex items-start gap-3"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-red-400 mb-0.5">Failed to load stats</p>
              <p className="text-xs text-red-300/70">{error}</p>
            </div>
            <button
              onClick={() => { if (token && user?.uid) fetchStats(token, user.uid, gamemode, matchmode); }}
              className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-1 rounded-lg border border-red-500/20 shrink-0">
              Retry
            </button>
          </div>
        )}

        {user?.uid && loading && (
          <div className="flex flex-col gap-3">
            <SkeletonCard />
            {gamemode === "br" && <SkeletonCard />}
            {gamemode === "br" && <SkeletonCard />}
          </div>
        )}

        {user?.uid && !loading && !error && data && (
          gamemode === "br"
            ? <BRStatsContent stats={data.stats} matchmode={matchmode} />
            : <CSStatsContent stats={data.stats} matchmode={matchmode} />
        )}
      </div>
    </div>
  );
}
