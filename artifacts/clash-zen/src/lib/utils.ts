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

export function isBookingClosed(tournament: { status?: string; startTime?: string; matchSettings?: string | Record<string, unknown> | null; isJoined?: boolean | null | undefined }): boolean {
  if (tournament.isJoined) return false; // joined players always see their match
  return isRegistrationClosed(tournament);
}

function getRegistrationCloseMinutes(tournament: { matchSettings?: string | Record<string, unknown> | null }): number {
  let closeMin = 15;
  try {
    const ms = typeof tournament.matchSettings === "string"
      ? JSON.parse(tournament.matchSettings)
      : (tournament.matchSettings ?? {});
    if (typeof ms.registrationCloseMinutes === "number") closeMin = ms.registrationCloseMinutes;
  } catch { /* keep default */ }
  return closeMin;
}

function isRegistrationClosed(tournament: { status?: string; startTime?: string; matchSettings?: string | Record<string, unknown> | null }): boolean {
  if (tournament.status !== "upcoming") return false;
  const startTime = tournament.startTime;
  if (!startTime) return false;
  return Date.now() >= new Date(startTime).getTime() - getRegistrationCloseMinutes(tournament) * 60 * 1000;
}

export function isTournamentEnded(tournament: { status?: string; startTime?: string }): boolean {
  const status = (tournament.status ?? "").toLowerCase();
  if (status === "completed" || status === "cancelled" || status === "canceled" || status === "ended" || status === "finished") {
    return true;
  }
  return status === "upcoming" && !!tournament.startTime && Date.now() >= new Date(tournament.startTime).getTime();
}

export function isUserVisibleTournament(tournament: {
  status?: string;
  startTime?: string;
  matchSettings?: string | Record<string, unknown> | null;
  isJoined?: boolean | null | undefined;
}): boolean {
  // Discovery pages show only open future tournaments. Joined/ended matches
  // remain available through the user's history and match-detail flows.
  if (tournament.status !== "upcoming") return false;
  if (isTournamentEnded(tournament)) return false;
  return !isRegistrationClosed(tournament);
}

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
