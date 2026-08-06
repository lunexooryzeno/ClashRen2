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

// ─── 13-state machine ──────────────────────────────────────────────────────────
export type MatchState =
  | "QUEUEING"
  | "MATCHED"
  | "WAITING_FOR_ROOM"
  | "CREATING_ROOM"
  | "ROOM_READY"
  | "JOIN_WINDOW"
  | "IN_GAME"
  | "RESULT_PENDING"
  | "VERIFYING_SCREENSHOT"
  | "PROVISIONAL_WIN"
  | "DISPUTE_WINDOW"
  | "FINALIZED"
  | "CANCELLED";

// Map MatchState → legacy status for backward compat with existing SSE/polling code
export function toLegacyStatus(state: MatchState): "waiting_room" | "credentials_ready" | "expired" {
  if (state === "ROOM_READY" || state === "JOIN_WINDOW" || state === "IN_GAME" ||
      state === "RESULT_PENDING" || state === "VERIFYING_SCREENSHOT" ||
      state === "PROVISIONAL_WIN" || state === "DISPUTE_WINDOW" || state === "FINALIZED") {
    return "credentials_ready";
  }
  if (state === "CANCELLED") return "expired";
  return "waiting_room";
}

export interface QuickMatch {
  id: string;
  gameType: string;
  modeId: string;
  playerIds: string[];
  players: PlayerProfile[];
  /** Legacy compat status — derived from currentState */
  status: "waiting_room" | "credentials_ready" | "expired";
  /** Full 13-state lifecycle state */
  currentState: MatchState;
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
  /** Which worker phone is handling this match */
  workerId?: number;
  /** Join window confirmation tracking — indexed by player userId */
  joinConfirmed: Record<string, boolean>;
  /** Creation failure attempt count */
  createAttempts: number;
  /**
   * Unix timestamp (ms) when the match entered RESULT_PENDING.
   * Used to enforce the server-side 80-second screenshot upload deadline.
   */
  resultPendingAt?: number;
  /**
   * userId of the player confirmed as winner by OCR.
   * Set when the match enters PROVISIONAL_WIN; persisted in memory so that
   * GET /quickmatch/match can expose role (winner vs. loser) for client
   * reconnect hydration without a DB query.
   */
  provisionalWinnerId?: string | null;
}

const MAX_HISTORY = 50;
const MATCH_TTL_MS = 15 * 60 * 1000;

let activeMatches: QuickMatch[] = [];
const matchHistory: QuickMatch[] = [];

