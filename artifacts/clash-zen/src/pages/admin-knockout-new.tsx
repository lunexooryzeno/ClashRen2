import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, RefreshCw, X, Eye, EyeOff, Upload, Copy,
  AlignLeft, Image, Gem, Settings, Lock, Hash, Shield,
  CheckCircle, Gamepad2, Swords, Zap, Users, Globe,
  Clock, Calendar, Star, MapPin, Tag, FileText,
  Plus, Trash2, Palette, ChevronDown, ToggleLeft, ToggleRight,
  Pencil, Save,
} from "lucide-react";
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

async function authFetchAdmin(path: string, opts?: RequestInit): Promise<Response> {
  const session = getSession();
  return fetch(`/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { "x-super-admin-token": session.token } : {}),
      ...(opts?.headers ?? {}),
    },
  });
}

function resolveImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("/objects/")) return `/api/storage/objects/${url.slice("/objects/".length)}`;
  if (!url.startsWith("http") && !url.startsWith("/api/")) return `/api/storage/objects/${url}`;
  return url;
}

const MAPS = ["Bermuda", "Kalahari", "Purgatory", "Nexterra", "Alpine", "Bermuda Remastered", "Iron Cage"];
const REGIONS = ["India", "Asia", "Europe", "North America", "South America", "Global"];
const DURATIONS = ["10 min", "15 min", "20 min", "25 min", "30 min", "45 min", "1 hour"];
const TEAM_FORMATS = ["Solo", "Duo", "Squad", "Clash Squad"];
const STATUS_OPTIONS = ["upcoming", "ongoing", "completed", "cancelled"];
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

interface MatchSettingsForm {
  teamFormat: string; minLevel: number; rounds: string;
  hp: number; ep: number; movementSpeed: string; jumpHeight: string;
  ammoLimit: boolean; gunAttributes: boolean; weaponSkins: boolean;
  onlyHeadshot: boolean; emulators: boolean; showCountdown: boolean;
  autoDeleteCondition: string; autoDeleteMinValue: number;
  winLogic: string;
}
const DEFAULT_MATCH_SETTINGS: MatchSettingsForm = {
  teamFormat: "Solo", minLevel: 40, rounds: "9 (First to 5 wins)",
  hp: 200, ep: 0, movementSpeed: "100%", jumpHeight: "100%",
  ammoLimit: false, gunAttributes: false, weaponSkins: false,
  onlyHeadshot: false, emulators: false, showCountdown: false,
  autoDeleteCondition: "none", autoDeleteMinValue: 5,
  winLogic: "standard",
};

interface SlotEntry { hour: number; minute: number; endHour: number; endMinute: number; }

const DEFAULT_SLOT_ENTRIES: SlotEntry[] = [
  { hour: 18, minute: 0, endHour: 18, endMinute: 45 },
  { hour: 19, minute: 0, endHour: 19, endMinute: 45 },
  { hour: 20, minute: 0, endHour: 20, endMinute: 45 },
  { hour: 21, minute: 0, endHour: 21, endMinute: 45 },
  { hour: 22, minute: 0, endHour: 22, endMinute: 45 },
];

function fmt12(h: number, m: number) {
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h12}:${pad(m)} ${ampm}`;
}

interface TournamentForm {
  title: string; gameMode: string; startDate: string;
  slotEntries: SlotEntry[];
  registrationCloseMinutes: number;
  status: string; entryFeeDiamonds: number; prizePoolDiamonds: number;
  maxSlots: number; perKillDiamonds: number; imageUrl: string; rules: string;
  shortTitle: string; statusLabel: string; statusColor: string;
  description: string; map: string; region: string;
  estimatedDuration: string; matchSettings: MatchSettingsForm;
}

const EMPTY_FORM: TournamentForm = {
  title: "", gameMode: "Knockout", startDate: "",
  slotEntries: [{ hour: 18, minute: 0, endHour: 18, endMinute: 45 }],
  registrationCloseMinutes: 15,
  status: "upcoming", entryFeeDiamonds: 0, prizePoolDiamonds: 0,
  maxSlots: 100, perKillDiamonds: 0,
  imageUrl: "", rules: "", shortTitle: "", statusLabel: "", statusColor: "green",
  description: "", map: "Bermuda", region: "India", estimatedDuration: "20 min",
  matchSettings: { ...DEFAULT_MATCH_SETTINGS },
};

const CS1V1_TEMPLATE: TournamentForm = {
  title: "Clash Squad 1v1",
  gameMode: "Knockout",
  startDate: "",
  slotEntries: [
    { hour: 18, minute: 0, endHour: 18, endMinute: 20 },
    { hour: 19, minute: 0, endHour: 19, endMinute: 20 },
    { hour: 20, minute: 0, endHour: 20, endMinute: 20 },
    { hour: 21, minute: 0, endHour: 21, endMinute: 20 },
    { hour: 22, minute: 0, endHour: 22, endMinute: 20 },
  ],
  registrationCloseMinutes: 5,
  status: "upcoming",
  entryFeeDiamonds: 0, prizePoolDiamonds: 0,
  maxSlots: 2, perKillDiamonds: 0,
  imageUrl: "", rules: "No teaming allowed\nAdmin decision is final\nOne account per player",
  shortTitle: "Clash Squad · 1v1",
  statusLabel: "1v1",
  statusColor: "purple",
  description: "Head-to-head Clash Squad 1v1 knockout. First to clear the enemy wins.",
  map: "Bermuda", region: "India", estimatedDuration: "15 min",
  matchSettings: {
    ...DEFAULT_MATCH_SETTINGS,
    teamFormat: "Clash Squad",
    rounds: "7 (First to 4 wins)",
    hp: 200, ep: 0,
    ammoLimit: true,
    gunAttributes: false,
    weaponSkins: false,
    onlyHeadshot: false,
    emulators: false,
    showCountdown: true,
    autoDeleteCondition: "if_empty",
    autoDeleteMinValue: 2,
  },
};

/* ── Template storage ── */
const TEMPLATES_STORAGE_KEY = "czsa_match_templates_v1";
const TEMPLATE_ICONS = ["⚔️","🏆","🎯","💥","🔥","👑","⚡","🌪️","🎪","🎮","🧩","🦅"];

interface MatchTemplate {
  id: string;
  icon: string;
  name: string;
  description: string;
  tags: string;         // comma-separated for easy editing
  teamFormat: string;   // controls knockoutTeamFormat when applied
  defaults: TournamentForm;
}

const CS1V1_HEALING_TEMPLATE: TournamentForm = {
  title: "CS 1v1 Healing Battle",
  gameMode: "Knockout",
  startDate: "",
  slotEntries: [
    { hour: 18, minute: 0, endHour: 18, endMinute: 20 },
    { hour: 19, minute: 0, endHour: 19, endMinute: 20 },
    { hour: 20, minute: 0, endHour: 20, endMinute: 20 },
    { hour: 21, minute: 0, endHour: 21, endMinute: 20 },
    { hour: 22, minute: 0, endHour: 22, endMinute: 20 },
  ],
  registrationCloseMinutes: 5,
  status: "upcoming",
  entryFeeDiamonds: 0, prizePoolDiamonds: 0,
  maxSlots: 2, perKillDiamonds: 0,
  imageUrl: "",
  rules: [
    "🏥 THIS IS A HEALING BATTLE — DO NOT attack your opponent",
    "✅ WIN CONDITION: Deal ZERO damage to your opponent and survive",
    "❌ LOSE CONDITION: If you deal ANY damage to your opponent, you LOSE instantly — even if you win the round",
    "⚠️ BOTH DEAL DAMAGE: If both players deal damage, BOTH are DISQUALIFIED — no winner for that slot",
    "📸 RESULT PROOF: Both players must send a screenshot of the post-match Result screen to the admin immediately after the match — showing Damage Dealt stats",
    "🔍 VERIFICATION: Admin will verify Damage Dealt = 0 for the declared winner using submitted screenshots",
    "🛒 BUY ONLY HEALING ITEMS: Spend your CS coins on medkits, injections, and shields only",
    "🚫 No weapons purchase allowed — buying a weapon is grounds for disqualification",
    "Admin decision based on screenshot proof is final",
    "One account per player",
    "Do not share room password",
  ].join("\n"),
  shortTitle: "Healing Battle",
  statusLabel: "Healing",
  statusColor: "green",
  description: "Win by dealing ZERO damage. Buy only healing items. Any damage dealt = instant loss. Both deal damage = both disqualified.",
  map: "Bermuda", region: "India", estimatedDuration: "15 min",
  matchSettings: {
    ...DEFAULT_MATCH_SETTINGS,
    teamFormat: "Clash Squad",
    rounds: "7 (First to 4 wins)",
    hp: 200, ep: 250,
    ammoLimit: false,
    gunAttributes: false,
    weaponSkins: false,
    onlyHeadshot: false,
    emulators: false,
    showCountdown: true,
    autoDeleteCondition: "if_empty",
    autoDeleteMinValue: 2,
    winLogic: "healing_battle",
  },
};

const BUILTIN_TEMPLATES: MatchTemplate[] = [
  {
    id: "cs1v1",
    icon: "⚔️",
    name: "Clash Squad 1 VS 1",
    description: "Pre-loaded 1v1 Clash Squad knockout with 5 daily time slots, 5-min reg cutoff, and auto-cancel if empty.",
    tags: "2 Slots,15 min,CS Mode,5 min cutoff,Auto-cancel if empty",
    teamFormat: "Clash Squad",
    defaults: CS1V1_TEMPLATE,
  },
  {
    id: "cs1v1_healing",
    icon: "💚",
    name: "CS 1v1 Healing Battle",
    description: "Win by dealing ZERO damage. Buy only healing items. Any damage = instant loss. Both deal damage = both disqualified.",
    tags: "2 Slots,Healing Battle,No Damage,CS Mode,Screenshot Verified",
    teamFormat: "Clash Squad",
    defaults: CS1V1_HEALING_TEMPLATE,
  },
];

function loadTemplates(): MatchTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    let stored: MatchTemplate[] = [];
    if (raw) {
      const parsed = JSON.parse(raw) as MatchTemplate[];
      if (Array.isArray(parsed) && parsed.length > 0) stored = parsed;
    }
    // Inject any builtin templates missing from stored list (so new builtins auto-appear)
    let result = [...stored];
    let changed = stored.length === 0;
    for (const builtin of BUILTIN_TEMPLATES) {
      if (!result.find(t => t.id === builtin.id)) {
        result = [builtin, ...result];
        changed = true;
      }
    }
    if (changed) localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(result));
    return result;
  } catch { return BUILTIN_TEMPLATES.map(t => ({ ...t })); }
}
function saveTemplates(tpls: MatchTemplate[]) {
  localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(tpls));
}

