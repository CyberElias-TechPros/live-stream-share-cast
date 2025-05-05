
import { initializeApp } from "firebase/app";
import { getAnalytics, logEvent, setUserId } from "firebase/analytics";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCR2IKXsAK69tpxL2Iqz8dw9FUftSv-bI0",
  authDomain: "totalrecovery-4life.firebaseapp.com",
  projectId: "totalrecovery-4life",
  storageBucket: "totalrecovery-4life.firebasestorage.app",
  messagingSenderId: "878822476359",
  appId: "1:878822476359:web:dc2502de0b897c15f2ff62",
  measurementId: "G-H65VBZCXPB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Analytics service
export const firebaseAnalytics = {
  // Track user identification
  setUser(userId: string) {
    setUserId(analytics, userId);
  },
  
  // Track page views
  trackPageView(pageName: string, pageParams?: Record<string, any>) {
    logEvent(analytics, 'page_view', {
      page_title: pageName,
      page_location: window.location.href,
      page_path: window.location.pathname,
      ...pageParams
    });
  },
  
  // Track stream events
  trackStreamCreate(streamId: string, streamTitle: string, userId: string) {
    logEvent(analytics, 'stream_create', {
      stream_id: streamId,
      stream_title: streamTitle,
      user_id: userId
    });
  },
  
  trackStreamStart(streamId: string, streamTitle: string, userId: string) {
    logEvent(analytics, 'stream_start', {
      stream_id: streamId,
      stream_title: streamTitle,
      user_id: userId
    });
  },
  
  trackStreamEnd(streamId: string, streamTitle: string, userId: string, duration: number) {
    logEvent(analytics, 'stream_end', {
      stream_id: streamId,
      stream_title: streamTitle,
      user_id: userId,
      stream_duration: duration
    });
  },
  
  trackStreamView(streamId: string, streamTitle: string, viewerId: string | null) {
    logEvent(analytics, 'stream_view', {
      stream_id: streamId,
      stream_title: streamTitle,
      viewer_id: viewerId || 'anonymous'
    });
  },
  
  // Track auth events
  trackLogin(method: string) {
    logEvent(analytics, 'login', {
      method
    });
  },
  
  trackSignup(method: string) {
    logEvent(analytics, 'sign_up', {
      method
    });
  },
  
  // Track chat events
  trackChatMessage(streamId: string, userId: string | null) {
    logEvent(analytics, 'chat_message', {
      stream_id: streamId,
      user_id: userId || 'anonymous'
    });
  },
  
  // General event tracking
  trackEvent(eventName: string, eventParams?: Record<string, any>) {
    logEvent(analytics, eventName, eventParams);
  }
};

export default firebaseAnalytics;
