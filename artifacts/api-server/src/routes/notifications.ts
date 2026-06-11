import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const items = await db.query.notificationsTable.findMany({
    where: eq(notificationsTable.userId, userId),
    orderBy: [desc(notificationsTable.createdAt)],
  });
  res.json(
    items.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    })),
  );
});

router.patch("/notifications/read-all", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(eq(notificationsTable.userId, userId));
  res.json({ message: "All marked as read" });
});

router.patch("/notifications/:id/read", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const userId = req.user!.userId;
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));
  res.json({ message: "Marked as read" });
});

router.delete("/notifications/:id", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const userId = req.user!.userId;
  await db
    .delete(notificationsTable)
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));
  res.json({ message: "Deleted" });
});

export default router;
