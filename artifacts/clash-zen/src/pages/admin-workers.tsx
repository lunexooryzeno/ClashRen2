import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Smartphone, Plus, Trash2, Edit2, CheckCircle2, XCircle, Clock,
  Wifi, WifiOff, ChevronLeft, Loader2, Play, StopCircle, RefreshCw,
  Eye, EyeOff, ShieldAlert,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface Worker {
  id: number;
  name: string;
  webhookUrl: string;
  webhookSecret: string;
  supportedGameModes: string;
  status: "active" | "disabled" | "busy";
  priority: number;
  lastHeartbeatAt: string | null;
  currentJobMatchId: string | null;
  createdAt: string;
}

function statusBadge(status: Worker["status"]) {
  if (status === "active")   return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Active</Badge>;
  if (status === "busy")     return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Busy</Badge>;
  return <Badge className="bg-zinc-700/40 text-zinc-400 border-zinc-700/40">Disabled</Badge>;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

const EMPTY_FORM = { name: "", webhookUrl: "", webhookSecret: "", supportedGameModes: "duel,healing,knife", priority: "0", status: "active" };

export default function AdminWorkers() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [workers, setWorkers]         = useState<Worker[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [editingId, setEditingId]     = useState<number | null>(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [showSecret, setShowSecret]   = useState(false);
  const [testingId, setTestingId]     = useState<number | null>(null);
  const [stoppingId, setStoppingId]   = useState<number | null>(null);
  const [deletingId, setDeletingId]   = useState<number | null>(null);

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
    try {
      const data = await apiFetch<Worker[]>("/admin/workers");
      setWorkers(data);
    } catch {
      toast({ title: "Failed to load workers", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowSecret(false);
    setShowForm(true);
  };

  const openEdit = (w: Worker) => {
    setEditingId(w.id);
    setForm({
      name: w.name,
      webhookUrl: w.webhookUrl,
      webhookSecret: "",
      supportedGameModes: w.supportedGameModes,
      priority: String(w.priority),
      status: w.status,
    });
    setShowSecret(false);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.webhookUrl) {
      toast({ title: "Name and Webhook URL are required", variant: "destructive" });
      return;
    }
    if (!editingId && !form.webhookSecret) {
      toast({ title: "Webhook Secret is required for new workers", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        webhookUrl: form.webhookUrl,
        supportedGameModes: form.supportedGameModes,
        priority: Number(form.priority),
        status: form.status,
      };
      if (form.webhookSecret) body.webhookSecret = form.webhookSecret;

      if (editingId) {
        const updated = await apiFetch<Worker>(`/admin/workers/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
        setWorkers((ws) => ws.map((w) => w.id === editingId ? updated : w));
      } else {
        const created = await apiFetch<Worker>("/admin/workers", { method: "POST", body: JSON.stringify(body) });
        setWorkers((ws) => [created, ...ws]);
      }
      setShowForm(false);
      toast({ title: editingId ? "Worker updated" : "Worker created" });
    } catch (err: any) {
      toast({ title: err?.message ?? "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this worker phone?")) return;
    setDeletingId(id);
    try {
      await apiFetch(`/admin/workers/${id}`, { method: "DELETE" });
      setWorkers((ws) => ws.filter((w) => w.id !== id));
      toast({ title: "Worker deleted" });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleStatus = async (w: Worker) => {
    const newStatus = w.status === "disabled" ? "active" : "disabled";
    try {
      const updated = await apiFetch<Worker>(`/admin/workers/${w.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      setWorkers((ws) => ws.map((x) => x.id === w.id ? updated : x));
    } catch {
      toast({ title: "Failed to update status", variant: "destructive" });
    }
  };

  const handleTest = async (w: Worker) => {
    setTestingId(w.id);
    try {
      const result = await apiFetch<{ ok: boolean; status?: number; latencyMs: number; error?: string }>(
        `/admin/workers/${w.id}/test`, { method: "POST" }
      );
      if (result.ok) {
        toast({ title: `Ping OK — ${result.latencyMs}ms (HTTP ${result.status})` });
      } else {
        toast({ title: `Ping failed: ${result.error ?? `HTTP ${result.status}`}`, variant: "destructive" });
      }
    } catch {
      toast({ title: "Test request failed", variant: "destructive" });
    } finally {
      setTestingId(null);
    }
  };

  const handleForceStop = async (w: Worker) => {
    if (!confirm(`Force-stop job on "${w.name}"? This will cancel the active match.`)) return;
    setStoppingId(w.id);
    try {
      const res = await apiFetch<{ ok: boolean; releasedMatchId: string | null }>(
        `/admin/workers/${w.id}/force-stop`, { method: "POST" }
      );
      toast({ title: res.releasedMatchId ? `Released match ${res.releasedMatchId.slice(0, 8)}…` : "Worker released" });
      load();
    } catch {
      toast({ title: "Force-stop failed", variant: "destructive" });
    } finally {
      setStoppingId(null);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "#0a0b0f" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]"
        style={{ background: "rgba(10,11,15,0.95)", backdropFilter: "blur(16px)", paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        <button
          onClick={() => navigate("/admin")}
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <Smartphone className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-white text-[15px]">Worker Phones</span>
        </div>
        <button
          onClick={load}
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
        </button>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-bold text-white"
          style={{ background: "rgba(34,211,238,0.18)", border: "1px solid rgba(34,211,238,0.3)" }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
          </div>
        ) : workers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Smartphone className="w-10 h-10 text-zinc-700" />
            <p className="text-zinc-500 text-[14px]">No worker phones registered.</p>
            <button
              onClick={openCreate}
              className="text-cyan-400 text-[13px] font-bold underline"
            >
              Add your first worker
            </button>
          </div>
        ) : (
          workers.map((w) => (
            <div
              key={w.id}
              className="rounded-2xl p-4 space-y-3"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {/* Worker header */}
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: w.status === "active" ? "rgba(34,211,238,0.12)" : "rgba(255,255,255,0.06)" }}
                >
                  {w.status === "active" ? <Wifi className="w-4 h-4 text-cyan-400" /> : <WifiOff className="w-4 h-4 text-zinc-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-white truncate">{w.name}</p>
                  <p className="text-[11px] text-zinc-500 truncate">{w.webhookUrl}</p>
                </div>
                {statusBadge(w.status)}
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Priority", value: w.priority },
                  { label: "Last Ping", value: timeAgo(w.lastHeartbeatAt) },
                  { label: "Modes", value: w.supportedGameModes.split(",").length },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl p-2 text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <p className="text-[15px] font-bold text-white">{value}</p>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</p>
                  </div>
                ))}
              </div>

              {/* Current job */}
              {w.currentJobMatchId && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}
                >
                  <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-[12px] text-amber-300 truncate flex-1">Job: {w.currentJobMatchId.slice(0, 16)}…</span>
                  <button
                    onClick={() => handleForceStop(w)}
                    disabled={stoppingId === w.id}
                    className="text-[11px] font-bold text-red-400 shrink-0"
                  >
                    {stoppingId === w.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Force Stop"}
                  </button>
                </div>
              )}

              {/* Supported modes */}
              <div className="flex flex-wrap gap-1.5">
                {w.supportedGameModes.split(",").map((m) => (
                  <span key={m} className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: "rgba(34,211,238,0.08)", color: "#22d3ee" }}>
                    {m.trim()}
                  </span>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => handleToggleStatus(w)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-bold transition-opacity"
                  style={{ background: w.status === "disabled" ? "rgba(34,211,238,0.12)" : "rgba(255,255,255,0.06)", color: w.status === "disabled" ? "#22d3ee" : "#a1a1aa" }}
                >
                  {w.status === "disabled" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {w.status === "disabled" ? "Enable" : "Disable"}
                </button>
                <button
                  onClick={() => handleTest(w)}
                  disabled={testingId === w.id}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-bold"
                  style={{ background: "rgba(255,255,255,0.06)", color: "#a1a1aa" }}
                >
                  {testingId === w.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Test Ping
                </button>
                <button
                  onClick={() => openEdit(w)}
                  className="w-10 h-9 flex items-center justify-center rounded-xl"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
                </button>
                <button
                  onClick={() => handleDelete(w.id)}
                  disabled={deletingId === w.id}
                  className="w-10 h-9 flex items-center justify-center rounded-xl"
                  style={{ background: "rgba(239,68,68,0.08)" }}
                >
                  {deletingId === w.id ? <Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm mx-4 rounded-2xl" style={{ background: "#111318", border: "1px solid rgba(255,255,255,0.1)" }}>
          <DialogHeader>
            <DialogTitle className="text-white">{editingId ? "Edit Worker Phone" : "Add Worker Phone"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-zinc-400 text-[12px] mb-1.5 block">Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Phone A — Redmi 12"
                className="bg-white/[0.05] border-white/10 text-white"
              />
            </div>
            <div>
              <Label className="text-zinc-400 text-[12px] mb-1.5 block">Webhook URL</Label>
              <Input
                value={form.webhookUrl}
                onChange={(e) => setForm((f) => ({ ...f, webhookUrl: e.target.value }))}
                placeholder="https://trigger.macrodroid.com/…"
                className="bg-white/[0.05] border-white/10 text-white font-mono text-[12px]"
              />
            </div>
            <div>
              <Label className="text-zinc-400 text-[12px] mb-1.5 block">
                Webhook Secret {editingId && <span className="text-zinc-600">(leave blank to keep existing)</span>}
              </Label>
              <div className="relative">
                <Input
                  type={showSecret ? "text" : "password"}
                  value={form.webhookSecret}
                  onChange={(e) => setForm((f) => ({ ...f, webhookSecret: e.target.value }))}
                  placeholder={editingId ? "Leave blank to keep existing" : "Enter a secure secret"}
                  className="bg-white/[0.05] border-white/10 text-white pr-10 font-mono text-[12px]"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-zinc-400 text-[12px] mb-1.5 block">Supported Game Modes (comma-separated)</Label>
              <Input
                value={form.supportedGameModes}
                onChange={(e) => setForm((f) => ({ ...f, supportedGameModes: e.target.value }))}
                placeholder="duel,healing,knife"
                className="bg-white/[0.05] border-white/10 text-white font-mono text-[12px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-[12px] mb-1.5 block">Priority (higher = first)</Label>
                <Input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  className="bg-white/[0.05] border-white/10 text-white"
                />
              </div>
              {editingId && (
                <div>
                  <Label className="text-zinc-400 text-[12px] mb-1.5 block">Status</Label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full h-10 rounded-xl px-3 text-[13px] text-white border border-white/10"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                  >
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-bold">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? "Save Changes" : "Add Worker"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
