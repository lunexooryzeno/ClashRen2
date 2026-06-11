import { useAuth } from "@/lib/auth";
import { Link } from "wouter";
import { ArrowLeft, Share2, Copy, Check, User } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useRef, useState, useEffect } from "react";

function makeReferralCode(uid?: string): string {
  if (!uid) return "CZ——————";
  const digits = uid.replace(/\D/g, "");
  const seed = parseInt(digits.slice(-6) || "0", 10);
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const a = alpha[seed % alpha.length];
  const b = alpha[Math.floor(seed / alpha.length) % alpha.length];
  const num = String(seed).slice(-4).padStart(4, "0");
  return `CZ${a}${b}${num}`;
}

export default function ProfileQrPage() {
  const { user } = useAuth();
  const cardRef = useRef<HTMLDivElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    setAvatarUrl(localStorage.getItem(`clash-ren:avatar:${user.id}`));
  }, [user?.id]);

  const profileUrl = `${window.location.origin}/#/landing`;
  const referralCode = makeReferralCode(user?.uid);

  const qrPayload = JSON.stringify({
    app: "clash-zen",
    uid: user?.uid,
    ref: referralCode,
    name: user?.inGameName,
    url: profileUrl,
  });

  function copyCode() {
    navigator.clipboard.writeText(referralCode).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  }

  function copyLink() {
    navigator.clipboard.writeText(`${profileUrl}?ref=${referralCode}`).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join me on Clash Ren`,
          text: `Use my referral code ${referralCode} on Clash Ren!`,
          url: `${profileUrl}?ref=${referralCode}`,
        });
      } catch { /* user cancelled */ }
    } else {
      copyLink();
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col profile-page-bg">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-4 relative z-10">
        <Link href="/profile">
          <button className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
        </Link>
        <div>
          <h1 className="font-heading text-lg font-bold text-foreground tracking-tight">Refer & Earn</h1>
          <p className="text-xs text-muted-foreground">Share your code · Earn rewards</p>
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center px-6 pb-8">
        <div
          ref={cardRef}
          className="w-full max-w-sm rounded-3xl overflow-hidden relative"
          style={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--primary) / 0.25)",
            boxShadow: "0 12px 48px rgba(0,0,0,0.45)",
          }}
        >
          {/* Top accent */}
          <div className="h-1.5 w-full btn-primary-gradient" />

          {/* Profile */}
          <div className="flex flex-col items-center pt-7 pb-4 px-6">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-primary/40 bg-zinc-900 mb-2.5">
              {avatarUrl
                ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                    <User className="w-8 h-8 text-zinc-500" strokeWidth={1.5} />
                  </div>
              }
            </div>
            <h2 className="font-heading text-lg font-bold text-foreground tracking-tight mb-0.5">
              {user?.inGameName ?? "Player"}
            </h2>
            <p className="text-[11px] text-muted-foreground font-mono">UID · {user?.uid ?? "—"}</p>
          </div>

          {/* Referral code block */}
          <div className="mx-5 mb-5 rounded-2xl px-4 py-3.5 flex items-center justify-between"
            style={{ background: "hsl(var(--primary)/0.08)", border: "1px solid hsl(var(--primary)/0.22)" }}>
            <div>
              <p className="text-[10px] text-primary/60 uppercase tracking-widest font-bold mb-0.5">Referral Code</p>
              <p className="font-heading text-2xl font-bold text-primary tracking-widest">{referralCode}</p>
            </div>
            <button
              onClick={copyCode}
              className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-transform shrink-0"
              style={{ background: "hsl(var(--primary)/0.15)", border: "1px solid hsl(var(--primary)/0.3)" }}>
              {codeCopied
                ? <Check className="w-4 h-4 text-emerald-400" />
                : <Copy className="w-4 h-4 text-primary" />
              }
            </button>
          </div>

          {/* QR code */}
          <div className="mx-auto mb-5 p-3.5 rounded-2xl w-fit bg-white">
            <QRCodeSVG value={qrPayload} size={180} level="M" bgColor="#ffffff" fgColor="#000000" />
          </div>

          {/* Footer brand */}
          <div className="text-center pb-5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Clash Ren</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">Scan to join with my code</p>
          </div>

          {/* Actions */}
          <div className="px-5 pb-6 grid grid-cols-2 gap-3">
            <button
              onClick={handleShare}
              className="h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm btn-primary-gradient text-white active:scale-95 transition-transform"
              data-testid="btn-share-qr">
              <Share2 className="w-4 h-4" /> Share
            </button>
            <button
              onClick={copyLink}
              className="h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm active:scale-95 transition-transform"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid hsl(var(--primary)/0.3)", color: linkCopied ? "#34d399" : "inherit" }}>
              {linkCopied
                ? <><Check className="w-4 h-4" /> Copied!</>
                : <><Copy className="w-4 h-4 text-primary" /> Copy Link</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