const BLANK_TEMPLATE: MatchTemplate = {
  id: "",
  icon: "🎮",
  name: "",
  description: "",
  tags: "",
  teamFormat: "Solo",
  defaults: { ...EMPTY_FORM },
};

const BADGE_COLORS = [
  { id: "green",  hex: "#10b981", label: "Green"  },
  { id: "blue",   hex: "#3b82f6", label: "Blue"   },
  { id: "red",    hex: "#ef4444", label: "Red"    },
  { id: "yellow", hex: "#f59e0b", label: "Yellow" },
  { id: "purple", hex: "#a855f7", label: "Purple" },
  { id: "orange", hex: "#f97316", label: "Orange" },
  { id: "cyan",   hex: "#06b6d4", label: "Cyan"   },
] as const;

/* ── Field helpers ── */
function SectionHead({ icon: Icon, label, color = "#a855f7" }: { icon: React.ElementType; label: string; color?: string }) {
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

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{children}</label>;
}

function Field({ label, children, hint }: { label?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <Label>{label}</Label>}
      {children}
      {hint && <p className="text-[10px] text-zinc-600 mt-0.5">{hint}</p>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.10)",
};
const inputCls = "w-full px-3 py-2.5 rounded-xl text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500/40";

function TextInput({ value, onChange, placeholder, type = "text" }: {
  value: string | number; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input type={type === "number" ? "text" : type} inputMode={type === "number" ? "numeric" : undefined}
      value={value} onChange={e => onChange(type === "number" ? e.target.value.replace(/[^0-9]/g, "") : e.target.value)}
      placeholder={placeholder} className={inputCls} style={inputStyle} />
  );
}

function SelectInput({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full appearance-none px-3 py-2.5 rounded-xl text-[13px] font-medium text-white pr-8 focus:outline-none"
        style={inputStyle}>
        {options.map(o => <option key={o} value={o} style={{ background: "#18181b" }}>{o}</option>)}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
    </div>
  );
}

