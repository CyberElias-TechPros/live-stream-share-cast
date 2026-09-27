/**
 * Lightweight client telemetry funnel.
 *
 * Errors are batched and de-duplicated: the Worker fingerprints them too, so a
 * render loop in a broken tab cannot flood D1 with thousands of identical rows.
 * Everything here is best-effort and never throws.
 */

import { platformService } from '@/services/platformService';

interface TelemetryEvent {
  name: string;
  data?: Record<string, unknown>;
  at: string;
}

const MAX_BUFFERED_EVENTS = 50;
const FLUSH_DELAY_MS = 4_000;

let currentPage = typeof window !== 'undefined' ? window.location.pathname : '/';
let buffer: TelemetryEvent[] = [];
let flushTimer: number | null = null;
const reportedFingerprints = new Set<string>();

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    buffer = [];
  }, FLUSH_DELAY_MS);
}

export const telemetry = {
  setPage(path: string): void {
    currentPage = path;
  },

  /** Buffered product event — surfaced to the console in development only. */
  event(name: string, data?: Record<string, unknown>): void {
    if (import.meta.env.DEV) console.debug('[telemetry]', name, data ?? {});
    buffer.push({ name, data, at: new Date().toISOString() });
    if (buffer.length > MAX_BUFFERED_EVENTS) buffer = buffer.slice(-MAX_BUFFERED_EVENTS);
    scheduleFlush();
  },

  /**
   * Reports an uncaught/known error. Identical fingerprints are sent once per
   * page load so repeated failures collapse into a single row (occurrences are
   * counted server-side when the same fingerprint arrives again).
   */
  error(input: {
    message: string;
    stack?: string;
    level?: 'error' | 'warning' | 'info';
    context?: Record<string, unknown>;
    source?: string;
  }): void {
    const fingerprint = `${input.message.slice(0, 120)}|${currentPage}`;
    if (reportedFingerprints.has(fingerprint)) return;
    reportedFingerprints.add(fingerprint);

    platformService.reportClientError({
      message: input.message,
      stack: input.stack,
      level: input.level ?? 'error',
      source: input.source ?? 'spa',
      context: {
        ...(input.context ?? {}),
        page: currentPage,
        recent: buffer.slice(-10),
      } as Record<string, unknown>,
    });
  },
};
