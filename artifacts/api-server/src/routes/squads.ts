import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  squadsTable,
  squadMembersTable,
  usersTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { sendPushToUser } from "../lib/push.js";

const router: IRouter = Router();

// ── helpers ────────────────────────────────────────────────────────────────

function generateSquadUid(): string {
  const min = 1000000000;
  const max = 9999999999;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

async function getMySquadId(userId: number): Promise<number | null> {
  const asLeader = await db.query.squadsTable.findFirst({
    where: eq(squadsTable.leaderId, userId),
  });
  if (asLeader) return asLeader.id;

  const asMember = await db.query.squadMembersTable.findFirst({
    where: and(
      eq(squadMembersTable.userId, userId),
      eq(squadMembersTable.status, "active"),
    ),
  });
  return asMember ? asMember.squadId : null;
}

async function buildSquadResponse(squadId: number) {
  const squad = await db.query.squadsTable.findFirst({
    where: eq(squadsTable.id, squadId),
  });
  if (!squad) return null;

  const members = await db
    .select({
      id: squadMembersTable.id,
      userId: squadMembersTable.userId,
      role: squadMembersTable.role,
      status: squadMembersTable.status,
      joinedAt: squadMembersTable.joinedAt,
      inGameName: usersTable.inGameName,
      uid: usersTable.uid,
    })
    .from(squadMembersTable)
    .leftJoin(usersTable, eq(squadMembersTable.userId, usersTable.id))
    .where(
      and(
        eq(squadMembersTable.squadId, squadId),
        ne(squadMembersTable.status, "pending_request"),
      ),
    );

  const joinRequests = await db
    .select({
      id: squadMembersTable.id,
      userId: squadMembersTable.userId,
      sentAt: squadMembersTable.joinedAt,
      inGameName: usersTable.inGameName,
      uid: usersTable.uid,
    })
    .from(squadMembersTable)
    .leftJoin(usersTable, eq(squadMembersTable.userId, usersTable.id))
    .where(
      and(
        eq(squadMembersTable.squadId, squadId),
        eq(squadMembersTable.status, "pending_request"),
      ),
    );

  return {
    id: squad.id,
    name: squad.name,
    uid: squad.uid,
    leaderId: squad.leaderId,
    avatar: squad.avatar,
    createdAt: squad.createdAt.toISOString(),
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      inGameName: m.inGameName ?? null,
      uid: m.uid ?? null,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt.toISOString(),
    })),
    joinRequests: joinRequests.map((r) => ({
      id: r.id,
      userId: r.userId,
      inGameName: r.inGameName ?? null,
      uid: r.uid ?? null,
      sentAt: r.sentAt.toISOString(),
    })),
  };
}

// ── GET /squads/my ─────────────────────────────────────────────────────────

router.get("/squads/my", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const squadId = await getMySquadId(userId);
  if (!squadId) { res.json(null); return; }
  const squad = await buildSquadResponse(squadId);
  res.json(squad);
});

// ── POST /squads ───────────────────────────────────────────────────────────

router.post("/squads", requireAuth, async (req, res) => {
  const userId = req.user!.userId;

  // Check not already in a squad
  const existing = await getMySquadId(userId);
  if (existing) {
    res.status(400).json({ error: "You are already in a squad" });
    return;
  }

  const { name, avatar } = req.body as { name?: string; avatar?: string };
  if (!name || name.trim().length < 3) {
    res.status(400).json({ error: "Squad name must be at least 3 characters" });
    return;
  }

  const uid = generateSquadUid();
  const [squad] = await db
    .insert(squadsTable)
    .values({ name: name.trim(), uid, leaderId: userId, avatar: avatar ?? null })
    .returning();

  // Add leader as active primary member
  await db.insert(squadMembersTable).values({
    squadId: squad.id,
    userId,
    role: "primary",
    status: "active",
  });

  const full = await buildSquadResponse(squad.id);
  res.status(201).json(full);
});

// ── DELETE /squads/:id ─────────────────────────────────────────────────────

