import React, { useState, useMemo } from "react";
import { useTheme } from "next-themes";
import { Check, X, Monitor, Lock, Shuffle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiPost } from "@/lib/api";
import { ALL_THEMES, THEME_CATEGORIES, type ThemeCategory, type ThemeDefinition } from "@/lib/themes";

function Overlay({ onClose }: { onClose: () => void }) {
  return <div className="fixed inset-0 bg-black/75 z-40 backdrop-blur-sm" onClick={onClose} />;
}

interface ThemePickerProps {
  onClose: () => void;
}

export function ThemePicker({ onClose }: ThemePickerProps) {
  const { theme, setTheme } = useTheme();
  const [activeCategory, setActiveCategory] = useState<ThemeCategory>("all");

  const filtered = useMemo(() => {
    if (activeCategory === "all") return ALL_THEMES;
    return ALL_THEMES.filter(t => t.category === activeCategory);
  }, [activeCategory]);

  function apply(t: ThemeDefinition) {
    if (t.premium) return;
    setTheme(t.id);
    apiPost("/users/theme", { theme: t.id }).catch(() => {});
    onClose();
  }

  function randomize() {
    const free = ALL_THEMES.filter(t => !t.premium && t.id !== theme);
    if (!free.length) return;
    const pick = free[Math.floor(Math.random() * free.length)];
    apply(pick);
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
        <div className="flex items-center justify-between px-5 pt-3 pb-2 shrink-0">
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground">Choose Your Vibe</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{ALL_THEMES.filter(t => !t.premium).length} free · {ALL_THEMES.filter(t => t.premium).length} premium</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={randomize}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-primary border border-primary/30 bg-primary/8 hover:bg-primary/15 transition-colors"
              title="Randomize"
            >
              <Shuffle className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              style={{ background: "var(--button-outline)" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Category tabs */}
        <div className="overflow-x-auto px-5 pb-2 shrink-0 scrollbar-none">
          <div className="flex gap-1.5 w-max">
            {THEME_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all",
                  activeCategory === cat.id
                    ? "text-primary-foreground"
                    : "text-muted-foreground border border-border bg-secondary hover:text-foreground"
                )}
                style={activeCategory === cat.id ? { background: "hsl(var(--primary))" } : undefined}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Theme grid */}
        <div className="overflow-y-auto px-5 pb-6">
          <div className="grid grid-cols-2 gap-2.5">
            {filtered.map((t) => {
              const isActive = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => apply(t)}
                  disabled={t.premium}
                  className={cn(
                    "relative rounded-2xl p-3 text-left transition-all overflow-hidden border",
                    t.premium
                      ? "opacity-60 cursor-not-allowed border-border"
                      : isActive
                        ? "border-primary/60 ring-2 ring-primary/30 active:scale-[0.97]"
                        : "border-border hover:border-primary/30 active:scale-[0.97]"
                  )}
                  style={{ background: isActive ? "hsl(var(--primary) / 0.06)" : "hsl(var(--card))" }}
                >
                  {t.premium ? (
                    <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                      style={{ background: "hsl(43 90% 50%)", color: "#000" }}>
                      <Lock className="w-2 h-2" />PRO
                    </div>
                  ) : isActive ? (
                    <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center shadow-lg"
                      style={{ background: "hsl(var(--primary))" }}>
                      <Check className="w-3 h-3" style={{ color: "hsl(var(--primary-foreground))" }} strokeWidth={3} />
                    </div>
                  ) : null}

                  {t.isSystem ? (
                    <SystemSwatch />
                  ) : (
                    <ColorSwatch bg={t.bg} primary={t.primary} secondary={t.secondary} accent={t.accent} />
                  )}

                  <p className="text-xs font-bold text-foreground mt-2 leading-tight pr-5 truncate">{t.name}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight line-clamp-1">{t.tagline.split(".")[0]}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function ColorSwatch({ bg, primary, secondary, accent }: { bg: string; primary: string; secondary: string; accent: string }) {
  return (
    <div className="w-full h-12 rounded-xl overflow-hidden relative" style={{ background: bg }}>
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at top right, ${accent}22 0%, transparent 55%)` }} />
      <div className="absolute bottom-2 left-2 w-6 h-6 rounded-lg" style={{ background: primary }} />
      <div className="absolute bottom-2 left-10 w-4 h-4 rounded-md opacity-70" style={{ background: secondary }} />
      <div className="absolute bottom-2 left-[58px] w-3 h-3 rounded-md" style={{ background: accent, opacity: 0.85 }} />
      <div className="absolute bottom-2 right-2 w-7 h-1.5 rounded-full opacity-35" style={{ background: primary }} />
    </div>
  );
}

function SystemSwatch() {
  return (
    <div className="w-full h-12 rounded-xl overflow-hidden relative flex">
      <div className="flex-1 bg-[#f8f8fa] flex items-end pb-1.5 pl-1.5">
        <div className="w-5 h-5 rounded-md bg-[#1f1f2e]" />
      </div>
      <div className="flex-1 bg-[#0e0e12] flex items-end pb-1.5 pl-1">
        <div className="w-5 h-5 rounded-md bg-[#a0a0b8]" />
      </div>
      <div className="absolute inset-y-0 left-1/2 -translate-x-px w-px bg-white/30 pointer-events-none" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-5 h-5 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <Monitor className="w-3 h-3 text-white/80" />
        </div>
      </div>
    </div>
  );
}
