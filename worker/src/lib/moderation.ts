/**
 * Moderation primitives shared by the API routes, the chat Durable Object and
 * the admin console.
 *
 * Two layers:
 *   1. **Platform moderation** — `bans` rows with `scope = 'site'` plus
 *      `users.is_banned` / `users.suspended_until` for fast checks at sign-in.
 *   2. **Channel moderation** — per-stream `chat_settings` (slow mode,
 *      followers-only, blocked words, …) and `bans` rows with
 *      `scope = 'chat'` (timeouts and channel bans issued by the broadcaster).
 */

import type { Env } from '../env';
import { badRequest, forbidden } from './http';
import { nowIso } from './time';
import { uuid } from './ids';
import { parseJson } from './serialize';

export interface ChatSettings {
  streamId: string;
  slowModeSeconds: number;
  followersOnly: boolean;
  subscribersOnly: boolean;
  emotesOnly: boolean;
  linksAllowed: boolean;
  minAccountAgeMinutes: number;
  blockedWords: string[];
  moderators: string[];
}

export const DEFAULT_CHAT_SETTINGS: Omit<ChatSettings, 'streamId'> = {
  slowModeSeconds: 0,
  followersOnly: false,
  subscribersOnly: false,
  emotesOnly: false,
  linksAllowed: true,
  minAccountAgeMinutes: 0,
  blockedWords: [],
  moderators: [],
};

interface ChatSettingsRow {
  stream_id: string;
  slow_mode_seconds: number | null;
  followers_only: number | null;
  subscribers_only: number | null;
  emotes_only: number | null;
  links_allowed: number | null;
  min_account_age_minutes: number | null;
  blocked_words: string | null;
  moderators: string | null;
}

export async function chatSettingsFor(env: Env, streamId: string): Promise<ChatSettings> {
  const row = await env.DB.prepare(`SELECT * FROM chat_settings WHERE stream_id = ?`).bind(streamId).first<ChatSettingsRow>();
  if (!row) return { streamId, ...DEFAULT_CHAT_SETTINGS };

  return {
    streamId,
    slowModeSeconds: row.slow_mode_seconds ?? 0,
    followersOnly: !!row.followers_only,
    subscribersOnly: !!row.subscribers_only,
    emotesOnly: !!row.emotes_only,
    linksAllowed: row.links_allowed === 0 ? false : true,
    minAccountAgeMinutes: row.min_account_age_minutes ?? 0,
    blockedWords: parseJson<string[]>(row.blocked_words, []),
    moderators: parseJson<string[]>(row.moderators, []),
  };
}

export async function saveChatSettings(env: Env, streamId: string, input: Partial<ChatSettings>): Promise<ChatSettings> {
  const current = await chatSettingsFor(env, streamId);
  const next: ChatSettings = { ...current, ...input, streamId };

  await env.DB.prepare(
    `INSERT INTO chat_settings (stream_id, slow_mode_seconds, followers_only, subscribers_only, emotes_only, links_allowed, min_account_age_minutes, blocked_words, moderators, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (stream_id) DO UPDATE SET
       slow_mode_seconds = excluded.slow_mode_seconds,
       followers_only = excluded.followers_only,
       subscribers_only = excluded.subscribers_only,
       emotes_only = excluded.emotes_only,
       links_allowed = excluded.links_allowed,
       min_account_age_minutes = excluded.min_account_age_minutes,
       blocked_words = excluded.blocked_words,
       moderators = excluded.moderators,
       updated_at = excluded.updated_at`,
  )
    .bind(
      streamId,
      next.slowModeSeconds,
      next.followersOnly ? 1 : 0,
      next.subscribersOnly ? 1 : 0,
      next.emotesOnly ? 1 : 0,
      next.linksAllowed ? 1 : 0,
      next.minAccountAgeMinutes,
      JSON.stringify(next.blockedWords.slice(0, 200)),
      JSON.stringify(next.moderators.slice(0, 50)),
      nowIso(),
    )
    .run();

  return next;
}

/* ---------------------------------- word filter -------------------------------- */

const URL_RE = /(https?:\/\/|www\.)[^\s]+/i;

