import { db } from "@workspace/db";
import {
  paymentSessionsTable,
  topupRequestsTable,
  usersTable,
  walletTransactionsTable,
  balanceChangeLogsTable,
} from "@workspace/db";
import { eq, and, lt, sql } from "drizzle-orm";
import { getPaymentSettings } from "./paymentSettings.js";
import { pushToUser } from "./sse-manager.js";

const POLL_INTERVAL_MS = 15_000;
const SESSION_DURATION_MS = 5 * 60 * 1000;
const BP_API_URL = "https://payments-tesseract.bharatpe.in/api/v1/merchant/transactions";

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startBharatPePoller(): void {
  if (pollTimer) return;
  runPollCycle();
  pollTimer = setInterval(runPollCycle, POLL_INTERVAL_MS);
}

export function stopBharatPePoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function expireOldSessions(): Promise<void> {
  await db
    .update(paymentSessionsTable)
    .set({ status: "expired" })
    .where(
      and(
        eq(paymentSessionsTable.status, "active"),
        lt(paymentSessionsTable.expiresAt, new Date()),
      ),
    );
}

interface BharatPeTxn {
  txnId?: string;
  transactionId?: string;
  merchantOrderId?: string;
  amount?: number | string;
  totalAmount?: number | string;
  status?: string;
  type?: string;
  createdAt?: string;
  txnTime?: string;
}

async function fetchBharatPeTransactions(): Promise<BharatPeTxn[]> {
  const settings = getPaymentSettings();
  if (!settings.xsrfToken || !settings.bharatpeSession) return [];

  const merchantId = settings.merchantId || "69893818";
  const url = `${BP_API_URL}?merchantId=${merchantId}`;

  const resp = await fetch(url, {
    headers: {
      "x-xsrf-token": settings.xsrfToken,
      Cookie: `_session_id=${settings.bharatpeSession}`,
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    console.warn(`[BharatPe] Poll HTTP ${resp.status}`);
    return [];
  }

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    return [];
  }

  const obj = body as Record<string, unknown>;

  const candidates: unknown[] = [];
  if (Array.isArray(obj["data"])) candidates.push(...(obj["data"] as unknown[]));
  else if (obj["data"] && typeof obj["data"] === "object") {
    const d = obj["data"] as Record<string, unknown>;
    if (Array.isArray(d["transactions"])) candidates.push(...(d["transactions"] as unknown[]));
    else if (Array.isArray(d["list"])) candidates.push(...(d["list"] as unknown[]));
  }
  if (Array.isArray(obj["response"])) candidates.push(...(obj["response"] as unknown[]));
  if (candidates.length === 0 && Array.isArray(body)) candidates.push(...(body as unknown[]));

  return candidates.filter((t) => t !== null && typeof t === "object") as BharatPeTxn[];
}

function extractAmount(txn: BharatPeTxn): number | null {
  const raw = txn.amount ?? txn.totalAmount;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  return isNaN(n) ? null : n;
}

function extractTxnId(txn: BharatPeTxn): string {
  return (
    txn.txnId ??
    txn.transactionId ??
    txn.merchantOrderId ??
    `BP-${Date.now()}`
  );
}

async function approveSession(
  session: typeof paymentSessionsTable.$inferSelect,
  txnId: string,
  paidRupees: number,
): Promise<void> {
  const settings = getPaymentSettings();
  const baseRupees = session.baseRupees;
  const diamonds = Math.floor(baseRupees / settings.ratePerDiamond);

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, session.userId),
    columns: { id: true, diamondBalance: true },
  });
  if (!user) return;

  const [topupReq] = await db
    .insert(topupRequestsTable)
    .values({
      userId: session.userId,
      rupees: baseRupees,
      diamonds,
      utr: txnId,
      status: "verified",
      bharatpeData: {
        autoDetected: true,
        txnId,
        paidAmount: paidRupees,
        offsetPaise: session.offsetPaise,
        sessionId: session.id,
      },
      verifiedAt: new Date(),
    })
    .returning();

  await db
    .update(usersTable)
    .set({ diamondBalance: sql`diamond_balance + ${diamonds}` })
    .where(eq(usersTable.id, session.userId));

  await db
    .update(paymentSessionsTable)
    .set({ status: "completed", topupRequestId: topupReq.id })
    .where(eq(paymentSessionsTable.id, session.id));

  await db.insert(balanceChangeLogsTable).values({
    userId: session.userId,
    adminId: null,
    amount: diamonds,
    balanceBefore: user.diamondBalance,
    balanceAfter: user.diamondBalance + diamonds,
    reason: `Auto top-up ₹${baseRupees} · BharatPe ${txnId}`,
    source: "topup_verified",
  });

  await db.insert(walletTransactionsTable).values({
    userId: session.userId,
    type: "topup",
    amount: diamonds,
    label: `Top-up ₹${baseRupees} · Auto BharatPe`,
  });

  pushToUser(session.userId, "topup_verified", {
    topupId: topupReq.id,
    diamonds,
    rupees: baseRupees,
    sessionId: session.id,
  });

  console.log(
    `[BharatPe] Auto-approved session #${session.id} for user ${session.userId}: +${diamonds} 💎 (₹${paidRupees})`,
  );
}

async function runPollCycle(): Promise<void> {
  try {
    await expireOldSessions();

    const activeSessions = await db.query.paymentSessionsTable.findMany({
      where: eq(paymentSessionsTable.status, "active"),
    });

    if (activeSessions.length === 0) return;

    const txns = await fetchBharatPeTransactions();
    if (txns.length === 0) return;

    const processed = new Set<number>();

    for (const txn of txns) {
      const amountRupees = extractAmount(txn);
      if (amountRupees === null) continue;

      const amountPaise = Math.round(amountRupees * 100);

      for (const session of activeSessions) {
        if (processed.has(session.id)) continue;
        const sessionPaise = session.baseRupees * 100 + session.offsetPaise;
        if (sessionPaise === amountPaise) {
          processed.add(session.id);
          const txnId = extractTxnId(txn);
          await approveSession(session, txnId, amountRupees);
          break;
        }
      }
    }
  } catch (err) {
    console.error("[BharatPe] Poll cycle error:", err);
  }
}
