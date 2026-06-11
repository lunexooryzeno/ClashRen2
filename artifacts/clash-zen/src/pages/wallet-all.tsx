import { useEffect, useState } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { ArrowLeft, Gem, ArrowDownLeft, ArrowUpRight, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";

export type TxType = "topup" | "entry" | "prize";
export interface Transaction {
  id: number;
  type: TxType;
  amount: number;
  label: string;
  createdAt: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function TxRow({ t, last }: { t: Transaction; last: boolean }) {
  return (
    <div
      className={cn("flex items-center gap-3 px-4 py-3.5", !last && "border-b border-white/5")}
    >
      <div className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
        t.type === "topup" ? "bg-emerald-500/15 border border-emerald-500/20"
          : t.type === "prize" ? "bg-yellow-500/15 border border-yellow-500/20"
          : "bg-red-500/15 border border-red-500/20"
      )}>
        {t.type === "topup" ? <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
          : t.type === "prize" ? <Trophy className="w-4 h-4 text-yellow-400" />
          : <ArrowUpRight className="w-4 h-4 text-red-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{t.label}</p>
        <p className="text-[11px] text-zinc-500">{fmtDate(t.createdAt)}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={cn("text-sm font-bold flex items-center justify-end gap-0.5",
          t.amount > 0 ? "text-emerald-400" : "text-red-400")}>
          {t.amount > 0 ? "+" : ""}{t.amount}
          <Gem className="w-3 h-3 text-blue-400 ml-0.5" strokeWidth={2} />
        </p>
        {t.type === "prize" && <p className="text-[10px] text-emerald-600">withdrawable</p>}
      </div>
    </div>
  );
}

export default function WalletAllPage() {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    apiFetch<Transaction[]>("/wallet/transactions")
      .then(setTxs)
      .catch(() => setTxs([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-[100dvh] flex flex-col relative">
      <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-yellow-500/8 rounded-full blur-[100px] pointer-events-none" />

      <div className="flex items-center gap-3 px-4 pt-6 pb-4 relative z-10">
        <Link href="/wallet">
          <button className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
        </Link>
        <div>
          <h1 className="font-heading text-xl font-bold text-white tracking-tight">All Transactions</h1>
          <p className="text-xs text-zinc-500">{loading ? "Loading…" : `${txs.length} records`}</p>
        </div>
      </div>

      <div className="px-4 pb-12 relative z-10">
        {loading ? (
          <div className="rounded-3xl overflow-hidden" style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.08)" }}>
            {[1,2,3,4,5,6,7].map(i => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-white/4 last:border-0">
                <Skeleton className="w-10 h-10 rounded-xl bg-white/8 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-36 bg-white/8 rounded" />
                  <Skeleton className="h-2.5 w-20 bg-white/5 rounded" />
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Skeleton className="h-3.5 w-14 bg-white/8 rounded" />
                  <Skeleton className="h-2.5 w-10 bg-white/5 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : txs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Gem className="w-10 h-10 text-zinc-700" strokeWidth={1} />
            <p className="text-sm text-zinc-500">No transactions yet</p>
            <p className="text-xs text-zinc-700">Join a tournament or top up your wallet</p>
          </div>
        ) : (
          <div className="rounded-3xl overflow-hidden"
            style={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--primary) / 0.12)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
            }}>
            {txs.map((t, i) => (
              <TxRow key={t.id} t={t} last={i === txs.length - 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
