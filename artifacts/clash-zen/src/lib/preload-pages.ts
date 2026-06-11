const pages = [
  () => import("@/pages/home"),
  () => import("@/pages/events"),
  () => import("@/pages/event-details"),
  () => import("@/pages/leaderboard"),
  () => import("@/pages/profile"),
  () => import("@/pages/wallet"),
  () => import("@/pages/top-up"),
  () => import("@/pages/top-up-pay"),
  () => import("@/pages/wallet-withdraw"),
  () => import("@/pages/wallet-all"),
  () => import("@/pages/notifications"),
  () => import("@/pages/notifications-inbox"),
  () => import("@/pages/history"),
  () => import("@/pages/history-matches"),
  () => import("@/pages/my-match-detail"),
  () => import("@/pages/mode-detail"),
  () => import("@/pages/mode-tournaments"),
  () => import("@/pages/knockout-mode"),
  () => import("@/pages/knockout-types"),
  () => import("@/pages/squad-create"),
  () => import("@/pages/squad-join"),
  () => import("@/pages/squad-friends"),
  () => import("@/pages/profile-qr"),
  () => import("@/pages/profile-security"),
  () => import("@/pages/profile-theme"),
  () => import("@/pages/chat"),
  () => import("@/pages/support"),
  () => import("@/pages/account-suspended"),
  () => import("@/pages/landing"),
  () => import("@/pages/get-started"),
  () => import("@/pages/setup-profile"),
  () => import("@/pages/onboarding"),
  () => import("@/pages/not-found"),
];

function isSlowConnection(): boolean {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  };
  const conn = nav.connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  return conn.effectiveType === "slow-2g" || conn.effectiveType === "2g";
}

export function preloadAllPages() {
  // Skip preloading entirely on very slow or data-saver connections.
  // Pages are still lazy-loaded on demand — this just skips the background warm-up.
  if (isSlowConnection()) return;

  const run = typeof requestIdleCallback !== "undefined"
    ? (cb: () => void) => requestIdleCallback(cb, { timeout: 5000 })
    : (cb: () => void) => setTimeout(cb, 3000);

  run(() => {
    // Spread loads further apart (100 ms each) so they don't compete with
    // the critical auth/API requests that fire right after the app mounts.
    pages.forEach((load, i) => {
      setTimeout(() => load().catch(() => {}), i * 100);
    });
  });
}
