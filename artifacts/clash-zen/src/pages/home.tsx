import { useEffect, useRef, useState } from "react";
import { CachedImg } from "@/components/CachedImg";
import {
  useListTournaments,
  useGetLeaderboard,
  useGetMyStats,
  useGetMe,
  useGetMyHistory,
} from "@workspace/api-client-react";
import type { HistoryEntry } from "@workspace/api-client-react";
import { TournamentCard } from "@/components/tournament-card";
import { Link } from "wouter";
import {
  ChevronRight, Shield, Swords,
  User, Users, Crosshair, Medal, Flame, Target,
  TrendingUp, Crown, Gem, Wallet, Clock, CheckCircle,
  BookOpen, Award, Share2, Lightbulb, CalendarClock, ArrowRight, Zap,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isToday, isTomorrow, formatDistanceToNow } from "date-fns";

interface ApiBanner {
  id: number;
  title: string;
  tag: string | null;
  subtitle: string | null;
  buttonText: string | null;
  buttonUrl: string | null;
  imageUrl: string | null;
  accentColor: string;
  placement: string;
  displayOrder: number;
  isActive: boolean;
}

/* ── Mode meta ────────────────────────────────────────────────────────────── */

const MODES = [
  { mode: "solo",  label: "Solo",  color: "#ef4444", Icon: User,   desc: "1v1 Survival",  img: "/modes/solo.jpg"  },
  { mode: "duo",   label: "Duo",   color: "#a855f7", Icon: Users,  desc: "2-Player Team",  img: "/modes/duo.webp"  },
  { mode: "squad", label: "Squad", color: "#f59e0b", Icon: Shield, desc: "4-Player Crew",  img: "/modes/squad.jpg" },
];

/* ── Quick actions ────────────────────────────────────────────────────────── */

const QUICK_ACTIONS = [
  { label: "Top Up",    href: "/wallet",      Icon: Wallet,    color: "#38bdf8" },
  { label: "Matches",  href: "/matches",     Icon: Swords,    color: "#ef4444" },
  { label: "History",  href: "/history",     Icon: Clock,     color: "#a855f7" },
  { label: "Rankings", href: "/leaderboard", Icon: TrendingUp, color: "#eab308" },
];

/* ── How To Play steps ────────────────────────────────────────────────────── */

const HOW_TO_STEPS = [
  { step: "01", title: "Choose a Mode", desc: "Pick Solo, Duo, or Squad — whatever fits your squad." , Icon: Target,       color: "#ef4444" },
  { step: "02", title: "Join a Match",  desc: "Browse open tournaments and register before they fill up.", Icon: Swords,       color: "#a855f7" },
  { step: "03", title: "Win & Earn",    desc: "Top the scoreboard to claim your prize pool diamonds.",    Icon: Award,        color: "#eab308" },
];

/* ── Pro Tips ─────────────────────────────────────────────────────────────── */

const PRO_TIPS = [
  { tip: "Land in less crowded zones early game to loot safely and fight on your own terms.", tag: "Survival" , color: "#38bdf8" },
  { tip: "Always keep a smoke grenade — it can save your life when healing in an open field.", tag: "Tactics",  color: "#a855f7" },
  { tip: "Watch the blue zone timer before engaging; don't get caught outside it late game.",  tag: "Zone Play", color: "#f59e0b" },
  { tip: "Crouch-walk in buildings to avoid footstep sounds — surprise is your best weapon.", tag: "Stealth",  color: "#ef4444" },
  { tip: "Communicate kill counts with your squad — sharing info wins more than lone gunning.", tag: "Squad IQ", color: "#22c55e" },
];

/* ── Banner helpers ───────────────────────────────────────────────────────── */

function bannerImgSrc(imageUrl: string | null): string {
  if (!imageUrl) return "";
  // Already a direct API path (disk-upload) or external URL — pass through unchanged
  if (imageUrl.startsWith("/api/") || imageUrl.startsWith("http")) return imageUrl;
  // Legacy object-storage path
  const path = imageUrl.startsWith("/objects/") ? imageUrl.slice("/objects/".length) : imageUrl;
  return `/api/storage/objects/${path}`;
}

