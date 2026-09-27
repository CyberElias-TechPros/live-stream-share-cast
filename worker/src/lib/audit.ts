/**
 * Audit trail.
 *
 * Every privileged action (moderation, admin, account deletion, payouts, token
 * creation) writes one immutable row. The admin console reads it; nothing ever
 * updates or deletes it outside of the retention job.
 */

import type { Env } from '../env';
import { uuid } from './ids';
import { log } from './logger';
import { nowIso } from './time';

export type AuditAction =
  | 'user.banned'
  | 'user.unbanned'
  | 'user.suspended'
  | 'user.role_changed'
  | 'user.deleted'
  | 'user.exported'
  | 'stream.started'
  | 'stream.ended'
  | 'stream.force_ended'
  | 'stream.deleted'
  | 'chat.cleared'
  | 'chat.restricted'
  | 'chat.unrestricted'
  | 'chat.rules_updated'
  | 'recording.deleted'
  | 'recording.visibility_changed'
  | 'report.created'
  | 'report.updated'
  | 'tip.paid'
  | 'tip.refunded'
  | 'token.created'
  | 'token.revoked'
  | 'webhook.created'
  | 'webhook.deleted'
  | 'flag.updated'
  | 'category.updated'
  | 'admin.cleanup'
  | 'admin.email_flush'
  | 'auth.password_changed';

export interface AuditInput {
  actorId?: string | null;
  actorRole?: 'user' | 'moderator' | 'admin' | 'system';
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(env: Env, input: AuditInput): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log (id, actor_id, actor_role, action, target_type, target_id, metadata, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        uuid(),
        input.actorId ?? null,
        input.actorRole ?? 'user',
        input.action,
        input.targetType ?? null,
        input.targetId ?? null,
        input.metadata === undefined ? null : JSON.stringify(input.metadata).slice(0, 4000),
        input.ip ?? null,
        input.userAgent?.slice(0, 300) ?? null,
        nowIso(),
      )
      .run();
  } catch (error) {
    // Never let auditing break the request it describes.
    log.warn('audit write failed', { action: input.action, error: String(error) });
  }
}

export interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: string | null;
  ip: string | null;
  created_at: string;
}

export function auditEntry(row: AuditRow) {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: row.metadata,
    ip: row.ip,
    createdAt: row.created_at,
  };
}
