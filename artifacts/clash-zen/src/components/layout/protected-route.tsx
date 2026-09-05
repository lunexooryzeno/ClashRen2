import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import SetupProfileScreen from "@/pages/setup-profile";
import { AppLayout } from "./app-layout";
import { GuestAccessPrompt, saveGuestRedirect } from "@/components/guest-access-prompt";

export function ProtectedRoute({ component: Component, ...props }: { component: React.ElementType, path?: string }) {
  const { user, isAuthenticated, isLoading, isGuest, isExplorer } = useAuth();
  const [location, setLocation] = useLocation();

  const SKIP_SAVE_REDIRECT = ["/setup-profile", "/landing", "/get-started", "/onboarding"];

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        if (!SKIP_SAVE_REDIRECT.includes(location)) {
          sessionStorage.setItem("redirectAfterLogin", location);
        }
        setLocation("/landing");
      } else if (isGuest) {
        if (location === "/setup-profile" || location === "/onboarding") {
          setLocation("/");
        }
      } else if (!isExplorer && user && (!user.inGameName || !user.uid)) {
        if (location !== "/setup-profile") {
          setLocation("/setup-profile");
        }
      } else if (!isExplorer && user?.id && user.inGameName && user.uid) {
        if (location === "/setup-profile") {
          setLocation("/");
          return;
        }
        const hasOnboarded =
          localStorage.getItem(`cz:onboarded:${user.id}`) === "true" ||
          localStorage.getItem(`clash-ren:welcomed:${user.id}`) === "true";
        if (!hasOnboarded && location !== "/onboarding") {
          setLocation("/onboarding");
        }
      }
    }
  }, [user, isAuthenticated, isLoading, isExplorer, location, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        <p className="mt-4 font-heading text-lg text-primary animate-pulse tracking-widest">LOADING...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (isGuest && (location === "/setup-profile" || location === "/onboarding")) {
    return null;
  }

  if (isGuest && !isGuestPublicRoute(location)) {
    saveGuestRedirect(location);
    return (
      <GuestAccessPrompt
        title="Create an account to compete"
        description="Guests can explore ClashRen, but a registered account is required to join matchmaking, enter tournaments, bind a Free Fire ID, keep match history, and receive rewards."
        redirectPath={location}
      />
    );
  }

  if (isGuest && location === "/profile") {
    return (
      <AppLayout>
        <div className="flex-1 overflow-y-auto px-5 py-8">
          <div className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-orange-500/25 bg-orange-500/10 text-2xl">
              ?
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-orange-400">Temporary guest profile</p>
            <h1 className="mt-2 font-heading text-2xl font-bold text-white">Explore before you compete</h1>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Guest sessions do not have a Free Fire identity, wallet, rank, match history, or rewards. Create an account when you are ready to make your progress official.
            </p>
            <div className="mt-6">
              <GuestAccessPrompt
                title="Ready to make it official?"
                description="Register to bind your Free Fire ID, join matches, track results, and receive rewards."
                redirectPath="/profile"
                onContinue={() => setLocation("/")}
              />
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!isGuest && !isExplorer && (!user?.inGameName || !user?.uid)) {
    return <SetupProfileScreen />;
  }

  const needsOnboarding = !isGuest && !isExplorer && user?.id
    ? localStorage.getItem(`cz:onboarded:${user.id}`) !== "true" &&
      localStorage.getItem(`clash-ren:welcomed:${user.id}`) !== "true"
    : false;

  if (needsOnboarding && location !== "/onboarding") {
    return null;
  }

  return (
    <AppLayout>
      <Component {...props} />
    </AppLayout>
  );
}

function isGuestPublicRoute(path: string): boolean {
  if (path === "/" || path === "/matches" || path === "/leaderboard" || path === "/about") return true;
  if (path.startsWith("/quickmatch")) return path === "/quickmatch";
  if (path === "/profile") return true;
  if (!path.startsWith("/matches/")) return false;
  return !path.startsWith("/matches/my_matches") && !path.startsWith("/matches/history");
}
