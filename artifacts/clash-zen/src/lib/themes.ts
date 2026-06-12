export type ThemeCategory =
  | "all"
  | "core"
  | "energy"
  | "immersive"
  | "competitive"
  | "community";

export interface ThemeDefinition {
  id: string;
  name: string;
  tagline: string;
  category: Exclude<ThemeCategory, "all">;
  bg: string;
  primary: string;
  secondary: string;
  accent: string;
  premium?: boolean;
  isSystem?: boolean;
}

export const THEME_CATEGORIES: { id: ThemeCategory; label: string }[] = [
  { id: "all",         label: "All" },
  { id: "core",        label: "Core Esports" },
  { id: "energy",      label: "High Energy" },
  { id: "immersive",   label: "Atmospheric" },
  { id: "competitive", label: "Clean UI" },
  { id: "community",   label: "Culture" },
];

export const ALL_THEMES: ThemeDefinition[] = [
  // ── ORIGINALS ────────────────────────────────────────────────────────────
  { id: "molten",  name: "Molten Volcanic",  tagline: "Born in the furnace. Forged for glory.",    category: "energy",      bg: "#020202", primary: "#ea580c", secondary: "#1c0a02", accent: "#ff2200" },
  { id: "dark",    name: "Dark",             tagline: "No frills. Just focus.",                    category: "competitive", bg: "#0e0e12", primary: "#a0a0b8", secondary: "#1a1a22", accent: "#6366f1" },
  { id: "light",   name: "Light",            tagline: "Clean, crisp, competitive.",                category: "competitive", bg: "#f8f8fa", primary: "#1f1f2e", secondary: "#ebebf2", accent: "#4f46e5" },
  { id: "glass",   name: "Glass Morphism",   tagline: "See through the noise. Lock in.",           category: "competitive", bg: "#060612", primary: "#38bdf8", secondary: "#0d0d1e", accent: "#818cf8" },
  { id: "neon",    name: "Neon Cyber",       tagline: "Electric streets. Digital warfare.",        category: "core",        bg: "#06040a", primary: "#00ffff", secondary: "#c026d3", accent: "#ff00aa" },
  { id: "forest",  name: "Forest Night",     tagline: "Hunt in the shadows. Strike at dawn.",      category: "immersive",   bg: "#040a06", primary: "#d97706", secondary: "#0a1a0d", accent: "#22c55e" },
  { id: "royal",   name: "Royal Gold",       tagline: "Champions only. The throne awaits.",        category: "competitive", bg: "#060812", primary: "#eab308", secondary: "#0d1022", accent: "#f59e0b" },
  { id: "system",  name: "System",           tagline: "Follow the OS. Always at home.",            category: "competitive", bg: "#f8f8fa", primary: "#1f1f2e", secondary: "#0e0e12", accent: "#6366f1", isSystem: true },

  // ── CORE ESPORTS / GAMING VIBES ──────────────────────────────────────────
  { id: "cyberpunk",  name: "Cyberpunk",          tagline: "Neon-drenched streets. Chrome dreams. No rules.",          category: "core",  premium: true,  bg: "#0a0014", primary: "#ff0090", secondary: "#00fff9", accent: "#7700ff" },
  { id: "synthwave",  name: "Synthwave",           tagline: "Outrun the grid. The sun never sets.",                    category: "core",  premium: true,  bg: "#0d0021", primary: "#ff6ad5", secondary: "#c774e8", accent: "#ad8cff" },
  { id: "neo-tokyo",  name: "Neo-Tokyo",           tagline: "Megacity. Megafrags. Unlimited respawns.",                category: "core",  bg: "#0a0a14", primary: "#ff3c38", secondary: "#ffd700", accent: "#00d4ff" },
  { id: "hud-scifi",  name: "HUD / Sci-Fi",        tagline: "Locked on target. Systems nominal.",                      category: "core",  bg: "#020d0a", primary: "#00ff87", secondary: "#00b4d8", accent: "#0096ff" },
  { id: "glitchcore", name: "Glitchcore",          tagline: "Reality.exe has crashed. Loading chaos.",                 category: "core",  premium: true,  bg: "#08000f", primary: "#ff00ff", secondary: "#00ff00", accent: "#ffff00" },
  { id: "vaporwave",  name: "Vaporwave",           tagline: "A E S T H E T I C. Infinite summer.",                    category: "core",  premium: true,  bg: "#1a0033", primary: "#ff71ce", secondary: "#05d9e8", accent: "#d1f7ff" },
  { id: "cassette",   name: "Cassette Futurism",   tagline: "Rewind the future. Press play on victory.",               category: "core",  bg: "#1a1000", primary: "#ff8c00", secondary: "#ffd700", accent: "#c0392b" },
  { id: "pixel",      name: "8-Bit / Pixel",       tagline: "Insert coin. Player One — let's go.",                    category: "core",  bg: "#000814", primary: "#00e5ff", secondary: "#69ff47", accent: "#ff6b35" },
  { id: "voxel",      name: "Voxel",               tagline: "Block by block. World by world.",                         category: "core",  bg: "#0d1b2a", primary: "#00b4d8", secondary: "#48cae4", accent: "#90e0ef" },
  { id: "techwear",   name: "Techwear / Tactical", tagline: "Gear up. Stay invisible. Stay lethal.",                   category: "core",  bg: "#0a0a0a", primary: "#c9d1d9", secondary: "#30363d", accent: "#58a6ff" },

  // ── HIGH-ENERGY / AGGRESSIVE ──────────────────────────────────────────────
  { id: "inferno",    name: "Inferno",             tagline: "Too hot to hold. Too fast to stop.",                      category: "energy", bg: "#0f0300", primary: "#ff4500", secondary: "#ff8c00", accent: "#ffd700" },
  { id: "storm",      name: "Storm / Lightning",   tagline: "Strike first. Strike hard. No mercy.",                   category: "energy", bg: "#060812", primary: "#00b4d8", secondary: "#7209b7", accent: "#ffffff" },
  { id: "toxic",      name: "Toxic / Biohazard",   tagline: "Contaminated. Lethal. Unstoppable.",                     category: "energy", bg: "#020a00", primary: "#39ff14", secondary: "#7fff00", accent: "#00ff41" },
  { id: "neon-abyss", name: "Neon Abyss",          tagline: "Fall into the rift. Rise as legend.",                    category: "energy", premium: true, bg: "#01010f", primary: "#7b2fff", secondary: "#ff00cc", accent: "#00ffcc" },
  { id: "chrome",     name: "Chrome / Liquid Metal", tagline: "Cold. Hard. Flawless.",                                category: "energy", premium: true, bg: "#0a0a0a", primary: "#e8e8e8", secondary: "#a8a8a8", accent: "#c0c0c0" },
  { id: "voltage",    name: "Voltage",             tagline: "Overclocked. Overclockers never rest.",                  category: "energy", bg: "#060010", primary: "#ffe600", secondary: "#ff6600", accent: "#ff0050" },
  { id: "warzone",    name: "Warzone / Tactical",  tagline: "Drop in hot. Extract with everything.",                  category: "energy", bg: "#0a0c06", primary: "#8b9d6e", secondary: "#4a5240", accent: "#d4c5a9" },
  { id: "dieselpunk", name: "Dieselpunk",          tagline: "Grit, grease, and raw power.",                           category: "energy", bg: "#120800", primary: "#b8860b", secondary: "#8b4513", accent: "#cd853f" },
  { id: "nitro",      name: "Nitro",               tagline: "Full send. Zero brakes. Pure adrenaline.",               category: "energy", bg: "#060018", primary: "#ff2d55", secondary: "#ff6b00", accent: "#ffffff" },
  { id: "rampage",    name: "Rampage / Frenzy",    tagline: "Unleash everything. Leave nothing standing.",            category: "energy", bg: "#0f0002", primary: "#dc143c", secondary: "#8b0000", accent: "#ff4500" },

  // ── IMMERSIVE & ATMOSPHERIC ───────────────────────────────────────────────
  { id: "space",        name: "Space / Galactic",  tagline: "The universe is your arena.",                            category: "immersive", bg: "#00020f", primary: "#7b68ee", secondary: "#4b0082", accent: "#00d4ff" },
  { id: "void",         name: "Void / Abyss",      tagline: "Nothing exists here. Except you. And your enemies.",    category: "immersive", premium: true, bg: "#000005", primary: "#6a0dad", secondary: "#1a001a", accent: "#9b59b6" },
  { id: "eclipse",      name: "Eclipse",           tagline: "Darkness falls. You rise.",                              category: "immersive", bg: "#050000", primary: "#ff6b35", secondary: "#1a0a00", accent: "#ffd700" },
  { id: "phantom",      name: "Phantom / Spectral", tagline: "They never saw you coming.",                           category: "immersive", bg: "#050508", primary: "#b8b8ff", secondary: "#6c6c9f", accent: "#e8e8ff" },
  { id: "deep-ocean",   name: "Deep Ocean",        tagline: "Pressure builds. Legends are forged deep.",              category: "immersive", bg: "#000d1a", primary: "#006994", secondary: "#00477a", accent: "#00b4d8" },
  { id: "crystalline",  name: "Crystalline",       tagline: "Pure. Precise. Untouchable.",                            category: "immersive", premium: true, bg: "#010812", primary: "#a8d8ea", secondary: "#5c9ead", accent: "#f6f6f6" },
  { id: "solar-flare",  name: "Solar Flare",       tagline: "The sun doesn't blink. Neither do you.",                category: "immersive", bg: "#090202", primary: "#ff9500", secondary: "#ff5e00", accent: "#ffcc00" },
  { id: "plasma",       name: "Plasma",            tagline: "Supercharged particles. Supercharged plays.",            category: "immersive", premium: true, bg: "#040010", primary: "#cc44ff", secondary: "#7700ff", accent: "#ff44cc" },
  { id: "gravity",      name: "Gravity / Warp",    tagline: "Bend physics. Break records.",                           category: "immersive", bg: "#020210", primary: "#4169e1", secondary: "#191970", accent: "#00bfff" },
  { id: "aurora",       name: "Aurora",            tagline: "Where the sky dances. Where champions are born.",        category: "immersive", bg: "#000d0a", primary: "#00ff88", secondary: "#00d4aa", accent: "#7700ff" },

  // ── COOL & COMPETITIVE / CLEAN UI ────────────────────────────────────────
  { id: "carbon",       name: "Carbon Fiber",      tagline: "Lightweight. Indestructible. Dominant.",                 category: "competitive", bg: "#0a0a0a", primary: "#ffffff", secondary: "#1a1a1a", accent: "#00bfff" },
  { id: "stealth",      name: "Stealth",           tagline: "Ghost protocol. You don't exist.",                       category: "competitive", bg: "#0c0c0e", primary: "#6e6e80", secondary: "#18181c", accent: "#a0a0b8" },
  { id: "glassmorphic", name: "Glassmorphism",     tagline: "Clarity through the chaos.",                             category: "competitive", premium: true, bg: "#060612", primary: "#38bdf8", secondary: "#0d0d1e", accent: "#818cf8" },
  { id: "dark-pro",     name: "Dark Mode Pro",     tagline: "Pro-tier darkness. No distractions.",                    category: "competitive", bg: "#0e0e12", primary: "#a0a0b8", secondary: "#1a1a22", accent: "#6366f1" },
  { id: "ice",          name: "Ice / Glacier",     tagline: "Frozen precision. Ice-cold clutches.",                   category: "competitive", bg: "#010d14", primary: "#a8d8ea", secondary: "#7ec8e3", accent: "#ffffff" },
  { id: "minimal-mono", name: "Minimal Mono",      tagline: "Stripped down. Locked in. Winning.",                    category: "competitive", bg: "#111111", primary: "#e0e0e0", secondary: "#333333", accent: "#999999" },
  { id: "neon-mint",    name: "Neon Mint",         tagline: "Fresh drops. Crisp kills.",                              category: "competitive", premium: true, bg: "#020f0a", primary: "#00ffb3", secondary: "#00cc8f", accent: "#7dfff1" },
  { id: "monochrome",   name: "Monochrome-X",      tagline: "Black and white. No grey areas.",                        category: "competitive", bg: "#0d0d0d", primary: "#f0f0f0", secondary: "#1f1f1f", accent: "#888888" },
  { id: "gridrunner",   name: "Gridrunner",        tagline: "Run the grid. Own the map.",                             category: "competitive", bg: "#000d00", primary: "#00ff41", secondary: "#003300", accent: "#00cc33" },
  { id: "slate",        name: "Slate / Anthracite", tagline: "Stone-cold execution. Every time.",                    category: "competitive", bg: "#0f1117", primary: "#94a3b8", secondary: "#1e2535", accent: "#64748b" },

  // ── COMMUNITY & CULTURE ───────────────────────────────────────────────────
  { id: "anime",          name: "Anime / Manga",        tagline: "This is your arc. Make it legendary.",              category: "community", premium: true, bg: "#0d0018", primary: "#ff6eb4", secondary: "#b366ff", accent: "#ffe4e1" },
  { id: "kpop",           name: "K-Pop / Street Fashion", tagline: "Stage presence. Chart-topping plays.",            category: "community", premium: true, bg: "#0d000d", primary: "#ff69b4", secondary: "#da70d6", accent: "#ffd700" },
  { id: "street-art",     name: "Street Art / Graffiti", tagline: "Tag the leaderboard. Own the streets.",            category: "community", bg: "#080808", primary: "#ff2d00", secondary: "#ffff00", accent: "#00ff00" },
  { id: "skater-punk",    name: "Skater / Punk",        tagline: "Rules are for skipping. Just ride.",                category: "community", bg: "#0a0a00", primary: "#ff6600", secondary: "#ffcc00", accent: "#ff0044" },
  { id: "retro-arcade",   name: "Retro Arcade",         tagline: "High score or go home.",                            category: "community", bg: "#000028", primary: "#ffcc00", secondary: "#ff0066", accent: "#00ccff" },
  { id: "cel-shaded",     name: "Cel-Shaded",           tagline: "Drawn to win. Inked to dominate.",                  category: "community", bg: "#0f0f0f", primary: "#ff4500", secondary: "#ffd700", accent: "#000000" },
  { id: "battle-royale",  name: "Battle Royale",        tagline: "100 drop in. 1 walks out.",                         category: "community", bg: "#060d12", primary: "#00aaff", secondary: "#0066cc", accent: "#ffffff" },
  { id: "faction-wars",   name: "Faction Wars",         tagline: "Pick a side. Fight for everything.",                category: "community", premium: true, bg: "#0a0008", primary: "#ff2200", secondary: "#0022ff", accent: "#ffd700" },
  { id: "fps-classic",    name: "FPS Classic",          tagline: "Aim. Fire. Dominate. Repeat.",                      category: "community", bg: "#0a0a00", primary: "#c8b560", secondary: "#5c5c00", accent: "#ffffff" },
  { id: "moba-fantasy",   name: "MOBA Fantasy",         tagline: "Five legends. One destiny.",                        category: "community", bg: "#040a18", primary: "#7b68ee", secondary: "#4b0082", accent: "#ffd700" },
  { id: "fighting-fgc",   name: "Fighting Game / FGC",  tagline: "Frame perfect. Match point.",                      category: "community", premium: true, bg: "#0f0000", primary: "#ff0000", secondary: "#ff6600", accent: "#ffffff" },
  { id: "racing-sim",     name: "Racing Sim",           tagline: "Pole position. Every session.",                     category: "community", bg: "#020208", primary: "#ff1e1e", secondary: "#ff8c00", accent: "#ffffff" },
  { id: "rhythm-music",   name: "Rhythm / Music Game",  tagline: "Hit every beat. Miss nothing.",                    category: "community", premium: true, bg: "#040010", primary: "#ff44ff", secondary: "#8844ff", accent: "#44ffff" },
  { id: "strategy-rts",   name: "Strategy / RTS",       tagline: "Think five moves ahead. Always.",                  category: "community", bg: "#040a08", primary: "#00aa44", secondary: "#004422", accent: "#ffd700" },
  { id: "battle-royale-map", name: "Battle Royale (Map)", tagline: "Read the ring. Survive the storm.",              category: "community", bg: "#080c04", primary: "#7ab648", secondary: "#3d6b1e", accent: "#ffd700" },
];

export const FREE_THEMES = ALL_THEMES.filter(t => !t.premium);
export const PREMIUM_THEMES = ALL_THEMES.filter(t => t.premium);

export function getThemeById(id: string): ThemeDefinition | undefined {
  return ALL_THEMES.find(t => t.id === id);
}
