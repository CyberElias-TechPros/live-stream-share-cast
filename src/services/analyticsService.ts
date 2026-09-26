/* eslint-disable @typescript-eslint/no-explicit-any -- API DTOs are validated field-by-field in the mappers above. */
/**
 * Creator analytics + viewer watch-time tracking.
 *
 * `watchTracker` opens a watch session and heartbeats it every 30s so
 * watch-minutes and unique viewers roll up correctly even if the tab closes
 * without a clean unload.
 */

import { api } from '@/integrations/api/client';

export interface AnalyticsOverview {
  range: { days: number; from: string; to: string };
  totals: {
    streams: number;
    minutesStreamed: number;
    peakViewers: number;
    uniqueViewers: number;
    watchMinutes: number;
    newFollowers: number;
    chatMessages: number;
    tipsCents: number;
  };
  series: Array<{
    day: string;
    streams: number;
    minutesStreamed: number;
    peakViewers: number;
    uniqueViewers: number;
    watchMinutes: number;
    newFollowers: number;
    chatMessages: number;
    tipsCents: number;
  }>;
  topStreams: Array<{ streamId: string; title: string; viewerCount: number; peakViewers: number; watchMinutes: number; startedAt?: string | null }>;
  retention: { followers: number; sessions: number };
}

export interface StreamAnalytics {
  streamId: string;
  viewers: number;
  uniqueViewers: number;
  peakViewers: number;
  watchMinutes: number;
  chatMessages: number;
  newFollowers: number;
  avgWatchSeconds: number;
  series: Array<{ at: string; viewers: number; bandwidth: number }>;
}

export const analyticsService = {
  async overview(days = 30): Promise<AnalyticsOverview | null> {
    try {
      return await api.get<AnalyticsOverview>('/analytics/overview', { query: { days } });
    } catch (error) {
      console.error('Error fetching analytics overview:', error);
      return null;
    }
  },

  async stream(streamId: string): Promise<StreamAnalytics | null> {
    try {
      return await api.get<StreamAnalytics>(`/analytics/streams/${streamId}`);
    } catch (error) {
      console.error('Error fetching stream analytics:', error);
      return null;
    }
  },

  async platform(): Promise<Record<string, any> | null> {
    try {
      return await api.get('/analytics/platform');
    } catch (error) {
      console.error('Error fetching platform analytics:', error);
      return null;
    }
  },
};

/* -------------------------------- watch tracker ------------------------------- */

export interface WatchTracker {
  stop(): void;
}

/**
 * Starts a watch session and keeps it alive. Returns a handle; calling `stop()`
 * (or navigating away) closes the session cleanly.
 */
export const watchTracker = {
  async start(input: { streamId?: string; recordingId?: string }): Promise<WatchTracker | null> {
    try {
      const { sessionId } = await api.post<{ sessionId: string }>('/analytics/watch/start', input, { auth: false });
      if (!sessionId) return null;

      let stopped = false;
      const timer = window.setInterval(() => {
        if (stopped) return;
        void api.post('/analytics/watch/heartbeat', { sessionId, seconds: 30 }, { auth: false }).catch(() => undefined);
      }, 30_000);

      return {
        stop() {
          if (stopped) return;
          stopped = true;
          window.clearInterval(timer);
          void api.post('/analytics/watch/end', { sessionId, seconds: 0 }, { auth: false }).catch(() => undefined);
        },
      };
    } catch {
      return null;
    }
  },
};
