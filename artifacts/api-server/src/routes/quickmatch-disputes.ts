/**
 * Dispute filing and admin resolution endpoints.
 *
 * POST /api/quickmatch/dispute           — loser files a dispute (with evidence)
 * GET  /api/admin/disputes               — admin lists disputes
 * POST /api/admin/disputes/:id/resolve   — admin resolves dispute
 */

import crypto from "crypto";
import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  walletTransactionsTable,
  balanceChangeLogsTable,
  notificationsTable,
  mediaUploadsTable,
  quickmatchPrizesTable,
  quickmatchDisputesTable,
} from "@workspace/db";
import { requireAuth, requireRegisteredPlayer, requireAdmin } from "../middlewares/auth.js";
import { pushToUser } from "../lib/sse-manager.js";
import { notify } from "../lib/push.js";
import { finalizePrize, reversePrize } from "../lib/prize-state.js";
import {
  getMatchById,
  getMatchForPlayer,
  forceSetState,
} from "../lib/quickmatch-matches.js";

const router: IRouter = Router();

// Only images are accepted — no video. Base64-embedded video (mp4 up to 20 MB) would exceed
// Express JSON body limits. The 2 MB decoded cap (≈2.67 MB base64) × 3 files keeps the
// total JSON body well under the server's default 50 MB limit.
const ALLOWED_EVIDENCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_EVIDENCE_FILES = 3;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB per file (decoded)

// ─── POST /api/quickmatch/dispute ─────────────────────────────────────────────
// Loser files a dispute within the 10-minute DISPUTE_WINDOW.
// Body: JSON with { matchId, explanation, evidence: [{ mimeType, data: base64 }] }

router.post("/quickmatch/dispute", requireAuth, requireRegisteredPlayer, async (req, res) => {
  const userId = req.user!.userId;
  const userIdStr = String(userId);

  const { matchId: reqMatchId, explanation, evidence } = req.body as {
    matchId?: string;
    explanation?: string;
    evidence?: Array<{ mimeType: string; data: string }>;
  };

  // Resolve match
  const match =
    (reqMatchId ? getMatchById(reqMatchId) : null) ??
    getMatchForPlayer(userIdStr);

  if (!match || !match.playerIds.includes(userIdStr)) {
    res.status(404).json({ error: "No active match found" });
    return;
  }

  if (match.currentState !== "DISPUTE_WINDOW") {
    res.status(409).json({
      error: "Disputes can only be filed during the dispute window",
      currentState: match.currentState,
    });
    return;
  }

  // Fetch the prize to know who the provisional winner is
  const prize = await db.query.quickmatchPrizesTable.findFirst({
    where: (t, { eq }) => eq(t.matchId, match.id),
  });

  if (!prize || !prize.winnerUserId) {
    res.status(409).json({ error: "No provisional winner found for this match" });
    return;
  }

  // Only the loser can file a dispute
  if (prize.winnerUserId === userId) {
    res.status(403).json({ error: "Only the losing player can file a dispute" });
    return;
  }

  // Idempotency: check for existing open dispute
  const existingDispute = await db.query.quickmatchDisputesTable.findFirst({
    where: (t, { eq }) => eq(t.matchId, match.id),
  });
  if (existingDispute) {
    res.status(409).json({ error: "A dispute has already been filed for this match", disputeId: existingDispute.id });
    return;
  }

  // Check 10-minute window using prize stateChangedAt (set when LOCKED)
  const windowMs = 10 * 60 * 1000;
  if (prize.stateChangedAt) {
    const elapsed = Date.now() - new Date(prize.stateChangedAt).getTime();
    if (elapsed > windowMs) {
      res.status(409).json({ error: "The dispute window has already closed" });
      return;
    }
  }

  // Validate and store evidence files — reject the entire request on any policy violation
  const evidenceFiles = Array.isArray(evidence) ? evidence : [];
  if (evidenceFiles.length > MAX_EVIDENCE_FILES) {
    res.status(400).json({ error: `Maximum ${MAX_EVIDENCE_FILES} evidence files allowed` });
    return;
  }

  const evidenceMediaIds: string[] = [];

  for (const file of evidenceFiles) {
    if (!file.mimeType || !file.data) {
      res.status(400).json({ error: "Each evidence item must have mimeType and data (base64)" });
      return;
    }
    if (!ALLOWED_EVIDENCE_TYPES.has(file.mimeType)) {
      res.status(400).json({
        error: `Evidence type "${file.mimeType}" is not allowed. Use image/jpeg, image/png, or image/webp.`,
      });
      return;
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(file.data, "base64");
    } catch {
      res.status(400).json({ error: "Evidence data is not valid base64" });
      return;
    }
    if (buffer.length > MAX_FILE_SIZE) {
      res.status(413).json({
        error: `Evidence file exceeds the 2 MB maximum (decoded size: ${(buffer.length / 1024 / 1024).toFixed(1)} MB)`,
      });
      return;
    }

    const mediaId = crypto.randomUUID();
    await db.insert(mediaUploadsTable).values({
      id: mediaId,
      mimeType: file.mimeType,
      data: buffer,
      temp: false,
    });
    evidenceMediaIds.push(mediaId);
  }

  // Insert dispute row
  const [dispute] = await db.insert(quickmatchDisputesTable).values({
    matchId: match.id,
    challengerUserId: userId,
    claimedWinnerUserId: prize.winnerUserId,
    evidenceMediaIds,
    explanation: explanation?.trim() ?? null,
    status: "OPEN",
  }).returning();

  // Notify the provisional winner and all admins
  pushToUser(prize.winnerUserId, "quickmatch_dispute_filed", {
    matchId: match.id,
    disputeId: dispute.id,
    message: "Your opponent has disputed the match result. An admin will review the evidence.",
  });
  notify(prize.winnerUserId, {
    type: "quickmatch_result",
    title: "⚠️ Dispute Filed",
    body: "Your opponent disputed the match result. Prize is on hold pending review.",
    url: `/#/quickmatch/result/${match.id}`,
  }).catch(() => {});

  // Notify challenger
  pushToUser(userId, "quickmatch_dispute_filed_ack", {
    matchId: match.id,
    disputeId: dispute.id,
    message: "Your dispute has been filed. An admin will review the evidence shortly.",
  });

  // Broadcast to admins via SSE
  const { pushBroadcast } = await import("../lib/sse-manager.js");
  pushBroadcast("admin_dispute_new", {
    disputeId: dispute.id,
    matchId: match.id,
    challengerUserId: userId,
    claimedWinnerUserId: prize.winnerUserId,
  });

  res.status(201).json({ ok: true, disputeId: dispute.id });
});

