import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, MessageCircle, Mail, ChevronRight, Shield, X, Sparkles, User, Clock, Zap } from "lucide-react";

interface SupportSettings {
  whatsappNumber: string;
  email: string;
  availableHours: string;
}

const DEFAULTS: SupportSettings = {
  whatsappNumber: "919999999999",
  email: "support@clashren.in",
  availableHours: "9 AM – 11 PM IST",
};

export default function SupportPage() {
  const [settings, setSettings]   = useState<SupportSettings>(DEFAULTS);
  const [showModes, setShowModes] = useState(false);
  const [, navigate]              = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const cached = sessionStorage.getItem("cz:support-settings");
    if (cached) { try { setSettings(JSON.parse(cached)); } catch {} }
    fetch("/api/support-settings")
      .then(r => r.ok ? r.json() : null)
      .then((s: SupportSettings | null) => {
        if (s) { setSettings(s); sessionStorage.setItem("cz:support-settings", JSON.stringify(s)); }
      })
      .catch(() => {});
  }, []);

  const OPTIONS = [
    {
      id: "in-app",
      icon: <MessageCircle className="w-6 h-6" />,
      label: "In-App Chat",
      sub: "Fastest · Chat directly with support",
      badge: "FASTEST",
      badgeColor: "text-emerald-400",
      badgeBg: "rgba(16,185,129,0.15)",
      badgeBorder: "rgba(16,185,129,0.3)",
      color: "text-sky-400",
      bg: "rgba(56,189,248,0.10)",
      border: "rgba(56,189,248,0.25)",
      glow: "rgba(56,189,248,0.15)",
      action: () => setShowModes(true),
    },
    {
      id: "whatsapp",
      icon: (
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      ),
      label: "Chat on WhatsApp",
      sub: "Opens WhatsApp · may take some time",
      color: "text-[#25D366]",
      bg: "rgba(37,211,102,0.10)",
      border: "rgba(37,211,102,0.25)",
      glow: "rgba(37,211,102,0.18)",
      action: () => window.open(`https://wa.me/${settings.whatsappNumber}?text=Hi%20Clash%20Ren%20Support!`, "_blank"),
    },
    {
      id: "email",
      icon: <Mail className="w-6 h-6" />,
      label: "Email Support",
      sub: `${settings.email} · reply within 24 hrs`,
      color: "text-primary",
      bg: "rgba(234,88,12,0.10)",
      border: "rgba(234,88,12,0.25)",
      glow: "rgba(234,88,12,0.15)",
      action: () => window.open(`mailto:${settings.email}?subject=Clash%20Ren%20Support`, "_blank"),
    },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col relative profile-page-bg">
      <div className="absolute top-0 right-0 w-72 h-72 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(56,189,248,0.07) 0%, transparent 70%)" }} />
      <div className="absolute bottom-0 left-0 w-60 h-60 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, hsl(var(--primary)/0.07) 0%, transparent 70%)" }} />

      <div className="h-1 w-full btn-primary-gradient" />

      {/* Mode picker bottom sheet */}
      {showModes && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowModes(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-t-3xl overflow-hidden"
            style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={e => e.stopPropagation()}>

            {/* Sheet handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/15" />
            </div>

            {/* Sheet header */}
            <div className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="font-heading font-bold text-base text-foreground">In-App Chat</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">Choose who you'd like to chat with</p>
              </div>
              <button
                onClick={() => setShowModes(false)}
                className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            <div className="px-5 pb-6 flex flex-col gap-3 mt-1">

              {/* AI — Coming Soon */}
              <div
                className="relative rounded-2xl p-4 flex items-center gap-4 overflow-hidden opacity-60"
                style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)" }}>
                <div className="absolute inset-0 opacity-30 pointer-events-none"
                  style={{ background: "repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(139,92,246,0.04) 6px, rgba(139,92,246,0.04) 12px)" }} />
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 relative z-10"
                  style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}>
                  <Sparkles className="w-6 h-6 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0 relative z-10">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-sm text-foreground">Ask Clash Ren AI</p>
                    <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md"
                      style={{ background: "rgba(139,92,246,0.25)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.4)" }}>
                      Coming Soon
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Instant AI answers to common questions</p>
                  <div className="flex items-center gap-1 mt-1.5">
                    <Zap className="w-3 h-3 text-violet-400/60" />
                    <span className="text-[10px] text-violet-400/60 font-semibold">24/7 · Instant replies</span>
                  </div>
                </div>
              </div>

              {/* Human support */}
              <button
                onClick={() => { setShowModes(false); navigate("/chat"); }}
                className="rounded-2xl p-4 flex items-center gap-4 text-left active:scale-[0.98] transition-all"
                style={{ background: "rgba(56,189,248,0.07)", border: "1px solid rgba(56,189,248,0.25)", boxShadow: "0 4px 20px rgba(56,189,248,0.08)" }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(56,189,248,0.15)", border: "1px solid rgba(56,189,248,0.3)" }}>
                  <User className="w-6 h-6 text-sky-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-foreground">Chat with Human Support</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Real person handles your issue</p>
                  <div className="flex items-center gap-1 mt-1.5">
                    <Clock className="w-3 h-3 text-yellow-400/80" />
                    <span className="text-[10px] text-yellow-400/80 font-semibold">Replies may take some time</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
              </button>

              {/* Tip */}
              <div className="rounded-xl px-3.5 py-2.5 flex items-start gap-2"
                style={{ background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.15)" }}>
                <Clock className="w-3.5 h-3.5 text-yellow-400/70 shrink-0 mt-0.5" />
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Human support replies may not be immediate. We'll get back to you as soon as possible.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-4 pt-5 pb-2 relative z-10">
        <button
          onClick={() => navigate("/")}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <span className="text-[11px] text-muted-foreground uppercase tracking-[0.18em] font-bold">Support</span>
        <div className="w-9 h-9" />
      </div>

      <div className="px-4 pt-4 pb-2 relative z-10 flex flex-col items-center text-center gap-3">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.25)", boxShadow: "0 0 32px rgba(56,189,248,0.15)" }}>
          <Shield className="w-8 h-8 text-sky-400" strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="font-heading text-xl font-bold text-foreground">How can we help?</h2>
          <p className="text-sm text-zinc-500 mt-1">Choose your preferred way to reach us</p>
        </div>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-3 relative z-10">
        {OPTIONS.map((opt) => {
          const badge = (opt as { badge?: string }).badge;
          const inner = (
            <div
              className="w-full flex items-center gap-4 p-4 rounded-3xl active:scale-[0.98] transition-all text-left"
              style={{ background: opt.bg, border: `1px solid ${opt.border}`, boxShadow: `0 4px 24px ${opt.glow}` }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: opt.bg, border: `1px solid ${opt.border}` }}>
                <span className={opt.color}>{opt.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-base font-bold text-foreground">{opt.label}</p>
                  {badge && (
                    <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0"
                      style={{
                        background: (opt as { badgeBg?: string }).badgeBg ?? "rgba(16,185,129,0.15)",
                        color: (opt as { badgeColor?: string }).badgeColor ?? "#34d399",
                        border: `1px solid ${(opt as { badgeBorder?: string }).badgeBorder ?? "rgba(16,185,129,0.3)"}`,
                      }}>
                      {badge}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{opt.sub}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </div>
          );

          return (
            <button key={opt.id} onClick={opt.action} className="w-full text-left">
              {inner}
            </button>
          );
        })}
      </div>

    </div>
  );
}
