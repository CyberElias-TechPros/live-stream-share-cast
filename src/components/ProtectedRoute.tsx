
import { ReactNode, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

interface ProtectedRouteProps {
  children: ReactNode;
  requireStreamer?: boolean;
}

export default function ProtectedRoute({ 
  children,
  requireStreamer = false
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();
  
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "You must be logged in to access this page.",
        variant: "default"
      });
    } else if (!isLoading && requireStreamer && !user?.isStreamer) {
      toast({
        title: "Streamer Status Required",
        description: "You must be a streamer to access this page.",
        variant: "default"
      });
    }
  }, [isAuthenticated, isLoading, requireStreamer, user]);
  
  if (isLoading) {
    // Show loading state while checking authentication
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-stream-light border-t-transparent animate-spin"></div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    // Redirect to login if not authenticated
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  if (requireStreamer && !user?.isStreamer) {
    // Redirect to home if streamer status is required but user is not a streamer
    return <Navigate to="/" replace />;
  }
  
  // Render children if all requirements are met
  return <>{children}</>;
}
