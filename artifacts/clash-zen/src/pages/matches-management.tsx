import React, { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import {
  ArrowLeft, Plus, Pencil, Trash2, Trophy, Swords, Lock,
  RefreshCw, X, ChevronDown, ToggleLeft, ToggleRight, Copy,
  Shield, Zap, Clock, Gem, Wallet, Star, Users, Target,
  Image, AlignLeft, Settings, Hash, AlertTriangle, CheckCircle,
  Eye, EyeOff, Flame, Upload, ExternalLink, Gamepad2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const REQUIRED_UC = "a464dfd00a173f6e10ac6a4774c62f52";
const SESSION_KEY = "czsa_v1_session";

interface SASession { token: string; expiresAt: number; }

function getSession(): SASession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SASession;
    if (Date.now() > s.expiresAt) { localStorage.removeItem(SESSION_KEY); return null; }
    return s;
  } catch { return null; }
}

const MATCH_TYPES = ["BR Solo", "BR Duo", "BR Squad", "CS", "Lone Wolf", "Craftland", "Custom"];
const GAME_MODES  = ["Ranked", "Casual", "Knockout", "Elimination", "Practice"];
const MAPS        = ["Bermuda", "Kalahari", "Purgatory", "Nexterra", "Alpine", "Bermuda Remastered", "Iron Cage"];
const ELIM_FORMATS = ["Single Elimination", "Double Elimination", "Round Robin", "Swiss"];
const RULE_TEMPLATES = [
  "No teaming allowed",
  "No hacking or third-party software",
  "Respect all players",
  "Follow admin instructions",
  "No stream sniping",
  "Emulators not allowed",
  "Only headshots count",
  "No camping allowed",
  "Late joins will be disqualified",
  "Screenshots required for proof",
  "Room password must not be shared",
  "Admin decision is final",
  "One account per player",
  "Must be in the room 5 minutes before start",
  "Disconnection = elimination",
];

interface PlacementReward { place: number; diamonds: number; wallet: number; }

interface KnockoutMatch {
  id: string;
  title: string;
  tournamentName: string;
  matchType: string;
  gameMode: string;
  map: string;
  description: string;
  thumbnail: string;
  maxPlayers: number;
  minPlayers: number;
  teamSize: number;
  numRounds: number;
  elimFormat: string;
  autoStart: boolean;
  totalSlots: number;
  reservedSlots: number;
  publicSlots: number;
  customRules: string;
  selectedRuleTemplates: string[];
  roomId: string;
  roomPassword: string;
  roomRevealTime: string;
  delayedReveal: boolean;
  revealMinsBefore: number;
  entryFee: number;
  prizePool: number;
  winnerDiamonds: number;
  winnerWallet: number;
  placements: PlacementReward[];
  status: "draft" | "upcoming" | "live" | "completed";
  createdAt: string;
}

const EMPTY_MATCH: Omit<KnockoutMatch, "id" | "createdAt"> = {
  title: "", tournamentName: "", matchType: "BR Solo", gameMode: "Knockout",
  map: "Bermuda", description: "", thumbnail: "",
  maxPlayers: 50, minPlayers: 10, teamSize: 1, numRounds: 1,
  elimFormat: "Single Elimination", autoStart: false,
  totalSlots: 30, reservedSlots: 0, publicSlots: 30,
  customRules: "", selectedRuleTemplates: [],
  roomId: "", roomPassword: "", roomRevealTime: "", delayedReveal: true,
  revealMinsBefore: 5,
  entryFee: 0, prizePool: 0, winnerDiamonds: 0, winnerWallet: 0,
  placements: [
    { place: 1, diamonds: 0, wallet: 0 },
    { place: 2, diamonds: 0, wallet: 0 },
    { place: 3, diamonds: 0, wallet: 0 },
  ],
  status: "draft",
};

function genId() { return Math.random().toString(36).slice(2, 10); }
function genRoom() {
  const id = Math.floor(100000 + Math.random() * 900000).toString();
  const pw = Math.random().toString(36).slice(2, 8).toUpperCase();
  return { id, pw };
}

/* ── Select field helper ── */
function SelectField({ label, value, options, onChange, accent = "#a855f7" }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; accent?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full appearance-none px-3 py-2.5 rounded-xl text-[13px] font-medium text-white pr-8 focus:outline-none"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
        >
          {options.map(o => <option key={o} value={o} style={{ background: "#18181b" }}>{o}</option>)}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
      </div>
    </div>
  );
}

/* ── Text input helper ── */
function InputField({ label, value, onChange, type = "text", placeholder = "", suffix = "" }: {
  label: string; value: string | number; onChange: (v: string) => void;
  type?: string; placeholder?: string; suffix?: string;
}) {
  const isNumeric = type === "number";
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{label}</label>
      <div className="relative">
        <input
          type={isNumeric ? "text" : type}
          inputMode={isNumeric ? "numeric" : undefined}
          value={value}
          onChange={e => {
            if (isNumeric) {
              const v = e.target.value.replace(/[^0-9]/g, "");
              onChange(v);
            } else {
              onChange(e.target.value);
            }
          }}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 rounded-xl text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-zinc-500">{suffix}</span>
        )}
      </div>
    </div>
  );
}

/* ── Toggle helper ── */
function ToggleField({ label, value, onChange, desc = "" }: {
  label: string; value: boolean; onChange: (v: boolean) => void; desc?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex items-center justify-between w-full py-2"
    >
      <div className="flex flex-col items-start">
        <span className="text-[12px] font-semibold text-white">{label}</span>
        {desc && <span className="text-[10px] text-zinc-500">{desc}</span>}
      </div>
      {value
        ? <ToggleRight className="w-6 h-6 text-violet-400 shrink-0" />
        : <ToggleLeft className="w-6 h-6 text-zinc-600 shrink-0" />}
    </button>
  );
}

