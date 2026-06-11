import { useEffect, useRef, useCallback } from "react";

type SSEDataHandler = (data: unknown) => void;

interface UseSessionSSEOptions {
  enabled: boolean;
  onForceLogout: SSEDataHandler;
  onSuspended: SSEDataHandler;
  onSessionSuperseded: SSEDataHandler;
}

const RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 60_000;

/**
 * Connects to the server-sent events stream at /api/users/sse.
 * Handles real-time admin actions (force logout, suspension, session invalidation).
 * Auto-reconnects on connection loss with backoff.
 * Only active when `enabled` is true (i.e. user is authenticated).
 */
export function useSessionSSE({
  enabled,
  onForceLogout,
  onSuspended,
  onSessionSuperseded,
}: UseSessionSSEOptions): void {
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_DELAY_MS);
  const mountedRef = useRef(false);

  // Keep handler refs stable so the connect closure doesn't go stale
  const onForceLogoutRef = useRef(onForceLogout);
  const onSuspendedRef = useRef(onSuspended);
  const onSessionSupersededRef = useRef(onSessionSuperseded);
  onForceLogoutRef.current = onForceLogout;
  onSuspendedRef.current = onSuspended;
  onSessionSupersededRef.current = onSessionSuperseded;

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    cleanup();

    const es = new EventSource("/api/users/sse", { withCredentials: true });
    esRef.current = es;

    es.addEventListener("connected", () => {
      // Reset backoff on successful connection
      reconnectDelayRef.current = RECONNECT_DELAY_MS;
    });

    es.addEventListener("force_logout", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onForceLogoutRef.current(data);
      } catch { /* ignore parse errors */ }
    });

    es.addEventListener("suspended", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onSuspendedRef.current(data);
      } catch { /* ignore */ }
    });

    es.addEventListener("session_superseded", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onSessionSupersededRef.current(data);
      } catch { /* ignore */ }
    });

    es.addEventListener("error", () => {
      es.close();
      esRef.current = null;
      if (!mountedRef.current) return;

      // Exponential backoff reconnect
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 1.5, MAX_RECONNECT_DELAY_MS);
      reconnectTimerRef.current = setTimeout(connect, delay);
    });
  }, [cleanup]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      connect();
    }
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [enabled, connect, cleanup]);
}
