import React from "react";
import { useTheme } from "next-themes";
import { Check, X, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiPost } from "@/lib/api";

interface Theme {
  id: string;
  name: string;
  desc: string;
  bg: string;
  primary: string;
  secondary: string;
  isSystem?: boolean;
}

const THEMES: Theme[] = [
  {
    id: "molten",
    name: "Molten Volcanic",
    desc: "Dark, fiery orange-red",
    bg: "#020202",
    primary: "#ea580c",
    secondary: "#1c0a02",
  },
  {
    id: "dark",
    name: "Dark",
    desc: "Neutral dark, zinc tones",
    bg: "#0e0e12",
    primary: "#a0a0b8",
    secondary: "#1a1a22",
  },
  {
    id: "light",
    name: "Light",
    desc: "Clean light, minimal",
    bg: "#f8f8fa",
    primary: "#1f1f2e",
    secondary: "#ebebf2",
  },
  {
    id: "system",
    name: "System",
    desc: "Follows OS preference",
    bg: "#f8f8fa",
    primary: "#1f1f2e",
    secondary: "#0e0e12",
    isSystem: true,
  },
  {
    id: "glass",
    name: "Glass Morphism",
    desc: "Frosted glass, deep dark",
    bg: "#060612",
    primary: "#38bdf8",
    secondary: "#0d0d1e",
  },
  {
    id: "neon",
    name: "Neon Cyber",
    desc: "Electric cyan & magenta",
    bg: "#06040a",
    primary: "#00ffff",
    secondary: "#c026d3",
  },
  {
    id: "forest",
    name: "Forest Night",
    desc: "Deep green, earthy warmth",
    bg: "#040a06",
    primary: "#d97706",
    secondary: "#0a1a0d",
  },
  {
    id: "royal",
    name: "Royal Gold",
    desc: "Dark navy, rich gold",
    bg: "#060812",
    primary: "#eab308",
    secondary: "#0d1022",
  },
];

function Overlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/75 z-40 backdrop-blur-sm"
      onClick={onClose}
    />
  );
}

interface ThemePickerProps {
  onClose: () => void;
}

export function ThemePicker({ onClose }: ThemePickerProps) {
  const { theme, setTheme } = useTheme();

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

        <div className="flex items-center justify-between px-5 pt-3 pb-3 shrink-0">
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground">
              App Theme
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Pick a look that suits you
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            style={{ background: "var(--button-outline)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-8">
          <div className="grid grid-cols-2 gap-3">
            {THEMES.map((t) => {
              const isActive = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setTheme(t.id);
                    apiPost("/users/theme", { theme: t.id }).catch(() => {});
                    onClose();
                  }}
                  className={cn(
                    "relative rounded-2xl p-3.5 text-left transition-all active:scale-[0.97] overflow-hidden border",
                    isActive
                      ? "border-primary/60 ring-2 ring-primary/30"
                      : "border-border hover:border-border/80"
                  )}
                  style={{
                    background: isActive
                      ? "hsl(var(--primary) / 0.06)"
                      : "hsl(var(--card))",
                  }}
                >
                  {isActive && (
                    <div
                      className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center shadow-lg"
                      style={{ background: "hsl(var(--primary))" }}
                    >
                      <Check
                        className="w-3 h-3"
                        style={{ color: "hsl(var(--primary-foreground))" }}
                        strokeWidth={3}
                      />
                    </div>
                  )}

                  {t.isSystem ? (
                    <SystemSwatch />
                  ) : (
                    <ColorSwatch
                      bg={t.bg}
                      primary={t.primary}
                      secondary={t.secondary}
                    />
                  )}

                  <p className="text-sm font-bold text-foreground mt-2.5 leading-tight pr-6">
                    {t.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                    {t.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function ColorSwatch({
  bg,
  primary,
  secondary,
}: {
  bg: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div
      className="w-full h-14 rounded-xl overflow-hidden relative"
      style={{ background: bg }}
    >
      <div
        className="absolute bottom-2 left-2 w-7 h-7 rounded-lg"
        style={{ background: primary }}
      />
      <div
        className="absolute bottom-2 left-11 w-7 h-7 rounded-lg opacity-70"
        style={{ background: secondary }}
      />
      <div
        className="absolute bottom-2 right-2 w-7 h-1.5 rounded-full opacity-40"
        style={{ background: primary }}
      />
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
