export interface SearchEntry {
  userId: string;
  gameType: string;
  modeId: string;
  joinedAt: number;
  entryFee: number;
}

const SEARCH_TTL_MS = 5 * 60 * 1000;

const queue = new Map<string, SearchEntry>();

function key(userId: string, gameType: string, modeId: string): string {
  return `${userId}:${gameType}:${modeId}`;
}

export function joinQueue(userId: string, gameType: string, modeId: string, entryFee = 0): void {
  queue.set(key(userId, gameType, modeId), {
    userId,
    gameType,
    modeId,
    joinedAt: Date.now(),
    entryFee,
  });
}

export function leaveQueue(userId: string, gameType: string, modeId: string): void {
  queue.delete(key(userId, gameType, modeId));
}

export function getQueueEntryFee(userId: string, gameType: string, modeId: string): number {
  const entry = queue.get(key(userId, gameType, modeId));
  return entry?.entryFee ?? 0;
}

export function isInQueue(userId: string, gameType: string, modeId: string): boolean {
  const entry = queue.get(key(userId, gameType, modeId));
  if (!entry) return false;
  if (Date.now() - entry.joinedAt > SEARCH_TTL_MS) {
    queue.delete(key(userId, gameType, modeId));
    return false;
  }
  return true;
}

// Returns all expired entries that should be refunded, then removes them
export function sweepExpiredEntries(): SearchEntry[] {
  const now = Date.now();
  const expired: SearchEntry[] = [];
  for (const [k, entry] of queue) {
    if (now - entry.joinedAt > SEARCH_TTL_MS) {
      expired.push({ ...entry });
      queue.delete(k);
    }
  }
  return expired;
}

const MODE_REQUIRED: Record<string, number> = {
  duel: 2,
  healing: 2,
  knife: 2,
  "clash-squad": 8,
  "solo-drop": 2,
  "duo-rush": 4,
  "squad-wipe": 8,
  "zone-control": 2,
};

// Only matches players with the same entryFee to prevent economic mismatches
export function tryMatch(
  gameType: string,
  modeId: string,
  entryFee: number,
): string[] | null {
  const required = MODE_REQUIRED[modeId] ?? 2;
  const now = Date.now();
  const eligible: SearchEntry[] = [];

  for (const [k, entry] of queue) {
    if (entry.gameType !== gameType || entry.modeId !== modeId) continue;
    if (entry.entryFee !== entryFee) continue;
    if (now - entry.joinedAt > SEARCH_TTL_MS) {
      queue.delete(k);
      continue;
    }
    eligible.push(entry);
    if (eligible.length === required) break;
  }

  if (eligible.length < required) return null;

  for (const entry of eligible) {
    queue.delete(key(entry.userId, gameType, modeId));
  }

  return eligible.map((e) => e.userId);
}

export function getQueueStats(): {
  cs: { total: number; modes: Record<string, number> };
  br: { total: number; modes: Record<string, number> };
} {
  const now = Date.now();

  const cs: Record<string, number> = {
    duel: 0,
    healing: 0,
    "clash-squad": 0,
    knife: 0,
  };
  const br: Record<string, number> = {
    "solo-drop": 0,
    "duo-rush": 0,
    "squad-wipe": 0,
    "zone-control": 0,
  };

  for (const [k, entry] of queue) {
    if (now - entry.joinedAt > SEARCH_TTL_MS) {
      queue.delete(k);
      continue;
    }
    if (entry.gameType === "cs" && entry.modeId in cs) {
      cs[entry.modeId]++;
    } else if (entry.gameType === "br" && entry.modeId in br) {
      br[entry.modeId]++;
    }
  }

  return {
    cs: {
      total: Object.values(cs).reduce((a, b) => a + b, 0),
      modes: cs,
    },
    br: {
      total: Object.values(br).reduce((a, b) => a + b, 0),
      modes: br,
    },
  };
}
