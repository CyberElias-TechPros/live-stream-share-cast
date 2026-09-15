import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { uuid } from '../lib/ids';
import { nowIso } from '../lib/time';

/**
 * One ChatRoom Durable Object per stream.
 *
 * It owns:
 *   • the WebSocket fan-out for live chat (messages, moderation, system notes)
 *   • viewer/host presence (authoritative viewer count while a stream is up)
 *   • the `is_live` heartbeat — the stream goes offline when the host socket
 *     closes or stops heartbeating
 *
 * Uses the WebSocket Hibernation API, so idle rooms cost nothing and presence
 * is reconstructed from `ctx.getWebSockets()` after eviction.
 */

interface Attachment {
  role: 'host' | 'viewer';
  userId: string;
  username: string;
  avatarUrl: string | null;
  /** Client-supplied peer id (only used for logging/dedup). */
  peerId?: string;
}

const MAX_MESSAGE_LENGTH = 2000;
const HEARTBEAT_TIMEOUT_MS = 90_000; // host is considered gone after 90s of silence
const PRESENCE_WRITE_INTERVAL_MS = 3_000; // throttle viewer_count writes to D1

export class ChatRoom extends DurableObject<Env> {
  private streamId = '';
  private lastPresenceWrite = 0;
  private lastHostHeartbeat = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Block eviction-driven surprises: restore lightweight bookkeeping lazily.
    void ctx.storage.getAlarm();
  }

  /* ------------------------------ HTTP surface ------------------------------ */
  /** Only reachable from inside the Worker (Durable Objects are not public). */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    await this.ensureStreamId(url);

    if (url.pathname === '/ws') return this.handleUpgrade(request);

    if (url.pathname === '/presence') {
      return Response.json({ streamId: this.streamId, ...this.presence() });
    }

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const event = (await request.json()) as Record<string, unknown>;
      this.broadcast(event);
      return Response.json({ ok: true, delivered: this.ctx.getWebSockets().length });
    }

    if (url.pathname === '/system' && request.method === 'POST') {
      const { message, type = 'system' } = (await request.json()) as { message?: string; type?: string };
      const saved = await this.persistMessage({
        userId: null,
        message: String(message ?? '').slice(0, MAX_MESSAGE_LENGTH),
        type,
        metadata: null,
      });
      if (saved) this.broadcast({ type: 'chat', message: saved });
      return Response.json({ ok: !!saved, message: saved });
    }

    return new Response('Not found', { status: 404 });
  }

  /**
   * Instance fields are lost whenever the object hibernates, so the stream id
   * lives in Durable Object storage and is re-hydrated on demand.
   */
  private async ensureStreamId(url?: URL | null): Promise<string> {
    if (this.streamId) return this.streamId;

    const fromQuery = url?.searchParams.get('streamId');
    if (fromQuery) {
      this.streamId = fromQuery;
      await this.ctx.storage.put('streamId', fromQuery);
      return this.streamId;
    }

    const stored = await this.ctx.storage.get<string>('streamId');
    if (stored) this.streamId = stored;
    return this.streamId;
  }

  private async handleUpgrade(request: Request): Promise<Response> {
    const url = new URL(request.url);
    await this.ensureStreamId(url);
    const role = url.searchParams.get('role') === 'host' ? 'host' : 'viewer';

    if (!this.streamId) return new Response('Missing streamId', { status: 400 });

    const upgrade = request.headers.get('Upgrade');
    if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const exists = await this.env.DB.prepare(`SELECT 1 AS ok FROM streams WHERE id = ?`).bind(this.streamId).first<{ ok: number }>();
    if (!exists) return new Response('Stream not found', { status: 404 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    const attachment: Attachment = {
      role,
      userId: url.searchParams.get('userId') || 'anonymous',
      username: url.searchParams.get('username') || 'Anonymous',
      avatarUrl: url.searchParams.get('avatarUrl') || null,
      peerId: url.searchParams.get('peerId') || undefined,
    };

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);

    if (role === 'host') await this.onHostConnect();

    // Send the current state so the client can render immediately.
    this.send(server, {
      type: 'ready',
      streamId: this.streamId,
      role,
      ...this.presence(),
    });
    this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  /* --------------------------- WebSocket handlers --------------------------- */

  async webSocketMessage(ws: WebSocket, data: ArrayBuffer | string) {
    await this.ensureStreamId();
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
    } catch {
      return this.send(ws, { type: 'error', error: 'Malformed JSON' });
    }

    const attachment = (ws.deserializeAttachment() ?? {}) as Attachment;
    const type = String(payload.type ?? '');

    if (type === 'ping') {
      this.send(ws, { type: 'pong', at: nowIso() });
      return;
    }

    if (type === 'heartbeat') {
      if (attachment.role === 'host') {
        this.lastHostHeartbeat = Date.now();
        await this.env.DB.prepare(`UPDATE streams SET last_heartbeat = ? WHERE id = ?`).bind(nowIso(), this.streamId).run();
      }
      return;
    }

    if (type === 'chat' || type === 'message') {
      const text = String(payload.message ?? payload.body ?? '').trim();
      if (!text) return;
      if (text.length > MAX_MESSAGE_LENGTH) {
        return this.send(ws, { type: 'error', error: `Message is longer than ${MAX_MESSAGE_LENGTH} characters` });
      }
      if (attachment.userId === 'anonymous') {
        return this.send(ws, { type: 'error', error: 'Sign in to chat' });
      }

      const messageType = ['text', 'emote', 'donation', 'system'].includes(String(payload.messageType ?? payload.message_type ?? 'text'))
        ? String(payload.messageType ?? payload.message_type ?? 'text')
        : 'text';

      const saved = await this.persistMessage({
        userId: attachment.userId,
        message: text,
        type: messageType,
        metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
      });

      if (saved) this.broadcast({ type: 'chat', message: saved });
      return;
    }

    if (type === 'moderate') {
      // Only the broadcaster may hide/restore messages in their room.
      if (attachment.role !== 'host') return this.send(ws, { type: 'error', error: 'Not allowed' });
      const messageId = String(payload.messageId ?? payload.id ?? '');
      const isModerated = payload.isModerated === true || payload.is_moderated === true;
      if (!messageId) return;

      await this.env.DB.prepare(`UPDATE chat_messages SET is_moderated = ? WHERE id = ? AND stream_id = ?`)
        .bind(isModerated ? 1 : 0, messageId, this.streamId)
        .run();
      this.broadcast({ type: 'moderation', messageId, isModerated });
      return;
    }

    if (type === 'typing') {
      this.broadcast({ type: 'typing', userId: attachment.userId, username: attachment.username }, ws);
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean) {
    await this.ensureStreamId();
    const attachment = (ws.deserializeAttachment() ?? {}) as Attachment;
    if (attachment.role === 'host') await this.onHostDisconnect(ws);
    this.broadcastPresence(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.ensureStreamId();
    const attachment = (ws.deserializeAttachment() ?? {}) as Attachment;
    if (attachment.role === 'host') await this.onHostDisconnect(ws);
    try {
      ws.close(1011, 'Internal error');
    } catch {
      /* already closed */
    }
  }

  /** Safety net: force the stream offline if the host vanished without a close frame. */
  async alarm() {
    if (this.hasHost()) {
      if (Date.now() - this.lastHostHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        await this.forceHostOffline();
      } else {
        await this.ctx.storage.setAlarm(Date.now() + 30_000);
      }
      return;
    }
    await this.ctx.storage.deleteAlarm();
  }

  /* -------------------------------- helpers --------------------------------- */

  /** `except` is the socket that is currently closing (still listed by the runtime). */
  private presence(except?: WebSocket) {
    let viewers = 0;
    let hostConnected = false;
    for (const ws of this.ctx.getWebSockets()) {
      if (except && ws === except) continue;
      const attachment = (ws.deserializeAttachment() ?? {}) as Attachment;
      if (attachment.role === 'host') hostConnected = true;
      else viewers += 1;
    }
    return { viewers, hostConnected, live: hostConnected };
  }

  private hasHost(except?: WebSocket): boolean {
    return this.ctx
      .getWebSockets()
      .some((ws) => ws !== except && ((ws.deserializeAttachment() ?? {}) as Attachment).role === 'host');
  }

  private async onHostConnect() {
    this.lastHostHeartbeat = Date.now();
    const now = nowIso();
    await this.env.DB.prepare(
      `UPDATE streams
          SET is_live = 1, host_connected = 1, last_heartbeat = ?,
              started_at = COALESCE(started_at, ?), ended_at = NULL
        WHERE id = ?`,
    )
      .bind(now, now, this.streamId)
      .run();
    await this.ctx.storage.setAlarm(Date.now() + 30_000);
  }

  private async onHostDisconnect(closing?: WebSocket) {
    if (this.hasHost(closing)) return; // another host socket is still attached
    await this.forceHostOffline();
  }

  private async forceHostOffline() {
    const now = nowIso();
    await this.env.DB.prepare(
      `UPDATE streams
          SET is_live = 0, host_connected = 0, viewer_count = 0, ended_at = COALESCE(ended_at, ?)
        WHERE id = ?`,
    )
      .bind(now, this.streamId)
      .run();

    // Close any session that is still open for this stream.
    await this.env.DB.prepare(
      `UPDATE stream_sessions
          SET ended_at = ?,
              duration = CAST((strftime('%s', ?) - strftime('%s', started_at)) AS INTEGER)
        WHERE stream_id = ? AND ended_at IS NULL`,
    )
      .bind(now, now, this.streamId)
      .run();

    await this.ctx.storage.deleteAlarm();
    this.broadcast({ type: 'stream', status: 'offline', streamId: this.streamId });
  }

  private broadcastPresence(except?: WebSocket) {
    const presence = this.presence(except);

    // Throttled persistence — the socket set is the source of truth.
    const now = Date.now();
    if (now - this.lastPresenceWrite > PRESENCE_WRITE_INTERVAL_MS) {
      this.lastPresenceWrite = now;
      void this.env.DB.prepare(
        `UPDATE streams
            SET viewer_count = ?,
                peak_viewers = MAX(COALESCE(peak_viewers, 0), ?),
                updated_at = ?
          WHERE id = ?`,
      )
        .bind(presence.viewers, presence.viewers, nowIso(), this.streamId)
        .run()
        .catch((error) => console.error('presence write failed', error));
    }

    this.broadcast({ type: 'presence', streamId: this.streamId, ...presence });
  }

  private broadcast(event: Record<string, unknown>, except?: WebSocket) {
    const payload = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      if (except && ws === except) continue;
      try {
        ws.send(payload);
      } catch {
        /* socket died mid-send; close handler cleans up */
      }
    }
  }

  private send(ws: WebSocket, event: Record<string, unknown>) {
    try {
      ws.send(JSON.stringify(event));
    } catch {
      /* ignore */
    }
  }

  private async persistMessage(input: {
    userId: string | null;
    message: string;
    type: string;
    metadata: string | null;
  }): Promise<Record<string, unknown> | null> {
    const id = uuid();
    const createdAt = nowIso();

    try {
      await this.env.DB.prepare(
        `INSERT INTO chat_messages (id, stream_id, user_id, message, type, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(id, this.streamId, input.userId, input.message, input.type, input.metadata, createdAt)
        .run();
    } catch (error) {
      console.error('chat insert failed', error);
      return null;
    }

    if (input.userId) {
      const author = await this.env.DB.prepare(`SELECT username, avatar_url FROM users WHERE id = ?`)
        .bind(input.userId)
        .first<{ username: string; avatar_url: string | null }>();
      return {
        id,
        streamId: this.streamId,
        userId: input.userId,
        username: author?.username ?? 'Anonymous',
        userAvatar: author?.avatar_url ?? null,
        message: input.message,
        type: input.type,
        metadata: input.metadata ? safeParse(input.metadata) : null,
        isModerated: false,
        timestamp: createdAt,
      };
    }

    return {
      id,
      streamId: this.streamId,
      userId: null,
      username: 'system',
      message: input.message,
      type: input.type,
      metadata: input.metadata ? safeParse(input.metadata) : null,
      isModerated: false,
      timestamp: createdAt,
    };
  }
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
