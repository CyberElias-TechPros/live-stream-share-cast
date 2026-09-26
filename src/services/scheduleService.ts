/**
 * Scheduled broadcasts — the creator's calendar plus the public "up next" list.
 */

import { api } from '@/integrations/api/client';
import { toScheduledBroadcast, toScheduledBroadcasts } from '@/integrations/api/mappers';
import type { ScheduledBroadcast } from '@/types';

export interface ScheduleInput {
  title: string;
  description?: string;
  category?: string;
  tags?: string[];
  thumbnailUrl?: string;
  scheduledFor: string;
  durationMinutes?: number;
  timezone?: string;
}

export const scheduleService = {
  async upcoming(options: { userId?: string; limit?: number } = {}): Promise<ScheduledBroadcast[]> {
    try {
      const data = await api.get<{ scheduled: unknown[] }>('/schedule', {
        query: { userId: options.userId, limit: options.limit ?? 20 },
        auth: false,
      });
      return toScheduledBroadcasts(data.scheduled);
    } catch (error) {
      console.error('Error fetching schedule:', error);
      return [];
    }
  },

  async mine(): Promise<ScheduledBroadcast[]> {
    try {
      const data = await api.get<{ scheduled: unknown[] }>('/schedule/mine');
      return toScheduledBroadcasts(data.scheduled);
    } catch (error) {
      console.error('Error fetching your schedule:', error);
      return [];
    }
  },

  async create(input: ScheduleInput): Promise<ScheduledBroadcast | null> {
    try {
      const data = await api.post<{ scheduled: unknown }>('/schedule', input);
      return toScheduledBroadcast(data.scheduled);
    } catch (error) {
      console.error('Error creating scheduled broadcast:', error);
      return null;
    }
  },

  async update(id: string, updates: Partial<ScheduleInput> & { status?: string }): Promise<ScheduledBroadcast | null> {
    try {
      const data = await api.patch<{ scheduled: unknown }>(`/schedule/${id}`, updates);
      return toScheduledBroadcast(data.scheduled);
    } catch (error) {
      console.error('Error updating scheduled broadcast:', error);
      return null;
    }
  },

  async cancel(id: string): Promise<boolean> {
    try {
      await api.delete(`/schedule/${id}`);
      return true;
    } catch (error) {
      console.error('Error cancelling scheduled broadcast:', error);
      return false;
    }
  },

  /** Toggle "remind me" for the signed-in viewer. Returns the new state. */
  async toggleReminder(id: string): Promise<boolean | null> {
    try {
      const data = await api.post<{ reminded: boolean }>(`/schedule/${id}/remind`);
      return !!data.reminded;
    } catch (error) {
      console.error('Error toggling reminder:', error);
      return null;
    }
  },

  /** Owner-only: spin the scheduled slot into a live stream. */
  async goLive(id: string): Promise<{ streamId: string } | null> {
    try {
      const data = await api.post<{ scheduled: { streamId?: string } }>(`/schedule/${id}/go-live`);
      return { streamId: data.scheduled?.streamId ?? '' };
    } catch (error) {
      console.error('Error starting scheduled broadcast:', error);
      return null;
    }
  },
};
