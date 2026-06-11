import { useState, useEffect, useCallback } from "react";

export type PwaState = "loading" | "available" | "installing" | "installed" | "unavailable";
export type PwaPlatform = "ios" | "android" | "desktop" | "other";

export function detectPlatform(): PwaPlatform {
  if (typeof window === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  if (/windows|macintosh|linux/i.test(ua)) return "desktop";
  return "other";
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

let _deferred: BeforeInstallPromptEvent | null = null;

const INSTALLED_KEY = "cz_pwa_installed_v1";

function markInstalled() {
  try { localStorage.setItem(INSTALLED_KEY, "1"); } catch {}
}

function clearInstalled() {
  try { localStorage.removeItem(INSTALLED_KEY); } catch {}
}

// Synchronous check — runs before first render to avoid flash.
// Only trusts real display-mode signals; never trusts a stale localStorage flag
// (which persists after the user uninstalls the PWA and would hide the button forever).
function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) { markInstalled(); return true; }
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) { markInstalled(); return true; }
  return false;
}

function getInitialState(): PwaState {
  if (detectStandalone()) return "installed";
  if (_deferred) return "available";
  return "loading";
}

export function usePwaInstall() {
  const [state, setState] = useState<PwaState>(getInitialState);

  useEffect(() => {
    if (detectStandalone()) {
      setState("installed");
      return;
    }

    if (_deferred) {
      setState("available");
      return;
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      _deferred = e as BeforeInstallPromptEvent;
      setState("available");
    };

    const onAppInstalled = () => {
      _deferred = null;
      markInstalled();
      setState("installed");
    };

    // display-mode change (user adds to home screen mid-session)
    const mqListener = window.matchMedia("(display-mode: standalone)");
    const onDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        _deferred = null;
        markInstalled();
        setState("installed");
      }
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);
    mqListener.addEventListener("change", onDisplayModeChange);

    // Use getInstalledRelatedApps() (Chrome 84+) to detect existing installs
    // even when running in the browser (non-standalone). This is the only reliable
    // cross-session detection when the user installed via the browser's own UI.
    let installedCheck: ReturnType<typeof setTimeout> | null = null;
    if ("getInstalledRelatedApps" in navigator) {
      (navigator as Navigator & { getInstalledRelatedApps(): Promise<unknown[]> })
        .getInstalledRelatedApps()
        .then((apps) => {
          if (apps.length > 0) {
            markInstalled();
            setState("installed");
          } else {
            // App not found as installed — clear any stale localStorage flag
            clearInstalled();
          }
        })
        .catch(() => {});
    }

    // Give the browser 2s to fire beforeinstallprompt; if not fired → unavailable
    const timer = setTimeout(() => {
      setState((prev) => (prev === "loading" ? "unavailable" : prev));
    }, 2000);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
      mqListener.removeEventListener("change", onDisplayModeChange);
      clearTimeout(timer);
      if (installedCheck) clearTimeout(installedCheck);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    if (!_deferred) return false;
    setState("installing");
    try {
      await _deferred.prompt();
      const { outcome } = await _deferred.userChoice;
      if (outcome === "accepted") {
        _deferred = null;
        markInstalled();
        setState("installed");
        return true;
      } else {
        setState("available");
        return false;
      }
    } catch {
      setState("available");
      return false;
    }
  }, []);

  const platform = detectPlatform();

  return { state, install, platform };
}
