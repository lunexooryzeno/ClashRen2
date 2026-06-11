import React, { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { ArrowLeft, QrCode, Hash, Check, Users, Clock, AlertTriangle, X, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { apiFetch, apiPost, apiDelete } from "@/lib/api";

interface Invite {
  id: number;
  squadId: number;
  squadName: string;
  squadUid: string;
  leaderName: string;
  role: string;
  sentAt: string;
}

interface MySquad {
  id: number;
  name: string;
  uid: string;
  leaderId: number;
}

export default function SquadJoinPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"uid" | "qr">("uid");
  const [uidInput, setUidInput] = useState("");
  const [uidError, setUidError] = useState("");
  const [requestSent, setRequestSent] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<Invite[]>([]);
  const [mySquad, setMySquad] = useState<MySquad | null>(null);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [pendingTargetUid, setPendingTargetUid] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [squad, invites] = await Promise.all([
        apiFetch<MySquad | null>("/squads/my"),
        apiFetch<Invite[]>("/squads/invites"),
      ]);
      setMySquad(squad);
      setInvitations(invites);
    } catch { /* ignore */ }
    finally { setLoadingInvites(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const isLeader = mySquad ? mySquad.leaderId === user?.id : false;

  function handleJoin() {
    const v = uidInput.trim();
    if (!v) { setUidError("Please enter a Squad UID."); return; }
    if (!/^\d{10}$/.test(v)) { setUidError("Invalid Squad UID. Must be a 10-digit number."); return; }
    if (mySquad && v === mySquad.uid) { setUidError("That's your own squad UID."); return; }
    setUidError("");
    if (mySquad) {
      setPendingTargetUid(v);
      setShowLeaveModal(true);
    } else {
      sendJoinRequest(v);
    }
  }

  async function sendJoinRequest(targetUid: string) {
    try {
      const result = await apiPost<{ message: string; squadName: string }>("/squads/join-request", { squadUid: targetUid });
      setRequestSent(result.squadName ?? targetUid);
    } catch (err: unknown) {
      setUidError(err instanceof Error ? err.message : "Failed to send join request");
    }
  }

  async function confirmLeave() {
    setShowLeaveModal(false);
    if (!mySquad) return;
    try {
      await apiPost(`/squads/${mySquad.id}/leave`);
      setMySquad(null);
    } catch { /* ignore */ }
    sendJoinRequest(pendingTargetUid);
  }

  async function acceptInvite(inv: Invite) {
    try {
      await apiPost(`/squads/invites/${inv.id}/accept`);
      setInvitations(prev => prev.filter(i => i.id !== inv.id));
      setRequestSent(inv.squadName);
    } catch (err: unknown) {
      setUidError(err instanceof Error ? err.message : "Failed to accept invite");
    }
  }

  async function ignoreInvite(id: number) {
    try {
      await apiDelete(`/squads/invites/${id}`);
      setInvitations(prev => prev.filter(i => i.id !== id));
    } catch { /* ignore */ }
  }

  function formatTime(iso: string) {
    try {
      const diff = (Date.now() - new Date(iso).getTime()) / 1000;
      if (diff < 60) return "Just now";
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
    } catch { return ""; }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col profile-page-bg">
      <div className="flex items-center gap-3 px-4 pt-6 pb-4">
        <Link href="/profile">
          <button className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
        </Link>
        <div>
          <h1 className="font-heading text-lg font-bold text-foreground">Join Squad</h1>
          <p className="text-xs text-muted-foreground">Enter UID or scan QR code</p>
        </div>
      </div>

      <div className="flex-1 px-4 pb-10 overflow-y-auto">
        {requestSent ? (
          <div className="flex flex-col items-center justify-center pt-16 pb-10">
            <div className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center mb-5 border border-primary/30">
              <Send className="w-9 h-9 text-primary" />
            </div>
            <h2 className="font-heading text-2xl font-bold text-white mb-2">Request Sent!</h2>
            <p className="text-sm text-zinc-500 mb-1 text-center px-4">
              Your join request has been sent to the squad leader.
            </p>
            <p className="text-sm font-bold text-primary font-mono mb-2">{requestSent}</p>
            <p className="text-[11px] text-zinc-600 mb-8 text-center px-4">
              You'll be added once the leader accepts your request.
            </p>
            <Link href="/profile">
              <button className="h-12 px-8 rounded-2xl font-bold text-sm btn-primary-gradient text-white active:scale-95 transition-transform">
                Back to Profile
              </button>
            </Link>
          </div>
        ) : (
          <>
            <div className="flex rounded-2xl p-1 mb-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              {(["uid", "qr"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} className={cn("flex-1 h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all",
                  tab === t ? "btn-primary-gradient text-white shadow" : "text-zinc-500 hover:text-zinc-300"
                )}>
                  {t === "uid" ? <><Hash className="w-3.5 h-3.5" /> Enter UID</> : <><QrCode className="w-3.5 h-3.5" /> Scan QR</>}
                </button>
              ))}
            </div>

            {tab === "uid" ? (
              <div className="mb-6">
                <label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">Squad UID</label>
                <input
                  value={uidInput}
                  onChange={e => { setUidInput(e.target.value.replace(/\D/g, "")); setUidError(""); }}
                  placeholder="Enter 10-digit Squad UID"
                  maxLength={10}
                  inputMode="numeric"
                  onKeyDown={e => e.key === "Enter" && handleJoin()}
                  className="w-full h-12 rounded-xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-primary/40 font-mono tracking-widest mb-1"
                />
                {uidError && <p className="text-xs text-red-400 mb-3">{uidError}</p>}
                <p className="text-[11px] text-zinc-600 mb-4">Ask the squad leader to share their 10-digit Squad UID</p>
                <button onClick={handleJoin} className="w-full h-12 rounded-2xl font-bold text-sm btn-primary-gradient text-white active:scale-95 transition-transform">
                  Send Join Request
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center py-8 mb-6">
                <div className="w-64 h-64 rounded-3xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-3 mb-4"
                  style={{ background: "rgba(255,255,255,0.02)" }}>
                  <QrCode className="w-14 h-14 text-zinc-600" strokeWidth={1} />
                  <p className="text-sm text-zinc-600 text-center px-4">Camera access required<br />to scan QR codes</p>
                </div>
                <button className="h-11 px-6 rounded-2xl font-bold text-sm btn-primary-gradient text-white active:scale-95 transition-transform">
                  Open Camera
                </button>
              </div>
            )}

            {loadingInvites ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
              </div>
            ) : invitations.length > 0 ? (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Pending Invitations</p>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">{invitations.length}</span>
                </div>
                <div className="space-y-2">
                  {invitations.map(inv => (
                    <div key={inv.id} className="rounded-2xl p-3.5 flex items-center gap-3"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 border border-primary/25">
                        <Users className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{inv.squadName}</p>
                        <p className="text-[10px] text-zinc-500">by {inv.leaderName}</p>
                        <p className="text-[10px] text-zinc-600 flex items-center gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5" />{formatTime(inv.sentAt)}
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button onClick={() => acceptInvite(inv)} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 active:bg-emerald-500/25">
                          Accept
                        </button>
                        <button onClick={() => ignoreInvite(inv.id)} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-white/5 text-zinc-500 border border-white/10 active:bg-white/10">
                          Ignore
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl p-5 flex flex-col items-center text-center"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <Users className="w-8 h-8 text-zinc-700 mb-2" strokeWidth={1.5} />
                <p className="text-sm text-zinc-600">No pending invitations</p>
                <p className="text-[11px] text-zinc-700 mt-1">Ask a squad leader to invite you</p>
              </div>
            )}
          </>
        )}
      </div>

      {showLeaveModal && mySquad && (
        <>
          <div className="fixed inset-0 bg-black/75 z-[90] backdrop-blur-sm" onClick={() => setShowLeaveModal(false)} />
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-5">
            <div className="w-full max-w-sm rounded-3xl p-6 relative"
              style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 60px rgba(0,0,0,0.7)" }}>
              <button onClick={() => setShowLeaveModal(false)}
                className="absolute top-4 right-4 w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-zinc-400">
                <X className="w-4 h-4" />
              </button>
              <div className="flex flex-col items-center text-center mb-5">
                <div className={cn("w-14 h-14 rounded-full flex items-center justify-center mb-3",
                  isLeader ? "bg-red-500/15 border border-red-500/30" : "bg-amber-500/15 border border-amber-500/30")}>
                  <AlertTriangle className={cn("w-7 h-7", isLeader ? "text-red-400" : "text-amber-400")} />
                </div>
                <h3 className="font-heading text-lg font-bold text-white mb-2">
                  {isLeader ? "Leave & Delete Squad?" : "Leave Your Squad?"}
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {isLeader
                    ? <>You are the <span className="text-primary font-bold">Leader</span> of <span className="font-bold text-white">"{mySquad.name}"</span>. Leaving will <span className="text-red-400 font-bold">permanently delete</span> your squad.</>
                    : <>You will leave <span className="font-bold text-white">"{mySquad.name}"</span> and send a join request to the new squad.</>
                  }
                </p>
                <p className="text-xs text-zinc-600 mt-2">A join request will be sent to the leader for approval.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowLeaveModal(false)}
                  className="flex-1 h-11 rounded-2xl font-bold text-sm text-zinc-400 border border-white/10 bg-white/4 active:bg-white/8 transition-colors">
                  Cancel
                </button>
                <button onClick={confirmLeave}
                  className={cn("flex-1 h-11 rounded-2xl font-bold text-sm text-white active:scale-95 transition-transform",
                    isLeader ? "bg-red-500/80 border border-red-500/50" : "btn-primary-gradient")}>
                  {isLeader ? "Leave & Delete" : "Leave & Request"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
