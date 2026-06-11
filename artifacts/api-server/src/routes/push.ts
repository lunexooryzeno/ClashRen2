import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { pushSubscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

// Return the VAPID public key so the browser can subscribe
router.get("/push/vapid-key", (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) { res.status(503).json({ error: "Push not configured" }); return; }
  res.json({ key });
});

// Save a new push subscription for the logged-in user
router.post("/push/subscribe", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const { endpoint, p256dh, auth } = req.body as {
    endpoint?: string; p256dh?: string; auth?: string;
  };

  if (!endpoint || !p256dh || !auth) {
    res.status(400).json({ error: "endpoint, p256dh, auth are required" });
    return;
  }

  // Upsert: if the endpoint already exists for this user just return OK
  const existing = await db
    .select({ id: pushSubscriptionsTable.id })
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.endpoint, endpoint));

  if (existing.length === 0) {
    await db.insert(pushSubscriptionsTable).values({ userId, endpoint, p256dh, auth });
  }

  res.json({ ok: true });
});

// Remove a push subscription (user unsubscribes or disables notifications)
router.delete("/push/subscribe", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const { endpoint } = req.body as { endpoint?: string };

  if (!endpoint) { res.status(400).json({ error: "endpoint required" }); return; }

  await db
    .delete(pushSubscriptionsTable)
    .where(and(eq(pushSubscriptionsTable.userId, userId), eq(pushSubscriptionsTable.endpoint, endpoint)));

  res.json({ ok: true });
});

// Check if a specific endpoint is subscribed
router.get("/push/status", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const endpoint = req.query.endpoint as string;

  if (!endpoint) { res.json({ subscribed: false }); return; }

  const rows = await db
    .select({ id: pushSubscriptionsTable.id })
    .from(pushSubscriptionsTable)
    .where(and(eq(pushSubscriptionsTable.userId, userId), eq(pushSubscriptionsTable.endpoint, endpoint)));

  res.json({ subscribed: rows.length > 0 });
});

export default router;
