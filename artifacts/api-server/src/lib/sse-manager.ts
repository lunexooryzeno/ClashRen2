import type { Response } from "express";

// In-memory registry: userId → set of active SSE response streams
const clients = new Map<number, Set<Response>>();

// Per-slot-match admin SSE channels: matchId → set of active SSE response streams
const matchAdminClients = new Map<number, Set<Response>>();

/**
 * Register an SSE response stream for a user.
 * Called when a client connects to GET /api/users/sse.
 */
export function subscribe(userId: number, res: Response): void {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(res);
}

/**
 * Remove an SSE response stream for a user.
 * Called on request close / client disconnect.
 */
export function unsubscribe(userId: number, res: Response): void {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(userId);
}

/**
 * Push a named SSE event to every active connection for a user.
 * Safe to call even when the user has no active SSE connections.
 */
export function pushToUser(userId: number, event: string, data: unknown): void {
  const set = clients.get(userId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of [...set]) {
    try {
      res.write(payload);
    } catch {
      // Client already disconnected — will be cleaned up on the 'close' event
    }
  }
}

/** How many active SSE connections exist for a user (useful for debugging). */
export function connectionCount(userId: number): number {
  return clients.get(userId)?.size ?? 0;
}

// ── Admin support-chat SSE (admin watching a specific user's chat) ────────────

const adminChatClients = new Map<number, Set<Response>>();

/** Register an admin SSE connection for a specific user's support chat. */
export function subscribeAdminChat(userId: number, res: Response): void {
  if (!adminChatClients.has(userId)) adminChatClients.set(userId, new Set());
  adminChatClients.get(userId)!.add(res);
}

/** Remove an admin SSE connection for a specific user's support chat. */
export function unsubscribeAdminChat(userId: number, res: Response): void {
  const set = adminChatClients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) adminChatClients.delete(userId);
}

/** Push a named SSE event to all admins watching a specific user's support chat. */
export function pushToAdminChat(userId: number, event: string, data: unknown): void {
  const set = adminChatClients.get(userId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of [...set]) {
    try { res.write(payload); } catch { /* disconnected */ }
  }
}

// ── Per-match admin SSE ───────────────────────────────────────────────────────

/** Register an admin SSE connection for a specific slot match. */
export function subscribeMatchAdmin(matchId: number, res: Response): void {
  if (!matchAdminClients.has(matchId)) matchAdminClients.set(matchId, new Set());
  matchAdminClients.get(matchId)!.add(res);
}

/** Remove an admin SSE connection for a specific slot match. */
export function unsubscribeMatchAdmin(matchId: number, res: Response): void {
  const set = matchAdminClients.get(matchId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) matchAdminClients.delete(matchId);
}

/** Push a named SSE event to all admins watching a specific slot match. */
export function pushToMatchAdmins(matchId: number, event: string, data: unknown): void {
  const set = matchAdminClients.get(matchId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of [...set]) {
    try {
      res.write(payload);
    } catch {
      // Disconnected
    }
  }
}