export interface ModerationVerdict {
  allowed: boolean;
  code?: string;
  message?: string;
}

/** Escapes a word for safe use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function filterMessage(message: string, settings: ChatSettings): ModerationVerdict {
  const text = message.toLowerCase();

  if (!settings.linksAllowed && URL_RE.test(message)) {
    return { allowed: false, code: 'links_blocked', message: 'Links are not allowed in this chat' };
  }

  if (settings.emotesOnly) {
    // Emote-only mode: allow pure emoji/symbol messages.
    const stripped = message.replace(/[\p{Extended_Pictographic}\s\p{Emoji_Presentation}\u200d\ufe0f]/gu, '');
    if (stripped.length > 0) {
      return { allowed: false, code: 'emotes_only', message: 'Only emotes are allowed right now' };
    }
  }

  for (const word of settings.blockedWords) {
    const needle = word.trim().toLowerCase();
    if (!needle) continue;
    // Word-boundary match where possible; plain substring for CJK / emoji.
    const isAsciiWord = /^[a-z0-9 _-]+$/.test(needle);
    const pattern = isAsciiWord ? new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`, 'i') : new RegExp(escapeRegExp(needle), 'i');
    if (pattern.test(text)) {
      return { allowed: false, code: 'blocked_word', message: 'That message contains a word the broadcaster blocked' };
    }
  }

  return { allowed: true };
}

/* ----------------------------------- bans ------------------------------------- */

export interface BanInput {
  userId: string;
  scope?: 'site' | 'chat';
  streamId?: string | null;
  kind?: 'ban' | 'timeout';
  reason?: string | null;
  issuedBy?: string | null;
  /** Minutes from now; omit for a permanent ban. */
  durationMinutes?: number | null;
  notify?: boolean;
}

export interface ActiveBan {
  id: string;
  scope: string;
  stream_id: string | null;
  kind: string;
  reason: string | null;
  expires_at: string | null;
}

export async function activeBan(env: Env, userId: string, streamId?: string | null): Promise<ActiveBan | null> {
  const now = nowIso();
  const row = await env.DB.prepare(
    `SELECT id, scope, stream_id, kind, reason, expires_at FROM bans
      WHERE user_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
        AND (scope = 'site' OR (? IS NOT NULL AND stream_id = ?))
      ORDER BY CASE scope WHEN 'site' THEN 0 ELSE 1 END, created_at DESC
      LIMIT 1`,
  )
    .bind(userId, now, streamId ?? null, streamId ?? null)
    .first<ActiveBan>();

  return row ?? null;
}

export async function isSiteBanned(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT 1 AS ok FROM users WHERE id = ? AND (is_banned = 1 OR (suspended_until IS NOT NULL AND suspended_until > ?))`)
    .bind(userId, nowIso())
    .first<{ ok: number }>();
  return !!row;
}

export async function issueBan(env: Env, input: BanInput): Promise<string> {
  const id = uuid();
  const expiresAt = input.durationMinutes ? new Date(Date.now() + input.durationMinutes * 60_000).toISOString() : null;

  await env.DB.prepare(
    `INSERT INTO bans (id, user_id, scope, stream_id, kind, reason, issued_by, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.userId,
      input.scope ?? 'site',
      input.streamId ?? null,
      input.kind ?? 'ban',
      input.reason ?? null,
      input.issuedBy ?? null,
      expiresAt,
      nowIso(),
    )
    .run();

  // Site-level bans are mirrored onto the user row so sign-in can reject them
  // without an extra join.
  if ((input.scope ?? 'site') === 'site' && (input.kind ?? 'ban') === 'ban') {
    await env.DB.prepare(`UPDATE users SET is_banned = 1, ban_reason = ?, suspended_until = ?, updated_at = ? WHERE id = ?`)
      .bind(input.reason ?? null, expiresAt, nowIso(), input.userId)
      .run();
  }

  return id;
}

