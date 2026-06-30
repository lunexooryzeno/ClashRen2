import { lazy, Suspense, Component, ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { OfflineBanner } from "@/components/offline-banner";
import { MatchVerifyNotifier } from "@/components/MatchVerifyNotifier";
import { PhoneGuardProvider } from "@/context/phone-guard";

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#000", color: "#ea580c", fontFamily: "sans-serif", padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Something went wrong</div>
          <div style={{ fontSize: 13, color: "#aaa", marginBottom: 24, maxWidth: 300, wordBreak: "break-all" }}>
            {(this.state.error as Error).message}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ background: "#ea580c", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, cursor: "pointer" }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.state.error === null ? this.props.children : null;
  }
}

// Use the stored JWT as a Bearer token fallback so auth works even when
// cookies are blocked (e.g. in the Replit preview iframe environment).
setAuthTokenGetter(() => localStorage.getItem("clash_ren_token"));

function PageFallback() {
  return (
    <div className="flex-1 flex flex-col min-h-[100dvh] px-4 pt-5 pb-24 gap-4">
      <div className="flex items-center justify-between mb-1">
        <Skeleton className="w-8 h-8 rounded-xl bg-white/5" />
        <Skeleton className="w-28 h-3 bg-white/5 rounded" />
        <Skeleton className="w-8 h-8 rounded-xl bg-white/5" />
      </div>
      <Skeleton className="w-full h-48 rounded-3xl bg-white/5" />
      <div className="grid grid-cols-3 gap-2">
        {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-2xl bg-white/5" />)}
      </div>
      <Skeleton className="w-32 h-3 bg-white/5 rounded" />
      <div className="flex flex-col gap-3">
        {[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl bg-white/5" />)}
      </div>
    </div>
  );
}

const Home                = lazy(() => import("@/pages/home"));
const Events              = lazy(() => import("@/pages/events"));
const KnockoutMode        = lazy(() => import("@/pages/knockout-mode"));
const ModeDetail          = lazy(() => import("@/pages/mode-detail"));
const KnockoutTypes       = lazy(() => import("@/pages/knockout-types"));
const ModeTournaments     = lazy(() => import("@/pages/mode-tournaments"));
const EventDetails        = lazy(() => import("@/pages/event-details"));
const Leaderboard         = lazy(() => import("@/pages/leaderboard"));
const History             = lazy(() => import("@/pages/history"));
const HistoryMatchesPage      = lazy(() => import("@/pages/history-matches"));
const HistoryMatchesTermsPage = lazy(() => import("@/pages/history-matches-terms"));
const Profile             = lazy(() => import("@/pages/profile"));
const AdminPanel          = lazy(() => import("@/pages/admin"));
const SetupProfileScreen  = lazy(() => import("@/pages/setup-profile"));
const NotFound            = lazy(() => import("@/pages/not-found"));
const LandingPage         = lazy(() => import("@/pages/landing"));
const GetStartedPage      = lazy(() => import("@/pages/get-started"));
const TopUpPage           = lazy(() => import("@/pages/top-up"));
const WalletPage          = lazy(() => import("@/pages/wallet"));
const WalletAllPage       = lazy(() => import("@/pages/wallet-all"));
const TopUpPayPage        = lazy(() => import("@/pages/top-up-pay"));
const TopUpTermsPage      = lazy(() => import("@/pages/top-up-terms"));
const ChatPage            = lazy(() => import("@/pages/chat"));
const SupportPage         = lazy(() => import("@/pages/support"));
const ProfileQrPage       = lazy(() => import("@/pages/profile-qr"));
const SquadCreatePage     = lazy(() => import("@/pages/squad-create"));
const SquadJoinPage       = lazy(() => import("@/pages/squad-join"));
const SquadFriendsPage    = lazy(() => import("@/pages/squad-friends"));
const WalletWithdrawPage  = lazy(() => import("@/pages/wallet-withdraw"));
const ProfileSecurityPage = lazy(() => import("@/pages/profile-security"));
const ProfileThemePage    = lazy(() => import("@/pages/profile-theme"));
const NotificationsPage   = lazy(() => import("@/pages/notifications"));
const NotificationsInboxPage = lazy(() => import("@/pages/notifications-inbox"));
const SuperAdminPage      = lazy(() => import("@/pages/super-admin"));
const PaymentAdminPage    = lazy(() => import("@/pages/payment-admin"));
const AdminUsersPage      = lazy(() => import("@/pages/admin-users"));
const AdminUserDetailPage = lazy(() => import("@/pages/admin-user-detail"));
const AdminFFStatsPage    = lazy(() => import("@/pages/admin-ff-stats"));
const AdminFraudPage      = lazy(() => import("@/pages/admin-fraud"));
const AccountSuspendedPage = lazy(() => import("@/pages/account-suspended"));
const OnboardingPage       = lazy(() => import("@/pages/onboarding"));
const BannerManagementPage = lazy(() => import("@/pages/banner-management"));
const MatchesManagementPage = lazy(() => import("@/pages/matches-management"));
const AdminMatchPlayersPage = lazy(() => import("@/pages/admin-match-players"));
const AdminMakeMatchesPage  = lazy(() => import("@/pages/admin-make-matches"));
const AdminSlotMatchDetailPage = lazy(() => import("@/pages/admin-slot-match-detail"));
const AdminAllMatchesPage = lazy(() => import("@/pages/admin-all-matches"));
const MyMatchDetailPage   = lazy(() => import("@/pages/my-match-detail"));
const ApiKeysAdminPage    = lazy(() => import("@/pages/api-keys-admin"));
const UtrTransactionsPage = lazy(() => import("@/pages/utr-transactions"));
const JoinSuccessPage        = lazy(() => import("@/pages/join-success"));
const AboutPage              = lazy(() => import("@/pages/about"));
const QuickMatchHubPage      = lazy(() => import("@/pages/quickmatch-hub"));
const QuickMatchModesPage    = lazy(() => import("@/pages/quickmatch-modes"));
const QuickMatchQueuePage    = lazy(() => import("@/pages/quickmatch-queue"));

// Suppress "signal is aborted without reason" — React Query cancels in-flight
// fetches on unmount via AbortController; the resulting AbortError is harmless
// but the Vite dev overlay treats it as a crash. Filter it at the source.
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (e) => {
    const err = e.reason;
    if (
      err instanceof Error &&
      (err.name === "AbortError" ||
        err.message === "signal is aborted without reason" ||
        err.message === "The user aborted a request.")
    ) {
      e.preventDefault();
    }
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: true,
      staleTime: 30 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      throwOnError: false,
    },
    mutations: {
      onError: (error: unknown) => {
        const e = error as { status?: number; data?: { code?: string } };
        if (e?.status === 403 && e?.data?.code === "PHONE_REQUIRED") {
          window.dispatchEvent(new CustomEvent("phone-required"));
        }
      },
    },
  },
});