// ─── GET /api/admin/disputes ──────────────────────────────────────────────────

router.get("/admin/disputes", requireAdmin, async (_req, res) => {
  const disputes = await db
    .select({
      id: quickmatchDisputesTable.id,
      matchId: quickmatchDisputesTable.matchId,
      status: quickmatchDisputesTable.status,
      explanation: quickmatchDisputesTable.explanation,
      evidenceMediaIds: quickmatchDisputesTable.evidenceMediaIds,
      resolvedAt: quickmatchDisputesTable.resolvedAt,
      createdAt: quickmatchDisputesTable.createdAt,
      resolvedByAdminId: quickmatchDisputesTable.resolvedByAdminId,
      challengerId: quickmatchDisputesTable.challengerUserId,
      claimedWinnerId: quickmatchDisputesTable.claimedWinnerUserId,
      challengerName: usersTable.inGameName,
    })
    .from(quickmatchDisputesTable)
    .leftJoin(usersTable, eq(usersTable.id, quickmatchDisputesTable.challengerUserId))
    .orderBy(desc(quickmatchDisputesTable.createdAt));

  // Fetch winner names separately
  const winnerIds = [...new Set(disputes.map((d) => d.claimedWinnerId))];
  const winners = winnerIds.length
    ? await db.query.usersTable.findMany({
        where: (t, { inArray }) => inArray(t.id, winnerIds),
        columns: { id: true, inGameName: true, profilePicture: true },
      })
    : [];
  const winnerMap = new Map(winners.map((w) => [w.id, w]));

  // Fetch prize amounts
  const matchIds = disputes.map((d) => d.matchId);
  const prizes = matchIds.length
    ? await db.query.quickmatchPrizesTable.findMany({
        where: (t, { inArray }) => inArray(t.matchId, matchIds),
        columns: { matchId: true, prizeAmount: true, stateChangedAt: true },
      })
    : [];
  const prizeMap = new Map(prizes.map((p) => [p.matchId, p]));

  const result = disputes.map((d) => {
    const winner = winnerMap.get(d.claimedWinnerId);
    const prizeInfo = prizeMap.get(d.matchId);
    const windowMs = 10 * 60 * 1000;
    const elapsed = prizeInfo?.stateChangedAt
      ? Date.now() - new Date(prizeInfo.stateChangedAt).getTime()
      : windowMs;
    return {
      ...d,
      challengerName: d.challengerName ?? "Unknown",
      claimedWinnerName: winner?.inGameName ?? "Unknown",
      claimedWinnerProfilePicture: winner?.profilePicture ?? null,
      prizeAmount: prizeInfo?.prizeAmount ?? 0,
      disputeWindowStartedAt: prizeInfo?.stateChangedAt?.toISOString() ?? null,
      timeElapsedMs: elapsed,
    };
  });

  res.json(result);
});

