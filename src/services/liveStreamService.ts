/**
 * Streams, sessions and telemetry.
 *
 * Backed by the Cloudflare Worker API (D1 + R2 + Durable Objects) instead of
 * Supabase. The public shape of this module is unchanged, so no call site in
 * the app needs to know which backend is behind it.
 */

import { api } from '@/integrations/api/client';
import { toStream, toStreamSessions, toStreamStatsList } from '@/integrations/api/mappers';
import type { Stream, StreamStats, StreamSession } from '@/types';

interface StreamListResponse {
  streams: unknown[];
  count: number;
  total: number;
}

export interface StreamPresence {
  streamId: string;
  viewers: number;
  hostConnected: boolean;
  live: boolean;
}

export const liveStreamService = {
  async getAllStreams(): Promise<Stream[]> {
    try {
      const data = await api.get<StreamListResponse>('/streams', { query: { live: true, sort: 'viewers', limit: 60 } });
      return toStreams(data.streams);
    } catch (error) {
      console.error('Error fetching streams:', error);
      return [];
    }
  },

  async getStreamById(streamId: string): Promise<Stream | null> {
    try {
      const data = await api.get<{ stream: unknown }>(`/streams/${streamId}`);
      return toStream(data.stream);
    } catch (error) {
      console.error('Error fetching stream:', error);
      return null;
    }
  },

  async createStream(stream: Partial<Stream>): Promise<Stream | null> {
    try {
      // Stream keys are generated server-side now (no separate edge function).
      const data = await api.post<{ stream: unknown }>('/streams', {
        title: stream.title || 'Untitled Stream',
        description: stream.description,
        category: stream.category,
        tags: stream.tags ?? [],
        streamType: stream.streamType ?? 'internet',
        isRecording: stream.isRecording ?? false,
      });
      return toStream(data.stream);
    } catch (error) {
      console.error('Error creating stream:', error);
      return null;
    }
  },

  async startStream(streamId: string, isRecording = false): Promise<boolean> {
    try {
      await api.post(`/streams/${streamId}/start`, { isRecording });
      return true;
    } catch (error) {
      console.error('Error starting stream:', error);
      return false;
    }
  },

  async stopStream(streamId: string): Promise<boolean> {
    try {
      await api.post(`/streams/${streamId}/stop`);
      return true;
    } catch (error) {
      console.error('Error stopping stream:', error);
      return false;
    }
  },

  /** Keeps a stream marked live while the broadcaster is on air. */
  async heartbeat(streamId: string, viewerCount = 0): Promise<boolean> {
    try {
      await api.post(`/streams/${streamId}/heartbeat`, { viewerCount });
      return true;
    } catch (error) {
      console.error('Error sending heartbeat:', error);
      return false;
    }
  },

  async getStreamStats(streamId: string): Promise<StreamStats[]> {
    try {
      const data = await api.get<{ stats: unknown[] }>(`/streams/${streamId}/stats`, { query: { limit: 200 } });
      return toStreamStatsList(data.stats);
    } catch (error) {
      console.error('Error fetching stream stats:', error);
      return [];
    }
  },

  async recordStreamStats(
    streamId: string,
    stats: { viewerCount?: number; bandwidth?: number; cpuUsage?: number; memoryUsage?: number; errors?: unknown },
  ): Promise<boolean> {
    try {
      await api.post(`/streams/${streamId}/stats`, stats);
      return true;
    } catch (error) {
      console.error('Error recording stream stats:', error);
      return false;
    }
  },

  async updateStreamViewCount(streamId: string, count: number): Promise<boolean> {
    try {
      await api.post(`/streams/${streamId}/viewers`, { count });
      return true;
    } catch (error) {
      console.error('Error updating stream view count:', error);
      return false;
    }
  },

  /** Live viewer/host count straight from the stream's Durable Object. */
  async getStreamPresence(streamId: string): Promise<StreamPresence | null> {
    try {
      return await api.get<StreamPresence>(`/streams/${streamId}/presence`);
    } catch (error) {
      console.error('Error fetching presence:', error);
      return null;
    }
  },

  async updateStreamInfo(streamId: string, updates: Partial<Stream>): Promise<boolean> {
    try {
      await api.patch(`/streams/${streamId}`, {
        title: updates.title,
        description: updates.description,
        category: updates.category,
        tags: updates.tags,
        thumbnail: updates.thumbnail,
        streamType: updates.streamType,
        isRecording: updates.isRecording,
        recordingUrl: updates.recordingUrl,
      });
      return true;
    } catch (error) {
      console.error('Error updating stream info:', error);
      return false;
    }
  },

  /** Uploads a recording to R2 and links it to the stream. */
  async saveRecording(
    streamId: string,
    file: Blob,
    filename = 'recording.webm',
    retentionHours = 6,
  ): Promise<{ url: string; expiresAt: string } | null> {
    try {
      const form = new FormData();
      form.append('file', file, filename);
      form.append('streamId', streamId);
      form.append('retentionHours', String(retentionHours));

      const data = await api.upload<{ url: string; expiresAt: string }>('/media/recordings', form);
      return { url: data.url, expiresAt: data.expiresAt };
    } catch (error) {
      console.error('Error uploading recording:', error);
      return null;
    }
  },

  /** Backwards-compatible helper: stores an externally hosted recording URL. */
  async saveRecordingUrl(streamId: string, recordingUrl: string, retentionHours = 6): Promise<boolean> {
    return this.updateStreamInfo(streamId, { recordingUrl }) && this.setRecordingExpiry(streamId, retentionHours);
  },

  async setRecordingExpiry(streamId: string, retentionHours: number): Promise<boolean> {
    try {
      await api.post(`/streams/${streamId}/start`, { isRecording: true });
      return true;
    } catch {
      return false;
    }
  },

  async getStreamSessions(userId?: string): Promise<StreamSession[]> {
    try {
      const path = !userId || userId === currentUserId() ? '/users/me/sessions' : `/users/${userId}/sessions`;
      const data = await api.get<{ sessions: unknown[] }>(path);
      return toStreamSessions(data.sessions);
    } catch (error) {
      console.error('Error fetching stream sessions:', error);
      return [];
    }
  },

  async getMySessions(): Promise<StreamSession[]> {
    try {
      const data = await api.get<{ sessions: unknown[] }>('/users/me/sessions');
      return toStreamSessions(data.sessions);
    } catch (error) {
      console.error('Error fetching sessions:', error);
      return [];
    }
  },

  async getActiveStreams(): Promise<Stream[]> {
    return this.getAllStreams();
  },

  async getFeaturedStreams(limit = 5): Promise<Stream[]> {
    try {
      const data = await api.get<StreamListResponse>('/streams', { query: { live: true, sort: 'viewers', limit } });
      return toStreams(data.streams);
    } catch (error) {
      console.error('Error fetching featured streams:', error);
      return [];
    }
  },

  /** Browse page: search + category filters. */
  async searchStreams(options: {
    search?: string;
    category?: string;
    live?: boolean;
    sort?: 'top' | 'recent' | 'started';
    limit?: number;
    offset?: number;
  }): Promise<{ streams: Stream[]; total: number }> {
    try {
      const data = await api.get<StreamListResponse>('/streams', {
        query: {
          search: options.search,
          q: options.search,
          category: options.category,
          live: options.live,
          sort: options.sort,
          limit: options.limit,
          offset: options.offset,
        },
      });
      return { streams: toStreams(data.streams), total: data.total ?? data.count ?? 0 };
    } catch (error) {
      console.error('Error searching streams:', error);
      return { streams: [], total: 0 };
    }
  },

  async deleteStream(streamId: string): Promise<boolean> {
    try {
      await api.delete(`/streams/${streamId}`);
      return true;
    } catch (error) {
      console.error('Error deleting stream:', error);
      return false;
    }
  },
};

/* --------------------------------- helpers ----------------------------------- */

function currentUserId(): string | null {
  try {
    // Imported lazily to keep this module free of circular imports.
    const token = localStorage.getItem('lsc.access_token');
    if (!token) return null;
    const payload = token.split('.')[1];
    if (!payload) return null;
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    return (JSON.parse(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}

function toStreams(rows: unknown[] | undefined): Stream[] {
  return (rows ?? []).map(toStream);
}
