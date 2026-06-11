import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, MessageCircle, Mail, ChevronRight, Shield } from "lucide-react";

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
  const [settings, setSettings] = useState<SupportSettings>(DEFAULTS);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const cached = sessionStorage.getItem("cz:support-settings");
    if (cached) {
      try { setSettings(JSON.parse(cached)); } catch {}
    }
    fetch("/api/support-settings")
      .then(r => r.ok ? r.json() : null)
      .then((s: SupportSettings | null) => {
        if (s) {
          setSettings(s);
          sessionStorage.setItem("cz:support-settings", JSON.stringify(s));
        }
      })
      .catch(() => {});
  }, []);

  const OPTIONS = [
    {
      id: "whatsapp",
      icon: (
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      ),
      label: "Chat on WhatsApp",
      sub: "Fastest response",
      color: "text-[#25D366]",
      bg: "rgba(37,211,102,0.10)",
      border: "rgba(37,211,102,0.25)",
      glow: "rgba(37,211,102,0.18)",
      action: () => window.open(`https://wa.me/${settings.whatsappNumber}?text=Hi%20Clash%20Zen%20Support!`, "_blank"),
    },
    {
      id: "in-app",
      icon: <MessageCircle className="w-6 h-6" />,
      label: "In-App Chat",
      sub: "Chat directly with our support team",
      color: "text-sky-400",
      bg: "rgba(56,189,248,0.10)",
      border: "rgba(56,189,248,0.25)",
      glow: "rgba(56,189,248,0.15)",
      href: "/chat",
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
      action: () => window.open(`mailto:${settings.email}?subject=Clash%20Zen%20Support`, "_blank"),
    },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col relative profile-page-bg">
      <div className="absolute top-0 right-0 w-72 h-72 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(56,189,248,0.07) 0%, transparent 70%)" }} />
      <div className="absolute bottom-0 left-0 w-60 h-60 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, hsl(var(--primary)/0.07) 0%, transparent 70%)" }} />

      <div className="h-1 w-full btn-primary-gradient" />

      <div className="flex items-center justify-between px-4 pt-5 pb-2 relative z-10">
        <button
          onClick={() => window.history.back()}
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
          const inner = (
            <div
              className="w-full flex items-center gap-4 p-4 rounded-3xl active:scale-[0.98] transition-all text-left"
              style={{
                background: opt.bg,
                border: `1px solid ${opt.border}`,
                boxShadow: `0 4px 24px ${opt.glow}`,
              }}
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: opt.bg, border: `1px solid ${opt.border}` }}>
                <span className={opt.color}>{opt.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-foreground">{opt.label}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{opt.sub}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </div>
          );

          if ("href" in opt && opt.href) {
            return (
              <Link key={opt.id} href={opt.href} className="block">
                {inner}
              </Link>
            );
          }
          return (
            <button key={opt.id} onClick={(opt as { action: () => void }).action} className="w-full">
              {inner}
            </button>
          );
        })}
      </div>

      <div className="px-4 pt-6 relative z-10">
        <p className="text-center text-[11px] text-zinc-600 leading-relaxed">
          Our support team is available daily · {settings.availableHours}
        </p>
      </div>
    </div>
  );
}
