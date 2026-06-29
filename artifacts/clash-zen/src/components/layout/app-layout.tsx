import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Home, Trophy, CalendarDays, Clock, User, Shield, Gem, Plus, Bell, KeyRound } from "lucide-react";
import { PushPrompt } from "@/components/push-prompt";
import { BackgroundMotion } from "@/components/background-motion";
import { cn } from "@/lib/utils";
import { useState, useLayoutEffect, useEffect, useRef, useCallback, memo } from "react";
import { getUnreadCount } from "@/lib/notifications";
import { haptic } from "@/lib/haptics";
import { Link } from "wouter";

const NAV_ROUTES = ["/", "/matches", "/leaderboard", "/history", "/profile"];

function getNavIndex(path: string): number {
  const exact = NAV_ROUTES.indexOf(path);
  if (exact !== -1) return exact;
  for (let i = NAV_ROUTES.length - 1; i >= 0; i--) {
    if (NAV_ROUTES[i] !== "/" && path.startsWith(NAV_ROUTES[i])) return i;
  }
  return -1;
}

function getDirection(from: string, to: string): "from-right" | "from-left" {
  const fromIdx = getNavIndex(from);
  const toIdx = getNavIndex(to);
  if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
    return toIdx > fromIdx ? "from-right" : "from-left";
  }
  if (fromIdx === -1 && toIdx !== -1) return "from-left";
  if (to.length < from.length) return "from-left";
  return "from-right";
}

export const TopBar = memo(function TopBar() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const prevBalanceRef = useRef<number | null>(null);
  const [walletFlash, setWalletFlash] = useState(false);
  const [walletDelta, setWalletDelta] = useState<number | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getUnreadCount().then(setUnread);
    const interval = setInterval(() => getUnreadCount().then(setUnread), 30000);
    return () => clearInterval(interval);
  }, []);

  // Animate when diamond balance increases (reward received)
  useEffect(() => {
    const balance = user?.diamondBalance ?? 0;
    if (prevBalanceRef.current !== null && balance > prevBalanceRef.current) {
      const diff = balance - prevBalanceRef.current;
      setWalletDelta(diff);
      setWalletFlash(true);
      haptic.softTap();
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => {
        setWalletFlash(false);
        setWalletDelta(null);
      }, 900);
    }
    prevBalanceRef.current = balance;
    return () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); };
  }, [user?.diamondBalance]);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-end justify-between px-4"
      style={{
        height: "calc(4rem + env(safe-area-inset-top))",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "0.5rem",
        background: "var(--nav-bg)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center gap-2.5">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-red-600/30 blur-[8px]" />
          <img
            src="/icons/logo.png"
            alt="Clash Ren Logo"
            className="relative w-8 h-8 rounded-lg object-contain"
            loading="eager"
            fetchPriority="high"
            decoding="sync"
          />
        </div>
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontStyle: "italic", fontSize: "1.2rem", letterSpacing: "0.04em" }}>
          <span style={{ background: "linear-gradient(180deg,#fff 0%,#aaa 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CLASH </span><span style={{ color: "#e01010" }}>REN</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        {user?.isAdmin && (
          <Link href="/#/286c81443d1fb388d1b9a8e3b280824c/manage-keys">
            <button className="p-2 rounded-xl bg-white/5 border border-white/8 hover:bg-white/10 transition-colors" title="Manage API Keys">
              <KeyRound className="w-4 h-4 text-amber-400" />
            </button>
          </Link>
        )}
        {user?.isAdmin && (
          <Link href="/admin">
            <button className="p-2 rounded-xl bg-white/5 border border-white/8 hover:bg-white/10 transition-colors" data-testid="link-admin">
              <Shield className="w-4 h-4 text-primary" />
            </button>
          </Link>
        )}

        <Link href="/notifications">
          <button className="relative w-9 h-9 rounded-xl bg-white/5 border border-white/8 hover:bg-white/10 transition-colors flex items-center justify-center" data-testid="link-notifications">
            <Bell className="w-4 h-4 text-zinc-400" strokeWidth={1.8} />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-primary flex items-center justify-center px-0.5 text-[9px] font-bold text-white shadow-[0_0_8px_hsl(var(--primary)/0.7)]">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        </Link>

        <Link href="/top-up">
          <div
            className="flex items-center rounded-xl overflow-hidden cursor-pointer transition-colors"
            style={{
              background: walletFlash ? "rgba(30,40,60,0.95)" : "rgba(10,10,10,0.9)",
              border: walletFlash
                ? "1px solid rgba(96,165,250,0.55)"
                : "1px solid rgba(96,165,250,0.25)",
              boxShadow: walletFlash
                ? "0 0 16px rgba(96,165,250,0.35)"
                : "none",
              transition: "border-color 0.2s, box-shadow 0.2s, background 0.2s",
            }}
            data-testid="display-diamond-balance"
          >
            <div className="flex items-center gap-1.5 px-3 py-1.5 relative">
              <Gem
                className="w-3.5 h-3.5 text-blue-400"
                strokeWidth={2}
                style={walletFlash ? {
                  animation: "wallet-gem-burst 0.65s ease-out both",
                  willChange: "transform, filter",
                } : undefined}
              />
              <span
                className="text-sm font-bold text-white tabular-nums"
                style={walletFlash ? {
                  animation: "wallet-num-pop 0.65s ease-out both",
                  willChange: "transform",
                } : undefined}
              >
                {user?.diamondBalance ?? 0}
              </span>

              {/* Floating "+X" delta indicator */}
              {walletDelta !== null && (
                <span
                  className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold text-blue-300 whitespace-nowrap pointer-events-none"
                  style={{
                    animation: "wallet-delta-up 0.85s ease-out both",
                    willChange: "transform, opacity",
                    textShadow: "0 0 8px rgba(96,165,250,0.8)",
                  }}
                >
                  +{walletDelta}
                </span>
              )}
            </div>
            <div className="w-px h-5 bg-blue-500/20" />
            <div className="px-2.5 py-1.5 flex items-center justify-center">
              <Plus className="w-3.5 h-3.5 text-blue-400" strokeWidth={2.5} />
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
});

