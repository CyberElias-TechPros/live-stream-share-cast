/* eslint-disable @typescript-eslint/no-explicit-any -- API DTOs are validated field-by-field in the mappers above. */
/**
 * Admin console API.
 *
 * Every call here 403s for non-admins — the UI gate (`user.isAdmin`) is only a
 * convenience, the Worker is the authority.
 */

import { api } from '@/integrations/api/client';

export interface AdminOverview {
  analytics: Record<string, any>;
  storage: { recordings: number; vods: number; openReports: number };
  integrations: Array<{ id: string; label: string; configured: boolean; requiredFor: string[]; envVars: string[]; notes?: string }>;
  email: { provider: string; configured: boolean };
  version: string;
  environment: string;
}

export interface AdminReport {
  id: string;
  targetType: string;
  targetId: string;
  streamId?: string | null;
  reason: string;
  details?: string | null;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  reporterUsername?: string | null;
  handlerUsername?: string | null;
  resolutionNote?: string | null;
  context?: string | null;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  isStreamer: boolean;
  isAdmin: boolean;
  isBanned: boolean;
  followers: number;
  createdAt: string;
}

export interface AdminError {
  id: string;
  message: string;
  stack?: string | null;
  url?: string | null;
  occurrences: number;
  createdAt: string;
  updatedAt?: string | null;
}