// ─── POST /api/admin/disputes/:id/resolve ────────────────────────────────────

router.post("/admin/disputes/:id/resolve", requireAdmin, async (req, res) => {
  const adminId = req.user!.userId;
  const disputeId = parseInt(req.params.id, 10);
  if (isNaN(disputeId)) {
    res.status(400).json({ error: "Invalid dispute ID" });
    return;
  }

  const { outcome } = req.body as { outcome?: string };
  if (!outcome || !["original_wins", "challenger_wins"].includes(outcome)) {
    res.status(400).json({ error: "outcome must be 'original_wins' or 'challenger_wins'" });
    return;
  }

  const dispute = await db.query.quickmatchDisputesTable.findFirst({
    where: (t, { eq }) => eq(t.id, disputeId),
  });
  if (!dispute) {
    res.status(404).json({ error: "Dispute not found" });
    return;
  }

  // Idempotent: already resolved
  if (dispute.status !== "OPEN") {
    res.json({ ok: true, alreadyResolved: true, status: dispute.status });
    return;
  }

  const prize = await db.query.quickmatchPrizesTable.findFirst({
    where: (t, { eq }) => eq(t.matchId, dispute.matchId),
  });

  if (outcome === "original_wins") {
    await resolveOriginalWins(dispute, prize, adminId);
  } else {
    await resolveChallengerWins(dispute, prize, adminId);
  }

  res.json({ ok: true, outcome });
});

// ─── Resolution: original_wins (false dispute) ────────────────────────────────

