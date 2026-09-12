import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "@/pages/Index";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import { PrivacyPolicy, TermsOfService } from "@/pages/Legal";
import NotFound from "@/pages/NotFound";

// Heavy routes are code-split: the landing page stays lean.
const Browse = lazy(() => import("@/pages/Browse"));
const WatchStream = lazy(() => import("@/pages/WatchStream"));
const Studio = lazy(() => import("@/pages/Studio"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Settings = lazy(() => import("@/pages/Settings"));
const Profile = lazy(() => import("@/pages/Profile"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const status = error instanceof Error && "status" in error ? (error as { status: number }).status : undefined;
        if (status !== undefined && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      staleTime: 30_000,
      gcTime: 10 * 60_000,
    },
    mutations: { retry: 0 },
  },
});

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-line-strong border-t-text" />
    </div>
  );
}

/** Scrolls to top on route change (respects reduced motion via CSS `scroll-behavior`). */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return null;
}

function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />

        <Route
          path="/browse"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Browse />
            </Suspense>
          }
        />
        <Route
          path="/watch/:streamId"
          element={
            <Suspense fallback={<RouteFallback />}>
              <WatchStream />
            </Suspense>
          }
        />
        <Route
          path="/profile/:username"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Profile />
            </Suspense>
          }
        />

        {/* Auth-gated app routes */}
        <Route
          path="/studio"
          element={
            <Suspense fallback={<RouteFallback />}>
              <ProtectedRoute>
                <Studio />
              </ProtectedRoute>
            </Suspense>
          }
        />
        <Route
          path="/dashboard"
          element={
            <Suspense fallback={<RouteFallback />}>
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            </Suspense>
          }
        />
        <Route
          path="/settings"
          element={
            <Suspense fallback={<RouteFallback />}>
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            </Suspense>
          }
        />

        {/* Legacy URL redirects (v1 paths) */}
        <Route path="/stream" element={<Navigate to="/browse" replace />} />
        <Route path="/stream/create" element={<Navigate to="/studio" replace />} />
        <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
        <Route path="/reset-password" element={<Navigate to="/login" replace />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <TooltipProvider delayDuration={250}>
              <SonnerToaster />
              <AppRoutes />
            </TooltipProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
