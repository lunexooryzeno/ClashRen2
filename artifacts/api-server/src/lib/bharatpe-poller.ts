import { db } from "@workspace/db";
import {
  paymentSessionsTable,
  topupRequestsTable,
  usersTable,
  walletTransactionsTable,
  balanceChangeLogsTable,
  notificationsTable,
} from "@workspace/db";
import { and, eq, gt, sql } from "drizzle-orm";
import { getPaymentSettings } from "./paymentSettings.js";
import { pushToUser } from "./sse-manager.js";
import { logger } from "./logger.js";

const BHARATPE_API =
  "https://payments-tesseract.bharatpe.in/api/v1/merchant/transactions";

const processedTxnIds = new Set<number>();

async function fetchTransactions(
  token: string,
  merchantId: string,
  sDate: number,
  eDate: number
): Promise<BharatPeTxn[]> {
  const url = new URL(BHARATPE_API);
  url.searchParams.set("module", "PAYMENT_QR");
  url.searchParams.set("merchantId", merchantId);
  url.searchParams.set("sDate", String(sDate));
  url.searchParams.set("eDate", String(eDate));
  url.searchParams.set("pageSize", "50");
  url.searchParams.set("pageCount", "0");
  url.searchParams.set("isFromOtDashboard", "1");

  const res = await fetch(url.toString(), {
    headers: {
      token,
      origin: "https://enterprise.bharatpe.in",
      referer: "https://enterprise.bharatpe.in/",
      accept: "application/json, text/javascript, */*; q=0.01",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`BharatPe HTTP ${res.status}`);

  const body = (await res.json()) as {
    message: string;
    status: boolean;
    data?: { transactions?: BharatPeTxn[] };
  };

  if (!body.status) throw new Error(`BharatPe: ${body.message}`);
  return body.data?.transactions ?? [];
}

interface BharatPeTxn {
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

export async function pollBharatPePayments(): Promise<void> {
  const settings = getPaymentSettings();
  if (!settings.bharatpeToken || !settings.bharatpeMerchantId) return;

  const now = new Date();

  const pendingSessions = await db.query.paymentSessionsTable.findMany({
    where: and(
      eq(paymentSessionsTable.status, "pending"),
      gt(paymentSessionsTable.expiresAt, now)
    ),
  });

  if (pendingSessions.length === 0) return;

  const earliest = pendingSessions.reduce((a, b) =>
    a.createdAt < b.createdAt ? a : b
  );
  const dayStart = new Date(earliest.createdAt);
  dayStart.setHours(0, 0, 0, 0);

  let transactions: BharatPeTxn[];
  try {
    transactions = await fetchTransactions(
      settings.bharatpeToken,
      settings.bharatpeMerchantId,
      dayStart.getTime(),
      now.getTime()
    );
  } catch (err) {
    logger.warn({ err }, "[BharatPe] Failed to fetch transactions");
    return;
  }

  const successTxns = transactions.filter(
    (t) =>
      t.status === "SUCCESS" &&
      t.type === "PAYMENT_RECV" &&
      !processedTxnIds.has(t.id)
  );

  if (successTxns.length === 0) return;

  const amountToSession = new Map<string, (typeof pendingSessions)[0]>();
  for (const s of pendingSessions) {
    amountToSession.set(parseFloat(s.finalAmount).toFixed(2), s);
  }

  for (const txn of successTxns) {
    const key = parseFloat(String(txn.amount)).toFixed(2);
    const session = amountToSession.get(key);
    if (!session) continue;

    const txnTime = new Date(txn.paymentTimestamp);
    if (txnTime < session.createdAt) continue;

    processedTxnIds.add(txn.id);

    try {
      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, session.userId),
        columns: { id: true, diamondBalance: true },
      });
      if (!user) continue;

      const utr =
        txn.internalUtr || txn.bankReferenceNo || String(txn.id);

      const [topupRequest] = await db
        .insert(topupRequestsTable)
        .values({
          userId: session.userId,
          rupees: Math.round(parseFloat(session.finalAmount)),
          diamonds: session.diamonds,
          utr,
          status: "verified",
          verifiedAt: new Date(),
          bharatpeData: {
            txnId: txn.id,
            payerName: txn.payerName,
            payerHandle: txn.payerHandle,
            bankReferenceNo: txn.bankReferenceNo,
            internalUtr: txn.internalUtr,
            paymentTimestamp: txn.paymentTimestamp,
            autoDetected: true,
          },
        })
        .returning();

      await db
        .update(usersTable)
        .set({ diamondBalance: sql`diamond_balance + ${session.diamonds}` })
        .where(eq(usersTable.id, session.userId));

      await db
        .update(paymentSessionsTable)
        .set({ status: "completed", topupRequestId: topupRequest.id })
        .where(eq(paymentSessionsTable.id, session.id));

      await db.insert(balanceChangeLogsTable).values({
        userId: session.userId,
        adminId: null,
        amount: session.diamonds,
        balanceBefore: user.diamondBalance,
        balanceAfter: user.diamondBalance + session.diamonds,
        reason: `Auto top-up ₹${parseFloat(session.finalAmount).toFixed(2)} · UTR ${utr}`,
        source: "topup_verified",
      });

      await db.insert(walletTransactionsTable).values({
        userId: session.userId,
        type: "topup",
        amount: session.diamonds,
        label: `Top-up ₹${parseFloat(session.finalAmount).toFixed(2)} · ${txn.payerName ?? "UPI"}`,
      });

      await db.insert(notificationsTable).values({
        userId: session.userId,
        type: "diamond_credit",
        title: "Payment Detected!",
        body: `+${session.diamonds} 💎 credited automatically · ₹${parseFloat(session.finalAmount).toFixed(2)} received from ${txn.payerName ?? "UPI"}.`,
      });

      pushToUser(session.userId, "topup_verified", {
        topupId: topupRequest.id,
        diamonds: session.diamonds,
        rupees: parseFloat(session.finalAmount),
        utr,
      });

      logger.info(
        {
          sessionId: session.id,
          userId: session.userId,
          amount: session.finalAmount,
          diamonds: session.diamonds,
          txnId: txn.id,
        },
        "[BharatPe] Auto-credited payment"
      );
    } catch (err) {
      logger.error(
        { err, sessionId: session.id, txnId: txn.id },
        "[BharatPe] Failed to credit payment"
      );
      processedTxnIds.delete(txn.id);
    }
  }
}
