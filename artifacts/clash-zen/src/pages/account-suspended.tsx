import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ShieldX, Ban, Trash2, MessageCircle, ChevronRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const WHATSAPP_NUMBER = "919999999999";

interface SuspendedData {
  suspended: boolean;
  status: "blocked" | "deleted";
  reason: string | null;
  blockedUntil: string | null;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  } catch { return ""; }
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export default function AccountSuspendedPage() {
  const [, setLocation] = useLocation();
  const [data, setData] = useState<SuspendedData | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("czAccountSuspended");
    if (!raw) { setLocation("/get-started"); return; }
    try {
      setData(JSON.parse(raw) as SuspendedData);
    } catch { setLocation("/get-started"); }
  }, [setLocation]);

  if (!data) return null;

  const isBlocked = data.status === "blocked";
  const isDeleted = data.status === "deleted";

  const waMessage = encodeURIComponent(
    isBlocked
      ? "Hi Clash Ren Support, my account has been blocked. I'd like to appeal this decision."
      : "Hi Clash Ren Support, my account was moved to the bin. I'd like to restore it or understand why."
  );

  return (
    <div className="min-h-[100dvh] bg-[#0a0612] flex flex-col relative overflow-hidden">
      {/* Ambient glow */}
      <div className={cn(
        "pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-[120px] opacity-30",
        isBlocked ? "bg-orange-600" : "bg-red-700"
      )} />

      {/* Back button */}
      <div className="relative z-10 px-4 pt-5">
        <button
          onClick={() => setLocation("/get-started")}
          className="flex items-center gap-1.5 text-zinc-500 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to login
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10 -mt-12">
        {/* Icon */}
        <div className={cn(
          "w-20 h-20 rounded-3xl flex items-center justify-center mb-6",
          isBlocked
            ? "bg-orange-500/15 border border-orange-500/30 shadow-[0_0_40px_rgba(249,115,22,0.2)]"
            : "bg-red-500/15 border border-red-500/30 shadow-[0_0_40px_rgba(239,68,68,0.2)]"
        )}>
          {isBlocked
            ? <Ban className="w-10 h-10 text-orange-400" strokeWidth={1.5} />
            : <Trash2 className="w-10 h-10 text-red-400" strokeWidth={1.5} />
          }
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-white text-center font-heading mb-1">
          {isBlocked ? "Account Blocked" : "Account Deleted"}
        </h1>
        <p className={cn(
          "text-sm font-semibold text-center mb-6",
          isBlocked ? "text-orange-400" : "text-red-400"
        )}>
          {isBlocked ? "Your access has been restricted" : "This account has been removed"}
        </p>

        {/* Info card */}
        <div className="w-full max-w-sm rounded-2xl p-5 flex flex-col gap-4 mb-6"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>

          {/* Status badge */}
          <div className="flex items-center gap-2">
            <ShieldX className="w-4 h-4 text-zinc-500 shrink-0" />
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Status</span>
            <span className={cn(
              "ml-auto text-xs font-bold px-2.5 py-1 rounded-full",
              isBlocked ? "bg-orange-500/20 text-orange-300 border border-orange-500/30" : "bg-red-500/20 text-red-300 border border-red-500/30"
            )}>
              {isBlocked ? "BLOCKED" : "DELETED"}
            </span>
          </div>

          {/* Reason */}
          {data.reason && (
            <div className="flex flex-col gap-1.5 pt-1 border-t border-white/6">
              <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Reason from clash zen support team</span>
              <p className="text-sm text-zinc-300 leading-relaxed">{data.reason}</p>
            </div>
          )}
          {!data.reason && (
            <div className="flex flex-col gap-1.5 pt-1 border-t border-white/6">
              <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Reason from clash zen support team</span>
              <p className="text-sm text-zinc-500 italic">No reason provided</p>
            </div>
          )}

          {/* Blocked until */}
          {isBlocked && data.blockedUntil && (
            <div className="flex items-center gap-2 pt-1 border-t border-white/6">
              <span className="text-xs text-zinc-500 flex-1">Blocked until</span>
              <span className="text-xs font-bold text-orange-300">{fmtDate(data.blockedUntil)}</span>
            </div>
          )}
          {isBlocked && !data.blockedUntil && (
            <div className="flex items-center gap-2 pt-1 border-t border-white/6">
              <span className="text-xs text-zinc-500 flex-1">Duration</span>
              <span className="text-xs font-bold text-orange-300">Indefinite</span>
            </div>
          )}
        </div>

        {/* Contact support */}
        <div className="w-full max-w-sm flex flex-col gap-3">
          <p className="text-xs text-zinc-600 text-center uppercase tracking-widest font-bold">Contact Support</p>

          {/* WhatsApp */}
          <button
            onClick={() => window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${waMessage}`, "_blank")}
            className="w-full flex items-center gap-4 p-4 rounded-2xl active:scale-[0.98] transition-all text-left"
            style={{ background: "rgba(37,211,102,0.10)", border: "1px solid rgba(37,211,102,0.25)", boxShadow: "0 4px 24px rgba(37,211,102,0.12)" }}
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-[#25D366]"
              style={{ background: "rgba(37,211,102,0.15)", border: "1px solid rgba(37,211,102,0.25)" }}>
              <WhatsAppIcon />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Chat on WhatsApp</p>
              <p className="text-[11px] text-zinc-500">Fastest response · Appeal your case</p>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
          </button>

          {/* In-app support (opens get-started first since they're logged out) */}
          <button
            onClick={() => window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hi Clash Ren Support, I need help with my account.")}`, "_blank")}
            className="w-full flex items-center gap-4 p-4 rounded-2xl active:scale-[0.98] transition-all text-left"
            style={{ background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.20)", boxShadow: "0 4px 24px rgba(56,189,248,0.08)" }}
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-sky-400"
              style={{ background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.20)" }}>
              <MessageCircle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">In-App Support</p>
              <p className="text-[11px] text-zinc-500">Chat directly with our team</p>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
          </button>
        </div>

        <p className="mt-8 text-[10px] text-zinc-700 text-center max-w-xs">
          Support available daily · 9 AM – 11 PM IST
        </p>
      </div>
    </div>
  );
}
