import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig(async ({ command }) => {
  // PORT is only needed by the dev/preview server — not during `vite build`.
  let port: number | undefined;
  if (command === "serve") {
    const rawPort = process.env.PORT;
    if (!rawPort) {
      throw new Error("PORT environment variable is required but was not provided.");
    }
    port = Number(rawPort);
    if (Number.isNaN(port) || port <= 0) {
      throw new Error(`Invalid PORT value: "${rawPort}"`);
    }
  }

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      ...(command === "serve" && process.env.REPL_ID !== undefined
        ? [
            runtimeErrorOverlay({
              filter(err) {
                if (err.name === "AbortError") return false;
                if (err.message === "signal is aborted without reason") return false;
                if (err.message === "The user aborted a request.") return false;
                if (err.message === "Failed to fetch") return false;
                if (err.message === "Load failed") return false;
                if (err.message === "NetworkError when attempting to fetch resource.") return false;
                if (err.message?.includes("reading 'frame'")) return false;
                if (err.message?.includes("Cannot read properties of undefined")) return false;
                return true;
              },
            }),
          ]
        : []),
      ...(command === "serve" && process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined
        ? [
            await import("@replit/vite-plugin-cartographer").then((m) =>
              m.cartographer({ root: path.resolve(import.meta.dirname, "..") })
            ),
            await import("@replit/vite-plugin-dev-banner").then((m) => m.devBanner()),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
      cssCodeSplit: true,
      target: ["esnext"],
      assetsInlineLimit: 4096,
      chunkSizeWarningLimit: 2000,
      // Intentionally NO manualChunks — manual splitting caused a runtime
      // "Cannot read properties of undefined (reading 'createContext')" error
      // because libraries in vendor-misc referenced React before vendor-react
      // had bound its exports. Let Vite/Rollup handle chunking automatically.
    },
    server: {
      port,
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: { strict: true },
      proxy: {
        "/api": {
          target: "http://localhost:8080",
          changeOrigin: false,
          secure: false,
        },
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
