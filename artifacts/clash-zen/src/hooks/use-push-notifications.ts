import { useState, useEffect, useCallback } from "react";
import { apiBase } from "@/lib/api";

type PushState = "unsupported" | "denied" | "default" | "subscribed" | "loading";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function getVapidKey(): Promise<string | null> {
  try {
    const res = await fetch(`${apiBase}/push/vapid-key`, { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.key ?? null;
  } catch {
    return null;
  }
}

async function subscribeWithKey(registration: ServiceWorkerRegistration, vapidKey: string) {
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });
}

async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  await fetch(`${apiBase}/push/subscribe`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      p256dh: (json.keys as Record<string, string>)?.p256dh,
      auth: (json.keys as Record<string, string>)?.auth,
    }),
  });
}

async function removeSubscription(sub: PushSubscription) {
  await fetch(`${apiBase}/push/subscribe`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
}

// Silently refresh the push subscription on app load.
// If the browser has a live subscription, re-save it to the server (keeps DB fresh).
// If permission is granted but no browser subscription exists, silently re-subscribe.
async function refreshSubscription(registration: ServiceWorkerRegistration): Promise<boolean> {
  try {
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      // Re-save the current subscription so the server always has the latest endpoint
      await saveSubscription(existing);
      return true;
    }

    // Permission granted but no browser subscription — try to re-subscribe silently
    if (Notification.permission === "granted") {
      const vapidKey = await getVapidKey();
      if (!vapidKey) return false;
      const sub = await subscribeWithKey(registration, vapidKey);
      await saveSubscription(sub);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>("loading");
  const supported =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  useEffect(() => {
    if (!supported) { setState("unsupported"); return; }
    if (Notification.permission === "denied") { setState("denied"); return; }

    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();

        if (existing) {
          // Always re-save on app open so the server has the current subscription
          saveSubscription(existing).catch(() => {});
          if (!cancelled) setState("subscribed");
        } else if (Notification.permission === "granted") {
          // Permission already granted but subscription is gone — silently recover
          const recovered = await refreshSubscription(reg);
          if (!cancelled) setState(recovered ? "subscribed" : "default");
        } else {
          if (!cancelled) setState("default");
        }
      } catch {
        if (!cancelled) setState("default");
      }
    })();
    return () => { cancelled = true; };
  }, [supported]);

  const enable = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    setState("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState("denied"); return false; }

      const vapidKey = await getVapidKey();
      if (!vapidKey) { setState("default"); return false; }

      const reg = await navigator.serviceWorker.ready;
      const sub = await subscribeWithKey(reg, vapidKey);
      await saveSubscription(sub);
      setState("subscribed");
      return true;
    } catch {
      setState("default");
      return false;
    }
  }, [supported]);

  const disable = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await removeSubscription(sub);
      setState("default");
      return true;
    } catch {
      setState("subscribed");
      return false;
    }
  }, [supported]);

  return { state, enable, disable, supported };
}
