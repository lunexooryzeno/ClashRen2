import webpush from "web-push";
import { db } from "@workspace/db";
import { pushSubscriptionsTable, notificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

webpush.setVapidDetails(
  process.env.VAPID_CONTACT ?? "mailto:noreply@clashzen.app",
  process.env.VAPID_PUBLIC_KEY ?? "",
  process.env.VAPID_PRIVATE_KEY ?? "",
);

export interface PushPayload {
  title: string;
  body: string;
  type: string;
  icon?: string;
  badge?: string;
  url?: string;
}

// Send a push notification to all subscriptions for a user
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));

  if (subs.length === 0) return;

  const body = JSON.stringify({
    ...payload,
    icon: payload.icon ?? "/icons/icon-192.png",
    badge: payload.badge ?? "/icons/icon-192.png",
  });

  const staleEndpoints: number[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
      } catch (err: any) {
        // 410 Gone / 404 = expired subscription — clean it up
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          staleEndpoints.push(sub.id);
          console.warn(`[push] stale subscription #${sub.id} for user ${userId} — removed`);
        } else {
          console.error(`[push] failed for user ${userId} sub #${sub.id}:`, err?.statusCode, err?.body ?? err?.message);
        }
      }
    }),
  );

  if (staleEndpoints.length > 0) {
    await Promise.allSettled(
      staleEndpoints.map((id) =>
        db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, id)),
      ),
    );
  }
}

// Broadcast a push notification to every stored subscription
export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; failed: number }> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return { sent: 0, failed: 0 };

  const allSubs = await db.select().from(pushSubscriptionsTable);
  if (allSubs.length === 0) return { sent: 0, failed: 0 };

  const body = JSON.stringify({
    ...payload,
    icon: payload.icon ?? "/icons/icon-192.png",
    badge: payload.badge ?? "/icons/icon-192.png",
  });

  let sent = 0;
  let failed = 0;
  const staleIds: number[] = [];

  await Promise.allSettled(
    allSubs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
        sent++;
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          staleIds.push(sub.id);
          console.warn(`[push] stale subscription #${sub.id} — removed`);
        } else {
          console.error(`[push] broadcast failed for sub #${sub.id}:`, err?.statusCode, err?.body ?? err?.message);
        }
        failed++;
      }
    }),
  );

  if (staleIds.length > 0) {
    await Promise.allSettled(
      staleIds.map((id) => db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, id))),
    );
  }

  return { sent, failed };
}

// Insert a DB notification AND fire push simultaneously
export async function notify(
  userId: number,
  opts: { type: string; title: string; body: string; url?: string },
) {
  const [row] = await db
    .insert(notificationsTable)
    .values({ userId, type: opts.type, title: opts.title, body: opts.body })
    .returning();

  // Fire push in background — don't await so the request isn't slowed
  sendPushToUser(userId, {
    title: opts.title,
    body: opts.body,
    type: opts.type,
    url: opts.url ?? "/#/notifications",
  }).catch((err) => console.error("[push] notify background error:", err));

  return row;
}
