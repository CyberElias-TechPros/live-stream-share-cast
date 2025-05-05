
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { StreamProvider } from "@/contexts/StreamContext";
import { usePageTracking } from "@/hooks/useAnalytics";
import Index from "./pages/Index";
import CreateStream from "./pages/CreateStream";
import WatchStream from "./pages/WatchStream";
import Browse from "./pages/Browse";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Profile from "./pages/Profile"; 
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

// Analytics tracker component
const AnalyticsTracker = () => {
  usePageTracking();
  return null;
};

const AppContent = () => (
  <>
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
      
      {/* 404 route */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  </>
);

const App = () => (
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
);

export default App;
