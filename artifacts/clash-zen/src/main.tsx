import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App, { AppErrorBoundary } from "./App";
import "./index.css";
import { preloadAllPages } from "@/lib/preload-pages";
import { THEME_CATALOG } from "@/lib/themes";

// Register the service worker for push notifications + offline caching.
// The SW's own activate handler prunes stale caches, so we don't need
// to unregister it on every load.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

const ALL_THEME_IDS = THEME_CATALOG.map(t => t.id);

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="molten"
      enableSystem
      themes={ALL_THEME_IDS}
    >
      <App />
    </ThemeProvider>
  </AppErrorBoundary>
);

preloadAllPages();
