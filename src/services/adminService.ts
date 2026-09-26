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

  async flushEmail(): Promise<boolean> {
    try {
      await api.post('/admin/email/flush');
      return true;
    } catch {
      return false;
    }
  },
};
