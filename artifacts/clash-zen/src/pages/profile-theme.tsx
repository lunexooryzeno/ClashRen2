import { Link } from "wouter";
import { ArrowLeft, Check, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

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
  { id: "molten",  name: "Molten Volcanic",  desc: "Dark, fiery orange-red",       bg: "#020202", primary: "#ea580c", secondary: "#1c0a02" },
  { id: "dark",    name: "Dark",             desc: "Neutral dark, zinc tones",     bg: "#0e0e12", primary: "#a0a0b8", secondary: "#1a1a22" },
  { id: "light",   name: "Light",            desc: "Clean light, minimal",         bg: "#f8f8fa", primary: "#1f1f2e", secondary: "#ebebf2" },
  { id: "system",  name: "System",           desc: "Follows OS preference",        bg: "#f8f8fa", primary: "#1f1f2e", secondary: "#0e0e12", isSystem: true },
  { id: "glass",   name: "Glass Morphism",   desc: "Frosted glass, deep dark",     bg: "#060612", primary: "#38bdf8", secondary: "#0d0d1e" },
  { id: "neon",    name: "Neon Cyber",       desc: "Electric cyan & magenta",      bg: "#06040a", primary: "#00ffff", secondary: "#c026d3" },
  { id: "forest",  name: "Forest Night",     desc: "Deep green, earthy warmth",    bg: "#040a06", primary: "#d97706", secondary: "#0a1a0d" },
  { id: "royal",   name: "Royal Gold",       desc: "Dark navy, rich gold",         bg: "#060812", primary: "#eab308", secondary: "#0d1022" },
];

export default function ProfileThemePage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-[100dvh] flex flex-col profile-page-bg">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-4">
        <Link href="/profile">
          <button className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
        </Link>
        <div>
          <h1 className="font-heading text-lg font-bold text-foreground tracking-tight">App Theme</h1>
          <p className="text-xs text-muted-foreground">Pick a look that suits you</p>
        </div>
      </div>

      {/* Active theme banner */}
      <div className="mx-4 mb-4 px-4 py-3 rounded-2xl flex items-center gap-3"
        style={{ background: "hsl(var(--primary)/0.08)", border: "1px solid hsl(var(--primary)/0.2)" }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "hsl(var(--primary)/0.15)", border: "1px solid hsl(var(--primary)/0.3)" }}>
          <Check className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Active theme</p>
          <p className="text-sm font-bold text-foreground">{THEMES.find(t => t.id === theme)?.name ?? "Molten Volcanic"}</p>
        </div>
      </div>

      {/* Theme grid */}
      <div className="flex-1 px-4 pb-10">
        <div className="grid grid-cols-2 gap-3">
          {THEMES.map((t) => {
            const isActive = theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={cn(
                  "relative rounded-2xl p-3.5 text-left transition-all active:scale-[0.97] overflow-hidden border",
                  isActive ? "border-primary/60 ring-2 ring-primary/30" : "border-border hover:border-border/80"
                )}
                style={{ background: isActive ? "hsl(var(--primary) / 0.06)" : "hsl(var(--card))" }}
              >
                {t.isSystem ? <SystemSwatch /> : <ColorSwatch bg={t.bg} primary={t.primary} secondary={t.secondary} />}

                {isActive && (
                  <div className="absolute top-2.5 right-2.5 z-10 w-5 h-5 rounded-full flex items-center justify-center shadow-lg"
                    style={{ background: "hsl(var(--primary))" }}>
                    <Check className="w-3 h-3" style={{ color: "hsl(var(--primary-foreground))" }} strokeWidth={3} />
                  </div>
                )}

                <p className="text-sm font-bold text-foreground mt-2.5 leading-tight pr-6">{t.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{t.desc}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ColorSwatch({ bg, primary, secondary }: { bg: string; primary: string; secondary: string }) {
  return (
    <div className="w-full h-14 rounded-xl overflow-hidden relative" style={{ background: bg }}>
      <div className="absolute bottom-2 left-2 w-7 h-7 rounded-lg" style={{ background: primary }} />
      <div className="absolute bottom-2 left-11 w-7 h-7 rounded-lg opacity-70" style={{ background: secondary }} />
      <div className="absolute bottom-2 right-2 w-7 h-1.5 rounded-full opacity-40" style={{ background: primary }} />
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
