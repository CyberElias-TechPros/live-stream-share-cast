/* eslint-disable @typescript-eslint/no-explicit-any -- DTOs are normalised below. */

/**
 * Discovery — unified search, trending and typeahead.
 *
 * Backed by `/api/search`, `/api/search/trending`, `/api/search/suggest` and
 * `/api/search/live`. Every call degrades to an empty result instead of
 * throwing, so discovery never blocks a page render.
 */

import { api } from '@/integrations/api/client';
import { toStreams, toUser } from '@/integrations/api/mappers';
import type { Stream, User } from '@/types';

export interface SearchRecording {
  id: string;
  title: string;
  url?: string | null;
  thumbnail?: string | null;
  durationSeconds?: number | null;
  views: number;
  createdAt: Date;
  username: string;
  displayName?: string | null;
  userAvatar?: string | null;
}

export interface SearchCategory {
  slug: string;
  name: string;
  emoji?: string | null;
  liveStreams?: number;
  viewers?: number;
}

export interface SearchResults {
  query: string;
  streams: Stream[];
  channels: User[];
  recordings: SearchRecording[];
  categories: SearchCategory[];
  total: number;
}

export interface TrendingResults {
  streams: Stream[];
  categories: SearchCategory[];
  rising: Array<User & { newFollowers: number }>;
  upcoming: Array<{
    id: string;
    title: string;
    scheduledFor: Date;
    category?: string | null;
    username: string;
    displayName?: string | null;
    userAvatar?: string | null;
  }>;
}

export interface Suggestion {
  type: 'stream' | 'channel';
  id: string;
  label: string;
  sublabel?: string;
  isLive?: boolean;
  avatar?: string | null;
  isStreamer?: boolean;
}

const EMPTY: SearchResults = { query: '', streams: [], channels: [], recordings: [], categories: [], total: 0 };

function toRecording(row: any): SearchRecording {
  return {
    id: row.id,
    title: row.title ?? 'Untitled recording',
    url: row.url ?? null,
    thumbnail: row.thumbnail ?? null,
    durationSeconds: row.durationSeconds ?? null,
    views: row.views ?? 0,
    createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
    username: row.username ?? '',
    displayName: row.displayName ?? null,
    userAvatar: row.userAvatar ?? null,
  };
}

export const searchService = {
  async search(query: string, options: { scope?: 'all' | 'streams' | 'channels' | 'recordings' | 'categories'; limit?: number } = {}): Promise<SearchResults> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return { ...EMPTY, query: trimmed };

    try {
      const data = await api.get<{
        query: string;
        streams: any[];
        channels: any[];
        recordings: any[];
        categories: SearchCategory[];
        total: number;
      }>('/search', {
        query: { q: trimmed, scope: options.scope ?? 'all', limit: options.limit ?? 12 },
        auth: false,
      });

      return {
        query: data.query ?? trimmed,
        streams: toStreams(data.streams),
        channels: (data.channels ?? []).map(toUser),
        recordings: (data.recordings ?? []).map(toRecording),
        categories: data.categories ?? [],
        total: data.total ?? 0,
      };
    } catch (error) {
      console.error('Error searching:', error);
      return { ...EMPTY, query: trimmed };
    }
  },

  async trending(limit = 12): Promise<TrendingResults | null> {
    try {
      const data = await api.get<any>('/search/trending', { query: { limit }, auth: false });
      return {
        streams: toStreams(data.streams),
        categories: data.categories ?? [],
        rising: (data.rising ?? []).map((row: any) => ({ ...toUser(row), newFollowers: row.newFollowers ?? 0 })),
        upcoming: (data.upcoming ?? []).map((row: any) => ({
          id: row.id,
          title: row.title,
          scheduledFor: row.scheduledFor ? new Date(row.scheduledFor) : new Date(),
          category: row.category ?? null,
          username: row.username,
          displayName: row.displayName ?? null,
          userAvatar: row.userAvatar ?? null,
        })),
      };
    } catch (error) {
      console.error('Error loading trending:', error);
      return null;
    }
  },

  async suggest(query: string): Promise<Suggestion[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    try {
      const data = await api.get<{ suggestions: Suggestion[] }>('/search/suggest', { query: { q: trimmed }, auth: false });
      return data.suggestions ?? [];
    } catch {
      return [];
    }
  },

  /** "Is anyone live?" — used by the hero. */
  async liveNow(): Promise<{ live: number; viewers: number }> {
    try {
      return await api.get<{ live: number; viewers: number }>('/search/live', { auth: false });
    } catch {
      return { live: 0, viewers: 0 };
    }
  },
};
