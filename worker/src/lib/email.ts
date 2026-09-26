/**
 * Transactional email: templated messages, a durable outbox and pluggable
 * providers.
 *
 * Flow
 *   1. `sendEmail()` renders + enqueues a row in `email_outbox` (never blocks a
 *      user request on a third-party API).
 *   2. The hourly cron (and `POST /api/admin/email/flush`) calls `drainOutbox()`
 *      which delivers with retries and records the provider message id.
 *
 * Adding a provider = setting env vars (see `integrationStatus()` in config.ts):
 *   RESEND_API_KEY | POSTMARK_SERVER_TOKEN | SENDGRID_API_KEY |
 *   MAILCHANNELS_API_KEY | EMAIL_WEBHOOK_URL
 *
 * With no provider configured, mail stays queued (status remains `queued`) and
 * the health endpoint reports email as "not configured" — nothing is lost, so
 * turning the key on later flushes the backlog.
 */

import type { Env } from '../env';
import { emailConfig, brandConfig, limitsConfig, type EmailConfig } from './config';
import { uuid } from './ids';
import { log } from './logger';
import { escapeHtml } from './security';
import { nowIso } from './time';

/* --------------------------------- templates --------------------------------- */

export type EmailTemplate =
  | 'system'
  | 'welcome'
  | 'verify-email'
  | 'reset-password'
  | 'password-changed'
  | 'new-follower'
  | 'stream-live'
  | 'scheduled-reminder'
  | 'tip-received'
  | 'moderation-action'
  | 'account-deleted'
  | 'data-export-ready'
  | 'weekly-digest'
  | 'test';

export interface EmailPayload {
  to: string;
  toName?: string | null;
  template: EmailTemplate;
  subject: string;
  heading: string;
  /** Paragraphs of plain text — escaped automatically. */
  paragraphs?: string[];
  /** Pre-escaped HTML block (buttons, tables). */
  html?: string;
  /** Call-to-action button. */
  action?: { label: string; url: string };
  /** Small print below the CTA. */
  footnote?: string;
  replyTo?: string | null;
  /** Delay delivery (ISO string) — used by the digest and reminders. */
  scheduledAt?: string;
}

/* ---------------------------------- layout ----------------------------------- */

