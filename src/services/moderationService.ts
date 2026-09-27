/* eslint-disable @typescript-eslint/no-explicit-any -- API DTOs are validated field-by-field in the mappers above. */
/**
 * Moderation: reports, the personal block list and per-stream chat rules.
 *
 * Creators and moderators use the same endpoints; the Worker enforces who may
 * change what (owner, listed moderator or admin).
 */

import { api } from '@/integrations/api/client';
import { toReports } from '@/integrations/api/mappers';
import type { BlockedUser, ContentReport } from '@/types';

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'hate_speech',
  'violence',
  'sexual_content',
  'copyright',
  'impersonation',
  'other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export interface ChatRules {
  streamId: string;
  slowModeSeconds: number;
  followersOnly: boolean;
  subscribersOnly: boolean;
  emotesOnly: boolean;
  linksAllowed: boolean;
  minAccountAgeMinutes: number;
  blockedWords: string[];
  moderators: string[];
}

export const moderationService = {
  async report(input: { targetType: 'user' | 'stream' | 'chat_message' | 'recording'; targetId: string; reason: ReportReason; details?: string }): Promise<boolean> {
    try {
      await api.post('/moderation/reports', input);
      return true;
    } catch (error) {
      console.error('Error filing report:', error);
      return false;
    }
  },

  async myReports(): Promise<ContentReport[]> {
    try {
      const data = await api.get<{ reports: unknown[] }>('/moderation/reports/mine');
      return toReports(data.reports);
    } catch (error) {
      console.error('Error fetching your reports:', error);
      return [];
    }
  },

  async blockedUsers(): Promise<BlockedUser[]> {
    try {
      const data = await api.get<{ users: any[] }>('/moderation/blocks');
      return (data.users ?? []).map((row) => ({
        id: row.id,
        userId: row.userId ?? row.id,
        username: row.username,
        displayName: row.displayName,
        avatar: row.avatar,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      }));
    } catch (error) {
      console.error('Error fetching blocked users:', error);
      return [];
    }
  },

  async block(userId: string): Promise<boolean> {
    try {
      await api.post(`/moderation/blocks/${userId}`);
      return true;
    } catch (error) {
      console.error('Error blocking user:', error);
      return false;
    }
  },

  async unblock(userId: string): Promise<boolean> {
    try {
      await api.delete(`/moderation/blocks/${userId}`);
      return true;
    } catch (error) {
      console.error('Error unblocking user:', error);
      return false;
    }
  },

  /** Public chat rules for a stream (viewers read them to know what applies). */
  async chatRules(streamId: string): Promise<ChatRules | null> {
    try {
      const data = await api.get<{ rules: ChatRules }>(`/moderation/chat/${streamId}/rules`, { auth: false });
      return data.rules ?? null;
    } catch {
      return null;
    }
  },

  async chatSettings(streamId: string): Promise<ChatRules | null> {
    try {
      const data = await api.get<{ settings: ChatRules }>(`/moderation/chat/${streamId}/settings`);
      return data.settings ?? null;
    } catch (error) {
      console.error('Error fetching chat settings:', error);
      return null;
    }
  },

  async updateChatSettings(streamId: string, settings: Partial<ChatRules>): Promise<ChatRules | null> {
    try {
      const data = await api.put<{ settings: ChatRules }>(`/moderation/chat/${streamId}/settings`, settings);
      return data.settings ?? null;
    } catch (error) {
      console.error('Error updating chat settings:', error);
      return null;
    }
  },

  async restrictions(streamId: string): Promise<Array<{ id: string; userId: string; username: string; kind: 'ban' | 'timeout'; reason?: string | null; expiresAt?: string | null }>> {
    try {
      const data = await api.get<{ restrictions: any[] }>(`/moderation/chat/${streamId}/restrictions`);
      return (data.restrictions ?? []).map((row) => ({
        id: row.id,
        userId: row.userId,
        username: row.username,
        kind: row.kind,
        reason: row.reason ?? null,
        expiresAt: row.expiresAt ?? null,
      }));
    } catch {
      return [];
    }
  },

  async restrict(streamId: string, input: { userId: string; kind: 'ban' | 'timeout'; durationMinutes?: number; reason?: string }): Promise<boolean> {
    try {
      await api.post(`/moderation/chat/${streamId}/restrictions`, input);
      return true;
    } catch (error) {
      console.error('Error applying chat restriction:', error);
      return false;
    }
  },

  async unrestrict(streamId: string, userId: string): Promise<boolean> {
    try {
      await api.delete(`/moderation/chat/${streamId}/restrictions/${userId}`);
      return true;
    } catch (error) {
      console.error('Error lifting chat restriction:', error);
      return false;
    }
  },
};
