import { useEffect, useState } from "react";
import { ArrowLeft, Check, ChevronDown, Copy, Flame, ShieldCheck, Trophy, User, Users, Zap } from "lucide-react";
import { useLocation } from "wouter";
import { CoinIcon } from "@/components/CoinIcon";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const PRIZE_POOLS = [
  { entry: 12, prize: 20 },
  { entry: 30, prize: 50 },
  { entry: 42, prize: 70 },
];

const MODES = [
  { id: "duel", label: "Normal 1v1", team: "Solo" },
  { id: "healing", label: "Healing Battle", team: "Solo", comingSoon: true },
  { id: "knife", label: "Knife Fight", team: "Solo", comingSoon: true },
];

const GAME_TYPES = [
  { id: "cs", label: "Clash Squad" },
  { id: "br", label: "Battle Royale", comingSoon: true },
];

export default function QuickMatchHub() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [gameType, setGameType] = useState("cs");
  const [teamSize, setTeamSize] = useState("Solo");
  const [modeId, setModeId] = useState("duel");
  const [poolIndex, setPoolIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [activeMatch, setActiveMatch] = useState<{ matchId: string; gameType: string; modeId: string } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    apiFetch<{ status: string; matchId?: string; gameType?: string; modeId?: string }>("/quickmatch/match")
      .then(data => {
        if (data.status !== "none" && data.matchId) {
          setActiveMatch({ matchId: data.matchId, gameType: data.gameType ?? "cs", modeId: data.modeId ?? "duel" });
        }
      })
      .catch(() => {});
  }, []);

  const pool = PRIZE_POOLS[poolIndex];
  const currentMode = MODES.find(mode => mode.id === modeId) ?? MODES[0];
  const displayName = user?.inGameName || user?.username || "Player";
  const userId = String(user?.id ?? user?.uid ?? "—");

  const copyUserId = async () => {
    if (userId === "—") return;
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard is optional */ }
  };

  const selectGameType = (value: string) => {
    if (value === "br") return;
    setGameType(value);
    setModeId("duel");
    setTeamSize("Solo");
  };

  const handleJoin = () => {
    setBalanceError(null);
    if (activeMatch) {
      navigate(`/quickmatch/${activeMatch.gameType}/${activeMatch.modeId}`);
      return;
    }
    const balance = user?.diamondBalance ?? 0;
    if (balance < pool.entry) {
      setBalanceError(`You need ${pool.entry} coins to join. Your balance: ${balance}`);
      return;
    }
    sessionStorage.setItem("qm_entry", String(pool.entry));
    sessionStorage.setItem("qm_prize", String(pool.prize));
    navigate(`/quickmatch/${gameType}/${modeId}`);
  };

  return (
    <div className="qm-hub min-h-[100dvh] bg-slate-950 text-slate-100">
      <style>{`
        .qm-hub { font-family: Inter, sans-serif; }
        .qm-hub .qm-heading { font-family: Rajdhani, sans-serif; }
        .qm-hub select { color-scheme: dark; }
        @keyframes qm-enter { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        @keyframes qm-pulse { 0%,100% { opacity:1 } 50% { opacity:.45 } }
        @keyframes qm-shimmer { 0% { transform:translateX(-120%) } 100% { transform:translateX(120%) } }
        .qm-enter { animation: qm-enter .45s ease both; }
        .qm-shimmer { animation: qm-shimmer 3s ease-in-out infinite; }
      `}</style>

      <header className="border-b border-white/5 bg-slate-950/95 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button onClick={() => navigate("/")} aria-label="Back to home" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[.06] transition hover:bg-white/10 active:scale-95">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <Zap className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="qm-heading text-xl font-bold text-white">Instant Matchmaking</h1>
              <p className="truncate text-[11px] text-slate-500">Find a worthy opponent in seconds</p>
            </div>
          </div>
          <div className="hidden items-center gap-1.5 text-[11px] font-bold text-emerald-400 sm:flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> LIVE
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-5 px-4 py-5 pb-10 sm:px-6">
        <section className={`flex items-center justify-between rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/30 p-4 shadow-xl sm:p-5 ${visible ? "qm-enter" : "opacity-0"}`}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <User className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-bold text-white">{displayName}</h2>
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">PLAYER</span>
              </div>
              <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">ID: {userId}</p>
            </div>
          </div>
          <button onClick={copyUserId} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-2 text-[10px] font-semibold text-slate-300 transition hover:bg-slate-700 sm:px-3 sm:text-xs">
            {copied ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> <span className="text-emerald-400">Copied</span></> : <><Copy className="h-3.5 w-3.5 text-amber-400" /> Copy ID</>}
          </button>
        </section>

        <section className={`rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl ${visible ? "qm-enter [animation-delay:80ms]" : "opacity-0"}`}>
          <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-200"><Flame className="h-4 w-4 text-amber-400" /> Match Settings</h2>
            <span className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-400">Free Fire 1v1</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="relative block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Category</span>
              <select value={gameType} onChange={e => selectGameType(e.target.value)} className="w-full appearance-none rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 pr-8 text-xs font-medium outline-none transition focus:border-amber-500">
                {GAME_TYPES.map(game => <option key={game.id} value={game.id} disabled={game.comingSoon}>{game.label}{game.comingSoon ? " (Soon)" : ""}</option>)}
              </select><ChevronDown className="pointer-events-none absolute right-3 top-9 h-4 w-4 text-slate-500" />
            </label>
            <label className="relative block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Mode</span>
              <select value={teamSize} onChange={e => setTeamSize(e.target.value)} className="w-full appearance-none rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 pr-8 text-xs font-medium outline-none transition focus:border-amber-500">
                <option>Solo</option><option>Duo (Coming Soon)</option><option>Squad (Coming Soon)</option>
              </select><ChevronDown className="pointer-events-none absolute right-3 top-9 h-4 w-4 text-slate-500" />
            </label>
            <label className="relative block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Game</span>
              <select value={modeId} onChange={e => setModeId(e.target.value)} className="w-full appearance-none rounded-xl border border-amber-500/30 bg-slate-950 px-3 py-3 pr-8 text-xs font-semibold text-amber-300 outline-none transition focus:border-amber-500">
                {MODES.map(mode => <option key={mode.id} value={mode.id} disabled={mode.comingSoon}>{mode.label}{mode.comingSoon ? " (Soon)" : ""}</option>)}
              </select><ChevronDown className="pointer-events-none absolute right-3 top-9 h-4 w-4 text-amber-400" />
            </label>
          </div>
        </section>

        <section className={`${visible ? "qm-enter [animation-delay:160ms]" : "opacity-0"}`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300"><Trophy className="h-4 w-4 text-amber-400" /> Select Entry Fee &amp; Prize</h2>
            <span className="text-[10px] text-slate-500">Instant Match</span>
          </div>
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {PRIZE_POOLS.map((item, index) => {
              const selected = index === poolIndex;
              return <button key={item.entry} onClick={() => setPoolIndex(index)} className={`relative rounded-2xl border p-3.5 text-left transition-all sm:p-4 ${selected ? "scale-[1.02] border-amber-500 bg-gradient-to-br from-amber-500/20 via-slate-900 to-slate-900 shadow-lg shadow-amber-500/10" : "border-slate-800 bg-slate-900/80 hover:border-slate-700"}`}>
                {selected && <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-slate-950"><Check className="h-3.5 w-3.5 stroke-[3]" /></span>}
                <span className="mb-1 block text-[9px] font-medium uppercase tracking-wider text-slate-500">Entry Fee</span>
                <span className="flex items-center gap-1 text-lg font-black text-white sm:text-xl"><CoinIcon width={15} /> {item.entry}</span>
                <span className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2.5 text-[10px] text-slate-500"><span>Win Prize</span><span className="flex items-center gap-1 font-bold text-amber-400"><Trophy className="h-3 w-3" /> {item.prize}</span></span>
              </button>;
            })}
          </div>
        </section>

        <section className="flex items-center justify-between rounded-2xl border border-yellow-500/20 bg-yellow-500/[.07] px-4 py-3">
          <div className="flex items-center gap-2"><CoinIcon width={17} /><span className="text-xs font-bold text-yellow-300">Your Balance</span></div>
          <span className="text-sm font-black tabular-nums text-white">{(user?.diamondBalance ?? 0).toLocaleString()} coins</span>
        </section>

        {balanceError && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-400">{balanceError}</div>}

        <button onClick={handleJoin} className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-4 text-slate-950 shadow-xl shadow-orange-600/20 transition hover:from-amber-400 hover:to-orange-500 active:scale-[.98]">
          <div className="qm-shimmer pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <span className="relative flex items-center justify-center gap-2.5 text-sm font-black uppercase tracking-wide sm:text-base"><Zap className="h-5 w-5 fill-slate-950" /> {activeMatch ? "Resume Active Match" : `Find Opponent (${pool.entry} Coins)`}</span>
        </button>

        <div className="flex items-center justify-center gap-5 pt-1 text-[10px] text-slate-600"><span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Fair play verified</span><span className="flex items-center gap-1"><Users className="h-3.5 w-3.5 text-amber-500" /> Server-matched</span></div>
        <p className="text-center text-[10px] leading-relaxed text-slate-600">Your entry fee is secured when you join the queue and refunded automatically if the search expires.</p>
      </main>
    </div>
  );
}