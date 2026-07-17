interface SearchEntry {
  userId: string;
  gameType: string;
  modeId: string;
  joinedAt: number;
}

const SEARCH_TTL_MS = 5 * 60 * 1000;

const queue = new Map<string, SearchEntry>();

function key(userId: string, gameType: string, modeId: string): string {
  return `${userId}:${gameType}:${modeId}`;
}

export function joinQueue(userId: string, gameType: string, modeId: string): void {
  queue.set(key(userId, gameType, modeId), {
    userId,
    gameType,
    modeId,
    joinedAt: Date.now(),
  });
}

export function leaveQueue(userId: string, gameType: string, modeId: string): void {
  queue.delete(key(userId, gameType, modeId));
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

// Pull the first N eligible players out of the queue and return their IDs.
// Returns null if not enough players are waiting.
export function tryMatch(
  gameType: string,
  modeId: string,
): string[] | null {
  const required = MODE_REQUIRED[modeId] ?? 2;
  const now = Date.now();
  const eligible: SearchEntry[] = [];

  for (const [k, entry] of queue) {
    if (entry.gameType !== gameType || entry.modeId !== modeId) continue;
    if (now - entry.joinedAt > SEARCH_TTL_MS) {
      queue.delete(k);
      continue;
    }
    eligible.push(entry);
    if (eligible.length === required) break;
  }

  if (eligible.length < required) return null;

  // Remove matched players from the queue
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
