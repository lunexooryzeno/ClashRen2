import { Eye, LogIn, UserPlus } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";

interface GuestAccessPromptProps {
  title?: string;
  description?: string;
  onContinue?: () => void;
  redirectPath?: string;
}

export function saveGuestRedirect(path: string): void {
  if (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("://") &&
    path !== "/landing" &&
    path !== "/get-started"
  ) {
    sessionStorage.setItem("redirectAfterLogin", path);
  }
}

export function GuestAccessPrompt({
  title = "This feature needs an account",
  description = "Create your ClashRen account to enter matches, manage your wallet, and compete for rewards.",
  onContinue,
  redirectPath,
}: GuestAccessPromptProps) {
  const [location, navigate] = useLocation();
  const { logout } = useAuth();

  const openAuth = () => {
    saveGuestRedirect(redirectPath ?? location);
    logout();
    navigate("/get-started");
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-black px-6 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.04] p-7 text-center shadow-2xl shadow-black/50">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-500/25 bg-orange-500/10">
          <UserPlus className="h-6 w-6 text-orange-400" />
        </div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-orange-400">
          Guest exploration
        </p>
        <h1 className="font-heading text-2xl font-bold text-white">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">{description}</p>
        <div className="mt-7 flex flex-col gap-3">
          <button
            type="button"
            onClick={openAuth}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-white shadow-[0_0_20px_hsl(var(--primary)/0.3)] transition hover:bg-primary/90 active:scale-[0.98]"
          >
            <UserPlus className="h-4 w-4" />
            Create Account
          </button>
          <button
            type="button"
            onClick={openAuth}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-5 text-sm font-bold text-zinc-200 transition hover:bg-white/[0.08] active:scale-[0.98]"
          >
            <LogIn className="h-4 w-4 text-zinc-400" />
            Sign In
          </button>
          {onContinue && (
            <button
              type="button"
              onClick={onContinue}
              className="mt-1 flex h-10 items-center justify-center gap-2 text-xs font-medium text-zinc-500 transition hover:text-zinc-200"
            >
              <Eye className="h-3.5 w-3.5" />
              Continue Exploring
            </button>
          )}
        </div>
      </div>
    </div>
  );
}