async function resolveOriginalWins(
  dispute: typeof quickmatchDisputesTable.$inferSelect,
  prize: typeof quickmatchPrizesTable.$inferSelect | undefined,
  adminId: number,
): Promise<void> {
  const { challengerUserId, claimedWinnerUserId, matchId, id: disputeId } = dispute;

  await db.transaction(async (tx: any) => {
    // 1. Mark dispute resolved
    await tx.update(quickmatchDisputesTable)
      .set({ status: "RESOLVED_ORIGINAL_WINS", resolvedByAdminId: adminId, resolvedAt: new Date() })
      .where(eq(quickmatchDisputesTable.id, disputeId));

    // 2. Apply penalty to challenger: deduct 5 diamonds (floor at 0)
    const cRes = await tx.execute(
      sql`SELECT id, diamond_balance FROM users WHERE id = ${challengerUserId} FOR UPDATE`,
    );
    const challenger = ((cRes as any).rows ?? cRes)[0] as { id: number; diamond_balance: number } | undefined;
    if (challenger) {
      const balanceBefore = challenger.diamond_balance;
      const deduction = Math.min(5, balanceBefore);
      const balanceAfter = balanceBefore - deduction;

      await tx.update(usersTable)
        .set({ diamondBalance: balanceAfter })
        .where(eq(usersTable.id, challengerUserId));

      // Wallet transaction for penalty
      await tx.insert(walletTransactionsTable).values({
        userId: challengerUserId,
        type: "entry",
        amount: -deduction,
        label: `QuickMatch False Dispute Penalty — Match ${matchId}`,
      });

      await tx.insert(balanceChangeLogsTable).values({
        userId: challengerUserId,
        adminId,
        amount: -deduction,
        balanceBefore,
        balanceAfter,
        reason: "False dispute penalty",
        source: "dispute_penalty",
      });

      // If balance was 0 before deduction, apply 12-hour ban instead
      if (balanceBefore === 0) {
        const bannedUntil = new Date(Date.now() + 12 * 60 * 60 * 1000);
        await tx.update(usersTable)
          .set({ quickmatchBannedUntil: bannedUntil })
          .where(eq(usersTable.id, challengerUserId));
      }
    }

    // 3. Increment false_dispute_count and decrease trust_score
    await tx.execute(
      sql`UPDATE users SET
        false_dispute_count = false_dispute_count + 1,
        trust_score = GREATEST(trust_score - 10, 0)
      WHERE id = ${challengerUserId}`,
    );
  });

  // 4. Finalize prize for original winner (LOCKED → FINALIZED)
  await finalizePrize(matchId);

  // 5. Transition match to FINALIZED
  forceSetState(matchId, "FINALIZED");

  // 6. Store in-app notification for both players
  await db.insert(notificationsTable).values([
    {
      userId: claimedWinnerUserId,
      type: "result",
      title: "Dispute Resolved — You Win! 🏆",
      body: "The dispute was reviewed and your victory was confirmed. Your prize has been credited.",
    },
    {
      userId: challengerUserId,
      type: "result",
      title: "Dispute Rejected",
      body: "The dispute you filed was found to be invalid. A 5-diamond penalty has been applied.",
    },
  ]);

  // 7. SSE push to both players
  pushToUser(claimedWinnerUserId, "quickmatch_dispute_resolved", {
    matchId,
    outcome: "original_wins",
    message: "Your victory has been confirmed by admin. Prize credited!",
    prizeAmount: prize?.prizeAmount ?? 0,
  });
  pushToUser(challengerUserId, "quickmatch_dispute_resolved", {
    matchId,
    outcome: "original_wins",
    message: "Your dispute was found invalid. A penalty has been applied.",
  });

  notify(claimedWinnerUserId, {
    type: "quickmatch_result",
    title: "✅ Dispute Resolved — You Win!",
    body: "Admin confirmed your victory. Prize is credited.",
    url: `/#/quickmatch/result/${matchId}`,
  }).catch(() => {});
  notify(challengerUserId, {
    type: "quickmatch_result",
    title: "Dispute Rejected",
    body: "Your dispute was invalid. 5-diamond penalty applied.",
    url: `/#/quickmatch/result/${matchId}`,
  }).catch(() => {});
}

// ─── Resolution: challenger_wins (fake claim by original claimant) ────────────

