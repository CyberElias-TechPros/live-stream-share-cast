
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { StreamProvider } from "@/contexts/StreamContext";
import { usePageTracking } from "@/hooks/useAnalytics";
import ErrorBoundary from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import CreateStream from "./pages/CreateStream";
import WatchStream from "./pages/WatchStream";
import Browse from "./pages/Browse";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Profile from "./pages/Profile"; 
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if ((error as any)?.status >= 400 && (error as any)?.status < 500) {
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

const AppContent = () => (
  <ErrorBoundary>
    <AnalyticsTracker />
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/stream" element={<Browse />} />
      <Route path="/watch/:streamId" element={<WatchStream />} />
      
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
  </ErrorBoundary>
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