/* ── Section header ── */
function SectionHead({ icon: Icon, label, color = "#a855f7" }: { icon: React.ElementType; label: string; color?: string; }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-1">
      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}20` }}>
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: `${color}30` }} />
    </div>
  );
}

/* ── Match Form Modal ── */
function MatchFormModal({
  initial, onSave, onClose, kind = "knockout",
}: {
  initial: Partial<KnockoutMatch> | null;
  onSave: (m: Omit<KnockoutMatch, "id" | "createdAt">) => void;
  onClose: () => void;
  kind?: "knockout" | "tournament";
}) {
  const accent     = kind === "tournament" ? "#f59e0b" : "#a855f7";
  const accentDark = kind === "tournament" ? "#b45309" : "#7c3aed";
  const kindLabel  = kind === "tournament" ? "Tournament" : "Knockout Match";
  const [form, setForm] = useState<Omit<KnockoutMatch, "id" | "createdAt">>({
    ...EMPTY_MATCH, ...(initial ?? {}),
  });
  const [showPw, setShowPw] = useState(false);
  const { toast } = useToast();

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  function handleAutoGenRoom() {
    const { id, pw } = genRoom();
    setForm(prev => ({ ...prev, roomId: id, roomPassword: pw }));
    toast({ title: "Room generated", description: `ID: ${id} · PW: ${pw}` });
  }

  function handleOpenInFF() {
    toast({ title: "Opening in Free Fire", description: "Launching game client…" });
  }

  function handleThumbnailUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set("thumbnail", ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function toggleRule(rule: string) {
    set("selectedRuleTemplates",
      form.selectedRuleTemplates.includes(rule)
        ? form.selectedRuleTemplates.filter(r => r !== rule)
        : [...form.selectedRuleTemplates, rule]
    );
  }

  function updatePlacement(idx: number, field: keyof PlacementReward, val: number) {
    const updated = form.placements.map((p, i) => i === idx ? { ...p, [field]: val } : p);
    set("placements", updated);
  }

  function addPlacement() {
    set("placements", [...form.placements, { place: form.placements.length + 1, diamonds: 0, wallet: 0 }]);
  }

  function removePlacement(idx: number) {
    set("placements", form.placements.filter((_, i) => i !== idx).map((p, i) => ({ ...p, place: i + 1 })));
  }

  function handleSubmit() {
    if (!form.title.trim()) {
      toast({ title: "Match title required", variant: "destructive" });
      return;
    }
    onSave(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0a0a0b" }}>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3.5 border-b" style={{ borderColor: "rgba(255,255,255,0.07)", background: "#0f0f10" }}>
        <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
          <X className="w-4 h-4 text-zinc-400" />
        </button>
        <div className="flex-1">
          <p className="text-[13px] font-bold text-white">{initial?.id ? `Edit ${kindLabel}` : `New ${kindLabel}`}</p>
          <p className="text-[10px] text-zinc-500">Fill in details below</p>
        </div>
        <button
          onClick={handleSubmit}
          className="px-4 py-2 rounded-xl text-[12px] font-bold text-white transition-all active:scale-95"
          style={{ background: `linear-gradient(135deg, ${accentDark}, ${accent})` }}
        >
          {initial?.id ? "Save" : "Create"}
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6" style={{ scrollbarWidth: "none" }}>

        {/* ── Basic Info ── */}
        <div>
          <SectionHead icon={AlignLeft} label="Basic Info" color="#a855f7" />
          <div className="space-y-3">
            <InputField label="Match Title" value={form.title} onChange={v => set("title", v)} placeholder="e.g. Friday Night Blitz" />
            <InputField label="Tournament Name" value={form.tournamentName} onChange={v => set("tournamentName", v)} placeholder="e.g. Clash Ren Pro Series" />
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Match Type" value={form.matchType} options={MATCH_TYPES} onChange={v => set("matchType", v)} />
              <SelectField label="Game Mode" value={form.gameMode} options={GAME_MODES} onChange={v => set("gameMode", v)} />
            </div>
            <SelectField label="Map Selection" value={form.map} options={MAPS} onChange={v => set("map", v)} />
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Description</label>
              <textarea
                value={form.description}
                onChange={e => set("description", e.target.value)}
                rows={3}
                placeholder="Match description…"
                className="w-full px-3 py-2.5 rounded-xl text-[13px] text-white placeholder:text-zinc-600 focus:outline-none resize-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
              />
            </div>
          </div>
        </div>

        {/* ── Thumbnail ── */}
        <div>
          <SectionHead icon={Image} label="Thumbnail / Banner" color="#38bdf8" />
          <label className="block cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handleThumbnailUpload} />
            {form.thumbnail ? (
              <div className="relative rounded-xl overflow-hidden" style={{ height: 140 }}>
                <img src={form.thumbnail} alt="thumbnail" className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
                  <span className="text-[11px] text-white font-bold">Tap to change</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl py-8"
                style={{ border: "1.5px dashed rgba(56,189,248,0.3)", background: "rgba(56,189,248,0.04)" }}>
                <Image className="w-6 h-6 text-sky-400/60" />
                <span className="text-[11px] text-zinc-500">Tap to upload thumbnail</span>
              </div>
            )}
          </label>
        </div>

        {/* ── Match Settings ── */}
        <div>
          <SectionHead icon={Settings} label="Match Settings" color="#f59e0b" />
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <InputField label="Max Players" value={form.maxPlayers} onChange={v => set("maxPlayers", Number(v))} type="number" />
              <InputField label="Min Players" value={form.minPlayers} onChange={v => set("minPlayers", Number(v))} type="number" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <InputField label="Team Size" value={form.teamSize} onChange={v => set("teamSize", Number(v))} type="number" />
              <InputField label="Number of Rounds" value={form.numRounds} onChange={v => set("numRounds", Number(v))} type="number" />
            </div>
            <SelectField label="Elimination Format" value={form.elimFormat} options={ELIM_FORMATS} onChange={v => set("elimFormat", v)} />
            <div className="rounded-xl px-3 py-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <ToggleField label="Auto-Start" value={form.autoStart} onChange={v => set("autoStart", v)} desc="Automatically start when min players reached" />
            </div>
          </div>
        </div>

        {/* ── Slot Configuration ── */}
        <div>
          <SectionHead icon={Hash} label="Slot Configuration" color="#22c55e" />
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <InputField label="Total Slots" value={form.totalSlots} onChange={v => { const n = Number(v); set("totalSlots", n); set("publicSlots", n - form.reservedSlots); }} type="number" />
              <InputField label="Reserved" value={form.reservedSlots} onChange={v => { const n = Number(v); set("reservedSlots", n); set("publicSlots", form.totalSlots - n); }} type="number" />
              <InputField label="Public" value={form.publicSlots} onChange={() => {}} type="number" />
            </div>
            <div className="rounded-xl px-3 py-2.5 flex gap-3" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }}>
              <div className="flex-1 text-center">
                <p className="text-[18px] font-extrabold text-emerald-400">{form.totalSlots}</p>
                <p className="text-[9px] text-zinc-500 uppercase">Total</p>
              </div>
              <div className="w-px" style={{ background: "rgba(255,255,255,0.07)" }} />
              <div className="flex-1 text-center">
                <p className="text-[18px] font-extrabold text-amber-400">{form.reservedSlots}</p>
                <p className="text-[9px] text-zinc-500 uppercase">Reserved</p>
              </div>
              <div className="w-px" style={{ background: "rgba(255,255,255,0.07)" }} />
              <div className="flex-1 text-center">
                <p className="text-[18px] font-extrabold text-sky-400">{form.publicSlots}</p>
                <p className="text-[9px] text-zinc-500 uppercase">Public</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Match Rules ── */}
        <div>
          <SectionHead icon={Shield} label="Match Rules" color="#ef4444" />
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Predefined Templates</p>
              <div className="flex flex-col gap-1.5">
                {RULE_TEMPLATES.map(rule => {
                  const active = form.selectedRuleTemplates.includes(rule);
                  return (
                    <button key={rule} type="button" onClick={() => toggleRule(rule)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all"
                      style={{
                        background: active ? "rgba(239,68,68,0.10)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${active ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.07)"}`,
                      }}>
                      <div className={cn("w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
                        active ? "border-red-400 bg-red-400" : "border-zinc-600")}
                      >
                        {active && <CheckCircle className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <span className="text-[12px] text-zinc-300">{rule}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Custom Rules</label>
              <textarea
                value={form.customRules}
                onChange={e => set("customRules", e.target.value)}
                rows={3}
                placeholder="Add custom match rules…"
                className="w-full px-3 py-2.5 rounded-xl text-[13px] text-white placeholder:text-zinc-600 focus:outline-none resize-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
              />
            </div>
          </div>
        </div>

        {/* ── Room Settings ── */}
        <div>
          <SectionHead icon={Lock} label="Room Settings" color="#a855f7" />
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Room ID</label>
                <input
                  type="text"
                  value={form.roomId}
                  onChange={e => set("roomId", e.target.value)}
                  placeholder="e.g. 123456"
                  className="px-3 py-2.5 rounded-xl text-[13px] text-white placeholder:text-zinc-600 focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={form.roomPassword}
                    onChange={e => set("roomPassword", e.target.value)}
                    placeholder="••••••"
                    className="w-full px-3 py-2.5 pr-9 rounded-xl text-[13px] text-white placeholder:text-zinc-600 focus:outline-none"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
                  />
                  <button type="button" onClick={() => setShowPw(p => !p)} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    {showPw ? <EyeOff className="w-3.5 h-3.5 text-zinc-500" /> : <Eye className="w-3.5 h-3.5 text-zinc-500" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={handleAutoGenRoom}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[12px] font-bold text-white transition-all active:scale-95"
                style={{ background: "rgba(168,85,247,0.18)", border: "1px solid rgba(168,85,247,0.35)" }}>
                <RefreshCw className="w-3.5 h-3.5 text-violet-400" />
                Auto Generate
              </button>
              <button type="button" onClick={handleOpenInFF}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[12px] font-bold text-white transition-all active:scale-95"
                style={{ background: "rgba(234,88,12,0.18)", border: "1px solid rgba(234,88,12,0.35)" }}>
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                Open in FF
              </button>
            </div>

            <div className="rounded-xl px-3 py-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <ToggleField
                label="Delayed Room Reveal"
                value={form.delayedReveal}
                onChange={v => set("delayedReveal", v)}
                desc="Reveal room details only before match starts"
              />
            </div>

            {form.delayedReveal && (
              <div className="space-y-3">
                <InputField
                  label="Reveal X Minutes Before Match"
                  value={form.revealMinsBefore}
                  onChange={v => set("revealMinsBefore", Number(v))}
                  type="number"
                  suffix="min"
                />
                <InputField
                  label="Match Start Time (Room Reveal Anchor)"
                  value={form.roomRevealTime}
                  onChange={v => set("roomRevealTime", v)}
                  type="datetime-local"
                />
                <div className="rounded-xl px-3 py-2.5 flex items-center gap-2.5" style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.15)" }}>
                  <Clock className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                  <span className="text-[11px] text-zinc-400">
                    Room will reveal <span className="text-violet-300 font-bold">{form.revealMinsBefore} min</span> before match start — prevents early leaks.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Prize Settings ── */}
        <div>
          <SectionHead icon={Gem} label="Prize Settings" color="#eab308" />
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <InputField label="Entry Fee (Diamonds)" value={form.entryFee} onChange={v => set("entryFee", Number(v))} type="number" suffix="💎" />
              <InputField label="Prize Pool (Diamonds)" value={form.prizePool} onChange={v => set("prizePool", Number(v))} type="number" suffix="💎" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <InputField label="Winner Diamonds" value={form.winnerDiamonds} onChange={v => set("winnerDiamonds", Number(v))} type="number" suffix="💎" />
              <InputField label="Winner Wallet (₹)" value={form.winnerWallet} onChange={v => set("winnerWallet", Number(v))} type="number" suffix="₹" />
            </div>

            {/* Placement rewards */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Top Placement Rewards</p>
                <button type="button" onClick={addPlacement}
                  className="flex items-center gap-1 text-[10px] font-bold text-violet-400 hover:text-violet-300 transition-colors">
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
              <div className="space-y-2">
                {form.placements.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-xl px-3 py-2"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-black"
                      style={{ background: i === 0 ? "rgba(234,179,8,0.2)" : i === 1 ? "rgba(148,163,184,0.2)" : "rgba(205,127,50,0.2)",
                        color: i === 0 ? "#eab308" : i === 1 ? "#94a3b8" : "#cd7f32" }}>
                      {p.place}
                    </div>
                    <input type="number" value={p.diamonds} onChange={e => updatePlacement(i, "diamonds", Number(e.target.value))}
                      placeholder="💎" className="flex-1 min-w-0 bg-transparent text-[12px] text-white focus:outline-none text-center"
                      style={{ border: "none" }} />
                    <span className="text-zinc-600 text-[10px]">💎</span>
                    <div className="w-px h-4 bg-zinc-700/50" />
                    <input type="number" value={p.wallet} onChange={e => updatePlacement(i, "wallet", Number(e.target.value))}
                      placeholder="₹" className="flex-1 min-w-0 bg-transparent text-[12px] text-white focus:outline-none text-center"
                      style={{ border: "none" }} />
                    <span className="text-zinc-600 text-[10px]">₹</span>
                    {i > 0 && (
                      <button type="button" onClick={() => removePlacement(i)}>
                        <X className="w-3 h-3 text-zinc-600 hover:text-red-400 transition-colors" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="h-8" />
      </div>
    </div>
  );
}

/* ── Match Card ── */
function MatchCard({ match, onEdit, onDelete, accent = "#a855f7" }: {
  match: KnockoutMatch; onEdit: () => void; onDelete: () => void; accent?: string;
}) {
  const statusColor = match.status === "live" ? "#22c55e"
    : match.status === "upcoming" ? "#a855f7"
    : match.status === "completed" ? "#94a3b8"
    : "#f59e0b";

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      {match.thumbnail && (
        <img src={match.thumbnail} alt={match.title} className="w-full h-28 object-cover" />
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-white truncate">{match.title}</p>
            <p className="text-[10px] text-zinc-500 truncate">{match.matchType} · {match.gameMode} · {match.map}</p>
          </div>
          <span className="text-[9px] font-black px-2 py-0.5 rounded-full shrink-0"
            style={{ background: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}40` }}>
            {match.status.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-zinc-500 mb-3">
          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{match.totalSlots} slots</span>
          <span className="flex items-center gap-1"><Gem className="w-3 h-3 text-sky-400" />{match.entryFee} fee</span>
          <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-400" />{match.prizePool} pool</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold text-white transition-all active:scale-95"
            style={{ background: `${accent}20`, border: `1px solid ${accent}50` }}>
            <Pencil className="w-3 h-3" style={{ color: accent }} /> Edit
          </button>
          <button onClick={onDelete}
            className="flex items-center justify-center px-3 py-2 rounded-xl transition-all active:scale-95"
            style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Tournament API types ── */
interface ApiTournament {
  id: number;
  title: string;
  gameMode: string;
  entryFeeDiamonds: number;
  prizePoolDiamonds: number;
  maxSlots: number;
  filledSlots: number;
  startTime: string;
  status: string;
  roomId: string | null;
  roomPassword: string | null;
  perKillDiamonds: number;
  matchSlug: string | null;
  imageUrl: string | null;
  rules: string | null;
  description: string | null;
  map: string | null;
  region: string | null;
  estimatedDuration: string | null;
  matchSettings: string | null;
  roomDirectLink: string | null;
  credentialsReleased: boolean;
  credentialsReleasedAt: string | null;
  credentialShareMode: string;
  credentialUnlockMinutes: number | null;
  createdAt: string;
}

const REGIONS = ["India", "Asia", "Europe", "North America", "South America", "Global"];

function resolveImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("/objects/")) return `/api/storage/objects/${url.slice("/objects/".length)}`;
  if (!url.startsWith("http") && !url.startsWith("/api/")) return `/api/storage/objects/${url}`;
  return url;
}
const DURATIONS = ["10 min", "15 min", "20 min", "25 min", "30 min", "45 min", "1 hour"];

async function authFetchAdmin(path: string, opts?: RequestInit): Promise<Response> {
  const session = getSession();
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { "x-super-admin-token": session.token } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  return res;
}

/* ── Tournament Form Modal ── */
interface MatchSettingsForm {
  teamFormat: string;
  minLevel: number;
  rounds: string;
  hp: number;
  ep: number;
  movementSpeed: string;
  jumpHeight: string;
  ammoLimit: boolean;
  gunAttributes: boolean;
  weaponSkins: boolean;
  onlyHeadshot: boolean;
  emulators: boolean;
  showCountdown: boolean;
}

const DEFAULT_MATCH_SETTINGS: MatchSettingsForm = {
  teamFormat: "Solo",
  minLevel: 40,
  rounds: "9 (First to 5 wins)",
  hp: 200,
  ep: 0,
  movementSpeed: "100%",
  jumpHeight: "100%",
  ammoLimit: false,
  gunAttributes: false,
  weaponSkins: false,
  onlyHeadshot: false,
  emulators: false,
  showCountdown: false,
};

interface TournamentForm {
  title: string;
  gameMode: string;
  startTime: string;
  status: string;
  entryFeeDiamonds: number;
  prizePoolDiamonds: number;
  maxSlots: number;
  roomId: string;
  roomPassword: string;
  perKillDiamonds: number;
  imageUrl: string;
  rules: string;
  shortTitle: string;
  statusLabel: string;
  statusColor: string;
  description: string;
  map: string;
  region: string;
  estimatedDuration: string;
  matchSlug: string;
  matchSettings: MatchSettingsForm;
  roomDirectLink: string;
  credentialUnlockMinutes: number | null;
}

const EMPTY_T_FORM: TournamentForm = {
  title: "", gameMode: "BR Solo", startTime: "", status: "upcoming",
  entryFeeDiamonds: 0, prizePoolDiamonds: 0, maxSlots: 100,
  roomId: "", roomPassword: "", perKillDiamonds: 0, imageUrl: "", rules: "",
  shortTitle: "", statusLabel: "", statusColor: "green", description: "", map: "Bermuda", region: "India", estimatedDuration: "20 min",
  matchSlug: "", matchSettings: { ...DEFAULT_MATCH_SETTINGS }, roomDirectLink: "",
  credentialUnlockMinutes: null,
};

const TEAM_FORMATS = ["Solo", "Duo", "Squad"];

function genRandomSlug(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

const STATUS_OPTIONS = ["upcoming", "ongoing", "completed", "cancelled"];

function TournamentFormModal({
  initial, onSaved, onClose, kind = "tournament",
}: {
  initial: ApiTournament | null;
  onSaved: (t: ApiTournament) => void;
  onClose: () => void;
  kind?: "tournament" | "knockout";
}) {
  const isKnockout = kind === "knockout";
  const accent     = isKnockout ? "#a855f7" : "#f59e0b";
  const accentDark = isKnockout ? "#7c3aed" : "#b45309";
  const kindLabel  = isKnockout ? "Knockout Match" : "Tournament";
  const [form, setForm] = useState<TournamentForm>(() => {
    if (!initial) return { ...EMPTY_T_FORM, gameMode: isKnockout ? "Knockout" : EMPTY_T_FORM.gameMode };
    const localDt = initial.startTime
      ? new Date(initial.startTime).toISOString().slice(0, 16)
      : "";
    return {
      title: initial.title,
      gameMode: initial.gameMode,
      startTime: localDt,
      status: initial.status,
      entryFeeDiamonds: initial.entryFeeDiamonds,
      prizePoolDiamonds: initial.prizePoolDiamonds,
      maxSlots: initial.maxSlots,
      roomId: initial.roomId ?? "",
      roomPassword: initial.roomPassword ?? "",
      perKillDiamonds: initial.perKillDiamonds,
      imageUrl: initial.imageUrl ?? "",
      rules: initial.rules ?? "",
      shortTitle: (initial as any).shortTitle ?? "",
      statusLabel: (initial as any).statusLabel ?? "",
      statusColor: (initial as any).statusColor ?? "green",
      description: initial.description ?? "",
      map: initial.map ?? "Bermuda",
      region: initial.region ?? "India",
      estimatedDuration: initial.estimatedDuration ?? "20 min",
      matchSlug: initial.matchSlug ?? "",
      matchSettings: (() => {
        try { return initial.matchSettings ? { ...DEFAULT_MATCH_SETTINGS, ...JSON.parse(initial.matchSettings) } : { ...DEFAULT_MATCH_SETTINGS }; }
        catch { return { ...DEFAULT_MATCH_SETTINGS }; }
      })(),
      roomDirectLink: initial.roomDirectLink ?? "",
      credentialUnlockMinutes: initial.credentialUnlockMinutes ?? null,
    };
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleImageUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please choose an image file", variant: "destructive" }); return;
    }
    setUploading(true);
    try {
      const session = getSession();
      const res = await fetch("/api/admin/tournaments/upload-image", {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          ...(session ? { "x-super-admin-token": session.token } : {}),
        },
        body: file,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      const { url } = await res.json() as { url: string };
      set("imageUrl", url);
      toast({ title: "Image uploaded" });
    } catch (e) {
      toast({ title: "Upload failed", description: String(e), variant: "destructive" });
    } finally { setUploading(false); }
  }

  const [showPw, setShowPw] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [unreleasing, setUnreleasing] = useState(false);
  const [shareMode, setShareMode] = useState<"room_only" | "ff_only" | "both">(
    (initial?.credentialShareMode as "room_only" | "ff_only" | "both") ?? "both"
  );
  const { toast } = useToast();

  async function handleRelease() {
    if (!initial?.id) { toast({ title: "Save the tournament first", variant: "destructive" }); return; }
    if (!form.roomId) { toast({ title: "Room ID is required before releasing", variant: "destructive" }); return; }
    setReleasing(true);
    try {
      const res = await authFetchAdmin(`/admin/tournaments/${initial.id}/release-credentials`, {
        method: "POST",
        body: JSON.stringify({ shareMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Released!", description: `Credentials revealed and ${data.count} player(s) notified.` });
      onSaved(data);
    } catch (e) {
      toast({ title: "Failed to release", description: String(e), variant: "destructive" });
    } finally { setReleasing(false); }
  }

  async function handleUnrelease() {
    if (!initial?.id) return;
    setUnreleasing(true);
    try {
      const res = await authFetchAdmin(`/admin/tournaments/${initial.id}/unrelease-credentials`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Unreleased", description: "Credentials are now hidden from players." });
      onSaved(data);
    } catch (e) {
      toast({ title: "Failed to unrelease", description: String(e), variant: "destructive" });
    } finally { setUnreleasing(false); }
  }

  function set<K extends keyof TournamentForm>(k: K, v: TournamentForm[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }
  function setMs<K extends keyof MatchSettingsForm>(k: K, v: MatchSettingsForm[K]) {
    setForm(prev => ({ ...prev, matchSettings: { ...prev.matchSettings, [k]: v } }));
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.startTime) {
      toast({ title: "Title and start time are required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const body = {
        title: form.title,
        gameMode: isKnockout ? "Knockout" : form.gameMode,
        startTime: new Date(form.startTime).toISOString(),
        status: form.status,
        entryFeeDiamonds: form.entryFeeDiamonds,
        prizePoolDiamonds: form.prizePoolDiamonds,
        maxSlots: form.maxSlots,
        roomId: form.roomId || undefined,
        roomPassword: form.roomPassword || undefined,
        perKillDiamonds: form.perKillDiamonds,
        imageUrl: form.imageUrl || undefined,
        rules: form.rules || undefined,
        shortTitle: form.shortTitle || undefined,
        statusLabel: form.statusLabel || undefined,
        statusColor: form.statusColor || undefined,
        description: form.description || undefined,
        map: form.map || undefined,
        region: form.region || undefined,
        estimatedDuration: form.estimatedDuration || undefined,
        matchSlug: form.matchSlug || undefined,
        matchSettings: JSON.stringify(form.matchSettings),
        roomDirectLink: form.roomDirectLink || undefined,
        credentialUnlockMinutes: form.credentialUnlockMinutes,
      };
      const res = initial
        ? await authFetchAdmin(`/admin/tournaments/${initial.id}`, { method: "PUT", body: JSON.stringify(body) })
        : await authFetchAdmin("/admin/tournaments", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      const saved: ApiTournament = await res.json();
      toast({ title: initial ? "Tournament updated" : "Tournament created" });
      onSaved(saved);
    } catch (e) {
      toast({ title: "Failed to save", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const [pwLocked, setPwLocked] = useState(false);
  const [customRuleInput, setCustomRuleInput] = useState("");

  function genPassword() {
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const digits = "0123456789";
    const all = upper + lower + digits;
    const arr = new Uint8Array(15);
    crypto.getRandomValues(arr);
    // ensure at least one of each type
    let pw = upper[arr[0] % upper.length] + lower[arr[1] % lower.length] + digits[arr[2] % digits.length];
    for (let i = 3; i < 15; i++) pw += all[arr[i] % all.length];
    // shuffle
    const shuffled = pw.split("").sort(() => Math.random() - 0.5).join("");
    return shuffled;
  }

  function handleGenPassword() {
    const pw = genPassword();
    setForm(prev => ({ ...prev, roomPassword: pw }));
    setPwLocked(true);
    toast({ title: "Password generated", description: pw });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.88)" }}>
      <div className="shrink-0 flex items-center gap-3 px-4 py-3.5 border-b" style={{ borderColor: "rgba(255,255,255,0.07)", background: "#0f0f10" }}>
        <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
          <X className="w-4 h-4 text-zinc-400" />
        </button>
        <div className="flex-1">
          <p className="text-[13px] font-bold text-white">{initial ? `Edit ${kindLabel}` : `New ${kindLabel}`}</p>
          <p className="text-[10px] text-zinc-500">Saved directly to the database</p>
        </div>
        <button onClick={handleSubmit} disabled={saving}
          className="px-4 py-2 rounded-xl text-[12px] font-bold text-white transition-all active:scale-95 disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${accentDark}, ${accent})` }}>
          {saving ? "Saving…" : initial ? "Save" : "Create"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5" style={{ scrollbarWidth: "none" }}>
        {/* Basic Info */}
        <div>
          <SectionHead icon={AlignLeft} label="Basic Info" color={accent} />
          <div className="space-y-3">
            <InputField label="Title" value={form.title} onChange={v => set("title", v)} placeholder="e.g. Friday Night Blitz" />
            <div className="grid grid-cols-2 gap-3">
              {isKnockout ? (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Game Mode</label>
                  <div className="px-3 py-2.5 rounded-xl text-[13px] font-bold flex items-center gap-2"
                    style={{ background: "rgba(168,85,247,0.10)", border: "1px solid rgba(168,85,247,0.30)", color: "#c084fc" }}>
                    <Swords className="w-3.5 h-3.5" /> Knockout
                  </div>
                </div>
              ) : (
                <SelectField label="Game Mode" value={form.gameMode} options={MATCH_TYPES} onChange={v => set("gameMode", v)} accent={accent} />
              )}
              <SelectField label="Status" value={form.status} options={STATUS_OPTIONS} onChange={v => set("status", v)} accent="#22c55e" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Map" value={form.map} options={MAPS} onChange={v => set("map", v)} accent="#22c55e" />
              <SelectField label="Region" value={form.region} options={REGIONS} onChange={v => set("region", v)} accent="#38bdf8" />
            </div>
            <SelectField label="Estimated Duration" value={form.estimatedDuration} options={DURATIONS} onChange={v => set("estimatedDuration", v)} accent="#f59e0b" />
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Start Time</label>
              <input type="datetime-local" value={form.startTime} onChange={e => set("startTime", e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-[13px] text-white focus:outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", colorScheme: "dark" }} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Card Subtitle</label>
              <input type="text" value={form.shortTitle} onChange={e => set("shortTitle", e.target.value)}
                placeholder="e.g. Solo Showdown · Season 3"
                className="w-full px-3 py-2.5 rounded-xl text-[13px] text-white placeholder:text-zinc-600 focus:outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }} />
              <p className="text-[10px] text-zinc-600 mt-0.5">Shown below the title on match cards. Defaults to game mode if left blank.</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Status Badge Text</label>
              <input type="text" value={form.statusLabel} onChange={e => set("statusLabel", e.target.value)}
                placeholder='e.g. Open, Registering, Live… (defaults to "Available")'
                className="w-full px-3 py-2.5 rounded-xl text-[13px] text-white placeholder:text-zinc-600 focus:outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }} />
              <p className="text-[10px] text-zinc-600 mt-0.5">Text shown on the badge in the top-left of the match card.</p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Badge Colour</label>
              <div className="flex flex-wrap gap-2">
                {([
                  { id: "green",  hex: "#10b981", label: "Green"  },
                  { id: "blue",   hex: "#3b82f6", label: "Blue"   },
                  { id: "red",    hex: "#ef4444", label: "Red"    },
                  { id: "yellow", hex: "#f59e0b", label: "Yellow" },
                  { id: "purple", hex: "#a855f7", label: "Purple" },
                  { id: "orange", hex: "#f97316", label: "Orange" },
                  { id: "cyan",   hex: "#06b6d4", label: "Cyan"   },
                ] as const).map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => set("statusColor", c.id)}
                    title={c.label}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                    style={{
                      background: form.statusColor === c.id ? `${c.hex}22` : "rgba(255,255,255,0.04)",
                      border: `1.5px solid ${form.statusColor === c.id ? c.hex : "rgba(255,255,255,0.10)"}`,
                      color: form.statusColor === c.id ? c.hex : "#71717a",
                    }}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.hex }} />
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Description</label>
              <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={3}
                placeholder="Short description shown on the match card and details page…"
                className="w-full px-3 py-2.5 rounded-xl text-[13px] text-white placeholder:text-zinc-600 focus:outline-none resize-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }} />
            </div>
          </div>
        </div>

        {/* Image */}
        <div>
          <SectionHead icon={Image} label="Banner Image" color="#38bdf8" />
          <div className="space-y-2">
            {form.imageUrl ? (
              <div className="relative rounded-xl overflow-hidden" style={{ height: 130 }}>
                <img src={resolveImageUrl(form.imageUrl)} alt="preview"
                  className="w-full h-full object-cover"
                  onError={e => (e.currentTarget.style.display = "none")} />
                <button type="button" onClick={() => set("imageUrl", "")}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(0,0,0,0.65)" }}>
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-1.5 rounded-xl h-28 cursor-pointer transition-colors"
                style={{ background: "rgba(255,255,255,0.03)", border: `1.5px dashed ${accent}55` }}>
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: accent, borderTopColor: "transparent" }} />
                ) : (
                  <>
                    <Upload className="w-5 h-5" style={{ color: accent }} />
                    <span className="text-[12px] font-bold text-zinc-300">Tap to upload from device</span>
                    <span className="text-[10px] text-zinc-600">JPG, PNG, WebP</span>
                  </>
                )}
                <input type="file" accept="image/*" className="sr-only" disabled={uploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.currentTarget.value = ""; }} />
              </label>
            )}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
              <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">or paste URL</span>
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
            </div>
            <InputField label="" value={form.imageUrl} onChange={v => set("imageUrl", v)} placeholder="https://…" />
          </div>
        </div>

        {/* Prize Settings */}
        <div>
          <SectionHead icon={Gem} label="Prize Settings" color="#eab308" />
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <InputField label="Entry Fee (💎)" value={form.entryFeeDiamonds} onChange={v => set("entryFeeDiamonds", Number(v))} type="number" />
              <InputField label="Prize Pool (💎)" value={form.prizePoolDiamonds} onChange={v => set("prizePoolDiamonds", Number(v))} type="number" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <InputField label="Per Kill (💎)" value={form.perKillDiamonds} onChange={v => set("perKillDiamonds", Number(v))} type="number" />
              <InputField label="Max Slots" value={form.maxSlots} onChange={v => set("maxSlots", Number(v))} type="number" />
            </div>
          </div>
        </div>

        {/* Match Settings */}
        <div>
          <SectionHead icon={Settings} label="Match Settings" color="#06b6d4" />
          <div className="space-y-3">
            {/* Team Format + Min Level */}
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Team Format" value={form.matchSettings.teamFormat} options={TEAM_FORMATS} onChange={v => setMs("teamFormat", v)} accent="#06b6d4" />
              <InputField label="Minimum Level" value={form.matchSettings.minLevel} onChange={v => setMs("minLevel", Number(v))} type="number" />
            </div>
            {/* Rounds */}
            <InputField label="Rounds" value={form.matchSettings.rounds} onChange={v => setMs("rounds", v)} placeholder="e.g. 9 (First to 5 wins)" />
            {/* HP + EP */}
            <div className="grid grid-cols-2 gap-3">
              <InputField label="HP" value={form.matchSettings.hp} onChange={v => setMs("hp", Number(v))} type="number" />
              <InputField label="EP" value={form.matchSettings.ep} onChange={v => setMs("ep", Number(v))} type="number" />
            </div>
            {/* Movement Speed + Jump Height */}
            <div className="grid grid-cols-2 gap-3">
              <InputField label="Movement Speed" value={form.matchSettings.movementSpeed} onChange={v => setMs("movementSpeed", v)} placeholder="100%" />
              <InputField label="Jump Height" value={form.matchSettings.jumpHeight} onChange={v => setMs("jumpHeight", v)} placeholder="100%" />
            </div>
            {/* Toggles */}
            {(
              [
                { key: "ammoLimit",     label: "Ammo Limit",     onLabel: "Yes",     offLabel: "No"          },
                { key: "gunAttributes", label: "Gun Attributes",  onLabel: "Allowed", offLabel: "Not Allowed" },
                { key: "weaponSkins",   label: "Weapon Skins",   onLabel: "Allowed", offLabel: "Not Allowed" },
                { key: "onlyHeadshot",  label: "Only Headshot",  onLabel: "Yes",     offLabel: "No"          },
                { key: "emulators",     label: "Emulators",      onLabel: "Allowed", offLabel: "Not Allowed" },
                { key: "showCountdown", label: "Show Countdown",  onLabel: "Visible", offLabel: "Hidden"      },
              ] as { key: keyof MatchSettingsForm; label: string; onLabel: string; offLabel: string }[]
            ).map(({ key, label, onLabel, offLabel }) => {
              const val = form.matchSettings[key] as boolean;
              return (
                <div key={key} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <span className="text-[12px] font-bold text-zinc-300">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold" style={{ color: val ? "#4ade80" : "#71717a" }}>{val ? onLabel : offLabel}</span>
                    <button type="button" onClick={() => setMs(key, !val as MatchSettingsForm[typeof key])}
                      className="relative w-9 h-5 rounded-full transition-all"
                      style={{ background: val ? "rgba(74,222,128,0.35)" : "rgba(255,255,255,0.08)", border: val ? "1px solid rgba(74,222,128,0.5)" : "1px solid rgba(255,255,255,0.12)" }}>
                      <div className="absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200"
                        style={{ left: val ? "calc(100% - 18px)" : "2px", background: val ? "#4ade80" : "#52525b" }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Room Settings */}
        <div>
          <SectionHead icon={Lock} label="Room Settings" color="#a855f7" />
          <div className="space-y-3">
            {/* Room ID — plain field */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Room ID</label>
              <input type="text" value={form.roomId} onChange={e => set("roomId", e.target.value)} placeholder="Enter room ID"
                className="px-3 py-2.5 rounded-xl text-[13px] text-white placeholder:text-zinc-600 focus:outline-none w-full"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }} />
            </div>
            {/* Room Password — generate + lock/edit flow */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Room Password</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPw ? "text" : "password"}
                    value={form.roomPassword}
                    onChange={e => { if (!pwLocked) set("roomPassword", e.target.value); }}
                    readOnly={pwLocked}
                    placeholder="Generate or type a password"
                    className="w-full px-3 py-2.5 pr-9 rounded-xl text-[13px] text-white placeholder:text-zinc-600 focus:outline-none transition-all"
                    style={{
                      background: pwLocked ? "rgba(168,85,247,0.08)" : "rgba(255,255,255,0.05)",
                      border: pwLocked ? "1px solid rgba(168,85,247,0.35)" : "1px solid rgba(255,255,255,0.10)",
                      cursor: pwLocked ? "default" : "text",
                    }} />
                  <button type="button" onClick={() => setShowPw(p => !p)} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    {showPw ? <EyeOff className="w-3.5 h-3.5 text-zinc-500" /> : <Eye className="w-3.5 h-3.5 text-zinc-500" />}
                  </button>
                </div>
                {pwLocked ? (
                  <button type="button" onClick={() => setPwLocked(false)}
                    className="shrink-0 px-3 py-2.5 rounded-xl text-[11px] font-bold text-violet-300 transition-all active:scale-95"
                    style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.35)" }}>
                    Edit
                  </button>
                ) : (
                  <button type="button" onClick={handleGenPassword}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[11px] font-bold text-white transition-all active:scale-95"
                    style={{ background: "rgba(168,85,247,0.18)", border: "1px solid rgba(168,85,247,0.35)" }}>
                    <RefreshCw className="w-3 h-3 text-violet-400" /> Generate
                  </button>
                )}
              </div>
            </div>

            {/* Auto-unlock time */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Auto-reveal before match starts</label>
              <div className="flex flex-wrap gap-1.5">
                {([null, 1, 2, 5, 10, 15, 30] as (number | null)[]).map(v => (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => set("credentialUnlockMinutes", v)}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95"
                    style={{
                      background: form.credentialUnlockMinutes === v
                        ? "rgba(168,85,247,0.25)"
                        : "rgba(255,255,255,0.05)",
                      border: form.credentialUnlockMinutes === v
                        ? "1px solid rgba(168,85,247,0.55)"
                        : "1px solid rgba(255,255,255,0.09)",
                      color: form.credentialUnlockMinutes === v ? "#c4b5fd" : "#71717a",
                    }}
                  >
                    {v === null ? "Manual only" : `${v} min`}
                  </button>
                ))}
              </div>
              {form.credentialUnlockMinutes !== null && (
                <p className="text-[10px] text-violet-400 px-0.5">
                  Players see credentials {form.credentialUnlockMinutes} min before match starts
                </p>
              )}
            </div>

            {/* Direct Open URL */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Direct Open URL</label>
              <textarea
                value={form.roomDirectLink}
                onChange={e => set("roomDirectLink", e.target.value)}
                rows={2}
                placeholder="Paste the direct room link here…"
                className="w-full px-3 py-2.5 rounded-xl text-[12px] font-mono text-white placeholder:text-zinc-600 focus:outline-none resize-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
              />
            </div>

            {/* Action buttons */}
            <div className="space-y-2 pt-1">

              {/* Share mode radio */}
              <div className="rounded-xl px-4 py-3 space-y-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">What to share with players</p>
                {([
                  { val: "room_only", label: "Room ID & Password" },
                  { val: "ff_only",   label: "Open in FF button only" },
                  { val: "both",      label: "Both" },
                ] as const).map(({ val, label }) => (
                  <label key={val} className="flex items-center gap-2.5 cursor-pointer">
                    <div
                      onClick={() => setShareMode(val)}
                      className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                      style={{
                        borderColor: shareMode === val ? "#34d399" : "rgba(255,255,255,0.2)",
                        background: shareMode === val ? "rgba(34,197,94,0.15)" : "transparent",
                      }}>
                      {shareMode === val && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                    </div>
                    <span className="text-[12px] text-zinc-300 font-medium" onClick={() => setShareMode(val)}>{label}</span>
                  </label>
                ))}
              </div>

              {/* Open in FF (admin test) */}
              <button type="button" onClick={() => { if (form.roomDirectLink) window.open(form.roomDirectLink, "_blank"); }}
                disabled={!form.roomDirectLink}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-bold text-white transition-all active:scale-95 disabled:opacity-40"
                style={{ background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.35)" }}>
                <Gamepad2 className="w-3.5 h-3.5 text-orange-400" /> Open in FF
              </button>

              {/* Release status badge */}
              {initial?.credentialsReleased && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-[11px] text-emerald-400 font-bold">Credentials Released</span>
                  {initial.credentialsReleasedAt && (
                    <span className="text-[9px] text-zinc-500 ml-auto">{new Date(initial.credentialsReleasedAt).toLocaleTimeString()}</span>
                  )}
                </div>
              )}

              {/* Reveal Now */}
              <button type="button" onClick={handleRelease} disabled={releasing || !form.roomId}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-bold text-white transition-all active:scale-95 disabled:opacity-50"
                style={{ background: initial?.credentialsReleased ? "rgba(34,197,94,0.22)" : "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)" }}>
                {releasing
                  ? <><div className="w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" /> Revealing…</>
                  : initial?.credentialsReleased
                    ? <><Zap className="w-3.5 h-3.5 text-emerald-400" /> Revealed — Re-send to Players</>
                    : <><Zap className="w-3.5 h-3.5 text-emerald-400" /> Reveal Now</>
                }
              </button>

              {/* Undo release */}
              {initial?.credentialsReleased && (
                <button type="button" onClick={handleUnrelease} disabled={unreleasing}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold transition-all active:scale-95 disabled:opacity-50"
                  style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}>
                  {unreleasing
                    ? <><div className="w-3 h-3 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" /> Undoing…</>
                    : <><X className="w-3.5 h-3.5" /> Undo Release</>
                  }
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Match Route / Slug */}
        <div>
          <SectionHead icon={Hash} label="Match Route (URL Slug)" color="#f59e0b" />
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Slug</label>
                <input
                  type="text"
                  value={form.matchSlug}
                  onChange={e => set("matchSlug", e.target.value.replace(/\s/g, ""))}
                  placeholder="e.g. a3f7c2… or custom-name"
                  className="w-full px-3 py-2.5 rounded-xl text-[12px] font-mono text-white placeholder:text-zinc-600 focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">&nbsp;</label>
                <button type="button" onClick={() => set("matchSlug", genRandomSlug())}
                  className="h-[42px] px-3 rounded-xl text-[11px] font-bold text-white whitespace-nowrap flex items-center gap-1.5 transition-all active:scale-95"
                  style={{ background: "rgba(245,158,11,0.18)", border: "1px solid rgba(245,158,11,0.35)" }}>
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400" /> Auto
                </button>
              </div>
            </div>
            {form.matchSlug ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.18)" }}>
                <span className="text-[10px] text-zinc-500">Route:</span>
                <span className="text-[11px] font-mono text-amber-400 flex-1 truncate">/matches/{form.matchSlug}</span>
                <button type="button"
                  onClick={() => { navigator.clipboard?.writeText(`/matches/${form.matchSlug}`); }}
                  className="shrink-0">
                  <Copy className="w-3 h-3 text-zinc-500 hover:text-zinc-300" />
                </button>
              </div>
            ) : (
              <p className="text-[10px] text-zinc-600 px-1">No slug set — match won't be accessible via URL until one is assigned.</p>
            )}
          </div>
        </div>

        {/* Rules */}
        <div>
          <SectionHead icon={Shield} label="Match Rules" color="#ef4444" />
          <div className="space-y-3">
            {/* Active rules list */}
            {(() => {
              const activeRules = form.rules.split("\n").filter(Boolean);
              return activeRules.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {activeRules.map((rule, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl"
                      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)" }}>
                      <span className="text-[10px] font-bold text-red-400 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                      <span className="flex-1 text-[12px] text-zinc-200 leading-snug">{rule}</span>
                      <button type="button" onClick={() => {
                        const updated = activeRules.filter((_, j) => j !== i);
                        set("rules", updated.join("\n"));
                      }} className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all hover:bg-red-500/20"
                        style={{ color: "#ef4444" }}>
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-zinc-600 italic px-1">No rules added yet. Pick from presets or add a custom rule below.</p>
              );
            })()}

            {/* Preset rule chips */}
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Preset Rules</p>
              <div className="flex flex-wrap gap-1.5">
                {RULE_TEMPLATES.map(rule => {
                  const active = form.rules.split("\n").filter(Boolean).includes(rule);
                  return (
                    <button key={rule} type="button"
                      onClick={() => {
                        const cur = form.rules.split("\n").filter(Boolean);
                        const updated = active ? cur.filter(r => r !== rule) : [...cur, rule];
                        set("rules", updated.join("\n"));
                      }}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-95"
                      style={{
                        background: active ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.05)",
                        border: active ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(255,255,255,0.09)",
                        color: active ? "#fca5a5" : "#71717a",
                      }}>
                      {active ? "✓ " : ""}{rule}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom rule input */}
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Custom Rule</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customRuleInput}
                  onChange={e => setCustomRuleInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const trimmed = customRuleInput.trim();
                      if (!trimmed) return;
                      const cur = form.rules.split("\n").filter(Boolean);
                      if (!cur.includes(trimmed)) set("rules", [...cur, trimmed].join("\n"));
                      setCustomRuleInput("");
                    }
                  }}
                  placeholder="Type a custom rule and press Add…"
                  className="flex-1 px-3 py-2.5 rounded-xl text-[13px] text-white placeholder:text-zinc-600 focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }} />
                <button type="button"
                  onClick={() => {
                    const trimmed = customRuleInput.trim();
                    if (!trimmed) return;
                    const cur = form.rules.split("\n").filter(Boolean);
                    if (!cur.includes(trimmed)) set("rules", [...cur, trimmed].join("\n"));
                    setCustomRuleInput("");
                  }}
                  className="shrink-0 px-4 py-2.5 rounded-xl text-[12px] font-bold text-white transition-all active:scale-95"
                  style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)" }}>
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="h-6" />
      </div>
    </div>
  );
}

/* ── Tournament Card (admin list) ── */
function TournamentListCard({ t, onEdit, onDelete, onGenSlug, onPlayers }: {
  t: ApiTournament; onEdit: () => void; onDelete: () => void; onGenSlug: () => void; onPlayers: () => void;
}) {
  const statusCfg = {
    ongoing:   { color: "#22c55e", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.35)",   label: "LIVE" },
    upcoming:  { color: "#a855f7", bg: "rgba(168,85,247,0.12)",  border: "rgba(168,85,247,0.35)",  label: "UPCOMING" },
    completed: { color: "#94a3b8", bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.25)", label: "ENDED" },
    cancelled: { color: "#ef4444", bg: "rgba(239,68,68,0.10)",   border: "rgba(239,68,68,0.3)",    label: "CANCELLED" },
  }[t.status] ?? { color: "#71717a", bg: "rgba(113,113,122,0.1)", border: "rgba(113,113,122,0.25)", label: t.status.toUpperCase() };

  const fillPct = t.maxSlots > 0 ? Math.min(100, (t.filledSlots / t.maxSlots) * 100) : 0;
  const fillColor = fillPct >= 100 ? "#22c55e" : fillPct >= 60 ? "#f59e0b" : "#a855f7";

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${statusCfg.border}` }}>

      {/* Banner image with gradient overlay */}
      {t.imageUrl ? (
        <div className="relative w-full h-28 overflow-hidden">
          <img src={resolveImageUrl(t.imageUrl)} alt={t.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(10,10,11,0.85) 100%)" }} />
          <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5 flex items-end justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-black text-white truncate drop-shadow">{t.title}</p>
              <p className="text-[10px] font-medium drop-shadow" style={{ color: "rgba(255,255,255,0.6)" }}>
                {t.gameMode} · {format(new Date(t.startTime), "MMM d, h:mm a")}
              </p>
            </div>
            <span className="text-[9px] font-black px-2.5 py-1 rounded-full shrink-0 backdrop-blur-sm"
              style={{ background: statusCfg.bg, color: statusCfg.color, border: `1px solid ${statusCfg.border}` }}>
              {statusCfg.label}
            </span>
          </div>
        </div>
      ) : (
        <div className="px-3.5 pt-3.5 pb-2 flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-black text-white truncate">{t.title}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">{t.gameMode} · {format(new Date(t.startTime), "MMM d, h:mm a")}</p>
          </div>
          <span className="text-[9px] font-black px-2.5 py-1 rounded-full shrink-0 mt-0.5"
            style={{ background: statusCfg.bg, color: statusCfg.color, border: `1px solid ${statusCfg.border}` }}>
            {statusCfg.label}
          </span>
        </div>
      )}

      <div className="px-3.5 pb-3.5" style={{ paddingTop: t.imageUrl ? "10px" : "0" }}>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {/* Slots */}
          <div className="rounded-xl px-2.5 py-2 flex flex-col gap-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-black uppercase tracking-wider text-zinc-600">Slots</span>
              <Users className="w-2.5 h-2.5 text-zinc-600" />
            </div>
            <p className="text-[13px] font-black" style={{ color: fillColor }}>{t.filledSlots}<span className="text-[10px] text-zinc-600 font-medium">/{t.maxSlots}</span></p>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${fillPct}%`, background: fillColor }} />
            </div>
          </div>
          {/* Prize */}
          <div className="rounded-xl px-2.5 py-2 flex flex-col gap-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-black uppercase tracking-wider text-zinc-600">Prize</span>
              <Star className="w-2.5 h-2.5 text-amber-500" />
            </div>
            <p className="text-[13px] font-black text-amber-400">{t.prizePoolDiamonds}<span className="text-[9px] text-zinc-600 font-medium ml-0.5">💎</span></p>
            {t.perKillDiamonds > 0 && <p className="text-[8px] text-blue-400 font-bold">+{t.perKillDiamonds}/kill</p>}
          </div>
          {/* Fee */}
          <div className="rounded-xl px-2.5 py-2 flex flex-col gap-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-black uppercase tracking-wider text-zinc-600">Entry</span>
              <Gem className="w-2.5 h-2.5 text-blue-400" />
            </div>
            <p className="text-[13px] font-black text-blue-400">{t.entryFeeDiamonds}<span className="text-[9px] text-zinc-600 font-medium ml-0.5">💎</span></p>
            <p className="text-[8px] text-zinc-600">fee</p>
          </div>
        </div>

        {/* Slug row */}
        <div className="flex items-center gap-2 mb-3 rounded-xl px-2.5 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <Hash className="w-3 h-3 text-zinc-600 shrink-0" />
          {t.matchSlug ? (
            <>
              <span className="text-[10px] font-mono text-indigo-400 truncate flex-1">{t.matchSlug}</span>
              <button onClick={() => { navigator.clipboard?.writeText(`/matches/${t.matchSlug}`); }} className="shrink-0 active:scale-90 transition-transform">
                <Copy className="w-3 h-3 text-zinc-600 active:text-white transition-colors" />
              </button>
            </>
          ) : (
            <button onClick={onGenSlug} className="flex-1 flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-600 italic">No slug yet</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8" }}>Generate</span>
            </button>
          )}
        </div>

        {/* Credentials badge */}
        {t.credentialsReleased && (
          <div className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-xl"
            style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-[10px] font-bold text-emerald-400">Room credentials released to players</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mb-2">
          <button onClick={onPlayers}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-black transition-all active:scale-95"
            style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#4ade80" }}>
            <Users className="w-3.5 h-3.5" />
            Players
            <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-black flex items-center justify-center"
              style={{ background: "rgba(34,197,94,0.2)", color: "#4ade80" }}>
              {t.filledSlots}
            </span>
          </button>
          <button onClick={onEdit}
            className="flex items-center justify-center gap-1 px-3.5 py-2.5 rounded-xl text-[11px] font-bold transition-all active:scale-95"
            style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.35)", color: "#fbbf24" }}>
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete}
            className="flex items-center justify-center px-3.5 py-2.5 rounded-xl transition-all active:scale-95"
            style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Match Delete Dialog ───────────────────────────────────────────────────────
