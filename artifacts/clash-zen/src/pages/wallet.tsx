import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Gem, Plus, ArrowDownLeft, ArrowUpRight, Trophy,
  History, ArrowDown, Info, X, Wallet as WalletIcon,
  ChevronDown, Clock,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import type { Transaction } from "./wallet-all";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] text-muted-foreground uppercase tracking-[0.15em] font-bold px-1 mb-2">
      {children}
    </p>
  );
}

function maskUpi(upi: string): string {
  const atIdx = upi.indexOf("@");
  if (atIdx < 0) return (upi[0] ?? "") + "***";
  const local = upi.slice(0, atIdx);
  const domain = upi.slice(atIdx);
  if (local.length === 0) return "***" + domain;
  return local[0] + "***" + domain;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

type WithdrawalRecord = {
  id: string;
  upiId: string;
  amountRupees: number;
  diamondsRedeemed: number;
  status: "pending";
  requestedAt: string;
};

export default function WalletPage() {
  const { user, invalidateUser } = useAuth();
  const [showInfo, setShowInfo] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(true);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [rate, setRate] = useState(0.5);

  function loadPending() {
    try {
      const raw = localStorage.getItem("clash-ren:withdrawals");
      const all: WithdrawalRecord[] = raw ? JSON.parse(raw) : [];
      setPendingWithdrawals(all.filter(w => w.status === "pending"));
    } catch {
      setPendingWithdrawals([]);
    }
  }

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    loadPending();
    invalidateUser();
    setIsLoading(false);

    fetch("/api/payment-settings").then(r => r.json()).then((s: { ratePerDiamond: number }) => { setRate(s.ratePerDiamond); }).catch(() => {});

    apiFetch<Transaction[]>("/wallet/transactions")
      .then(setTxs)
      .catch(() => setTxs([]))
      .finally(() => setTxLoading(false));

    return () => {};
  }, []);

  const prizeTotal    = txs.filter(t => t.type === "prize").reduce((s, t) => s + Math.max(0, t.amount), 0);
  const depositTotal  = txs.filter(t => t.type === "topup").reduce((s, t) => s + Math.max(0, t.amount), 0);
  const withdrawn     = txs.filter(t => t.type === "withdraw").reduce((s, t) => s + Math.abs(Math.min(0, t.amount)), 0);
  const refunded      = txs.filter(t => t.type === "withdraw_refund").reduce((s, t) => s + Math.max(0, t.amount), 0);
  const canWithdrawDeposit = !!user?.allowDepositWithdrawal;
  // Cap by actual balance — prize/deposit totals are lifetime sums and don't account for spent diamonds
  const withdrawable = Math.min(user?.diamondBalance ?? 0, Math.max(0, (prizeTotal - withdrawn + refunded) + (canWithdrawDeposit ? depositTotal : 0)));
  const withdrawableRupees = (withdrawable * rate).toFixed(2);

  const recent = txs.slice(0, 5);

  if (isLoading) return (
    <div className="flex-1 overflow-y-auto pb-10 relative profile-page-bg">
      <div className="flex items-center justify-between px-4 pt-5 pb-2 relative z-10">
        <Link href="/profile">
          <button className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
        </Link>
        <span className="text-[11px] text-muted-foreground uppercase tracking-[0.18em] font-bold">My Wallet</span>
        <div className="w-9 h-9" />
      </div>
      <div className="px-4 pt-3 pb-3">
        <Skeleton className="h-44 w-full rounded-3xl bg-white/5" />
      </div>
      <div className="px-4 pb-4">
        <div className="grid grid-cols-3 gap-2">
          {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-2xl bg-white/5" />)}
        </div>
      </div>
      <div className="px-4 pt-2 pb-4">
        <Skeleton className="h-3 w-32 bg-white/5 rounded mb-3" />
        <div className="rounded-3xl overflow-hidden space-y-px" style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.08)" }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="w-10 h-10 rounded-xl bg-white/8 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-36 bg-white/8 rounded" />
                <Skeleton className="h-2.5 w-20 bg-white/5 rounded" />
              </div>
              <div className="space-y-1.5 items-end flex flex-col">
                <Skeleton className="h-3.5 w-14 bg-white/8 rounded" />
                <Skeleton className="h-2.5 w-10 bg-white/5 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto pb-10 relative profile-page-bg">

      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => setShowInfo(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative rounded-2xl p-5 w-full max-w-xs"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--primary) / 0.25)" }}
            onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowInfo(false)}
              className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center">
              <X className="w-3.5 h-3.5 text-zinc-400" />
            </button>
            <div className="flex items-center gap-2 mb-4">
              <Gem className="w-5 h-5 text-blue-400" strokeWidth={2} />
              <h3 className="font-heading font-bold text-foreground text-base">Diamond Value</h3>
            </div>
            <div className="space-y-0 rounded-2xl overflow-hidden"
              style={{ border: "1px solid hsl(var(--primary) / 0.1)" }}>
              {[
                { label: "1 Diamond",       value: `₹${rate.toFixed(2)}`,                                color: "text-foreground" },
                { label: "Your Balance",    value: `${(user?.diamondBalance ?? 0).toLocaleString()} 💎`,  color: "text-blue-300" },
                { label: "Balance in ₹",   value: `₹${((user?.diamondBalance ?? 0) * rate).toFixed(2)}`, color: "text-emerald-400" },
                { label: "Withdrawable 💎", value: `${withdrawable} → ₹${withdrawableRupees}`,           color: "text-yellow-400" },
              ].map((row, i, arr) => (
                <div key={row.label}
                  className={cn("flex justify-between items-center px-4 py-3", i < arr.length - 1 && "border-b border-white/5")}
                  style={{ background: i % 2 === 0 ? "hsl(var(--primary) / 0.04)" : "transparent" }}>
                  <span className="text-sm text-zinc-400">{row.label}</span>
                  <span className={cn("text-sm font-bold", row.color)}>{row.value}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-zinc-600 mt-3 text-center">Only prize winnings are withdrawable.</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-4 pt-5 pb-2 relative z-10">
        <Link href="/profile">
          <button className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
        </Link>
        <span className="text-[11px] text-muted-foreground uppercase tracking-[0.18em] font-bold">My Wallet</span>
        <button onClick={() => { haptic.mediumTap(); setShowInfo(true); }}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
          <Info className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="px-4 pt-3 pb-3">
        <div className="rounded-3xl p-5 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
            border: "1px solid hsl(var(--primary) / 0.3)",
            boxShadow: "0 12px 40px hsl(var(--primary) / 0.12), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}>
          <div className="absolute -right-8 -top-8 w-44 h-44 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.25) 0%, transparent 70%)" }} />
          <div className="absolute right-3 top-3 opacity-30">
            <Gem className="w-20 h-20 text-primary" strokeWidth={1} />
          </div>

          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--primary) / 0.25), hsl(var(--primary) / 0.15))",
                  border: "1px solid hsl(var(--primary) / 0.4)",
                }}>
                <WalletIcon className="w-4 h-4 text-primary" strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-[10px] text-primary/70 uppercase tracking-[0.15em] font-bold">Current Balance</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">Diamonds · Prizes · Rewards</p>
              </div>
            </div>

            <div className="flex items-end gap-2.5 mb-3">
              <span className="text-5xl font-extrabold font-heading leading-none tracking-tight bg-gradient-to-b from-foreground to-primary bg-clip-text text-transparent">
                {(user?.diamondBalance ?? 0).toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between pt-3"
              style={{ borderTop: "1px dashed hsl(var(--primary) / 0.15)" }}>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Withdrawable</p>
                <p className="text-sm font-bold text-emerald-400">₹{withdrawableRupees}</p>
              </div>
              <div className="flex gap-2">
                <Link href="/top-up">
                  <button
                    className="h-9 px-4 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 btn-primary-gradient shadow-[0_0_16px_rgba(234,88,12,0.3)] active:opacity-80 transition-opacity"
                    onClick={() => haptic.mediumTap()}
                    data-testid="btn-topup-wallet">
                    <Plus className="w-3.5 h-3.5" /> Top Up
                  </button>
                </Link>
                <Link href="/wallet/withdraw">
                  <button
                    data-testid="btn-withdraw-wallet"
                    onClick={() => haptic.mediumTap()}
                    className="h-9 px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 active:opacity-80 transition-opacity"
                    style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#34d399" }}>
                    <ArrowDown className="w-3.5 h-3.5" /> Withdraw
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {pendingWithdrawals.length > 0 && (
        <div className="px-4 pb-2">
          <button
            onClick={() => setPendingOpen(o => !o)}
            className="w-full flex items-center justify-between px-1 mb-2"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-yellow-400" />
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.15em] font-bold">
                Pending Requests
              </p>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(234,179,8,0.15)", color: "#fbbf24", border: "1px solid rgba(234,179,8,0.25)" }}>
                {pendingWithdrawals.length}
              </span>
            </div>
            <ChevronDown className={cn("w-4 h-4 text-zinc-500 transition-transform", pendingOpen && "rotate-180")} />
          </button>

          {pendingOpen && (
            <div className="rounded-3xl overflow-hidden"
              style={{
                background: "hsl(var(--card))",
                border: "1px solid rgba(234,179,8,0.18)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
              }}>
              {pendingWithdrawals.map((w, i) => (
                <div key={w.id}
                  className={cn("flex items-center gap-3 px-4 py-3.5", i < pendingWithdrawals.length - 1 && "border-b border-white/5")}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.22)" }}>
                    <ArrowDown className="w-4 h-4 text-yellow-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      ₹{w.amountRupees % 1 === 0 ? w.amountRupees : w.amountRupees.toFixed(2)}
                    </p>
                    <p className="text-[11px] text-zinc-500 truncate">
                      {maskUpi(w.upiId)} · {fmtDate(w.requestedAt)}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0"
                    style={{ background: "rgba(234,179,8,0.12)", color: "#fbbf24", border: "1px solid rgba(234,179,8,0.25)" }}>
                    Pending
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="px-4 pt-2 pb-4">
        <div className="flex items-center justify-between mb-3 px-1">
          <SectionTitle>Recent Transactions</SectionTitle>
          <Link href="/wallet/all">
            <button className="text-[11px] font-semibold text-primary active:text-primary/70 transition-colors mb-2">
              View All →
            </button>
          </Link>
        </div>

        <div className="rounded-3xl overflow-hidden"
          style={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--primary) / 0.12)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
          }}>
          {txLoading ? (
            [1,2,3,4].map(i => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-white/5 last:border-0">
                <Skeleton className="w-10 h-10 rounded-xl bg-white/8 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-36 bg-white/8 rounded" />
                  <Skeleton className="h-2.5 w-20 bg-white/5 rounded" />
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Skeleton className="h-3.5 w-14 bg-white/8 rounded" />
                  <Skeleton className="h-2.5 w-8 bg-white/5 rounded" />
                </div>
              </div>
            ))
          ) : recent.length > 0 ? recent.map((t, i) => (
            <div key={t.id}
              className={cn("flex items-center gap-3 px-4 py-3.5", i < recent.length - 1 && "border-b border-white/5")}>
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                t.type === "topup" ? "bg-emerald-500/12 border border-emerald-500/20"
                  : t.type === "prize" ? "bg-yellow-500/12 border border-yellow-500/20"
                  : "bg-red-500/12 border border-red-500/20"
              )}>
                {t.type === "topup" ? <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                  : t.type === "prize" ? <Trophy className="w-4 h-4 text-yellow-400" />
                  : <ArrowUpRight className="w-4 h-4 text-red-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{t.label}</p>
                <p className="text-[11px] text-muted-foreground">{fmtDate(t.createdAt)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={cn("text-sm font-bold flex items-center justify-end gap-0.5",
                  t.amount > 0 ? "text-emerald-400" : "text-red-400")}>
                  {t.amount > 0 ? "+" : ""}{t.amount}
                  <Gem className="w-3 h-3 text-blue-400 ml-0.5" strokeWidth={2} />
                </p>
                {t.type === "prize" && <p className="text-[10px] text-emerald-600/80">withdrawable</p>}
              </div>
            </div>
          )) : (
            <div className="py-10 text-center">
              <p className="text-sm text-zinc-500">No transactions yet</p>
              <p className="text-xs text-zinc-700 mt-1">Join a tournament to get started</p>
            </div>
          )}
        </div>

        <Link href="/wallet/all">
          <button className="w-full mt-3 h-11 rounded-2xl text-sm font-semibold active:opacity-70 transition-opacity"
            style={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--primary) / 0.15)",
              color: "hsl(var(--muted-foreground))",
            }}>
            <History className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
            View All Transactions
          </button>
        </Link>
      </div>
    </div>
  );
}