router.delete("/squads/:id", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const userId = req.user!.userId;

  const squad = await db.query.squadsTable.findFirst({
    where: eq(squadsTable.id, id),
  });
  if (!squad) { res.status(404).json({ error: "Squad not found" }); return; }
  if (squad.leaderId !== userId) {
    res.status(403).json({ error: "Only the leader can delete the squad" });
    return;
  }

  await db.delete(squadMembersTable).where(eq(squadMembersTable.squadId, id));
  await db.delete(squadsTable).where(eq(squadsTable.id, id));
  res.json({ message: "Squad deleted" });
});

// ── POST /squads/:id/invites ───────────────────────────────────────────────

router.post("/squads/:id/invites", requireAuth, async (req, res) => {
  const squadId = parseInt(String(req.params.id));
  if (isNaN(squadId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const leaderId = req.user!.userId;

  const squad = await db.query.squadsTable.findFirst({
    where: eq(squadsTable.id, squadId),
  });
  if (!squad) { res.status(404).json({ error: "Squad not found" }); return; }
  if (squad.leaderId !== leaderId) {
    res.status(403).json({ error: "Only the leader can invite players" });
    return;
  }

  const { playerUid, role = "primary" } = req.body as { playerUid?: string; role?: string };
  if (!playerUid) { res.status(400).json({ error: "playerUid is required" }); return; }

  // Find user by their in-game UID
  const targetUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.uid, playerUid),
  });
  if (!targetUser) {
    res.status(404).json({ error: "Player with that UID not found" });
    return;
  }

  // Check already in a squad or already has pending invite
  const alreadyMember = await db.query.squadMembersTable.findFirst({
    where: and(
      eq(squadMembersTable.squadId, squadId),
      eq(squadMembersTable.userId, targetUser.id),
    ),
  });
  if (alreadyMember) {
    res.status(400).json({ error: "Player already in or invited to this squad" });
    return;
  }

  await db.insert(squadMembersTable).values({
    squadId,
    userId: targetUser.id,
    role: role === "secondary" ? "secondary" : "primary",
    status: "pending_invite",
  });

  const leaderUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, leaderId),
  });

  // Notify invitee
  await db.insert(notificationsTable).values({
    userId: targetUser.id,
    type: "squad_request",
    title: "Squad Invitation",
    body: `${leaderUser?.inGameName ?? "A leader"} invited you to join squad "${squad.name}"`,
  });
  sendPushToUser(targetUser.id, {
    type: "squad_request", title: "Squad Invitation 🛡️",
    body: `${leaderUser?.inGameName ?? "A leader"} invited you to join "${squad.name}"`,
    url: "/squad",
  }).catch(() => {});

  res.json({ message: "Invite sent" });
});

// ── GET /squads/invites ────────────────────────────────────────────────────

router.get("/squads/invites", requireAuth, async (req, res) => {
  const userId = req.user!.userId;

  const invites = await db
    .select({
      id: squadMembersTable.id,
      squadId: squadMembersTable.squadId,
      role: squadMembersTable.role,
      sentAt: squadMembersTable.joinedAt,
      squadName: squadsTable.name,
      squadUid: squadsTable.uid,
      leaderName: usersTable.inGameName,
    })
    .from(squadMembersTable)
    .leftJoin(squadsTable, eq(squadMembersTable.squadId, squadsTable.id))
    .leftJoin(usersTable, eq(squadsTable.leaderId, usersTable.id))
    .where(
      and(
        eq(squadMembersTable.userId, userId),
        eq(squadMembersTable.status, "pending_invite"),
      ),
    );

  res.json(
    invites.map((i) => ({
      id: i.id,
      squadId: i.squadId,
      squadName: i.squadName ?? "",
      squadUid: i.squadUid ?? "",
      leaderName: i.leaderName ?? "Leader",
      role: i.role,
      sentAt: i.sentAt.toISOString(),
    })),
  );
});

// ── POST /squads/invites/:id/accept ───────────────────────────────────────