export async function revokeBan(env: Env, banId: string, revokedBy: string | null): Promise<boolean> {
  const ban = await env.DB.prepare(`SELECT user_id, scope FROM bans WHERE id = ?`).bind(banId).first<{ user_id: string; scope: string }>();
  if (!ban) return false;

  await env.DB.prepare(`UPDATE bans SET revoked_at = ?, revoked_by = ? WHERE id = ?`).bind(nowIso(), revokedBy, banId).run();

  if (ban.scope === 'site') {
    const remaining = await env.DB.prepare(
      `SELECT 1 AS ok FROM bans WHERE user_id = ? AND scope = 'site' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?) LIMIT 1`,
    )
      .bind(ban.user_id, nowIso())
      .first<{ ok: number }>();
    if (!remaining) {
      await env.DB.prepare(`UPDATE users SET is_banned = 0, ban_reason = NULL, suspended_until = NULL, updated_at = ? WHERE id = ?`)
        .bind(nowIso(), ban.user_id)
        .run();
    }
  }

  return true;
}

/* ------------------------------- chat admission -------------------------------- */

export interface ChatActor {
  id: string;
  username: string;
  isAdmin?: boolean;
  /** Account creation timestamp (ISO). */
  createdAt?: string | null;
}

export interface ChatAdmission extends ModerationVerdict {
  /** Set when an active ban/timeout blocks the actor. */
  banned?: boolean;
  until?: string | null;
  slowModeUntil?: string | null;
}

/**
 * Full admission check for posting a chat message:
 * ban → channel rules → content filter → slow mode.
 */
export async function admitChatMessage(
  env: Env,
  streamId: string,
  streamOwnerId: string,
  actor: ChatActor,
  message: string,
): Promise<ChatAdmission> {
  const isOwner = actor.id === streamOwnerId;

  if (!isOwner && !actor.isAdmin) {
    const ban = await activeBan(env, actor.id, streamId);
    if (ban) {
      return {
        allowed: false,
        banned: true,
        until: ban.expires_at,
        code: 'banned_from_chat',
        message: ban.kind === 'timeout' ? 'You are timed out in this chat' : 'You are banned from this chat',
      };
    }
  }

  const settings = await chatSettingsFor(env, streamId);

  if (!isOwner && !actor.isAdmin && !settings.moderators.includes(actor.id)) {
    if (settings.followersOnly) {
      const following = await env.DB.prepare(`SELECT 1 AS ok FROM followers WHERE follower_id = ? AND following_id = ?`)
        .bind(actor.id, streamOwnerId)
        .first<{ ok: number }>();
      if (!following) {
        return { allowed: false, code: 'followers_only', message: 'Only followers can chat right now' };
      }
    }

    if (settings.minAccountAgeMinutes > 0 && actor.createdAt) {
      const ageMinutes = (Date.now() - new Date(actor.createdAt).getTime()) / 60_000;
      if (ageMinutes < settings.minAccountAgeMinutes) {
        return {
          allowed: false,
          code: 'account_too_new',
          message: `Your account must be at least ${settings.minAccountAgeMinutes} minutes old to chat here`,
        };
      }
    }

    const verdict = filterMessage(message, settings);
    if (!verdict.allowed) return verdict;

    if (settings.slowModeSeconds > 0) {
      const last = await env.DB.prepare(
        `SELECT created_at FROM chat_messages WHERE stream_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
        .bind(streamId, actor.id)
        .first<{ created_at: string }>();

      if (last) {
        const elapsed = (Date.now() - new Date(last.created_at).getTime()) / 1000;
        if (elapsed < settings.slowModeSeconds) {
          const until = new Date(new Date(last.created_at).getTime() + settings.slowModeSeconds * 1000).toISOString();
          return { allowed: false, code: 'slow_mode', message: `Slow mode: wait ${Math.ceil(settings.slowModeSeconds - elapsed)}s`, slowModeUntil: until };
        }
      }
    }
  }

  return { allowed: true };
}

/** Throws the right HTTP error for a failed admission verdict. */
export function assertAdmitted(verdict: ChatAdmission): void {
  if (verdict.allowed) return;
  if (verdict.banned) throw forbidden(verdict.message ?? 'You cannot chat in this channel');
  throw badRequest(verdict.message ?? 'Message rejected by chat rules', verdict.code);
}
