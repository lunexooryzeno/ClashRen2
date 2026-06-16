import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, Check, Search, Shuffle, Monitor,
  Zap, Flame, Sparkles, Layers, Music, Crown, Droplets, LayoutGrid, Star,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { apiPost } from "@/lib/api";
import {
  THEME_CATALOG, CATEGORY_META, ALL_CATEGORY_KEYS,
  type CategoryFilter, type ThemeEntry,
} from "@/lib/themes";

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  all:           LayoutGrid,
  esports:       Zap,
  aggressive:    Flame,
  atmospheric:   Sparkles,
  clean:         Layers,
  culture:       Music,
  classic:       Crown,
  glassmorphism: Droplets,
};

export default function ProfileThemePage() {
  const { theme, setTheme } = useTheme();
  const [search, setSearch]     = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  const filtered = useMemo(() => {
    let list = THEME_CATALOG;
    if (category !== "all") list = list.filter(t => t.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) || t.tagline.toLowerCase().includes(q)
      );
    }
    return list;
  }, [category, search]);

  const activeEntry = THEME_CATALOG.find(t => t.id === theme) ?? THEME_CATALOG[0];

  function applyTheme(t: ThemeEntry) {
    setTheme(t.id);
    apiPost("/users/theme", { theme: t.id }).catch(() => {});
  }

  function randomize() {
    const pool = THEME_CATALOG.filter(t => !t.isSystem);
    const pick  = pool[Math.floor(Math.random() * pool.length)];
    applyTheme(pick);
  }

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "hsl(var(--background))" }}>

      {/* ── HEADER ── */}
      <div className="px-4 pt-6 pb-3 shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/profile">
            <button
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors active:opacity-70"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <ArrowLeft className="w-4 h-4 text-foreground" />
            </button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-heading text-xl font-bold text-foreground tracking-tight leading-tight">App Theme</h1>
            <p className="text-[11px] text-muted-foreground">Choose your loadout · {THEME_CATALOG.length} skins</p>
          </div>
          <button
            onClick={randomize}
            className="h-8 px-3 rounded-xl flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider transition-all active:scale-95"
            style={{
              background: "hsl(var(--primary)/0.12)",
              border: "1px solid hsl(var(--primary)/0.25)",
              color: "hsl(var(--primary))",
            }}
          >
            <Shuffle className="w-3 h-3" />
            Random
          </button>
        </div>

        {/* Active theme banner */}
        <div
          className="rounded-2xl p-3 flex items-center gap-3 mb-3"
          style={{ background: "hsl(var(--primary)/0.07)", border: "1px solid hsl(var(--primary)/0.18)" }}
        >
          {activeEntry.isSystem
            ? <MiniSystemSwatch size="lg" />
            : <MiniColorSwatch bg={activeEntry.bg} accent={activeEntry.accent} accent2={activeEntry.accent2} size="lg" />
          }
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Active Skin</p>
            <p className="text-sm font-bold text-foreground leading-tight truncate">{activeEntry.name}</p>
            <p className="text-[10px] text-muted-foreground leading-tight truncate mt-0.5">{activeEntry.tagline}</p>
          </div>
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "hsl(var(--primary))" }}
          >
            <Check className="w-3.5 h-3.5" style={{ color: "hsl(var(--primary-foreground))" }} strokeWidth={3} />
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-2.5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search themes…"
            className="w-full h-9 pl-9 pr-4 rounded-xl text-sm text-foreground placeholder:text-muted-foreground outline-none"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
        </div>

        {/* Category filter pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
          {ALL_CATEGORY_KEYS.map(key => {
            const isAll  = key === "all";
            const meta   = isAll ? null : CATEGORY_META[key as keyof typeof CATEGORY_META];
            const active = category === key;
            const Icon   = CATEGORY_ICONS[key] ?? LayoutGrid;
            return (
              <button
                key={key}
                onClick={() => setCategory(key)}
                className="h-7 px-3 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0 transition-all active:scale-95 flex items-center gap-1.5"
                style={{
                  background: active ? "hsl(var(--primary))" : "rgba(255,255,255,0.05)",
                  border:     active ? "1px solid transparent" : "1px solid rgba(255,255,255,0.08)",
                  color:      active ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                }}
              >
                <Icon className="w-3 h-3 shrink-0" />
                {isAll ? "All" : meta!.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── GRID ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-12">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
            <Search className="w-8 h-8 text-muted-foreground opacity-40" />
            <p className="text-sm font-bold text-foreground">No themes found</p>
            <p className="text-xs text-muted-foreground">Try a different search or category</p>
          </div>
        ) : (
          <>
            <p className="text-[10px] text-muted-foreground mb-2">{filtered.length} skin{filtered.length !== 1 ? "s" : ""}</p>
            <div className="grid grid-cols-2 gap-2.5">
              {filtered.map(t => (
                <ThemeCard
                  key={t.id}
                  theme={t}
                  isActive={theme === t.id}
                  onSelect={() => applyTheme(t)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── THEME CARD ──────────────────────────────────────────────────── */
function ThemeCard({
  theme: t,
  isActive,
  onSelect,
}: { theme: ThemeEntry; isActive: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative rounded-2xl text-left transition-all active:scale-[0.97] overflow-hidden border flex flex-col",
        isActive ? "ring-2" : ""
      )}
      style={{
        background:  isActive ? "hsl(var(--primary)/0.08)" : "hsl(var(--card))",
        borderColor: isActive ? "hsl(var(--primary)/0.55)" : "hsl(var(--border))",
        ["--tw-ring-color" as string]: "hsl(var(--primary)/0.3)",
      }}
    >
      {/* Swatch */}
      {t.isSystem
        ? <SwatchSystem />
        : <SwatchColor bg={t.bg} accent={t.accent} accent2={t.accent2} />
      }

      {/* Active check */}
      {isActive && (
        <div
          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center z-10 shadow-lg"
          style={{ background: "hsl(var(--primary))" }}
        >
          <Check className="w-3 h-3" style={{ color: "hsl(var(--primary-foreground))" }} strokeWidth={3} />
        </div>
      )}

      {/* Popular badge */}
      {t.popular && !isActive && (
        <div
          className="absolute top-2 left-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full z-10"
          style={{ background: "rgba(250,173,20,0.18)", border: "1px solid rgba(250,173,20,0.35)" }}
        >
          <Star className="w-2 h-2" style={{ color: "#faad14", fill: "#faad14" }} />
          <span className="text-[8px] font-bold" style={{ color: "#faad14" }}>Popular</span>
        </div>
      )}

      {/* Info */}
      <div className="px-2.5 pt-2 pb-2.5 flex-1">
        <p className="text-[11px] font-bold text-foreground leading-tight line-clamp-1 mb-0.5">{t.name}</p>
        <p className="text-[9px] leading-snug line-clamp-2" style={{ color: "hsl(var(--muted-foreground))" }}>
          {t.tagline}
        </p>
      </div>
    </button>
  );
}

