import React, { useState, useMemo } from "react";
import { useTheme } from "next-themes";
import { Check, X, Search, Monitor, Lock, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiPost } from "@/lib/api";
import {
  THEME_CATALOG, CATEGORY_META, ALL_CATEGORY_KEYS,
  type CategoryFilter, type ThemeEntry,
} from "@/lib/themes";

function Overlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/75 z-40 backdrop-blur-sm" onClick={onClose} />
  );
}

interface ThemePickerProps { onClose: () => void; }

export function ThemePicker({ onClose }: ThemePickerProps) {
  const { theme, setTheme } = useTheme();
  const [search, setSearch]     = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");

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

  function applyTheme(t: ThemeEntry) {
    if (t.tier === "premium") return;
    setTheme(t.id);
    apiPost("/users/theme", { theme: t.id }).catch(() => {});
    onClose();
  }

  function randomize() {
    const free = THEME_CATALOG.filter(t => t.tier === "free" && !t.isSystem);
    const pick  = free[Math.floor(Math.random() * free.length)];
    applyTheme(pick);
  }

  return (
    <>
      <Overlay onClose={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[28px] flex flex-col max-h-[88dvh] bg-popover"
        style={{
          backdropFilter: "blur(36px)",
          borderTop: "1px solid hsl(var(--border))",
          boxShadow: "0 -20px 60px rgba(0,0,0,0.4), inset 0 1px 0 var(--button-outline)",
        }}
      >
        <div className="mx-auto mt-2.5 mb-1 w-10 h-1 rounded-full bg-foreground/15" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-1 shrink-0">
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground">App Theme</h2>
            <p className="text-[11px] text-muted-foreground">Choose your loadout</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={randomize}
              className="h-7 px-2.5 rounded-xl flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95"
              style={{
                background: "hsl(var(--primary)/0.12)",
                border: "1px solid hsl(var(--primary)/0.25)",
                color: "hsl(var(--primary))",
              }}
            >
              <Shuffle className="w-3 h-3" />
              Random
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              style={{ background: "var(--button-outline)" }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-5 py-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search themes…"
              className="w-full h-8 pl-8 pr-3 rounded-xl text-sm text-foreground placeholder:text-muted-foreground outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="px-5 pb-2 shrink-0">
          <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {ALL_CATEGORY_KEYS.map(key => {
              const isAll  = key === "all";
              const meta   = isAll ? null : CATEGORY_META[key as keyof typeof CATEGORY_META];
              const active = category === key;
              return (
                <button
                  key={key}
                  onClick={() => setCategory(key)}
                  className="h-6 px-2.5 rounded-full text-[10px] font-bold whitespace-nowrap shrink-0 transition-all active:scale-95"
                  style={{
                    background: active ? "hsl(var(--primary))" : "rgba(255,255,255,0.05)",
                    border:     active ? "1px solid transparent" : "1px solid rgba(255,255,255,0.08)",
                    color:      active ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                  }}
                >
                  {isAll ? "✦ All" : `${meta!.emoji} ${meta!.label}`}
                </button>
              );
            })}
          </div>
        </div>

        {/* Grid */}
        <div className="overflow-y-auto px-5 pb-8">
          {filtered.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-bold text-foreground">No themes found</p>
              <p className="text-xs text-muted-foreground mt-1">Try a different search</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filtered.map(t => {
                const isActive = theme === t.id;
                const locked   = t.tier === "premium";
                return (
                  <button
                    key={t.id}
                    onClick={() => applyTheme(t)}
                    className={cn(
                      "relative rounded-xl text-left transition-all active:scale-[0.97] overflow-hidden border flex flex-col",
                      isActive ? "ring-2" : ""
                    )}
                    style={{
                      background:  isActive ? "hsl(var(--primary)/0.08)" : "hsl(var(--card))",
                      borderColor: isActive ? "hsl(var(--primary)/0.55)" : "hsl(var(--border))",
                      ["--tw-ring-color" as string]: "hsl(var(--primary)/0.3)",
                      opacity: locked ? 0.72 : 1,
                    }}
                  >
                    {t.isSystem ? <MiniSystemSwatch /> : <MiniColorSwatch bg={t.bg} accent={t.accent} accent2={t.accent2} />}

                    {isActive && (
                      <div
                        className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center z-10 shadow"
                        style={{ background: "hsl(var(--primary))" }}
                      >
                        <Check className="w-2.5 h-2.5" style={{ color: "hsl(var(--primary-foreground))" }} strokeWidth={3} />
                      </div>
                    )}
                    {locked && !isActive && (
                      <div
                        className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center z-10"
                        style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.15)" }}
                      >
                        <Lock className="w-2 h-2 text-zinc-400" />
                      </div>
                    )}

                    <div className="px-2 pt-1.5 pb-2">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <p className="text-[10px] font-bold text-foreground leading-tight line-clamp-1 flex-1">{t.name}</p>
                        {locked && (
                          <span className="text-[7px] font-bold uppercase tracking-widest" style={{ color: "#fbbf24" }}>PRO</span>
                        )}
                      </div>
                      <p className="text-[8px] text-muted-foreground leading-snug line-clamp-1">{t.tagline}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function MiniColorSwatch({ bg, accent, accent2 }: { bg: string; accent: string; accent2: string }) {
  return (
    <div className="w-full h-12 relative overflow-hidden shrink-0" style={{ background: bg }}>
      <div className="absolute inset-0" style={{ background: `linear-gradient(135deg,${accent}25 0%,transparent 55%)` }} />
      <div className="absolute bottom-1.5 left-2 flex gap-1 items-center">
        <div className="w-4 h-4 rounded shadow" style={{ background: accent }} />
        <div className="w-3 h-3 rounded shadow opacity-60" style={{ background: accent2 }} />
      </div>
      <div className="absolute bottom-1.5 right-2 w-6 h-1 rounded-full opacity-40" style={{ background: accent }} />
    </div>
  );
}

function MiniSystemSwatch() {
  return (
    <div className="w-full h-12 overflow-hidden relative flex shrink-0">
      <div className="flex-1 bg-[#f8f8fa] flex items-end pb-1.5 pl-2">
        <div className="w-4 h-4 rounded bg-[#1f1f2e]" />
      </div>
      <div className="flex-1 bg-[#0e0e12] flex items-end pb-1.5 pl-1">
        <div className="w-4 h-4 rounded bg-[#a0a0b8]" />
      </div>
      <div className="absolute inset-y-0 left-1/2 -translate-x-px w-px bg-white/20 pointer-events-none" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-5 h-5 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <Monitor className="w-3 h-3 text-white/70" />
        </div>
      </div>
    </div>
  );
}
