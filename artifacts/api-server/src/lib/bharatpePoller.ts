import { db } from "@workspace/db";
import {
  paymentSessionsTable,
  topupRequestsTable,
  usersTable,
  walletTransactionsTable,
  balanceChangeLogsTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, lte, gt } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getPaymentSettings } from "./paymentSettings.js";
import { pushToUser } from "./sse-manager.js";

const POLL_INTERVAL_MS = 5_000;
const SESSION_DURATION_MS = 5 * 60 * 1_000; // 5 minutes

interface BpTransaction {
  id: number;
  paymentTimestamp: number;
  internalUtr: string;
  bankReferenceNo: string;
  amount: number;
  payerName: string;
  payerHandle: string;
  type: string;
  status: string;
}

async function fetchBpTransactions(token: string, merchantId: string): Promise<BpTransaction[]> {
  const now = Date.now();
  const sDate = now - SESSION_DURATION_MS - 120_000; // 2-min buffer

  const url = new URL("https://payments-tesseract.bharatpe.in/api/v1/merchant/transactions");
  url.searchParams.set("module", "PAYMENT_QR");
  url.searchParams.set("merchantId", merchantId);
  url.searchParams.set("sDate", String(sDate));
  url.searchParams.set("eDate", String(now));
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("pageCount", "0");
  url.searchParams.set("isFromOtDashboard", "1");

  const res = await fetch(url.toString(), {
    headers: {
      token,
      Origin: "https://enterprise.bharatpe.in",
      Referer: "https://enterprise.bharatpe.in/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    console.warn(`[BharatPe Poller] API returned HTTP ${res.status}`);
    return [];
  }

  const data = await res.json() as { status?: boolean; data?: { transactions?: BpTransaction[] } };
  if (!data.status) return [];
  return data.data?.transactions ?? [];
}

async function pollBharatpe() {
  try {
    const settings = getPaymentSettings();

    // ── 1. Expire stale sessions ────────────────────────────────────────────
    const expired = await db
      .update(paymentSessionsTable)
      .set({ status: "expired" })
      .where(
        and(
          eq(paymentSessionsTable.status, "active"),
          lte(paymentSessionsTable.expiresAt, new Date()),
        ),
      )
      .returning({ id: paymentSessionsTable.id, userId: paymentSessionsTable.userId, baseRupees: paymentSessionsTable.baseRupees });

    // Notify users whose sessions just expired
    for (const s of expired) {
      pushToUser(s.userId, "session_expired", { sessionId: s.id, rupees: s.baseRupees });
    }

    // ── 2. Skip API poll if no token ────────────────────────────────────────
    if (!settings.bharatpeToken || !settings.bharatpeMerchantId) return;

    // ── 3. Get active sessions ──────────────────────────────────────────────
    const activeSessions = await db.query.paymentSessionsTable.findMany({
      where: and(
        eq(paymentSessionsTable.status, "active"),
        gt(paymentSessionsTable.expiresAt, new Date()),
      ),
    });
    if (activeSessions.length === 0) return;

    // ── 4. Fetch BharatPe transactions ──────────────────────────────────────
    const transactions = await fetchBpTransactions(settings.bharatpeToken, settings.bharatpeMerchantId);

    // Build a map: amountInPaisa → transaction (only SUCCESS PAYMENT_RECV)
    const txMap = new Map<number, BpTransaction>();
    for (const tx of transactions) {
      if (tx.status === "SUCCESS" && tx.type === "PAYMENT_RECV") {
        const amountPaisa = Math.round(tx.amount * 100);
        // Keep the latest transaction for each paisa amount
        if (!txMap.has(amountPaisa)) txMap.set(amountPaisa, tx);
      }
    }

    // ── 5. Match sessions to transactions ───────────────────────────────────
    for (const session of activeSessions) {
      const targetPaisa = session.baseRupees * 100 + session.paisaOffset;
      const match = txMap.get(targetPaisa);
      if (!match) continue;

      // Ensure this BharatPe TXN hasn't already been used
      const alreadyUsed = await db.query.paymentSessionsTable.findFirst({
        where: and(
          eq(paymentSessionsTable.matchedTxnId, String(match.id)),
          eq(paymentSessionsTable.status, "completed"),
        ),
        columns: { id: true },
      });
      if (alreadyUsed) continue;

      // Credit diamonds to the user
      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, session.userId),
        columns: { id: true, diamondBalance: true },
      });
      if (!user) continue;

      const newBalance = user.diamondBalance + session.diamonds;

      await db
        .update(usersTable)
        .set({ diamondBalance: sql`diamond_balance + ${session.diamonds}` })
        .where(eq(usersTable.id, session.userId));

      // Create a verified topup record (use bankReferenceNo as UTR)
      const utrRef = match.bankReferenceNo || match.internalUtr || String(match.id);
      const [topupReq] = await db
        .insert(topupRequestsTable)
        .values({
          userId: session.userId,
          rupees: session.baseRupees,
          diamonds: session.diamonds,
          utr: utrRef,
          status: "verified",
          bharatpeData: {
            txnId: match.id,
            payerName: match.payerName,
            payerHandle: match.payerHandle,
            matchedAmount: match.amount,
            sessionId: session.id,
            paisaOffset: session.paisaOffset,
          },
          verifiedAt: new Date(),
        })
        .returning();

      await db.insert(balanceChangeLogsTable).values({
        userId: session.userId,
        adminId: null,
        amount: session.diamonds,
        balanceBefore: user.diamondBalance,
        balanceAfter: newBalance,
        reason: `Top-up ₹${session.baseRupees} · BharatPe auto-detected · Ref ${utrRef}`,
        source: "topup_verified",
      });

      await db.insert(walletTransactionsTable).values({
        userId: session.userId,
        type: "topup",
        amount: session.diamonds,
        label: `Top-up ₹${session.baseRupees} · BharatPe auto`,
      });

      // Mark session completed
      await db
        .update(paymentSessionsTable)
        .set({
          status: "completed",
          matchedTxnId: String(match.id),
          matchedAmount: String(match.amount),
          topupRequestId: topupReq.id,
        })
        .where(eq(paymentSessionsTable.id, session.id));

      // Notify user via SSE and push notification
      pushToUser(session.userId, "topup_verified", {
        topupId: topupReq.id,
        diamonds: session.diamonds,
        rupees: session.baseRupees,
        sessionId: session.id,
      });

      await db.insert(notificationsTable).values({
        userId: session.userId,
        type: "wallet",
        title: "Payment Confirmed! 💎",
        body: `₹${session.baseRupees} received · ${session.diamonds} diamonds added to your wallet.`,
      });

      console.log(
        `[BharatPe Poller] ✓ Session #${session.id} matched TXN ${match.id} · ₹${match.amount} · +${session.diamonds}💎 for user ${session.userId}`,
      );
    }
  } catch (e) {
    console.error("[BharatPe Poller] Error:", (e as Error).message);
  }
}

export function startBharatpePoller(): void {
  setInterval(pollBharatpe, POLL_INTERVAL_MS);
  console.log("[BharatPe Poller] Started — polling every 5s");
}