export function BottomNav() {
  const [location, navigate] = useLocation();

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/matches", icon: CalendarDays, label: "Matches" },
    { href: "/leaderboard", icon: Trophy, label: "Rank" },
    { href: "/history", icon: Clock, label: "History" },
    { href: "/profile", icon: User, label: "Profile" },
  ];

  const activeIdx = navItems.findIndex(item =>
    item.href === "/" ? location === "/" : location.startsWith(item.href)
  );
  const pillIdx = activeIdx >= 0 ? activeIdx : 0;

  return (
    <div
        id="bottom-nav"
        className="fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))", transition: "transform 0.32s cubic-bezier(0.4,0,0.2,1)", willChange: "transform" }}
      >
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{
          height: "calc(110px + env(safe-area-inset-bottom))",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          maskImage: "linear-gradient(to top, black 40%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to top, black 40%, transparent 100%)",
        }}
      />
      <div
        className="absolute inset-x-0 pointer-events-none"
        style={{
          bottom: "calc(max(1.25rem, env(safe-area-inset-bottom)) + 32px)",
          height: "48px",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          maskImage: "linear-gradient(to bottom, transparent 0%, black 60%, black 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 60%, black 100%)",
        }}
      />
      <nav
        className="pointer-events-auto flex items-center w-full max-w-sm rounded-[32px] relative overflow-hidden"
        style={{
          background: "var(--bottom-nav-bg)",
          backdropFilter: "blur(28px)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset",
          height: 64,
        }}
      >
        {navItems.map((item, idx) => {
          const isActive = activeIdx === idx;
          return (
            <button
              key={item.href}
              onClick={() => {
                if (location !== item.href) haptic.softTap();
                navigate(item.href);
              }}
              className="flex-1 flex flex-col items-center justify-center h-full gap-1 group transition-all duration-200 relative z-10"
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              {/* Subtle icon glow when active */}
              {isActive && (
                <div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: 36, height: 36,
                    top: "50%", left: "50%",
                    transform: "translate(-50%, -60%)",
                    background: "radial-gradient(circle, hsl(var(--primary)/0.18) 0%, transparent 70%)",
                    filter: "blur(6px)",
                  }}
                />
              )}
              <item.icon
                className={cn(
                  "w-5 h-5 transition-all duration-200 relative",
                  isActive ? "text-primary" : "text-zinc-600 group-hover:text-zinc-400"
                )}
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <span
                className={cn(
                  "text-[10px] font-medium transition-colors duration-200",
                  isActive ? "text-primary font-bold" : "text-zinc-600 group-hover:text-zinc-400"
                )}
              >
                {item.label}
              </span>
              {/* Active dot indicator */}
              <div
                className="absolute bottom-2 rounded-full transition-all duration-300"
                style={{
                  width: isActive ? 16 : 4,
                  height: 2.5,
                  background: isActive ? "hsl(var(--primary))" : "transparent",
                  boxShadow: isActive ? "0 0 6px hsl(var(--primary)/0.7)" : "none",
                  opacity: isActive ? 1 : 0,
                }}
              />
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [location, navigate] = useLocation();
  const [animKey, setAnimKey] = useState(0);
  const [animDir, setAnimDir] = useState<"from-right" | "from-left" | null>(null);

  const prevPathRef = useRef(location);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // Direction-aware transition on every route change — fires before paint
  useLayoutEffect(() => {
    const from = prevPathRef.current;
    const to = location;
    if (from === to) return;
    prevPathRef.current = to;

    const dir = getDirection(from, to);
    setAnimDir(dir);
    setAnimKey(k => k + 1);
  }, [location]);

  // Clear animation class after it finishes
  useEffect(() => {
    if (!animDir) return;
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    animTimerRef.current = setTimeout(() => setAnimDir(null), 220);
    return () => {
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
    };
  }, [animDir]);

  // Swipe navigation — just navigate; useLayoutEffect handles the animation
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (location === "/") return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.8) return;

    const currentIdx = getNavIndex(location);
    if (currentIdx === -1) return;

    let targetIdx = -1;
    if (dx < 0 && currentIdx < NAV_ROUTES.length - 1) targetIdx = currentIdx + 1;
    if (dx > 0 && currentIdx > 0) targetIdx = currentIdx - 1;
    if (targetIdx === -1) return;

    navigate(NAV_ROUTES[targetIdx]);
  }, [location, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: "hsl(var(--background))" }}>
        <div className="w-10 h-10 border-[3px] border-primary/15 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (
    location.startsWith("/admin") ||
    location.startsWith("/286c81443d1fb388d1b9a8e3b280824c") ||
    location.startsWith("/manage-keys/") ||
    location === "/onboarding"
  ) {
    return <div className="min-h-[100dvh]">{children}</div>;
  }

  const hideTopBar = location.startsWith("/profile") || location.startsWith("/wallet") || location.startsWith("/top-up") || location.startsWith("/support") || location.startsWith("/chat") || location.startsWith("/squad") || location.startsWith("/notifications") || location.startsWith("/matches") || location.startsWith("/leaderboard") || location.startsWith("/history") || location === "/about";
  const hideBottomNav = location.startsWith("/wallet") || location.startsWith("/top-up") || location.startsWith("/top-up/pay") || location.startsWith("/wallet/withdraw") || location.startsWith("/support") || location.startsWith("/chat") || location.startsWith("/squad") || location === "/profile/qr" || location === "/profile/security" || location === "/profile/theme" || location === "/about" || location.startsWith("/notifications") || (location.startsWith("/matches/") && !location.startsWith("/matches/mode") && location !== "/matches/my_matches") || location.startsWith("/history/matches/");

  return (
    <>
      <BackgroundMotion />
      <div
        className="min-h-[100dvh] flex flex-col"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {user && !hideTopBar && <TopBar />}
        <main
          key={animKey}
          className={cn(
            "flex-1 flex flex-col",
            animDir === "from-right" && "page-from-right",
            animDir === "from-left"  && "page-from-left",
          )}
          style={user ? {
            paddingTop:    (!hideTopBar)    ? "calc(4rem + env(safe-area-inset-top))"                        : undefined,
            paddingBottom: (!hideBottomNav) ? "calc(5rem + env(safe-area-inset-bottom))"                     : undefined,
          } : undefined}
        >
          {children}
        </main>
        {user && !hideBottomNav && <BottomNav />}
      </div>
      {user && <PushPrompt />}
    </>
  );
}