function layout(env: Env, payload: EmailPayload): string {
  const brand = brandConfig(env);
  const body = (payload.paragraphs ?? [])
    .map((text) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#d7d7de;">${escapeHtml(text)}</p>`)
    .join('');

  const action = payload.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border-radius:999px;background:linear-gradient(120deg,#7c5cff,#38bdf8);">
         <a href="${escapeHtml(payload.action.url)}" style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:600;color:#0b0b12;text-decoration:none;">${escapeHtml(payload.action.label)}</a>
       </td></tr></table>`
    : '';

  const footnote = payload.footnote
    ? `<p style="margin:20px 0 0;font-size:12px;line-height:18px;color:#8b8b99;">${escapeHtml(payload.footnote)}</p>`
    : '';

  const socials = Object.entries(brand.socials).filter(([, url]) => !!url);
  const socialRow = socials.length
    ? `<p style="margin:16px 0 0;font-size:12px;color:#8b8b99;">${socials
        .map(([name, url]) => `<a href="${escapeHtml(url)}" style="color:#8b8b99;text-decoration:underline;">${escapeHtml(name)}</a>`)
        .join(' &nbsp;·&nbsp; ')}</p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(payload.subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:#0b0b12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#12121b;border:1px solid #24243a;border-radius:18px;overflow:hidden;">
      <tr><td style="padding:28px 32px 8px;">
        <p style="margin:0;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#7c5cff;font-weight:700;">${escapeHtml(brand.name)}</p>
        <h1 style="margin:12px 0 20px;font-size:24px;line-height:32px;color:#f5f5fa;font-weight:700;">${escapeHtml(payload.heading)}</h1>
      </td></tr>
      <tr><td style="padding:0 32px 28px;">
        ${body}
        ${payload.html ?? ''}
        ${action}
        ${footnote}
      </td></tr>
      <tr><td style="padding:18px 32px 24px;border-top:1px solid #24243a;">
        <p style="margin:0;font-size:12px;line-height:18px;color:#8b8b99;">
          ${escapeHtml(brand.name)} — ${escapeHtml(brand.tagline)}<br>
          ${brand.supportEmail ? `Questions? <a href="mailto:${escapeHtml(brand.supportEmail)}" style="color:#8b8b99;">${escapeHtml(brand.supportEmail)}</a>` : ''}
        </p>
        ${socialRow}
      </td></tr>
    </table>
    <p style="margin:14px 0 0;font-size:11px;color:#5c5c6b;">
      You are receiving this because you have an account on ${escapeHtml(brand.name)}.
      ${brand.url ? `Manage your notification preferences at <a href="${escapeHtml(brand.url)}/settings" style="color:#5c5c6b;">${escapeHtml(brand.url)}/settings</a>.` : ''}
    </p>
  </td></tr></table>
</body></html>`;
}

function plainText(payload: EmailPayload): string {
  const lines = [payload.heading, ''];
  for (const paragraph of payload.paragraphs ?? []) lines.push(paragraph, '');
  if (payload.action) lines.push(`${payload.action.label}: ${payload.action.url}`, '');
  if (payload.footnote) lines.push(payload.footnote, '');
  return lines.join('\n').trim();
}

/* ---------------------------------- outbox ----------------------------------- */

export interface QueuedEmail {
  id: string;
  to: string;
  template: EmailTemplate;
}

export async function sendEmail(env: Env, payload: EmailPayload): Promise<QueuedEmail | null> {
  const to = payload.to?.trim();
  if (!to) return null;

  const config = emailConfig(env);
  const id = uuid();
  const html = layout(env, payload);
  const text = plainText(payload);

  try {
    await env.DB.prepare(
      `INSERT INTO email_outbox (id, to_email, to_name, template, subject, html, text, reply_to, status, scheduled_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
    )
      .bind(
        id,
        to,
        payload.toName ?? null,
        payload.template,
        payload.subject,
        html,
        text,
        payload.replyTo ?? config.replyTo,
        payload.scheduledAt ?? nowIso(),
        nowIso(),
      )
      .run();
  } catch (error) {
    log.error('failed to enqueue email', { template: payload.template, to, error: String(error) });
    return null;
  }

  return { id, to, template: payload.template };
}

/** Enqueue + attempt immediate delivery (used for password resets). */
export async function sendEmailNow(env: Env, payload: EmailPayload): Promise<boolean> {
  const queued = await sendEmail(env, payload);
  if (!queued) return false;
  if (!emailConfig(env).configured) return false;
  const report = await drainOutbox(env, 1, queued.id);
  return report.sent > 0;
}

/* -------------------------------- delivery ----------------------------------- */

interface OutboxRow {
  id: string;
  to_email: string;
  to_name: string | null;
  template: string;
  subject: string;
  html: string;
  text: string | null;
  reply_to: string | null;
  attempts: number;
}

export interface OutboxReport {
  picked: number;
  sent: number;
  failed: number;
  skipped: boolean;
  errors: string[];
}

export async function drainOutbox(env: Env, limit = Number(env.EMAIL_BATCH_SIZE) || 25, onlyId?: string): Promise<OutboxReport> {
  const config = emailConfig(env);
  const report: OutboxReport = { picked: 0, sent: 0, failed: 0, skipped: false, errors: [] };

  if (!config.configured) {
    report.skipped = true;
    return report;
  }

  const maxAttempts = Number(env.EMAIL_MAX_ATTEMPTS) || 5;
  const now = nowIso();

  const { results } = onlyId
    ? await env.DB.prepare(`SELECT * FROM email_outbox WHERE id = ?`).bind(onlyId).all<OutboxRow>()
    : await env.DB.prepare(
        `SELECT * FROM email_outbox
          WHERE status = 'queued' AND scheduled_at <= ? AND attempts < ?
          ORDER BY scheduled_at ASC LIMIT ?`,
      )
        .bind(now, maxAttempts, limit)
        .all<OutboxRow>();

  for (const row of results ?? []) {
    report.picked += 1;

    // Staging safety valve: redirect every message to one inbox.
    const recipient = env.EMAIL_OVERRIDE_TO?.trim() || row.to_email;

    const result = await deliver(config, {
      to: recipient,
      toName: row.to_name,
      subject: env.EMAIL_OVERRIDE_TO ? `[to:${row.to_email}] ${row.subject}` : row.subject,
      html: row.html,
      text: row.text,
      replyTo: row.reply_to,
    });

    if (result.ok) {
      report.sent += 1;
      await env.DB.prepare(
        `UPDATE email_outbox SET status = 'sent', attempts = attempts + 1, sent_at = ?, provider = ?, provider_message_id = ?, last_error = NULL WHERE id = ?`,
      )
        .bind(nowIso(), config.provider, result.messageId ?? null, row.id)
        .run();
    } else {
      report.failed += 1;
      report.errors.push(`${row.id}: ${result.error}`);
      const attempts = row.attempts + 1;
      await env.DB.prepare(
        `UPDATE email_outbox SET status = ?, attempts = ?, last_error = ?, provider = ?, scheduled_at = ? WHERE id = ?`,
      )
        .bind(
          attempts >= maxAttempts ? 'failed' : 'queued',
          attempts,
          result.error ?? 'unknown error',
          config.provider,
          new Date(Date.now() + attempts * 60_000).toISOString(), // linear backoff
          row.id,
        )
        .run();
    }
  }

  if (report.picked) log.info('email outbox drained', { ...report, errors: report.errors.slice(0, 5) });
  return report;
}

interface DeliveryInput {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  text?: string | null;
  replyTo?: string | null;
}

async function deliver(config: EmailConfig, input: DeliveryInput): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const from = config.fromName ? `${config.fromName} <${config.from}>` : config.from;

  try {
    switch (config.provider) {
      case 'resend': {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            from,
            to: [input.to],
            subject: input.subject,
            html: input.html,
            text: input.text ?? undefined,
            reply_to: input.replyTo ?? undefined,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
        return response.ok ? { ok: true, messageId: payload.id } : { ok: false, error: payload.message ?? `HTTP ${response.status}` };
      }

      case 'postmark': {
        const response = await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: { 'X-Postmark-Server-Token': config.apiKey ?? '', 'content-type': 'application/json' },
          body: JSON.stringify({
            From: from,
            To: input.to,
            Subject: input.subject,
            HtmlBody: input.html,
            TextBody: input.text ?? undefined,
            ReplyTo: input.replyTo ?? undefined,
            MessageStream: config.messageStream,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as { MessageID?: string; Message?: string };
        return response.ok ? { ok: true, messageId: payload.MessageID } : { ok: false, error: payload.Message ?? `HTTP ${response.status}` };
      }

      case 'sendgrid': {
        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: input.to, name: input.toName ?? undefined }] }],
            from: { email: config.from, name: config.fromName },
            reply_to: input.replyTo ? { email: input.replyTo } : undefined,
            subject: input.subject,
            content: [
              ...(input.text ? [{ type: 'text/plain', value: input.text }] : []),
              { type: 'text/html', value: input.html },
            ],
          }),
        });
        return response.ok ? { ok: true } : { ok: false, error: `HTTP ${response.status} ${await response.text()}` };
      }

      case 'mailchannels': {
        const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'X-Api-Key': config.apiKey ?? '' },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: input.to, name: input.toName ?? undefined }] }],
            from: { email: config.from, name: config.fromName },
            reply_to: input.replyTo ? { email: input.replyTo } : undefined,
            subject: input.subject,
            content: [{ type: 'text/html', value: input.html }],
          }),
        });
        return response.ok ? { ok: true } : { ok: false, error: `HTTP ${response.status}` };
      }

      case 'webhook': {
        const response = await fetch(config.webhookUrl ?? '', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(config.webhookToken ? { authorization: `Bearer ${config.webhookToken}` } : {}),
          },
          body: JSON.stringify({
            to: input.to,
            toName: input.toName,
            from: config.from,
            fromName: config.fromName,
            replyTo: input.replyTo,
            subject: input.subject,
            html: input.html,
            text: input.text,
          }),
        });
        return response.ok ? { ok: true } : { ok: false, error: `HTTP ${response.status}` };
      }

      default:
        return { ok: false, error: 'no email provider configured' };
    }
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/* ------------------------------ typed composers -------------------------------
 * Keeping every subject/body in one place makes tone + legal wording consistent
 * and trivially reviewable.
 * ---------------------------------------------------------------------------- */

