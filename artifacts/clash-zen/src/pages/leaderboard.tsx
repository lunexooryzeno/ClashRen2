import React, { useState } from "react";
import { CachedImg } from "@/components/CachedImg";
import { useGetLeaderboard, useGetMe, useGetMyStats } from "@workspace/api-client-react";
import type { LeaderboardEntry } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, Trophy, Zap, Info, X, Copy, Check, User, Gamepad2, TrendingUp, Gem, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function initials(name: string) {
  return name.split(/\s+/).map(w => w[0] ?? "").join("").toUpperCase().slice(0, 2) || "??";
}

const PALETTES = [
  ["#7c3aed","#a855f7"], ["#db2777","#ec4899"], ["#0891b2","#06b6d4"],
  ["#d97706","#f59e0b"], ["#16a34a","#22c55e"], ["#dc2626","#ef4444"],
  ["#6d28d9","#8b5cf6"], ["#0369a1","#0ea5e9"],
];

function palette(name: string) {
  let n = 0;
  for (let i = 0; i < name.length; i++) n += name.charCodeAt(i);
  return PALETTES[n % PALETTES.length];
}

/* ── Avatar ───────────────────────────────────────────────────────────────── */

function seededRand(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

function nameHash(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function AvatarSvg({ name, size }: { name: string; size: number }) {
  const [c1, c2] = palette(name);
  const h = nameHash(name);
  const rand = seededRand(h);

  const skinTones = ["#FDDBB4","#F5C89A","#E8A87C","#C68642","#8D5524","#FFCEA0"];
  const skin = skinTones[Math.floor(rand() * skinTones.length)];
  const hairColors = ["#1a0800","#3b1a00","#7a3b00","#c08040","#e8c060","#e8e0d8","#cc2200","#1a1a3a","#4a0080"];
  const hair = hairColors[Math.floor(rand() * hairColors.length)];

  const eyeType = Math.floor(rand() * 3);
  const mouthType = Math.floor(rand() * 4);
  const hasBeard = rand() > 0.65;
  const hasMustache = rand() > 0.7;
  const hairStyle = Math.floor(rand() * 5);
  const eyebrowThick = rand() > 0.5;
  const pupilColor = ["#1a1a1a","#3b2000","#003020","#001040"][Math.floor(rand() * 4)];

  const s = 100;
  const cx = 50, cy = 54;
  const fw = 32, fh = 36;

  const hairPaths = [
    `M${cx-fw/2-2},${cy-fh/2+4} Q${cx},${cy-fh/2-14} ${cx+fw/2+2},${cy-fh/2+4} L${cx+fw/2+4},${cy-fh/2+12} Q${cx},${cy-fh/2-6} ${cx-fw/2-4},${cy-fh/2+12} Z`,
    `M${cx-fw/2-4},${cy-fh/2+8} Q${cx-8},${cy-fh/2-12} ${cx},${cy-fh/2-14} Q${cx+8},${cy-fh/2-12} ${cx+fw/2+4},${cy-fh/2+8} L${cx+fw/2+6},${cy-fh/2+20} L${cx-fw/2-6},${cy-fh/2+20} Z`,
    `M${cx-fw/2-2},${cy-fh/2+6} Q${cx},${cy-fh/2-16} ${cx+fw/2+2},${cy-fh/2+6} Q${cx+fw/2+8},${cy-4} ${cx+fw/2+6},${cy+8} L${cx-fw/2-6},${cy+8} Q${cx-fw/2-8},${cy-4} ${cx-fw/2-2},${cy-fh/2+6} Z`,
    `M${cx-fw/2},${cy-fh/2+4} C${cx-fw/2-8},${cy-fh/2-8} ${cx-4},${cy-fh/2-16} ${cx},${cy-fh/2-16} C${cx+4},${cy-fh/2-16} ${cx+fw/2+8},${cy-fh/2-8} ${cx+fw/2},${cy-fh/2+4} Z`,
    `M${cx-fw/2-6},${cy-fh/2+10} Q${cx-fw/2-4},${cy-fh/2-10} ${cx},${cy-fh/2-14} Q${cx+fw/2+4},${cy-fh/2-10} ${cx+fw/2+6},${cy-fh/2+10} L${cx+fw/2+10},${cy+16} L${cx-fw/2-10},${cy+16} Z`,
  ];

  return (
    <svg viewBox={`0 0 ${s} ${s}`} width={size} height={size} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`bg-${h}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
        <clipPath id={`circ-${h}`}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="50" fill={`url(#bg-${h})`} />
      <g clipPath={`url(#circ-${h})`}>
        {/* Neck */}
        <rect x={cx-8} y={cy+fh/2-2} width={16} height={18} rx={4} fill={skin} />
        {/* Shoulders */}
        <ellipse cx={cx} cy={cy+fh/2+18} rx={28} ry={14} fill={c1} opacity={0.9} />
        {/* Head */}
        <ellipse cx={cx} cy={cy} rx={fw/2} ry={fh/2} fill={skin} />
        {/* Ear L */}
        <ellipse cx={cx-fw/2-1} cy={cy+2} rx={4} ry={5} fill={skin} />
        {/* Ear R */}
        <ellipse cx={cx+fw/2+1} cy={cy+2} rx={4} ry={5} fill={skin} />
        {/* Hair */}
        <path d={hairPaths[hairStyle]} fill={hair} />
        {/* Eyebrow L */}
        <path d={`M${cx-fw/4-5},${cy-fh/4-2} Q${cx-fw/4},${cy-fh/4-(eyebrowThick?4:3)} ${cx-fw/4+5},${cy-fh/4-2}`}
          stroke={hair} strokeWidth={eyebrowThick?2.2:1.6} fill="none" strokeLinecap="round" />
        {/* Eyebrow R */}
        <path d={`M${cx+fw/4-5},${cy-fh/4-2} Q${cx+fw/4},${cy-fh/4-(eyebrowThick?4:3)} ${cx+fw/4+5},${cy-fh/4-2}`}
          stroke={hair} strokeWidth={eyebrowThick?2.2:1.6} fill="none" strokeLinecap="round" />
        {/* Eye L */}
        {eyeType === 0 && <>
          <ellipse cx={cx-fw/4} cy={cy-1} rx={4.5} ry={4} fill="white" />
          <circle cx={cx-fw/4} cy={cy-1} r={2.5} fill={pupilColor} />
          <circle cx={cx-fw/4+1} cy={cy-2} r={0.9} fill="white" opacity={0.7} />
        </>}
        {eyeType === 1 && <>
          <ellipse cx={cx-fw/4} cy={cy-1} rx={4.5} ry={3.5} fill="white" />
          <ellipse cx={cx-fw/4} cy={cy-0.5} rx={2.5} ry={2} fill={pupilColor} />
        </>}
        {eyeType === 2 && <>
          <path d={`M${cx-fw/4-4},${cy-1} Q${cx-fw/4},${cy-5} ${cx-fw/4+4},${cy-1}`} fill="white" />
          <circle cx={cx-fw/4} cy={cy-1.5} r={2} fill={pupilColor} />
        </>}
        {/* Eye R */}
        {eyeType === 0 && <>
          <ellipse cx={cx+fw/4} cy={cy-1} rx={4.5} ry={4} fill="white" />
          <circle cx={cx+fw/4} cy={cy-1} r={2.5} fill={pupilColor} />
          <circle cx={cx+fw/4+1} cy={cy-2} r={0.9} fill="white" opacity={0.7} />
        </>}
        {eyeType === 1 && <>
          <ellipse cx={cx+fw/4} cy={cy-1} rx={4.5} ry={3.5} fill="white" />
          <ellipse cx={cx+fw/4} cy={cy-0.5} rx={2.5} ry={2} fill={pupilColor} />
        </>}
        {eyeType === 2 && <>
          <path d={`M${cx+fw/4-4},${cy-1} Q${cx+fw/4},${cy-5} ${cx+fw/4+4},${cy-1}`} fill="white" />
          <circle cx={cx+fw/4} cy={cy-1.5} r={2} fill={pupilColor} />
        </>}
        {/* Nose */}
        <path d={`M${cx-2},${cy+4} Q${cx},${cy+8} ${cx+2},${cy+4}`} stroke={skin === "#FDDBB4" ? "#d4956a" : "#a06030"} strokeWidth={1.2} fill="none" strokeLinecap="round" />
        {/* Mouth */}
        {mouthType === 0 && <path d={`M${cx-7},${cy+12} Q${cx},${cy+18} ${cx+7},${cy+12}`} stroke="#b04040" strokeWidth={1.8} fill="none" strokeLinecap="round" />}
        {mouthType === 1 && <path d={`M${cx-6},${cy+13} L${cx+6},${cy+13}`} stroke="#b04040" strokeWidth={1.8} strokeLinecap="round" />}
        {mouthType === 2 && <>
          <path d={`M${cx-7},${cy+12} Q${cx},${cy+18} ${cx+7},${cy+12}`} stroke="#b04040" strokeWidth={1.8} fill="none" strokeLinecap="round" />
          <path d={`M${cx-5},${cy+12} Q${cx},${cy+16} ${cx+5},${cy+12}`} fill="#e87070" opacity={0.5} />
        </>}
        {mouthType === 3 && <path d={`M${cx-6},${cy+14} Q${cx},${cy+11} ${cx+6},${cy+14}`} stroke="#b04040" strokeWidth={1.8} fill="none" strokeLinecap="round" />}
        {/* Beard */}
        {hasBeard && <path d={`M${cx-fw/2+4},${cy+fh/4+2} Q${cx-fw/4},${cy+fh/2+10} ${cx},${cy+fh/2+12} Q${cx+fw/4},${cy+fh/2+10} ${cx+fw/2-4},${cy+fh/4+2} Q${cx+fw/4},${cy+fh/4+8} ${cx},${cy+fh/4+10} Q${cx-fw/4},${cy+fh/4+8} ${cx-fw/2+4},${cy+fh/4+2} Z`} fill={hair} opacity={0.75} />}
        {/* Mustache */}
        {hasMustache && <path d={`M${cx-8},${cy+9} Q${cx-4},${cy+12} ${cx},${cy+10} Q${cx+4},${cy+12} ${cx+8},${cy+9}`} fill={hair} opacity={0.8} />}
      </g>
    </svg>
  );
}

function Avatar({ name, size, ring, photoUrl }: { name: string; size: number; ring?: string; photoUrl?: string | null }) {
  return (
    <div
      className="rounded-full shrink-0 overflow-hidden"
      style={{
        width: size, height: size,
        boxShadow: ring ? `0 0 0 3px ${ring}, 0 4px 18px ${ring}55` : "0 2px 10px rgba(0,0,0,0.4)",
        flexShrink: 0,
      }}
    >
      {photoUrl ? (
        <CachedImg src={photoUrl.startsWith("/api/") || photoUrl.startsWith("http") ? photoUrl : `/api/storage${photoUrl}`} alt={name} width={size} height={size} style={{ width: size, height: size, objectFit: "cover", display: "block" }} />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.04) 100%)" }}
        >
          <User style={{ width: size * 0.55, height: size * 0.55, color: "rgba(255,255,255,0.35)" }} />
        </div>
      )}
    </div>
  );
}

/* ── Crown Badge ──────────────────────────────────────────────────────────── */

type Tab      = "weekly" | "monthly";

interface CrownDef {
  c1: string; c2: string; c3: string;
  glow: string; glowSize: number;
  gem1: string; gem2: string; gem3: string;
  outline: string;
  extraLines?: { x1:number;y1:number;x2:number;y2:number;color:string }[];
}

const CROWN_DEFS: Record<Tab, Record<1|2|3, CrownDef>> = {
  weekly: {
    1: {
      c1:"#FFF9C4", c2:"#FFD600", c3:"#E65100",
      glow:"#FFD700", glowSize: 10,
      gem1:"#FFFFFF", gem2:"#FFE082", gem3:"#FF8F00",
      outline:"#FF8F00",
    },
    2: {
      c1:"#F5F5F5", c2:"#BDBDBD", c3:"#616161",
      glow:"#C0C0C0", glowSize: 7,
      gem1:"#FFFFFF", gem2:"#E0E0E0", gem3:"#9E9E9E",
      outline:"#9E9E9E",
    },
    3: {
      c1:"#FFCC80", c2:"#FF8A65", c3:"#5D4037",
      glow:"#CD7F32", glowSize: 6,
      gem1:"#FFECB3", gem2:"#FFAB40", gem3:"#795548",
      outline:"#795548",
    },
  },
  monthly: {
    1: {
      c1:"#CE93D8", c2:"#6A1B9A", c3:"#0A0015",
      glow:"#AA00FF", glowSize: 14,
      gem1:"#EA80FC", gem2:"#4A148C", gem3:"#1A0040",
      outline:"#7B1FA2",
      extraLines: [
        { x1:30,y1:45,x2:50,y2:35,color:"#CC00FF" },
        { x1:70,y1:45,x2:50,y2:35,color:"#CC00FF" },
        { x1:50,y1:12,x2:50,y2:25,color:"#FF80FF" },
      ],
    },
    2: {
      c1:"#E1F5FE", c2:"#00BCD4", c3:"#006064",
      glow:"#00E5FF", glowSize: 12,
      gem1:"#FFFFFF", gem2:"#80DEEA", gem3:"#00ACC1",
      outline:"#00838F",
    },
    3: {
      c1:"#FF6D00", c2:"#BF360C", c3:"#0D0200",
      glow:"#FF3D00", glowSize: 11,
      gem1:"#FF8C42", gem2:"#FF3D00", gem3:"#3E0000",
      outline:"#BF360C",
      extraLines: [
        { x1:15,y1:60,x2:30,y2:48,color:"#FF6D00" },
        { x1:85,y1:60,x2:70,y2:48,color:"#FF6D00" },
        { x1:42,y1:58,x2:50,y2:42,color:"#FF8C42" },
        { x1:58,y1:58,x2:50,y2:42,color:"#FF8C42" },
      ],
    },
  },
};

function CrownBadge({ rank, tab, size = 32 }: { rank: 1|2|3; tab: Tab; size?: number }) {
  const id = `c-${tab}-${rank}`;
  const d  = CROWN_DEFS[tab][rank];

  return (
    <motion.div
      initial={{ scale: 0, rotate: -15 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 18, delay: rank === 1 ? 0.5 : rank === 2 ? 0.6 : 0.7 }}
      style={{ position: "relative" }}
    >
      <svg
        viewBox="0 0 100 80"
        width={size}
        height={size}
        style={{ filter: `drop-shadow(0 0 ${d.glowSize}px ${d.glow}cc) drop-shadow(0 2px 4px rgba(0,0,0,0.7))`, overflow: "visible" }}
      >
        <defs>
          <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={d.c1} />
            <stop offset="55%"  stopColor={d.c2} />
            <stop offset="100%" stopColor={d.c3} />
          </linearGradient>
          <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.45)" />
            <stop offset="60%"  stopColor="rgba(255,255,255,0.08)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <linearGradient id={`${id}-band`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={d.c2} />
            <stop offset="100%" stopColor={d.c3} />
          </linearGradient>
        </defs>

        {/* Crown body — 5-point crown */}
        <path
          d="M8,73 L8,52 L25,28 L38,48 L50,8 L62,48 L75,28 L92,52 L92,73 Z"
          fill={`url(#${id}-body)`}
          stroke={d.outline}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* Shine */}
        <path
          d="M8,73 L8,52 L25,28 L38,48 L50,8 L62,48 L75,28 L92,52 L92,73 Z"
          fill={`url(#${id}-shine)`}
        />
        {/* Base band */}
        <rect x="8" y="63" width="84" height="10" rx="3" fill={`url(#${id}-band)`} stroke={d.outline} strokeWidth="1.5" />

        {/* Extra crack/lava lines for special crowns */}
        {d.extraLines?.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color} strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
        ))}

        {/* Top center gem (large) */}
        <circle cx="50" cy="8" r="7" fill={d.gem1} stroke={d.outline} strokeWidth="1.5" />
        <circle cx="50" cy="8" r="3.5" fill="rgba(255,255,255,0.6)" />

        {/* Side gems */}
        <circle cx="25" cy="28" r="5" fill={d.gem2} stroke={d.outline} strokeWidth="1.5" />
        <circle cx="25" cy="28" r="2.5" fill="rgba(255,255,255,0.4)" />
        <circle cx="75" cy="28" r="5" fill={d.gem2} stroke={d.outline} strokeWidth="1.5" />
        <circle cx="75" cy="28" r="2.5" fill="rgba(255,255,255,0.4)" />

        {/* Band gems */}
        <circle cx="50" cy="68" r="4" fill={d.gem1} stroke={d.outline} strokeWidth="1" />
        <circle cx="50" cy="68" r="2" fill="rgba(255,255,255,0.55)" />
        <circle cx="30" cy="68" r="2.5" fill={d.gem3} stroke={d.outline} strokeWidth="1" />
        <circle cx="70" cy="68" r="2.5" fill={d.gem3} stroke={d.outline} strokeWidth="1" />
      </svg>

      {/* Pulse ring for rank 1 */}
      {rank === 1 && (
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          animate={{ opacity: [0.5, 0], scale: [1, 1.6] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", repeatDelay: 0.4 }}
          style={{ background: `radial-gradient(circle, ${d.glow}55 0%, transparent 70%)` }}
        />
      )}
    </motion.div>
  );
}

