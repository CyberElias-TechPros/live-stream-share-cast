/**
 * Page-view tracking.
 *
 * Firebase Analytics was removed in favour of the platform's own telemetry:
 * watch time and unique viewers are recorded server-side by `analyticsService`
 * (see `watchTracker`), and client errors go through `errorService` →
 * `POST /api/telemetry/errors`.
 *
 * `usePageTracking` therefore only maintains the document title / history
 * breadcrumbs that the error reporter attaches to reports — no third-party
 * script is loaded.
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { telemetry } from '@/lib/telemetry';

export function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname + location.search;
    telemetry.setPage(path);
  }, [location]);
}

/** Kept for callers that used to fire product events at Firebase. */
export function useStreamAnalytics() {
  return {
    trackStreamCreate: (streamId: string, streamTitle: string) => telemetry.event('stream_create', { streamId, streamTitle }),
    trackStreamStart: (streamId: string, streamTitle: string) => telemetry.event('stream_start', { streamId, streamTitle }),
    trackStreamEnd: (streamId: string, streamTitle: string, duration: number) => telemetry.event('stream_end', { streamId, streamTitle, duration }),
    trackStreamView: (streamId: string, streamTitle: string) => telemetry.event('stream_view', { streamId, streamTitle }),
    trackChatMessage: (streamId: string) => telemetry.event('chat_message', { streamId }),
  };
}