const persister = createSyncStoragePersister({
  storage: typeof window !== "undefined" ? window.localStorage : undefined,
  key: "cz:qcache",
  throttleTime: 1000,
});

function Router() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Switch>
        <Route path="/landing" component={LandingPage} />
        <Route path="/get-started" component={GetStartedPage} />
        <Route path="/setup-profile">
          <ProtectedRoute component={SetupProfileScreen} />
        </Route>
        <Route path="/onboarding">
          <ProtectedRoute component={OnboardingPage} />
        </Route>
        <Route path="/">
          <ProtectedRoute component={Home} />
        </Route>
        <Route path="/matches">
          <ProtectedRoute component={Events} />
        </Route>
        <Route path="/matches/mode/:mode/knockouts">
          <ProtectedRoute component={KnockoutTypes} />
        </Route>
        <Route path="/matches/mode/:mode/tournaments">
          <ProtectedRoute component={ModeTournaments} />
        </Route>
        <Route path="/matches/mode/:mode">
          <ProtectedRoute component={ModeDetail} />
        </Route>
        <Route path="/matches/knockout/:mode">
          <ProtectedRoute component={KnockoutMode} />
        </Route>
        <Route path="/matches/my_matches">
          <ProtectedRoute component={HistoryMatchesPage} />
        </Route>
        <Route path="/matches/:id">
          <ProtectedRoute component={EventDetails} />
        </Route>
        <Route path="/leaderboard">
          <ProtectedRoute component={Leaderboard} />
        </Route>
        <Route path="/join-success">
          <ProtectedRoute component={JoinSuccessPage} />
        </Route>
        <Route path="/history/matches/terms">
          <ProtectedRoute component={HistoryMatchesTermsPage} />
        </Route>
        <Route path="/history/matches/:id/:slotKey">
          <ProtectedRoute component={MyMatchDetailPage} />
        </Route>
        <Route path="/history/matches/:id">
          <ProtectedRoute component={MyMatchDetailPage} />
        </Route>
        <Route path="/history">
          <ProtectedRoute component={History} />
        </Route>
        <Route path="/about">
          <ProtectedRoute component={AboutPage} />
        </Route>
        <Route path="/quickmatch/:type/:mode">
          <ProtectedRoute component={QuickMatchQueuePage} />
        </Route>
        <Route path="/quickmatch/:type">
          <ProtectedRoute component={QuickMatchModesPage} />
        </Route>
        <Route path="/quickmatch">
          <ProtectedRoute component={QuickMatchHubPage} />
        </Route>
        <Route path="/profile/qr">
          <ProtectedRoute component={ProfileQrPage} />
        </Route>
        <Route path="/profile/security">
          <ProtectedRoute component={ProfileSecurityPage} />
        </Route>
        <Route path="/profile/theme">
          <ProtectedRoute component={ProfileThemePage} />
        </Route>
        <Route path="/profile">
          <ProtectedRoute component={Profile} />
        </Route>
        <Route path="/top-up">
          <ProtectedRoute component={TopUpPage} />
        </Route>
        <Route path="/top-up/terms">
          <ProtectedRoute component={TopUpTermsPage} />
        </Route>
        <Route path="/top-up/pay">
          <ProtectedRoute component={TopUpPayPage} />
        </Route>
        <Route path="/wallet">
          <ProtectedRoute component={WalletPage} />
        </Route>
        <Route path="/wallet/all">
          <ProtectedRoute component={WalletAllPage} />
        </Route>
        <Route path="/wallet/withdraw">
          <ProtectedRoute component={WalletWithdrawPage} />
        </Route>
        <Route path="/chat">
          <ProtectedRoute component={ChatPage} />
        </Route>
        <Route path="/support">
          <ProtectedRoute component={SupportPage} />
        </Route>
        <Route path="/squad/create">
          <ProtectedRoute component={SquadCreatePage} />
        </Route>
        <Route path="/squad/join">
          <ProtectedRoute component={SquadJoinPage} />
        </Route>
        <Route path="/squad/friends">
          <ProtectedRoute component={SquadFriendsPage} />
        </Route>
        <Route path="/notifications/inbox">
          <ProtectedRoute component={NotificationsInboxPage} />
        </Route>
        <Route path="/notifications">
          <ProtectedRoute component={NotificationsPage} />
        </Route>
        <Route path="/admin">
          <ProtectedRoute component={AdminPanel} />
        </Route>
        <Route path="/admin/fraud">
          <ProtectedRoute component={AdminFraudPage} />
        </Route>
        <Route path="/account-suspended" component={AccountSuspendedPage} />
        <Route path="/286c81443d1fb388d1b9a8e3b280824c" component={SuperAdminPage} />
        <Route path="/286c81443d1fb388d1b9a8e3b280824c/payments" component={PaymentAdminPage} />
        <Route path="/286c81443d1fb388d1b9a8e3b280824c/user_management/:phone/:uid/ff-stats" component={AdminFFStatsPage} />
        <Route path="/286c81443d1fb388d1b9a8e3b280824c/user_management/:phone/:uid/topup-history" component={lazy(() => import("@/pages/admin-user-topup-history"))} />
        <Route path="/286c81443d1fb388d1b9a8e3b280824c/user_management/:phone/:uid" component={AdminUserDetailPage} />
        <Route path="/286c81443d1fb388d1b9a8e3b280824c/user_management" component={AdminUsersPage} />
        <Route path="/286c81443d1fb388d1b9a8e3b280824c/banner_management" component={BannerManagementPage} />
        <Route path="/286c81443d1fb388d1b9a8e3b280824c/matches_management/joined_players/matches/:matchId/slot/:slotIndex/make_matches" component={AdminMakeMatchesPage} />
        <Route path="/286c81443d1fb388d1b9a8e3b280824c/matches_management/joined_players/matches/:matchId/all-matches" component={AdminAllMatchesPage} />
        <Route path="/286c81443d1fb388d1b9a8e3b280824c/matches_management/joined_players/matches/:matchId/slot-match/:slotMatchId" component={AdminSlotMatchDetailPage} />
        <Route path="/286c81443d1fb388d1b9a8e3b280824c/matches_management/joined_players/matches/:matchId" component={AdminMatchPlayersPage} />
        <Route path="/286c81443d1fb388d1b9a8e3b280824c/matches_management/knockout/new" component={lazy(() => import("@/pages/admin-knockout-new"))} />
        <Route path="/286c81443d1fb388d1b9a8e3b280824c/matches_management/knockout/edit/:id" component={lazy(() => import("@/pages/admin-knockout-edit"))} />
        <Route path="/286c81443d1fb388d1b9a8e3b280824c/matches_management" component={MatchesManagementPage} />
        <Route path="/286c81443d1fb388d1b9a8e3b280824c/manage-keys" component={ApiKeysAdminPage} />
        <Route path="/286c81443d1fb388d1b9a8e3b280824c/utr-transactions" component={UtrTransactionsPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const key = query.queryKey[0] as string | undefined;
            // Never persist auth — always fetch fresh so suspended/blocked users are caught on reload
            if (key === "/api/users/me") return false;
            const neverPersist = ["notifications", "wallet", "topup", "withdrawals"];
            if (key && neverPersist.some((k) => key.includes(k))) return false;
            return query.state.status === "success";
          },
        },
      }}
    >
      <AuthProvider>
        <PhoneGuardProvider>
          <TooltipProvider>
            <WouterRouter hook={useHashLocation}>
              <Router />
            </WouterRouter>
            <Toaster />
            <OfflineBanner />
            <MatchVerifyNotifier />
          </TooltipProvider>
        </PhoneGuardProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}

export default App;
export { AppErrorBoundary };
