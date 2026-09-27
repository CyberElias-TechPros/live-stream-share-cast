/* eslint-disable @typescript-eslint/no-explicit-any -- API DTOs are validated field-by-field in the mappers above. */
/**
 * Tips and donations.
 *
 * `config()` / `presets()` are public; the rest require a session. When no
 * payment provider is configured the API reports `enabled: false` and the UI
 * falls back to the creator's external donation link (if they set one).
 */

import { api } from '@/integrations/api/client';
import type { Tip, TipConfig } from '@/types';

function toTip(row: any): Tip {
  return {
    id: row.id,
    amountCents: row.amountCents ?? 0,
    currency: row.currency ?? 'USD',
    message: row.message ?? null,
    status: row.status ?? 'pending',
    createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
    paidAt: row.paidAt ? new Date(row.paidAt) : null,
    streamerUsername: row.streamerUsername ?? null,
    streamerName: row.streamerName ?? null,
    streamerAvatar: row.streamerAvatar ?? null,
    checkoutUrl: row.checkoutUrl ?? row.url ?? null,
  };
}

export const tipService = {
  async config(): Promise<TipConfig> {
    try {
      const data = await api.get<any>('/payments/config', { auth: false });
      return {
        enabled: !!data.enabled,
        provider: data.provider ?? 'none',
        currency: data.currency ?? 'USD',
        minTipCents: data.minTipCents ?? 100,
        maxTipCents: data.maxTipCents ?? 50000,
        presets: data.presets ?? [],
        hasDonationLink: !!data.donationUrl,
        donationUrl: data.donationUrl ?? null,
      };
    } catch {
      return { enabled: false, provider: 'none', currency: 'USD', minTipCents: 100, maxTipCents: 50000, presets: [], hasDonationLink: false, donationUrl: null };
    }
  },

  async presets(): Promise<{ currency: string; presets: number[] }> {
    try {
      return await api.get<{ currency: string; presets: number[] }>('/payments/presets', { auth: false });
    } catch {
      return { currency: 'USD', presets: [200, 500, 1000, 2500, 5000] };
    }
  },

  /**
   * Starts a checkout for `streamerId`. Returns the hosted payment URL (or null
   * when the provider is not configured yet).
   */
  async sendTip(input: { streamerId: string; amountCents: number; message?: string; streamId?: string; recordingId?: string }): Promise<{ tip: Tip; checkoutUrl: string | null } | null> {
    try {
      const data = await api.post<{ tip?: any; checkoutUrl?: string; url?: string; redirectUrl?: string; external?: boolean; success?: boolean }>(
        '/payments/tips',
        input,
      );
      // Without a checkout provider the API answers with the creator's own
      // donation link instead of a hosted checkout.
      const checkoutUrl = data.checkoutUrl ?? data.url ?? data.redirectUrl ?? null;
      return { tip: toTip(data.tip ?? {}), checkoutUrl };
    } catch (error) {
      console.error('Error sending tip:', error);
      return null;
    }
  },

  async myTips(): Promise<Tip[]> {
    try {
      const data = await api.get<{ tips: any[] }>('/payments/tips/mine');
      return (data.tips ?? []).map(toTip);
    } catch (error) {
      console.error('Error fetching your tips:', error);
      return [];
    }
  },

  async earnings(): Promise<{ totalCents: number; paidCents: number; pendingCents: number; currency: string; tipCount: number; donationUrl?: string | null } | null> {
    try {
      return await api.get('/payments/earnings');
    } catch (error) {
      console.error('Error fetching earnings:', error);
      return null;
    }
  },

  async setDonationLink(donationUrl: string | null): Promise<boolean> {
    try {
      await api.put('/payments/donation-link', { donationUrl });
      return true;
    } catch (error) {
      console.error('Error saving donation link:', error);
      return false;
    }
  },

  /** The creator's external support link, used when card payments are off. */
  async creatorDonationLink(streamerId: string): Promise<string | null> {
    try {
      const data = await api.get<{ extras?: { donationUrl?: string | null } }>(`/users/${streamerId}`, { auth: false });
      return data.extras?.donationUrl ?? null;
    } catch {
      return null;
    }
  },

  async tipStatus(id: string): Promise<Tip | null> {
    try {
      const data = await api.get<{ tip: any }>(`/payments/tips/${id}/status`, { auth: false });
      return toTip(data.tip ?? data);
    } catch {
      return null;
    }
  },
};
