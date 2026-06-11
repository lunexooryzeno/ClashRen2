import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const KNOCKOUT_FORMAT_MAP: Record<string, string> = {
  solo: "Solo",
  duo: "Duo",
  squad: "Squad",
  clash_squad: "Clash Squad",
};

export function parseGameMode(gameMode: string): {
  isKnockout: boolean;
  teamFormat: string | null;
  displayLabel: string;
  isAllModes: boolean;
} {
  const lower = gameMode.toLowerCase().replace(/\s+/g, "_");
  const match = lower.match(/^(solo|duo|squad|clash_squad)_knockout$/);
  if (match) {
    const format = KNOCKOUT_FORMAT_MAP[match[1]];
    const isAllModes = match[1] === "clash_squad";
    return { isKnockout: true, teamFormat: format, displayLabel: `${format} · KO`, isAllModes };
  }
  if (lower === "knockout") {
    return { isKnockout: true, teamFormat: null, displayLabel: "Knockout", isAllModes: true };
  }
  return { isKnockout: false, teamFormat: null, displayLabel: gameMode, isAllModes: false };
}