function Toggle({ value, onChange, label, desc }: { value: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <button type="button" onClick={() => onChange(!value)}
      className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex flex-col items-start">
        <span className="text-[12px] font-bold text-zinc-300">{label}</span>
        {desc && <span className="text-[10px] text-zinc-600">{desc}</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold" style={{ color: value ? "#4ade80" : "#71717a" }}>{value ? "On" : "Off"}</span>
        <div className="relative w-9 h-5 rounded-full transition-all"
          style={{ background: value ? "rgba(74,222,128,0.35)" : "rgba(255,255,255,0.08)", border: value ? "1px solid rgba(74,222,128,0.5)" : "1px solid rgba(255,255,255,0.12)" }}>
          <div className="absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200"
            style={{ left: value ? "calc(100% - 18px)" : "2px", background: value ? "#4ade80" : "#52525b" }} />
        </div>
      </div>
    </button>
  );
}

/* ── Page ── */
export default function AdminKnockoutNewPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [authed, setAuthed] = useState(false);
  // screen: "select" | "form" | "template-edit"
  const [screen, setScreen] = useState<"select" | "form" | "template-edit">("select");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | "custom" | null>(null);
  const [templates, setTemplates] = useState<MatchTemplate[]>(() => loadTemplates());
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null); // null = new
  const [editTmpl, setEditTmpl] = useState<MatchTemplate>({ ...BLANK_TEMPLATE });
  const [form, setForm] = useState<TournamentForm>({ ...EMPTY_FORM });
  const [knockoutTeamFormat, setKnockoutTeamFormat] = useState("Solo");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [customRuleInput, setCustomRuleInput] = useState("");
  const [tmplTagInput, setTmplTagInput] = useState("");

  function set<K extends keyof TournamentForm>(k: K, v: TournamentForm[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }
  function setMs<K extends keyof MatchSettingsForm>(k: K, v: MatchSettingsForm[K]) {
    setForm(prev => ({ ...prev, matchSettings: { ...prev.matchSettings, [k]: v } }));
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uc = params.get("uc");
    if (uc !== null && uc !== REQUIRED_UC) { navigate("/"); return; }
    const session = getSession();
    if (!session) { navigate(`/286c81443d1fb388d1b9a8e3b280824c`); return; }
    setAuthed(true);
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    set("startDate", `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }, []);

  async function handleImageUpload(file: File) {
    if (!file.type.startsWith("image/")) { toast({ title: "Please choose an image file", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const session = getSession();
      const res = await fetch("/api/admin/tournaments/upload-image", {
        method: "POST",
        headers: { "Content-Type": file.type, ...(session ? { "x-super-admin-token": session.token } : {}) },
        body: file,
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; throw new Error(b.error ?? `Upload failed`); }
      const { url } = await res.json() as { url: string };
      set("imageUrl", url);
      toast({ title: "Image uploaded" });
    } catch (e) {
      toast({ title: "Upload failed", description: String(e), variant: "destructive" });
    } finally { setUploading(false); }
  }

  async function handleSave() {
    if (!form.title.trim()) { toast({ title: "Match title is required", variant: "destructive" }); return; }
    if (!form.startDate) { toast({ title: "Start date is required", variant: "destructive" }); return; }
    const slots = (form.slotEntries ?? []).filter(e => e.hour >= 0 && e.hour <= 23);
    if (slots.length === 0) { toast({ title: "Add at least one time slot", variant: "destructive" }); return; }
    setSaving(true);
    const pad = (n: number) => String(n).padStart(2, "0");
    try {
      // Build time slots array to embed inside matchSettings
      const timeSlots = slots.map(entry => {
        const { hour: startHour, minute: startMin, endHour, endMinute } = entry;
        const startTime = new Date(`${form.startDate}T${pad(startHour)}:${pad(startMin)}:00`).toISOString();
        const slotEndTime = new Date(`${form.startDate}T${pad(endHour ?? startHour)}:${pad(endMinute ?? startMin + 45)}:00`).toISOString();
        const label = `${fmt12(startHour, startMin)} – ${fmt12(endHour ?? startHour, endMinute ?? startMin + 45)}`;
        return { startTime, endTime: slotEndTime, label };
      });

      // Use first slot's startTime as the tournament startTime
      const firstSlot = timeSlots[0];
      const slotWindowLabel = timeSlots.length === 1
        ? firstSlot.label
        : `${fmt12(slots[0].hour, slots[0].minute)} – ${fmt12(slots[slots.length - 1].endHour ?? slots[slots.length - 1].hour, slots[slots.length - 1].endMinute ?? slots[slots.length - 1].minute + 45)}`;

      const ms = JSON.stringify({
        ...form.matchSettings,
        timeSlots,
        slotWindowLabel,
        slotEndTime: firstSlot.endTime,
        registrationCloseMinutes: form.registrationCloseMinutes,
      });

      const body = {
        title: form.title, gameMode: `${knockoutTeamFormat.toLowerCase().replace(/\s+/g, "_")}_knockout`, startTime: firstSlot.startTime,
        status: form.status,
        entryFeeDiamonds: form.entryFeeDiamonds,
        prizePoolDiamonds: form.prizePoolDiamonds,
        maxSlots: form.maxSlots,
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
        matchSettings: ms,
      };

      const res = await authFetchAdmin("/admin/tournaments", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Match created!", description: `${slots.length} time slot${slots.length !== 1 ? "s" : ""} saved inside the match.` });
      navigate("/286c81443d1fb388d1b9a8e3b280824c/matches_management");
    } catch (e) {
      toast({ title: "Failed to create", description: String(e), variant: "destructive" });
    } finally { setSaving(false); }
  }

  function todayStr() {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function applyTemplate(tmpl: MatchTemplate) {
    setForm({ ...tmpl.defaults, startDate: todayStr() });
    setKnockoutTeamFormat(tmpl.teamFormat);
    setSelectedTemplateId(tmpl.id);
    setScreen("form");
  }

  function openCustom() {
    setForm({ ...EMPTY_FORM, startDate: todayStr() });
    setKnockoutTeamFormat("Solo");
    setSelectedTemplateId("custom");
    setScreen("form");
  }

  function openNewTemplate() {
    setEditTmpl({ ...BLANK_TEMPLATE, id: `tmpl_${Date.now()}` });
    setTmplTagInput("");
    setEditingTemplateId(null);
    setScreen("template-edit");
  }

  function openEditTemplate(tmpl: MatchTemplate) {
    setEditTmpl({ ...tmpl, defaults: { ...tmpl.defaults, matchSettings: { ...tmpl.defaults.matchSettings } } });
    setTmplTagInput(tmpl.tags);
    setEditingTemplateId(tmpl.id);
    setScreen("template-edit");
  }

  function deleteTemplate(id: string) {
    const next = templates.filter(t => t.id !== id);
    saveTemplates(next);
    setTemplates(next);
  }

  function saveTemplate() {
    const name = editTmpl.name.trim();
    if (!name) { toast({ title: "Template name is required", variant: "destructive" }); return; }
    const updated = { ...editTmpl, name, tags: tmplTagInput };
    const existing = templates.find(t => t.id === editTmpl.id);
    let next: MatchTemplate[];
    if (existing) {
      next = templates.map(t => t.id === editTmpl.id ? updated : t);
    } else {
      next = [...templates, updated];
    }
    saveTemplates(next);
    setTemplates(next);
    toast({ title: "Template saved" });
    setScreen("select");
  }

  function setTd<K extends keyof TournamentForm>(k: K, v: TournamentForm[K]) {
    setEditTmpl(prev => ({ ...prev, defaults: { ...prev.defaults, [k]: v } }));
  }
  function setTdMs<K extends keyof MatchSettingsForm>(k: K, v: MatchSettingsForm[K]) {
    setEditTmpl(prev => ({ ...prev, defaults: { ...prev.defaults, matchSettings: { ...prev.defaults.matchSettings, [k]: v } } }));
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0b" }}>
        <Lock className="w-8 h-8 text-zinc-700 animate-pulse" />
      </div>
    );
  }

  /* ── Select screen ── */
  if (screen === "select") {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "#0a0a0b" }}>
        {/* Header */}
        <div className="shrink-0 sticky top-0 z-30 flex items-center gap-3 px-4 py-3.5"
          style={{ background: "rgba(10,10,11,0.95)", borderBottom: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}>
          <button onClick={() => navigate("/286c81443d1fb388d1b9a8e3b280824c/matches_management")}
            className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 transition-all active:scale-90"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}>
            <ArrowLeft className="w-4 h-4 text-zinc-300" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-lg flex items-center justify-center" style={{ background: "rgba(168,85,247,0.2)" }}>
                <Swords className="w-3 h-3 text-violet-400" />
              </div>
              <p className="text-[14px] font-extrabold text-white">New Knockout Match</p>
            </div>
            <p className="text-[10px] text-zinc-500 mt-0.5">Choose a template or start blank</p>
          </div>
        </div>

        {/* Cards */}
        <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-4 pb-32" style={{ scrollbarWidth: "none" }}>
          {templates.length > 0 && (
            <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.18em] px-1">Saved Templates</p>
          )}

          {templates.map(tmpl => {
            const tags = tmpl.tags.split(",").map(t => t.trim()).filter(Boolean);
            return (
              <div key={tmpl.id} className="rounded-2xl overflow-hidden"
                style={{ border: "1.5px solid rgba(168,85,247,0.28)", background: "rgba(168,85,247,0.06)" }}>
                {/* Clickable body */}
                <button type="button" onClick={() => applyTemplate(tmpl)}
                  className="w-full text-left p-5 flex flex-col gap-3 transition-all active:scale-[0.98]">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-2xl"
                      style={{ background: "rgba(168,85,247,0.18)", border: "1px solid rgba(168,85,247,0.30)" }}>
                      {tmpl.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[15px] font-extrabold text-white">{tmpl.name}</p>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(168,85,247,0.2)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.35)" }}>
                          Template
                        </span>
                      </div>
                      {tmpl.description && (
                        <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{tmpl.description}</p>
                      )}
                    </div>
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map(tag => (
                        <span key={tag} className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(255,255,255,0.05)", color: "#71717a", border: "1px solid rgba(255,255,255,0.08)" }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-end">
                    <span className="flex items-center gap-1.5 text-[12px] font-extrabold" style={{ color: "#c084fc" }}>
                      Use Template <Zap className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </button>
                {/* Action bar */}
                <div className="flex gap-2 px-4 pb-4">
                  <button type="button" onClick={() => openEditTemplate(tmpl)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                    style={{ background: "rgba(168,85,247,0.12)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.25)" }}>
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  <button type="button" onClick={() => {
                    if (window.confirm(`Delete template "${tmpl.name}"?`)) deleteTemplate(tmpl.id);
                  }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                    style={{ background: "rgba(239,68,68,0.10)", color: "#f87171", border: "1px solid rgba(239,68,68,0.22)" }}>
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              </div>
            );
          })}

          {/* Add template button */}
          <button type="button" onClick={openNewTemplate}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[12px] font-bold transition-all active:scale-[0.98]"
            style={{ background: "rgba(168,85,247,0.06)", border: "1.5px dashed rgba(168,85,247,0.30)", color: "#a855f7" }}>
            <Plus className="w-3.5 h-3.5" /> New Template
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-1">
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
            <span className="text-[10px] font-bold text-zinc-700 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>

          {/* Custom Match card */}
          <button type="button" onClick={openCustom}
            className="w-full text-left rounded-2xl p-5 transition-all active:scale-[0.98] flex flex-col gap-3"
            style={{ background: "rgba(255,255,255,0.025)", border: "1.5px solid rgba(255,255,255,0.09)" }}>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-2xl"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
                🎮
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-extrabold text-white">Custom Match</p>
                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                  Start blank with full control over every setting.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end">
              <span className="flex items-center gap-1.5 text-[12px] font-extrabold text-zinc-400">
                Start blank <Plus className="w-3.5 h-3.5" />
              </span>
            </div>
          </button>
        </div>
      </div>
    );
  }

  /* ── Template edit screen ── */
  if (screen === "template-edit") {
    const td = editTmpl.defaults;
    const tdMs = td.matchSettings;
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "#0a0a0b" }}>
        {/* Header */}
        <div className="shrink-0 sticky top-0 z-30 flex items-center gap-3 px-4 py-3.5"
          style={{ background: "rgba(10,10,11,0.95)", borderBottom: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}>
          <button onClick={() => setScreen("select")}
            className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 transition-all active:scale-90"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}>
            <ArrowLeft className="w-4 h-4 text-zinc-300" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-lg flex items-center justify-center" style={{ background: "rgba(168,85,247,0.2)" }}>
                <Pencil className="w-3 h-3 text-violet-400" />
              </div>
              <p className="text-[14px] font-extrabold text-white">
                {editingTemplateId !== null ? "Edit Template" : "New Template"}
              </p>
            </div>
            <p className="text-[10px] text-zinc-500 mt-0.5">Saved to this device</p>
          </div>
          <button onClick={saveTemplate}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-[12px] font-extrabold text-white transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)", boxShadow: "0 0 14px rgba(139,92,246,0.35)" }}>
            <Save className="w-3.5 h-3.5" /> Save
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5 pb-32" style={{ scrollbarWidth: "none" }}>

          {/* ── Template Identity ── */}
          <div className="rounded-2xl p-4 space-y-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <SectionHead icon={Tag} label="Template Identity" color="#a855f7" />
            <Field label="Template Name">
              <TextInput value={editTmpl.name} onChange={v => setEditTmpl(p => ({ ...p, name: v }))} placeholder="e.g. Clash Squad 1v1" />
            </Field>
            <Field label="Icon">
              <div className="flex flex-wrap gap-2">
                {TEMPLATE_ICONS.map(ic => (
                  <button key={ic} type="button" onClick={() => setEditTmpl(p => ({ ...p, icon: ic }))}
                    className="w-9 h-9 rounded-xl text-xl flex items-center justify-center transition-all active:scale-90"
                    style={{ background: editTmpl.icon === ic ? "rgba(168,85,247,0.25)" : "rgba(255,255,255,0.05)", border: editTmpl.icon === ic ? "1.5px solid rgba(168,85,247,0.55)" : "1px solid rgba(255,255,255,0.09)" }}>
                    {ic}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Description">
              <textarea value={editTmpl.description} onChange={e => setEditTmpl(p => ({ ...p, description: e.target.value }))} rows={2}
                placeholder="Short description shown on the template card…"
                className="w-full px-3 py-2.5 rounded-xl text-[13px] text-white placeholder:text-zinc-600 focus:outline-none resize-none focus:ring-1 focus:ring-violet-500/40"
                style={inputStyle} />
            </Field>
            <Field label="Tags" hint="Comma-separated. e.g. 2 Slots,15 min,CS Mode">
              <TextInput value={tmplTagInput} onChange={setTmplTagInput} placeholder="2 Slots,15 min,CS Mode" />
              {tmplTagInput.trim() && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {tmplTagInput.split(",").map(t => t.trim()).filter(Boolean).map(tag => (
                    <span key={tag} className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(255,255,255,0.07)", color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.12)" }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </Field>
          </div>

          {/* ── Match Defaults ── */}
          <div className="rounded-2xl p-4 space-y-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <SectionHead icon={Settings} label="Match Defaults" color="#38bdf8" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Team Format">
                <SelectInput value={editTmpl.teamFormat} options={TEAM_FORMATS} onChange={v => {
                  setEditTmpl(p => ({ ...p, teamFormat: v }));
                  setTdMs("teamFormat", v);
                }} />
              </Field>
              <Field label="Max Slots">
                <TextInput type="number" value={td.maxSlots} onChange={v => setTd("maxSlots", parseInt(v) || 0)} placeholder="100" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Map">
                <SelectInput value={td.map} options={MAPS} onChange={v => setTd("map", v)} />
              </Field>
              <Field label="Region">
                <SelectInput value={td.region} options={REGIONS} onChange={v => setTd("region", v)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Duration">
                <SelectInput value={td.estimatedDuration} options={DURATIONS} onChange={v => setTd("estimatedDuration", v)} />
              </Field>
              <Field label="Reg Close (min)">
                <TextInput type="number" value={td.registrationCloseMinutes} onChange={v => setTd("registrationCloseMinutes", parseInt(v) || 0)} placeholder="15" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Short Title">
                <TextInput value={td.shortTitle} onChange={v => setTd("shortTitle", v)} placeholder="CS · 1v1" />
              </Field>
              <Field label="Status Label">
                <TextInput value={td.statusLabel} onChange={v => setTd("statusLabel", v)} placeholder="1v1" />
              </Field>
            </div>
            <Field label="Status Color">
              <div className="flex gap-2 flex-wrap">
                {BADGE_COLORS.map(bc => (
                  <button key={bc.id} type="button" onClick={() => setTd("statusColor", bc.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90 relative"
                    style={{ background: `${bc.hex}22`, border: td.statusColor === bc.id ? `2px solid ${bc.hex}` : "1px solid rgba(255,255,255,0.10)" }}>
                    <div className="w-3 h-3 rounded-full" style={{ background: bc.hex }} />
                    {td.statusColor === bc.id && (
                      <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full flex items-center justify-center" style={{ background: bc.hex }}>
                        <CheckCircle className="w-1.5 h-1.5 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Default Rules">
              <textarea value={td.rules} onChange={e => setTd("rules", e.target.value)} rows={4}
                placeholder="One rule per line…"
                className="w-full px-3 py-2.5 rounded-xl text-[13px] text-white placeholder:text-zinc-600 focus:outline-none resize-none focus:ring-1 focus:ring-violet-500/40"
                style={inputStyle} />
            </Field>
          </div>

          {/* ── Match Settings Defaults ── */}
          <div className="rounded-2xl p-4 space-y-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <SectionHead icon={Gamepad2} label="Match Settings Defaults" color="#f59e0b" />
            <Field label="Rounds">
              <TextInput value={tdMs.rounds} onChange={v => setTdMs("rounds", v)} placeholder="7 (First to 4 wins)" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="HP">
                <TextInput type="number" value={tdMs.hp} onChange={v => setTdMs("hp", parseInt(v) || 0)} placeholder="200" />
              </Field>
              <Field label="EP">
                <TextInput type="number" value={tdMs.ep} onChange={v => setTdMs("ep", parseInt(v) || 0)} placeholder="0" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Movement Speed">
                <TextInput value={tdMs.movementSpeed} onChange={v => setTdMs("movementSpeed", v)} placeholder="100%" />
              </Field>
              <Field label="Jump Height">
                <TextInput value={tdMs.jumpHeight} onChange={v => setTdMs("jumpHeight", v)} placeholder="100%" />
              </Field>
            </div>
            <div className="space-y-2">
              <Toggle value={tdMs.ammoLimit} onChange={v => setTdMs("ammoLimit", v)} label="Ammo Limit" />
              <Toggle value={tdMs.gunAttributes} onChange={v => setTdMs("gunAttributes", v)} label="Gun Attributes" />
              <Toggle value={tdMs.weaponSkins} onChange={v => setTdMs("weaponSkins", v)} label="Weapon Skins" />
              <Toggle value={tdMs.onlyHeadshot} onChange={v => setTdMs("onlyHeadshot", v)} label="Only Headshot" />
              <Toggle value={tdMs.emulators} onChange={v => setTdMs("emulators", v)} label="Emulators Allowed" />
              <Toggle value={tdMs.showCountdown} onChange={v => setTdMs("showCountdown", v)} label="Show Countdown" />
            </div>
            <Field label="Win Logic" hint="How the auto-verify system decides the winner">
              <div className="grid grid-cols-2 gap-2 mt-0.5">
                {[
                  { val: "standard", icon: "⚔️", label: "Standard", desc: "Highest score wins" },
                  { val: "healing_battle", icon: "💚", label: "Healing Battle", desc: "0 damage = win" },
                ].map(opt => {
                  const active = (tdMs.winLogic ?? "standard") === opt.val;
                  return (
                    <button key={opt.val} type="button" onClick={() => setTdMs("winLogic", opt.val)}
                      className="flex flex-col gap-0.5 py-2.5 px-3 rounded-xl text-left transition-all active:scale-95"
                      style={{ background: active ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.04)", border: `1.5px solid ${active ? "rgba(168,85,247,0.45)" : "rgba(255,255,255,0.08)"}` }}>
                      <span className="text-base leading-none">{opt.icon}</span>
                      <span className="text-[11px] font-bold mt-1" style={{ color: active ? "#c084fc" : "#a1a1aa" }}>{opt.label}</span>
                      <span className="text-[9px] text-zinc-600">{opt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>

          {/* ── Auto-Delete Default ── */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <SectionHead icon={Trash2} label="Auto-Delete Default" color="#ef4444" />
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: "none", label: "Disabled" },
                { val: "if_empty", label: "If 0 players" },
                { val: "below_min", label: "Below min" },
                { val: "after_slot", label: "After slot ends" },
              ].map(opt => {
                const active = tdMs.autoDeleteCondition === opt.val;
                return (
                  <button key={opt.val} type="button" onClick={() => setTdMs("autoDeleteCondition", opt.val)}
                    className="py-2 px-3 rounded-xl text-[11px] font-bold transition-all active:scale-95 text-left"
                    style={{ background: active ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)", border: `1.5px solid ${active ? "rgba(239,68,68,0.45)" : "rgba(255,255,255,0.08)"}`, color: active ? "#f87171" : "#52525b" }}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {tdMs.autoDeleteCondition === "below_min" && (
              <Field label="Min Players">
                <TextInput type="number" value={tdMs.autoDeleteMinValue} onChange={v => setTdMs("autoDeleteMinValue", parseInt(v) || 0)} placeholder="2" />
              </Field>
            )}
          </div>
        </div>
      </div>
    );
  }

  const activeRules = form.rules.split("\n").filter(Boolean);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a0a0b" }}>

      {/* ── Header ── */}
      <div className="shrink-0 sticky top-0 z-30 flex items-center gap-3 px-4 py-3.5"
        style={{ background: "rgba(10,10,11,0.95)", borderBottom: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}>
        <button
          onClick={() => setScreen("select")}
          className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 transition-all active:scale-90"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <ArrowLeft className="w-4 h-4 text-zinc-300" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg flex items-center justify-center" style={{ background: "rgba(168,85,247,0.2)" }}>
              <Swords className="w-3 h-3 text-violet-400" />
            </div>
            <p className="text-[14px] font-extrabold text-white">
              {selectedTemplateId === "custom"
                ? "Custom Match"
                : (templates.find(t => t.id === selectedTemplateId)?.name ?? "New Match")}
            </p>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full cursor-pointer"
              style={{ background: selectedTemplateId !== "custom" ? "rgba(168,85,247,0.18)" : "rgba(255,255,255,0.07)", color: selectedTemplateId !== "custom" ? "#c084fc" : "#71717a", border: selectedTemplateId !== "custom" ? "1px solid rgba(168,85,247,0.3)" : "1px solid rgba(255,255,255,0.10)" }}
              onClick={() => setScreen("select")}>
              Change
            </span>
          </div>
          <p className="text-[10px] text-zinc-500 mt-0.5">Saved directly to the database</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-[12px] font-extrabold text-white transition-all active:scale-95 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)", boxShadow: "0 0 14px rgba(139,92,246,0.35)" }}>
          {saving ? (
            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <CheckCircle className="w-3.5 h-3.5" />
          )}
          {saving ? "Creating…" : "Create"}
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6 pb-32" style={{ scrollbarWidth: "none" }}>

        {/* ── Basic Info ── */}
        <div className="rounded-2xl p-4 space-y-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <SectionHead icon={AlignLeft} label="Basic Info" color="#a855f7" />
          <Field label="Match Title">
            <TextInput value={form.title} onChange={v => set("title", v)} placeholder="e.g. Friday Night Blitz" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Team Format">
              <SelectInput value={knockoutTeamFormat} options={TEAM_FORMATS} onChange={v => { setKnockoutTeamFormat(v); setMs("teamFormat", v); }} />
            </Field>
            <Field label="Status">
              <SelectInput value={form.status} options={STATUS_OPTIONS} onChange={v => set("status", v)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Map">
              <SelectInput value={form.map} options={MAPS} onChange={v => set("map", v)} />
            </Field>
            <Field label="Region">
              <SelectInput value={form.region} options={REGIONS} onChange={v => set("region", v)} />
            </Field>
          </div>
          <Field label="Estimated Duration">
            <SelectInput value={form.estimatedDuration} options={DURATIONS} onChange={v => set("estimatedDuration", v)} />
          </Field>
          <Field label="Description">
            <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={3}
              placeholder="Short description shown on the match card…"
              className="w-full px-3 py-2.5 rounded-xl text-[13px] text-white placeholder:text-zinc-600 focus:outline-none resize-none focus:ring-1 focus:ring-violet-500/40"
              style={inputStyle} />
          </Field>
        </div>

        {/* ── Schedule ── */}
        <div className="rounded-2xl p-4 space-y-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <SectionHead icon={Calendar} label="Schedule" color="#38bdf8" />

          {/* Date row */}
          <Field label="Date">
            <div className="flex gap-2 flex-wrap mb-1">
              {[0, 1, 2, 3].map(d => {
                const dt = new Date(); dt.setDate(dt.getDate() + d);
                const pad = (n: number) => String(n).padStart(2, "0");
                const val = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
                const label = d === 0 ? "Today" : d === 1 ? "Tomorrow" : dt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
                const active = form.startDate === val;
                return (
                  <button key={d} type="button" onClick={() => set("startDate", val)}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                    style={{
                      background: active ? "rgba(56,189,248,0.15)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${active ? "rgba(56,189,248,0.45)" : "rgba(255,255,255,0.08)"}`,
                      color: active ? "#7dd3fc" : "#52525b",
                    }}>{label}</button>
                );
              })}
            </div>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
              <input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)}
                className="w-full pl-8 pr-3 py-2.5 rounded-xl text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-sky-500/40"
                style={{ ...inputStyle, colorScheme: "dark" }} />
            </div>
          </Field>

          {/* Time slot entries — fully editable list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Session Times <span className="normal-case font-normal text-zinc-700">(all saved in 1 match)</span></p>
              <button type="button"
                onClick={() => set("slotEntries", DEFAULT_SLOT_ENTRIES.map(e => ({ ...e })))}
                className="text-[10px] font-bold text-zinc-500 px-2 py-0.5 rounded-lg transition-colors"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                Load 5 presets
              </button>
            </div>
            <div className="space-y-2">
              {(form.slotEntries ?? []).map((entry, idx) => {
                const pad2 = (n: number) => String(n).padStart(2, "0");
                const startVal = `${pad2(entry.hour)}:${pad2(entry.minute)}`;
                const endVal = `${pad2(entry.endHour ?? entry.hour)}:${pad2(entry.endMinute ?? entry.minute + 45)}`;
                const updateTime = (field: "start" | "end", raw: string) => {
                  const [h, m] = raw.split(":").map(Number);
                  const next = (form.slotEntries ?? []).map((en, i) => {
                    if (i !== idx) return en;
                    return field === "start"
                      ? { ...en, hour: isNaN(h) ? 0 : h, minute: isNaN(m) ? 0 : m }
                      : { ...en, endHour: isNaN(h) ? 0 : h, endMinute: isNaN(m) ? 0 : m };
                  });
                  set("slotEntries", next);
                };
                return (
                  <div key={idx} className="rounded-xl px-3.5 py-3"
                    style={{ background: "rgba(56,189,248,0.06)", border: "1.5px solid rgba(56,189,248,0.22)" }}>

                    {/* Row header */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-sky-400"
                          style={{ background: "rgba(56,189,248,0.18)" }}>{idx + 1}</span>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Slot {idx + 1}</span>
                      </span>
                      <button type="button"
                        onClick={() => set("slotEntries", (form.slotEntries ?? []).filter((_, i) => i !== idx))}
                        className="w-6 h-6 rounded-lg flex items-center justify-center transition-all active:scale-90"
                        style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
                        <X className="w-3 h-3 text-red-400" />
                      </button>
                    </div>

                    {/* Start / End time pickers side by side */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Start Time</p>
                        <div className="relative">
                          <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-sky-400 pointer-events-none" />
                          <input type="time" value={startVal}
                            onChange={e => updateTime("start", e.target.value)}
                            className="w-full pl-7 pr-2 py-2 rounded-xl text-[13px] font-extrabold text-sky-200 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
                            style={{ background: "rgba(56,189,248,0.10)", border: "1px solid rgba(56,189,248,0.30)", colorScheme: "dark" }} />
                        </div>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">End Time</p>
                        <div className="relative">
                          <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-amber-400 pointer-events-none" />
                          <input type="time" value={endVal}
                            onChange={e => updateTime("end", e.target.value)}
                            className="w-full pl-7 pr-2 py-2 rounded-xl text-[13px] font-extrabold text-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                            style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.28)", colorScheme: "dark" }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add slot button */}
            <button type="button"
              onClick={() => {
                const existing = form.slotEntries ?? [];
                const lastHour = existing.length > 0 ? existing[existing.length - 1].hour : 17;
                const newHour = Math.min(23, lastHour + 1);
                set("slotEntries", [...existing, { hour: newHour, minute: 0, endHour: newHour, endMinute: 45 }]);
              }}
              className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-[0.98]"
              style={{ background: "rgba(56,189,248,0.08)", border: "1.5px dashed rgba(56,189,248,0.30)", color: "#38bdf8" }}>
              <Plus className="w-3.5 h-3.5" /> Add Slot
            </button>

            {(form.slotEntries ?? []).length > 0 && (
              <p className="text-[10px] text-zinc-600 mt-2 px-1">
                {(form.slotEntries ?? []).length} session time{(form.slotEntries ?? []).length !== 1 ? "s" : ""} stored inside <span className="text-zinc-500">1 match</span>
                {form.startDate ? ` on ${new Date(form.startDate + "T12:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}` : ""}.
              </p>
            )}
          </div>

          {/* Registration close */}
          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Registration Closes</p>
            <div className="flex items-center gap-2 flex-wrap">
              {[5, 10, 15, 20, 30].map(mins => {
                const active = form.registrationCloseMinutes === mins;
                return (
                  <button key={mins} type="button" onClick={() => set("registrationCloseMinutes", mins)}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                    style={{
                      background: active ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.04)",
                      border: `1.5px solid ${active ? "rgba(251,191,36,0.50)" : "rgba(255,255,255,0.08)"}`,
                      color: active ? "#fbbf24" : "#52525b",
                    }}>{mins} min</button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-2 px-3 py-2.5 rounded-xl"
              style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)" }}>
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <p className="text-[11px] text-zinc-400">
                Booking closes <span className="text-amber-400 font-bold">{form.registrationCloseMinutes} minutes</span> before each slot starts. Players cannot join after this cutoff.
              </p>
            </div>
          </div>

          {/* Auto Delete */}
          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Auto Delete / Cancel</p>
            <div className="flex flex-col gap-2">
              {([
                { val: "none",          icon: "—",  label: "Disabled",              desc: "Never auto-delete. Admin handles deletion manually."                                            },
                { val: "if_empty",      icon: "0",  label: "If 0 players joined",    desc: "Silently cancel & refund if nobody registers by the cutoff time."                              },
                { val: "if_below_min",  icon: "<N", label: "Below minimum players",  desc: "Cancel if registered count is below a set minimum when registration closes."                   },
                { val: "after_slot",    icon: "⏱",  label: "After slot ends",        desc: "Auto-cancel X minutes after each slot's scheduled end time passes."                            },
              ] as const).map(opt => {
                const active = form.matchSettings.autoDeleteCondition === opt.val;
                return (
                  <button key={opt.val} type="button" onClick={() => setMs("autoDeleteCondition", opt.val)}
                    className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all active:scale-[0.99]"
                    style={{
                      background: active ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.025)",
                      border: `1.5px solid ${active ? "rgba(239,68,68,0.35)" : "rgba(255,255,255,0.07)"}`,
                    }}>
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black mt-0.5"
                      style={{ background: active ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.06)", color: active ? "#f87171" : "#52525b" }}>
                      {opt.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12px] font-bold ${active ? "text-white" : "text-zinc-400"}`}>{opt.label}</p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">{opt.desc}</p>
                    </div>
                    <div className="w-4 h-4 rounded-full border-2 shrink-0 mt-1 flex items-center justify-center"
                      style={{ borderColor: active ? "#f87171" : "rgba(255,255,255,0.2)", background: active ? "#f87171" : "transparent" }}>
                      {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Contextual input for "below minimum" */}
            {form.matchSettings.autoDeleteCondition === "if_below_min" && (
              <div className="mt-2.5 flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)" }}>
                <span className="text-[11px] text-zinc-400 shrink-0">Cancel if fewer than</span>
                <input
                  type="number" min={1} max={500}
                  value={form.matchSettings.autoDeleteMinValue}
                  onChange={e => setMs("autoDeleteMinValue", Math.max(1, Number(e.target.value)))}
                  className="w-16 text-center px-2 py-1.5 rounded-lg text-[12px] font-bold text-white focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}
                />
                <span className="text-[11px] text-zinc-400 shrink-0">players join</span>
              </div>
            )}

            {/* Contextual input for "after slot ends" */}
            {form.matchSettings.autoDeleteCondition === "after_slot" && (
              <div className="mt-2.5 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {[0, 5, 10, 15, 30, 60].map(mins => {
                    const active = form.matchSettings.autoDeleteMinValue === mins;
                    return (
                      <button key={mins} type="button" onClick={() => setMs("autoDeleteMinValue", mins)}
                        className="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                        style={{
                          background: active ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)",
                          border: `1.5px solid ${active ? "rgba(239,68,68,0.45)" : "rgba(255,255,255,0.08)"}`,
                          color: active ? "#f87171" : "#52525b",
                        }}>{mins === 0 ? "Immediately" : `+${mins} min`}</button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-red-400/70 px-0.5">
                  Match will be auto-cancelled {form.matchSettings.autoDeleteMinValue === 0 ? "as soon as" : `${form.matchSettings.autoDeleteMinValue} min after`} each slot's end time passes.
                </p>
              </div>
            )}

            {form.matchSettings.autoDeleteCondition !== "none" && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)" }}>
                <Trash2 className="w-3.5 h-3.5 text-red-400/70 shrink-0" />
                <p className="text-[10px] text-zinc-500">
                  When triggered: participants are refunded and the match is silently cancelled. Deletion mode follows the match's delete settings.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Card Display ── */}
        <div className="rounded-2xl p-4 space-y-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <SectionHead icon={Tag} label="Card Display" color="#f59e0b" />
          <Field label="Card Subtitle" hint="Shown below the title on match cards. Defaults to game mode if blank.">
            <TextInput value={form.shortTitle} onChange={v => set("shortTitle", v)} placeholder="e.g. Solo Showdown · Season 3" />
          </Field>
          <Field label="Status Badge Text" hint='Text on the badge in the top-left of the match card.'>
            <TextInput value={form.statusLabel} onChange={v => set("statusLabel", v)} placeholder='e.g. Open, Registering, Live…' />
          </Field>
          <div>
            <Label>Badge Colour</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {BADGE_COLORS.map(c => (
                <button key={c.id} type="button" onClick={() => set("statusColor", c.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                  style={{
                    background: form.statusColor === c.id ? `${c.hex}22` : "rgba(255,255,255,0.04)",
                    border: `1.5px solid ${form.statusColor === c.id ? c.hex : "rgba(255,255,255,0.10)"}`,
                    color: form.statusColor === c.id ? c.hex : "#71717a",
                  }}>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.hex }} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Banner Image ── */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <SectionHead icon={Image} label="Banner Image" color="#38bdf8" />
          {form.imageUrl ? (
            <div className="relative rounded-xl overflow-hidden" style={{ height: 130 }}>
              <img src={resolveImageUrl(form.imageUrl)} alt="preview" className="w-full h-full object-cover"
                onError={e => (e.currentTarget.style.display = "none")} />
              <button type="button" onClick={() => set("imageUrl", "")}
                className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.65)" }}>
                <X className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-1.5 rounded-xl h-28 cursor-pointer transition-colors"
              style={{ background: "rgba(255,255,255,0.03)", border: "1.5px dashed rgba(56,189,248,0.35)" }}>
              {uploading ? (
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#38bdf8", borderTopColor: "transparent" }} />
              ) : (
                <>
                  <Upload className="w-5 h-5 text-sky-400" />
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
          <TextInput value={form.imageUrl} onChange={v => set("imageUrl", v)} placeholder="https://…" />
        </div>

        {/* ── Prize Settings ── */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <SectionHead icon={Gem} label="Prize Settings" color="#eab308" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Entry Fee">
              <div className="relative">
                <Gem className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-400 pointer-events-none" />
                <input type="text" inputMode="numeric" value={form.entryFeeDiamonds}
                  onChange={e => set("entryFeeDiamonds", Number(e.target.value.replace(/[^0-9]/g, "")))}
                  className="w-full pl-8 pr-3 py-2.5 rounded-xl text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-yellow-500/30"
                  style={inputStyle} />
              </div>
            </Field>
            <Field label="Prize Pool">
              <div className="relative">
                <Star className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-yellow-400 pointer-events-none" />
                <input type="text" inputMode="numeric" value={form.prizePoolDiamonds}
                  onChange={e => set("prizePoolDiamonds", Number(e.target.value.replace(/[^0-9]/g, "")))}
                  className="w-full pl-8 pr-3 py-2.5 rounded-xl text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-yellow-500/30"
                  style={inputStyle} />
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Per Kill Bonus">
              <div className="relative">
                <Zap className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-400 pointer-events-none" />
                <input type="text" inputMode="numeric" value={form.perKillDiamonds}
                  onChange={e => set("perKillDiamonds", Number(e.target.value.replace(/[^0-9]/g, "")))}
                  className="w-full pl-8 pr-3 py-2.5 rounded-xl text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                  style={inputStyle} />
              </div>
            </Field>
            <Field label="Max Slots">
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                <input type="text" inputMode="numeric" value={form.maxSlots}
                  onChange={e => set("maxSlots", Number(e.target.value.replace(/[^0-9]/g, "")))}
                  className="w-full pl-8 pr-3 py-2.5 rounded-xl text-[13px] text-white focus:outline-none"
                  style={inputStyle} />
              </div>
            </Field>
          </div>
        </div>

        {/* ── Match Settings ── */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <SectionHead icon={Settings} label="Match Settings" color="#06b6d4" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Team Format">
              <SelectInput value={form.matchSettings.teamFormat} options={TEAM_FORMATS} onChange={v => { setMs("teamFormat", v); setKnockoutTeamFormat(v); }} />
            </Field>
            <Field label="Minimum Level">
              <TextInput value={form.matchSettings.minLevel} onChange={v => setMs("minLevel", Number(v))} type="number" />
            </Field>
          </div>
          <Field label="Rounds">
            <TextInput value={form.matchSettings.rounds} onChange={v => setMs("rounds", v)} placeholder="e.g. 9 (First to 5 wins)" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="HP">
              <TextInput value={form.matchSettings.hp} onChange={v => setMs("hp", Number(v))} type="number" />
            </Field>
            <Field label="EP">
              <TextInput value={form.matchSettings.ep} onChange={v => setMs("ep", Number(v))} type="number" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Movement Speed">
              <TextInput value={form.matchSettings.movementSpeed} onChange={v => setMs("movementSpeed", v)} placeholder="100%" />
            </Field>
            <Field label="Jump Height">
              <TextInput value={form.matchSettings.jumpHeight} onChange={v => setMs("jumpHeight", v)} placeholder="100%" />
            </Field>
          </div>
          <div className="space-y-2">
            <Toggle value={form.matchSettings.ammoLimit} onChange={v => setMs("ammoLimit", v)} label="Ammo Limit" />
            <Toggle value={form.matchSettings.gunAttributes} onChange={v => setMs("gunAttributes", v)} label="Gun Attributes" />
            <Toggle value={form.matchSettings.weaponSkins} onChange={v => setMs("weaponSkins", v)} label="Weapon Skins" />
            <Toggle value={form.matchSettings.onlyHeadshot} onChange={v => setMs("onlyHeadshot", v)} label="Only Headshot" />
            <Toggle value={form.matchSettings.emulators} onChange={v => setMs("emulators", v)} label="Emulators Allowed" />
          </div>
          <Field label="Win Logic" hint="How the auto-verify system decides the winner after the match">
            <div className="grid grid-cols-2 gap-2 mt-0.5">
              {[
                { val: "standard", icon: "⚔️", label: "Standard", desc: "Highest score wins" },
                { val: "healing_battle", icon: "💚", label: "Healing Battle", desc: "0 damage = win" },
              ].map(opt => {
                const active = (form.matchSettings.winLogic ?? "standard") === opt.val;
                return (
                  <button key={opt.val} type="button" onClick={() => setMs("winLogic", opt.val)}
                    className="flex flex-col gap-0.5 py-2.5 px-3 rounded-xl text-left transition-all active:scale-95"
                    style={{ background: active ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.04)", border: `1.5px solid ${active ? "rgba(168,85,247,0.45)" : "rgba(255,255,255,0.08)"}` }}>
                    <span className="text-base leading-none">{opt.icon}</span>
                    <span className="text-[11px] font-bold mt-1" style={{ color: active ? "#c084fc" : "#a1a1aa" }}>{opt.label}</span>
                    <span className="text-[9px] text-zinc-600">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </Field>
        </div>

        {/* ── Match Rules ── */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <SectionHead icon={Shield} label="Match Rules" color="#ef4444" />

          {activeRules.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {activeRules.map((rule, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)" }}>
                  <span className="text-[10px] font-bold text-red-400 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex-1 text-[12px] text-zinc-200 leading-snug">{rule}</span>
                  <button type="button" onClick={() => {
                    const updated = activeRules.filter((_, j) => j !== i);
                    set("rules", updated.join("\n"));
                  }} className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center hover:bg-red-500/20 transition-all" style={{ color: "#ef4444" }}>
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-zinc-600 italic px-1">No rules added yet. Pick from presets or add a custom rule.</p>
          )}

          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Preset Rules</p>
            <div className="flex flex-wrap gap-1.5">
              {RULE_TEMPLATES.map(rule => {
                const active = activeRules.includes(rule);
                return (
                  <button key={rule} type="button"
                    onClick={() => {
                      const updated = active ? activeRules.filter(r => r !== rule) : [...activeRules, rule];
                      set("rules", updated.join("\n"));
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-95"
                    style={{
                      background: active ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.05)",
                      border: active ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(255,255,255,0.09)",
                      color: active ? "#fca5a5" : "#71717a",
                    }}>
                    {active && <CheckCircle className="w-2.5 h-2.5 shrink-0" />}
                    {rule}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Custom Rule</p>
            <div className="flex gap-2">
              <input type="text" value={customRuleInput} onChange={e => setCustomRuleInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const trimmed = customRuleInput.trim();
                    if (!trimmed) return;
                    if (!activeRules.includes(trimmed)) set("rules", [...activeRules, trimmed].join("\n"));
                    setCustomRuleInput("");
                  }
                }}
                placeholder="Type a custom rule and press Add…"
                className="flex-1 px-3 py-2.5 rounded-xl text-[13px] text-white placeholder:text-zinc-600 focus:outline-none"
                style={inputStyle} />
              <button type="button"
                onClick={() => {
                  const trimmed = customRuleInput.trim();
                  if (!trimmed) return;
                  if (!activeRules.includes(trimmed)) set("rules", [...activeRules, trimmed].join("\n"));
                  setCustomRuleInput("");
                }}
                className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-bold text-white transition-all active:scale-95"
                style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)" }}>
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>
        </div>

        {/* ── Create button (bottom) ── */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-[14px] font-extrabold text-white transition-all active:scale-[0.98] disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)", boxShadow: "0 0 20px rgba(139,92,246,0.3)" }}>
          {saving ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Swords className="w-4 h-4" />
          )}
          {saving ? "Creating Match…" : "Create Knockout Match"}
        </button>

        <div className="h-4" />
      </div>
    </div>
  );
}