router.post("/squads/invites/:id/accept", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const userId = req.user!.userId;

  const invite = await db.query.squadMembersTable.findFirst({
    where: and(
      eq(squadMembersTable.id, id),
      eq(squadMembersTable.userId, userId),
      eq(squadMembersTable.status, "pending_invite"),
    ),
  });
  if (!invite) { res.status(404).json({ error: "Invite not found" }); return; }

  const squad = await db.query.squadsTable.findFirst({
    where: eq(squadsTable.id, invite.squadId),
  });

  await db
    .update(squadMembersTable)
    .set({ status: "active" })
    .where(eq(squadMembersTable.id, id));

  if (squad) {
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
    await db.insert(notificationsTable).values({
      userId: squad.leaderId,
      type: "squad_accepted",
      title: "Player Joined Your Squad",
      body: `${user?.inGameName ?? "A player"} accepted your invitation and joined "${squad.name}"`,
    });
  }

  res.json({ message: "Joined squad" });
});

// ── DELETE /squads/invites/:id ─────────────────────────────────────────────

router.delete("/squads/invites/:id", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const userId = req.user!.userId;

  await db
    .delete(squadMembersTable)
    .where(
      and(
        eq(squadMembersTable.id, id),
        eq(squadMembersTable.userId, userId),
        eq(squadMembersTable.status, "pending_invite"),
      ),
    );
  res.json({ message: "Invite declined" });
});

// ── POST /squads/join-request ──────────────────────────────────────────────

router.post("/squads/join-request", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const { squadUid } = req.body as { squadUid?: string };
  if (!squadUid) { res.status(400).json({ error: "squadUid is required" }); return; }

  const squad = await db.query.squadsTable.findFirst({
    where: eq(squadsTable.uid, squadUid),
  });
  if (!squad) { res.status(404).json({ error: "Squad not found" }); return; }
  if (squad.leaderId === userId) {
    res.status(400).json({ error: "That is your own squad" });
    return;
  }

  const existing = await db.query.squadMembersTable.findFirst({
    where: and(
      eq(squadMembersTable.squadId, squad.id),
      eq(squadMembersTable.userId, userId),
    ),
  });
  if (existing) {
    // Update existing declined/old request to pending
    await db
      .update(squadMembersTable)
      .set({ status: "pending_request" })
      .where(eq(squadMembersTable.id, existing.id));
  } else {
    await db.insert(squadMembersTable).values({
      squadId: squad.id,
      userId,
      role: "primary",
      status: "pending_request",
    });
  }

  const requester = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
  });
  await db.insert(notificationsTable).values({
    userId: squad.leaderId,
    type: "squad_request",
    title: "New Join Request",
    body: `${requester?.inGameName ?? "A player"} wants to join your squad "${squad.name}"`,
  });
  sendPushToUser(squad.leaderId, {
    type: "squad_request", title: "New Join Request",
    body: `${requester?.inGameName ?? "A player"} wants to join "${squad.name}"`,
    url: "/squad",
  }).catch(() => {});

  res.json({ message: "Join request sent", squadName: squad.name });
});

// ── GET /squads/:id/join-requests ─────────────────────────────────────────

router.get("/squads/:id/join-requests", requireAuth, async (req, res) => {
  const squadId = parseInt(String(req.params.id));
  if (isNaN(squadId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const userId = req.user!.userId;

  const squad = await db.query.squadsTable.findFirst({
    where: eq(squadsTable.id, squadId),
  });
  if (!squad || squad.leaderId !== userId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const reqs = await db
    .select({
      id: squadMembersTable.id,
      userId: squadMembersTable.userId,
      sentAt: squadMembersTable.joinedAt,
      inGameName: usersTable.inGameName,
      uid: usersTable.uid,
    })
    .from(squadMembersTable)
    .leftJoin(usersTable, eq(squadMembersTable.userId, usersTable.id))
    .where(
      and(
        eq(squadMembersTable.squadId, squadId),
        eq(squadMembersTable.status, "pending_request"),
      ),
    );

  res.json(
    reqs.map((r) => ({
      id: r.id,
      userId: r.userId,
      inGameName: r.inGameName ?? null,
      uid: r.uid ?? null,
      sentAt: r.sentAt.toISOString(),
    })),
  );
});

// ── POST /squads/join-requests/:id/accept ─────────────────────────────────

router.post("/squads/join-requests/:id/accept", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const leaderId = req.user!.userId;

  const request = await db.query.squadMembersTable.findFirst({
    where: and(
      eq(squadMembersTable.id, id),
      eq(squadMembersTable.status, "pending_request"),
    ),
  });
  if (!request) { res.status(404).json({ error: "Join request not found" }); return; }

  const squad = await db.query.squadsTable.findFirst({
    where: eq(squadsTable.id, request.squadId),
  });
  if (!squad || squad.leaderId !== leaderId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  await db
    .update(squadMembersTable)
    .set({ status: "active" })
    .where(eq(squadMembersTable.id, id));

  const leaderUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, leaderId),
  });
  await db.insert(notificationsTable).values({
    userId: request.userId,
    type: "squad_accepted",
    title: "Join Request Accepted",
    body: `${leaderUser?.inGameName ?? "The leader"} accepted your request to join "${squad.name}"`,
  });
  sendPushToUser(request.userId, {
    type: "squad_accepted", title: "Squad Request Accepted ✅",
    body: `You're now in "${squad.name}"!`,
    url: "/squad",
  }).catch(() => {});

  res.json({ message: "Join request accepted" });
});