export function emailComposers(env: Env) {
  const brand = brandConfig(env);
  const limits = limitsConfig(env);
  const base = brand.url ?? env.APP_URL ?? '';

  return {
    welcome: (to: string, username: string) =>
      ({
        to,
        template: 'welcome' as const,
        subject: `Welcome to ${brand.name}, ${username}!`,
        heading: `You're on air, ${username}.`,
        paragraphs: [
          `${brand.name} lets you broadcast peer-to-peer with almost no latency — open a room, share the link, and your audience connects directly to you.`,
          'A few things to try first:',
          '• Set up your profile so viewers know who they are watching.',
          '• Create a stream, then hit "Go live" — nothing to install.',
          '• Schedule a session so followers get a reminder before you start.',
        ],
        action: base ? { label: 'Open your dashboard', url: `${base}/dashboard` } : undefined,
        footnote: `You can change which emails you receive in Settings → Notifications.`,
      }) satisfies EmailPayload,

    verifyEmail: (to: string, username: string, url: string) =>
      ({
        to,
        toName: username,
        template: 'verify-email' as const,
        subject: `Confirm your email for ${brand.name}`,
        heading: 'Confirm your email address',
        paragraphs: [
          `Hi ${username}, click the button below to verify this email address. The link expires in 24 hours.`,
        ],
        action: { label: 'Verify email', url },
        footnote: "If you didn't create this account you can safely ignore this email.",
      }) satisfies EmailPayload,

    resetPassword: (to: string, url: string) =>
      ({
        to,
        template: 'reset-password' as const,
        subject: `Reset your ${brand.name} password`,
        heading: 'Reset your password',
        paragraphs: [
          'We received a request to reset the password for your account. Click the button below to choose a new one — the link expires in one hour.',
        ],
        action: { label: 'Choose a new password', url },
        footnote: "If you didn't request this, ignore this email — your password stays unchanged.",
      }) satisfies EmailPayload,

    passwordChanged: (to: string, username: string) =>
      ({
        to,
        toName: username,
        template: 'password-changed' as const,
        subject: 'Your password was changed',
        heading: 'Your password was changed',
        paragraphs: [
          'The password for your account was just changed. For your security, every other signed-in device has been signed out.',
          "If this wasn't you, reset your password immediately and contact support.",
        ],
        action: base ? { label: 'Secure my account', url: `${base}/forgot-password` } : undefined,
      }) satisfies EmailPayload,

    newFollower: (to: string, viewerName: string, followerName: string) =>
      ({
        to,
        toName: viewerName,
        template: 'new-follower' as const,
        subject: `${followerName} started following you`,
        heading: `${followerName} just followed your channel`,
        paragraphs: ['They will get a notification next time you go live. Keep the momentum going!'],
        action: base ? { label: 'View your profile', url: `${base}/profile/${encodeURIComponent(viewerName)}` } : undefined,
      }) satisfies EmailPayload,

    streamLive: (to: string, viewerName: string, streamerName: string, title: string, url: string) =>
      ({
        to,
        toName: viewerName,
        template: 'stream-live' as const,
        subject: `🔴 ${streamerName} is live: ${title}`,
        heading: `${streamerName} is live now`,
        paragraphs: [`"${title}" just started. Jump in while it's live.`],
        action: { label: 'Watch now', url },
      }) satisfies EmailPayload,

    scheduledReminder: (to: string, viewerName: string, streamerName: string, title: string, when: string, url: string) =>
      ({
        to,
        toName: viewerName,
        template: 'scheduled-reminder' as const,
        subject: `${streamerName} goes live ${when}`,
        heading: `${streamerName} has a session coming up`,
        paragraphs: [`"${title}" is scheduled ${when}. You asked to be reminded.`],
        action: { label: 'Set a reminder / watch', url },
      }) satisfies EmailPayload,

    tipReceived: (to: string, streamerName: string, amount: string, from: string, message: string | null, url: string) =>
      ({
        to,
        toName: streamerName,
        template: 'tip-received' as const,
        subject: `You received ${amount} from ${from}`,
        heading: `You received ${amount}`,
        paragraphs: [`${from} supported your stream.`, ...(message ? [`"${message}"`] : [])],
        action: { label: 'Open earnings', url },
      }) satisfies EmailPayload,

    moderation: (to: string, username: string, action: string, reason: string | null, until: string | null, url: string) =>
      ({
        to,
        toName: username,
        template: 'moderation-action' as const,
        subject: `Moderation notice: ${action}`,
        heading: `Your account received a moderation action`,
        paragraphs: [
          `Action: ${action}.`,
          ...(reason ? [`Reason: ${reason}`] : []),
          ...(until ? [`This action lifts on ${until}.`] : []),
          'You can appeal this decision by replying to this email.',
        ],
        action: { label: 'Review the community guidelines', url },
      }) satisfies EmailPayload,

    accountDeleted: (to: string, username: string) =>
      ({
        to,
        toName: username,
        template: 'account-deleted' as const,
        subject: `Your ${brand.name} account was deleted`,
        heading: 'Your account has been deleted',
        paragraphs: [
          `We're sorry to see you go, ${username}. Your profile, streams, recordings and chat history have been removed.`,
          'Aggregated, anonymised analytics may be retained for reporting. Backups expire within 30 days.',
        ],
        footnote: brand.supportEmail ? `If you did not request this, contact ${brand.supportEmail} immediately.` : undefined,
      }) satisfies EmailPayload,

    dataExportReady: (to: string, username: string, url: string, expiresInHours: number) =>
      ({
        to,
        toName: username,
        template: 'data-export-ready' as const,
        subject: 'Your data export is ready',
        heading: 'Your data export is ready',
        paragraphs: [`The archive with your account data is ready. The download link expires in ${expiresInHours} hours.`],
        action: { label: 'Download my data', url },
      }) satisfies EmailPayload,

    weeklyDigest: (to: string, username: string, stats: { streams: number; minutes: number; viewers: number; followers: number }, url: string) =>
      ({
        to,
        toName: username,
        template: 'weekly-digest' as const,
        subject: `Your week on ${brand.name}`,
        heading: 'Your week in numbers',
        paragraphs: [
          `You ran ${stats.streams} session${stats.streams === 1 ? '' : 's'} for ${stats.minutes} minutes.`,
          `${stats.viewers} watch-minutes were logged and you gained ${stats.followers} new follower${stats.followers === 1 ? '' : 's'}.`,
          limits.recordingRetentionHours
            ? `Reminder: recordings are kept for ${limits.recordingRetentionHours} hours by default — turn a replay into a permanent VOD from your library.`
            : '',
        ].filter(Boolean),
        action: { label: 'Open analytics', url },
      }) satisfies EmailPayload,

    test: (to: string) =>
      ({
        to,
        template: 'test' as const,
        subject: `${brand.name} email delivery test`,
        heading: 'Email delivery is working 🎉',
        paragraphs: ['This message confirms that the email provider configured for your deployment can deliver mail.'],
      }) satisfies EmailPayload,
  };
}
