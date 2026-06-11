import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft, Check, Copy, Crown, Plus, UserMinus, X,
  ChevronRight, Trash2, QrCode, Camera, UserCheck, Loader2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, apiPost, apiDelete, apiPatch } from "@/lib/api";

interface SlotMember { id: number; name: string | null; }
interface Slot { role: "primary" | "secondary"; memberId?: number; memberName?: string | null; pendingUid?: string; pendingMemberId?: number; isLeader?: boolean; }

interface ApiSquadMember {
  id: number;
  userId: number;
  inGameName: string | null;
  uid: string | null;
  role: "primary" | "secondary";
  status: "active" | "pending_invite" | "pending_request";
}
interface ApiJoinRequest {
  id: number;
  userId: number;
  inGameName: string | null;
  uid: string | null;
  sentAt: string;
}
interface ApiSquad {
  id: number;
  name: string;
  uid: string;
  leaderId: number;
  avatar: string | null;
  createdAt: string;
  members: ApiSquadMember[];
  joinRequests: ApiJoinRequest[];
}

function buildSlots(squad: ApiSquad): Slot[] {
  const primarySlots: Slot[] = [
    { role: "primary", isLeader: true },
    { role: "primary" },
    { role: "primary" },
    { role: "primary" },
  ];
  const secondarySlots: Slot[] = [
    { role: "secondary" },
    { role: "secondary" },
  ];

  // Place leader in primary[0]
  const leaderMember = squad.members.find(m => m.userId === squad.leaderId && m.status === "active");
  if (leaderMember) {
    primarySlots[0] = { role: "primary", isLeader: true, memberId: leaderMember.id, memberName: leaderMember.inGameName };
  }

  // Place other primary active members
  const activePrimary = squad.members.filter(m => m.userId !== squad.leaderId && m.role === "primary" && m.status === "active");
  const pendingPrimary = squad.members.filter(m => m.role === "primary" && m.status === "pending_invite");
  const activeSecondary = squad.members.filter(m => m.role === "secondary" && m.status === "active");
  const pendingSecondary = squad.members.filter(m => m.role === "secondary" && m.status === "pending_invite");

  let pIdx = 1;
  for (const m of activePrimary) {
    if (pIdx < 4) {
      primarySlots[pIdx] = { role: "primary", memberId: m.id, memberName: m.inGameName };
      pIdx++;
    }
  }
  for (const m of pendingPrimary) {
    if (pIdx < 4) {
      primarySlots[pIdx] = { role: "primary", pendingUid: m.uid ?? "...", pendingMemberId: m.id };
      pIdx++;
    }
  }

  let sIdx = 0;
  for (const m of activeSecondary) {
    if (sIdx < 2) {
      secondarySlots[sIdx] = { role: "secondary", memberId: m.id, memberName: m.inGameName };
      sIdx++;
    }
  }
  for (const m of pendingSecondary) {
    if (sIdx < 2) {
      secondarySlots[sIdx] = { role: "secondary", pendingUid: m.uid ?? "...", pendingMemberId: m.id };
      sIdx++;
    }
  }

  return [...primarySlots, ...secondarySlots];
}

type Step = "name" | "slots";