function expireStale() {
  const now = Date.now();
  activeMatches = activeMatches.filter((m) => {
    // States that must never be evicted by the 15-minute TTL:
    // - ROOM_READY / JOIN_WINDOW / IN_GAME / RESULT_PENDING: active play
    // - VERIFYING_SCREENSHOT: OCR in flight (seconds to minutes)
    // - PROVISIONAL_WIN / DISPUTE_WINDOW: prize locked; dispute may be open (up to 10 min)
    //   A 10-minute dispute window can begin after ~15 min of match age, so these states
    //   MUST survive past the general 15-minute TTL.
    const IS_ACTIVE_STATE = new Set<MatchState>([
      "ROOM_READY", "JOIN_WINDOW", "IN_GAME",
      "RESULT_PENDING", "VERIFYING_SCREENSHOT", "PROVISIONAL_WIN", "DISPUTE_WINDOW",
    ]);
    if (IS_ACTIVE_STATE.has(m.currentState)) return true;

    if (m.currentState === "CANCELLED" || m.currentState === "FINALIZED") {
      // Keep briefly for SSE delivery, then expire
      const age = now - new Date(m.createdAt).getTime();
      if (age > 5 * 60 * 1000) {
        matchHistory.unshift({ ...m });
        if (matchHistory.length > MAX_HISTORY) matchHistory.pop();
        return false;
      }
      return true;
    }

    const age = now - new Date(m.createdAt).getTime();
    if (age > MATCH_TTL_MS) {
      m.currentState = "CANCELLED";
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
  if (match.currentState === "ROOM_READY" || match.currentState === "JOIN_WINDOW" ||
      match.currentState === "IN_GAME") {
    return "ready";
  }
  const age = Date.now() - new Date(match.createdAt).getTime();
  if (age < 4_000)  return "opponent_found";
  if (age < 12_000) return "creating_room";
  if (age < 22_000) return "booting_game";
  return "waiting_credentials";
}

// ─── State machine transition ─────────────────────────────────────────────────
/**
 * Advance a match from `from` → `to`.
 * Throws if the current state does not equal `from`.
 */
export function transitionState(matchId: string, from: MatchState, to: MatchState): QuickMatch {
  const match = activeMatches.find((m) => m.id === matchId);
  if (!match) throw new Error(`Match ${matchId} not found`);
  if (match.currentState !== from) {
    throw new Error(
      `State transition failed for match ${matchId}: expected ${from}, got ${match.currentState}`,
    );
  }
  match.currentState = to;
  match.status = toLegacyStatus(to);
  // Record the exact moment RESULT_PENDING begins so submit-screenshot can enforce
  // the server-side 80-second upload deadline.
  if (to === "RESULT_PENDING") {
    match.resultPendingAt = Date.now();
  }
  return match;
}

/**
 * Force-set match state (no source-state check). Use only for cancellation and
 * terminal states where the current state may vary.
 */
export function forceSetState(matchId: string, to: MatchState): QuickMatch | null {
  const match = activeMatches.find((m) => m.id === matchId);
  if (!match) return null;
  match.currentState = to;
  match.status = toLegacyStatus(to);
  // Record when RESULT_PENDING begins for server-side deadline enforcement.
  // Only set on FIRST entry — do NOT reset when the match re-enters RESULT_PENDING
  // after OCR rejection, so the total deadline is measured from the original entry.
  if (to === "RESULT_PENDING" && !match.resultPendingAt) {
    match.resultPendingAt = Date.now();
  }
  return match;
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
    currentState: "MATCHED",
    status: "waiting_room",
    createdAt: new Date().toISOString(),
    entryFee,
    prizeAmount,
    webhookFired: false,
    actionTaken: {},
    preSnapshots: {},
    preSnapshotAttempted: false,
    noShowHandled: false,
    joinConfirmed: {},
    createAttempts: 0,
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
        m.currentState !== "CANCELLED" &&
        m.currentState !== "FINALIZED",
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
  matchId?: string,
): QuickMatch | null {
  expireStale();
  // If matchId is provided, find that specific match; otherwise find the oldest CREATING_ROOM match
  const match = matchId
    ? activeMatches.find((m) => m.id === matchId)
    : activeMatches.find((m) => m.currentState === "CREATING_ROOM" || m.currentState === "WAITING_FOR_ROOM" || m.status === "waiting_room");
  if (!match) return null;
  match.credentials = {
    roomId,
    password,
    openInFfUrl: openInFfUrl ?? null,
    receivedAt: new Date().toISOString(),
  };
  match.currentState = "ROOM_READY";
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

export function setWorker(matchId: string, workerId: number): void {
  const match = activeMatches.find((m) => m.id === matchId);
  if (match) match.workerId = workerId;
}

export function recordJoinConfirmed(matchId: string, userId: string): void {
  const match = activeMatches.find((m) => m.id === matchId);
  if (match) match.joinConfirmed[userId] = true;
}

export function incrementCreateAttempts(matchId: string): number {
  const match = activeMatches.find((m) => m.id === matchId);
  if (!match) return 0;
  match.createAttempts = (match.createAttempts ?? 0) + 1;
  return match.createAttempts;
}

export function dismissMatch(matchId: string): void {
  const idx = activeMatches.findIndex((m) => m.id === matchId);
  if (idx !== -1) {
    activeMatches[idx].currentState = "CANCELLED";
    activeMatches[idx].status = "expired";
    matchHistory.unshift({ ...activeMatches[idx] });
    if (matchHistory.length > MAX_HISTORY) matchHistory.pop();
    activeMatches.splice(idx, 1);
  }
}

export function hasPendingRoomRequest(): boolean {
  expireStale();
  return activeMatches.some(
    (m) => m.currentState === "WAITING_FOR_ROOM" || m.currentState === "CREATING_ROOM",
  );
}

export function getActiveMatches(): QuickMatch[] {
  expireStale();
  return [...activeMatches];
}
