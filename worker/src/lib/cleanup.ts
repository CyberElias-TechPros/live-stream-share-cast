import type { Env } from '../env';
import { nowIso } from './time';
import { drainOutbox } from './email';
import { pruneNotifications, queueWeeklyDigests, sendScheduledReminders } from './notifications';
import { rollupAnalytics } from './analytics';
import { log } from './logger';

/**
 * Housekeeping run by the hourly cron trigger (and by `POST /api/admin/cleanup`):
 *
 *   1. delete recordings whose retention window has passed (R2 + DB columns)
 *   2. force streams offline when the host stopped sending heartbeats
 *   3. close stream sessions that never got an `ended_at`
 *   4. purge expired auth sessions, password resets and old telemetry
 *   5. deliver queued email (outbox) and send upcoming-session reminders
 *   6. fold watch sessions into daily analytics
 *   7. prune notifications, expired bans, login attempts and client errors
 *   8. hard-delete accounts that asked to be erased more than 30 days ago
 *
 * Weekly (Mondays): queue creator digests.
 */
export interface CleanupReport {
  startedAt: string;
  durationMs: number;
  recordingsDeleted: number;
  streamRecordingsDeleted: number;
  streamsEnded: number;
  sessionsClosed: number;
  authSessionsPurged: number;
  resetsPurged: number;
  statsDeleted: number;
  email: { sent: number; failed: number; picked: number; skipped: boolean };
  remindersSent: number;
  analyticsRows: number;
  notificationsPruned: number;
  bansPurged: number;
  loginAttemptsPurged: number;
  clientErrorsPurged: number;
  watchSessionsPurged: number;
  accountsPurged: number;
  digestsQueued: number;
  errors: string[];
}

