export type ThemeTier = "free" | "premium";
export type ThemeCategory =
  | "esports"
  | "aggressive"
  | "atmospheric"
  | "clean"
  | "culture"
  | "classic"
  | "glassmorphism"
  | "neumorphism";

export interface ThemeEntry {
  id: string;
  name: string;
  tagline: string;
  bg: string;
  accent: string;
  accent2: string;
  category: ThemeCategory;
  tier: ThemeTier;
  popular?: boolean;
  isSystem?: boolean;
}

export const CATEGORY_META: Record<ThemeCategory, { label: string }> = {
  esports:       { label: "Core Esports" },
  aggressive:    { label: "High-Energy" },
  atmospheric:   { label: "Atmospheric" },
  clean:         { label: "Clean UI" },
  culture:       { label: "Culture" },
  classic:       { label: "Classics" },
  glassmorphism: { label: "Glassmorphism" },
  neumorphism:   { label: "Neumorphism" },
};

export const THEME_CATALOG: ThemeEntry[] = [
  /* ── CORE ESPORTS ─────────────────────────────────────────────── */
  { id: "cyberpunk",         name: "Cyberpunk",            tagline: "Neon-drenched streets. Chrome dreams. No rules.",      bg: "#050408", accent: "#f0e018", accent2: "#ff2d6e", category: "esports",       tier: "free", popular: true },
  { id: "synthwave",         name: "Synthwave",             tagline: "Outrun the grid. The 80s never died.",                 bg: "#0d0018", accent: "#ff00ff", accent2: "#7700ff", category: "esports",       tier: "free", popular: true },
  { id: "neo-tokyo",         name: "Neo-Tokyo",             tagline: "The future is red. Drop in and dominate.",             bg: "#080008", accent: "#ff0040", accent2: "#ffffff", category: "esports",       tier: "free", popular: true },
  { id: "hud",               name: "HUD / Sci-Fi",          tagline: "Lock on. Engage. Zero margin for error.",              bg: "#000800", accent: "#00ff41", accent2: "#005a12", category: "esports",       tier: "free" },
  { id: "glitchcore",        name: "Glitchcore",            tagline: "Reality corrupted. System override.",                  bg: "#050005", accent: "#ff00ff", accent2: "#00ffff", category: "esports",       tier: "free", popular: true },
  { id: "vaporwave",         name: "Vaporwave",             tagline: "Aesthetic overload. Chill vibes, deadly aim.",         bg: "#0f0318", accent: "#ff6ec7", accent2: "#a855f7", category: "esports",       tier: "free", popular: true },
  { id: "cassette",          name: "Cassette Futurism",     tagline: "Analog soul. Digital precision.",                      bg: "#1a1208", accent: "#d4a574", accent2: "#b87333", category: "esports",       tier: "free" },
  { id: "pixel",             name: "8-Bit / Pixel",         tagline: "Respawn. Grind. Conquer the 8-bit arena.",             bg: "#0f380f", accent: "#9bbc0f", accent2: "#306230", category: "esports",       tier: "free" },
  { id: "voxel",             name: "Voxel",                 tagline: "Build your world. Block by block. Win by win.",        bg: "#0a1a0a", accent: "#5aedec", accent2: "#2a8a89", category: "esports",       tier: "free" },
  { id: "techwear",          name: "Techwear / Tactical",   tagline: "Stealth equipped. Threat neutralised.",                bg: "#080c06", accent: "#6b7c5a", accent2: "#3d4a30", category: "esports",       tier: "free" },
  /* ── HIGH-ENERGY / AGGRESSIVE ────────────────────────────────── */
  { id: "inferno",           name: "Inferno",               tagline: "Turn up the heat. Leave nothing but ash.",             bg: "#080000", accent: "#ff4500", accent2: "#ff8c00", category: "aggressive",    tier: "free", popular: true },
  { id: "storm",             name: "Storm / Lightning",     tagline: "Strike first. Strike fast. No mercy.",                 bg: "#020a18", accent: "#4fc3f7", accent2: "#e0f2fe", category: "aggressive",    tier: "free" },
  { id: "toxic",             name: "Toxic / Biohazard",     tagline: "Contaminate the meta. Everyone falls.",                bg: "#020802", accent: "#39ff14", accent2: "#00a808", category: "aggressive",    tier: "free" },
  { id: "neon-abyss",        name: "Neon Abyss",            tagline: "Dive into the dark. Neon lights the way down.",        bg: "#06000e", accent: "#9d4edd", accent2: "#c77dff", category: "aggressive",    tier: "free", popular: true },
  { id: "chrome",            name: "Chrome / Liquid Metal", tagline: "Cold. Hard. Unstoppable.",                             bg: "#0a0a0a", accent: "#c0c0c0", accent2: "#606060", category: "aggressive",    tier: "free" },
  { id: "voltage",           name: "Voltage",               tagline: "Overload the circuit. Full send.",                     bg: "#050500", accent: "#ffe000", accent2: "#ff9900", category: "aggressive",    tier: "free" },
  { id: "warzone",           name: "Warzone / Tactical",    tagline: "No HUD. No respawn. Real soldiers only.",              bg: "#0a0c04", accent: "#6b8e23", accent2: "#8fbc5f", category: "aggressive",    tier: "free" },
  { id: "dieselpunk",        name: "Dieselpunk",            tagline: "Grease, grit, and glory. Old school fury.",            bg: "#100c04", accent: "#b8621b", accent2: "#d4862f", category: "aggressive",    tier: "free" },
  { id: "nitro",             name: "Nitro",                 tagline: "Redline. Boost. Leave them in the dust.",              bg: "#030410", accent: "#3b82f6", accent2: "#60a5fa", category: "aggressive",    tier: "free" },
  { id: "rampage",           name: "Rampage / Frenzy",      tagline: "Rage mode activated. Nothing's stopping you.",         bg: "#060002", accent: "#dc143c", accent2: "#ff1a4e", category: "aggressive",    tier: "free", popular: true },
  /* ── IMMERSIVE & ATMOSPHERIC ─────────────────────────────────── */
  { id: "galactic",          name: "Space / Galactic",      tagline: "No gravity. No limits. The universe is yours.",        bg: "#010008", accent: "#6366f1", accent2: "#8b5cf6", category: "atmospheric",   tier: "free" },
  { id: "void",              name: "Void / Abyss",          tagline: "Empty everything. Only the game remains.",             bg: "#010103", accent: "#6060a0", accent2: "#4040a0", category: "atmospheric",   tier: "free" },
  { id: "eclipse",           name: "Eclipse",               tagline: "When the light dies, predators rise.",                 bg: "#100008", accent: "#f97316", accent2: "#ea580c", category: "atmospheric",   tier: "free" },
  { id: "solar-flare",       name: "Solar Flare",           tagline: "Burn bright. Burn fast. Leave a mark.",                bg: "#080200", accent: "#fbbf24", accent2: "#f59e0b", category: "atmospheric",   tier: "free" },
  { id: "plasma",            name: "Plasma",                tagline: "Pure energy. No containment.",                         bg: "#060010", accent: "#e879f9", accent2: "#c026d3", category: "atmospheric",   tier: "free", popular: true },
  { id: "gravity",           name: "Gravity / Warp",        tagline: "Bend the rules. Warp reality. Win.",                   bg: "#030010", accent: "#8b5cf6", accent2: "#7c3aed", category: "atmospheric",   tier: "free" },
  { id: "aurora",            name: "Aurora",                tagline: "Dance of light. Silence of focus.",                    bg: "#010612", accent: "#4ade80", accent2: "#ec4899", category: "atmospheric",   tier: "free", popular: true },
  /* ── GLASSMORPHISM ───────────────────────────────────────────── */
  { id: "glass",             name: "Glassmorphism",         tagline: "See through the chaos. Pure clarity.",                 bg: "#060612", accent: "#38bdf8", accent2: "#0ea5e9", category: "glassmorphism", tier: "free", popular: true },
  { id: "phantom",           name: "Phantom / Spectral",    tagline: "You can't catch what you can't see.",                  bg: "#030510", accent: "#7fffd4", accent2: "#00ced1", category: "glassmorphism", tier: "free", popular: true },
  { id: "crystalline",       name: "Crystalline",           tagline: "Sharp. Clear. Unbreakable.",                           bg: "#030a14", accent: "#a5f3fc", accent2: "#67e8f9", category: "glassmorphism", tier: "free" },
  { id: "deep-ocean",        name: "Deep Ocean",            tagline: "Pressure builds legends. Breathe.",                    bg: "#010810", accent: "#0891b2", accent2: "#38bdf8", category: "glassmorphism", tier: "free" },
  { id: "ice",               name: "Ice / Glacier",         tagline: "Coolest player in the lobby. Always.",                 bg: "#020e1c", accent: "#bae6fd", accent2: "#7dd3fc", category: "glassmorphism", tier: "free" },
  { id: "gridrunner",        name: "Gridrunner",            tagline: "On the grid. In the zone. Unstoppable.",               bg: "#010810", accent: "#00d4ff", accent2: "#0097b2", category: "glassmorphism", tier: "free" },
  /* ── NEUMORPHISM ─────────────────────────────────────────────── */
  { id: "neu-light",         name: "Neu Light",             tagline: "Soft shadows. Smooth edges. Pure flow.",               bg: "#e1e1eb", accent: "#6366f1", accent2: "#4f46e5", category: "neumorphism",   tier: "free", popular: true },
  { id: "neu-dark",          name: "Neu Dark",              tagline: "Deep shadows. Raised precision.",                      bg: "#1e1e2e", accent: "#818cf8", accent2: "#6366f1", category: "neumorphism",   tier: "free" },
  { id: "neu-clay",          name: "Neu Clay",              tagline: "Warm. Tactile. Every tap feels real.",                 bg: "#e8d5c4", accent: "#b87333", accent2: "#c9864a", category: "neumorphism",   tier: "free" },
  { id: "neu-ocean",         name: "Neu Ocean",             tagline: "Depth without darkness. Flow without limits.",         bg: "#d0e8f0", accent: "#0369a1", accent2: "#0284c7", category: "neumorphism",   tier: "free" },
  { id: "neu-rose",          name: "Neu Rose",              tagline: "Soft power. Bold presence.",                           bg: "#ecdde8", accent: "#be185d", accent2: "#db2777", category: "neumorphism",   tier: "free" },
  /* ── COOL & COMPETITIVE / CLEAN UI ──────────────────────────── */
  { id: "carbon",            name: "Carbon Fiber",          tagline: "Engineered to win. No decoration required.",           bg: "#080a0c", accent: "#64748b", accent2: "#94a3b8", category: "clean",         tier: "free" },
  { id: "stealth",           name: "Stealth",               tagline: "Invisible. Until it's too late.",                      bg: "#040408", accent: "#475569", accent2: "#64748b", category: "clean",         tier: "free" },
  { id: "dark",              name: "Dark Mode Pro",         tagline: "No fluff. Just precision.",                            bg: "#0e0e12", accent: "#a0a0b8", accent2: "#6060a0", category: "clean",         tier: "free", popular: true },
  { id: "minimal-mono",      name: "Minimal Mono",          tagline: "Gray. Cold. Calculated.",                              bg: "#0a0a0a", accent: "#888888", accent2: "#444444", category: "clean",         tier: "free" },
  { id: "neon-mint",         name: "Neon Mint",             tagline: "Fresh kills. Fresh look.",                             bg: "#020c08", accent: "#34d399", accent2: "#10b981", category: "clean",         tier: "free" },
  { id: "monochrome",        name: "Monochrome-X",          tagline: "Black. White. Victory.",                               bg: "#000000", accent: "#f8fafc", accent2: "#94a3b8", category: "clean",         tier: "free" },
  { id: "slate",             name: "Slate / Anthracite",    tagline: "Slate-hard. Tournament-ready.",                        bg: "#080a0e", accent: "#94a3b8", accent2: "#475569", category: "clean",         tier: "free" },
  /* ── COMMUNITY & CULTURE-DRIVEN ─────────────────────────────── */
  { id: "anime",             name: "Anime / Manga",         tagline: "Plot armor: maxed. Power level: over 9000.",           bg: "#080410", accent: "#f9a8d4", accent2: "#ec4899", category: "culture",       tier: "free" },
  { id: "kpop",              name: "K-Pop / Street",        tagline: "Comeback era. The stage is yours.",                    bg: "#0a0512", accent: "#fb7185", accent2: "#c084fc", category: "culture",       tier: "free" },
  { id: "graffiti",          name: "Street Art / Graffiti", tagline: "Tag the leaderboard. Own the streets.",                bg: "#0a0a04", accent: "#facc15", accent2: "#fb923c", category: "culture",       tier: "free" },
  { id: "punk",              name: "Skater / Punk",         tagline: "No rules. No limits. Total chaos.",                    bg: "#090400", accent: "#f97316", accent2: "#ef4444", category: "culture",       tier: "free" },
  { id: "retro-arcade",      name: "Retro Arcade",          tagline: "Insert coin. Play forever.",                           bg: "#04000a", accent: "#ef4444", accent2: "#facc15", category: "culture",       tier: "free" },
  { id: "cel-shaded",        name: "Cel-Shaded",            tagline: "Bold outlines. Bolder plays.",                         bg: "#080600", accent: "#fcd34d", accent2: "#f59e0b", category: "culture",       tier: "free" },
  { id: "battle-royale",     name: "Battle Royale",         tagline: "One server. One hundred players. You survive.",        bg: "#080400", accent: "#ea580c", accent2: "#dc2626", category: "culture",       tier: "free", popular: true },
  { id: "faction",           name: "Faction Wars",          tagline: "Pick a side. Fight for your clan.",                    bg: "#060410", accent: "#ef4444", accent2: "#3b82f6", category: "culture",       tier: "free" },
  { id: "fps-classic",       name: "FPS Classic",           tagline: "Old school reflexes. New school dominance.",           bg: "#060800", accent: "#92400e", accent2: "#78350f", category: "culture",       tier: "free" },
  { id: "moba-fantasy",      name: "MOBA Fantasy",          tagline: "Build your meta. Destroy the base.",                   bg: "#080018", accent: "#a855f7", accent2: "#d8b4fe", category: "culture",       tier: "free" },
  { id: "fgc",               name: "Fighting Game / FGC",   tagline: "Frame-perfect. Mind games. Respect the FGC.",          bg: "#0c0200", accent: "#dc2626", accent2: "#fbbf24", category: "culture",       tier: "free" },
  { id: "racing",            name: "Racing Sim",            tagline: "Throttle up. No brakes. First place.",                 bg: "#060000", accent: "#ef4444", accent2: "#f9a8d4", category: "culture",       tier: "free" },
  { id: "rhythm",            name: "Rhythm / Music",        tagline: "Hit the beat. Hit the squad.",                         bg: "#060010", accent: "#ec4899", accent2: "#a855f7", category: "culture",       tier: "free" },
  { id: "rts",               name: "Strategy / RTS",        tagline: "Chess at 500 APM. Outthink. Outplay.",                 bg: "#080600", accent: "#d97706", accent2: "#92400e", category: "culture",       tier: "free" },
  { id: "battle-royale-map", name: "BR Map Themes",         tagline: "Every zone, a different story. Adapt or die.",         bg: "#040a00", accent: "#84cc16", accent2: "#65a30d", category: "culture",       tier: "free" },
  /* ── CLASSICS ─────────────────────────────────────────────────── */
  { id: "molten",            name: "Molten Volcanic",       tagline: "Forge your legacy in fire. The OG loadout.",           bg: "#020202", accent: "#ea580c", accent2: "#dc2626", category: "classic",       tier: "free", popular: true },
  { id: "neon",              name: "Neon Cyber",            tagline: "Electric cyan. Magenta rage. Cyber domination.",       bg: "#06040a", accent: "#00ffff", accent2: "#c026d3", category: "classic",       tier: "free", popular: true },
  { id: "forest",            name: "Forest Night",          tagline: "Hunt in the shadows. Strike at dawn.",                 bg: "#040a06", accent: "#d97706", accent2: "#10b981", category: "classic",       tier: "free" },
  { id: "royal",             name: "Royal Gold",            tagline: "Only kings use this loadout.",                         bg: "#060812", accent: "#eab308", accent2: "#1d4ed8", category: "classic",       tier: "free", popular: true },
  { id: "light",             name: "Light",                 tagline: "For the brave who play in daylight.",                  bg: "#f8f8fa", accent: "#1f1f2e", accent2: "#ebebf2", category: "classic",       tier: "free" },
  { id: "system",            name: "System",                tagline: "Let the OS decide. Adaptive mode.",                    bg: "#0e0e12", accent: "#a0a0b8", accent2: "#f8f8fa", category: "classic",       tier: "free", isSystem: true },
];

export const ALL_CATEGORY_KEYS = [
  "all", "esports", "aggressive", "atmospheric", "clean", "culture", "classic", "glassmorphism", "neumorphism",
] as const;
export type CategoryFilter = (typeof ALL_CATEGORY_KEYS)[number];
