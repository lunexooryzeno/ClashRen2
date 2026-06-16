import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App, { AppErrorBoundary } from "./App";
import "./index.css";
import { preloadAllPages } from "@/lib/preload-pages";
import { THEME_CATALOG } from "@/lib/themes";

// Service worker is intentionally NOT registered here. The inline HTML script
// actively unregisters any old SW + clears caches on every page load so users
// can never get trapped on a stale cached build.

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