export interface AdminBan {
  id: string;
  userId: string;
  username: string;
  email: string;
  scope: string;
  kind: string;
  reason?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

export interface AdminStream {
  id: string;
  title: string;
  isLive: boolean;
  viewerCount: number;
  category?: string | null;
  createdAt: string;
  startedAt?: string | null;
  userId: string;
  username: string;
  userBanned: boolean;
}

export interface AdminCategory {
  slug: string;
  name: string;
  description?: string | null;
  emoji?: string | null;
  color?: string | null;
  sortOrder?: number | null;
  isActive: boolean;
}

export interface AdminTip {
  id: string;
  streamerUsername?: string | null;
  tipperUsername?: string | null;
  amountCents: number;
  currency: string;
  message?: string | null;
  status: string;
  provider?: string | null;
  createdAt: string;
  paidAt?: string | null;
}

export interface AdminPayments {
  tips: AdminTip[];
  totals: { paidCents: number; paidCount: number; pendingCount: number };
}

export interface AdminEmailRow {
  id: string;
  to: string;
  template: string;
  subject: string;
  status: string;
  attempts: number;
  lastError?: string | null;
  provider?: string | null;
  scheduledAt?: string | null;
  sentAt?: string | null;
  createdAt: string;
}

export interface AdminOutbox {
  emails: AdminEmailRow[];
  counts: Record<string, number>;
  provider: string;
}

export const adminService = {
  async overview(): Promise<AdminOverview | null> {
    try {
      return await api.get<AdminOverview>('/admin/overview');
    } catch (error) {
      console.error('Admin overview failed:', error);
      return null;
    }
  },

  async reports(status: 'open' | 'reviewing' | 'resolved' | 'dismissed' | 'all' = 'open'): Promise<AdminReport[]> {
    try {
      const data = await api.get<{ reports: AdminReport[] }>('/admin/reports', { query: { status } });
      return data.reports ?? [];
    } catch {
      return [];
    }
  },

  async resolveReport(id: string, status: AdminReport['status'], resolutionNote?: string): Promise<boolean> {
    try {
      await api.patch(`/admin/reports/${id}`, { status, resolutionNote });
      return true;
    } catch (error) {
      console.error('Report resolution failed:', error);
      return false;
    }
  },

  async users(search = '', limit = 25): Promise<AdminUser[]> {
    try {
      const data = await api.get<{ users: AdminUser[] }>('/admin/users', { query: { search, limit } });
      return data.users ?? [];
    } catch {
      return [];
    }
  },

  async banUser(userId: string, input: { reason: string; durationMinutes?: number | null }): Promise<boolean> {
    try {
      await api.post(`/admin/users/${userId}/ban`, input);
      return true;
    } catch (error) {
      console.error('Ban failed:', error);
      return false;
    }
  },

  async unbanUser(userId: string): Promise<boolean> {
    try {
      await api.post(`/admin/users/${userId}/unban`);
      return true;
    } catch (error) {
      console.error('Unban failed:', error);
      return false;
    }
  },

  async bans(): Promise<AdminBan[]> {
    try {
      const data = await api.get<{ bans: AdminBan[] }>('/admin/bans');
      return data.bans ?? [];
    } catch {
      return [];
    }
  },

  async liftBan(banId: string): Promise<boolean> {
    try {
      await api.delete(`/admin/bans/${banId}`);
      return true;
    } catch {
      return false;
    }
  },

  async errors(limit = 50): Promise<AdminError[]> {
    try {
      const data = await api.get<{ errors: AdminError[] }>('/admin/errors', { query: { limit } });
      return data.errors ?? [];
    } catch {
      return [];
    }
  },

  async dismissError(id: string): Promise<boolean> {
    try {
      await api.delete(`/admin/errors/${id}`);
      return true;
    } catch {
      return false;
    }
  },

  async flags(): Promise<Array<{ key: string; enabled: boolean; description?: string | null }>> {
    try {
      const data = await api.get<{ flags: any[] }>('/admin/flags');
      return data.flags ?? [];
    } catch {
      return [];
    }
  },

  async setFlag(key: string, enabled: boolean): Promise<boolean> {
    try {
      await api.put(`/admin/flags/${key}`, { enabled });
      return true;
    } catch {
      return false;
    }
  },

  async audit(limit = 50): Promise<Array<{ id: string; action: string; actorId?: string | null; targetType?: string | null; targetId?: string | null; createdAt: string }>> {
    try {
      const data = await api.get<{ entries: any[] }>('/admin/audit', { query: { limit } });
      return data.entries ?? [];
    } catch {
      return [];
    }
  },

  /* ------------------------------- streams ------------------------------- */

  async streams(options: { live?: boolean; limit?: number } = {}): Promise<AdminStream[]> {
    try {
      const data = await api.get<{ streams: any[] }>('/admin/streams', {
        query: { live: options.live === undefined ? undefined : String(options.live), limit: options.limit ?? 50 },
      });
      return data.streams ?? [];
    } catch {
      return [];
    }
  },

  async endStream(id: string, reason?: string): Promise<boolean> {
    try {
      await api.post(`/admin/streams/${id}/end`, { reason });
      return true;
    } catch {
      return false;
    }
  },

  async deleteStream(id: string): Promise<boolean> {
    try {
      await api.delete(`/admin/streams/${id}`);
      return true;
    } catch {
      return false;
    }
  },

  /* ------------------------------ categories ------------------------------ */

  async categories(): Promise<AdminCategory[]> {
    try {
      const data = await api.get<{ categories: any[] }>('/admin/categories');
      return (data.categories ?? []).map((row) => ({
        slug: row.slug,
        name: row.name,
        description: row.description ?? null,
        emoji: row.emoji ?? null,
        color: row.color ?? null,
        sortOrder: row.sort_order ?? row.sortOrder ?? null,
        isActive: row.is_active === undefined ? !!row.isActive : !!row.is_active,
      }));
    } catch {
      return [];
    }
  },

  async createCategory(input: { slug: string; name: string; description?: string; emoji?: string; sortOrder?: number }): Promise<boolean> {
    try {
      await api.post('/admin/categories', input);
      return true;
    } catch {
      return false;
    }
  },

  async updateCategory(slug: string, updates: { name?: string; description?: string | null; emoji?: string | null; sortOrder?: number; isActive?: boolean }): Promise<boolean> {
    try {
      await api.patch(`/admin/categories/${slug}`, updates);
      return true;
    } catch {
      return false;
    }
  },

  /* -------------------------------- payments ------------------------------ */

  async payments(limit = 50): Promise<AdminPayments | null> {
    try {
      return await api.get<AdminPayments>('/admin/payments', { query: { limit } });
    } catch {
      return null;
    }
  },

  /* ---------------------------------- email ------------------------------- */

  async outbox(status = 'all', limit = 50): Promise<AdminOutbox | null> {
    try {
      return await api.get<AdminOutbox>('/admin/email', { query: { status, limit } });
    } catch {
      return null;
    }
  },

  /** Queues a test message and reports whether the provider accepted it. */
  async testEmail(to?: string): Promise<{ ok: boolean; provider?: string; error?: string }> {
    try {
      const data = await api.post<{ success: boolean; provider?: string }>('/admin/email/test', { to });
      return { ok: !!data.success, provider: data.provider };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Request failed' };
    }
  },

  async flushEmail(): Promise<boolean> {
    try {
      await api.post('/admin/email/flush');
      return true;
    } catch {
      return false;
    }
  },
};