/* ── UID Badge ────────────────────────────────────────────────────────────── */

function UidBadge({ uid }: { uid: number }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(String(uid)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 mt-1.5 px-3 py-1.5 rounded-full active:scale-95 transition-transform"
      style={{ background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.25)" }}
    >
      <Star style={{ width: 10, height: 10, color: "#fb923c" }} fill="#fb923c" />
      <span className="text-[9px] font-extrabold text-orange-400/80 uppercase tracking-widest">Free Fire UID</span>
      <span className="text-[12px] font-black tabular-nums text-orange-200 tracking-wide">{uid}</span>
      <span style={{ color: copied ? "#34d399" : "rgba(251,146,60,0.45)" }}>
        {copied
          ? <Check style={{ width: 11, height: 11 }} />
          : <Copy style={{ width: 11, height: 11 }} />}
      </span>
    </button>
  );
}

/* ── Player profile sheet ─────────────────────────────────────────────────── */

function PlayerProfileSheet({
  entry,
  rank,
  onClose,
}: {
  entry: LeaderboardEntry;
  rank: number;
  onClose: () => void;
}) {
  const rankColor =
    rank === 1 ? "#FFD700" :
    rank === 2 ? "#C0C0C0" :
    rank === 3 ? "#CD7F32" :
    RANK_COLORS[rank] ?? "rgba(255,255,255,0.4)";

  return (
    <>
      <motion.div
        key="profile-overlay"
        className="fixed inset-0 z-[60]"
        style={{ background: "rgba(0,0,0,0.65)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        key="profile-sheet"
        className="fixed bottom-0 left-0 right-0 z-[70] rounded-t-3xl flex flex-col overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #1e1e32 0%, #12121f 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderBottom: "none",
          boxShadow: "0 -20px 60px rgba(0,0,0,0.85)",
          maxHeight: "82vh",
        }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        {/* Close button */}
        <div className="flex justify-end px-5 pt-1 pb-0 shrink-0">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <X style={{ width: 14, height: 14, color: "rgba(255,255,255,0.5)" }} />
          </button>
        </div>

        {/* Avatar + name centered */}
        <div className="flex flex-col items-center px-5 pt-3 pb-5 shrink-0">
          <div className="relative mb-3">
            {/* Glow ring */}
            <div className="absolute inset-0 rounded-full blur-xl opacity-60" style={{ background: rankColor, transform: "scale(1.3)" }} />
            <div className="relative rounded-full p-[3px]" style={{ background: `linear-gradient(135deg, ${rankColor}, ${rankColor}55)` }}>
              <Avatar name={entry.inGameName} size={80} ring={rankColor} photoUrl={entry.profilePicture} />
            </div>
            {/* Rank badge */}
            <div
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[11px] font-black border-2 whitespace-nowrap"
              style={{
                background: rank <= 3 ? rankColor : "rgba(30,30,50,0.95)",
                color: rank <= 3 ? "#000" : rankColor,
                borderColor: "#12121f",
                boxShadow: `0 2px 10px ${rankColor}55`,
              }}
            >
              #{rank}
            </div>
          </div>

          <p className="text-[22px] font-black text-white text-center leading-tight mt-2">{entry.inGameName}</p>
          <UidBadge uid={100000000 + entry.userId} />

          {/* Points pill */}
          <div
            className="flex items-center gap-1.5 mt-2 px-4 py-1.5 rounded-full"
            style={{ background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)" }}
          >
            <Zap style={{ width: 13, height: 13, color: "#a78bfa" }} fill="#a78bfa" />
            <span className="text-[15px] font-black text-violet-300 tabular-nums">{entry.points}</span>
            <span className="text-[11px] font-bold text-violet-400/60">pts</span>
          </div>
        </div>

        {/* Stats grid */}
        <div className="px-5 pb-6 shrink-0 space-y-2">
          {/* 4-col icon stats */}
          <div
            className="grid grid-cols-3 gap-2 rounded-2xl p-3"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            {([
              { label: "Matches",  value: entry.tournamentsPlayed, color: "#60a5fa", Icon: Gamepad2 },
              { label: "Wins",     value: entry.totalWins,         color: "#34d399", Icon: Trophy },
              {
                label: "Win Rate",
                value: entry.tournamentsPlayed > 0
                  ? `${Math.round((entry.totalWins / entry.tournamentsPlayed) * 100)}%`
                  : "0%",
                color: "#f97316",
                Icon: TrendingUp,
              },
            ] as { label: string; value: string | number; color: string; Icon: React.ElementType }[]).map(s => (
              <div key={s.label} className="flex flex-col items-center py-2">
                <s.Icon style={{ width: 16, height: 16, color: s.color }} className="mb-1" />
                <span className="text-[16px] font-black leading-tight tabular-nums" style={{ color: s.color }}>
                  {s.value}
                </span>
                <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider mt-0.5">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Bottom 2-col: Winnings + Points */}
          <div className="grid grid-cols-2 gap-2">
            <div
              className="flex flex-col items-center py-3 rounded-2xl"
              style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.12) 0%, rgba(251,191,36,0.04) 100%)", border: "1px solid rgba(251,191,36,0.22)" }}
            >
              <Gem style={{ width: 20, height: 20, color: "#facc15" }} className="mb-0.5" />
              <span className="text-[18px] font-black tabular-nums text-yellow-400 leading-tight">
                {entry.diamondsEarned.toLocaleString()}
              </span>
              <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider mt-0.5">Total Winnings</span>
            </div>
            <div
              className="flex flex-col items-center py-3 rounded-2xl"
              style={{ background: "linear-gradient(135deg, rgba(167,139,250,0.12) 0%, rgba(167,139,250,0.04) 100%)", border: "1px solid rgba(167,139,250,0.22)" }}
            >
              <Zap style={{ width: 20, height: 20, color: "#a78bfa" }} fill="#a78bfa" className="mb-0.5" />
              <span className="text-[18px] font-black tabular-nums text-violet-400 leading-tight">
                {entry.points}
              </span>
              <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider mt-0.5">Total Points</span>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

/* ── Podium ───────────────────────────────────────────────────────────────── */

const PODIUM = {
  1: { color: "#FFD700", blockColor: "#b8870022", blockBorder: "#FFD70055", height: 130, avatarSize: 76, offset: 0 },
  2: { color: "#C0C0C0", blockColor: "#9ca3af18", blockBorder: "#C0C0C055", height: 96,  avatarSize: 62, offset: 20 },
  3: { color: "#CD7F32", blockColor: "#92400e18", blockBorder: "#CD7F3255", height: 96,  avatarSize: 56, offset: 32 },
} as const;

const PODIUM_DELAY: Record<1|2|3, number> = { 1: 0.1, 2: 0.25, 3: 0.4 };

function truncName(name: string, max = 9) {
  return name.length > max ? name.slice(0, max - 1) + "…" : name;
}

function PodiumSlot({
  entry,
  rank,
  tab,
  onSelect,
}: {
  entry: { inGameName: string; points: number; profilePicture?: string | null } | undefined;
  rank: 1 | 2 | 3;
  tab: Tab;
  onSelect?: () => void;
}) {
  const m = PODIUM[rank];

  if (!entry) {
    return (
      <div className="flex flex-col items-center" style={{ flex: 1, marginTop: m.offset }}>
        <Skeleton className="rounded-full bg-white/8" style={{ width: m.avatarSize, height: m.avatarSize }} />
        <Skeleton className="h-3 w-14 mt-2 mb-1 bg-white/8 rounded" />
        <div className="w-full rounded-t-2xl bg-white/5" style={{ height: m.height }} />
      </div>
    );
  }

  return (
    <motion.div
      className="flex flex-col items-center cursor-pointer"
      style={{ flex: 1, marginTop: m.offset }}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 22, delay: PODIUM_DELAY[rank] }}
      onClick={onSelect}
      whileTap={{ scale: 0.97 }}
    >
      {/* Crown for every rank */}
      <div className="mb-1">
        <CrownBadge rank={rank} tab={tab} size={rank === 1 ? 36 : 28} />
      </div>

      {/* Avatar */}
      <motion.div
        style={{ borderRadius: "50%", position: "relative" }}
        whileTap={{ scale: 0.9 }}
        animate={rank === 1 ? { boxShadow: ["0 0 0 0px #FFD70066", "0 0 0 10px #FFD70000"] } : {}}
        transition={rank === 1 ? { duration: 2, repeat: Infinity, ease: "easeOut", repeatDelay: 0.3 } : {}}
      >
        <Avatar name={entry.inGameName} size={m.avatarSize} ring={m.color} photoUrl={entry.profilePicture} />
      </motion.div>

      {/* Name */}
      <p
        className="mt-2 font-extrabold text-white text-center leading-tight"
        style={{ fontSize: rank === 1 ? 12 : 11, textShadow: "0 1px 8px rgba(0,0,0,0.8)", maxWidth: "100%", padding: "0 4px" }}
      >
        {truncName(entry.inGameName, rank === 1 ? 10 : 8)}
      </p>

      {/* Podium block */}
      <motion.div
        className="w-full rounded-t-2xl flex flex-col items-center justify-center gap-1 mt-2"
        style={{
          height: m.height,
          background: `linear-gradient(180deg, ${m.blockColor} 0%, rgba(255,255,255,0.02) 100%)`,
          borderTop: `1.5px solid ${m.blockBorder}`,
          borderLeft: `1.5px solid ${m.blockBorder}`,
          borderRight: `1.5px solid ${m.blockBorder}`,
          borderBottom: "none",
          boxShadow: `inset 0 1px 0 ${m.color}30`,
          transformOrigin: "bottom",
        }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 22, delay: PODIUM_DELAY[rank] + 0.05 }}
      >
        {/* Big rank number */}
        <span
          className="font-extrabold leading-none select-none"
          style={{ fontSize: rank === 1 ? 44 : rank === 2 ? 34 : 26, color: m.color, opacity: 0.3, fontFamily: "system-ui", letterSpacing: "-2px" }}
        >
          {rank}
        </span>

        {/* Points */}
        <div className="flex items-center gap-0.5 mt-0.5" style={{ color: m.color }}>
          <Zap style={{ width: 8, height: 8 }} fill="currentColor" />
          <span className="text-[10px] font-black tabular-nums">{entry.points}pts</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── List row ─────────────────────────────────────────────────────────────── */

const RANK_COLORS: Record<number, string> = {
  4:  "#6366f1", // indigo
  5:  "#14b8a6", // teal
  6:  "#f97316", // orange
  7:  "#a855f7", // purple
  8:  "#ec4899", // pink
  9:  "#06b6d4", // cyan
  10: "#c44b37", // brick
};

function ListRow({
  entry,
  rank,
  index,
  isMe,
  onSelect,
}: {
  entry: { userId: number; inGameName: string; points: number; profilePicture?: string | null };
  rank: number;
  index: number;
  isMe?: boolean;
  onSelect?: () => void;
}) {
  const rankColor = RANK_COLORS[rank];
  const accentColor = isMe ? "hsl(var(--primary))" : rankColor;

  return (
    <div
      onClick={onSelect}
      className="flex items-center gap-2.5 px-3 py-2.5 border-b last:border-0 relative cursor-pointer active:opacity-70 transition-opacity"
      style={{
        borderColor: isMe
          ? "hsl(var(--primary) / 0.25)"
          : rankColor
          ? `${rankColor}38`
          : "rgba(255,255,255,0.05)",
        background: isMe
          ? "linear-gradient(90deg, hsl(var(--primary) / 0.12) 0%, hsl(var(--primary) / 0.04) 100%)"
          : rankColor
          ? `linear-gradient(90deg, ${rankColor}20 0%, ${rankColor}06 100%)`
          : "transparent",
        animation: `lb-row-in 0.25s ease-out both`,
        animationDelay: `${Math.min(index, 12) * 18}ms`,
      }}
    >
      {(isMe || rankColor) && (
        <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full" style={{ background: accentColor }} />
      )}

      {/* Rank */}
      <div
        className="w-6 text-center text-[12px] font-extrabold shrink-0"
        style={{ color: accentColor ?? "rgba(255,255,255,0.35)" }}
      >
        {rank}
      </div>

      <Avatar name={entry.inGameName} size={36} photoUrl={entry.profilePicture} />

      {/* Name */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-bold text-[12px] text-white truncate leading-tight">{entry.inGameName}</p>
          {isMe && (
            <span
              className="text-[8px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 uppercase"
              style={{ background: "hsl(var(--primary) / 0.2)", color: "hsl(var(--primary))", border: "1px solid hsl(var(--primary) / 0.4)" }}
            >
              YOU
            </span>
          )}
        </div>
      </div>

      {/* Points */}
      <div className="flex flex-col items-center ml-auto shrink-0 w-12">
        <span className="text-[13px] font-black tabular-nums" style={{ color: isMe ? "hsl(var(--primary))" : "#fbbf24" }}>
          {entry.points}
        </span>
        <span className="text-[8px] text-white/25 font-bold">Points</span>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

type GameMode = "clash_squad" | "battle_royal" | "knockout";

const TAB_META: { id: Tab; label: string; Icon: React.ElementType; color: string }[] = [
  { id: "weekly",  label: "Weekly",  Icon: Zap,    color: "#facc15" },
  { id: "monthly", label: "Monthly", Icon: Trophy, color: "#a855f7" },
];

const MODE_META: Record<GameMode, { label: string; color: string }> = {
  clash_squad:  { label: "Clash Squad",   color: "#a855f7" },
  battle_royal: { label: "Battle Royal",  color: "#ef4444" },
  knockout:     { label: "Knockout",      color: "#f97316" },
};

type InfoStat = "pts";

const STAT_INFO: Record<InfoStat, { label: string; icon: React.ReactNode; color: string; rule: string; detail: string }> = {
  pts: {
    label: "Points",
    icon: <Zap style={{ width: 20, height: 20 }} fill="currentColor" />,
    color: "#a78bfa",
    rule: "Wins + Kills + Diamonds + Logins",
    detail: "Points = (1st→50, 2nd→30, 3rd→15, 4th-10th→5) + kills×2 + diamonds÷10 + login days×3. The more active you are, the higher your score.",
  },
};

export default function Leaderboard() {
  const [tab,      setTab]      = useState<Tab>("weekly");
  const [gameMode, setGameMode] = useState<GameMode>("clash_squad");
  const [infoStat, setInfoStat] = useState<InfoStat | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<{ entry: LeaderboardEntry; rank: number } | null>(null);

  const { data: rawLeaderboard, isLoading } = useGetLeaderboard({
    limit: 100,
    period: tab,
    mode: gameMode,
  });
  const { data: me }      = useGetMe();
  const { data: myStats } = useGetMyStats();

  const leaderboard: LeaderboardEntry[] = rawLeaderboard ?? [];
  const top3 = leaderboard.slice(0, 3);
  const rest  = leaderboard.slice(3);

  const myName  = me?.inGameName ?? "";
  const myLeaderboardIdx = myName ? leaderboard.findIndex(e => e.inGameName === myName) : -1;
  const myRank  = myStats?.rank ?? (myLeaderboardIdx >= 0 ? myLeaderboardIdx + 1 : null);

  const currentModeMeta = MODE_META[gameMode];

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden relative"
      style={{ background: "hsl(var(--background))" }}
    >
      {/* ── Top bar ── */}
      <motion.div
        className="relative px-4 pt-12 pb-3 shrink-0"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <span className="text-[11px] font-bold uppercase tracking-widest text-white/30 leading-none">Leaderboard</span>
        <motion.h1
          key={gameMode}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25 }}
          className="text-[24px] font-black tracking-tight leading-none mt-0.5 mb-3"
          style={{ color: currentModeMeta.color, textShadow: `0 0 24px ${currentModeMeta.color}55` }}
        >
          {currentModeMeta.label}
        </motion.h1>

        {/* ── 3-mode pill selector ── */}
        <div className="flex gap-2">
          {(Object.entries(MODE_META) as [GameMode, { label: string; color: string }][]).map(([id, meta]) => {
            const active = gameMode === id;
            return (
              <button
                key={id}
                onClick={() => setGameMode(id)}
                className="flex-1 py-2 rounded-2xl text-[11px] font-extrabold tracking-wide transition-all duration-200 select-none active:scale-95"
                style={{
                  background: active ? `${meta.color}22` : "rgba(255,255,255,0.04)",
                  border: active ? `1.5px solid ${meta.color}66` : "1.5px solid rgba(255,255,255,0.08)",
                  color: active ? meta.color : "rgba(255,255,255,0.3)",
                  boxShadow: active ? `0 2px 12px ${meta.color}30` : "none",
                }}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      </motion.div>
      {/* ── Tab toggle ── */}
      <motion.div
        className="mx-4 mb-4 shrink-0"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut", delay: 0.08 }}
      >
        <div
          className="flex p-1 rounded-2xl gap-1"
          style={{ background: "rgba(0,0,0,0.45)", border: "1.5px solid rgba(255,255,255,0.08)" }}
        >
          {TAB_META.map(m => {
            const active = tab === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setTab(m.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all duration-200 select-none"
                style={{
                  background: active ? `linear-gradient(135deg, ${m.color}33, ${m.color}18)` : "transparent",
                  border: active ? `1.5px solid ${m.color}55` : "1.5px solid transparent",
                  boxShadow: active ? `0 2px 12px ${m.color}30` : "none",
                }}
              >
                <m.Icon className="w-3.5 h-3.5 shrink-0" style={{ color: active ? m.color : "rgba(255,255,255,0.3)" }} strokeWidth={active ? 2.5 : 2} />
                <span className="text-[12px] font-extrabold tracking-wide" style={{ color: active ? m.color : "rgba(255,255,255,0.3)" }}>
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>
      <div className="flex-1 overflow-y-auto pb-24">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${gameMode}-${tab}`}
            initial={{ opacity: 0, x: tab === "weekly" ? -24 : 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: tab === "weekly" ? 24 : -24 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
          >
            {/* ── Podium ── */}
            <motion.div
              className="mx-4 mb-4 rounded-3xl pt-5 px-3 pb-0 overflow-visible"
              style={{
                background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
                border: "1.5px solid rgba(255,255,255,0.1)",
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
            >
              {isLoading ? (
                <div className="flex items-end gap-2 px-2">
                  {[88, 120, 68].map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2">
                      <Skeleton className="rounded-full bg-white/8" style={{ width: i === 1 ? 74 : 62, height: i === 1 ? 74 : 62 }} />
                      <Skeleton className="h-3 w-14 bg-white/8 rounded" />
                      <div className="w-full rounded-t-3xl bg-white/8" style={{ height: h }} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-end gap-2 px-1">
                  <PodiumSlot entry={top3[1]} rank={2} tab={tab} onSelect={() => top3[1] && setSelectedPlayer({ entry: top3[1] as LeaderboardEntry, rank: 2 })} />
                  <PodiumSlot entry={top3[0]} rank={1} tab={tab} onSelect={() => top3[0] && setSelectedPlayer({ entry: top3[0] as LeaderboardEntry, rank: 1 })} />
                  <PodiumSlot entry={top3[2]} rank={3} tab={tab} onSelect={() => top3[2] && setSelectedPlayer({ entry: top3[2] as LeaderboardEntry, rank: 3 })} />
                </div>
              )}
            </motion.div>

            {/* ── Ranked list ── */}
            <motion.div
              className="mx-4 rounded-3xl overflow-hidden"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1.5px solid rgba(255,255,255,0.09)",
              }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut", delay: 0.2 }}
            >
              {/* Column headers */}
              <div className="flex items-center px-3 pt-3 pb-2 border-b border-white/5">
                <span className="w-6 text-[9px] font-bold text-white/25 text-center shrink-0">#</span>
                <span className="w-9 shrink-0" />
                <span className="flex-1 text-[9px] font-bold text-white/25 ml-2">Player</span>
                <div className="flex items-center ml-auto shrink-0">
                  <button
                    onClick={() => setInfoStat("pts")}
                    className="w-12 text-center text-[9px] font-extrabold flex items-center justify-center gap-0.5 active:opacity-60 transition-opacity"
                    style={{ color: "#a78bfa" }}
                  >
                    <Zap style={{ width: 8, height: 8 }} /> Points <Info style={{ width: 7, height: 7, opacity: 0.7 }} />
                  </button>
                </div>
              </div>

              {isLoading ? (
                [1,2,3,4,5].map(i => (
                  <div key={i} className="flex items-center gap-3 px-3 py-3 border-b border-white/5 last:border-0">
                    <Skeleton className="w-7 h-7 rounded-full bg-white/8 shrink-0" />
                    <Skeleton className="w-9 h-9 rounded-full bg-white/8 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-24 bg-white/8 rounded" />
                    </div>
                    <Skeleton className="w-10 h-4 bg-white/8 rounded" />
                  </div>
                ))
              ) : rest.length > 0 ? (
                rest.map((entry, i) => (
                  <ListRow key={entry.userId} entry={entry} rank={i + 4} index={i} isMe={!!myName && entry.inGameName === myName} onSelect={() => setSelectedPlayer({ entry, rank: i + 4 })} />
                ))
              ) : (
                <motion.div className="py-10 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                  <Trophy className="w-8 h-8 text-white/15 mx-auto mb-3" />
                  <p className="text-sm text-white/30">Only the top 3 have claimed spots</p>
                  <p className="text-xs text-white/20 mt-1">Play tournaments to break into the rankings</p>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
      {/* ── Stat info bottom sheet ── */}
      <AnimatePresence>
        {infoStat && (() => {
          const info = STAT_INFO[infoStat];
          return (
            <>
              <motion.div
                key="overlay"
                className="absolute inset-0 z-30"
                style={{ background: "rgba(0,0,0,0.55)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setInfoStat(null)}
              />
              <motion.div
                key="sheet"
                className="absolute bottom-0 left-0 right-0 z-40 rounded-t-3xl overflow-hidden"
                style={{
                  background: "linear-gradient(160deg, #1a1a2e 0%, #0f0f1a 100%)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderBottom: "none",
                  boxShadow: "0 -12px 48px rgba(0,0,0,0.7)",
                }}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 320, damping: 30 }}
              >
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full bg-white/15" />
                </div>

                <div className="px-6 pb-8 pt-2">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${info.color}22`, color: info.color, border: `1px solid ${info.color}44` }}>
                        {info.icon}
                      </div>
                      <div>
                        <p className="text-[15px] font-black text-white leading-tight">{info.label}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: info.color }}>{info.rule}</p>
                      </div>
                    </div>
                    <button onClick={() => setInfoStat(null)} className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-white/40 active:bg-white/15 transition-colors">
                      <X style={{ width: 14, height: 14 }} />
                    </button>
                  </div>

                  {/* Rule card */}
                  <div className="rounded-2xl p-4 mb-4" style={{ background: `${info.color}12`, border: `1px solid ${info.color}2a` }}>
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${info.color}25`, color: info.color }}>
                        <Trophy style={{ width: 13, height: 13 }} />
                      </div>
                      <p className="text-[13px] text-white/70 leading-relaxed">{info.detail}</p>
                    </div>
                  </div>

                  {/* Placement chips */}
                  <p className="text-[10px] font-bold text-white/25 uppercase tracking-wider mb-2.5">Qualifying placements</p>
                  <div className="flex gap-2">
                    {["1st Place", "2nd Place", "3rd Place"].map((place, i) => (
                      <div key={place} className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <span className="text-[18px]">{["🥇","🥈","🥉"][i]}</span>
                        <span className="text-[10px] font-bold text-white/50">{place}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>

      {/* ── Floating "Your Position" card ── */}
      <AnimatePresence>
        {myName && myStats && (
          <motion.div
            className="fixed bottom-28 left-4 right-4 z-40"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
          >
            <div
              className="rounded-2xl backdrop-blur-xl overflow-hidden"
              style={{
                background: "linear-gradient(120deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.72) 100%)",
                border: "1px solid hsl(var(--primary) / 0.35)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
            >
              <div className="h-[2px] w-full" style={{ background: "linear-gradient(90deg, transparent, hsl(var(--primary) / 0.8), transparent)" }} />
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Avatar + rank badge */}
                <div className="relative shrink-0">
                  <div className="absolute inset-0 rounded-full blur-md opacity-50" style={{ background: "hsl(var(--primary))", transform: "scale(1.2)" }} />
                  <div className="relative rounded-full p-[2px]" style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.3))" }}>
                    <Avatar name={myName} size={44} photoUrl={me?.profilePicture} />
                  </div>
                  {/* Rank badge overlaid at bottom of avatar */}
                  <div
                    className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full text-[9px] font-black tabular-nums leading-none whitespace-nowrap"
                    style={{
                      background: myRank ? "hsl(var(--primary))" : "rgba(255,255,255,0.15)",
                      color: myRank ? "#fff" : "rgba(255,255,255,0.4)",
                      border: "1.5px solid rgba(0,0,0,0.6)",
                      boxShadow: myRank ? "0 2px 8px hsl(var(--primary) / 0.5)" : "none",
                    }}
                  >
                    {myRank ? `#${myRank}` : "—"}
                  </div>
                </div>

                {/* Name + stats */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[13px] font-extrabold text-white truncate leading-none">{myName}</p>
                    <span className="text-[8px] font-black tracking-wider px-1.5 py-0.5 rounded-full shrink-0 uppercase" style={{ background: "hsl(var(--primary) / 0.2)", color: "hsl(var(--primary))", border: "1px solid hsl(var(--primary) / 0.4)" }}>YOU</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-[11px] text-white/40"><Zap style={{ width: 10, height: 10, color: "#a78bfa" }} fill="currentColor" />{myStats?.totalWins ?? 0} wins · {myStats?.totalKills ?? 0} kills</span>
                  </div>
                </div>

                <div className="w-px h-9 shrink-0" style={{ background: "rgba(255,255,255,0.07)" }} />

                {/* Rank number on right */}
                <div className="flex flex-col items-center justify-center shrink-0 min-w-[52px]">
                  {myRank ? (
                    <>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-white/30 leading-none mb-0.5">Rank</span>
                      <span className="text-[26px] font-black leading-none tabular-nums" style={{ color: "hsl(var(--primary))", textShadow: "0 0 20px hsl(var(--primary) / 0.6)" }}>#{myRank}</span>
                    </>
                  ) : (
                    <div className="px-3 py-1.5 rounded-xl text-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <span className="text-[10px] font-extrabold text-white/25 uppercase tracking-wider leading-none">Unranked</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Player profile sheet ── */}
      <AnimatePresence>
        {selectedPlayer && (
          <PlayerProfileSheet
            entry={selectedPlayer.entry}
            rank={selectedPlayer.rank}
            onClose={() => setSelectedPlayer(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