export default function SquadCreatePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("name");
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState("");
  const [squad, setSquad] = useState<ApiSquad | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [showInviteFor, setShowInviteFor] = useState<number | null>(null);
  const [inviteUidInput, setInviteUidInput] = useState("");
  const [inviteUidError, setInviteUidError] = useState("");
  const [inviteRole, setInviteRole] = useState<"primary" | "secondary">("primary");
  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const refreshSquad = useCallback(async () => {
    try {
      const data = await apiFetch<ApiSquad | null>("/squads/my");
      setSquad(data);
      if (data) {
        setSlots(buildSlots(data));
        setStep("slots");
      } else {
        setStep("name");
      }
    } catch {
      setStep("name");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshSquad(); }, [refreshSquad]);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !squad) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const img = new Image();
      img.onload = async () => {
        const MAX = 256;
        const scale = Math.min(MAX / img.width, MAX / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL("image/jpeg", 0.7);
        try {
          await apiPatch(`/squads/${squad.id}/avatar`, { avatar: compressed });
          setSquad(prev => prev ? { ...prev, avatar: compressed } : prev);
        } catch { /* ignore */ }
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function handleCreate() {
    const trimmed = nameInput.trim();
    if (!trimmed) { setNameError("Please enter a squad name."); return; }
    if (trimmed.length < 3) { setNameError("Name must be at least 3 characters."); return; }
    setCreating(true);
    try {
      const data = await apiPost<ApiSquad>("/squads", { name: trimmed });
      setSquad(data);
      setSlots(buildSlots(data));
      setStep("slots");
      setTimeout(() => toast({ title: "Squad created!", description: "Share your Squad UID to invite members." }), 100);
    } catch (err: unknown) {
      setNameError(err instanceof Error ? err.message : "Failed to create squad");
    } finally {
      setCreating(false);
    }
  }

  async function handleSendInvite() {
    if (!squad) return;
    const uid = inviteUidInput.trim();
    if (!uid) { setInviteUidError("Please enter a player UID."); return; }
    if (!/^\d{10}$/.test(uid)) { setInviteUidError("UID must be a 10-digit number."); return; }
    try {
      await apiPost(`/squads/${squad.id}/invites`, { playerUid: uid, role: inviteRole });
      setShowInviteFor(null);
      setInviteUidInput("");
      setInviteUidError("");
      toast({ title: "Invite sent!", description: `Invite sent to player ${uid}.` });
      refreshSquad();
    } catch (err: unknown) {
      setInviteUidError(err instanceof Error ? err.message : "Failed to send invite");
    }
  }

  async function handleCancelInvite(memberId: number) {
    if (!squad) return;
    try {
      await apiDelete(`/squads/${squad.id}/members/${memberId}`);
      refreshSquad();
    } catch { /* ignore */ }
  }

  async function handleKick(memberId: number) {
    if (!squad) return;
    try {
      await apiDelete(`/squads/${squad.id}/members/${memberId}`);
      refreshSquad();
    } catch { /* ignore */ }
  }

  async function handleAcceptJoinRequest(reqId: number, name: string | null) {
    try {
      await apiPost(`/squads/join-requests/${reqId}/accept`);
      toast({ title: `${name ?? "Player"} added!`, description: "They've been placed in the squad." });
      refreshSquad();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to accept" });
    }
  }

  async function handleDeclineJoinRequest(reqId: number) {
    try {
      await apiDelete(`/squads/join-requests/${reqId}`);
      refreshSquad();
    } catch { /* ignore */ }
  }

  async function handleDelete() {
    if (!squad) return;
    try {
      await apiDelete(`/squads/${squad.id}`);
      navigate("/profile");
    } catch { /* ignore */ }
  }

  function copyUid() {
    if (!squad) return;
    navigator.clipboard.writeText(squad.uid).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex flex-col profile-page-bg items-center justify-center">
        <Loader2 className="w-7 h-7 text-zinc-500 animate-spin" />
      </div>
    );
  }

  const qrPayload = squad ? JSON.stringify({ app: "clash-zen", type: "squad", uid: squad.uid, name: squad.name }) : "";
  const primarySlots = slots.filter(s => s.role === "primary");
  const secondarySlots = slots.filter(s => s.role === "secondary");

  if (step === "name") {
    return (
      <div className="min-h-[100dvh] flex flex-col profile-page-bg">
        <PageHeader title="Create Squad" back="/profile" />
        <div className="flex-1 px-4 pt-4 pb-10">
          <div className="mb-6">
            <h2 className="font-heading text-2xl font-bold text-white mb-1">Setup Your Squad</h2>
            <p className="text-sm text-zinc-500">Choose a unique squad name to get started.</p>
          </div>

          <label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">Squad Name</label>
          <input
            value={nameInput}
            onChange={e => { setNameInput(e.target.value); setNameError(""); }}
            placeholder="Enter your unique squad name"
            maxLength={20}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
            className="w-full h-12 rounded-xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-primary/40 mb-1"
          />
          {nameError && <p className="text-xs text-red-400 mb-4">{nameError}</p>}
          <div className="rounded-xl p-3 mb-6 mt-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-[11px] text-zinc-500">
              Squad structure: <span className="text-primary font-semibold">4 Primary</span> + <span className="text-blue-400 font-semibold">2 Secondary</span> members
            </p>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full h-12 rounded-2xl font-bold text-sm btn-primary-gradient text-white active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2">
            {creating && <Loader2 className="w-4 h-4 animate-spin" />}
            Create Squad
          </button>
        </div>
      </div>
    );
  }

  if (!squad) return null;

  return (
    <div className="min-h-[100dvh] flex flex-col profile-page-bg">
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

      <div className="flex items-center gap-3 px-4 pt-6 pb-4 relative z-10">
        <Link href="/profile">
          <button className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
        </Link>
        <h1 className="font-heading text-lg font-bold text-foreground">My Squad</h1>
      </div>

      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center px-6" onClick={() => setShowQrModal(false)}>
          <div className="rounded-3xl p-6 flex flex-col items-center gap-3 w-full max-w-xs relative"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--primary) / 0.3)" }}
            onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowQrModal(false)} className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-zinc-400">
              <X className="w-4 h-4" />
            </button>
            <p className="font-heading font-bold text-white text-base">{squad.name}</p>
            <p className="text-[10px] text-zinc-500 font-mono">{squad.uid}</p>
            <div className="p-3 rounded-xl bg-white">
              <QRCodeSVG value={qrPayload} size={180} level="M" bgColor="#ffffff" fgColor="#000000" />
            </div>
            <p className="text-[10px] text-zinc-500">Scan to join {squad.name}</p>
          </div>
        </div>
      )}

      <div className="flex-1 px-4 pb-32 overflow-y-auto">
        {/* Squad profile card */}
        <div className="rounded-3xl p-4 mb-4 flex items-start gap-4"
          style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--primary)/0.2)" }}>
          <button
            onClick={() => avatarInputRef.current?.click()}
            className="relative w-20 h-20 rounded-2xl overflow-hidden shrink-0 active:scale-95 transition-transform"
            style={{ background: squad.avatar ? "transparent" : "rgba(255,255,255,0.05)", border: squad.avatar ? "2px solid hsl(var(--primary)/0.45)" : "2px dashed rgba(255,255,255,0.15)" }}>
            {squad.avatar
              ? <img src={squad.avatar} alt="Squad avatar" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                  <Camera className="w-6 h-6 text-zinc-500" />
                  <span className="text-[9px] text-zinc-600">Photo</span>
                </div>
            }
            <div className="absolute bottom-1 right-1 w-5 h-5 rounded-lg bg-primary flex items-center justify-center">
              <Camera className="w-3 h-3 text-white" />
            </div>
          </button>

          <div className="flex-1 min-w-0">
            <p className="font-heading font-bold text-white text-[15px] leading-tight truncate">{squad.name}</p>
            <p className="text-[11px] text-zinc-400 font-mono tracking-widest mt-1">{squad.uid}</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">
              Created {new Date(squad.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </p>
            <div className="my-2.5 border-t border-white/6" />
            <div className="flex gap-2">
              <button
                onClick={() => setShowQrModal(true)}
                className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl text-[11px] font-bold active:opacity-70 transition-opacity"
                style={{ background: "hsl(var(--primary)/0.12)", border: "1px solid hsl(var(--primary)/0.25)", color: "hsl(var(--primary))" }}>
                <QrCode className="w-3 h-3" /> Show QR
              </button>
              <button
                onClick={copyUid}
                className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl text-[11px] font-bold active:opacity-70 transition-opacity"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: copied ? "#34d399" : "#a1a1aa" }}>
                {copied ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy UID</>}
              </button>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-2">
          Primary Members <span className="text-primary font-bold">({primarySlots.filter(s => s.memberId && !s.pendingMemberId).length}/4)</span>
        </p>
        <div className="space-y-2 mb-5">
          {primarySlots.map((slot, i) => (
            <SlotCard
              key={i}
              slot={slot}
              label={`Primary ${i + 1}`}
              onInvite={() => { setShowInviteFor(i); setInviteRole("primary"); }}
              onKick={() => slot.memberId && handleKick(slot.memberId)}
              onCancelInvite={() => slot.pendingMemberId && handleCancelInvite(slot.pendingMemberId)}
              isLeader={i === 0}
            />
          ))}
        </div>

        <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-2">
          Secondary Members <span className="text-blue-400 font-bold">({secondarySlots.filter(s => s.memberId && !s.pendingMemberId).length}/2)</span>
        </p>
        <div className="space-y-2 mb-5">
          {secondarySlots.map((slot, i) => (
            <SlotCard
              key={i}
              slot={slot}
              label={`Secondary ${i + 1}`}
              onInvite={() => { setShowInviteFor(4 + i); setInviteRole("secondary"); }}
              onKick={() => slot.memberId && handleKick(slot.memberId)}
              onCancelInvite={() => slot.pendingMemberId && handleCancelInvite(slot.pendingMemberId)}
              secondary
            />
          ))}
        </div>

        {squad.joinRequests.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Join Requests</p>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">{squad.joinRequests.length}</span>
            </div>
            <div className="space-y-2">
              {squad.joinRequests.map(req => (
                <div key={req.id} className="rounded-2xl p-3.5 flex items-center gap-3"
                  style={{ background: "rgba(234,179,8,0.05)", border: "1px solid rgba(234,179,8,0.18)" }}>
                  <div className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0 text-lg">🎮</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{req.inGameName ?? "Player"}</p>
                    {req.uid && <p className="text-[10px] text-zinc-500 font-mono">{req.uid}</p>}
                    <p className="text-[10px] text-amber-600 mt-0.5">Wants to join</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => handleAcceptJoinRequest(req.id, req.inGameName)}
                      className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 active:bg-emerald-500/25">
                      <UserCheck className="w-3 h-3" /> Accept
                    </button>
                    <button onClick={() => handleDeclineJoinRequest(req.id)}
                      className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 active:bg-red-500/20">
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 z-10"
        style={{ background: "linear-gradient(to top, rgba(2,2,2,0.95) 65%, transparent 100%)" }}>
        <button
          onClick={() => { setShowDeleteModal(true); setDeleteConfirm(""); }}
          className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all font-bold text-sm text-red-400"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)" }}>
          <Trash2 className="w-4 h-4" /> Delete Squad
        </button>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center px-5" onClick={() => setShowDeleteModal(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm rounded-3xl p-6"
            style={{ background: "hsl(var(--card))", border: "1px solid rgba(239,68,68,0.25)" }}
            onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowDeleteModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center">
              <X className="w-4 h-4 text-zinc-400" />
            </button>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="font-heading font-bold text-white text-base">Delete Squad</p>
                <p className="text-[11px] text-zinc-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-zinc-400 mb-4">
              Type <span className="font-bold text-white">{squad.name}</span> to confirm deletion.
            </p>
            <input
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder={squad.name}
              className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-zinc-700 outline-none focus:border-red-500/40 mb-4"
            />
            <button
              disabled={deleteConfirm !== squad.name}
              onClick={handleDelete}
              className="w-full h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-35 disabled:pointer-events-none"
              style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)", boxShadow: "0 0 20px rgba(239,68,68,0.3)" }}>
              <Trash2 className="w-4 h-4" /> Delete Squad
            </button>
          </div>
        </div>
      )}

      {showInviteFor !== null && (
        <>
          <div className="fixed inset-0 bg-black/75 z-[70] backdrop-blur-sm" onClick={() => { setShowInviteFor(null); setInviteUidInput(""); setInviteUidError(""); }} />
          <div className="fixed bottom-0 left-0 right-0 z-[80] rounded-t-[28px]"
            style={{ background: "hsl(var(--popover) / 0.98)", borderTop: "1px solid hsl(var(--primary) / 0.18)", boxShadow: "0 -20px 60px rgba(0,0,0,0.6)" }}>
            <div className="mx-auto mt-2.5 mb-1 w-10 h-1 rounded-full bg-white/15" />
            <div className="px-5 pt-3 pb-2 flex items-center justify-between">
              <div>
                <h2 className="font-heading text-base font-bold text-white">Invite Player</h2>
                <p className="text-[11px] text-zinc-500">
                  {showInviteFor < 4 ? `Primary ${showInviteFor + 1}` : `Secondary ${showInviteFor - 3}`} slot
                </p>
              </div>
              <button onClick={() => { setShowInviteFor(null); setInviteUidInput(""); setInviteUidError(""); }}
                className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-zinc-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 pb-10 pt-2">
              <label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">Player Free Fire UID</label>
              <input
                value={inviteUidInput}
                onChange={e => { setInviteUidInput(e.target.value.replace(/\D/g, "")); setInviteUidError(""); }}
                placeholder="Enter 10-digit player UID"
                maxLength={10}
                inputMode="numeric"
                onKeyDown={e => e.key === "Enter" && handleSendInvite()}
                className="w-full h-12 rounded-xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-primary/40 font-mono tracking-widest mb-1"
                autoFocus
              />
              {inviteUidError
                ? <p className="text-xs text-red-400 mb-4">{inviteUidError}</p>
                : <p className="text-[11px] text-zinc-600 mb-4">Enter the player's Free Fire UID to invite them</p>
              }
              <button
                onClick={handleSendInvite}
                className="w-full h-12 rounded-2xl font-bold text-sm btn-primary-gradient text-white active:scale-95 transition-transform">
                Send Invite
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PageHeader({ title, back }: { title: string; back: string }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-6 pb-4">
      <Link href={back}>
        <button className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
      </Link>
      <h1 className="font-heading text-lg font-bold text-foreground">{title}</h1>
    </div>
  );
}

function SlotCard({ slot, label, onInvite, onKick, onCancelInvite, secondary, isLeader }: {
  slot: Slot; label: string; onInvite: () => void; onKick: () => void; onCancelInvite: () => void; secondary?: boolean; isLeader?: boolean;
}) {
  const isPending = !!slot.pendingMemberId;
  const hasMember = !!slot.memberId && !isPending;

  return (
    <div className="rounded-2xl p-3.5 flex items-center gap-3"
      style={{
        background: isLeader
          ? "linear-gradient(135deg, hsl(var(--primary) / 0.13), hsl(var(--primary) / 0.05))"
          : isPending ? "rgba(234,179,8,0.06)"
          : hasMember ? (secondary ? "rgba(59,130,246,0.07)" : "rgba(255,255,255,0.04)") : "rgba(255,255,255,0.02)",
        border: `1px solid ${isLeader ? "hsl(var(--primary) / 0.35)" : isPending ? "rgba(234,179,8,0.25)" : hasMember ? (secondary ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.08)") : "rgba(255,255,255,0.05)"}`,
      }}>
      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0",
        isLeader ? "bg-primary/20 border border-primary/40" : isPending ? "bg-yellow-500/15 border border-yellow-500/25" : hasMember ? "bg-zinc-800 text-lg" : "bg-white/3 border border-dashed border-white/10"
      )}>
        {isLeader
          ? <Crown className="w-5 h-5 text-primary" />
          : isPending ? <ChevronRight className="w-4 h-4 text-yellow-400" />
          : hasMember ? "🎮" : <Plus className="w-4 h-4 text-zinc-600" />
        }
      </div>
      <div className="flex-1 min-w-0">
        {isLeader || hasMember
          ? <><p className="text-sm font-bold text-white truncate">{slot.memberName ?? "Player"}</p><p className="text-[10px] text-zinc-500">{label}</p></>
          : isPending
            ? <><p className="text-sm font-bold text-yellow-300 truncate font-mono">{slot.pendingUid}</p><p className="text-[10px] text-yellow-600">Invite pending…</p></>
            : <><p className="text-sm text-zinc-600">{label}</p><p className="text-[10px] text-zinc-700">Empty slot</p></>
        }
      </div>
      {isLeader
        ? <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: "hsl(var(--primary) / 0.2)", color: "hsl(var(--primary))" }}>LEADER</span>
        : isPending
          ? <button onClick={onCancelInvite} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 active:bg-red-500/20 shrink-0">Cancel</button>
          : hasMember
            ? <button onClick={onKick} className="p-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 active:bg-red-500/20"><UserMinus className="w-3.5 h-3.5" /></button>
            : <button onClick={onInvite} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary/15 text-primary border border-primary/25 active:bg-primary/25">Invite</button>
      }
    </div>
  );
}
