import { apiFetch, apiPatch, apiDelete } from "./api";

export type NotifType = "tournament" | "result" | "squad_request" | "squad_accepted" | "system" | "wallet" | "security";

export interface AppNotification {
  id: number;
  type: NotifType;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  return apiFetch<AppNotification[]>("/notifications");
}

export async function apiMarkAllRead(): Promise<void> {
  await apiPatch("/notifications/read-all");
}

export async function apiMarkRead(id: number): Promise<void> {
  await apiPatch(`/notifications/${id}/read`);
}

export async function apiDeleteNotification(id: number): Promise<void> {
  await apiDelete(`/notifications/${id}`);
}

export function formatNotifTime(iso: string): string {
  try {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 172800) return "Yesterday";
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch { return ""; }
}

export function groupNotifications(list: AppNotification[]) {
  const today: AppNotification[] = [];
  const earlier: AppNotification[] = [];
  const now = Date.now();
  list.forEach(n => {
    const diff = (now - new Date(n.createdAt).getTime()) / 1000;
    if (diff < 86400) today.push(n);
    else earlier.push(n);
  });
  return { today, earlier };
}

export async function getUnreadCount(): Promise<number> {
  try {
    const items = await fetchNotifications();
    return items.filter(n => !n.read).length;
  } catch {
    return 0;
  }
}
