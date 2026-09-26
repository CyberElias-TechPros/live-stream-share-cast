/**
 * Notification inbox state for the bell and the inbox page.
 *
 * The unread count is polled (30s) while the tab is visible and refreshed on
 * focus, so the badge stays accurate without a socket per user.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationService } from '@/services/notificationService';
import { useAuth } from '@/contexts/AuthContext';
import type { AppNotification } from '@/types';

const POLL_MS = 30_000;

export function useUnreadNotifications() {
  const { isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }
    setUnreadCount(await notificationService.unreadCount());
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }

    void refresh();

    const start = () => {
      if (timer.current !== null) return;
      timer.current = window.setInterval(() => {
        if (document.visibilityState === 'visible') void refresh();
      }, POLL_MS);
    };
    const stop = () => {
      if (timer.current === null) return;
      window.clearInterval(timer.current);
      timer.current = null;
    };

    start();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [isAuthenticated, refresh]);

  return { unreadCount, refresh };
}

export function useInbox(options: { unreadOnly?: boolean; pageSize?: number } = {}) {
  const { isAuthenticated } = useAuth();
  const pageSize = options.pageSize ?? 30;

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(
    async (offset = 0) => {
      if (!isAuthenticated) {
        setNotifications([]);
        setLoading(false);
        return;
      }

      if (offset === 0) setLoading(true);
      else setLoadingMore(true);

      const page = await notificationService.list({ limit: pageSize, offset, unreadOnly: options.unreadOnly });
      setNotifications((current) => (offset === 0 ? page.notifications : [...current, ...page.notifications]));
      setUnreadCount(page.unreadCount);
      setHasMore(page.notifications.length === pageSize);
      setLoading(false);
      setLoadingMore(false);
    },
    [isAuthenticated, pageSize, options.unreadOnly],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((current) => current.map((item) => (item.id === id && !item.readAt ? { ...item, readAt: new Date() } : item)));
    setUnreadCount((count) => Math.max(0, count - 1));
    await notificationService.markRead(id);
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date() })));
    setUnreadCount(0);
    await notificationService.markAllRead();
  }, []);

  const dismiss = useCallback(async (id: string) => {
    setNotifications((current) => current.filter((item) => item.id !== id));
    await notificationService.dismiss(id);
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    loadingMore,
    hasMore,
    reload: () => load(0),
    loadMore: () => load(notifications.length),
    markRead,
    markAllRead,
    dismiss,
  };
}