type CarouselBanner = {
  id: number | string;
  tag: string;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  accent: string;
  glow: string;
  badge: string;
  image: string;
};

function apiBannerToCarousel(b: ApiBanner): CarouselBanner {
  const color = b.accentColor || "#a855f7";
  const tagWords = (b.tag ?? "").split(" ");
  const badge = tagWords[tagWords.length - 1] || "NEW";
  return {
    id: b.id,
    tag: b.tag ?? "",
    title: b.title,
    subtitle: b.subtitle ?? "",
    cta: b.buttonText || "View More",
    href: b.buttonUrl || "/matches",
    accent: color,
    glow: `${color}4d`,
    badge: badge.replace(/[^\w]/g, "").toUpperCase() || "NEW",
    image: b.imageUrl ? bannerImgSrc(b.imageUrl) : "",
  };
}

/* ── Banner carousel ──────────────────────────────────────────────────────── */

function BannerCarousel({ items }: { items: CarouselBanner[] }) {
  const [idx, setIdx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const count = items.length;

  function goTo(n: number) { setIdx(((n % count) + count) % count); }
  function next() { goTo(idx + 1); }
  function prev() { goTo(idx - 1); }

  function resetTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(next, 3800);
  }

  useEffect(() => {
    setIdx(0);
  }, [items.length]);

  useEffect(() => {
    if (count < 2) return;
    resetTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [idx, count]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
    setDragging(true);
    if (timerRef.current) clearInterval(timerRef.current);
  }
  function onTouchMove(e: React.TouchEvent) {
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  }
  function onTouchEnd() {
    setDragging(false);
    if (touchDeltaX.current < -40) next();
    else if (touchDeltaX.current > 40) prev();
    resetTimer();
  }

  if (count === 0) return null;

  const safeIdx = Math.min(idx, count - 1);
  const b = items[safeIdx];

  return (
    <div className="w-full select-none" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="overflow-hidden rounded-3xl h-[178px]"
        style={{ boxShadow: `0 8px 48px ${b.glow}`, transition: "box-shadow 0.4s ease" }}>
        <div className="flex h-full"
          style={{
            width: `${items.length * 100}%`,
            transform: `translateX(-${(safeIdx * 100) / items.length}%)`,
            transition: "transform 0.42s cubic-bezier(0.4, 0, 0.2, 1)",
          }}>
          {items.map((banner) => {
            const isExternal = /^https?:\/\//.test(banner.href);
            const Tag = isExternal ? "a" : Link;
            return (
            <Tag key={banner.id} href={banner.href} style={{ width: `${100 / items.length}%`, flexShrink: 0 }}>
              <div className="relative h-[178px] cursor-pointer w-full">
                {banner.image ? (
                  <CachedImg src={banner.image} alt={banner.title} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
                ) : (
                  <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${banner.accent}28 0%, #0a0612 100%)` }} />
                )}
                <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.38) 60%, rgba(0,0,0,0.18) 100%)" }} />
                <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 85% 50%, ${banner.glow} 0%, transparent 60%)` }} />
                <div className="relative z-10 h-full flex flex-col justify-between p-5">
                  <div className="flex items-start justify-between">
                    <span className="text-[11px] font-bold text-white/80 tracking-wide">{banner.tag}</span>
                    <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full tracking-widest"
                      style={{ background: `${banner.accent}33`, color: banner.accent, border: `1px solid ${banner.accent}66` }}>
                      {banner.badge}
                    </span>
                  </div>
                  <div>
                    <h2 className="font-heading text-2xl font-extrabold text-white leading-tight tracking-tight mb-1 drop-shadow-md">{banner.title}</h2>
                    {banner.subtitle && <p className="text-[11px] text-white/65 leading-snug mb-3">{banner.subtitle}</p>}
                    {banner.cta && (
                      <span className="inline-flex h-8 px-4 rounded-xl text-xs font-bold items-center gap-1.5"
                        style={{ background: `${banner.accent}33`, border: `1px solid ${banner.accent}66`, color: banner.accent }}>
                        {banner.cta} <ChevronRight className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Tag>
            );
          })}
        </div>
      </div>
      {count > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2.5">
          {items.map((_, i) => (
            <button key={i}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); goTo(i); resetTimer(); }}
              className="rounded-full transition-all"
              style={{ width: i === safeIdx ? 18 : 6, height: 6, background: i === safeIdx ? b.accent : "rgba(255,255,255,0.28)" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Placement badge ──────────────────────────────────────────────────────── */

function PlaceBadge({ placement }: { placement: number | null | undefined }) {
  if (placement == null) return <span className="text-[11px] text-white/40">—</span>;
  if (placement === 1) return <span className="text-[11px] font-extrabold text-yellow-400">🥇 #1</span>;
  if (placement === 2) return <span className="text-[11px] font-extrabold text-slate-300">🥈 #2</span>;
  if (placement === 3) return <span className="text-[11px] font-extrabold text-amber-700">🥉 #3</span>;
  return <span className="text-[11px] font-bold text-white/50">#{placement}</span>;
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function Home() {
  // staleTime: 2 min for mostly-static data → re-navigation is instant from cache.
  // refetchInterval: only live matches need a short poll; schedule/leaderboard can be slower.
  const { data: upcoming, isLoading: upcomingLoading } = useListTournaments(
    { status: "upcoming" },
    { query: { staleTime: 2 * 60 * 1000, refetchInterval: 60_000 } },
  );
  const { data: live, isLoading: liveLoading } = useListTournaments(
    { status: "ongoing" },
    { query: { staleTime: 30 * 1000, refetchInterval: 30_000 } },
  );
  // Leaderboard changes rarely — 5 min stale, no auto-poll on home page.
  const { data: leaderboard, isLoading: lbLoading } = useGetLeaderboard(
    { limit: 5 },
    { query: { staleTime: 5 * 60 * 1000 } },
  );
  const { data: me } = useGetMe();
  const { data: myStats } = useGetMyStats();
  // History rarely changes while browsing home — 2 min stale is fine.
  const { data: myHistory, isLoading: historyLoading } = useGetMyHistory(
    { query: { staleTime: 2 * 60 * 1000 } },
  );
  const [tipIdx, setTipIdx] = useState(0);
  const tipTouchX = useRef<number | null>(null);
  const [apiBanners, setApiBanners] = useState<ApiBanner[] | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTipIdx(p => (p + 1) % PRO_TIPS.length), 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch("/api/banners")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: ApiBanner[]) => setApiBanners(data))
      .catch(() => setApiBanners(null));
  }, []);

  const carouselItems: CarouselBanner[] =
    apiBanners && apiBanners.length > 0
      ? apiBanners.map(apiBannerToCarousel)
      : [];

  const rankColors = ["#FFD700", "#C0C0C0", "#CD7F32", "rgba(255,255,255,0.5)", "rgba(255,255,255,0.4)"];

  const recentHistory = (myHistory ?? []).slice(0, 3) as (HistoryEntry & { placement?: number | null })[];


  return (
    <div className="flex-1 overflow-y-auto pb-8" style={{ background: "hsl(var(--background))" }}>

      <div className="relative pt-5 pb-6 px-4"
        style={{ background: "linear-gradient(180deg, #030303 0%, hsl(var(--background)) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 50% 0%, hsl(var(--primary)/0.10) 0%, transparent 65%)" }} />

        {/* ── Banner carousel ── */}
        {apiBanners === null ? (
          <div className="relative z-10 mb-5">
            <Skeleton className="h-36 w-full rounded-2xl bg-white/5" />
          </div>
        ) : carouselItems.length > 0 && (
          <div className="relative z-10 mb-5">
            <BannerCarousel items={carouselItems} />
          </div>
        )}

        {/* ── Mode Quick Links ── */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading text-base font-extrabold text-white flex items-center gap-2 tracking-wide uppercase">
              <Target className="w-4 h-4 text-primary" />
              Play Mode
            </h3>
            <Link href="/matches" className="flex items-center gap-0.5 text-[11px] font-bold text-primary/80 hover:text-primary transition-colors">
              All Events <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {MODES.map(m => (
              <Link key={m.mode} href={`/matches/mode/${m.mode}`}>
                <div
                  className="relative overflow-hidden rounded-2xl cursor-pointer active:scale-95 transition-transform select-none"
                  style={{ aspectRatio: "4/5", border: `1.5px solid ${m.color}50` }}
                >
                  {/* Background image */}
                  <img
                    src={m.img}
                    alt={m.label}
                    className="absolute inset-0 w-full h-full object-cover object-center"
                    loading="lazy"
                    decoding="async"
                  />
                  {/* Gradient fading bottom for text */}
                  <div
                    className="absolute inset-0"
                    style={{ background: `linear-gradient(to bottom, rgba(0,0,0,0.0) 30%, rgba(0,0,0,0.80) 100%)` }}
                  />
                  {/* Color tint */}
                  <div className="absolute inset-0" style={{ background: `${m.color}18` }} />
                  {/* Label pinned bottom */}
                  <div className="absolute bottom-0 left-0 right-0 p-2 flex flex-col items-center gap-0.5">
                    <span
                      className="text-[13px] font-extrabold tracking-wide"
                      style={{ color: m.color, textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}
                    >
                      {m.label}
                    </span>
                    <span className="text-[9px] text-white/55 text-center">{m.desc}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Quick Match Banner ── */}
        <Link href="/quickmatch" className="block mb-5">
          <div
            className="relative overflow-hidden rounded-2xl cursor-pointer active:scale-[0.975] transition-transform select-none"
            style={{
              background: "linear-gradient(135deg, rgba(239,68,68,0.14) 0%, rgba(59,130,246,0.14) 100%)",
              border: "1px solid rgba(239,68,68,0.28)",
              boxShadow: "0 4px 28px rgba(239,68,68,0.15)",
            }}
          >
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: "radial-gradient(ellipse at 80% 50%, rgba(239,68,68,0.18) 0%, transparent 60%)" }} />
            <div className="absolute top-0 left-0 right-0 h-[2px]"
              style={{ background: "linear-gradient(90deg,#ef4444,#3b82f6)" }} />

            <div className="relative z-10 flex items-center gap-4 px-4 py-4">
              {/* Icon */}
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  background: "linear-gradient(135deg, rgba(239,68,68,0.25), rgba(239,68,68,0.1))",
                  border: "1.5px solid rgba(239,68,68,0.4)",
                  boxShadow: "0 0 20px rgba(239,68,68,0.3)",
                }}
              >
                <Zap className="w-6 h-6 text-yellow-400" fill="currentColor" />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[15px] font-extrabold text-white">Quick Match</span>
                  <span
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest uppercase"
                    style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.35)" }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"
                      style={{ animation: "live-pulse-home 1.4s ease-in-out infinite" }}
                    />
                    Live
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 truncate">Find an opponent instantly — CS &amp; BR modes</p>
              </div>

              {/* Arrow */}
              <ArrowRight className="w-5 h-5 text-zinc-500 shrink-0" />
            </div>
          </div>
        </Link>
        <style>{`
          @keyframes live-pulse-home {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `}</style>

        {/* ── Upcoming Schedule ── */}
        {(upcomingLoading || (upcoming && upcoming.filter(t => t.filledSlots < t.maxSlots).length > 0)) && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading text-base font-extrabold text-white flex items-center gap-2 tracking-wide uppercase">
                <CalendarClock className="w-4 h-4 text-primary" />
                Schedule
              </h3>
              <Link href="/matches" className="flex items-center gap-0.5 text-[11px] font-bold text-primary/80 hover:text-primary transition-colors">
                View All <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="flex overflow-x-auto pb-3 -mx-4 px-4 gap-3 snap-x snap-mandatory hide-scrollbar">
              {upcomingLoading
                ? [1,2,3].map(i => <Skeleton key={i} className="h-44 min-w-[260px] rounded-2xl bg-white/5 snap-center flex-shrink-0" />)
                : upcoming!.filter(t => t.filledSlots < t.maxSlots).slice(0, 6).map((t, i) => {
                const start = new Date(t.startTime);
                const dayLabel = isToday(start) ? "Today" : isTomorrow(start) ? "Tomorrow" : format(start, "EEE d MMM");
                const timeLabel = format(start, "h:mm a");
                const filled = Math.round((t.filledSlots / t.maxSlots) * 100);
                const slotsLeft = t.maxSlots - t.filledSlots;
                const modeColor = t.gameMode?.toLowerCase().includes("solo") ? "#ef4444"
                  : t.gameMode?.toLowerCase().includes("duo") ? "#a855f7"
                  : t.gameMode?.toLowerCase().includes("clash") ? "#22c55e"
                  : "#f59e0b";
                const fillColor = filled > 80 ? "#ef4444" : filled > 50 ? "#f59e0b" : "#22c55e";
                return (
                  <Link key={t.id} href={`/event/${t.id}`} className="min-w-[260px] snap-center flex-shrink-0">
                    <div className="relative overflow-hidden rounded-2xl h-full cursor-pointer active:scale-[0.975] transition-transform"
                      style={{ background: `linear-gradient(135deg, ${modeColor}12 0%, rgba(255,255,255,0.03) 100%)`, border: `1.5px solid ${modeColor}35` }}>
                      {/* Top accent bar */}
                      <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${modeColor}, ${modeColor}40)` }} />

                      <div className="px-4 py-3">
                        {/* Mode badge + time */}
                        <div className="flex items-center gap-2 mb-2.5">
                          <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full tracking-widest uppercase"
                            style={{ background: `${modeColor}22`, color: modeColor, border: `1px solid ${modeColor}45` }}>
                            {(() => {
                              const gm = (t.gameMode ?? "").toLowerCase().replace(/\s+/g, "_");
                              if (gm === "clash_squad_knockout") return "CS · KO";
                              if (gm.endsWith("_knockout")) return gm.replace("_knockout", "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) + " · KO";
                              return t.gameMode;
                            })()}
                          </span>
                          <div className="flex items-center gap-1 text-[10px] text-white/45 ml-auto">
                            <CalendarClock className="w-3 h-3" />
                            <span className="font-mono font-bold text-white/65">{timeLabel}</span>
                          </div>
                        </div>

                        {/* Tournament name */}
                        <p className="text-[14px] font-extrabold text-white leading-snug mb-1 truncate">{t.name}</p>
                        <p className="text-[10px] text-white/40 font-medium mb-3">{dayLabel}</p>

                        {/* Prize */}
                        <div className="flex items-center gap-1.5 mb-3">
                          <div className="flex items-center gap-1 rounded-lg px-2.5 py-1"
                            style={{ background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.22)" }}>
                            <Gem className="w-3.5 h-3.5 text-blue-400" />
                            <span className="text-[13px] font-extrabold font-mono text-blue-300">{t.prizePoolDiamonds}</span>
                          </div>
                          <span className="text-[9px] text-white/35 uppercase tracking-wide font-semibold">Prize Pool</span>
                        </div>

                        {/* Fill bar + slots left */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${filled}%`, background: fillColor }} />
                          </div>
                          <span className="text-[10px] font-bold shrink-0 tabular-nums"
                            style={{ color: slotsLeft <= 5 ? "#ef4444" : "rgba(255,255,255,0.35)" }}>
                            {slotsLeft > 0 ? `${slotsLeft} left` : "Full"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Starting Soon ── */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading text-base font-extrabold text-white flex items-center gap-2 tracking-wide uppercase">
              <Swords className="w-4 h-4 text-primary" />
              Starting Soon
            </h3>
            <Link href="/matches" className="flex items-center gap-0.5 text-[11px] font-bold text-primary/80 hover:text-primary transition-colors" data-testid="link-view-all-events">
              View All <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="flex overflow-x-auto pb-3 -mx-4 px-4 gap-3 snap-x snap-mandatory hide-scrollbar">
            {upcomingLoading
              ? [1, 2, 3].map(i => <Skeleton key={i} className="h-40 min-w-[272px] rounded-2xl bg-white/5 snap-center flex-shrink-0" />)
              : upcoming && upcoming.filter(t => t.filledSlots < t.maxSlots).length > 0
                ? upcoming.filter(t => t.filledSlots < t.maxSlots).map(t => (
                    <div key={t.id} className="min-w-[272px] snap-center flex-shrink-0">
                      <TournamentCard tournament={t} showJoinButton />
                    </div>
                  ))
                : (
                  <div className="glass-card w-full p-6 text-center rounded-2xl">
                    <p className="text-sm font-bold text-zinc-400">No active arenas right now</p>
                    <p className="text-xs text-zinc-600 mt-1">New battles drop every day — check back soon</p>
                  </div>
                )}
          </div>
        </div>

        {/* ── Pro Tips ── */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading text-base font-extrabold text-white flex items-center gap-2 tracking-wide uppercase">
              <Lightbulb className="w-4 h-4 text-yellow-400" />
              Pro Tips
            </h3>
            <div className="flex items-center gap-1.5">
              {PRO_TIPS.map((_, i) => (
                <button key={i} onClick={() => setTipIdx(i)}
                  className="rounded-full transition-all duration-300"
                  style={{ width: i === tipIdx ? 14 : 5, height: 5, background: i === tipIdx ? PRO_TIPS[tipIdx].color : "rgba(255,255,255,0.2)" }} />
              ))}
            </div>
          </div>
          <div
            className="rounded-2xl px-4 py-4 relative overflow-hidden select-none"
            style={{ background: `${PRO_TIPS[tipIdx].color}0D`, border: `1.5px solid ${PRO_TIPS[tipIdx].color}30` }}
            onTouchStart={e => { tipTouchX.current = e.touches[0].clientX; }}
            onTouchEnd={e => {
              if (tipTouchX.current === null) return;
              const dx = e.changedTouches[0].clientX - tipTouchX.current;
              if (Math.abs(dx) > 40) setTipIdx(p => dx < 0 ? (p + 1) % PRO_TIPS.length : (p - 1 + PRO_TIPS.length) % PRO_TIPS.length);
              tipTouchX.current = null;
            }}
          >
            <div className="absolute right-3 top-3 opacity-10 pointer-events-none">
              <Lightbulb className="w-12 h-12" style={{ color: PRO_TIPS[tipIdx].color }} />
            </div>
            <span className="inline-block text-[9px] font-extrabold tracking-widest px-2 py-0.5 rounded-full mb-2"
              style={{ background: `${PRO_TIPS[tipIdx].color}20`, color: PRO_TIPS[tipIdx].color, border: `1px solid ${PRO_TIPS[tipIdx].color}40` }}>
              {PRO_TIPS[tipIdx].tag}
            </span>
            <p className="text-[13px] text-white/80 leading-relaxed font-medium">{PRO_TIPS[tipIdx].tip}</p>
          </div>
        </div>

        {/* ── Invite Friends ── */}
        <div className="mb-5 relative overflow-hidden rounded-2xl"
          style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.18) 0%, rgba(59,130,246,0.14) 50%, rgba(234,179,8,0.12) 100%)", border: "1.5px solid rgba(168,85,247,0.3)" }}>
          <div className="absolute inset-0 pointer-events-none opacity-10"
            style={{ background: "radial-gradient(ellipse at 10% 50%, #a855f7 0%, transparent 55%), radial-gradient(ellipse at 90% 50%, #eab308 0%, transparent 55%)" }} />
          <div className="relative z-10 px-5 py-4 flex items-center gap-4">
            <div className="flex-1">
              <p className="text-[13px] font-extrabold text-white tracking-wide mb-0.5">Invite Friends 🎮</p>
              <p className="text-[11px] text-white/60 leading-snug">Get your squad in — more players means bigger prize pools for everyone.</p>
              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({ title: "Clash Ren", text: "Join me on Clash Ren — Free Fire Max tournaments with real prizes!", url: window.location.origin });
                  } else {
                    navigator.clipboard?.writeText(window.location.origin);
                  }
                }}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                style={{ background: "rgba(168,85,247,0.25)", border: "1px solid rgba(168,85,247,0.5)", color: "#d8b4fe" }}>
                <Share2 className="w-3.5 h-3.5" />
                Share Clash Ren
              </button>
            </div>
            <div className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
              🏆
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
