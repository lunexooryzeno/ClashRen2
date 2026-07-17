import crypto from "crypto";

export interface PlayerProfile {
  userId: string;
  inGameName: string;
  profilePicture?: string | null;
  uid?: string | null;
}

export interface MatchCredentials {
  roomId: string;
  password: string;
  receivedAt: string;
}

export interface QuickMatch {
  id: string;
  gameType: string;
  modeId: string;
  playerIds: string[];
  players: PlayerProfile[];
  status: "waiting_room" | "credentials_ready" | "expired";
  createdAt: string;
  credentials?: MatchCredentials;
}

const MAX_HISTORY = 50;
const MATCH_TTL_MS = 15 * 60 * 1000;

let activeMatches: QuickMatch[] = [];
const matchHistory: QuickMatch[] = [];

function expireStale() {
  const now = Date.now();
  activeMatches = activeMatches.filter((m) => {
    if (m.status === "credentials_ready") return true;
    const age = now - new Date(m.createdAt).getTime();
    if (age > MATCH_TTL_MS) {
      m.status = "expired";
      matchHistory.unshift({ ...m });
      if (matchHistory.length > MAX_HISTORY) matchHistory.pop();
      return false;
    }
    return true;
  });
}

// Time-based room preparation steps (ms since match created)
export type RoomStatus =
  | "opponent_found"
  | "creating_room"
  | "booting_game"
  | "waiting_credentials"
  | "ready";

export function getRoomStatus(match: QuickMatch): RoomStatus {
  if (match.status === "credentials_ready") return "ready";
  const age = Date.now() - new Date(match.createdAt).getTime();
  if (age < 4_000)  return "opponent_found";
  if (age < 12_000) return "creating_room";
  if (age < 22_000) return "booting_game";
  return "waiting_credentials";
}

export function createMatch(
  players: PlayerProfile[],
  gameType: string,
  modeId: string,
): QuickMatch {
  expireStale();
  const match: QuickMatch = {
    id: crypto.randomUUID(),
    gameType,
    modeId,
    playerIds: players.map((p) => p.userId),
    players,
    status: "waiting_room",
    createdAt: new Date().toISOString(),
  };
  activeMatches.push(match);
  return match;
}

export function getMatchForPlayer(userId: string): QuickMatch | null {
  expireStale();
  return (
    activeMatches.find(
      (m) =>
        m.playerIds.includes(userId) &&
        (m.status === "waiting_room" || m.status === "credentials_ready"),
    ) ?? null
  );
}

export function attachCredentials(
  roomId: string,
  password: string,
): QuickMatch | null {
  expireStale();
  const match = activeMatches.find((m) => m.status === "waiting_room");
  if (!match) return null;
  match.credentials = {
    roomId,
    password,
    receivedAt: new Date().toISOString(),
  };
  match.status = "credentials_ready";
  return match;
}

export function dismissMatch(matchId: string): void {
  const idx = activeMatches.findIndex((m) => m.id === matchId);
  if (idx !== -1) {
    activeMatches[idx].status = "expired";
    matchHistory.unshift({ ...activeMatches[idx] });
    if (matchHistory.length > MAX_HISTORY) matchHistory.pop();
    activeMatches.splice(idx, 1);
  }
}

export function hasPendingRoomRequest(): boolean {
  expireStale();
  return activeMatches.some((m) => m.status === "waiting_room");
}

export function getActiveMatches(): QuickMatch[] {
  expireStale();
  return [...activeMatches];
}
