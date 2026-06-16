import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { supportMessagesTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { supportMessageLimiter } from "../middleware/rate-limiter.js";
import { pushToAdminChat } from "../lib/sse-manager.js";
import { getAdminPresence } from "../lib/chat-presence.js";

const router: IRouter = Router();

router.get("/support/messages", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const messages = await db.query.supportMessagesTable.findMany({
    where: eq(supportMessagesTable.userId, userId),
    orderBy: [asc(supportMessagesTable.createdAt)],
    limit: 200,
  });
  await db
    .update(supportMessagesTable)
    .set({ readByUser: true })
    .where(
      and(
        eq(supportMessagesTable.userId, userId),
        eq(supportMessagesTable.isFromAdmin, true),
      ),
    );
  res.json(messages.map(m => ({
    id: m.id,
    message: m.message,
    isFromAdmin: m.isFromAdmin,
    readByUser: m.readByUser,
    createdAt: m.createdAt.toISOString(),
  })));
});

router.post("/support/messages", requireAuth, supportMessageLimiter, async (req, res) => {
  const userId = req.user!.userId;
  const { message } = req.body as { message?: string };
  if (!message?.trim()) { res.status(400).json({ error: "Message is required" }); return; }
  const [msg] = await db
    .insert(supportMessagesTable)
    .values({ userId, message: message.trim(), isFromAdmin: false })
    .returning();

  // Push real-time to admin watching this user's chat
  pushToAdminChat(userId, "user_message", {
    id: msg.id,
    message: msg.message,
    isFromAdmin: false,
    readByUser: true,
    createdAt: msg.createdAt.toISOString(),
  });

  res.json({
    id: msg.id,
    message: msg.message,
    isFromAdmin: false,
    readByUser: true,
    createdAt: msg.createdAt.toISOString(),
  });
});

router.get("/support/unread-count", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const rows = await db.query.supportMessagesTable.findMany({
    where: (m) => eq(m.userId, userId),
    columns: { id: true, isFromAdmin: true, readByUser: true },
  });
  const unread = rows.filter(r => r.isFromAdmin && !r.readByUser).length;
  res.json({ unread });
});

// User is typing — forward to any admin watching this chat
router.post("/support/typing", requireAuth, (req, res) => {
  const userId = req.user!.userId;
  const { typing } = req.body as { typing?: boolean };
  pushToAdminChat(userId, "user_typing", { typing: !!typing });
  res.sendStatus(204);
});

// Is a support admin currently viewing this user's chat?
router.get("/support/presence", requireAuth, (req, res) => {
  const userId = req.user!.userId;
  const { online, lastActive } = getAdminPresence(userId);
  res.json({ online, lastActive: lastActive?.toISOString() ?? null });
});

export default router;
