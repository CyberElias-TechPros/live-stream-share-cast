/* eslint-disable @typescript-eslint/no-explicit-any -- API DTOs are validated field-by-field in the mappers above. */
/**
 * Deployment-level configuration and client telemetry.
 *
 * Everything here is public (no auth) and safe to cache for the page lifetime:
 * the runtime config tells the UI which features are switched on, which
 * integrations still need their keys, and which STUN/TURN servers to use.
 */

import { api } from '@/integrations/api/client';
import type { PlatformConfig, WatchHistoryEntry } from '@/types';

const CONFIG_TTL_MS = 5 * 60 * 1000;

let cachedConfig: { value: PlatformConfig; at: number } | null = null;
let inflight: Promise<PlatformConfig | null> | null = null;

function toWatchHistory(row: any): WatchHistoryEntry {
  return {
    sessionId: row.sessionId,
    streamId: row.streamId ?? null,
    recordingId: row.recordingId ?? null,
    title: row.title ?? 'Untitled',
    thumbnail: row.thumbnail ?? null,
    url: row.url ?? null,
    watchedSeconds: row.watchedSeconds ?? 0,
    joinedAt: row.joinedAt ? new Date(row.joinedAt) : new Date(),
    leftAt: row.leftAt ? new Date(row.leftAt) : null,
  };
}

export const platformService = {
  /** Runtime config, memoised for five minutes. Returns null when the API is unreachable. */
  async getConfig(force = false): Promise<PlatformConfig | null> {
    if (!force && cachedConfig && Date.now() - cachedConfig.at < CONFIG_TTL_MS) return cachedConfig.value;
    if (!force && inflight) return inflight;

    inflight = api
      .get<PlatformConfig>('/config', { auth: false })
      .then((config) => {
        cachedConfig = { value: config, at: Date.now() };
        return config;
      })
      .catch((error) => {
        console.warn('Runtime config unavailable, using defaults:', error);
        return null;
      })
      .finally(() => {
        inflight = null;
      });

    return inflight;
  },

  /** Cached config without a network round trip (null until `getConfig` ran once). */
  cachedConfig(): PlatformConfig | null {
    return cachedConfig?.value ?? null;
  },

  async categories(): Promise<Array<{ slug: string; name: string; emoji?: string | null; liveStreams: number }>> {
    try {
      const data = await api.get<{ categories: any[] }>('/config/categories', { auth: false });
      return data.categories ?? [];
    } catch {
      return [];
    }
  },

  async features(): Promise<Record<string, { enabled: boolean; value: unknown }>> {
    try {
      const data = await api.get<{ flags: Record<string, { enabled: boolean; value: unknown }> }>('/config/features', { auth: false });
      return data.flags ?? {};
    } catch {
      return {};
    }
  },

  /** ICE servers for WebRTC — short-lived TURN credentials when configured. */
  async iceServers(): Promise<RTCIceServer[]> {
    try {
      const data = await api.get<{ iceServers: RTCIceServer[] }>('/config/rtc/ice', { auth: false });
      return data.iceServers ?? [];
    } catch {
      return [];
    }
  },

  async health(): Promise<{ status: string; pendingConfiguration: string[] } | null> {
    try {
      return await api.get<{ status: string; pendingConfiguration: string[] }>('/health', { auth: false });
    } catch {
      return null;
    }
  },

  /** Watch history for the "continue watching" rail. */
  async watchHistory(limit = 20): Promise<WatchHistoryEntry[]> {
    try {
      const data = await api.get<{ history: any[] }>('/analytics/history', { query: { limit } });
      return (data.history ?? []).map(toWatchHistory);
    } catch {
      return [];
    }
  },

  /**
   * Fire-and-forget client error report (`POST /api/telemetry/errors`).
   * Never throws, never blocks the caller.
   */
  reportClientError(payload: {
    message: string;
    stack?: string;
    level?: 'error' | 'warning' | 'info';
    context?: Record<string, unknown>;
    source?: string;
    url?: string;
  }): void {
    void api
      .post(
        '/telemetry/errors',
        {
          message: payload.message,
          stack: payload.stack,
          level: payload.level ?? 'error',
          source: payload.source ?? 'spa',
          url: payload.url ?? (typeof window !== 'undefined' ? window.location.href : undefined),
          appVersion: import.meta.env.VITE_APP_VERSION ?? import.meta.env.MODE,
          context: payload.context,
        },
        { auth: true },
      )
      .catch(() => undefined);
  },
};

export type { PlatformConfig };