/* ── SWATCHES ────────────────────────────────────────────────────── */
function SwatchColor({ bg, accent, accent2 }: { bg: string; accent: string; accent2: string }) {
  return (
    <div className="w-full h-16 relative overflow-hidden shrink-0" style={{ background: bg }}>
      <div className="absolute inset-0" style={{ background: `linear-gradient(135deg,${accent}28 0%,transparent 55%)` }} />
      <div className="absolute bottom-2 left-2.5 flex gap-1.5 items-center">
        <div className="w-5 h-5 rounded-md shadow-lg" style={{ background: accent }} />
        <div className="w-4 h-4 rounded-md shadow-lg opacity-65" style={{ background: accent2 }} />
      </div>
      <div className="absolute bottom-2 right-2.5 w-8 h-1.5 rounded-full opacity-45" style={{ background: accent }} />
      <div className="absolute top-2 right-2.5 opacity-18 flex flex-col gap-0.5">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex gap-0.5">
            {[0, 1, 2].map(j => (
              <div key={j} className="w-0.5 h-0.5 rounded-full" style={{ background: accent }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SwatchSystem() {
  return (
    <div className="w-full h-16 overflow-hidden relative flex shrink-0">
      <div className="flex-1 bg-[#f8f8fa] flex items-end pb-2 pl-2.5">
        <div className="w-5 h-5 rounded-md bg-[#1f1f2e]" />
      </div>
      <div className="flex-1 bg-[#0e0e12] flex items-end pb-2 pl-1.5">
        <div className="w-5 h-5 rounded-md bg-[#a0a0b8]" />
      </div>
      <div className="absolute inset-y-0 left-1/2 -translate-x-px w-px bg-white/20 pointer-events-none" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-6 h-6 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <Monitor className="w-3.5 h-3.5 text-white/70" />
        </div>
      </div>
    </div>
  );
}

function MiniColorSwatch({
  bg, accent, accent2,
}: { bg: string; accent: string; accent2: string; size: "lg" }) {
  return (
    <div className="w-10 h-10 rounded-xl shrink-0 relative overflow-hidden" style={{ background: bg }}>
      <div className="absolute bottom-1 left-1 w-3 h-3 rounded-sm" style={{ background: accent }} />
      <div className="absolute bottom-1 right-1 w-3 h-3 rounded-sm opacity-55" style={{ background: accent2 }} />
    </div>
  );
}

function MiniSystemSwatch({ size: _ }: { size: "lg" }) {
  return (
    <div className="w-10 h-10 rounded-xl overflow-hidden flex shrink-0">
      <div className="flex-1 bg-[#f8f8fa]" />
      <div className="flex-1 bg-[#0e0e12]" />
    </div>
  );
}
