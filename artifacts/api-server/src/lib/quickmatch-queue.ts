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
