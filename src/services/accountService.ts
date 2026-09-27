/* eslint-disable @typescript-eslint/no-explicit-any -- API DTOs are validated field-by-field in the mappers above. */
/**
 * Account lifecycle: sessions, personal API tokens, password changes, data
 * export and deletion.
 *
 * Deletion anonymises the account immediately (the row survives 30 days so
 * moderation history stays intact) — the UI must say that out loud, hence
 * `DELETION_GRACE_DAYS`.
 */

import { api, SESSION_EXPIRED_EVENT } from '@/integrations/api/client';

export const DELETION_GRACE_DAYS = 30;

export interface AccountSession {
  id: string;
  userAgent?: string | null;
  ip?: string | null;
  createdAt: Date;
  expiresAt: Date;
  current: boolean;
}

export interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt?: Date | null;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  createdAt: Date;
}

function toSession(row: any): AccountSession {
  return {
    id: row.id,
    userAgent: row.userAgent ?? null,
    ip: row.ip ?? null,
    createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
    expiresAt: row.expiresAt ? new Date(row.expiresAt) : new Date(),
    current: !!row.current,
  };
}

function toToken(row: any): ApiToken {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix ?? '',
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt) : null,
    expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
    revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
    createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
  };
}

export const accountService = {
  async sessions(): Promise<AccountSession[]> {
    try {
      const data = await api.get<{ sessions: any[] }>('/auth/sessions');
      return (data.sessions ?? []).map(toSession);
    } catch (error) {
      console.error('Error fetching sessions:', error);
      return [];
    }
  },

  async revokeSession(id: string): Promise<boolean> {
    try {
      await api.delete(`/auth/sessions/${id}`);
      return true;
    } catch (error) {
      console.error('Error revoking session:', error);
      return false;
    }
  },

  /** Signs every other device out (the caller keeps their session). */
  async signOutEverywhere(): Promise<boolean> {
    try {
      await api.post('/auth/logout-all');
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
      return true;
    } catch (error) {
      console.error('Error signing out sessions:', error);
      return false;
    }
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      return true;
    } catch (error) {
      console.error('Error changing password:', error);
      return false;
    }
  },

  async resendVerification(): Promise<boolean> {
    try {
      await api.post('/auth/resend-verification');
      return true;
    } catch {
      return false;
    }
  },

  async tokens(): Promise<ApiToken[]> {
    try {
      const data = await api.get<{ tokens: any[] }>('/auth/tokens');
      return (data.tokens ?? []).map(toToken);
    } catch (error) {
      console.error('Error fetching API tokens:', error);
      return [];
    }
  },

  /** Returns the plaintext token — shown to the user exactly once. */
  async createToken(input: { name: string; scopes?: string[]; expiresInDays?: number }): Promise<{ token: string; apiToken: ApiToken } | null> {
    try {
      const data = await api.post<{ token: string } & Record<string, any>>('/auth/tokens', input);
      return { token: data.token, apiToken: toToken(data) };
    } catch (error) {
      console.error('Error creating API token:', error);
      return null;
    }
  },

  async revokeToken(id: string): Promise<boolean> {
    try {
      await api.delete(`/auth/tokens/${id}`);
      return true;
    } catch (error) {
      console.error('Error revoking API token:', error);
      return false;
    }
  },

  /** Downloads the account archive (JSON) the user is entitled to. */
  async exportData(): Promise<boolean> {
    try {
      const data = await api.get<Record<string, unknown>>('/auth/account/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `live-stream-share-cast-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return true;
    } catch (error) {
      console.error('Error exporting account data:', error);
      return false;
    }
  },

  /** Anonymises the account. Requires the password plus the word DELETE. */
  async deleteAccount(password: string): Promise<boolean> {
    try {
      await api.delete('/auth/account', { password, confirm: 'DELETE' });
      return true;
    } catch (error) {
      console.error('Error deleting account:', error);
      return false;
    }
  },

  async legal(): Promise<{ termsVersion: string; privacyVersion: string; termsUrl?: string | null; privacyUrl?: string | null } | null> {
    try {
      return await api.get('/auth/legal', { auth: false });
    } catch {
      return null;
    }
  },
};
