import { createContext, useContext, ReactNode, useEffect, useRef } from "react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@workspace/api-client-react";
import { collectFingerprint } from "./fingerprint";
import { useSessionSSE } from "@/hooks/use-session-sse";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  invalidateUser: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const HEARTBEAT_INTERVAL = 60 * 1000;

export const SESSION_SUPERSEDED_KEY = "czs:session_superseded";

interface SuspendedPayload {
  suspended?: boolean;
  status?: "blocked" | "deleted";
  reason?: string | null;
  blockedUntil?: string | null;
}

/**
 * Hard redirect to the account-suspended page.
 * Clears localStorage cache so the reload starts fresh.
 * Uses a query-param change to force a real full-page reload
 * (hash-only changes are in-page navigations in all browsers).
 */
function redirectToSuspended(payload: SuspendedPayload) {
  if (window.location.hash.includes("account-suspended")) return;

  try {
    sessionStorage.setItem("czAccountSuspended", JSON.stringify({
      suspended: true,
      status: payload.status ?? "blocked",
      reason: payload.reason ?? null,
      blockedUntil: payload.blockedUntil ?? null,
    }));
  } catch { /* ignore */ }

  try { localStorage.removeItem("cz:qcache"); } catch { /* ignore */ }

  window.location.href = `/?suspended=1#/account-suspended`;
}

async function sendHeartbeat(
  onSuperseded?: () => void,
  onSuspended?: (p: SuspendedPayload) => void,
) {
  try {
    let body: Record<string, unknown> = {};
    try { body = await collectFingerprint(); } catch { /* optional */ }

    const res = await fetch("/api/users/heartbeat", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.status === 403) {
      const data = await res.json().catch(() => ({})) as SuspendedPayload;
      if (data?.suspended && onSuspended) {
        onSuspended(data);
      }
    } else if (res.status === 401) {
      const data = await res.json().catch(() => ({}));
      if (data?.code === "SESSION_SUPERSEDED" && onSuperseded) {
        sessionStorage.setItem(SESSION_SUPERSEDED_KEY, "1");
        onSuperseded();
      }
    }
  } catch { /* silent fail */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const redirectToSuspendedRef = useRef(redirectToSuspended);

  const handleSuperseded = () => {
    sessionStorage.setItem(SESSION_SUPERSEDED_KEY, "1");
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    queryClient.clear();
    try { localStorage.removeItem("cz:qcache"); } catch { /* ignore */ }
    try { localStorage.removeItem("clash_ren_token"); } catch { /* ignore */ }
  };
  const handleSupersededRef = useRef(handleSuperseded);
  handleSupersededRef.current = handleSuperseded;

  const handleForceLogout = () => {
    sessionStorage.setItem("czForceLogout", "1");
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    queryClient.clear();
    try { localStorage.removeItem("cz:qcache"); } catch { /* ignore */ }
    try { localStorage.removeItem("clash_ren_token"); } catch { /* ignore */ }
    window.location.href = "/?fl=1#/get-started";
  };
  const handleForceLogoutRef = useRef(handleForceLogout);
  handleForceLogoutRef.current = handleForceLogout;

  // Suspension check is handled by the React Query error effect below.
  // useGetMe already runs with staleTime: 0 and refetchOnMount: true, so it
  // always hits the network on mount — no need for a second duplicate raw fetch.

  const { data: user, isLoading, error } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      staleTime: 0,
      refetchOnMount: true,
      throwOnError: false,
    },
  });

  // ── Clear stale cache when a different user logs in ───────────────────────
  // Prevents User B from seeing User A's cached `isJoined` / wallet data
  // when both use the same browser without an explicit logout.
  const prevUserIdRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const currentId = user?.id;
    if (
      currentId !== undefined &&
      prevUserIdRef.current !== undefined &&
      prevUserIdRef.current !== currentId
    ) {
      queryClient.clear();
      try { localStorage.removeItem("cz:qcache"); } catch { /* ignore */ }
    }
    prevUserIdRef.current = currentId;
  }, [user?.id, queryClient]);

  // SECONDARY suspension check: watch React Query error state.
  useEffect(() => {
    if (!error) return;
    const status = (error as { status?: number })?.status;
    if (status === 403) {
      const data = (error as { data?: SuspendedPayload })?.data;
      if (data?.suspended) {
        redirectToSuspendedRef.current(data);
      } else {
        fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
        queryClient.clear();
        try { localStorage.removeItem("cz:qcache"); } catch { /* ignore */ }
      }
    } else if (status === 401) {
      const body = (error as { data?: { code?: string } })?.data;
      if (body?.code === "SESSION_SUPERSEDED") {
        handleSupersededRef.current();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      return;
    }

    const beat = () => sendHeartbeat(
      () => handleSupersededRef.current(),
      (p) => redirectToSuspendedRef.current(p),
    ).catch(() => {});

    // Delay the first heartbeat by 5 s so it doesn't race with the critical
    // auth/API requests that fire immediately after the app mounts.
    const firstBeatTimer = setTimeout(beat, 5000);
    heartbeatRef.current = setInterval(beat, HEARTBEAT_INTERVAL);

    const handleVisibility = () => { if (!document.hidden) beat(); };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearTimeout(firstBeatTimer);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user?.id]);

  // Real-time session events via Server-Sent Events.
  // Handles instant force-logout, suspension, and session-superseded without waiting for heartbeat.
  useSessionSSE({
    enabled: !!user,
    onForceLogout: () => handleForceLogoutRef.current(),
    onSuspended: (data) => redirectToSuspendedRef.current(data as SuspendedPayload),
    onSessionSuperseded: () => handleSupersededRef.current(),
  });

  const invalidateUser = () => {
    // Invalidate marks data stale; refetchQueries forces an immediate network
    // request so the auth state updates right away (critical after OTP login).
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    queryClient.refetchQueries({ queryKey: getGetMeQueryKey() });
  };

  const logout = () => {
    sessionStorage.removeItem("clash-ren:post-welcome-redirect");
    queryClient.clear();
    try { localStorage.removeItem("cz:qcache"); } catch { /* ignore */ }
    try { localStorage.removeItem("clash_ren_token"); } catch { /* ignore */ }
  };

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        isAuthenticated: !!user,
        invalidateUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
