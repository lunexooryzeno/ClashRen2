import { useEffect, useState } from "react";
import { WifiOff, Wifi, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "online" | "offline" | "reconnected";

export function OfflineBanner() {
  const [status, setStatus] = useState<Status>(navigator.onLine ? "online" : "offline");

  useEffect(() => {
    let reconnectedTimer: ReturnType<typeof setTimeout>;

    function handleOffline() {
      clearTimeout(reconnectedTimer);
      setStatus("offline");
    }

    function handleOnline() {
      clearTimeout(reconnectedTimer);
      setStatus("reconnected");
      reconnectedTimer = setTimeout(() => setStatus("online"), 2400);
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      clearTimeout(reconnectedTimer);
    };
  }, []);

  if (status === "online") return null;

  /* ── Slim top banner (offline) ─────────────────────────────────────────── */
  if (status === "offline") {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-[9999] flex flex-col"
        style={{ animation: "offline-slide-down 0.3s ease-out both" }}
        aria-live="assertive"
        aria-atomic="true"
      >
        {/* Slim status bar */}
        <div
          className="flex items-center gap-2.5 px-4 py-2.5"
          style={{
            background: "rgba(15,10,10,0.97)",
            borderBottom: "1px solid rgba(239,68,68,0.25)",
            backdropFilter: "blur(16px)",
          }}
        >
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <WifiOff className="w-3.5 h-3.5 text-red-400 shrink-0" strokeWidth={2} />
            <span className="text-xs font-semibold text-red-400 shrink-0">Offline Mode</span>
            <span className="text-xs text-zinc-500 truncate">— some features may be unavailable</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-zinc-500">Reconnecting</span>
            <span className="inline-flex gap-0.5">
              {[0, 150, 300].map(d => (
                <span
                  key={d}
                  className="w-1 h-1 rounded-full bg-zinc-500"
                  style={{ animation: `offline-pulse-dot 1.2s ease-in-out infinite`, animationDelay: `${d}ms` }}
                />
              ))}
            </span>
          </div>
        </div>

        {/* Content dim overlay — doesn't block, just signals degraded state */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            top: 0,
            background: "rgba(0,0,0,0.18)",
            zIndex: -1,
          }}
        />
      </div>
    );
  }

  /* ── Back-online flash ─────────────────────────────────────────────────── */
  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999]"
      style={{ animation: "offline-slide-down 0.25s ease-out both" }}
      aria-live="polite"
    >
      <div
        className="flex items-center gap-2.5 px-4 py-2.5"
        style={{
          background: "rgba(10,15,10,0.97)",
          borderBottom: "1px solid rgba(52,211,153,0.25)",
          backdropFilter: "blur(16px)",
        }}
      >
        <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" strokeWidth={2} />
        <span className="text-xs font-semibold text-emerald-400">Back Online</span>
        <span className="text-xs text-zinc-500">You're connected again</span>
      </div>
    </div>
  );
}
