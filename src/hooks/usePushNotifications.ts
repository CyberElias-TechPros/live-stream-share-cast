/**
 * Browser push notifications.
 *
 * `supported` is false when the browser has no Push API or the deployment has
 * not set its VAPID keys — the settings UI hides the toggle in that case.
 */

import { useCallback, useEffect, useState } from 'react';
import { platformService } from '@/services/platformService';
import { notificationService } from '@/services/notificationService';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function usePushNotifications() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const detect = async () => {
      const browserSupports = 'serviceWorker' in navigator && 'PushManager' in window;
      if (!browserSupports) {
        if (!cancelled) setSupported(false);
        return;
      }

      const config = await platformService.getConfig();
      const enabled = !!config?.features?.pushNotifications && !!config?.push?.publicKey;
      if (cancelled) return;
      setSupported(enabled);
      if (!enabled) return;

      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!cancelled) setSubscribed(!!subscription);
    };

    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const config = await platformService.getConfig();
      const publicKey = config?.push?.publicKey;
      if (!publicKey) throw new Error('Push notifications are not configured on this deployment');

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notification permission was denied');

      const registration = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/push-sw.js'));
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
        }));

      const ok = await notificationService.subscribePush(subscription);
      if (!ok) throw new Error('The server rejected the subscription');
      setSubscribed(true);
      return true;
    } catch (err) {
      console.error('Push subscribe failed:', err);
      setError(err instanceof Error ? err.message : 'Could not enable push notifications');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await notificationService.unsubscribePush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      return true;
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
      setError(err instanceof Error ? err.message : 'Could not disable push notifications');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { supported, subscribed, busy, error, subscribe, unsubscribe };
}
