import { useState, useMemo } from "react";
import { Link } from "wouter";
import { ArrowLeft, Check, Monitor, Lock, Shuffle, Search, X } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { apiPost } from "@/lib/api";
import { ALL_THEMES, THEME_CATEGORIES, type ThemeCategory, type ThemeDefinition } from "@/lib/themes";

export default function ProfileThemePage() {
  const { theme, setTheme } = useTheme();
  const [activeCategory, setActiveCategory] = useState<ThemeCategory>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = ALL_THEMES;
    if (activeCategory !== "all") list = list.filter(t => t.category === activeCategory);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q) || t.tagline.toLowerCase().includes(q));
    }
    return list;
  }, [activeCategory, search]);

  const activeTheme = ALL_THEMES.find(t => t.id === theme) ?? ALL_THEMES[0];

  function apply(t: ThemeDefinition) {
    if (t.premium) return;
    setTheme(t.id);
    apiPost("/users/theme", { theme: t.id }).catch(() => {});
  }

  function randomize() {
    const free = ALL_THEMES.filter(t => !t.premium && t.id !== theme);
    if (!free.length) return;
    const pick = free[Math.floor(Math.random() * free.length)];
    apply(pick);
  }

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "hsl(var(--background))" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-3 shrink-0">
        <Link href="/profile">
          <button className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
        </Link>
        <div className="flex-1">
          <h1 className="font-heading text-lg font-bold text-foreground tracking-tight">Choose Your Vibe</h1>
          <p className="text-xs text-muted-foreground">{ALL_THEMES.filter(t => !t.premium).length} free · {ALL_THEMES.filter(t => t.premium).length} premium · {ALL_THEMES.length} total</p>
        </div>
        <button
          onClick={randomize}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-primary border border-primary/30 bg-primary/8 active:bg-primary/15 transition-colors"
        >
          <Shuffle className="w-3.5 h-3.5" />
          Random
        </button>
      </div>

      {/* Active theme banner */}
      <div className="mx-4 mb-3 px-4 py-3 rounded-2xl flex items-center gap-3 shrink-0"
        style={{ background: "hsl(var(--primary)/0.08)", border: "1px solid hsl(var(--primary)/0.2)" }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "hsl(var(--primary)/0.15)", border: "1px solid hsl(var(--primary)/0.3)" }}>
          <Check className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Equipped</p>
          <p className="text-sm font-bold text-foreground leading-tight truncate">{activeTheme.name}</p>
        </div>
        <p className="ml-auto text-[10px] text-muted-foreground italic truncate max-w-[120px] text-right">{activeTheme.tagline.split(".")[0]}</p>
      </div>

      {/* Search */}
      <div className="px-4 mb-3 shrink-0">
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-card">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search themes..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-muted-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      <div className="shrink-0 overflow-x-auto px-4 mb-4 scrollbar-none">
        <div className="flex gap-2 w-max">
          {THEME_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all",
                activeCategory === cat.id
                  ? "text-primary-foreground"
                  : "text-muted-foreground border border-border bg-card hover:text-foreground"
              )}
              style={activeCategory === cat.id ? { background: "hsl(var(--primary))" } : undefined}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Theme grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-10">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-2xl mb-2">🎮</p>
            <p className="text-sm font-bold text-foreground">No themes found</p>
            <p className="text-xs text-muted-foreground mt-1">Try a different search or category</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((t) => {
              const isActive = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => apply(t)}
                  disabled={t.premium}
                  className={cn(
                    "relative rounded-2xl p-3.5 text-left transition-all overflow-hidden border",
                    t.premium
                      ? "opacity-70 cursor-not-allowed border-border"
                      : isActive
                        ? "border-primary/60 ring-2 ring-primary/30 active:scale-[0.97]"
                        : "border-border hover:border-primary/30 active:scale-[0.97]"
                  )}
                  style={{ background: isActive ? "hsl(var(--primary) / 0.06)" : "hsl(var(--card))" }}
                >
                  {/* Premium badge */}
                  {t.premium && (
                    <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                      style={{ background: "hsl(43 90% 50%)", color: "#000" }}>
                      <Lock className="w-2.5 h-2.5" />
                      PRO
                    </div>
                  )}

                  {/* Active checkmark */}
                  {isActive && !t.premium && (
                    <div className="absolute top-2.5 right-2.5 z-10 w-5 h-5 rounded-full flex items-center justify-center shadow-lg"
                      style={{ background: "hsl(var(--primary))" }}>
                      <Check className="w-3 h-3" style={{ color: "hsl(var(--primary-foreground))" }} strokeWidth={3} />
                    </div>
                  )}

                  {/* Swatch */}
                  {t.isSystem ? (
                    <SystemSwatch />
                  ) : (
                    <ColorSwatch bg={t.bg} primary={t.primary} secondary={t.secondary} accent={t.accent} />
                  )}

                  <p className="text-sm font-bold text-foreground mt-2.5 leading-tight pr-6 truncate">{t.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight line-clamp-2">{t.tagline}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ColorSwatch({ bg, primary, secondary, accent }: { bg: string; primary: string; secondary: string; accent: string }) {
  return (
    <div className="w-full h-14 rounded-xl overflow-hidden relative" style={{ background: bg }}>
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at top right, ${accent}22 0%, transparent 60%)` }} />
      <div className="absolute bottom-2 left-2 w-7 h-7 rounded-lg" style={{ background: primary }} />
      <div className="absolute bottom-2 left-11 w-5 h-5 rounded-lg opacity-70" style={{ background: secondary }} />
      <div className="absolute bottom-2 left-[72px] w-3.5 h-3.5 rounded-md" style={{ background: accent, opacity: 0.85 }} />
      <div className="absolute bottom-2 right-2 w-8 h-1.5 rounded-full opacity-40" style={{ background: primary }} />
      <div className="absolute top-2 right-2 w-4 h-1 rounded-full opacity-30" style={{ background: accent }} />
    </div>
  );
}

function SystemSwatch() {
  return (
    <div className="w-full h-14 rounded-xl overflow-hidden relative flex">
      <div className="flex-1 bg-[#f8f8fa] flex items-end pb-2 pl-2">
        <div className="w-6 h-6 rounded-lg bg-[#1f1f2e]" />
      </div>
      <div className="flex-1 bg-[#0e0e12] flex items-end pb-2 pl-1">
        <div className="w-6 h-6 rounded-lg bg-[#a0a0b8]" />
      </div>
      <div className="absolute inset-y-0 left-1/2 -translate-x-px w-px bg-white/30 pointer-events-none" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-6 h-6 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <Monitor className="w-3.5 h-3.5 text-white/80" />
        </div>
      </div>
    </div>
  );
}
