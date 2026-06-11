import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Images, ArrowLeft, Plus, Pencil, Trash2, Upload, ExternalLink,
  Lock, RefreshCw, Image, X, Eye, EyeOff, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const REQUIRED_UC = "a464dfd00a173f6e10ac6a4774c62f52";
const SESSION_KEY = "czsa_v1_session";
const LOCKOUT_KEY = "czsa_v1_bm_lockout";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

interface SASession { token: string; expiresAt: number; }
interface LockoutInfo { attempts: number; lockoutUntil: number | null; }

interface BannerData {
  id: number;
  title: string;
  tag: string | null;
  subtitle: string | null;
  buttonText: string | null;
  buttonUrl: string | null;
  imageUrl: string | null;
  accentColor: string;
  placement: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BannerForm {
  title: string;
  tag: string;
  subtitle: string;
  buttonText: string;
  buttonUrl: string;
  accentColor: string;
  placement: string;
  displayOrder: number;
  isActive: boolean;
  imageUrl: string;
}

const ACCENT_SWATCHES = ["#a855f7", "#ea580c", "#eab308", "#38bdf8", "#ef4444", "#22c55e"];

const DEFAULT_BANNER_FORM: BannerForm = {
  title: "", tag: "", subtitle: "", buttonText: "", buttonUrl: "",
  accentColor: "#a855f7", placement: "home", displayOrder: 0, isActive: true, imageUrl: "",
};

function getSession(): SASession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SASession;
    if (Date.now() > s.expiresAt) { localStorage.removeItem(SESSION_KEY); return null; }
    return s;
  } catch { return null; }
}
function getLockout(): LockoutInfo {
  try {
    const raw = sessionStorage.getItem(LOCKOUT_KEY);
    return raw ? JSON.parse(raw) : { attempts: 0, lockoutUntil: null };
  } catch { return { attempts: 0, lockoutUntil: null }; }
}
function recordFail(): LockoutInfo {
  const info = getLockout();
  const attempts = info.attempts + 1;
  const lockoutUntil = attempts >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : null;
  const next: LockoutInfo = { attempts, lockoutUntil };
  sessionStorage.setItem(LOCKOUT_KEY, JSON.stringify(next));
  return next;
}
function clearLockout() { sessionStorage.removeItem(LOCKOUT_KEY); }

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function saFetch<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Super-Admin-Token": token, ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError((err as { error?: string }).error ?? res.statusText, res.status);
  }
  return res.json();
}

function bannerImgSrc(imageUrl: string | null): string {
  if (!imageUrl) return "";
  // Already a full path (new disk-upload) or external URL — use as-is
  if (imageUrl.startsWith("/api/") || imageUrl.startsWith("http")) return imageUrl;
  // Legacy object-storage path
  const path = imageUrl.startsWith("/objects/") ? imageUrl.slice("/objects/".length) : imageUrl;
  return `/api/storage/objects/${path}`;
}

function handleAuthError(navigate: (path: string) => void) {
  localStorage.removeItem(SESSION_KEY);
  navigate(`/286c81443d1fb388d1b9a8e3b280824c`);
}

