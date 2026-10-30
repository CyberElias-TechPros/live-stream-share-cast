
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ApiRequestError } from "@/integrations/api/client";
import { AuthProvider } from "@/contexts/AuthContext";
import { StreamProvider } from "@/contexts/StreamContext";
import { usePageTracking } from "@/hooks/useAnalytics";
import { SoundCues } from "@/components/SoundToggle";
import ErrorBoundary from "@/components/ErrorBoundary";
const Index = lazy(() => import("./pages/Index"));
// Keep the no-internet room in the initial app shell so a user who cached the
// home page can still open it after disconnecting before ever visiting /offline.
import Offline from "./pages/Offline";
const CreateStream = lazy(() => import("./pages/CreateStream"));
const WatchStream = lazy(() => import("./pages/WatchStream"));
const Browse = lazy(() => import("./pages/Browse"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Profile = lazy(() => import("./pages/Profile"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Library = lazy(() => import("./pages/Library"));
const Schedule = lazy(() => import("./pages/Schedule"));
const Moderation = lazy(() => import("./pages/Moderation"));
const Admin = lazy(() => import("./pages/Admin"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const Legal = lazy(() => import("./pages/Legal"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));
import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    },
    mutations: {
      retry: 1,
    },
  },
});

// Enhanced analytics tracker with error handling
const AnalyticsTracker = () => {
  try {
    usePageTracking();
  } catch (error) {
    console.warn('Analytics tracking failed:', error);
  }
  return null;
};

const RouteFallback = () => (
  <div className="flex min-h-[40vh] items-center justify-center px-6 text-sm text-muted-foreground" role="status" aria-live="polite">
    Loading page…
  </div>
);

/** Keeps shared links canonical even when static hosting serves a deep route. */
const DocumentMeta = () => {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    const isWatch = path.startsWith('/watch/');
    const isProfile = path.startsWith('/profile/');
    const isLibrary = path.startsWith('/library');
    const isOffline = path === '/offline';
    const title = isWatch
      ? "Watch live — I'm Live"
      : isProfile
        ? "Creator profile — I'm Live"
        : isLibrary
          ? "Library — I'm Live"
          : isOffline
            ? "Offline LAN room — I'm Live"
            : "I'm Live — Go live in a click. Watch in real time.";
    const description = isWatch
      ? 'Join a live broadcast on I\'m Live.'
      : isOffline
        ? 'Stream directly between browsers on the same local network without cloud signalling or internet media traffic.'
        : "Turn your camera into a broadcast. Share one link, and anyone can tune in instantly.";
    document.title = title;
    const setMeta = (name: string, content: string) => {
      const element = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (element) element.content = content;
    };
    setMeta('description', description);
    const canonicalUrl = new URL(path || '/', window.location.origin).toString();
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;
    const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = title;
    const ogDescription = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
    if (ogDescription) ogDescription.content = description;
  }, [location.pathname]);

  return null;
};

const AppContent = () => (
  <>
    <DocumentMeta />
  <ErrorBoundary>
    <AnalyticsTracker />
    <SoundCues />
    <Suspense fallback={<RouteFallback />}>
      <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/offline" element={<Offline />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/terms" element={<Legal kind="terms" />} />
      <Route path="/privacy" element={<Legal kind="privacy" />} />
      <Route path="/help" element={<Legal kind="help" />} />
      <Route path="/stream" element={<Browse />} />
      <Route path="/watch/:streamId" element={<WatchStream />} />
      <Route path="/library" element={<Library />} />
      <Route path="/library/:recordingId" element={<Library />} />
      <Route path="/schedule" element={<Schedule />} />
      <Route path="/notifications" element={
        <ProtectedRoute>
          <Notifications />
        </ProtectedRoute>
      } />
      <Route path="/moderation" element={
        <ProtectedRoute>
          <Moderation />
        </ProtectedRoute>
      } />
      <Route path="/admin" element={
        <ProtectedRoute>
          <Admin />
        </ProtectedRoute>
      } />
      
      {/* Protected routes */}
      <Route path="/stream/create" element={
        <ProtectedRoute requireStreamer={true}>
          <CreateStream />
        </ProtectedRoute>
      } />
      
      <Route path="/profile/:username" element={
        <ProtectedRoute>
          <Profile />
        </ProtectedRoute>
      } />
      
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      } />
      
      <Route path="/settings" element={
        <ProtectedRoute>
          <Settings />
        </ProtectedRoute>
      } />
      
      {/* 404 route */}
      <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  </ErrorBoundary>
  </>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <StreamProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <AppContent />
            </TooltipProvider>
          </StreamProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
