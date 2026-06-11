import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";

const LS_KEY = "cz:push-prompted";
const DELAY_MS = 4000; // wait 4 s after login before showing

export function PushPrompt() {
  const { state, enable } = usePushNotifications();
  const [visible, setVisible] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    // Only show when permission hasn't been decided yet and we haven't asked before
    if (state !== "default") return;
    if (localStorage.getItem(LS_KEY)) return;

    const t = setTimeout(() => setVisible(true), DELAY_MS);
    return () => clearTimeout(t);
  }, [state]);

  if (!visible) return null;

  function dismiss() {
    localStorage.setItem(LS_KEY, "dismissed");
    setVisible(false);
  }

  async function handleEnable() {
    localStorage.setItem(LS_KEY, "asked");
    setAsking(true);
    await enable();
    setVisible(false);
  }

  return (
    <div
      className="fixed bottom-24 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300"
      style={{ maxWidth: 420, margin: "0 auto" }}
    >
      <div
        className="rounded-2xl border border-white/12 p-4 flex items-start gap-3"
        style={{ background: "rgba(18,14,36,0.97)", backdropFilter: "blur(24px)" }}
      >
        <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
          <Bell className="w-5 h-5 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white leading-tight">
            Stay ahead of the game
          </p>
          <p className="text-[11px] text-white/55 mt-0.5 leading-snug">
            Get notified about tournament starts, match results, and wallet credits — even when the app is closed.
          </p>

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleEnable}
              disabled={asking}
              className="flex-1 h-8 rounded-lg bg-primary text-white text-[12px] font-semibold transition-all active:scale-95 disabled:opacity-60"
            >
              {asking ? "Enabling…" : "Allow Notifications"}
            </button>
            <button
              onClick={dismiss}
              className="h-8 px-3 rounded-lg bg-white/8 border border-white/10 text-white/60 text-[12px] transition-all active:scale-95"
            >
              Not now
            </button>
          </div>
        </div>

        <button
          onClick={dismiss}
          className="shrink-0 w-6 h-6 rounded-full bg-white/8 flex items-center justify-center -mt-0.5 -mr-0.5"
        >
          <X className="w-3 h-3 text-white/50" />
        </button>
      </div>
    </div>
  );
}