const DELETE_OPTIONS: { mode: string; emoji: string; title: string; desc: string; badge: string; badgeColor: string; impact: "soft" | "medium" | "hard" | "critical" }[] = [
  { mode: "cancel_notify",    emoji: "🔔", title: "Cancel & Notify",            desc: "Marks match as cancelled, refunds all registered players and sends push notifications. Match stays visible in their history.",        badge: "Soft · Reversible",           badgeColor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", impact: "soft"     },
  { mode: "cancel_silent",    emoji: "🔕", title: "Cancel Silently",            desc: "Same as above but no push notifications are sent. Players are refunded quietly without any alerts.",                                    badge: "Soft · No Notifs",            badgeColor: "text-sky-400 bg-sky-500/10 border-sky-500/20",             impact: "soft"     },
  { mode: "hide",             emoji: "👁️", title: "Hide from Listings",         desc: "Hides the match from the lobby so new players can't see or join it. Registered players are completely unaffected.",                   badge: "Safe · No Data Lost",         badgeColor: "text-zinc-400 bg-white/5 border-white/10",                  impact: "soft"     },
  { mode: "registered_only",  emoji: "👥", title: "Remove Registered Only",     desc: "Refunds and removes all registered participants from this match, then marks it as cancelled. The match record itself is kept.",        badge: "Medium · Participants Removed",badgeColor: "text-amber-400 bg-amber-500/10 border-amber-500/20",        impact: "medium"   },
  { mode: "hard_delete",      emoji: "🗑️", title: "Delete for Everyone",        desc: "Permanently deletes the match from the database. Registered players are refunded but the match disappears from all listings.",        badge: "Hard · Irreversible",         badgeColor: "text-orange-400 bg-orange-500/10 border-orange-500/20",     impact: "hard"     },
  { mode: "full_wipe",        emoji: "☠️", title: "Full Wipe",                  desc: "Hard deletes the match AND erases all related wallet transactions from user history. Complete removal from the system.",               badge: "Critical · Permanent",        badgeColor: "text-red-400 bg-red-500/10 border-red-500/20",              impact: "critical" },
];

interface MatchDeleteDialogProps {
  title: string;
  mode: string;
  reason: string;
  busy: boolean;
  onModeChange: (m: string) => void;
  onReasonChange: (r: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function MatchDeleteDialog({ title, mode, reason, busy, onModeChange, onReasonChange, onCancel, onConfirm }: MatchDeleteDialogProps) {
  const selected = DELETE_OPTIONS.find(o => o.mode === mode) ?? DELETE_OPTIONS[0];
  const isDestructive = selected.impact === "hard" || selected.impact === "critical";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-0 px-0" style={{ background: "rgba(0,0,0,0.75)" }}>
      <div className="w-full max-w-sm rounded-t-3xl flex flex-col max-h-[92dvh]" style={{ background: "#111114", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none" }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-3 shrink-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-white leading-tight">Delete {title}?</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Choose how to handle this deletion</p>
          </div>
          <button onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-xl shrink-0" style={{ background: "rgba(255,255,255,0.05)" }}>
            <X className="w-3.5 h-3.5 text-zinc-500" />
          </button>
        </div>

        {/* Scrollable options */}
        <div className="flex-1 overflow-y-auto px-5 pb-2 flex flex-col gap-2">
          {DELETE_OPTIONS.map(opt => {
            const active = mode === opt.mode;
            return (
              <button key={opt.mode} onClick={() => onModeChange(opt.mode)}
                className="w-full flex items-start gap-3 px-3 py-3 rounded-2xl text-left transition-all"
                style={{
                  background: active ? (opt.impact === "critical" ? "rgba(239,68,68,0.09)" : opt.impact === "hard" ? "rgba(249,115,22,0.09)" : opt.impact === "medium" ? "rgba(245,158,11,0.07)" : "rgba(255,255,255,0.05)") : "rgba(255,255,255,0.025)",
                  border: active ? (opt.impact === "critical" ? "1px solid rgba(239,68,68,0.35)" : opt.impact === "hard" ? "1px solid rgba(249,115,22,0.3)" : opt.impact === "medium" ? "1px solid rgba(245,158,11,0.28)" : "1px solid rgba(255,255,255,0.15)") : "1px solid rgba(255,255,255,0.06)",
                }}>
                <div className="flex flex-col items-center gap-1.5 mt-0.5 shrink-0">
                  <span className="text-base leading-none">{opt.emoji}</span>
                  <div className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center"
                    style={{ borderColor: active ? "#a78bfa" : "rgba(255,255,255,0.2)", background: active ? "#a78bfa" : "transparent" }}>
                    {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={cn("text-[12px] font-bold", active ? "text-white" : "text-zinc-300")}>{opt.title}</p>
                    <span className={cn("text-[8px] font-bold px-1.5 py-0.5 rounded-full border", opt.badgeColor)}>{opt.badge}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-0.5 leading-relaxed">{opt.desc}</p>
                </div>
              </button>
            );
          })}

          {/* Reason input */}
          <div className="mt-1 flex flex-col gap-1.5">
            <label className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold px-1">Reason / Note (optional)</label>
            <textarea
              value={reason}
              onChange={e => onReasonChange(e.target.value)}
              placeholder="e.g. Match cancelled due to server issues…"
              rows={2}
              className="w-full resize-none rounded-xl px-3 py-2.5 text-[11px] text-zinc-200 placeholder:text-zinc-700 outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pt-3 pb-6 flex gap-3 shrink-0 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <button onClick={onCancel} className="flex-1 py-3 rounded-2xl text-[12px] font-bold text-zinc-300" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}>Back</button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 py-3 rounded-2xl text-[12px] font-bold text-white disabled:opacity-50 transition-all"
            style={{
              background: isDestructive ? "rgba(239,68,68,0.28)" : "rgba(245,158,11,0.22)",
              border: isDestructive ? "1px solid rgba(239,68,68,0.45)" : "1px solid rgba(245,158,11,0.35)",
            }}
          >
            {busy ? "Working…" : selected.title}
          </button>
        </div>
      </div>
    </div>
  );
}

function handleAuthError(navigate: (path: string) => void) {
  localStorage.removeItem(SESSION_KEY);
  navigate(`/286c81443d1fb388d1b9a8e3b280824c`);
}

/* ── Main Page ── */
export default function MatchesManagement() {
  const [, navigate] = useLocation();
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<"knockout" | "tournaments">("knockout");

  // Knockout matches (API-backed: stored as tournaments with gameMode === "Knockout")
  const [showKForm, setShowKForm] = useState(false);
  const [editKTarget, setEditKTarget] = useState<ApiTournament | null>(null);
  const [deleteKId, setDeleteKId] = useState<number | null>(null);
  const [deletingK, setDeletingK] = useState(false);
  const [deleteKMode, setDeleteKMode] = useState<string>("cancel_notify");

  const [apiTournaments, setApiTournaments] = useState<ApiTournament[]>([]);
  const [tLoading, setTLoading] = useState(false);
  const [showTForm, setShowTForm] = useState(false);
  const [editTTarget, setEditTTarget] = useState<ApiTournament | null>(null);
  const [deleteTId, setDeleteTId] = useState<number | null>(null);
  const [deletingT, setDeletingT] = useState(false);
  const [deleteTMode, setDeleteTMode] = useState<string>("cancel_notify");
  const [deleteMatchReason, setDeleteMatchReason] = useState<string>("");


  const tabBarRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uc = params.get("uc");
    if (uc !== null && uc !== REQUIRED_UC) { navigate("/"); return; }
    const session = getSession();
    if (!session) { navigate(`/286c81443d1fb388d1b9a8e3b280824c`); return; }
    setAuthed(true);
  }, []);

  async function loadTournaments() {
    setTLoading(true);
    try {
      const res = await authFetchAdmin("/admin/tournaments");
      if (res.status === 401 || res.status === 403) { handleAuthError(navigate); return; }
      if (res.ok) setApiTournaments(await res.json());
    } catch { /* ignore */ }
    finally { setTLoading(false); }
  }

  useEffect(() => {
    if (!authed) return;
    loadTournaments();
    const interval = setInterval(loadTournaments, 20000);
    return () => clearInterval(interval);
  }, [authed]);

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0b" }}>
        <div className="flex flex-col items-center gap-3">
          <Lock className="w-8 h-8 text-zinc-700" />
          <p className="text-zinc-600 text-sm">Verifying session…</p>
        </div>
      </div>
    );
  }

  const knockoutMatches = apiTournaments.filter(t => t.gameMode === "Knockout" || t.gameMode.endsWith("_knockout"));
  const tournamentMatches = apiTournaments.filter(t => t.gameMode !== "Knockout" && !t.gameMode.endsWith("_knockout"));

  async function execMatchDelete(id: number, mode: string, reason: string, kind: "k" | "t") {
    const setDeleting = kind === "k" ? setDeletingK : setDeletingT;
    const resetDialog = () => {
      if (kind === "k") { setDeleteKId(null); setDeleteKMode("cancel_notify"); }
      else              { setDeleteTId(null); setDeleteTMode("cancel_notify"); }
      setDeleteMatchReason("");
    };
    setDeleting(true);
    try {
      const label = kind === "k" ? "Knockout match" : "Tournament";

      if (mode === "cancel_notify" || mode === "cancel_silent") {
        const res = await authFetchAdmin(`/admin/tournaments/${id}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason || undefined, silent: mode === "cancel_silent" }),
        });
        if (res.status === 401 || res.status === 403) { handleAuthError(navigate); return; }
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          toast({ title: "Cancel failed", description: b?.error ?? "Unknown error", variant: "destructive" });
          return;
        }
        setApiTournaments(prev => prev.map(t => t.id === id ? { ...t, status: "cancelled" } : t));
        toast({ title: `${label} cancelled`, description: mode === "cancel_silent" ? "Participants refunded silently." : "Participants refunded and notified." });

      } else {
        const res = await authFetchAdmin(`/admin/tournaments/${id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, reason: reason || undefined, silent: mode === "hide" }),
        });
        if (res.status === 401 || res.status === 403) { handleAuthError(navigate); return; }
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          toast({ title: "Action failed", description: b?.detail ?? b?.error ?? "Unknown error", variant: "destructive" });
          return;
        }
        if (mode === "hide") {
          setApiTournaments(prev => prev.map(t => t.id === id ? { ...t, status: "hidden" } : t));
          toast({ title: `${label} hidden`, description: "Hidden from listings. Registered players unaffected." });
        } else if (mode === "registered_only") {
          setApiTournaments(prev => prev.map(t => t.id === id ? { ...t, status: "cancelled" } : t));
          toast({ title: "Registered players removed", description: "Participants refunded. Match record kept." });
        } else {
          setApiTournaments(prev => prev.filter(t => t.id !== id));
          toast({ title: mode === "full_wipe" ? `${label} fully wiped` : `${label} deleted`, description: mode === "full_wipe" ? "Deleted from DB and wallet history." : "Permanently removed for everyone." });
        }
      }
    } catch (e: any) {
      toast({ title: "Request failed", description: e?.message ?? "Check your connection", variant: "destructive" });
    } finally {
      setDeleting(false);
      resetDialog();
    }
  }

  function handleKDelete(id: number, mode: string, reason: string) { execMatchDelete(id, mode, reason, "k"); }
  function handleTDelete(id: number, mode: string, reason: string) { execMatchDelete(id, mode, reason, "t"); }

  function handleOpenPlayers(id: number | string, _title: string, matchSlug?: string | null) {
    const idPath = matchSlug || String(id);
    navigate(`/286c81443d1fb388d1b9a8e3b280824c/matches_management/joined_players/matches/${idPath}`);
  }

  async function handleGenSlug(id: number) {
    try {
      const res = await authFetchAdmin(`/admin/tournaments/${id}/gen-slug`, { method: "POST" });
      if (!res.ok) throw new Error();
      const { tournament: updated } = await res.json();
      setApiTournaments(prev => prev.map(t => t.id === id ? updated : t));
      toast({ title: "Slug generated!", description: `matches/${updated.matchSlug}` });
    } catch {
      toast({ title: "Failed to generate slug", variant: "destructive" });
    }
  }

  const TABS: { id: "knockout" | "tournaments"; label: string; icon: React.ElementType }[] = [
    { id: "knockout", label: "Knockout Matches", icon: Swords },
    { id: "tournaments", label: "Tournaments", icon: Trophy },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a0a0b" }}>
      {/* Header */}
      <div className="shrink-0 px-4 pt-10 pb-3" style={{ background: "linear-gradient(180deg, #0f0f10 0%, #0a0a0b 100%)" }}>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate("/286c81443d1fb388d1b9a8e3b280824c")}
            className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}>
            <ArrowLeft className="w-4 h-4 text-zinc-300" />
          </button>
          <div className="flex-1">
            <h1 className="text-[17px] font-extrabold text-white tracking-tight">Matches Management</h1>
            <p className="text-[10px] text-zinc-500">Manage knockout matches & tournaments</p>
          </div>
        </div>
        <div ref={tabBarRef} className="flex gap-1 p-1 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {TABS.map(tabItem => {
            const active = tab === tabItem.id;
            const isTournament = tabItem.id === "tournaments";
            const count = isTournament ? tournamentMatches.length : knockoutMatches.length;
            return (
              <button key={tabItem.id} onClick={() => setTab(tabItem.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-bold transition-all"
                style={{
                  background: active ? isTournament ? "linear-gradient(135deg, #92400e22, #f59e0b22)" : "linear-gradient(135deg, #7c3aed22, #a855f722)" : "transparent",
                  color: active ? (isTournament ? "#fbbf24" : "#c084fc") : "#52525b",
                  border: active ? isTournament ? "1px solid rgba(245,158,11,0.3)" : "1px solid rgba(168,85,247,0.25)" : "1px solid transparent",
                }}>
                <tabItem.icon className="w-3.5 h-3.5" />
                {tabItem.label}
                {count > 0 && (
                  <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold flex items-center justify-center"
                    style={{
                      background: active ? (isTournament ? "rgba(245,158,11,0.25)" : "rgba(168,85,247,0.25)") : "rgba(255,255,255,0.08)",
                      color: active ? (isTournament ? "#fbbf24" : "#c084fc") : "#71717a",
                    }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-28" style={{ scrollbarWidth: "none" }}>

        {/* ── Knockout Matches Tab ── */}
        {tab === "knockout" && (
          <div className="pt-4 space-y-3">
            <div className="flex gap-2">
              <button onClick={() => navigate("/286c81443d1fb388d1b9a8e3b280824c/matches_management/knockout/new")}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[13px] font-bold text-white transition-all active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.18), rgba(168,85,247,0.18))", border: "1.5px dashed rgba(168,85,247,0.4)" }}>
                <Plus className="w-4 h-4 text-violet-400" /> Add New Knockout Match
              </button>
              <button onClick={loadTournaments} disabled={tLoading}
                className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all active:scale-95 disabled:opacity-50"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
                <RefreshCw className={cn("w-4 h-4 text-zinc-400", tLoading && "animate-spin")} />
              </button>
            </div>

            {tLoading && knockoutMatches.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
              </div>
            ) : knockoutMatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-16 h-16 rounded-3xl flex items-center justify-center" style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.15)" }}>
                  <Swords className="w-7 h-7 text-zinc-700" />
                </div>
                <p className="text-zinc-600 text-sm font-medium">No knockout matches yet</p>
                <p className="text-zinc-700 text-[11px]">Tap the button above to create one</p>
              </div>
            ) : (
              knockoutMatches.map(t => (
                <TournamentListCard
                  key={t.id}
                  t={t}
                  onEdit={() => navigate(`/286c81443d1fb388d1b9a8e3b280824c/matches_management/knockout/edit/${t.id}`)}
                  onDelete={() => setDeleteKId(t.id)}
                  onGenSlug={() => handleGenSlug(t.id)}
                  onPlayers={() => handleOpenPlayers(t.id, t.title, t.matchSlug)}
                />
              ))
            )}
          </div>
        )}

        {/* ── Tournaments Tab ── */}
        {tab === "tournaments" && (
          <div className="pt-4 space-y-3">
            <div className="flex gap-2">
              <button onClick={() => { setEditTTarget(null); setShowTForm(true); }}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[13px] font-bold text-white transition-all active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, rgba(146,64,14,0.18), rgba(245,158,11,0.18))", border: "1.5px dashed rgba(245,158,11,0.4)" }}>
                <Plus className="w-4 h-4 text-amber-400" /> Add Tournament
              </button>
              <button onClick={loadTournaments} disabled={tLoading}
                className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all active:scale-95 disabled:opacity-50"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
                <RefreshCw className={cn("w-4 h-4 text-zinc-400", tLoading && "animate-spin")} />
              </button>
            </div>

            {tLoading && tournamentMatches.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
              </div>
            ) : tournamentMatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-16 h-16 rounded-3xl flex items-center justify-center" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)" }}>
                  <Trophy className="w-7 h-7 text-zinc-700" />
                </div>
                <p className="text-zinc-600 text-sm font-medium">No tournaments yet</p>
                <p className="text-zinc-700 text-[11px]">Tap the button above to create one</p>
              </div>
            ) : (
              tournamentMatches.map(t => (
                <TournamentListCard
                  key={t.id}
                  t={t}
                  onEdit={() => { setEditTTarget(t); setShowTForm(true); }}
                  onDelete={() => setDeleteTId(t.id)}
                  onGenSlug={() => handleGenSlug(t.id)}
                  onPlayers={() => handleOpenPlayers(t.id, t.title, t.matchSlug)}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Knockout delete dialog */}
      {deleteKId !== null && (
        <MatchDeleteDialog
          title="Knockout Match"
          mode={deleteKMode}
          reason={deleteMatchReason}
          busy={deletingK}
          onModeChange={setDeleteKMode}
          onReasonChange={setDeleteMatchReason}
          onCancel={() => { setDeleteKId(null); setDeleteKMode("cancel_notify"); setDeleteMatchReason(""); }}
          onConfirm={() => handleKDelete(deleteKId, deleteKMode, deleteMatchReason)}
        />
      )}

      {/* Knockout form modal */}
      {showKForm && (
        <TournamentFormModal
          initial={editKTarget}
          kind="knockout"
          onSaved={saved => {
            setApiTournaments(prev =>
              editKTarget
                ? prev.map(t => t.id === saved.id ? saved : t)
                : [saved, ...prev]
            );
            setShowKForm(false);
            setEditKTarget(null);
          }}
          onClose={() => { setShowKForm(false); setEditKTarget(null); }}
        />
      )}

      {/* Tournament delete dialog */}
      {deleteTId !== null && (
        <MatchDeleteDialog
          title="Tournament"
          mode={deleteTMode}
          reason={deleteMatchReason}
          busy={deletingT}
          onModeChange={setDeleteTMode}
          onReasonChange={setDeleteMatchReason}
          onCancel={() => { setDeleteTId(null); setDeleteTMode("cancel_notify"); setDeleteMatchReason(""); }}
          onConfirm={() => handleTDelete(deleteTId, deleteTMode, deleteMatchReason)}
        />
      )}

      {/* Tournament form modal */}
      {showTForm && (
        <TournamentFormModal
          initial={editTTarget}
          onSaved={saved => {
            setApiTournaments(prev =>
              editTTarget
                ? prev.map(t => t.id === saved.id ? saved : t)
                : [saved, ...prev]
            );
            setShowTForm(false);
            setEditTTarget(null);
          }}
          onClose={() => { setShowTForm(false); setEditTTarget(null); }}
        />
      )}

    </div>
  );
}
