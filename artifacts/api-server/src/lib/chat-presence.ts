/**
 * In-memory admin presence for support chats.
 * "Online" = admin has an open chat-SSE connection for that userId.
 * Last-active timestamp is set when they disconnect.
 */

const lastActiveTimes = new Map<number, Date>(); // userId → last seen
const onlineSet = new Set<number>();              // userId → currently viewing

export function markAdminOnline(userId: number): void {
  onlineSet.add(userId);
}

export function markAdminOffline(userId: number): void {
  onlineSet.delete(userId);
  lastActiveTimes.set(userId, new Date());
}

export function getAdminPresence(userId: number): { online: boolean; lastActive: Date | null } {
  return {
    online: onlineSet.has(userId),
    lastActive: lastActiveTimes.get(userId) ?? null,
  };
}
