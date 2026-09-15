import type { Env } from '../env';
import { nowIso } from './time';

/**
 * Housekeeping run by the hourly cron trigger (and by `POST /api/admin/cleanup`):
 *   • delete recordings whose retention window has passed (R2 + DB columns)
 *   • force streams offline when the host stopped sending heartbeats
 *   • close stream sessions that never got an `ended_at`
 *   • purge expired auth sessions, password resets and old telemetry
 */
export interface CleanupReport {
  startedAt: string;
  durationMs: number;
  recordingsDeleted: number;
  streamsEnded: number;
  sessionsClosed: number;
  authSessionsPurged: number;
  resetsPurged: number;
  statsDeleted: number;
  errors: string[];
}

export async function runCleanup(env: Env): Promise<CleanupReport> {
  const started = Date.now();
  const now = nowIso();
  const report: CleanupReport = {
    startedAt: now,
    durationMs: 0,
    recordingsDeleted: 0,
    streamsEnded: 0,
    sessionsClosed: 0,
    authSessionsPurged: 0,
    resetsPurged: 0,
    statsDeleted: 0,
    errors: [],
  };

  /* 1. expired recordings on streams + sessions ------------------------------ */
  for (const table of ['streams', 'stream_sessions'] as const) {
    const { results } = await env.DB.prepare(
      `SELECT id, recording_key FROM ${table}
        WHERE recording_key IS NOT NULL AND recording_expiry IS NOT NULL AND recording_expiry < ?`,
    )
      .bind(now)
      .all<{ id: string; recording_key: string }>();

    for (const row of results ?? []) {
      try {
        await env.RECORDINGS.delete(row.recording_key);
        await env.DB.prepare(
          `UPDATE ${table} SET recording_url = NULL, recording_key = NULL, recording_expiry = NULL WHERE id = ?`,
        )
          .bind(row.id)
          .run();
        report.recordingsDeleted += 1;
      } catch (error) {
        report.errors.push(`recording ${row.recording_key}: ${String(error)}`);
      }
    }
  }

  /* 2. stale live streams ----------------------------------------------------- */
  const staleMinutes = Number(env.STALE_STREAM_MINUTES) || 5;
  const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();

  const stale = await env.DB.prepare(
    `SELECT id FROM streams
      WHERE is_live = 1 AND COALESCE(last_heartbeat, started_at, created_at) < ?`,
  )
    .bind(cutoff)
    .all<{ id: string }>();

  for (const row of stale.results ?? []) {
    await env.DB.prepare(
      `UPDATE streams SET is_live = 0, host_connected = 0, viewer_count = 0,
              ended_at = COALESCE(ended_at, ?), updated_at = ?
        WHERE id = ?`,
    )
      .bind(now, now, row.id)
      .run();
    report.streamsEnded += 1;
  }

  /* 3. sessions that never closed --------------------------------------------- */
  const orphanCutoff = new Date(Date.now() - 12 * 60 * 60_000).toISOString();
  const closed = await env.DB.prepare(
    `UPDATE stream_sessions
        SET ended_at = ?, duration = CAST((strftime('%s', ?) - strftime('%s', started_at)) AS INTEGER)
      WHERE ended_at IS NULL AND started_at < ?`,
  )
    .bind(now, now, orphanCutoff)
    .run();
  report.sessionsClosed = closed.meta?.changes ?? 0;

  /* 4. auth leftovers ---------------------------------------------------------- */
  const authSessions = await env.DB.prepare(
    `DELETE FROM sessions WHERE refresh_expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)`,
  )
    .bind(now, cutoff)
    .run();
  report.authSessionsPurged = authSessions.meta?.changes ?? 0;

  const resets = await env.DB.prepare(`DELETE FROM password_resets WHERE expires_at < ? OR used_at IS NOT NULL`).bind(now).run();
  report.resetsPurged = resets.meta?.changes ?? 0;

  /* 5. telemetry retention (30 days) ------------------------------------------- */
  const statsCutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  const stats = await env.DB.prepare(`DELETE FROM stream_stats WHERE timestamp < ?`).bind(statsCutoff).run();
  report.statsDeleted = stats.meta?.changes ?? 0;

  report.durationMs = Date.now() - started;
  return report;
}
