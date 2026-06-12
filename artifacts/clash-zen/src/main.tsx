import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App, { AppErrorBoundary } from "./App";
import "./index.css";
import { preloadAllPages } from "@/lib/preload-pages";
import { ALL_THEMES } from "@/lib/themes";

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="molten"
      enableSystem
      themes={ALL_THEMES.map(t => t.id)}
    >
      <App />
    </ThemeProvider>
  </AppErrorBoundary>
);

preloadAllPages();
