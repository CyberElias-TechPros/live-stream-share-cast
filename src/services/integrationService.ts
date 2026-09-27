/* eslint-disable @typescript-eslint/no-explicit-any -- DTOs are normalised below. */

/**
 * Creator integrations: signed outbound webhooks.
 *
 * The signing secret is returned exactly once (create or rotate), so the UI has
 * to show it immediately — same rule as personal API tokens.
 */

import { api } from '@/integrations/api/client';

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  failureCount: number;
  lastDeliveryAt?: Date | null;
  lastStatus?: number | null;
  createdAt: Date;
}

function toEndpoint(row: any): WebhookEndpoint {
  return {
    id: row.id,
    url: row.url,
    events: Array.isArray(row.events) ? row.events : [],
    enabled: row.enabled === undefined ? true : !!row.enabled,
    failureCount: row.failureCount ?? 0,
    lastDeliveryAt: row.lastDeliveryAt ? new Date(row.lastDeliveryAt) : null,
    lastStatus: row.lastStatus ?? null,
    createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
  };
}

export const integrationService = {
  /** Event catalogue (id + description) that endpoints can subscribe to. */
  async events(): Promise<Array<{ id: string; label: string; description?: string }>> {
    try {
      const data = await api.get<{ events: Array<{ event: string; description?: string }> }>('/integrations/events');
      return (data.events ?? []).map((item) => ({
        id: item.event,
        label: item.event,
        description: item.description,
      }));
    } catch {
      return [];
    }
  },

  async webhooks(): Promise<WebhookEndpoint[]> {
    try {
      const data = await api.get<{ webhooks: any[] }>('/integrations/webhooks');
      return (data.webhooks ?? []).map(toEndpoint);
    } catch (error) {
      console.error('Error fetching webhook endpoints:', error);
      return [];
    }
  },

  async create(input: { url: string; events: string[] }): Promise<{ endpoint: WebhookEndpoint; secret: string } | null> {
    try {
      const data = await api.post<{ id: string; secret: string; url: string; events: string[] }>('/integrations/webhooks', input);
      return {
        endpoint: toEndpoint({ id: data.id, url: data.url, events: data.events, enabled: true, createdAt: new Date().toISOString() }),
        secret: data.secret,
      };
    } catch (error) {
      console.error('Error creating webhook endpoint:', error);
      return null;
    }
  },

  async update(id: string, updates: { url?: string; events?: string[]; enabled?: boolean }): Promise<boolean> {
    try {
      await api.patch(`/integrations/webhooks/${id}`, updates);
      return true;
    } catch (error) {
      console.error('Error updating webhook endpoint:', error);
      return false;
    }
  },

  async rotate(id: string): Promise<string | null> {
    try {
      const data = await api.post<{ secret: string }>(`/integrations/webhooks/${id}/rotate`);
      return data.secret ?? null;
    } catch (error) {
      console.error('Error rotating webhook secret:', error);
      return null;
    }
  },

  async test(id: string): Promise<{ ok: boolean; status?: number; error?: string }> {
    try {
      const data = await api.post<{ delivered: boolean; status?: number; error?: string }>(`/integrations/webhooks/${id}/test`);
      return { ok: !!data.delivered, status: data.status, error: data.error };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Request failed' };
    }
  },

  async remove(id: string): Promise<boolean> {
    try {
      await api.delete(`/integrations/webhooks/${id}`);
      return true;
    } catch (error) {
      console.error('Error removing webhook endpoint:', error);
      return false;
    }
  },
};
