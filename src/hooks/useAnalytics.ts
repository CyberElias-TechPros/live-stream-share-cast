
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import firebaseAnalytics from '@/services/firebaseService';
import { useAuth } from '@/contexts/AuthContext';

export function usePageTracking() {
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    // Set user ID when available
    if (user) {
      firebaseAnalytics.setUser(user.id);
    }
    
    // Track page views
    const pageName = getPageNameFromPath(location.pathname);
    firebaseAnalytics.trackPageView(pageName);
  }, [location, user]);
}

export function useStreamAnalytics() {
  const { user } = useAuth();
  
  const trackStreamCreate = (streamId: string, streamTitle: string) => {
    firebaseAnalytics.trackStreamCreate(streamId, streamTitle, user?.id || 'anonymous');
  };
  
  const trackStreamStart = (streamId: string, streamTitle: string) => {
    firebaseAnalytics.trackStreamStart(streamId, streamTitle, user?.id || 'anonymous');
  };
  
  const trackStreamEnd = (streamId: string, streamTitle: string, duration: number) => {
    firebaseAnalytics.trackStreamEnd(streamId, streamTitle, user?.id || 'anonymous', duration);
  };
  
  const trackStreamView = (streamId: string, streamTitle: string) => {
    firebaseAnalytics.trackStreamView(streamId, streamTitle, user?.id);
  };
  
  const trackChatMessage = (streamId: string) => {
    firebaseAnalytics.trackChatMessage(streamId, user?.id);
  };
  
  return {
    trackStreamCreate,
    trackStreamStart,
    trackStreamEnd,
    trackStreamView,
    trackChatMessage
  };
}

// Helper function to get page name from path
function getPageNameFromPath(path: string): string {
  // Remove trailing slash if present
  const cleanPath = path.endsWith('/') ? path.slice(0, -1) : path;
  
  // Handle root path
  if (cleanPath === '') return 'Home';
  
  // Handle specific paths
  const pathSegments = cleanPath.split('/').filter(Boolean);
  
  if (pathSegments.length === 0) return 'Home';
  
  if (pathSegments[0] === 'watch' && pathSegments.length > 1) {
    return 'Stream Viewer';
  }
  
  if (pathSegments[0] === 'stream') {
    if (pathSegments.length === 1) return 'Browse Streams';
    if (pathSegments[1] === 'create') return 'Create Stream';
  }
  
  if (pathSegments[0] === 'profile' && pathSegments.length > 1) {
    return 'User Profile';
  }
  
  // Format other paths (capitalize first letter of each segment)
  return pathSegments
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}
