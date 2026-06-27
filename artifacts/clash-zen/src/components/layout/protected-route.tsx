import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import SetupProfileScreen from "@/pages/setup-profile";
import { AppLayout } from "./app-layout";

export function ProtectedRoute({ component: Component, ...props }: { component: React.ElementType, path?: string }) {
  const { user, isAuthenticated, isLoading, isExplorer } = useAuth();
  const [location, setLocation] = useLocation();

  const SKIP_SAVE_REDIRECT = ["/setup-profile", "/landing", "/get-started", "/onboarding"];

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        if (!SKIP_SAVE_REDIRECT.includes(location)) {
          sessionStorage.setItem("redirectAfterLogin", location);
        }
        setLocation("/landing");
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

  if (!isExplorer && (!user?.inGameName || !user?.uid)) {
    return <SetupProfileScreen />;
  }

  const needsOnboarding = !isExplorer && user?.id
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
