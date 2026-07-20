import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ChevronLeft, Loader2, Check, Target, AlertTriangle,
  ShieldCheck, Users, Lock, Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SESSION_KEY = "czsa_v1_session";
const SA_MAIN = "/286c81443d1fb388d1b9a8e3b280824c";

function getSAToken(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as { token: string; expiresAt: number };
    if (Date.now() > s.expiresAt) return null;
    return s.token;
  } catch { return null; }
}

async function saFetch<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getSAToken();
  if (!token) throw new Error("Not authenticated as super admin.");
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "x-super-admin-token": token,
      ...(opts.headers ?? {}),
    },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

interface Settings {
  minAccountLevel: number;
  joinWindowSeconds: number;
}

export default function AdminJoinSettingsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>({ minAccountLevel: 40, joinWindowSeconds: 30 });

  const [levelInput, setLevelInput] = useState("");
  const [savingLevel, setSavingLevel] = useState(false);

  const [windowInput, setWindowInput] = useState("");
  const [savingWindow, setSavingWindow] = useState(false);

  const load = useCallback(async () => {
    const token = getSAToken();
    if (!token) { navigate(SA_MAIN); return; }
    try {
      setLoading(true);
      const data = await saFetch<Settings>("/super-admin/system-settings");
      setSettings(data);
      setLevelInput(String(data.minAccountLevel));
      setWindowInput(String(data.joinWindowSeconds));
    } catch (e: unknown) {
      toast({ title: "Failed to load settings", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [navigate, toast]);

  useEffect(() => { load(); }, [load]);

  async function handleSaveLevel() {
    const val = parseInt(levelInput);
    if (isNaN(val) || val < 1 || val > 100) {
      toast({ title: "Invalid value", description: "Enter a number between 1 and 100.", variant: "destructive" });
      return;
    }
    try {
      setSavingLevel(true);
      const updated = await saFetch<Settings>("/super-admin/system-settings", {
        method: "PUT",
        body: JSON.stringify({ minAccountLevel: val }),
      });
      setSettings(updated);
      setLevelInput(String(updated.minAccountLevel));
      toast({ title: "Saved", description: `Minimum account level set to ${updated.minAccountLevel}.` });
    } catch (e: unknown) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingLevel(false);
    }
  }

  async function handleSaveWindow() {
    const val = parseInt(windowInput);
    if (isNaN(val) || val < 5 || val > 300) {
      toast({ title: "Invalid value", description: "Enter a number between 5 and 300 seconds.", variant: "destructive" });
      return;
    }
    try {
      setSavingWindow(true);
      const updated = await saFetch<Settings>("/super-admin/system-settings", {
        method: "PUT",
        body: JSON.stringify({ joinWindowSeconds: val }),
      });
      setSettings(updated);
      setWindowInput(String(updated.joinWindowSeconds));
      toast({ title: "Saved", description: `Join window set to ${updated.joinWindowSeconds}s.` });
    } catch (e: unknown) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingWindow(false);
    }
  }

  const levelVal = parseInt(levelInput);
  const levelValid = !isNaN(levelVal) && levelVal >= 1 && levelVal <= 100;
  const levelChanged = levelVal !== settings.minAccountLevel;

  const windowVal = parseInt(windowInput);
  const windowValid = !isNaN(windowVal) && windowVal >= 5 && windowVal <= 300;
  const windowChanged = windowVal !== settings.joinWindowSeconds;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(135deg, #0a0a0f 0%, #0f0f1a 50%, #0a0a12 100%)" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3"
        style={{ background: "rgba(10,10,20,0.85)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button
          onClick={() => navigate(SA_MAIN)}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <ChevronLeft className="w-4 h-4 text-zinc-400" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Target className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="text-sm font-bold text-white truncate">Join Requirements</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-5 pb-16">

        {/* ── JOIN WINDOW ── */}
        <div
          className="rounded-3xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(245,158,11,0.2)" }}
        >
          <div
            className="px-4 py-3 flex items-center gap-2"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(245,158,11,0.07)" }}
          >
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] text-amber-400/80 uppercase tracking-[0.15em] font-bold">Join Window Duration</span>
          </div>
          <div className="p-4 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
              </div>
            ) : (
              <div
                className="flex items-center justify-between rounded-2xl px-4 py-4"
                style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}
              >
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1">Active Window</p>
                  <p className="text-4xl font-black text-amber-300 leading-none">{settings.joinWindowSeconds}s</p>
                </div>
                <div className="text-right">
                  <Clock className="w-8 h-8 text-amber-500/40 ml-auto mb-1" />
                  <p className="text-[10px] text-zinc-600 leading-relaxed">
                    Time players have to join<br />the room after credentials arrive.
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 block">
                Set window duration (5–300 seconds)
              </label>
              <input
                type="number"
                min={5}
                max={300}
                value={windowInput}
                onChange={e => setWindowInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && windowValid && windowChanged) handleSaveWindow(); }}
                className="w-full h-12 rounded-xl px-4 text-base text-white font-mono outline-none transition-colors"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: `1px solid ${windowValid ? "rgba(245,158,11,0.35)" : "rgba(239,68,68,0.35)"}`,
                }}
              />
              {!windowValid && windowInput !== "" && (
                <p className="flex items-center gap-1 text-[10px] text-red-400 mt-1.5">
                  <AlertTriangle className="w-3 h-3" /> Must be between 5 and 300
                </p>
              )}
            </div>

            <button
              disabled={savingWindow || !windowValid || !windowChanged}
              onClick={handleSaveWindow}
              className="w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40"
              style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", color: "#fcd34d" }}
            >
              {savingWindow
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <><Check className="w-4 h-4" /> Save Join Window</>
              }
            </button>
          </div>
        </div>

        {/* ── MIN ACCOUNT LEVEL ── */}
        <div
          className="rounded-3xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(99,102,241,0.2)" }}
        >
          <div
            className="px-4 py-3 flex items-center gap-2"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(99,102,241,0.07)" }}
          >
            <Lock className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[10px] text-indigo-400/80 uppercase tracking-[0.15em] font-bold">Minimum Account Level</span>
          </div>
          <div className="p-4 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
              </div>
            ) : (
              <div
                className="flex items-center justify-between rounded-2xl px-4 py-4"
                style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.18)" }}
              >
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1">Active Minimum</p>
                  <p className="text-4xl font-black text-indigo-300 leading-none">Lv. {settings.minAccountLevel}</p>
                </div>
                <div className="text-right">
                  <ShieldCheck className="w-8 h-8 text-indigo-500/40 ml-auto mb-1" />
                  <p className="text-[10px] text-zinc-600 leading-relaxed">
                    Players below this level<br />cannot register on Clash Ren.
                  </p>
                </div>
              </div>
            )}

            {!loading && (
              <div>
                <div className="flex justify-between text-[10px] text-zinc-600 mb-1.5">
                  <span>Lv. 1</span>
                  <span>Lv. 100</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${settings.minAccountLevel}%`, background: "linear-gradient(90deg, #6366f1, #a78bfa)" }}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 block">
                Set new minimum (1–100)
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={levelInput}
                onChange={e => setLevelInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && levelValid && levelChanged) handleSaveLevel(); }}
                className="w-full h-12 rounded-xl px-4 text-base text-white font-mono outline-none transition-colors"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: `1px solid ${levelValid ? "rgba(99,102,241,0.35)" : "rgba(239,68,68,0.35)"}`,
                }}
              />
              {!levelValid && levelInput !== "" && (
                <p className="flex items-center gap-1 text-[10px] text-red-400 mt-1.5">
                  <AlertTriangle className="w-3 h-3" /> Must be between 1 and 100
                </p>
              )}
            </div>

            <button
              disabled={savingLevel || !levelValid || !levelChanged}
              onClick={handleSaveLevel}
              className="w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40"
              style={{ background: "rgba(99,102,241,0.18)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc" }}
            >
              {savingLevel
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <><Check className="w-4 h-4" /> Save Minimum Level</>
              }
            </button>
          </div>
        </div>

        {/* Info card */}
        <div
          className="rounded-2xl px-4 py-3 flex gap-3"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <Users className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-zinc-500 font-semibold mb-0.5">How these work</p>
            <p className="text-[11px] text-zinc-600 leading-relaxed">
              The join window is how long players have to enter the room after credentials are sent. The minimum level blocks new registrations from under-levelled accounts.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
