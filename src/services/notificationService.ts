/**
 * Notification inbox, delivery preferences and Web Push subscriptions.
 *
 * The bell polls `unreadCount()`; the inbox page pages through `list()`.
 */

import { api } from '@/integrations/api/client';
import { toNotification, toNotifications } from '@/integrations/api/mappers';
import type { AppNotification, UserPreferences } from '@/types';

export type NotificationPreferences = NonNullable<UserPreferences['notifications']>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  email: true,
  push: true,
  streamStart: true,
  comments: true,
  followers: true,
};

export const notificationService = {
  async list(options: { limit?: number; offset?: number; unreadOnly?: boolean; type?: string } = {}): Promise<{
    notifications: AppNotification[];
    unreadCount: number;
  }> {
    try {
      const data = await api.get<{ notifications: unknown[]; unreadCount: number }>('/notifications', {
        query: {
          limit: options.limit ?? 30,
          offset: options.offset ?? 0,
          unread: options.unreadOnly ? 'true' : undefined,
          type: options.type,
        },
      });
      return { notifications: toNotifications(data.notifications), unreadCount: data.unreadCount ?? 0 };
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return { notifications: [], unreadCount: 0 };
    }
  },

  async unreadCount(): Promise<number> {
    try {
      const data = await api.get<{ unreadCount: number }>('/notifications/unread-count');
      return data.unreadCount ?? 0;
    } catch {
      return 0;
    }
  },

  async markRead(id: string): Promise<boolean> {
    try {
      await api.post(`/notifications/${id}/read`);
      return true;
    } catch (error) {
      console.error('Error marking notification read:', error);
      return false;
    }
  },

  async markAllRead(): Promise<boolean> {
    try {
      await api.post('/notifications/read-all');
      return true;
    } catch (error) {
      console.error('Error marking notifications read:', error);
      return false;
    }
  },

  async dismiss(id: string): Promise<boolean> {
    try {
      await api.delete(`/notifications/${id}`);
      return true;
    } catch (error) {
      console.error('Error dismissing notification:', error);
      return false;
    }
  },

  async getPreferences(): Promise<NotificationPreferences> {
    try {
      const data = await api.get<{ preferences: Partial<NotificationPreferences> }>('/notifications/preferences');
      return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(data.preferences ?? {}) };
    } catch {
      return { ...DEFAULT_NOTIFICATION_PREFERENCES };
    }
  },

  async updatePreferences(preferences: Partial<NotificationPreferences>): Promise<NotificationPreferences | null> {
    try {
      const data = await api.put<{ preferences: NotificationPreferences }>('/notifications/preferences', { preferences });
      return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(data.preferences ?? {}) };
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      return null;
    }
  },

  /**
   * Registers the browser's push subscription with the Worker. `pushManager`
   * needs the VAPID public key from `/api/config` (see `usePushNotifications`).
   */
  async subscribePush(subscription: PushSubscription): Promise<boolean> {
    try {
      const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      await api.post('/notifications/push/subscribe', {
        endpoint: json.endpoint,
        keys: json.keys ?? {},
      });
      return true;
    } catch (error) {
      console.error('Error registering push subscription:', error);
      return false;
    }
  },

  async unsubscribePush(endpoint: string): Promise<boolean> {
    try {
      await api.delete('/notifications/push/subscribe', { endpoint });
      return true;
    } catch (error) {
      console.error('Error removing push subscription:', error);
      return false;
    }
  },
};
