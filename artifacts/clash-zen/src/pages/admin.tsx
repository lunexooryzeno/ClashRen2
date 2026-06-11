import { useState, useEffect } from "react";
import { AdminPushPanel } from "@/components/admin-push-panel";
import { 
  useAdminGetStats, 
  useAdminListUsers, 
  useAdminAdjustDiamonds, 
  useAdminListTournaments, 
  useAdminCreateTournament, 
  useAdminUpdateTournament, 
  useAdminGetTournamentParticipants,
  useAdminUpdateParticipant,
  useAdminKickParticipant,
  useAdminToggleAdminRole,
  useAdminBlockUser,
  useAdminUnblockUser,
  useAdminBinUser,
  useAdminRestoreUser,
  useAdminPermanentDeleteUser,
  useAdminListBinnedUsers,
  getAdminGetStatsQueryKey,
  getAdminListUsersQueryKey,
  getAdminListBinnedUsersQueryKey,
  getAdminListTournamentsQueryKey,
  getAdminGetTournamentParticipantsQueryKey,
  CreateTournamentBodyStatus,
  Tournament,
  User,
  TournamentParticipantDetail,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { 
  ShieldAlert, ArrowLeft, Users, Trophy, Diamond, Plus, Trash2, Edit, 
  UserCog, Shield, ShieldOff, Search, Skull, Medal, X, Save,
  Ban, Unlock, ArchiveX, RotateCcw, Trash, AlertTriangle, Clock, CreditCard,
  Wrench, Gem, ChevronDown, ChevronUp, DollarSign, Crown, Ban as BanIcon,
  RefreshCw, CalendarClock, Undo2, Bell, XCircle, Timer, Minus, Megaphone, Radio,
  Flag, CheckCircle, Lightbulb, ShieldBan, CircleDot, MessageSquare,
  ScrollText, Wallet, Globe2, HeadphonesIcon, Phone, AtSign, Clock,
  KeyRound, Eye, EyeOff, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface TournamentFormState {
  title: string;
  gameMode: string;
  entryFeeDiamonds: string;
  prizePoolDiamonds: string;
  maxSlots: string;
  startTime: string;
  status: string;
  roomId: string;
  roomPassword: string;
}

const defaultForm: TournamentFormState = {
  title: "",
  gameMode: "squad",
  entryFeeDiamonds: "10",
  prizePoolDiamonds: "100",
  maxSlots: "48",
  startTime: "",
  status: "upcoming",
  roomId: "",
  roomPassword: "",
};

function toLocalDatetimeValue(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminPanel() {
  const { user } = useAuth();

  if (!user?.isAdmin) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="w-16 h-16 text-destructive mb-4" />
        <h1 className="font-heading text-3xl font-bold text-white mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-8">You do not have administrative privileges.</p>
        <Link href="/">
          <Button variant="outline" className="rounded-xl" data-testid="button-back-home">
            <ArrowLeft className="w-4 h-4 mr-2" /> Return to Home
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <div className="glass-panel p-4 flex items-center gap-4 sticky top-0 z-50">
        <Link href="/">
          <Button variant="ghost" size="icon" className="rounded-full w-10 h-10 shrink-0 text-white/70">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="font-heading text-xl font-bold text-white tracking-wide">ADMIN PANEL</h1>
          <p className="text-[10px] text-primary uppercase tracking-widest font-bold">Clash Ren Management</p>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        {/* Quick-access: Fraud Monitor */}
        <Link href="/admin/fraud">
          <div className="glass-card rounded-2xl p-4 border border-red-500/25 bg-red-500/5 hover:bg-red-500/10 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-300 font-heading tracking-wide">Fraud & Suspicious Activity Monitor</p>
              <p className="text-[11px] text-zinc-500">Live risk scores · Flagged users · Anti-fraud tools</p>
            </div>
            <Flag className="w-4 h-4 text-red-400/60 shrink-0" />
          </div>
        </Link>
        <AdminStats />
        <AdminDataPanel />
        <AdminPushPanel />
        <AdminTournaments />
        <AdminUsers />
        <AdminReports />
        <AdminAuditLogs />
        <AdminSystemSettings />
        <AdminSupportSettings />
      </div>
    </div>
  );
}

function AdminStats() {
  const { data: stats, isLoading } = useAdminGetStats();

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-2xl bg-white/5" />;
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="glass-card p-4 rounded-2xl flex flex-col gap-1">
        <Users className="w-5 h-5 text-primary mb-1" />
        <span className="text-2xl font-bold text-white">{stats?.totalUsers || 0}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Users</span>
      </div>
      <div className="glass-card p-4 rounded-2xl flex flex-col gap-1 border-diamond/20">
        <Diamond className="w-5 h-5 text-diamond mb-1" />
        <span className="text-2xl font-bold text-diamond">{stats?.totalDiamondsInCirculation || 0}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Diamonds Circulating</span>
      </div>
      <div className="glass-card p-4 rounded-2xl flex flex-col gap-1">
        <Diamond className="w-5 h-5 text-yellow-400 mb-1" />
        <span className="text-2xl font-bold text-yellow-400">{stats?.totalEntryFeesCollected || 0}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Entry Fees Collected</span>
      </div>
      <div className="glass-card p-4 rounded-2xl flex flex-col gap-1">
        <Trophy className="w-5 h-5 text-green-400 mb-1" />
        <span className="text-2xl font-bold text-green-400">{stats?.totalPrizesDistributed || 0}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Prizes Distributed</span>
      </div>
      <div className="glass-card p-4 rounded-2xl flex flex-col gap-1 col-span-2">
        <Trophy className="w-5 h-5 text-white/70 mb-1" />
        <div className="flex justify-between items-end">
          <span className="text-2xl font-bold text-white">{stats?.totalTournaments || 0}</span>
          <div className="flex gap-3 text-xs">
            <span className="text-primary font-bold">{stats?.upcomingTournaments || 0} UP</span>
            <span className="text-green-400 font-bold">{stats?.activeTournaments || 0} ON</span>
            <span className="text-white/50 font-bold">{stats?.completedTournaments || 0} DONE</span>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Tournaments</span>
      </div>
    </div>
  );
}

function TournamentFormFields({
  form,
  onChange,
  isEdit = false,
}: {
  form: TournamentFormState;
  onChange: (key: keyof TournamentFormState, value: string) => void;
  isEdit?: boolean;
}) {
  const inputClass = "bg-black/50 border-white/20 text-white h-10 rounded-lg";
  const labelClass = "text-xs text-muted-foreground uppercase tracking-wider";

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label className={labelClass}>Title</Label>
        <Input className={inputClass} value={form.title} onChange={e => onChange("title", e.target.value)} placeholder="Tournament name" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className={labelClass}>Game Mode</Label>
          <select
            className="w-full h-10 rounded-lg bg-black/50 border border-white/20 text-white text-sm px-3"
            value={form.gameMode}
            onChange={e => onChange("gameMode", e.target.value)}
          >
            <option value="solo">Solo</option>
            <option value="duo">Duo</option>
            <option value="squad">Squad</option>
            <option value="clash_squad">Clash Squad</option>
          </select>
        </div>
        <div>
          <Label className={labelClass}>Max Slots</Label>
          <Input className={inputClass} type="number" value={form.maxSlots} onChange={e => onChange("maxSlots", e.target.value)} placeholder="48" min="1" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className={labelClass}>Entry Fee 💎</Label>
          <Input className={inputClass} type="number" value={form.entryFeeDiamonds} onChange={e => onChange("entryFeeDiamonds", e.target.value)} placeholder="10" min="0" />
        </div>
        <div>
          <Label className={labelClass}>Prize Pool 💎</Label>
          <Input className={inputClass} type="number" value={form.prizePoolDiamonds} onChange={e => onChange("prizePoolDiamonds", e.target.value)} placeholder="100" min="0" />
        </div>
      </div>
      <div>
        <Label className={labelClass}>Start Time</Label>
        <Input className={inputClass} type="datetime-local" value={form.startTime} onChange={e => onChange("startTime", e.target.value)} />
      </div>
      {isEdit && (
        <div>
          <Label className={labelClass}>Status</Label>
          <select
            className="w-full h-10 rounded-lg bg-black/50 border border-white/20 text-white text-sm px-3"
            value={form.status}
            onChange={e => onChange("status", e.target.value)}
          >
            <option value="upcoming">Upcoming</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      )}
      {isEdit && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className={labelClass}>Room ID</Label>
            <Input className={inputClass} value={form.roomId} onChange={e => onChange("roomId", e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <Label className={labelClass}>Room Password</Label>
            <Input className={inputClass} value={form.roomPassword} onChange={e => onChange("roomPassword", e.target.value)} placeholder="Optional" />
          </div>
        </div>
      )}
    </div>
  );
}

type StatusFilter = "all" | "upcoming" | "ongoing" | "completed" | "cancelled";

const STATUS_PILLS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Upcoming", value: "upcoming" },
  { label: "Ongoing", value: "ongoing" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

function AdminTournaments() {
  const { data: tournaments, isLoading } = useAdminListTournaments();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [createForm, setCreateForm] = useState<TournamentFormState>(defaultForm);
  const [editForm, setEditForm] = useState<TournamentFormState>(defaultForm);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [playersForTournament, setPlayersForTournament] = useState<Tournament | null>(null);
  const [overrideForTournament, setOverrideForTournament] = useState<Tournament | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tournament | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteRemoveHistory, setDeleteRemoveHistory] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const createTournament = useAdminCreateTournament();
  const updateTournament = useAdminUpdateTournament();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getAdminListTournamentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getAdminGetStatsQueryKey() });
  };

  const patchCreate = (key: keyof TournamentFormState, value: string) =>
    setCreateForm(prev => ({ ...prev, [key]: value }));

  const patchEdit = (key: keyof TournamentFormState, value: string) =>
    setEditForm(prev => ({ ...prev, [key]: value }));

  const handleCreate = () => {
    if (!createForm.title || !createForm.startTime) {
      toast({ title: "Title and start time are required", variant: "destructive" });
      return;
    }
    createTournament.mutate(
      {
        data: {
          title: createForm.title,
          gameMode: createForm.gameMode,
          entryFeeDiamonds: parseInt(createForm.entryFeeDiamonds) || 0,
          prizePoolDiamonds: parseInt(createForm.prizePoolDiamonds) || 0,
          maxSlots: parseInt(createForm.maxSlots) || 48,
          startTime: new Date(createForm.startTime).toISOString(),
          status: CreateTournamentBodyStatus.upcoming,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Tournament created!" });
          setIsCreateOpen(false);
          setCreateForm(defaultForm);
        },
        onError: (err) => {
          toast({ title: "Failed to create tournament", description: String(err), variant: "destructive" });
        },
      }
    );
  };

  const handleEdit = (t: Tournament) => {
    setSelectedTournament(t);
    setEditForm({
      title: t.title,
      gameMode: t.gameMode,
      entryFeeDiamonds: String(t.entryFeeDiamonds),
      prizePoolDiamonds: String(t.prizePoolDiamonds),
      maxSlots: String(t.maxSlots),
      startTime: toLocalDatetimeValue(t.startTime),
      status: t.status,
      roomId: t.roomId || "",
      roomPassword: t.roomPassword || "",
    });
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedTournament || !editForm.title || !editForm.startTime) {
      toast({ title: "Title and start time are required", variant: "destructive" });
      return;
    }
    updateTournament.mutate(
      {
        id: selectedTournament.id,
        data: {
          title: editForm.title,
          gameMode: editForm.gameMode,
          entryFeeDiamonds: parseInt(editForm.entryFeeDiamonds) || 0,
          prizePoolDiamonds: parseInt(editForm.prizePoolDiamonds) || 0,
          maxSlots: parseInt(editForm.maxSlots) || 48,
          startTime: new Date(editForm.startTime).toISOString(),
          status: editForm.status as CreateTournamentBodyStatus,
          roomId: editForm.roomId || undefined,
          roomPassword: editForm.roomPassword || undefined,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Tournament updated!" });
          setIsEditOpen(false);
        },
        onError: (err) => {
          toast({ title: "Failed to update tournament", description: String(err), variant: "destructive" });
        },
      }
    );
  };

  const handleDelete = (tournament: Tournament) => {
    setDeleteTarget(tournament);
    setDeleteReason("");
    setDeleteRemoveHistory(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteLoading) return;
    setDeleteLoading(true);
    try {
      const reason = deleteReason.trim();
      if (deleteRemoveHistory) {
        await adminOverrideFetch(`/admin/tournaments/${deleteTarget.id}`, "DELETE", reason ? { reason } : undefined);
        invalidate();
        toast({ title: "Tournament deleted", description: "Removed from database and participants' history." });
      } else {
        await adminOverrideFetch(`/admin/tournaments/${deleteTarget.id}/cancel`, "POST", { reason: reason || undefined });
        invalidate();
        toast({ title: "Tournament cancelled", description: reason ? `Participants notified: "${reason}"` : "Participants refunded and notified. Match stays in their history." });
      }
      setDeleteTarget(null);
      setDeleteReason("");
      setDeleteRemoveHistory(false);
    } catch (err) {
      toast({ title: "Failed", description: String(err), variant: "destructive" });
    } finally {
      setDeleteLoading(false);
    }
  };

  const filtered = (tournaments ?? []).filter(t =>
    statusFilter === "all" ? true : t.status === statusFilter
  );

  return (
    <div className="glass-card rounded-2xl overflow-hidden flex flex-col">
      <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
        <h2 className="font-heading font-bold text-lg text-white">Tournaments</h2>
        <Button 
          size="sm" 
          className="rounded-full bg-primary hover:bg-primary/90 text-white px-4 h-8"
          onClick={() => { setCreateForm(defaultForm); setIsCreateOpen(true); }}
          data-testid="button-create-tournament"
        >
          <Plus className="w-4 h-4 mr-1" /> Create
        </Button>
      </div>

      <div className="flex gap-2 px-3 py-2 overflow-x-auto border-b border-white/5">
        {STATUS_PILLS.map(pill => (
          <button
            key={pill.value}
            onClick={() => setStatusFilter(pill.value)}
            className={`shrink-0 text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full transition-colors ${
              statusFilter === pill.value
                ? "bg-primary text-white"
                : "bg-white/10 text-white/50 hover:bg-white/20"
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>
      
      <div className="flex flex-col max-h-[300px] overflow-y-auto">
        {isLoading ? (
          <div className="p-4"><Skeleton className="h-20 w-full" /></div>
        ) : filtered.length ? (
          filtered.map(t => (
            <div key={t.id} className="p-3 border-b border-white/5 flex items-center justify-between hover:bg-white/5" data-testid={`admin-row-tournament-${t.id}`}>
              <div>
                <div className="font-bold text-white text-sm">{t.title}</div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className={`text-[8px] uppercase px-1.5 py-0 h-4 border-none ${t.status === 'upcoming' ? 'bg-primary/20 text-primary' : t.status === 'ongoing' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/50'}`}>
                    {t.status}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{format(new Date(t.startTime), "MMM d, HH:mm")}</span>
                  <span className="text-[10px] text-muted-foreground">{t.filledSlots}/{t.maxSlots}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="w-8 h-8 text-white/50 hover:text-white" 
                  onClick={() => setPlayersForTournament(t)}
                  title="View players"
                  data-testid={`button-players-tournament-${t.id}`}
                >
                  <Users className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-8 h-8 text-orange-400/70 hover:text-orange-400 hover:bg-orange-500/10"
                  onClick={() => setOverrideForTournament(t)}
                  title="Match Override Controls"
                  data-testid={`button-override-tournament-${t.id}`}
                >
                  <Wrench className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="w-8 h-8 text-white/50 hover:text-white" onClick={() => handleEdit(t)} data-testid={`button-edit-tournament-${t.id}`}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="w-8 h-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(t)} data-testid={`button-delete-tournament-${t.id}`}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="p-4 text-center text-sm text-muted-foreground">No tournaments found</div>
        )}
      </div>

      {playersForTournament && (
        <ParticipantsDialog
          tournament={playersForTournament}
          onClose={() => setPlayersForTournament(null)}
        />
      )}

      {/* Delete with reason dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="bg-[#151025] border-white/10 text-white max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg text-red-400 flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Delete Tournament
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-400 font-semibold">Cancellation Reason <span className="text-zinc-600 font-normal">(optional)</span></label>
              <textarea
                className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-600 px-3 py-2.5 resize-none focus:outline-none focus:border-primary/50"
                rows={2}
                placeholder="e.g. Not enough players, technical issues..."
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
              />
            </div>
            <button
              onClick={() => setDeleteRemoveHistory(v => !v)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
              style={{
                background: deleteRemoveHistory ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)",
                border: deleteRemoveHistory ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                className="w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors"
                style={{ background: deleteRemoveHistory ? "rgba(239,68,68,0.7)" : "rgba(255,255,255,0.08)", border: deleteRemoveHistory ? "1px solid rgba(239,68,68,0.8)" : "1px solid rgba(255,255,255,0.15)" }}
              >
                {deleteRemoveHistory && <span className="text-white text-[10px] font-black leading-none">✓</span>}
              </div>
              <div className="flex-1">
                <p className="text-[12px] font-bold text-zinc-200">Also remove from users' match history</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  {deleteRemoveHistory
                    ? "Will hard-delete — disappears from all participants' history."
                    : "Default: cancels & keeps it in history as \"Cancelled\"."}
                </p>
              </div>
            </button>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-white/10" onClick={() => setDeleteTarget(null)}>Back</Button>
            <Button
              variant="destructive"
              className="font-bold"
              onClick={confirmDelete}
              disabled={deleteLoading}
            >
              {deleteLoading ? "Working..." : deleteRemoveHistory ? "Delete & Remove" : "Cancel & Notify"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {overrideForTournament && (
        <MatchOverrideDialog
          tournament={overrideForTournament}
          onClose={() => setOverrideForTournament(null)}
          onRefresh={() => {
            queryClient.invalidateQueries({ queryKey: getAdminListTournamentsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getAdminGetStatsQueryKey() });
          }}
        />
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="bg-[#151025] border-white/10 text-white max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">Create Tournament</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <TournamentFormFields form={createForm} onChange={patchCreate} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-white/10" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button
              className="bg-primary hover:bg-primary/90 text-white font-bold"
              onClick={handleCreate}
              disabled={createTournament.isPending}
              data-testid="button-confirm-create-tournament"
            >
              {createTournament.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="bg-[#151025] border-white/10 text-white max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">Edit Tournament</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <TournamentFormFields form={editForm} onChange={patchEdit} isEdit />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-white/10" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button
              className="bg-primary hover:bg-primary/90 text-white font-bold"
              onClick={handleUpdate}
              disabled={updateTournament.isPending}
              data-testid="button-confirm-edit-tournament"
            >
              {updateTournament.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ParticipantRow extends TournamentParticipantDetail {
  dirtyKills?: number;
  dirtyPlacement?: number | null;
  dirtyDiamondsWon?: number;
}

function ParticipantsDialog({ tournament, onClose }: { tournament: Tournament; onClose: () => void }) {
  const { data: participants, isLoading } = useAdminGetTournamentParticipants(tournament.id);
  const updateParticipant = useAdminUpdateParticipant();
  const kickParticipant = useAdminKickParticipant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [localRows, setLocalRows] = useState<Record<number, ParticipantRow>>({});

  const getRow = (p: TournamentParticipantDetail): ParticipantRow =>
    localRows[p.userId] ?? p;

  const patchRow = (userId: number, patch: Partial<ParticipantRow>) => {
    setLocalRows(prev => ({
      ...prev,
      [userId]: { ...(prev[userId] ?? participants?.find(p => p.userId === userId)!), ...patch },
    }));
  };

  const isDirty = (p: TournamentParticipantDetail) => {
    const r = localRows[p.userId];
    if (!r) return false;
    return (
      (r.dirtyKills !== undefined && r.dirtyKills !== p.kills) ||
      (r.dirtyPlacement !== undefined && r.dirtyPlacement !== p.placement) ||
      (r.dirtyDiamondsWon !== undefined && r.dirtyDiamondsWon !== p.diamondsWon)
    );
  };

  const handleSaveAll = async () => {
    if (!participants) return;
    const dirtyParticipants = participants.filter(isDirty);
    if (!dirtyParticipants.length) {
      toast({ title: "No changes to save" });
      return;
    }

    try {
      for (const p of dirtyParticipants) {
        const r = localRows[p.userId];
        await updateParticipant.mutateAsync({
          id: tournament.id,
          userId: p.userId,
          data: {
            kills: r.dirtyKills ?? p.kills,
            placement: r.dirtyPlacement !== undefined ? r.dirtyPlacement : p.placement,
            diamondsWon: r.dirtyDiamondsWon ?? p.diamondsWon,
          },
        });
      }
      queryClient.invalidateQueries({ queryKey: getAdminGetTournamentParticipantsQueryKey(tournament.id) });
      queryClient.invalidateQueries({ queryKey: getAdminGetStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
      setLocalRows({});
      toast({ title: "Results saved and prizes credited!" });
    } catch (err) {
      toast({ title: "Failed to save results", description: String(err), variant: "destructive" });
    }
  };

  const handleKick = (p: TournamentParticipantDetail) => {
    if (!confirm(`Remove ${p.inGameName || p.phone} and refund their entry fee?`)) return;
    kickParticipant.mutate(
      { id: tournament.id, userId: p.userId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminGetTournamentParticipantsQueryKey(tournament.id) });
          queryClient.invalidateQueries({ queryKey: getAdminListTournamentsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getAdminGetStatsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
          toast({ title: "Player removed and entry fee refunded" });
        },
        onError: (err) => {
          toast({ title: "Failed to kick player", description: String(err), variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-[#151025] border-white/10 text-white max-w-sm rounded-2xl max-h-[80dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-heading text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            {tournament.title} — Players
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto flex flex-col gap-0 -mx-1 px-1">
          {isLoading ? (
            <Skeleton className="h-24 w-full bg-white/5 rounded-lg" />
          ) : !participants?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">No registered players</p>
          ) : (
            participants.map(p => {
              const row = getRow(p);
              return (
                <div key={p.userId} className="border-b border-white/5 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-white text-sm">{p.inGameName || p.phone}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleKick(p)}
                      title="Kick player"
                      data-testid={`button-kick-${p.userId}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-0.5">
                        <Skull className="w-3 h-3" /> Kills
                      </label>
                      <Input
                        type="number"
                        min="0"
                        className="bg-black/40 border-white/10 text-white h-7 text-xs rounded-md px-2"
                        value={row.dirtyKills ?? row.kills}
                        onChange={e => patchRow(p.userId, { dirtyKills: parseInt(e.target.value) || 0 })}
                        data-testid={`input-kills-${p.userId}`}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-0.5">
                        <Medal className="w-3 h-3" /> Place
                      </label>
                      <Input
                        type="number"
                        min="1"
                        className="bg-black/40 border-white/10 text-white h-7 text-xs rounded-md px-2"
                        value={row.dirtyPlacement ?? (row.placement ?? "")}
                        onChange={e => patchRow(p.userId, { dirtyPlacement: e.target.value ? parseInt(e.target.value) : null })}
                        data-testid={`input-placement-${p.userId}`}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-0.5">
                        <Diamond className="w-3 h-3 text-diamond" /> Won
                      </label>
                      <Input
                        type="number"
                        min="0"
                        className="bg-black/40 border-white/10 text-white h-7 text-xs rounded-md px-2"
                        value={row.dirtyDiamondsWon ?? row.diamondsWon}
                        onChange={e => patchRow(p.userId, { dirtyDiamondsWon: parseInt(e.target.value) || 0 })}
                        data-testid={`input-diamonds-won-${p.userId}`}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="pt-2 gap-2">
          <Button variant="outline" className="border-white/10 flex-1" onClick={onClose}>Close</Button>
          <Button
            className="bg-primary hover:bg-primary/90 text-white font-bold flex-1"
            onClick={handleSaveAll}
            disabled={updateParticipant.isPending}
            data-testid="button-save-results"
          >
            <Save className="w-4 h-4 mr-1" />
            {updateParticipant.isPending ? "Saving..." : "Save Results"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── MATCH OVERRIDE DIALOG ─────────────────────────────────────────────────────

async function adminOverrideFetch(path: string, method: string, body?: object) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

function OverrideSection({
  title, icon, accentClass, children, open, onToggle,
}: {
  title: string; icon: React.ReactNode; accentClass: string;
  children: React.ReactNode; open: boolean; onToggle: () => void;
}) {
  return (
    <div className="rounded-xl overflow-hidden border border-white/8">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
        onClick={onToggle}
      >
        <span className={`flex items-center gap-2 text-sm font-semibold ${accentClass}`}>
          {icon}{title}
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-white/5 flex flex-col gap-3">
          {children}
        </div>
      )}
    </div>
  );
}

function MatchOverrideDialog({
  tournament, onClose, onRefresh,
}: {
  tournament: Tournament;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { data: participants, isLoading: partLoading } = useAdminGetTournamentParticipants(tournament.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (s: string) => setOpenSection(prev => prev === s ? null : s);

  // Set Winner state
  const [swUserId, setSwUserId] = useState("");
  const [swKills, setSwKills] = useState("0");
  const [swPlacement, setSwPlacement] = useState("1");
  const [swDiamonds, setSwDiamonds] = useState("0");

  // Force Payout state
  const [fpUserId, setFpUserId] = useState("");
  const [fpAmount, setFpAmount] = useState("");
  const [fpReason, setFpReason] = useState("");

  // Revoke Payout state
  const [rvUserId, setRvUserId] = useState("");
  const [rvReason, setRvReason] = useState("");

  // Redraw Room state
  const [rdRoomId, setRdRoomId] = useState(tournament.roomId || "");
  const [rdRoomPassword, setRdRoomPassword] = useState(tournament.roomPassword || "");

  // Reschedule state
  const [rsTime, setRsTime] = useState(() => {
    const d = new Date(tournament.startTime);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [rsReason, setRsReason] = useState("");

  // Resend Reward state
  const [rrUserId, setRrUserId] = useState("");

  // Cancel Match reason state
  const [cancelMatchReason, setCancelMatchReason] = useState("");

  // Cancel Reward state
  const [crUserId, setCrUserId] = useState("");
  const [crDeduct, setCrDeduct] = useState(true);
  const [crReason, setCrReason] = useState("");

  // Schedule Reward state
  const [srUserId, setSrUserId] = useState("");
  const [srAmount, setSrAmount] = useState("");
  const [srReason, setSrReason] = useState("");
  const [srTime, setSrTime] = useState("");
  const [scheduledList, setScheduledList] = useState<{ id: number; userId: number; amount: number; reason: string | null; scheduledFor: string; status: string }[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);

  const fetchScheduled = async () => {
    setScheduledLoading(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${tournament.id}/scheduled-rewards`, { credentials: "include" });
      if (res.ok) setScheduledList(await res.json());
    } finally { setScheduledLoading(false); }
  };

  // Bulk Reward state
  const [bulkRows, setBulkRows] = useState<{ userId: string; amount: string; reason: string }[]>([{ userId: "", amount: "", reason: "" }]);

  // Broadcast state
  const [broadTitle, setBroadTitle] = useState("");
  const [broadBody, setBroadBody] = useState("");
  const [broadType, setBroadType] = useState("tournament");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getAdminListTournamentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getAdminGetStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getAdminGetTournamentParticipantsQueryKey(tournament.id) });
    onRefresh();
  };

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast({ title: `${label} — done` });
      invalidate();
    } catch (e) {
      toast({ title: `${label} failed`, description: String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const participantSelect = (value: string, onChange: (v: string) => void) => (
    <select
      className="w-full bg-black/50 border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-white/20"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">— select player —</option>
      {(participants ?? []).map(p => (
        <option key={p.userId} value={String(p.userId)}>
          {p.inGameName || p.phone} {p.diamondsWon > 0 ? `(${p.diamondsWon}💎)` : ""}
        </option>
      ))}
    </select>
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-[#151025] border-white/10 text-white max-w-sm rounded-2xl max-h-[85dvh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-white/8 shrink-0">
          <DialogTitle className="font-heading text-base flex items-center gap-2">
            <Wrench className="w-4 h-4 text-orange-400" />
            Match Override
          </DialogTitle>
          <p className="text-[11px] text-zinc-500 mt-0.5 font-normal">{tournament.title} · {tournament.status}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
          {partLoading && <Skeleton className="h-10 w-full bg-white/5 rounded-lg" />}

          {/* Set Winner */}
          <OverrideSection title="Set Winner" icon={<Crown className="w-3.5 h-3.5" />} accentClass="text-yellow-400" open={openSection === "winner"} onToggle={() => toggle("winner")}>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Player</label>
              {participantSelect(swUserId, setSwUserId)}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Kills</label>
                  <Input type="number" min="0" className="bg-black/40 border-white/10 text-white h-8 text-xs" value={swKills} onChange={e => setSwKills(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Place</label>
                  <Input type="number" min="1" className="bg-black/40 border-white/10 text-white h-8 text-xs" value={swPlacement} onChange={e => setSwPlacement(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-0.5 mb-1"><Gem className="w-3 h-3 text-yellow-400" /> Won</label>
                  <Input type="number" min="0" className="bg-black/40 border-white/10 text-white h-8 text-xs" value={swDiamonds} onChange={e => setSwDiamonds(e.target.value)} />
                </div>
              </div>
              <Button
                size="sm"
                className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border border-yellow-500/25 font-bold"
                disabled={!swUserId || busy}
                onClick={() => run("Set Winner", () => adminOverrideFetch(
                  `/admin/tournaments/${tournament.id}/set-winner`, "POST",
                  { userId: parseInt(swUserId), kills: parseInt(swKills) || 0, placement: parseInt(swPlacement) || 1, diamondsWon: parseInt(swDiamonds) || 0 }
                ))}
              >
                <Crown className="w-3.5 h-3.5 mr-1" /> Set Winner
              </Button>
            </div>
          </OverrideSection>

          {/* Force Payout */}
          <OverrideSection title="Force Payout" icon={<DollarSign className="w-3.5 h-3.5" />} accentClass="text-emerald-400" open={openSection === "payout"} onToggle={() => toggle("payout")}>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Player</label>
              {participantSelect(fpUserId, setFpUserId)}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-0.5 mb-1"><Gem className="w-3 h-3 text-emerald-400" /> Amount</label>
                  <Input type="number" min="1" placeholder="diamonds" className="bg-black/40 border-white/10 text-white h-8 text-xs" value={fpAmount} onChange={e => setFpAmount(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Reason (opt)</label>
                  <Input placeholder="e.g. system error" className="bg-black/40 border-white/10 text-white h-8 text-xs" value={fpReason} onChange={e => setFpReason(e.target.value)} />
                </div>
              </div>
              <Button
                size="sm"
                className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/25 font-bold"
                disabled={!fpUserId || !fpAmount || busy}
                onClick={() => run("Force Payout", () => adminOverrideFetch(
                  `/admin/tournaments/${tournament.id}/force-payout`, "POST",
                  { userId: parseInt(fpUserId), amount: parseInt(fpAmount), reason: fpReason || undefined }
                ))}
              >
                <DollarSign className="w-3.5 h-3.5 mr-1" /> Force Payout
              </Button>
            </div>
          </OverrideSection>

          {/* Revoke Payout */}
          <OverrideSection title="Revoke Payout" icon={<Undo2 className="w-3.5 h-3.5" />} accentClass="text-orange-400" open={openSection === "revoke"} onToggle={() => toggle("revoke")}>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Player</label>
              {participantSelect(rvUserId, setRvUserId)}
              {rvUserId && participants && (
                <p className="text-[11px] text-orange-300 bg-orange-500/10 rounded-lg px-3 py-1.5">
                  Will revoke {participants.find(p => String(p.userId) === rvUserId)?.diamondsWon ?? 0} 💎 from this player
                </p>
              )}
              <Input placeholder="Reason (optional)" className="bg-black/40 border-white/10 text-white h-8 text-xs" value={rvReason} onChange={e => setRvReason(e.target.value)} />
              <Button
                size="sm"
                className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/25 font-bold"
                disabled={!rvUserId || busy}
                onClick={() => run("Revoke Payout", () => adminOverrideFetch(
                  `/admin/tournaments/${tournament.id}/revoke-payout`, "POST",
                  { userId: parseInt(rvUserId), reason: rvReason || undefined }
                ))}
              >
                <Undo2 className="w-3.5 h-3.5 mr-1" /> Revoke Payout
              </Button>
            </div>
          </OverrideSection>

          {/* Redraw Room */}
          <OverrideSection title="Redraw Room" icon={<RefreshCw className="w-3.5 h-3.5" />} accentClass="text-cyan-400" open={openSection === "redraw"} onToggle={() => toggle("redraw")}>
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-zinc-500">Set new room credentials and notify all participants.</p>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">New Room ID</label>
                <Input placeholder="Room ID" className="bg-black/40 border-white/10 text-white h-8 text-xs" value={rdRoomId} onChange={e => setRdRoomId(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">New Password</label>
                <Input placeholder="Room Password" className="bg-black/40 border-white/10 text-white h-8 text-xs" value={rdRoomPassword} onChange={e => setRdRoomPassword(e.target.value)} />
              </div>
              <Button
                size="sm"
                className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/25 font-bold"
                disabled={busy}
                onClick={() => run("Redraw Room", () => adminOverrideFetch(
                  `/admin/tournaments/${tournament.id}/redraw`, "POST",
                  { roomId: rdRoomId || undefined, roomPassword: rdRoomPassword || undefined }
                ))}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Save New Room
              </Button>
            </div>
          </OverrideSection>

          {/* Reschedule */}
          <OverrideSection title="Reschedule" icon={<CalendarClock className="w-3.5 h-3.5" />} accentClass="text-violet-400" open={openSection === "reschedule"} onToggle={() => toggle("reschedule")}>
            <div className="flex flex-col gap-2">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">New Start Time</label>
                <Input
                  type="datetime-local"
                  className="bg-black/40 border-white/10 text-white h-8 text-xs"
                  value={rsTime}
                  onChange={e => setRsTime(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Reason (optional)</label>
                <Input placeholder="e.g. Server maintenance" className="bg-black/40 border-white/10 text-white h-8 text-xs" value={rsReason} onChange={e => setRsReason(e.target.value)} />
              </div>
              <Button
                size="sm"
                className="bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/25 font-bold"
                disabled={!rsTime || busy}
                onClick={() => run("Reschedule", () => adminOverrideFetch(
                  `/admin/tournaments/${tournament.id}/reschedule`, "PATCH",
                  { startTime: new Date(rsTime).toISOString(), reason: rsReason || undefined }
                ))}
              >
                <CalendarClock className="w-3.5 h-3.5 mr-1" /> Reschedule Match
              </Button>
            </div>
          </OverrideSection>

          {/* Resend Reward */}
          <OverrideSection title="Resend Reward" icon={<Bell className="w-3.5 h-3.5" />} accentClass="text-sky-400" open={openSection === "resend"} onToggle={() => toggle("resend")}>
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-zinc-500">Re-send the prize notification to a participant who already has diamonds won.</p>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Player</label>
              {participantSelect(rrUserId, setRrUserId)}
              {rrUserId && participants && (
                <p className="text-[11px] text-sky-300 bg-sky-500/10 rounded-lg px-3 py-1.5">
                  Will resend: {participants.find(p => String(p.userId) === rrUserId)?.diamondsWon ?? 0} 💎 notification
                </p>
              )}
              <Button
                size="sm"
                className="bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/25 font-bold"
                disabled={!rrUserId || busy}
                onClick={() => run("Resend Reward", () => adminOverrideFetch(
                  `/admin/tournaments/${tournament.id}/resend-reward`, "POST",
                  { userId: parseInt(rrUserId) }
                ))}
              >
                <Bell className="w-3.5 h-3.5 mr-1" /> Resend Notification
              </Button>
            </div>
          </OverrideSection>

          {/* Cancel Reward */}
          <OverrideSection title="Cancel Reward" icon={<XCircle className="w-3.5 h-3.5" />} accentClass="text-rose-400" open={openSection === "cancel-reward"} onToggle={() => toggle("cancel-reward")}>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Player</label>
              {participantSelect(crUserId, setCrUserId)}
              {crUserId && participants && (
                <p className="text-[11px] text-rose-300 bg-rose-500/10 rounded-lg px-3 py-1.5">
                  Will cancel {participants.find(p => String(p.userId) === crUserId)?.diamondsWon ?? 0} 💎 reward
                </p>
              )}
              <Input placeholder="Reason (optional)" className="bg-black/40 border-white/10 text-white h-8 text-xs" value={crReason} onChange={e => setCrReason(e.target.value)} />
              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={crDeduct}
                  onChange={e => setCrDeduct(e.target.checked)}
                  className="accent-rose-500"
                />
                Deduct diamonds from balance
              </label>
              <Button
                size="sm"
                className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/25 font-bold"
                disabled={!crUserId || busy}
                onClick={() => {
                  if (!confirm(`Cancel reward for this player${crDeduct ? " and deduct from balance" : ""}?`)) return;
                  run("Cancel Reward", () => adminOverrideFetch(
                    `/admin/tournaments/${tournament.id}/cancel-reward`, "POST",
                    { userId: parseInt(crUserId), deductBalance: crDeduct, reason: crReason || undefined }
                  ));
                }}
              >
                <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel Reward
              </Button>
            </div>
          </OverrideSection>

          {/* Schedule Reward */}
          <OverrideSection
            title="Schedule Reward"
            icon={<Timer className="w-3.5 h-3.5" />}
            accentClass="text-purple-400"
            open={openSection === "schedule"}
            onToggle={() => { toggle("schedule"); if (openSection !== "schedule") fetchScheduled(); }}
          >
            <div className="flex flex-col gap-2">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Player</label>
              {participantSelect(srUserId, setSrUserId)}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-0.5 mb-1"><Gem className="w-3 h-3 text-purple-400" /> Amount</label>
                  <Input type="number" min="1" placeholder="diamonds" className="bg-black/40 border-white/10 text-white h-8 text-xs" value={srAmount} onChange={e => setSrAmount(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Reason (opt)</label>
                  <Input placeholder="e.g. Runner up" className="bg-black/40 border-white/10 text-white h-8 text-xs" value={srReason} onChange={e => setSrReason(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Schedule Time</label>
                <Input type="datetime-local" className="bg-black/40 border-white/10 text-white h-8 text-xs" value={srTime} onChange={e => setSrTime(e.target.value)} />
              </div>
              <Button
                size="sm"
                className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/25 font-bold"
                disabled={!srUserId || !srAmount || !srTime || busy}
                onClick={() => run("Schedule Reward", () => adminOverrideFetch(
                  `/admin/tournaments/${tournament.id}/schedule-reward`, "POST",
                  { userId: parseInt(srUserId), amount: parseInt(srAmount), scheduledFor: new Date(srTime).toISOString(), reason: srReason || undefined }
                ).then(r => { fetchScheduled(); return r; }))}
              >
                <Timer className="w-3.5 h-3.5 mr-1" /> Schedule Reward
              </Button>

              {/* Pending scheduled rewards */}
              {scheduledLoading && <Skeleton className="h-8 w-full bg-white/5 rounded-lg" />}
              {scheduledList.filter(s => s.status === "pending").length > 0 && (
                <div className="mt-1">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Pending Scheduled</p>
                  <div className="flex flex-col gap-1">
                    {scheduledList.filter(s => s.status === "pending").map(s => (
                      <div key={s.id} className="flex items-center justify-between gap-2 bg-white/4 rounded-lg px-3 py-1.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-white">User #{s.userId} · +{s.amount} 💎</p>
                          <p className="text-[10px] text-zinc-500 truncate">{new Date(s.scheduledFor).toLocaleString()} · {s.reason || "—"}</p>
                        </div>
                        <button
                          className="text-[10px] text-red-400 hover:text-red-300 font-bold shrink-0"
                          onClick={async () => {
                            if (!confirm("Cancel this scheduled reward?")) return;
                            try {
                              await adminOverrideFetch(`/admin/scheduled-rewards/${s.id}`, "DELETE");
                              fetchScheduled();
                              toast({ title: "Scheduled reward cancelled" });
                            } catch (e) {
                              toast({ title: "Failed", description: String(e), variant: "destructive" });
                            }
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </OverrideSection>

          {/* Bulk Reward Winners */}
          <OverrideSection title="Bulk Reward Winners" icon={<Trophy className="w-3.5 h-3.5" />} accentClass="text-amber-400" open={openSection === "bulk"} onToggle={() => toggle("bulk")}>
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-zinc-500">Credit multiple winners at once. Each row is independent.</p>
              {bulkRows.map((row, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <select
                    className="flex-1 bg-black/50 border border-white/10 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none min-w-0"
                    value={row.userId}
                    onChange={e => setBulkRows(rows => rows.map((r, j) => j === i ? { ...r, userId: e.target.value } : r))}
                  >
                    <option value="">Player</option>
                    {(participants ?? []).map(p => (
                      <option key={p.userId} value={String(p.userId)}>{p.inGameName || p.phone}</option>
                    ))}
                  </select>
                  <Input
                    type="number" min="1" placeholder="💎"
                    className="w-16 bg-black/40 border-white/10 text-white h-8 text-xs shrink-0"
                    value={row.amount}
                    onChange={e => setBulkRows(rows => rows.map((r, j) => j === i ? { ...r, amount: e.target.value } : r))}
                  />
                  <Input
                    placeholder="reason"
                    className="flex-1 bg-black/40 border-white/10 text-white h-8 text-xs min-w-0"
                    value={row.reason}
                    onChange={e => setBulkRows(rows => rows.map((r, j) => j === i ? { ...r, reason: e.target.value } : r))}
                  />
                  {bulkRows.length > 1 && (
                    <button onClick={() => setBulkRows(rows => rows.filter((_, j) => j !== i))} className="text-zinc-500 hover:text-red-400 shrink-0">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  size="sm" variant="outline"
                  className="border-white/10 text-zinc-400 h-7 text-xs flex-1"
                  onClick={() => setBulkRows(rows => [...rows, { userId: "", amount: "", reason: "" }])}
                >
                  <Plus className="w-3 h-3 mr-1" /> Add Row
                </Button>
                <Button
                  size="sm"
                  className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/25 font-bold h-7 text-xs flex-1"
                  disabled={busy || bulkRows.every(r => !r.userId || !r.amount)}
                  onClick={() => {
                    const valid = bulkRows.filter(r => r.userId && r.amount && parseInt(r.amount) > 0);
                    if (valid.length === 0) return;
                    if (!confirm(`Send ${valid.length} reward(s) to ${valid.length} player(s)?`)) return;
                    run("Bulk Reward", () => adminOverrideFetch(
                      `/admin/tournaments/${tournament.id}/bulk-reward`, "POST",
                      { rewards: valid.map(r => ({ userId: parseInt(r.userId), amount: parseInt(r.amount), reason: r.reason || undefined })) }
                    ).then(r => { setBulkRows([{ userId: "", amount: "", reason: "" }]); return r; }));
                  }}
                >
                  <Trophy className="w-3 h-3 mr-1" /> Send All
                </Button>
              </div>
            </div>
          </OverrideSection>

          {/* Match Reminder */}
          <OverrideSection title="Match Reminder" icon={<Bell className="w-3.5 h-3.5" />} accentClass="text-sky-400" open={openSection === "reminder"} onToggle={() => toggle("reminder")}>
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-zinc-500">Send a match reminder to all <strong className="text-white">{(participants ?? []).length}</strong> participant(s).</p>
              <div className="rounded-lg bg-sky-500/10 border border-sky-500/20 px-3 py-2 flex flex-col gap-1">
                <p className="text-[10px] text-sky-400 font-bold uppercase tracking-wider">Quick Remind</p>
                <p className="text-[11px] text-sky-300/80">Sends a pre-built reminder: "Your match <strong>{tournament.title}</strong> is starting soon. Join with the room credentials provided."</p>
              </div>
              <Button
                size="sm"
                className="bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/25 font-bold h-7 text-xs"
                disabled={busy || (participants ?? []).length === 0}
                onClick={() => {
                  if (!confirm(`Send match reminder to all ${(participants ?? []).length} participant(s)?`)) return;
                  run("Match Reminder", () => adminOverrideFetch(
                    `/admin/tournaments/${tournament.id}/notify-all`, "POST",
                    {
                      type: "tournament",
                      title: `Match Reminder: ${tournament.title}`,
                      body: `Your match "${tournament.title}" is starting soon! Please join the room with the credentials provided and be ready on time. Good luck!`,
                    }
                  ));
                }}
              >
                <Bell className="w-3 h-3 mr-1" /> Send to All
              </Button>
            </div>
          </OverrideSection>

          {/* Broadcast Message */}
          <OverrideSection title="Broadcast Message" icon={<Megaphone className="w-3.5 h-3.5" />} accentClass="text-amber-400" open={openSection === "broadcast"} onToggle={() => toggle("broadcast")}>
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-zinc-500">Send a custom message to all <strong className="text-white">{(participants ?? []).length}</strong> participant(s).</p>
              <select
                value={broadType}
                onChange={e => setBroadType(e.target.value)}
                className="w-full h-8 rounded-lg bg-black/50 border border-white/10 text-white text-xs px-3 focus:outline-none"
              >
                {["tournament", "general", "result", "wallet", "moderation", "system"].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <Input
                placeholder="Title..."
                className="bg-black/40 border-white/10 text-white h-8 text-xs"
                value={broadTitle}
                onChange={e => setBroadTitle(e.target.value)}
              />
              <textarea
                placeholder="Message body..."
                value={broadBody}
                onChange={e => setBroadBody(e.target.value)}
                rows={3}
                className="w-full rounded-lg bg-black/40 border border-white/10 text-white text-xs px-3 py-2 resize-none placeholder:text-zinc-600 focus:outline-none"
              />
              <Button
                size="sm"
                className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/25 font-bold h-7 text-xs"
                disabled={busy || !broadTitle.trim() || !broadBody.trim() || (participants ?? []).length === 0}
                onClick={() => {
                  if (!confirm(`Broadcast "${broadTitle}" to all ${(participants ?? []).length} participant(s)?`)) return;
                  run("Broadcast", () => adminOverrideFetch(
                    `/admin/tournaments/${tournament.id}/notify-all`, "POST",
                    { type: broadType, title: broadTitle.trim(), body: broadBody.trim() }
                  ).then(r => { setBroadTitle(""); setBroadBody(""); return r; }));
                }}
              >
                <Megaphone className="w-3 h-3 mr-1" /> Broadcast to All
              </Button>
            </div>
          </OverrideSection>

          {/* Cancel Match */}
          <OverrideSection title="Cancel Match" icon={<BanIcon className="w-3.5 h-3.5" />} accentClass="text-red-400" open={openSection === "cancel"} onToggle={() => toggle("cancel")}>
            <div className="flex flex-col gap-3">
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5">
                <p className="text-xs font-bold text-red-300 mb-0.5">Danger Zone</p>
                <p className="text-[11px] text-red-400/80">
                  This will mark the match as <strong>cancelled</strong> and refund all{" "}
                  {tournament.entryFeeDiamonds > 0 ? `${tournament.entryFeeDiamonds}💎` : ""} entry fees
                  to every participant. This cannot be undone.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-zinc-400 font-semibold">Cancellation Reason <span className="text-zinc-600 font-normal">(optional)</span></label>
                <textarea
                  className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-600 px-3 py-2 resize-none focus:outline-none focus:border-red-500/40"
                  rows={2}
                  placeholder="e.g. Not enough players, technical issues..."
                  value={cancelMatchReason}
                  onChange={(e) => setCancelMatchReason(e.target.value)}
                  disabled={busy || tournament.status === "cancelled"}
                />
              </div>
              <Button
                size="sm"
                variant="destructive"
                className="font-bold"
                disabled={busy || tournament.status === "cancelled"}
                onClick={() => {
                  if (!confirm(`Cancel "${tournament.title}" and refund all entry fees?`)) return;
                  run("Cancel Match", () => adminOverrideFetch(
                    `/admin/tournaments/${tournament.id}/cancel`, "POST",
                    { reason: cancelMatchReason.trim() || undefined }
                  )).then(() => { setCancelMatchReason(""); onClose(); });
                }}
              >
                <BanIcon className="w-3.5 h-3.5 mr-1" />
                {tournament.status === "cancelled" ? "Already Cancelled" : "Cancel Match & Refund All"}
              </Button>
            </div>
          </OverrideSection>
        </div>

        <div className="px-4 py-3 border-t border-white/8 shrink-0">
          <Button variant="outline" className="border-white/10 w-full text-sm" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type UserTab = "active" | "bin";

function daysUntilPermanentDelete(deletedAt: string): number {
  const ms = 15 * 24 * 60 * 60 * 1000 - (Date.now() - new Date(deletedAt).getTime());
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function AdminUsers() {
  const { data: users, isLoading } = useAdminListUsers();
  const { data: binnedUsers, isLoading: binLoading } = useAdminListBinnedUsers();
  const [tab, setTab] = useState<UserTab>("active");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [confirmAdminUser, setConfirmAdminUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [blockUser, setBlockUser] = useState<User | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [blockUntil, setBlockUntil] = useState("");

  const [binUser, setBinUser] = useState<User | null>(null);
  const [binReason, setBinReason] = useState("");

  const [confirmPermDelete, setConfirmPermDelete] = useState<User | null>(null);

  const adjustDiamonds = useAdminAdjustDiamonds();
  const toggleAdmin = useAdminToggleAdminRole();
  const blockMutation = useAdminBlockUser();
  const unblockMutation = useAdminUnblockUser();
  const binMutation = useAdminBinUser();
  const restoreMutation = useAdminRestoreUser();
  const permDeleteMutation = useAdminPermanentDeleteUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  function invalidateUsers() {
    queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getAdminListBinnedUsersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getAdminGetStatsQueryKey() });
  }

  const filteredUsers = (users ?? []).filter(u => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (u.inGameName?.toLowerCase().includes(q)) || u.phone.includes(q);
  });

  const filteredBin = (binnedUsers ?? []).filter(u => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (u.inGameName?.toLowerCase().includes(q)) || u.phone.includes(q);
  });

  const handleAdjustSubmit = () => {
    if (!selectedUser || !adjustAmount) return;
    const amount = parseInt(adjustAmount, 10);
    if (isNaN(amount)) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
    adjustDiamonds.mutate(
      { id: selectedUser.id, data: { amount } },
      {
        onSuccess: () => {
          invalidateUsers();
          toast({ title: "Diamonds adjusted successfully" });
          setIsAdjustOpen(false);
          setAdjustAmount("");
        },
        onError: (err) => toast({ title: "Failed to adjust diamonds", description: String(err), variant: "destructive" }),
      }
    );
  };

  const handleToggleAdmin = () => {
    if (!confirmAdminUser) return;
    toggleAdmin.mutate(
      { id: confirmAdminUser.id },
      {
        onSuccess: (updated) => {
          invalidateUsers();
          toast({ title: updated.isAdmin ? "Admin granted" : "Admin revoked" });
          setConfirmAdminUser(null);
        },
        onError: (err) => toast({ title: "Failed to toggle admin", description: String(err), variant: "destructive" }),
      }
    );
  };

  const handleBlock = () => {
    if (!blockUser || !blockReason.trim()) return;
    blockMutation.mutate(
      { id: blockUser.id, data: { reason: blockReason.trim(), blockedUntil: blockUntil || undefined } },
      {
        onSuccess: () => {
          invalidateUsers();
          toast({ title: `${blockUser.inGameName || blockUser.phone} has been blocked` });
          setBlockUser(null); setBlockReason(""); setBlockUntil("");
        },
        onError: (err) => toast({ title: "Failed to block user", description: String(err), variant: "destructive" }),
      }
    );
  };

  const handleUnblock = (u: User) => {
    unblockMutation.mutate(
      { id: u.id },
      {
        onSuccess: () => { invalidateUsers(); toast({ title: `${u.inGameName || u.phone} has been unblocked` }); },
        onError: (err) => toast({ title: "Failed to unblock", description: String(err), variant: "destructive" }),
      }
    );
  };

  const handleBin = () => {
    if (!binUser || !binReason.trim()) return;
    binMutation.mutate(
      { id: binUser.id, data: { reason: binReason.trim() } },
      {
        onSuccess: () => {
          invalidateUsers();
          toast({ title: `${binUser.inGameName || binUser.phone} moved to bin` });
          setBinUser(null); setBinReason("");
        },
        onError: (err) => toast({ title: "Failed to move to bin", description: String(err), variant: "destructive" }),
      }
    );
  };

  const handleRestore = (u: User) => {
    restoreMutation.mutate(
      { id: u.id },
      {
        onSuccess: () => { invalidateUsers(); toast({ title: `${u.inGameName || u.phone} restored` }); },
        onError: (err) => toast({ title: "Failed to restore", description: String(err), variant: "destructive" }),
      }
    );
  };

  const handlePermDelete = () => {
    if (!confirmPermDelete) return;
    permDeleteMutation.mutate(
      { id: confirmPermDelete.id },
      {
        onSuccess: () => {
          invalidateUsers();
          toast({ title: "User permanently deleted" });
          setConfirmPermDelete(null);
        },
        onError: (err) => toast({ title: "Failed to permanently delete", description: String(err), variant: "destructive" }),
      }
    );
  };

  const inputClass = "bg-black/50 border-white/20 text-white rounded-lg";

  return (
    <div className="glass-card rounded-2xl overflow-hidden flex flex-col mb-10">
      <div className="p-4 border-b border-white/10 bg-white/5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-bold text-lg text-white">Users</h2>
          <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs">
            <button
              className={`px-3 py-1 font-bold transition-colors ${tab === "active" ? "bg-primary text-white" : "text-white/50 hover:text-white hover:bg-white/10"}`}
              onClick={() => setTab("active")}
            >
              Active
            </button>
            <button
              className={`px-3 py-1 font-bold transition-colors flex items-center gap-1 ${tab === "bin" ? "bg-destructive text-white" : "text-white/50 hover:text-white hover:bg-white/10"}`}
              onClick={() => setTab("bin")}
            >
              <ArchiveX className="w-3 h-3" />
              Bin {(binnedUsers?.length ?? 0) > 0 && <span className="bg-destructive/20 text-destructive px-1 rounded">{binnedUsers?.length}</span>}
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="bg-black/40 border-white/10 text-white h-9 pl-9 rounded-lg text-sm placeholder:text-white/30"
            placeholder="Search by IGN or phone..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            data-testid="input-user-search"
          />
        </div>
      </div>

      {tab === "active" && (
        <div className="flex flex-col max-h-[440px] overflow-y-auto">
          {isLoading ? (
            <div className="p-4"><Skeleton className="h-16 w-full" /></div>
          ) : filteredUsers.length ? (
            filteredUsers.map(u => (
              <div key={u.id} className={`p-3 border-b border-white/5 hover:bg-white/5 ${u.status === "blocked" ? "bg-orange-500/5" : ""}`} data-testid={`admin-row-user-${u.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-white text-sm flex items-center gap-2 flex-wrap">
                      {u.inGameName || "No IGN"}
                      {u.isAdmin && <span className="flex items-center gap-0.5 text-primary text-[10px] font-bold uppercase"><ShieldAlert className="w-3 h-3" />Admin</span>}
                      {u.status === "blocked" && <span className="flex items-center gap-0.5 text-orange-400 text-[10px] font-bold uppercase"><Ban className="w-3 h-3" />Blocked</span>}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{u.phone}</div>
                    {u.status === "blocked" && u.blockedReason && (
                      <div className="text-[10px] text-orange-400/80 mt-1 flex items-start gap-1">
                        <Ban className="w-3 h-3 shrink-0 mt-0.5" />
                        <span>Blocked: {u.blockedReason}{u.blockedUntil ? ` · Until ${format(new Date(u.blockedUntil), "MMM d, yyyy")}` : " (indefinite)"}</span>
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-0.5">Joined {format(new Date(u.createdAt), "MMM d, yyyy")}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex items-center gap-0.5 font-bold text-sm text-diamond">💎{u.diamondBalance}</div>
                    <Button size="icon" variant="ghost" className={`w-7 h-7 ${u.isAdmin ? "text-primary hover:text-destructive" : "text-white/30 hover:text-primary"}`} onClick={() => setConfirmAdminUser(u)} title={u.isAdmin ? "Revoke admin" : "Grant admin"} data-testid={`button-toggle-admin-${u.id}`}>
                      {u.isAdmin ? <Shield className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="w-7 h-7 text-white/30 hover:text-diamond" onClick={() => { setSelectedUser(u); setAdjustAmount(""); setIsAdjustOpen(true); }} title="Adjust diamonds" data-testid={`button-adjust-user-${u.id}`}>
                      <Diamond className="w-3.5 h-3.5" />
                    </Button>
                    {u.status === "blocked" ? (
                      <Button size="icon" variant="ghost" className="w-7 h-7 text-orange-400 hover:text-green-400 hover:bg-green-400/10" onClick={() => handleUnblock(u)} title="Unblock user" disabled={unblockMutation.isPending} data-testid={`button-unblock-${u.id}`}>
                        <Unlock className="w-3.5 h-3.5" />
                      </Button>
                    ) : (
                      <Button size="icon" variant="ghost" className="w-7 h-7 text-white/30 hover:text-orange-400 hover:bg-orange-400/10" onClick={() => { setBlockUser(u); setBlockReason(""); setBlockUntil(""); }} title="Block user" data-testid={`button-block-${u.id}`}>
                        <Ban className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="w-7 h-7 text-white/30 hover:text-destructive hover:bg-destructive/10" onClick={() => { setBinUser(u); setBinReason(""); }} title="Move to bin" data-testid={`button-bin-${u.id}`}>
                      <ArchiveX className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {searchQuery ? "No users match your search" : "No users found"}
            </div>
          )}
        </div>
      )}

      {tab === "bin" && (
        <div className="flex flex-col max-h-[440px] overflow-y-auto">
          {binLoading ? (
            <div className="p-4"><Skeleton className="h-16 w-full" /></div>
          ) : filteredBin.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center gap-2 text-muted-foreground">
              <ArchiveX className="w-10 h-10 opacity-20" />
              <p className="text-sm">Bin is empty</p>
              <p className="text-[10px]">Deleted users appear here for 15 days before permanent removal</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-2 text-[10px] text-muted-foreground bg-white/3 border-b border-white/5 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Items auto-delete permanently after 15 days
              </div>
              {filteredBin.map(u => {
                const days = u.deletedAt ? daysUntilPermanentDelete(u.deletedAt) : 0;
                return (
                  <div key={u.id} className="p-3 border-b border-white/5 bg-red-500/3 hover:bg-red-500/6">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="font-bold text-white/70 text-sm">{u.inGameName || "No IGN"}</div>
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{u.phone}</div>
                        {u.deleteReason && (
                          <div className="text-[10px] text-red-400/80 mt-1 flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                            <span>{u.deleteReason}</span>
                          </div>
                        )}
                        <div className={`text-[10px] mt-1 flex items-center gap-1 font-medium ${days <= 3 ? "text-red-400" : "text-muted-foreground"}`}>
                          <Clock className="w-3 h-3" />
                          {days === 0 ? "Deletes today" : `${days} day${days === 1 ? "" : "s"} until permanent deletion`}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500/50 font-bold gap-1.5"
                        onClick={() => handleRestore(u)}
                        disabled={restoreMutation.isPending}
                        data-testid={`button-restore-${u.id}`}
                      >
                        <RotateCcw className="w-3 h-3" />Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs border-destructive/30 bg-destructive/10 text-red-300 hover:bg-destructive/20 hover:border-destructive/50 font-bold gap-1.5"
                        onClick={() => setConfirmPermDelete(u)}
                        data-testid={`button-perm-delete-${u.id}`}
                      >
                        <Trash className="w-3 h-3" />Permanent Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Grant/Revoke Admin Dialog */}
      <Dialog open={!!confirmAdminUser} onOpenChange={(open) => { if (!open) setConfirmAdminUser(null); }}>
        <DialogContent className="bg-[#151025] border-white/10 text-white max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg flex items-center gap-2">
              <UserCog className="w-5 h-5 text-primary" />
              {confirmAdminUser?.isAdmin ? "Revoke Admin" : "Grant Admin"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground">
              {confirmAdminUser?.isAdmin
                ? `Remove admin privileges from ${confirmAdminUser?.inGameName || confirmAdminUser?.phone}?`
                : `Grant admin privileges to ${confirmAdminUser?.inGameName || confirmAdminUser?.phone}?`}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-white/10" onClick={() => setConfirmAdminUser(null)}>Cancel</Button>
            <Button className={confirmAdminUser?.isAdmin ? "bg-destructive hover:bg-destructive/90 text-white font-bold" : "bg-primary hover:bg-primary/90 text-white font-bold"} onClick={handleToggleAdmin} disabled={toggleAdmin.isPending} data-testid="button-confirm-toggle-admin">
              {toggleAdmin.isPending ? "Updating..." : confirmAdminUser?.isAdmin ? "Revoke Admin" : "Grant Admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Diamonds Dialog */}
      <Dialog open={isAdjustOpen} onOpenChange={setIsAdjustOpen}>
        <DialogContent className="bg-[#151025] border-white/10 text-white max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle>Adjust Diamonds</DialogTitle></DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Add or subtract diamonds for <span className="text-white font-semibold">{selectedUser?.inGameName || selectedUser?.phone}</span>.
            </p>
            <Input type="number" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} placeholder="Amount (e.g. 100 or -50)" className={`${inputClass} h-12 font-mono`} data-testid="input-adjust-amount" />
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-white/10" onClick={() => setIsAdjustOpen(false)}>Cancel</Button>
            <Button className="bg-diamond hover:bg-diamond/90 text-black font-bold" onClick={handleAdjustSubmit} disabled={!adjustAmount || adjustDiamonds.isPending} data-testid="button-confirm-adjust">
              {adjustDiamonds.isPending ? "Applying..." : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block User Dialog */}
      <Dialog open={!!blockUser} onOpenChange={(open) => { if (!open) { setBlockUser(null); setBlockReason(""); setBlockUntil(""); } }}>
        <DialogContent className="bg-[#151025] border-white/10 text-white max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg flex items-center gap-2">
              <Ban className="w-5 h-5 text-orange-400" />
              Block Account
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Blocking <span className="text-white font-semibold">{blockUser?.inGameName || blockUser?.phone}</span> will prevent them from logging in. They will see your reason.
            </p>
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Reason <span className="text-destructive">*</span></Label>
              <textarea
                value={blockReason}
                onChange={e => setBlockReason(e.target.value)}
                placeholder="Explain why this account is being blocked..."
                rows={3}
                className="w-full rounded-lg bg-black/50 border border-white/20 text-white text-sm px-3 py-2 resize-none placeholder:text-white/30 focus:outline-none focus:border-orange-400/50"
                data-testid="input-block-reason"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Block Until (optional — leave blank for indefinite)</Label>
              <Input type="date" value={blockUntil} onChange={e => setBlockUntil(e.target.value)} className={`${inputClass} h-9`} data-testid="input-block-until" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-white/10" onClick={() => { setBlockUser(null); setBlockReason(""); setBlockUntil(""); }}>Cancel</Button>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white font-bold" onClick={handleBlock} disabled={!blockReason.trim() || blockMutation.isPending} data-testid="button-confirm-block">
              {blockMutation.isPending ? "Blocking..." : "Block Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Bin Dialog */}
      <Dialog open={!!binUser} onOpenChange={(open) => { if (!open) { setBinUser(null); setBinReason(""); } }}>
        <DialogContent className="bg-[#151025] border-white/10 text-white max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg flex items-center gap-2">
              <ArchiveX className="w-5 h-5 text-destructive" />
              Move to Bin
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Moving <span className="text-white font-semibold">{binUser?.inGameName || binUser?.phone}</span> to the bin. The account will be permanently deleted after <span className="text-white font-semibold">15 days</span> unless restored.
            </p>
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Reason <span className="text-destructive">*</span></Label>
              <textarea
                value={binReason}
                onChange={e => setBinReason(e.target.value)}
                placeholder="Explain why this account is being deleted..."
                rows={3}
                className="w-full rounded-lg bg-black/50 border border-white/20 text-white text-sm px-3 py-2 resize-none placeholder:text-white/30 focus:outline-none focus:border-destructive/50"
                data-testid="input-bin-reason"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-white/10" onClick={() => { setBinUser(null); setBinReason(""); }}>Cancel</Button>
            <Button className="bg-destructive hover:bg-destructive/90 text-white font-bold" onClick={handleBin} disabled={!binReason.trim() || binMutation.isPending} data-testid="button-confirm-bin">
              {binMutation.isPending ? "Moving..." : "Move to Bin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent Delete Confirm Dialog */}
      <Dialog open={!!confirmPermDelete} onOpenChange={(open) => { if (!open) setConfirmPermDelete(null); }}>
        <DialogContent className="bg-[#151025] border-white/10 text-white max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg flex items-center gap-2">
              <Trash className="w-5 h-5 text-destructive" />
              Permanently Delete
            </DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 mb-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive/90 font-medium">This action cannot be undone. All data for this account will be erased forever.</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Permanently delete <span className="text-white font-semibold">{confirmPermDelete?.inGameName || confirmPermDelete?.phone}</span>?
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-white/10" onClick={() => setConfirmPermDelete(null)}>Cancel</Button>
            <Button className="bg-destructive hover:bg-destructive/90 text-white font-bold" onClick={handlePermDelete} disabled={permDeleteMutation.isPending} data-testid="button-confirm-perm-delete">
              {permDeleteMutation.isPending ? "Deleting..." : "Delete Forever"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Admin Reports & Disputes ──────────────────────────────────────────────────

interface AdminReport {
  id: number; category: string; evidence: string; status: string;
  adminNotes: string | null; tournamentId: number | null; accusedName: string | null;
  createdAt: string; previousDisputeCount: number;
  reporter: { id: number; inGameName: string | null; phone: string };
  accused: { id: number; inGameName: string | null; phone: string } | null;
}

interface AdminFeedbackItem {
  id: number; type: string; message: string; createdAt: string;
  user: { id: number; inGameName: string | null; phone: string } | null;
}

const REPORT_STATUS: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  pending:   { label: "Pending",   icon: Clock,       color: "text-amber-300",   bg: "bg-amber-500/15",   border: "border-amber-500/30" },
  resolved:  { label: "Resolved",  icon: CheckCircle, color: "text-emerald-300", bg: "bg-emerald-500/15", border: "border-emerald-500/30" },
  rejected:  { label: "Rejected",  icon: XCircle,     color: "text-zinc-400",    bg: "bg-white/5",        border: "border-white/10" },
  penalized: { label: "Penalized", icon: ShieldBan,   color: "text-red-300",     bg: "bg-red-500/15",     border: "border-red-500/30" },
};

const CATEGORY_LABELS: Record<string, string> = {
  cheating: "Cheating", abusive_behavior: "Abusive Behavior", false_score: "False Score",
  dispute: "Match Dispute", other: "Other",
};

function AdminReports() {
  const { toast } = useToast();
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [feedback, setFeedback] = useState<AdminFeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [notesMap, setNotesMap] = useState<Record<number, string>>({});
  const [actingId, setActingId] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackLoaded, setFeedbackLoaded] = useState(false);

  const loadReports = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reports", { credentials: "include" });
      if (res.ok) setReports(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const loadFeedback = async () => {
    setFeedbackLoading(true);
    try {
      const res = await fetch("/api/admin/feedback", { credentials: "include" });
      if (res.ok) setFeedback(await res.json());
    } catch { /* ignore */ } finally { setFeedbackLoading(false); setFeedbackLoaded(true); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadReports(); }, []);

  const updateStatus = async (report: AdminReport, newStatus: string) => {
    setActingId(report.id);
    try {
      const notes = notesMap[report.id] ?? report.adminNotes ?? "";
      const res = await fetch(`/api/admin/reports/${report.id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, adminNotes: notes || undefined }),
      });
      if (res.ok) {
        setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: newStatus, adminNotes: notes || null } : r));
        toast({ title: `Marked as ${newStatus}` });
      } else {
        toast({ title: "Failed to update", variant: "destructive" });
      }
    } finally { setActingId(null); }
  };

  const filtered = statusFilter === "all" ? reports : reports.filter(r => r.status === statusFilter);
  const pendingCount = reports.filter(r => r.status === "pending").length;

  const fmtD = (iso: string) => {
    try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden flex flex-col mb-4">
      {/* Header */}
      <div className="p-4 border-b border-white/10 bg-white/5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-bold text-lg text-white flex items-center gap-2">
            <Flag className="w-5 h-5 text-red-400" />
            Reports &amp; Disputes
            {pendingCount > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {pendingCount} pending
              </span>
            )}
          </h2>
          <button onClick={loadReports} disabled={loading} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 text-zinc-400 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {["all", "pending", "resolved", "rejected", "penalized"].map(s => {
            const cfg = REPORT_STATUS[s];
            const count = s === "all" ? reports.length : reports.filter(r => r.status === s).length;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-colors border ${
                  statusFilter === s
                    ? (cfg ? `${cfg.bg} ${cfg.color} ${cfg.border}` : "bg-primary/20 text-primary border-primary/30")
                    : "bg-white/4 text-zinc-500 border-white/8 hover:text-white"
                }`}
              >
                {s === "all" ? "All" : (cfg?.label ?? s)}{count > 0 ? ` (${count})` : ""}
              </button>
            );
          })}
        </div>
      </div>

      {/* Report list */}
      <div className="divide-y divide-white/5">
        {loading && [...Array(3)].map((_, i) => (
          <div key={i} className="p-4 animate-pulse flex gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/5 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 bg-white/5 rounded w-2/5" />
              <div className="h-3 bg-white/3 rounded w-full" />
            </div>
          </div>
        ))}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-10 text-zinc-600 text-sm">
            No reports{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}
          </div>
        )}

        {!loading && filtered.map(report => {
          const sc = REPORT_STATUS[report.status] ?? REPORT_STATUS.pending;
          const StatusIcon = sc.icon;
          const isExpanded = expandedId === report.id;
          const isActing = actingId === report.id;

          return (
            <div key={report.id} className="p-4 flex flex-col gap-3">
              {/* Top row */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-red-500/10 border border-red-500/20 mt-0.5">
                  <Flag className="w-4 h-4 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-white/8 border border-white/10">
                      {CATEGORY_LABELS[report.category] ?? report.category}
                    </span>
                    <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${sc.bg} ${sc.color} ${sc.border}`}>
                      <StatusIcon className="w-2.5 h-2.5" />{sc.label}
                    </span>
                    {report.previousDisputeCount > 0 && (
                      <span className="text-[10px] text-orange-400 font-bold bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/20">
                        {report.previousDisputeCount} prior dispute{report.previousDisputeCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1">{fmtD(report.createdAt)} · #{report.id}</p>
                </div>
                <button onClick={() => setExpandedId(isExpanded ? null : report.id)} className="text-zinc-500 hover:text-white shrink-0 mt-0.5">
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {/* Reporter + Accused grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl px-3 py-2 bg-white/3 border border-white/6">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-bold mb-0.5">Reporter</p>
                  <p className="text-[11px] text-white font-semibold truncate">{report.reporter.inGameName ?? report.reporter.phone}</p>
                  <p className="text-[9px] text-zinc-700 font-mono">ID #{report.reporter.id}</p>
                </div>
                <div className="rounded-xl px-3 py-2 bg-white/3 border border-white/6">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-bold mb-0.5">Accused</p>
                  <p className="text-[11px] text-white font-semibold truncate">
                    {report.accused?.inGameName ?? report.accused?.phone ?? report.accusedName ?? "Unknown"}
                  </p>
                  {report.accused && <p className="text-[9px] text-zinc-700 font-mono">ID #{report.accused.id}</p>}
                </div>
              </div>

              {/* Evidence */}
              <div className="rounded-xl px-3 py-2.5 bg-black/30 border border-white/6">
                <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-bold mb-1">Evidence</p>
                <p className={`text-[11px] text-zinc-300 leading-relaxed ${isExpanded ? "" : "line-clamp-3"}`}>{report.evidence}</p>
              </div>

              {/* Expanded controls */}
              {isExpanded && (
                <div className="flex flex-col gap-2 pt-1">
                  <div>
                    <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-bold mb-1">Admin Notes (internal)</p>
                    <textarea
                      value={notesMap[report.id] ?? report.adminNotes ?? ""}
                      onChange={e => setNotesMap(prev => ({ ...prev, [report.id]: e.target.value }))}
                      placeholder="Add internal notes about this case..."
                      rows={2}
                      className="w-full rounded-xl bg-black/40 border border-white/10 text-white text-xs px-3 py-2 resize-none placeholder:text-zinc-600 focus:outline-none focus:border-white/20"
                    />
                  </div>

                  {/* Status action buttons */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["resolved", "pending", "rejected", "penalized"] as const).map(s => {
                      const cfg = REPORT_STATUS[s];
                      const Icon = cfg.icon;
                      const isCurrent = report.status === s;
                      return (
                        <button
                          key={s}
                          disabled={isActing || isCurrent}
                          onClick={() => updateStatus(report, s)}
                          className={`flex items-center justify-center gap-1.5 h-8 rounded-xl text-xs font-bold transition-colors border ${
                            isCurrent
                              ? `${cfg.bg} ${cfg.color} ${cfg.border}`
                              : "bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/8"
                          } disabled:opacity-60`}
                        >
                          <Icon className="w-3 h-3" />
                          {cfg.label}{isCurrent ? " ✓" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Feedback toggle section */}
      <div className="border-t border-white/8">
        <button
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
          onClick={() => {
            setShowFeedback(v => !v);
            if (!feedbackLoaded) loadFeedback();
          }}
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-amber-300">
            <Lightbulb className="w-4 h-4" /> User Feedback
            {feedback.length > 0 && <span className="text-[10px] text-zinc-500 font-normal">({feedback.length})</span>}
          </span>
          {showFeedback ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </button>

        {showFeedback && (
          <div className="border-t border-white/5 divide-y divide-white/5">
            {feedbackLoading && <div className="p-4 text-center text-xs text-zinc-600">Loading...</div>}
            {!feedbackLoading && feedback.length === 0 && (
              <div className="p-4 text-center text-xs text-zinc-600">No feedback yet</div>
            )}
            {!feedbackLoading && feedback.map(f => (
              <div key={f.id} className="px-4 py-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/12 text-amber-400 border border-amber-500/20 capitalize">{f.type}</span>
                    <span className="text-[10px] text-zinc-500">{f.user?.inGameName ?? f.user?.phone ?? "Anonymous"}</span>
                  </div>
                  <span className="text-[10px] text-zinc-700">
                    {new Date(f.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">{f.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Admin Audit Logs ──────────────────────────────────────────────────────────

interface AuditLogEntry {
  id: number; action: string; category: string;
  details: string | null; targetId: string | null; targetType: string | null;
  createdAt: string;
}

const LOG_CATEGORIES: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  tournament: { label: "Tournament", icon: Trophy,      color: "text-sky-300",     bg: "bg-sky-500/12",     border: "border-sky-500/25" },
  moderation: { label: "Moderation", icon: ShieldAlert, color: "text-orange-300",  bg: "bg-orange-500/12",  border: "border-orange-500/25" },
  wallet:     { label: "Wallet",     icon: Wallet,      color: "text-emerald-300", bg: "bg-emerald-500/12", border: "border-emerald-500/25" },
  security:   { label: "Security",   icon: Shield,      color: "text-violet-300",  bg: "bg-violet-500/12",  border: "border-violet-500/25" },
  general:    { label: "General",    icon: Globe2,      color: "text-zinc-400",    bg: "bg-white/5",        border: "border-white/10" },
};

const ACTION_VERB: Record<string, string> = {
  user_blocked: "Blocked user", user_unblocked: "Unblocked user",
  user_binned: "Binned user", user_restored: "Restored user",
  user_permanently_deleted: "Permanently deleted user",
  admin_granted: "Granted admin", admin_revoked: "Revoked admin",
  chat_mute_applied: "Muted chat", chat_mute_lifted: "Unmuted chat",
  diamonds_added: "Added diamonds", diamonds_deducted: "Deducted diamonds",
  wallet_frozen: "Froze wallet", wallet_unfrozen: "Unfroze wallet",
  withdrawals_held: "Held withdrawals", withdrawals_released: "Released withdrawals",
  reward_reversed: "Reversed reward", entry_refunded: "Refunded entry",
  match_cancelled: "Cancelled match", room_redrawn: "Redrawn room",
  match_rescheduled: "Rescheduled match", set_winner: "Set winner",
  force_payout: "Forced payout", revoke_payout: "Revoked payout",
  resend_reward: "Resent reward", cancel_reward: "Cancelled reward",
  schedule_reward: "Scheduled reward", bulk_reward: "Bulk rewarded",
  notify_all: "Notified all participants",
  report_status_update: "Updated report status",
  "2fa_approved": "Approved 2FA", "2fa_rejected": "Rejected 2FA",
};

function AdminAuditLogs() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [catFilter, setCatFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const loadLogs = async (cat = catFilter, q = search) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "300" });
      if (cat !== "all") params.set("category", cat);
      if (q) params.set("search", q);
      const res = await fetch(`/api/admin/logs?${params}`, { credentials: "include" });
      if (res.ok) setLogs(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); setLoaded(true); }
  };

  const handleOpen = () => {
    setCollapsed(false);
    if (!loaded) loadLogs();
  };

  const handleCat = (c: string) => {
    setCatFilter(c);
    loadLogs(c, search);
  };

  const handleSearch = () => {
    setSearch(searchInput);
    loadLogs(catFilter, searchInput);
  };

  const fmtTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHrs = Math.floor(diffMins / 60);
      if (diffHrs < 24) return `${diffHrs}h ago`;
      const diffDays = Math.floor(diffHrs / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    } catch { return ""; }
  };

  const fmtFull = (iso: string) => {
    try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
    catch { return iso; }
  };

  const catCounts = Object.fromEntries(
    Object.keys(LOG_CATEGORIES).map(c => [c, logs.filter(l => l.category === c).length])
  );

  return (
    <div className="glass-card rounded-2xl overflow-hidden flex flex-col mb-4">
      {/* Header — always visible, clicking opens/closes */}
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
        onClick={() => { if (collapsed) handleOpen(); else setCollapsed(true); }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-violet-500/12 border border-violet-500/25">
            <ScrollText className="w-4 h-4 text-violet-300" />
          </div>
          <div className="text-left">
            <h2 className="font-heading font-bold text-base text-white leading-tight">Audit Logs</h2>
            <p className="text-[10px] text-zinc-500">Every admin action, recorded</p>
          </div>
          {!collapsed && logs.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/8 text-zinc-400 border border-white/10 ml-1">
              {logs.length}
            </span>
          )}
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronUp className="w-4 h-4 text-zinc-500" />}
      </button>

      {!collapsed && (
        <>
          {/* Filters bar */}
          <div className="px-4 pb-3 flex flex-col gap-2 border-b border-white/8">
            {/* Category tabs */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              <button
                onClick={() => handleCat("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-colors border ${
                  catFilter === "all" ? "bg-primary/20 text-primary border-primary/30" : "bg-white/4 text-zinc-500 border-white/8 hover:text-white"
                }`}
              >
                All {logs.length > 0 && `(${logs.length})`}
              </button>
              {Object.entries(LOG_CATEGORIES).map(([key, cfg]) => {
                const Icon = cfg.icon;
                const count = catCounts[key] ?? 0;
                return (
                  <button
                    key={key}
                    onClick={() => handleCat(key)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-colors border ${
                      catFilter === key
                        ? `${cfg.bg} ${cfg.color} ${cfg.border}`
                        : "bg-white/4 text-zinc-500 border-white/8 hover:text-white"
                    }`}
                  >
                    <Icon className="w-3 h-3" />{cfg.label}{count > 0 && ` (${count})`}
                  </button>
                );
              })}
            </div>

            {/* Search + Refresh */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                <input
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                  placeholder="Search action, details, target ID..."
                  className="w-full h-9 rounded-xl bg-black/30 border border-white/8 pl-8 pr-3 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/20"
                />
              </div>
              <button
                onClick={handleSearch}
                className="h-9 px-3 rounded-xl bg-primary/20 text-primary border border-primary/30 text-xs font-bold hover:bg-primary/30 transition-colors shrink-0"
              >
                Search
              </button>
              <button
                onClick={() => loadLogs()}
                disabled={loading}
                className="h-9 w-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Log list */}
          <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto">
            {loading && [...Array(5)].map((_, i) => (
              <div key={i} className="px-4 py-3 flex gap-3 animate-pulse">
                <div className="w-7 h-7 rounded-lg bg-white/5 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2 py-0.5">
                  <div className="h-3 bg-white/5 rounded w-2/5" />
                  <div className="h-2.5 bg-white/3 rounded w-3/4" />
                </div>
                <div className="h-2.5 w-12 bg-white/4 rounded shrink-0 mt-1" />
              </div>
            ))}

            {!loading && logs.length === 0 && (
              <div className="text-center py-10 text-zinc-600 text-sm">
                {loaded ? "No audit logs found" : "Loading..."}
              </div>
            )}

            {!loading && logs.map(log => {
              const cfg = LOG_CATEGORIES[log.category] ?? LOG_CATEGORIES.general;
              const Icon = cfg.icon;
              const isExpanded = expandedId === log.id;
              const verb = ACTION_VERB[log.action] ?? log.action.replace(/_/g, " ");

              return (
                <button
                  key={log.id}
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  className="w-full px-4 py-3 flex items-start gap-3 hover:bg-white/3 transition-colors text-left"
                >
                  {/* Category icon */}
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${cfg.bg} ${cfg.border}`}>
                    <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white capitalize">{verb}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                        {cfg.label}
                      </span>
                    </div>
                    {log.targetId && (
                      <p className="text-[10px] text-zinc-600 mt-0.5">
                        {log.targetType === "user" ? "User" : "Target"} #{log.targetId}
                      </p>
                    )}
                    {isExpanded && log.details && (
                      <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed bg-black/20 rounded-lg px-2.5 py-2 border border-white/5">
                        {log.details}
                      </p>
                    )}
                    {isExpanded && (
                      <p className="text-[10px] text-zinc-600 mt-1.5 font-mono">{fmtFull(log.createdAt)}</p>
                    )}
                  </div>

                  {/* Time */}
                  <span className="text-[10px] text-zinc-600 shrink-0 mt-0.5">{fmtTime(log.createdAt)}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

interface SystemSettingsDisplay {
  freefireApiKeySet: boolean;
  freefireApiKeyPreview: string;
}

function AdminSystemSettings() {
  const [data, setData] = useState<SystemSettingsDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/admin/system-settings", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((s: SystemSettingsDisplay | null) => { if (s) setData(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (saving || !keyInput.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/system-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ freefireApiKey: keyInput.trim() }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated: SystemSettingsDisplay = await res.json();
      setData(updated);
      setKeyInput("");
      toast({ title: "API key saved!" });
    } catch {
      toast({ title: "Failed to save API key", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "bg-black/50 border-white/20 text-white h-10 rounded-lg text-sm font-mono";
  const labelClass = "text-[10px] text-muted-foreground uppercase tracking-wider font-semibold";

  return (
    <div className="glass-card rounded-2xl overflow-hidden flex flex-col">
      <div className="p-4 border-b border-white/10 flex items-center gap-3 bg-white/5">
        <KeyRound className="w-4 h-4 text-amber-400" />
        <h2 className="font-heading font-bold text-lg text-white flex-1">API Keys</h2>
      </div>

      {loading ? (
        <div className="p-4"><Skeleton className="h-28 w-full rounded-xl bg-white/5" /></div>
      ) : (
        <div className="p-4 flex flex-col gap-4">
          {data?.freefireApiKeySet && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-emerald-300">Free Fire API key is active</span>
                <span className="text-[11px] text-zinc-500 font-mono">{data.freefireApiKeyPreview}</span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label className={labelClass}>
              <KeyRound className="w-3 h-3 inline mr-1" />
              {data?.freefireApiKeySet ? "Replace Free Fire API Key" : "Set Free Fire API Key"}
            </Label>
            <div className="relative">
              <Input
                className={`${inputClass} pr-10`}
                type={showKey ? "text" : "password"}
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder="Paste your API key here…"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-zinc-600">
              Get your key from{" "}
              <a
                href="https://developers.freefirecommunity.com/en/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400/70 hover:text-amber-400 underline"
              >
                developers.freefirecommunity.com
              </a>
            </p>
          </div>

          <Button
            className="w-full rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-bold"
            onClick={handleSave}
            disabled={saving || !keyInput.trim()}
          >
            {saving ? "Saving…" : "Save API Key"}
          </Button>
        </div>
      )}
    </div>
  );
}

interface SupportSettingsData {
  whatsappNumber: string;
  email: string;
  availableHours: string;
}

function AdminSupportSettings() {
  const [data, setData] = useState<SupportSettingsData | null>(null);
  const [form, setForm] = useState<SupportSettingsData>({ whatsappNumber: "", email: "", availableHours: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/admin/support-settings", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((s: SupportSettingsData | null) => {
        if (s) { setData(s); setForm(s); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/support-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated: SupportSettingsData = await res.json();
      setData(updated);
      setForm(updated);
      toast({ title: "Support settings saved!" });
    } catch {
      toast({ title: "Failed to save settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const changed = data && (
    form.whatsappNumber !== data.whatsappNumber ||
    form.email !== data.email ||
    form.availableHours !== data.availableHours
  );

  const inputClass = "bg-black/50 border-white/20 text-white h-10 rounded-lg text-sm";
  const labelClass = "text-[10px] text-muted-foreground uppercase tracking-wider font-semibold";

  return (
    <div className="glass-card rounded-2xl overflow-hidden flex flex-col">
      <div className="p-4 border-b border-white/10 flex items-center gap-3 bg-white/5">
        <HeadphonesIcon className="w-4 h-4 text-sky-400" />
        <h2 className="font-heading font-bold text-lg text-white flex-1">Support Settings</h2>
      </div>

      {loading ? (
        <div className="p-4"><Skeleton className="h-40 w-full rounded-xl bg-white/5" /></div>
      ) : (
        <div className="p-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className={labelClass}>
              <Phone className="w-3 h-3 inline mr-1" />WhatsApp Number
            </Label>
            <Input
              className={inputClass}
              value={form.whatsappNumber}
              onChange={e => setForm(f => ({ ...f, whatsappNumber: e.target.value }))}
              placeholder="919999999999 (country code + number, no +)"
            />
            <p className="text-[10px] text-zinc-600">Include country code without the + (e.g. 91 for India)</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className={labelClass}>
              <AtSign className="w-3 h-3 inline mr-1" />Support Email
            </Label>
            <Input
              className={inputClass}
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="support@clashren.in"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className={labelClass}>
              <Clock className="w-3 h-3 inline mr-1" />Available Hours
            </Label>
            <Input
              className={inputClass}
              value={form.availableHours}
              onChange={e => setForm(f => ({ ...f, availableHours: e.target.value }))}
              placeholder="9 AM – 11 PM IST"
            />
            <p className="text-[10px] text-zinc-600">Shown to users on the Support page</p>
          </div>

          <Button
            className="w-full rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 font-bold"
            onClick={handleSave}
            disabled={saving || !changed}
          >
            {saving ? "Saving…" : "Save Support Settings"}
          </Button>

          {data && (
            <div className="rounded-xl bg-white/3 border border-white/8 p-3 flex flex-col gap-1.5">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">Current Live Values</p>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Phone className="w-3 h-3 text-[#25D366] shrink-0" />
                <span>wa.me/{data.whatsappNumber}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <AtSign className="w-3 h-3 text-primary shrink-0" />
                <span>{data.email}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Clock className="w-3 h-3 text-sky-400 shrink-0" />
                <span>{data.availableHours}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Data Export / Import ───────────────────────────────────────────────────────
function AdminDataPanel() {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importCounts, setImportCounts] = useState<{ users?: number; tournaments?: number } | null>(null);
  const [importResult, setImportResult] = useState<{
    results: Record<string, { updated: number; skipped: number; errors: string[] }>;
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleExportAll = async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/admin/export/all", { credentials: "include" });
      if (!res.ok) { toast({ title: "Export failed", variant: "destructive" }); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clashren-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Backup downloaded!", description: "Check your Downloads folder." });
    } catch {
      toast({ title: "Export failed", description: "Network error.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImportFile(file);
    setImportResult(null);
    setImportCounts(null);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        setImportCounts({
          users: Array.isArray(data.users) ? data.users.length : undefined,
          tournaments: Array.isArray(data.tournaments) ? data.tournaments.length : undefined,
        });
      } catch {
        setImportCounts(null);
      }
    };
    reader.readAsText(file);
  };

  const handleImportAll = async () => {
    if (!importFile) return;
    setIsImporting(true);
    setImportResult(null);
    try {
      const text = await importFile.text();
      const parsed = JSON.parse(text);
      const res = await fetch("/api/admin/import/all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(parsed),
      });
      const result = await res.json();
      if (!res.ok) {
        toast({ title: "Import failed", description: result.error || "Unknown error.", variant: "destructive" });
      } else {
        setImportResult(result);
        const totalUpdated = Object.values(result.results as Record<string, { updated: number }>)
          .reduce((sum, r) => sum + r.updated, 0);
        toast({ title: "Import complete!", description: `${totalUpdated} records updated.` });
      }
    } catch {
      toast({ title: "Import failed", description: "Invalid JSON file.", variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between p-4 text-left"
        onClick={() => setIsOpen(v => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
            <ScrollText className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-white font-heading tracking-wide">Data Export / Import</p>
            <p className="text-[11px] text-zinc-500">Backup all data · Restore from file</p>
          </div>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>

      {isOpen && (
        <div className="px-4 pb-5 flex flex-col gap-3">

          {/* EXPORT row */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Export</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Downloads a <span className="text-white font-semibold">single JSON file</span> with everything:
              all user accounts, tournaments, match participants, wallet transactions, and admin logs.
              Use this as a full backup of your platform data.
            </p>
            <Button
              className="w-full mt-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-11"
              onClick={handleExportAll}
              disabled={isExporting}
            >
              {isExporting ? "Downloading…" : "⬇ Export All Data"}
            </Button>
          </div>

          {/* IMPORT row */}
          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold text-sky-400 uppercase tracking-widest">Import</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Upload the <span className="text-white font-semibold">backup JSON file</span> you exported earlier.
              It will update existing user profiles (name, UID, diamonds) and tournament details.
              It does <span className="text-white font-semibold">not</span> delete anything or create new records.
            </p>

            {/* File picker button */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              className="w-full mt-1 border-sky-500/30 text-sky-300 hover:bg-sky-500/10 h-11 font-semibold"
              onClick={() => fileInputRef.current?.click()}
            >
              {importFile ? `📄 ${importFile.name}` : "⬆ Choose Backup File"}
            </Button>

            {/* Counts preview */}
            {importFile && importCounts && (
              <div className="flex gap-3 px-1">
                {importCounts.users !== undefined && (
                  <span className="text-[11px] text-emerald-400">✓ {importCounts.users} users</span>
                )}
                {importCounts.tournaments !== undefined && (
                  <span className="text-[11px] text-sky-400">✓ {importCounts.tournaments} tournaments</span>
                )}
              </div>
            )}

            {/* Confirm import */}
            {importFile && importCounts && (
              <Button
                className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold h-11"
                onClick={handleImportAll}
                disabled={isImporting}
              >
                {isImporting ? "Importing…" : "✓ Confirm Import"}
              </Button>
            )}

            {/* Results */}
            {importResult && (
              <div className="rounded-xl bg-white/3 border border-white/8 p-3 flex flex-col gap-2 text-xs mt-1">
                {Object.entries(importResult.results).map(([table, r]) => (
                  <div key={table} className="flex flex-col gap-0.5">
                    <span className="text-zinc-500 uppercase tracking-wider text-[10px] font-semibold">{table}</span>
                    <div className="flex gap-3">
                      <span className="text-emerald-400 font-bold">✓ {r.updated} updated</span>
                      <span className="text-zinc-500">{r.skipped} skipped</span>
                    </div>
                    {r.errors.length > 0 && (
                      <div className="text-red-400 mt-0.5">{r.errors.map((e, i) => <div key={i}>{e}</div>)}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