export async function runCleanup(env: Env, options: { weekly?: boolean } = {}): Promise<CleanupReport> {
  const started = Date.now();
  const now = nowIso();
  const report: CleanupReport = {
    startedAt: now,
    durationMs: 0,
    recordingsDeleted: 0,
    streamRecordingsDeleted: 0,
    streamsEnded: 0,
    sessionsClosed: 0,
    authSessionsPurged: 0,
    resetsPurged: 0,
    statsDeleted: 0,
    email: { sent: 0, failed: 0, picked: 0, skipped: false },
    remindersSent: 0,
    analyticsRows: 0,
    notificationsPruned: 0,
    bansPurged: 0,
    loginAttemptsPurged: 0,
    clientErrorsPurged: 0,
    watchSessionsPurged: 0,
    accountsPurged: 0,
    digestsQueued: 0,
    errors: [],
  };

  /* 1. expired recordings ---------------------------------------------------- */

  // 1a. VOD library rows.
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, r2_key FROM recordings
        WHERE status = 'ready' AND retention_expires_at IS NOT NULL AND retention_expires_at < ?`,
    )
      .bind(now)
      .all<{ id: string; r2_key: string }>();

    for (const row of results ?? []) {
      try {
        const shared = await env.DB.prepare(
          `SELECT COUNT(*) AS count FROM recordings WHERE r2_key = ? AND id != ? AND retention_expires_at IS NOT NULL`,
        )
          .bind(row.r2_key, row.id)
          .first<{ count: number }>();
        // Keep the bytes when a clip (or another copy) still references them.
        if (!shared?.count) await env.RECORDINGS.delete(row.r2_key).catch(() => undefined);

        await env.DB.prepare(`DELETE FROM recordings WHERE id = ?`).bind(row.id).run();
        await env.DB.prepare(`UPDATE streams SET recording_id = NULL WHERE recording_id = ?`).bind(row.id).run();
        report.recordingsDeleted += 1;
      } catch (error) {
        report.errors.push(`recording ${row.id}: ${String(error)}`);
      }
    }
  } catch (error) {
    report.errors.push(`recordings sweep: ${String(error)}`);
  }

  // 1b. Legacy stream-session columns.
  for (const table of ['streams', 'stream_sessions'] as const) {
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, recording_key FROM ${table}
          WHERE recording_key IS NOT NULL AND recording_expiry IS NOT NULL AND recording_expiry < ?`,
      )
        .bind(now)
        .all<{ id: string; recording_key: string }>();

      for (const row of results ?? []) {
        const stillReferenced = await env.DB.prepare(`SELECT 1 AS ok FROM recordings WHERE r2_key = ? LIMIT 1`)
          .bind(row.recording_key)
          .first<{ ok: number }>();
        if (!stillReferenced) await env.RECORDINGS.delete(row.recording_key).catch(() => undefined);

        await env.DB.prepare(`UPDATE ${table} SET recording_url = NULL, recording_key = NULL, recording_expiry = NULL WHERE id = ?`)
          .bind(row.id)
          .run();
        report.streamRecordingsDeleted += 1;
      }
    } catch (error) {
      report.errors.push(`${table} recordings: ${String(error)}`);
    }
  }

  /* 2. stale live streams ---------------------------------------------------- */
  const staleMinutes = Number(env.STALE_STREAM_MINUTES) || 5;
  const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();

  try {
    const stale = await env.DB.prepare(
      `SELECT id FROM streams WHERE is_live = 1 AND COALESCE(last_heartbeat, started_at, created_at) < ?`,
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
  } catch (error) {
    report.errors.push(`stale streams: ${String(error)}`);
  }

  /* 3. sessions that never closed -------------------------------------------- */
  try {
    const orphanCutoff = new Date(Date.now() - 12 * 60 * 60_000).toISOString();
    const closed = await env.DB.prepare(
      `UPDATE stream_sessions
          SET ended_at = ?, duration = CAST((strftime('%s', ?) - strftime('%s', started_at)) AS INTEGER)
        WHERE ended_at IS NULL AND started_at < ?`,
    )
      .bind(now, now, orphanCutoff)
      .run();
    report.sessionsClosed = closed.meta?.changes ?? 0;
  } catch (error) {
    report.errors.push(`orphan sessions: ${String(error)}`);
  }

  /* 4. auth + telemetry retention -------------------------------------------- */
  try {
    const authSessions = await env.DB.prepare(
      `DELETE FROM sessions WHERE refresh_expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)`,
    )
      .bind(now, cutoff)
      .run();
    report.authSessionsPurged = authSessions.meta?.changes ?? 0;

    const resets = await env.DB.prepare(`DELETE FROM password_resets WHERE expires_at < ? OR used_at IS NOT NULL`).bind(now).run();
    report.resetsPurged = resets.meta?.changes ?? 0;

    const emailTokens = await env.DB.prepare(`DELETE FROM email_tokens WHERE expires_at < ? OR used_at IS NOT NULL`).bind(now).run();
    report.resetsPurged += emailTokens.meta?.changes ?? 0;

    const statsCutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
    const stats = await env.DB.prepare(`DELETE FROM stream_stats WHERE timestamp < ?`).bind(statsCutoff).run();
    report.statsDeleted = stats.meta?.changes ?? 0;

    const loginCutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
    const logins = await env.DB.prepare(`DELETE FROM login_attempts WHERE created_at < ?`).bind(loginCutoff).run();
    report.loginAttemptsPurged = logins.meta?.changes ?? 0;

    const errors = await env.DB.prepare(`DELETE FROM client_errors WHERE created_at < ?`).bind(statsCutoff).run();
    report.clientErrorsPurged = errors.meta?.changes ?? 0;

    // Watch sessions older than 90 days are aggregated into analytics_daily by
    // then; keeping the raw rows forever would dwarf every other table.
    const watchCutoff = new Date(Date.now() - 90 * 24 * 60 * 60_000).toISOString();
    const watch = await env.DB.prepare(`DELETE FROM watch_sessions WHERE joined_at < ?`).bind(watchCutoff).run();
    report.watchSessionsPurged = watch.meta?.changes ?? 0;

    const bans = await env.DB.prepare(
      `DELETE FROM bans WHERE (expires_at IS NOT NULL AND expires_at < ?) OR (revoked_at IS NOT NULL AND revoked_at < ?)`,
    )
      .bind(cutoff, cutoff)
      .run();
    report.bansPurged = bans.meta?.changes ?? 0;
  } catch (error) {
    report.errors.push(`retention: ${String(error)}`);
  }

  /* 5. email outbox + scheduled reminders ------------------------------------ */
  try {
    const emailReport = await drainOutbox(env);
    report.email = { sent: emailReport.sent, failed: emailReport.failed, picked: emailReport.picked, skipped: emailReport.skipped };
  } catch (error) {
    report.errors.push(`email drain: ${String(error)}`);
  }

  try {
    report.remindersSent = await sendScheduledReminders(env);
  } catch (error) {
    report.errors.push(`reminders: ${String(error)}`);
  }

  /* 6. analytics rollup ------------------------------------------------------ */
  try {
    report.analyticsRows = await rollupAnalytics(env, 3);
  } catch (error) {
    report.errors.push(`analytics: ${String(error)}`);
  }

  /* 7. notifications --------------------------------------------------------- */
  try {
    report.notificationsPruned = await pruneNotifications(env);
  } catch (error) {
    report.errors.push(`notifications: ${String(error)}`);
  }

  /* 8. purge erased accounts past the backup window -------------------------- */
  try {
    const purgeBefore = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
    const { results } = await env.DB.prepare(`SELECT id FROM users WHERE deleted_at IS NOT NULL AND deleted_at < ? LIMIT 50`)
      .bind(purgeBefore)
      .all<{ id: string }>();

    for (const row of results ?? []) {
      await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(row.id).run();
      report.accountsPurged += 1;
    }
  } catch (error) {
    report.errors.push(`account purge: ${String(error)}`);
  }

  /* 9. weekly digest --------------------------------------------------------- */
  if (options.weekly) {
    try {
      report.digestsQueued = await queueWeeklyDigests(env);
    } catch (error) {
      report.errors.push(`digests: ${String(error)}`);
    }
  }

  report.durationMs = Date.now() - started;
  log.info('cleanup complete', { ...report, errors: report.errors.slice(0, 5) });
  return report;
}