async function resolveChallengerWins(
  dispute: typeof quickmatchDisputesTable.$inferSelect,
  prize: typeof quickmatchPrizesTable.$inferSelect | undefined,
  adminId: number,
): Promise<void> {
  const { challengerUserId, claimedWinnerUserId, matchId, id: disputeId } = dispute;
  const prizeAmount = prize?.prizeAmount ?? 0;

  await db.transaction(async (tx: any) => {
    // 1. Mark dispute resolved
    await tx.update(quickmatchDisputesTable)
      .set({ status: "RESOLVED_CHALLENGER_WINS", resolvedByAdminId: adminId, resolvedAt: new Date() })
      .where(eq(quickmatchDisputesTable.id, disputeId));

    // 2. Ban the fake claimant for 48 hours
    const bannedUntil = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await tx.update(usersTable)
      .set({ quickmatchBannedUntil: bannedUntil })
      .where(eq(usersTable.id, claimedWinnerUserId));

    // 3. Credit the actual winner (challenger) directly
    if (prizeAmount > 0) {
      const cRes = await tx.execute(
        sql`SELECT id, diamond_balance FROM users WHERE id = ${challengerUserId} FOR UPDATE`,
      );
      const challenger = ((cRes as any).rows ?? cRes)[0] as { id: number; diamond_balance: number } | undefined;
      if (challenger) {
        const balanceBefore = challenger.diamond_balance;
        const balanceAfter = balanceBefore + prizeAmount;
        await tx.update(usersTable)
          .set({ diamondBalance: balanceAfter })
          .where(eq(usersTable.id, challengerUserId));

        await tx.insert(walletTransactionsTable).values({
          userId: challengerUserId,
          type: "prize",
          amount: prizeAmount,
          label: `QuickMatch Prize (Dispute Won) — Match ${matchId}`,
          status: "settled",
        });

        await tx.insert(balanceChangeLogsTable).values({
          userId: challengerUserId,
          adminId,
          amount: prizeAmount,
          balanceBefore,
          balanceAfter,
          reason: "QuickMatch dispute won — prize credited to actual winner",
          source: "dispute_resolution",
        });
      }
    }
  });

  // 4. Reverse prize for fake claimant (LOCKED → REVERSED, removes pending tx)
  await reversePrize(matchId);

  // 5. Transition match to FINALIZED
  forceSetState(matchId, "FINALIZED");

  // 6. In-app notifications
  await db.insert(notificationsTable).values([
    {
      userId: challengerUserId,
      type: "result",
      title: "Dispute Won! 🎉",
      body: `Admin confirmed your victory. ${prizeAmount > 0 ? `${prizeAmount} diamonds credited.` : ""}`,
    },
    {
      userId: claimedWinnerUserId,
      type: "result",
      title: "Dispute Lost — Banned",
      body: "Your match result claim was found invalid. You have been suspended from QuickMatch for 48 hours.",
    },
  ]);

  // 7. SSE push
  pushToUser(challengerUserId, "quickmatch_dispute_resolved", {
    matchId,
    outcome: "challenger_wins",
    message: "Your dispute was upheld! Prize credited.",
    prizeAmount,
  });
  pushToUser(claimedWinnerUserId, "quickmatch_dispute_resolved", {
    matchId,
    outcome: "challenger_wins",
    message: "Your claim was rejected. You have been suspended for 48 hours.",
  });

  notify(challengerUserId, {
    type: "quickmatch_result",
    title: "🎉 Dispute Won!",
    body: `Admin confirmed you as the real winner. ${prizeAmount > 0 ? `+${prizeAmount} diamonds.` : ""}`,
    url: `/#/quickmatch/result/${matchId}`,
  }).catch(() => {});
  notify(claimedWinnerUserId, {
    type: "quickmatch_result",
    title: "Dispute Lost — Suspended",
    body: "Your match claim was invalid. 48-hour QuickMatch ban applied.",
    url: `/#/quickmatch/result/${matchId}`,
  }).catch(() => {});
}

// ─── Exported sweeper helper — called from quickmatch interval ─────────────────

/**
 * Scan LOCKED prizes whose dispute window has expired (> 10 min since lock)
 * with no open dispute. Finalize each one.
 */
export async function sweepExpiredDisputeWindows(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000);

    // Find LOCKED prizes older than 10 minutes
    const lockedPrizes = await db.query.quickmatchPrizesTable.findMany({
      where: (t, { eq, lt, and }) =>
        and(eq(t.state, "LOCKED"), lt(t.stateChangedAt, cutoff)),
    });

    for (const p of lockedPrizes) {
      // Check if there's an open dispute for this match
      const openDispute = await db.query.quickmatchDisputesTable.findFirst({
        where: (t, { and, eq }) =>
          and(eq(t.matchId, p.matchId), eq(t.status, "OPEN")),
      });
      if (openDispute) continue; // still waiting on admin

      // No dispute — finalize
      const applied = await finalizePrize(p.matchId);
      if (applied) {
        forceSetState(p.matchId, "FINALIZED");
        console.log(`[dispute-sweep] Auto-finalized match ${p.matchId} (no dispute filed)`);
        // SSE: notify both players of finalization
        pushToUser(p.winnerUserId, "quickmatch_finalized", {
          matchId: p.matchId, outcome: "finalized", role: "winner",
          prizeAmount: p.prizeAmount,
        });
        if (p.loserUserId) {
          pushToUser(p.loserUserId, "quickmatch_finalized", {
            matchId: p.matchId, outcome: "finalized", role: "loser",
          });
        }
        // Push notifications for finalization
        notify(p.winnerUserId, {
          type: "quickmatch_finalized",
          title: "🎉 Prize Released!",
          body: `Your match prize of ${p.prizeAmount} coins has been released to your wallet.`,
          url: `/#/quickmatch/result/${p.matchId}`,
        }).catch(() => {});
        if (p.loserUserId) {
          notify(p.loserUserId, {
            type: "quickmatch_finalized",
            title: "Match Finalized",
            body: "The dispute window has closed and the result has been accepted.",
            url: `/#/quickmatch/result/${p.matchId}`,
          }).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error("[dispute-sweep] Sweep error:", err);
  }
}

export default router;
