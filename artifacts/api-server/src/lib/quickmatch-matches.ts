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
  openInFfUrl?: string | null;
  receivedAt: string;
}

export interface CsCareerSnapshot {
  gamesPlayed: number;
  wins: number;
  kills: number;
  damage: number;
  deaths: number;
  assists: number;
  fetchedAt: string;
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
  entryFee: number;
  prizeAmount: number;
  webhookFired: boolean;
  credentialsReadyAt?: string;
  actionTaken: Record<string, string>;
  preSnapshots: Record<string, CsCareerSnapshot>;
  /** True once fetchAndStorePreSnapshots() has finished (even if it got no data). */
  preSnapshotAttempted: boolean;
  noShowHandled: boolean;
  /** Settlement promise stored so concurrent check-end calls can await completion. */
  settlementPromise?: Promise<void>;
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
  entryFee = 0,
  prizeAmount = 0,
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
    entryFee,
    prizeAmount,
    webhookFired: false,
    actionTaken: {},
    preSnapshots: {},
    preSnapshotAttempted: false,
    noShowHandled: false,
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

export function getMatchById(matchId: string): QuickMatch | null {
  expireStale();
  return activeMatches.find((m) => m.id === matchId) ?? null;
}

export function attachCredentials(
  roomId: string,
  password: string,
  openInFfUrl?: string | null,
): QuickMatch | null {
  expireStale();
  const match = activeMatches.find((m) => m.status === "waiting_room");
  if (!match) return null;
  match.credentials = {
    roomId,
    password,
    openInFfUrl: openInFfUrl ?? null,
    receivedAt: new Date().toISOString(),
  };
  match.status = "credentials_ready";
  match.credentialsReadyAt = new Date().toISOString();
  return match;
}

export function markWebhookFired(matchId: string): void {
  const match = activeMatches.find((m) => m.id === matchId);
  if (match) match.webhookFired = true;
}

export function markActionTaken(matchId: string, userId: string): void {
  const match = activeMatches.find((m) => m.id === matchId);
  if (match && !match.actionTaken[userId]) {
    match.actionTaken[userId] = new Date().toISOString();
  }
}

export function setPreSnapshot(matchId: string, userId: string, snapshot: CsCareerSnapshot): void {
  const match = activeMatches.find((m) => m.id === matchId);
  if (match) match.preSnapshots[userId] = snapshot;
}

export function markPreSnapshotAttempted(matchId: string): void {
  const match = activeMatches.find((m) => m.id === matchId);
  if (match) match.preSnapshotAttempted = true;
}

export function markNoShowHandled(matchId: string): void {
  const match = activeMatches.find((m) => m.id === matchId);
  if (match) match.noShowHandled = true;
}

export function setSettlementPromise(matchId: string, promise: Promise<void>): void {
  const match = activeMatches.find((m) => m.id === matchId);
  if (match) match.settlementPromise = promise;
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