export default function BannerManagementPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [phase, setPhase] = useState<"checking" | "denied" | "gate" | "unlocked">("checking");
  const [token, setToken] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [gateLoading, setGateLoading] = useState(false);
  const [lockout, setLockout] = useState<LockoutInfo>({ attempts: 0, lockoutUntil: null });

  const [banners, setBanners] = useState<BannerData[]>([]);
  const [bannersLoading, setBannersLoading] = useState(false);
  const [bannerModal, setBannerModal] = useState<{ mode: "create" | "edit"; banner?: BannerData } | null>(null);
  const [bannerForm, setBannerForm] = useState<BannerForm>(DEFAULT_BANNER_FORM);
  const [bannerSaving, setBannerSaving] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerDeleting, setBannerDeleting] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uc = params.get("uc");
    if (uc !== null && uc !== REQUIRED_UC) { setPhase("denied"); return; }
    const existing = getSession();
    if (existing) { setToken(existing.token); setPhase("unlocked"); return; }
    const li = getLockout();
    setLockout(li);
    setPhase("gate");
  }, []);

  const loadBanners = useCallback(async (tok: string) => {
    setBannersLoading(true);
    try {
      const data = await saFetch<BannerData[]>("/super-admin/banners", tok);
      setBanners(data);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        toast({ title: "Session expired", description: "Please log in again.", variant: "destructive" });
        handleAuthError(navigate);
        return;
      }
      toast({ title: "Failed to load banners", description: String(e), variant: "destructive" });
    } finally { setBannersLoading(false); }
  }, [toast, navigate]);

  useEffect(() => {
    if (phase === "unlocked" && token) loadBanners(token);
  }, [phase, token, loadBanners]);

  const handleAuth = async () => {
    const li = getLockout();
    if (li.lockoutUntil && Date.now() < li.lockoutUntil) {
      toast({ title: "Too many attempts", description: "Try again in 15 minutes.", variant: "destructive" });
      return;
    }
    if (!codeInput.trim()) return;
    const existing = getSession();
    if (!existing) {
      navigate(`/286c81443d1fb388d1b9a8e3b280824c`);
      return;
    }
    setGateLoading(true);
    try {
      const res = await fetch("/api/super-admin/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Super-Admin-Token": existing.token },
        body: JSON.stringify({ code: codeInput }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Invalid code");
      clearLockout();
      setToken(existing.token);
      setPhase("unlocked");
    } catch {
      const info = recordFail();
      setLockout(info);
      toast({ title: "Access denied", description: info.lockoutUntil ? "Account locked for 15 min." : `${MAX_ATTEMPTS - info.attempts} attempts left.`, variant: "destructive" });
    } finally { setGateLoading(false); }
  };

  const openCreateBanner = () => {
    setBannerForm({ ...DEFAULT_BANNER_FORM, displayOrder: banners.length });
    setBannerModal({ mode: "create" });
  };

  const openEditBanner = (b: BannerData) => {
    setBannerForm({
      title: b.title, tag: b.tag ?? "", subtitle: b.subtitle ?? "",
      buttonText: b.buttonText ?? "", buttonUrl: b.buttonUrl ?? "",
      accentColor: b.accentColor, placement: b.placement,
      displayOrder: b.displayOrder, isActive: b.isActive, imageUrl: b.imageUrl ?? "",
    });
    setBannerModal({ mode: "edit", banner: b });
  };

  const handleBannerImageUpload = async (file: File) => {
    setBannerUploading(true);
    try {
      const res = await fetch("/api/admin/banners/upload", {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "x-super-admin-token": token,
        },
        body: file,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      const { url } = await res.json() as { url: string };
      setBannerForm(f => ({ ...f, imageUrl: url }));
      toast({ title: "Image uploaded successfully" });
    } catch (e) {
      toast({ title: "Upload failed", description: String(e), variant: "destructive" });
    } finally { setBannerUploading(false); }
  };

  const handleBannerSave = async () => {
    if (!bannerForm.title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    setBannerSaving(true);
    try {
      if (bannerModal?.mode === "create") {
        const data = await saFetch<BannerData>("/super-admin/banners", token, {
          method: "POST", body: JSON.stringify(bannerForm),
        });
        setBanners(b => [...b, data]);
      } else if (bannerModal?.mode === "edit" && bannerModal.banner) {
        const data = await saFetch<BannerData>(`/super-admin/banners/${bannerModal.banner.id}`, token, {
          method: "PATCH", body: JSON.stringify(bannerForm),
        });
        setBanners(b => b.map(x => x.id === data.id ? data : x));
      }
      setBannerModal(null);
      toast({ title: "Banner saved" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { handleAuthError(navigate); return; }
      toast({ title: "Failed to save", description: String(e), variant: "destructive" });
    } finally { setBannerSaving(false); }
  };

  const handleBannerDelete = async (id: number) => {
    setBannerDeleting(id);
    try {
      await saFetch(`/super-admin/banners/${id}`, token, { method: "DELETE" });
      setBanners(b => b.filter(x => x.id !== id));
      toast({ title: "Banner deleted" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { handleAuthError(navigate); return; }
      toast({ title: "Failed to delete", description: String(e), variant: "destructive" });
    } finally { setBannerDeleting(null); }
  };

  const handleBannerToggle = async (b: BannerData) => {
    try {
      const data = await saFetch<BannerData>(`/super-admin/banners/${b.id}`, token, {
        method: "PATCH", body: JSON.stringify({ isActive: !b.isActive }),
      });
      setBanners(prev => prev.map(x => x.id === data.id ? data : x));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { handleAuthError(navigate); return; }
      toast({ title: "Failed to toggle", description: String(e), variant: "destructive" });
    }
  };

  if (phase === "checking") return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#0a0612]">
      <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (phase === "denied") return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#0a0612] p-8 text-center">
      <Lock className="w-16 h-16 text-destructive mb-4" />
      <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
      <p className="text-zinc-500 text-sm">Invalid access token.</p>
    </div>
  );

  if (phase === "gate") {
    const isLocked = lockout.lockoutUntil !== null && Date.now() < lockout.lockoutUntil;
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#0a0612] p-4">
        <div className="w-full max-w-sm rounded-3xl p-6 flex flex-col gap-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(168,85,247,0.2)" }}>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-1" style={{ background: "rgba(168,85,247,0.2)", border: "1px solid rgba(168,85,247,0.35)" }}>
              <Images className="w-7 h-7 text-violet-400" />
            </div>
            <h1 className="text-xl font-bold text-white font-heading">Banner Management</h1>
            <p className="text-xs text-zinc-500">Enter security code to access</p>
          </div>
          {isLocked && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-xs text-red-400">Too many attempts. Locked for 15 min.</p>
            </div>
          )}
          <div className="relative">
            <input
              type={showCode ? "text" : "password"}
              value={codeInput}
              onChange={e => setCodeInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !isLocked && handleAuth()}
              placeholder="Security code"
              disabled={isLocked}
              className="w-full rounded-xl bg-black/50 border border-white/15 text-white text-sm px-4 py-3 pr-10 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50 disabled:opacity-50"
            />
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white" onClick={() => setShowCode(v => !v)}>
              {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={handleAuth}
            disabled={isLocked || gateLoading || !codeInput.trim()}
            className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}
          >
            {gateLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Unlock"}
          </button>
        </div>
      </div>
    );
  }

  const activeCount = banners.filter(b => b.isActive).length;

  return (
    <div className="min-h-[100dvh] bg-[#0a0612] flex flex-col">

      {/* Header */}
      <div className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3 border-b border-white/8"
        style={{ background: "rgba(10,6,18,0.95)", backdropFilter: "blur(12px)" }}>
        <button
          onClick={() => navigate(`/286c81443d1fb388d1b9a8e3b280824c`)}
          className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(168,85,247,0.2)", border: "1px solid rgba(168,85,247,0.35)" }}>
          <Images className="w-4 h-4 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-white font-heading">Banner Management</h1>
          <p className="text-[10px] text-violet-400 uppercase tracking-widest font-bold">{banners.length} banners · {activeCount} active</p>
        </div>
        <button
          onClick={() => loadBanners(token)}
          disabled={bannersLoading}
          className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
        >
          <RefreshCw className={cn("w-4 h-4", bannersLoading && "animate-spin")} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col p-4 gap-4 max-w-2xl w-full mx-auto">

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Banners", value: banners.length, color: "text-white", bg: "rgba(168,85,247,0.07)", border: "rgba(168,85,247,0.2)" },
            { label: "Active", value: activeCount, color: "text-emerald-400", bg: "rgba(34,197,94,0.07)", border: "rgba(34,197,94,0.2)" },
            { label: "Inactive", value: banners.length - activeCount, color: "text-zinc-400", bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.1)" },
          ].map(s => (
            <div key={s.label} className="rounded-2xl px-3 py-3 flex flex-col gap-1" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
              <p className={cn("text-xl font-extrabold leading-none", s.color)}>{s.value}</p>
              <p className="text-[9px] text-zinc-500 uppercase tracking-wider font-bold leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Add banner button */}
        <button
          onClick={openCreateBanner}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-violet-400 border border-dashed border-violet-500/40 hover:border-violet-400/60 hover:bg-violet-500/5 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add New Banner
        </button>

        {/* Banner list */}
        {bannersLoading && banners.length === 0 && (
          <div className="flex flex-col gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
            ))}
          </div>
        )}

        {!bannersLoading && banners.length === 0 && (
          <div className="rounded-2xl px-4 py-12 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <Images className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
            <p className="text-sm font-bold text-zinc-500">No banners yet</p>
            <p className="text-[11px] text-zinc-700 mt-1">Create your first banner to display on the home page</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {banners.map(b => (
            <div key={b.id} className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${b.isActive ? b.accentColor + "40" : "rgba(255,255,255,0.07)"}`, background: "rgba(255,255,255,0.02)" }}>
              {b.imageUrl ? (
                <div className="relative h-32 w-full bg-zinc-900">
                  <img src={bannerImgSrc(b.imageUrl)} alt={b.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 55%)" }} />
                  {b.tag && (
                    <span className="absolute top-2 left-2 text-[10px] font-bold text-white/90 px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.55)" }}>
                      {b.tag}
                    </span>
                  )}
                  <span className={cn("absolute top-2 right-2 text-[9px] font-bold px-2 py-0.5 rounded-full")} style={{ background: b.isActive ? "rgba(34,197,94,0.13)" : "rgba(113,113,122,0.13)", border: `1px solid ${b.isActive ? "#22c55e60" : "#52525b60"}`, color: b.isActive ? "#4ade80" : "#71717a" }}>
                    {b.isActive ? "ACTIVE" : "INACTIVE"}
                  </span>
                  <div className="absolute bottom-2 left-3">
                    <p className="text-sm font-bold text-white drop-shadow">{b.title}</p>
                    {b.subtitle && <p className="text-[10px] text-white/60 truncate max-w-[220px]">{b.subtitle}</p>}
                  </div>
                </div>
              ) : (
                <div className="h-20 flex items-center justify-between px-4" style={{ background: `linear-gradient(135deg, ${b.accentColor}18 0%, transparent 100%)` }}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: b.accentColor }} />
                    <span className="text-sm font-bold text-white">{b.title}</span>
                    {b.tag && <span className="text-[10px] text-zinc-500">{b.tag}</span>}
                  </div>
                  <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full")} style={{ background: b.isActive ? "rgba(34,197,94,0.13)" : "rgba(113,113,122,0.13)", border: `1px solid ${b.isActive ? "#22c55e60" : "#52525b60"}`, color: b.isActive ? "#4ade80" : "#71717a" }}>
                    {b.isActive ? "ACTIVE" : "INACTIVE"}
                  </span>
                </div>
              )}

              <div className="px-3 py-2.5 flex items-center justify-between gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-3 min-w-0 flex-wrap">
                  {b.subtitle && !b.imageUrl && <span className="text-[10px] text-zinc-500 truncate max-w-[160px]">{b.subtitle}</span>}
                  <span className="text-[9px] text-zinc-600 uppercase font-bold">{b.placement}</span>
                  <span className="text-[9px] text-zinc-700">order {b.displayOrder}</span>
                  {b.buttonText && (
                    <span className="text-[9px] text-zinc-600 flex items-center gap-0.5">
                      <ExternalLink className="w-2.5 h-2.5" />{b.buttonText}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleBannerToggle(b)}
                    title={b.isActive ? "Deactivate" : "Activate"}
                    className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
                    style={{ background: b.isActive ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.05)", border: `1px solid ${b.isActive ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.08)"}` }}
                  >
                    <div className="w-3 h-3 rounded-full" style={{ background: b.isActive ? "#22c55e" : "#52525b" }} />
                  </button>
                  <button
                    onClick={() => openEditBanner(b)}
                    className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                  </button>
                  <button
                    onClick={() => handleBannerDelete(b.id)}
                    disabled={bannerDeleting === b.id}
                    className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors disabled:opacity-50"
                    style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}
                  >
                    {bannerDeleting === b.id
                      ? <div className="w-3.5 h-3.5 border border-red-400 border-t-transparent rounded-full animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="h-6" />
      </div>

      {/* Banner Modal */}
      {bannerModal && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ background: "rgba(0,0,0,0.7)" }} onClick={e => { if (e.target === e.currentTarget) setBannerModal(null); }}>
          <div className="rounded-t-3xl flex flex-col max-h-[92dvh]" style={{ background: "#0f0a1e", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)" }}>
                  <Images className="w-4 h-4 text-violet-400" />
                </div>
                <span className="text-base font-bold text-white">{bannerModal.mode === "create" ? "Add Banner" : "Edit Banner"}</span>
              </div>
              <button onClick={() => setBannerModal(null)} className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/5 hover:bg-white/10">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 pb-2 flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Banner Image</label>
                {bannerForm.imageUrl ? (
                  <div className="relative rounded-2xl overflow-hidden h-36 bg-zinc-900">
                    <img src={bannerImgSrc(bannerForm.imageUrl)} alt="preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)" }} />
                    <button onClick={() => setBannerForm(f => ({ ...f, imageUrl: "" }))}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors">
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>
                    <span className="absolute bottom-2 left-3 text-[10px] text-white/60">Tap X to remove</span>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 rounded-2xl h-32 cursor-pointer transition-colors" style={{ background: "rgba(255,255,255,0.03)", border: "1.5px dashed rgba(168,85,247,0.35)" }}>
                    {bannerUploading
                      ? <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                      : <><Upload className="w-5 h-5 text-violet-400" /><span className="text-xs text-zinc-400">Tap to upload image</span><span className="text-[10px] text-zinc-600">JPG, PNG, WebP</span></>
                    }
                    <input type="file" accept="image/*" className="sr-only" disabled={bannerUploading}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleBannerImageUpload(f); }} />
                  </label>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Title <span className="text-red-400">*</span></label>
                <input value={bannerForm.title} onChange={e => setBannerForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Friday Blitz"
                  className="w-full rounded-xl bg-white/5 border border-white/10 text-white text-sm px-4 py-2.5 placeholder:text-zinc-600 focus:outline-none focus:border-violet-400/50" />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Tag Label</label>
                <input value={bannerForm.tag} onChange={e => setBannerForm(f => ({ ...f, tag: e.target.value }))}
                  placeholder="e.g. Live Now"
                  className="w-full rounded-xl bg-white/5 border border-white/10 text-white text-sm px-4 py-2.5 placeholder:text-zinc-600 focus:outline-none focus:border-violet-400/50" />
                <p className="text-[10px] text-zinc-600 mt-1">Short text shown in the top-left corner of the banner</p>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Subtitle / Description</label>
                <input value={bannerForm.subtitle} onChange={e => setBannerForm(f => ({ ...f, subtitle: e.target.value }))}
                  placeholder="e.g. Solo · 50 players · ₹500 prize pool"
                  className="w-full rounded-xl bg-white/5 border border-white/10 text-white text-sm px-4 py-2.5 placeholder:text-zinc-600 focus:outline-none focus:border-violet-400/50" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Button Text</label>
                  <input value={bannerForm.buttonText} onChange={e => setBannerForm(f => ({ ...f, buttonText: e.target.value }))}
                    placeholder="Join Now"
                    className="w-full rounded-xl bg-white/5 border border-white/10 text-white text-sm px-3 py-2.5 placeholder:text-zinc-600 focus:outline-none focus:border-violet-400/50" />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Button URL</label>
                  <input value={bannerForm.buttonUrl} onChange={e => setBannerForm(f => ({ ...f, buttonUrl: e.target.value }))}
                    placeholder="/matches"
                    className="w-full rounded-xl bg-white/5 border border-white/10 text-white text-sm px-3 py-2.5 placeholder:text-zinc-600 focus:outline-none focus:border-violet-400/50" />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Accent Color</label>
                <div className="flex items-center gap-2">
                  {ACCENT_SWATCHES.map(c => (
                    <button key={c} onClick={() => setBannerForm(f => ({ ...f, accentColor: c }))}
                      className="w-8 h-8 rounded-full transition-all"
                      style={{ background: c, boxShadow: bannerForm.accentColor === c ? `0 0 0 2px #0f0a1e, 0 0 0 4px ${c}` : "none", transform: bannerForm.accentColor === c ? "scale(1.15)" : "scale(1)" }} />
                  ))}
                  <label className="relative w-8 h-8 rounded-full overflow-hidden cursor-pointer border border-white/20" title="Custom color"
                    style={{ background: ACCENT_SWATCHES.includes(bannerForm.accentColor) ? "rgba(255,255,255,0.08)" : bannerForm.accentColor }}>
                    <input type="color" value={bannerForm.accentColor} onChange={e => setBannerForm(f => ({ ...f, accentColor: e.target.value }))} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                    {ACCENT_SWATCHES.includes(bannerForm.accentColor) && <span className="flex items-center justify-center w-full h-full text-[10px] text-zinc-400">+</span>}
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Display Order</label>
                  <input type="number" min={0} value={bannerForm.displayOrder}
                    onChange={e => setBannerForm(f => ({ ...f, displayOrder: Number(e.target.value) }))}
                    className="w-full rounded-xl bg-white/5 border border-white/10 text-white text-sm px-3 py-2.5 focus:outline-none focus:border-violet-400/50" />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Placement</label>
                  <select value={bannerForm.placement} onChange={e => setBannerForm(f => ({ ...f, placement: e.target.value }))}
                    className="w-full rounded-xl bg-zinc-900 border border-white/10 text-white text-sm px-3 py-2.5 focus:outline-none focus:border-violet-400/50">
                    <option value="home">Home Page</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div>
                  <div className="text-sm font-bold text-white">Show banner</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Visible to all users when active</div>
                </div>
                <button onClick={() => setBannerForm(f => ({ ...f, isActive: !f.isActive }))}
                  className="w-11 h-6 rounded-full transition-colors relative"
                  style={{ background: bannerForm.isActive ? "#22c55e" : "rgba(255,255,255,0.15)" }}>
                  <div className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: bannerForm.isActive ? "calc(100% - 22px)" : 2 }} />
                </button>
              </div>
            </div>

            <div className="px-5 pt-3 pb-8 shrink-0 flex gap-3 border-t border-white/8">
              <button onClick={() => setBannerModal(null)} className="flex-1 py-3 rounded-2xl text-sm font-bold text-zinc-400 bg-white/5 hover:bg-white/10 transition-colors">
                Cancel
              </button>
              <button onClick={handleBannerSave} disabled={bannerSaving || !bannerForm.title.trim()}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}>
                {bannerSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                {bannerSaving ? "Saving…" : "Save Banner"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
