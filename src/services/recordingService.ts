/**
 * VOD library — replays and clips.
 *
 * Recording rows are created by the Worker when a file lands in R2; this is the
 * read/write surface for browsing, editing and clipping them.
 */

import { api } from '@/integrations/api/client';
import { toRecording, toRecordings } from '@/integrations/api/mappers';
import type { Recording } from '@/types';

export const recordingService = {
  async browse(options: { userId?: string; search?: string; sort?: 'recent' | 'popular' | 'oldest'; limit?: number; offset?: number } = {}): Promise<{
    recordings: Recording[];
    total: number;
  }> {
    try {
      const data = await api.get<{ recordings: unknown[]; total?: number }>('/recordings', {
        query: {
          userId: options.userId,
          search: options.search,
          sort: options.sort,
          limit: options.limit ?? 24,
          offset: options.offset ?? 0,
        },
        auth: false,
      });
      return { recordings: toRecordings(data.recordings), total: data.total ?? 0 };
    } catch (error) {
      console.error('Error fetching recordings:', error);
      return { recordings: [], total: 0 };
    }
  },

  async mine(): Promise<Recording[]> {
    try {
      const data = await api.get<{ recordings: unknown[] }>('/recordings/mine');
      return toRecordings(data.recordings);
    } catch (error) {
      console.error('Error fetching your recordings:', error);
      return [];
    }
  },

  async get(id: string): Promise<Recording | null> {
    try {
      const data = await api.get<{ recording: unknown }>(`/recordings/${id}`, { auth: false });
      return toRecording(data.recording);
    } catch (error) {
      console.error('Error fetching recording:', error);
      return null;
    }
  },

  async update(
    id: string,
    updates: { title?: string; description?: string; visibility?: 'public' | 'unlisted' | 'private'; tags?: string[]; category?: string; isMature?: boolean },
  ): Promise<Recording | null> {
    try {
      const data = await api.patch<{ recording: unknown }>(`/recordings/${id}`, updates);
      return toRecording(data.recording);
    } catch (error) {
      console.error('Error updating recording:', error);
      return null;
    }
  },

  async remove(id: string): Promise<boolean> {
    try {
      await api.delete(`/recordings/${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting recording:', error);
      return false;
    }
  },

  async createClip(id: string, clip: { title: string; startSeconds: number; endSeconds: number; visibility?: string }): Promise<Recording | null> {
    try {
      const data = await api.post<{ recording: unknown }>(`/recordings/${id}/clip`, clip);
      return toRecording(data.recording);
    } catch (error) {
      console.error('Error creating clip:', error);
      return null;
    }
  },

  /** Registers a VOD watch session so views/watch-minutes roll up correctly. */
  async registerView(id: string, seconds = 30): Promise<boolean> {
    try {
      await api.post(`/recordings/${id}/view`, { seconds }, { auth: false });
      return true;
    } catch {
      return false;
    }
  },
};
