import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ShieldAlert, ChevronLeft, Loader2, RefreshCw, CheckCircle2, XCircle,
  Clock, Eye, User, AlertTriangle, Flag, Image as ImageIcon, FileVideo,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Dispute {
  id: number;
  matchId: string;
  status: string;
  explanation: string | null;
  evidenceMediaIds: string[];
  resolvedAt: string | null;
  createdAt: string;
  resolvedByAdminId: number | null;
  challengerId: number;
  claimedWinnerId: number;
  challengerName: string;
  claimedWinnerName: string;
  claimedWinnerProfilePicture: string | null;
  prizeAmount: number;
  disputeWindowStartedAt: string | null;
  timeElapsedMs: number;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs = Math.floor(diff / 3_600_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function statusBadge(status: string) {
  if (status === "OPEN") return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Open</Badge>;
  if (status === "RESOLVED_ORIGINAL_WINS") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Original Wins</Badge>;
  if (status === "RESOLVED_CHALLENGER_WINS") return <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30">Challenger Wins</Badge>;
  return <Badge className="bg-zinc-700/40 text-zinc-400">{status}</Badge>;
}

function EvidenceGallery({ mediaIds }: { mediaIds: string[] }) {
  if (!mediaIds.length) {
    return <p className="text-xs text-zinc-500 italic">No evidence files submitted.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {mediaIds.map((id) => (
        <a
          key={id}
          href={`/api/uploads/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:border-indigo-500 hover:text-white transition-colors"
        >
          <ImageIcon className="w-4 h-4 text-indigo-400" />
          <span className="font-mono truncate max-w-[120px]">{id.slice(0, 8)}…</span>
          <Eye className="w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
      ))}
    </div>
  );
}

export default function AdminQuickmatchDisputes() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [confirmDispute, setConfirmDispute] = useState<{ dispute: Dispute; outcome: string } | null>(null);
  const [tab, setTab] = useState<"open" | "resolved">("open");

  if (!user?.isAdmin) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="w-16 h-16 text-destructive mb-4" />
        <h1 className="font-bold text-2xl text-white mb-2">Access Denied</h1>
        <p className="text-zinc-400 mb-6">You do not have administrative privileges.</p>
        <Button variant="outline" onClick={() => navigate("/")}>Return to Home</Button>
      </div>
    );
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Dispute[]>("/admin/disputes");
      setDisputes(data);
    } catch {
      toast({ title: "Failed to load disputes", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resolve = async (dispute: Dispute, outcome: string) => {
    setResolvingId(dispute.id);
    try {
      await apiFetch(`/admin/disputes/${dispute.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ outcome }),
      });
      toast({ title: `Dispute resolved: ${outcome === "original_wins" ? "Original winner confirmed" : "Challenger wins"}` });
      setConfirmDispute(null);
      await load();
    } catch {
      toast({ title: "Failed to resolve dispute", variant: "destructive" });
    } finally {
      setResolvingId(null);
    }
  };

  const open = disputes.filter((d) => d.status === "OPEN");
  const resolved = disputes.filter((d) => d.status !== "OPEN");

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/admin")} className="text-zinc-400 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <Flag className="w-5 h-5 text-amber-400" />
        <h1 className="font-bold text-lg text-white">QuickMatch Disputes</h1>
        <div className="ml-auto flex items-center gap-2">
          {open.length > 0 && (
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
              {open.length} open
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="border-zinc-700 text-zinc-300 hover:text-white h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "open" | "resolved")}>
          <TabsList className="bg-zinc-900 border border-zinc-800 mb-6">
            <TabsTrigger value="open" className="data-[state=active]:bg-zinc-800">
              Open ({open.length})
            </TabsTrigger>
            <TabsTrigger value="resolved" className="data-[state=active]:bg-zinc-800">
              Resolved ({resolved.length})
            </TabsTrigger>
          </TabsList>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            </div>
          ) : (
            <>
              <TabsContent value="open">
                {open.length === 0 ? (
                  <div className="text-center py-16">
                    <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                    <p className="text-zinc-400">No open disputes right now.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {open.map((d) => <DisputeCard key={d.id} dispute={d} onResolve={(outcome) => setConfirmDispute({ dispute: d, outcome })} />)}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="resolved">
                {resolved.length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-zinc-500">No resolved disputes yet.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {resolved.map((d) => <DisputeCard key={d.id} dispute={d} resolved />)}
                  </div>
                )}
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>

      {/* Confirmation Dialog */}
      {confirmDispute && (
        <Dialog open onOpenChange={() => setConfirmDispute(null)}>
          <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                Confirm Resolution
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 text-sm text-zinc-300">
              {confirmDispute.outcome === "original_wins" ? (
                <>
                  <p className="mb-2">Confirming <strong>original winner</strong> ({confirmDispute.dispute.claimedWinnerName}) will:</p>
                  <ul className="list-disc pl-5 space-y-1 text-zinc-400">
                    <li>Finalize prize for {confirmDispute.dispute.claimedWinnerName}</li>
                    <li>Deduct 5 diamonds from {confirmDispute.dispute.challengerName}</li>
                    <li>Increment their false dispute count</li>
                    <li>Ban them for 12h if balance was already 0</li>
                  </ul>
                </>
              ) : (
                <>
                  <p className="mb-2">Awarding <strong>challenger</strong> ({confirmDispute.dispute.challengerName}) will:</p>
                  <ul className="list-disc pl-5 space-y-1 text-zinc-400">
                    <li>Reverse prize for {confirmDispute.dispute.claimedWinnerName}</li>
                    <li>Credit {confirmDispute.dispute.prizeAmount} 💎 to {confirmDispute.dispute.challengerName}</li>
                    <li>Ban {confirmDispute.dispute.claimedWinnerName} for 48 hours</li>
                  </ul>
                </>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirmDispute(null)} className="border-zinc-700">
                Cancel
              </Button>
              <Button
                onClick={() => resolve(confirmDispute.dispute, confirmDispute.outcome)}
                disabled={resolvingId === confirmDispute.dispute.id}
                className={confirmDispute.outcome === "original_wins"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-violet-600 hover:bg-violet-700 text-white"}
              >
                {resolvingId === confirmDispute.dispute.id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function DisputeCard({
  dispute,
  onResolve,
  resolved = false,
}: {
  dispute: Dispute;
  onResolve?: (outcome: string) => void;
  resolved?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const elapsed = Math.floor(dispute.timeElapsedMs / 60_000);
  const windowLeft = Math.max(0, 10 - elapsed);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      {/* Card header */}
      <div className="flex items-start justify-between p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {statusBadge(dispute.status)}
            <span className="text-xs text-zinc-500 font-mono">#{dispute.id}</span>
            <span className="text-xs text-zinc-600">Match {dispute.matchId.slice(0, 8)}…</span>
            {!resolved && (
              <Badge className={`text-xs ${windowLeft > 0 ? "bg-amber-500/20 text-amber-400" : "bg-zinc-700/40 text-zinc-400"}`}>
                <Clock className="w-3 h-3 mr-1" />
                {windowLeft > 0 ? `${windowLeft}m left` : "Window closed"}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1 text-zinc-300">
              <User className="w-3.5 h-3.5 text-violet-400" />
              <span className="font-medium">{dispute.challengerName}</span>
              <span className="text-zinc-500 text-xs">challenger</span>
            </span>
            <span className="text-zinc-600">vs</span>
            <span className="flex items-center gap-1 text-zinc-300">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-medium">{dispute.claimedWinnerName}</span>
              <span className="text-zinc-500 text-xs">claimed winner</span>
            </span>
          </div>
          {dispute.prizeAmount > 0 && (
            <p className="text-xs text-amber-400 mt-1">💎 {dispute.prizeAmount} diamonds at stake</p>
          )}
        </div>
        <div className="text-right text-xs text-zinc-500 ml-3 shrink-0">
          {timeAgo(dispute.createdAt)}
        </div>
      </div>

      {/* Expandable evidence section */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-2 flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 border-t border-zinc-800 bg-zinc-900/50 transition-colors"
      >
        <Eye className="w-3.5 h-3.5" />
        {expanded ? "Hide" : "Show"} evidence & explanation
        {dispute.evidenceMediaIds.length > 0 && (
          <span className="ml-1 text-zinc-500">({dispute.evidenceMediaIds.length} file{dispute.evidenceMediaIds.length !== 1 ? "s" : ""})</span>
        )}
      </button>

      {expanded && (
        <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-950/40 space-y-3">
          {dispute.explanation ? (
            <div>
              <p className="text-xs text-zinc-500 mb-1 font-medium uppercase tracking-wide">Explanation</p>
              <p className="text-sm text-zinc-300 bg-zinc-900 rounded-lg px-3 py-2">{dispute.explanation}</p>
            </div>
          ) : (
            <p className="text-xs text-zinc-500 italic">No explanation provided.</p>
          )}
          <div>
            <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wide">Evidence Files</p>
            <EvidenceGallery mediaIds={dispute.evidenceMediaIds} />
          </div>
        </div>
      )}

      {/* Action buttons — only for open disputes */}
      {!resolved && onResolve && (
        <div className="flex gap-2 p-4 border-t border-zinc-800 bg-zinc-900/50">
          <Button
            onClick={() => onResolve("original_wins")}
            className="flex-1 bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-700 text-emerald-400 hover:text-white transition-colors text-sm h-9"
            variant="outline"
          >
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            Confirm Original
          </Button>
          <Button
            onClick={() => onResolve("challenger_wins")}
            className="flex-1 bg-violet-600/20 hover:bg-violet-600 border border-violet-700 text-violet-400 hover:text-white transition-colors text-sm h-9"
            variant="outline"
          >
            <Flag className="w-4 h-4 mr-1.5" />
            Award Challenger
          </Button>
        </div>
      )}

      {/* Resolution info for resolved disputes */}
      {resolved && dispute.resolvedAt && (
        <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-950/30">
          <p className="text-xs text-zinc-500">
            Resolved {timeAgo(dispute.resolvedAt)}
            {dispute.resolvedByAdminId ? ` · Admin #${dispute.resolvedByAdminId}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