// ── DELETE /squads/join-requests/:id ──────────────────────────────────────

router.delete("/squads/join-requests/:id", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const leaderId = req.user!.userId;

  const request = await db.query.squadMembersTable.findFirst({
    where: and(
      eq(squadMembersTable.id, id),
      eq(squadMembersTable.status, "pending_request"),
    ),
  });
  if (!request) { res.status(404).json({ error: "Join request not found" }); return; }

  const squad = await db.query.squadsTable.findFirst({
    where: eq(squadsTable.id, request.squadId),
  });
  if (!squad || squad.leaderId !== leaderId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  await db.delete(squadMembersTable).where(eq(squadMembersTable.id, id));
  res.json({ message: "Join request declined" });
});

// ── DELETE /squads/:id/members/:memberId ──────────────────────────────────

router.delete("/squads/:id/members/:memberId", requireAuth, async (req, res) => {
  const squadId = parseInt(String(req.params.id));
  const memberId = parseInt(String(req.params.memberId));
  if (isNaN(squadId) || isNaN(memberId)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const leaderId = req.user!.userId;

  const squad = await db.query.squadsTable.findFirst({
    where: eq(squadsTable.id, squadId),
  });
  if (!squad || squad.leaderId !== leaderId) {
    res.status(403).json({ error: "Only the leader can kick members" });
    return;
  }

  await db
    .delete(squadMembersTable)
    .where(
      and(
        eq(squadMembersTable.id, memberId),
        eq(squadMembersTable.squadId, squadId),
      ),
    );
  res.json({ message: "Member removed" });
});

// ── POST /squads/:id/leave ─────────────────────────────────────────────────

router.post("/squads/:id/leave", requireAuth, async (req, res) => {
  const squadId = parseInt(String(req.params.id));
  if (isNaN(squadId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const userId = req.user!.userId;

  const squad = await db.query.squadsTable.findFirst({
    where: eq(squadsTable.id, squadId),
  });
  if (!squad) { res.status(404).json({ error: "Squad not found" }); return; }

  if (squad.leaderId === userId) {
    // Leader leaves → delete squad
    await db.delete(squadMembersTable).where(eq(squadMembersTable.squadId, squadId));
    await db.delete(squadsTable).where(eq(squadsTable.id, squadId));
    res.json({ message: "Squad disbanded" });
  } else {
    // Member leaves
    await db
      .delete(squadMembersTable)
      .where(
        and(
          eq(squadMembersTable.squadId, squadId),
          eq(squadMembersTable.userId, userId),
        ),
      );
    res.json({ message: "Left squad" });
  }
});

// ── PATCH /squads/:id/avatar ───────────────────────────────────────────────

router.patch("/squads/:id/avatar", requireAuth, async (req, res) => {
  const squadId = parseInt(String(req.params.id));
  if (isNaN(squadId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const userId = req.user!.userId;

  const squad = await db.query.squadsTable.findFirst({
    where: eq(squadsTable.id, squadId),
  });
  if (!squad || squad.leaderId !== userId) {
    res.status(403).json({ error: "Only the leader can update the squad avatar" });
    return;
  }

  const { avatar } = req.body as { avatar?: string };
  await db
    .update(squadsTable)
    .set({ avatar: avatar ?? null })
    .where(eq(squadsTable.id, squadId));

  res.json({ message: "Avatar updated" });
});

export default router;
