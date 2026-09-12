import type { Env } from './env';
import { nowISO, sha256Hex, randomId } from './util';

/**
 * RoomDO — one Durable Object per live stream (id-from-name = stream id).
 *
 * Responsibilities:
 *  - WebRTC signaling relay between the host and each viewer (offers/answers/ICE)
 *  - Presence: real viewer counting (join/leave), persisted to D1
 *  - Real-time chat fan-out with persistence + per-connection rate limiting
 *  - Broadcast lifecycle safety: if the host disconnects, end the broadcast
 *    after a grace period; periodic alarm flushes keep D1 updated so the
 *    hourly cron can reclaim streams orphaned by DO eviction.
 */

const MAX_MESSAGE_BYTES = 64 * 1024;
const HEARTBEAT_TIMEOUT_MS = 65_000;
const HOST_GRACE_MS = 12_000;
const FLUSH_INTERVAL_MS = 8_000;
const MAX_VIEWERS = 250; // soft cap appropriate for a P2P (host-publisher) topology

interface Connection {
  ws: WebSocket;
  id: string;
  role: 'host' | 'viewer';
  userId: string | null;
  username: string | null;
  lastSeen: number;
}

export class RoomDO implements DurableObject {
  private readonly env: Env;
  private readonly state: DurableObjectState;
  private readonly streamId: string;

  private host: Connection | null = null;
  private readonly viewers = new Map<WebSocket, Connection>();
  private readonly pending = new Set<WebSocket>(); // sockets that have not completed the join handshake
  private chatRate = new ChatRateTracker();
  private loaded = false;
  private streamIsValid = false;
  private hostGraceTimer: number | null = null;
  private peakViewers = 0;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.streamId = state.id.name!;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Internal control endpoints invoked by the REST API (never publicly routed).
    if (url.pathname === '/force-end') {
      this.clearHostGrace();
      await this.endBroadcast();
      return new Response('ok');
    }

    if (url.pathname === '/chat' && req.method === 'POST') {
      // Authenticated REST chat: apply rate limits, persist, fan out.
      const body = (await req.json().catch(() => null)) as { userId?: string; username?: string; text?: string } | null;
      const userId = typeof body?.userId === 'string' ? body.userId : null;
      const username = typeof body?.username === 'string' ? body.username.slice(0, 32) : 'viewer';
      const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 500) : '';
      if (!userId || !text) return new Response('bad request', { status: 400 });
      if (!this.userChatAllowed(userId)) return Response.json({ ok: false, reason: 'throttled' }, { status: 429 });
      const out = { type: 'chat', id: `t_${randomId(8)}`, username, text, ts: Date.now() };
      this.broadcast(out);
      this.state
        .waitUntil(
          this.env.DB.prepare(
            'INSERT INTO chat_messages (stream_id, user_id, username, message, created_at) VALUES (?, ?, ?, ?, ?)'
          )
            .bind(this.streamId, userId, username, text, nowISO())
            .run()
            .catch((e) => console.error('room: chat persist failed', e))
        );
      return Response.json({ ok: true });
    }

    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected websocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const server = pair[1]!;
    this.state.acceptWebSocket(server);
    this.pending.add(server);
    this.ensureFlushAlarm();

    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  // ---- message handling -----------------------------------------------------

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (this.pending.has(ws)) {
      this.pending.delete(ws);
      void this.handleJoin(ws, message);
      return;
    }
    const conn = this.getConn(ws);
    if (!conn) return;
    void this.handleMessage(conn, message);
  }

  webSocketClose(ws: WebSocket) {
    this.pending.delete(ws);
    const conn = this.getConn(ws);
    if (!conn) return;

    if (conn.role === 'host') {
      this.host = null;
      this.broadcastToViewers({ type: 'host-left' });
      this.scheduleHostGrace();
    } else {
      this.viewers.delete(ws);
      this.ensureFlushAlarm();
      if (this.host && isOpen(this.host.ws)) {
        this.send(this.host.ws, { type: 'viewer-left', viewerId: conn.id });
      }
      this.broadcastPresence();
    }
  }

  webSocketError(ws: WebSocket) {
    try {
      ws.close(1011, 'error');
    } catch {
      /* already closed */
    }
  }

  private async handleJoin(ws: WebSocket, raw: string | ArrayBuffer) {
    let msg: { type?: string; role?: string; token?: string };
    try {
      if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) throw new Error('bad frame');
      msg = JSON.parse(raw);
    } catch {
      this.rejectAndClose(ws, 'bad_request', 'Invalid join message');
      return;
    }

    await this.ensureStreamLoaded();
    if (!this.streamIsValid) {
      this.rejectAndClose(ws, 'not_found', 'Stream not found');
      return;
    }
    if (msg.type !== 'join' || (msg.role !== 'host' && msg.role !== 'viewer')) {
      this.rejectAndClose(ws, 'bad_request', 'Expected a join message');
      return;
    }
    if (msg.role === 'host') {
      await this.joinHost(ws, msg.token ?? null);
    } else {
      this.joinViewer(ws);
    }
  }

  private async joinHost(ws: WebSocket, token: string | null) {
    if (!token) {
      this.rejectAndClose(ws, 'unauthorized', 'Host authentication required');
      return;
    }
    const credentialId = await sha256Hex(token);
    // A credential is either a room ticket (preferred — issued by /start) or a
    // live session token.
    const session =
      (await this.env.DB.prepare(
        `SELECT t.user_id AS id, u.username FROM room_tickets t JOIN users u ON u.id = t.user_id
         WHERE t.id = ? AND t.expires_at > ?`
      )
        .bind(credentialId, nowISO())
        .first<{ id: string; username: string }>()) ??
      (await this.env.DB.prepare(
        `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = ? AND s.expires_at > ?`
      )
        .bind(credentialId, nowISO())
        .first<{ id: string; username: string }>());
    if (!session) {
      this.rejectAndClose(ws, 'unauthorized', 'Broadcast credential is invalid or expired');
      return;
    }

    const stream = await this.env.DB.prepare('SELECT user_id, is_live FROM streams WHERE id = ?')
      .bind(this.streamId)
      .first<{ user_id: string; is_live: number }>();
    if (!stream) {
      this.rejectAndClose(ws, 'not_found', 'Stream not found');
      return;
    }
    if (stream.user_id !== session.id) {
      this.rejectAndClose(ws, 'forbidden', 'You do not own this stream');
      return;
    }
    if (this.host && isOpen(this.host.ws)) {
      this.rejectAndClose(ws, 'conflict', 'This stream is already broadcasting from another connection');
      return;
    }

    this.clearHostGrace();

    if (this.host) this.safeClose(this.host.ws);
    this.host = { ws, id: 'host', role: 'host', userId: session.id, username: session.username, lastSeen: Date.now() };

    // Reconcile persisted state: mark live and open a session row if needed
    // (e.g. the host refreshed the page mid-broadcast).
    try {
      if (stream.is_live !== 1) {
        const now = nowISO();
        await this.env.DB.prepare(
          'UPDATE streams SET is_live = 1, started_at = ?, ended_at = NULL, updated_at = ? WHERE id = ?'
        )
          .bind(now, now, this.streamId)
          .run();
        await this.env.DB.prepare(
          'INSERT INTO stream_sessions (id, stream_id, user_id, started_at, created_at) VALUES (?, ?, ?, ?, ?)'
        )
          .bind(randomId(), this.streamId, session.id, now, now)
          .run();
      }
    } catch (e) {
      console.error('room: host reconcile failed', e);
    }

    this.send(ws, { type: 'welcome', role: 'host', viewerCount: this.viewers.size });
    this.broadcastToViewers({ type: 'host-present' });
    this.ensureFlushAlarm();
  }

  private joinViewer(ws: WebSocket) {
    if (this.viewers.size >= MAX_VIEWERS) {
      this.rejectAndClose(ws, 'room_full', 'This stream has reached its viewer capacity');
      return;
    }
    const conn: Connection = { ws, id: `v_${randomId(8)}`, role: 'viewer', userId: null, username: null, lastSeen: Date.now() };
    this.viewers.set(ws, conn);
    this.peakViewers = Math.max(this.peakViewers, this.viewers.size);

    this.send(ws, {
      type: 'welcome',
      role: 'viewer',
      viewerId: conn.id,
      viewerCount: this.viewers.size,
      hostPresent: !!(this.host && isOpen(this.host.ws)),
    });
    if (this.host && isOpen(this.host.ws)) {
      this.send(this.host.ws, { type: 'viewer-joined', viewerId: conn.id });
    }
    this.broadcastPresence();
  }

  private async handleMessage(conn: Connection, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    conn.lastSeen = Date.now();

    switch (msg.type) {
      case 'ping':
        this.send(conn.ws, { type: 'pong' });
        return;

      case 'signal': {
        // WebRTC signaling relay. Only routed between connections this room issued.
        const to = typeof msg.to === 'string' ? msg.to : null;
        if (!to || typeof msg.payload !== 'object' || msg.payload === null) return;
        const signal = { type: 'signal', from: conn.id, payload: msg.payload };
        if (conn.role === 'viewer') {
          if (to !== 'host' || !this.host) return;
          this.send(this.host.ws, signal);
        } else if (to !== 'host') {
          const target = [...this.viewers.values()].find((v) => v.id === to);
          if (target) this.send(target.ws, signal);
        }
        return;
      }

      default:
        return;
    }
  }

  // ---- alarms & lifecycle ---------------------------------------------------

  async alarm() {
    await this.flushPresence();
    this.sweepDeadConnections();
    if (this.host || this.viewers.size > 0 || this.pending.size > 0) {
      this.state.storage.setAlarm(Date.now() + FLUSH_INTERVAL_MS).catch(() => {});
    }
  }

  private ensureFlushAlarm() {
    void this.state.storage.getAlarm().then((current) => {
      if (current === null) {
        this.state.storage.setAlarm(Date.now() + FLUSH_INTERVAL_MS).catch(() => {});
      }
    });
  }

  private sweepDeadConnections() {
    const cutoff = Date.now() - HEARTBEAT_TIMEOUT_MS;
    if (this.host && this.host.lastSeen < cutoff) this.safeClose(this.host.ws, 4000, 'heartbeat timeout');
    for (const [ws, conn] of this.viewers) {
      if (conn.lastSeen < cutoff) this.safeClose(ws, 4000, 'heartbeat timeout');
    }
  }

  private scheduleHostGrace() {
    this.clearHostGrace();
    this.hostGraceTimer = setTimeout(() => {
      this.hostGraceTimer = null;
      if (!this.host || !isOpen(this.host.ws)) void this.endBroadcast();
    }, HOST_GRACE_MS) as unknown as number;
  }

  private clearHostGrace() {
    if (this.hostGraceTimer !== null) {
      clearTimeout(this.hostGraceTimer);
      this.hostGraceTimer = null;
    }
  }

  private async flushPresence() {
    try {
      const count = this.viewers.size;
      const now = nowISO();
      await this.env.DB.prepare(
        'UPDATE streams SET viewer_count = ?, peak_viewers = MAX(peak_viewers, ?), updated_at = ? WHERE id = ?'
      )
        .bind(count, this.peakViewers, now, this.streamId)
        .run();
      if (this.host && isOpen(this.host.ws)) {
        await this.env.DB.prepare('INSERT INTO stream_stats (stream_id, timestamp, viewer_count) VALUES (?, ?, ?)')
          .bind(this.streamId, now, count)
          .run();
      }
    } catch (e) {
      console.error('room: presence flush failed', e);
    }
  }

  /** Mark the broadcast ended in D1, finalize the open session, notify viewers. */
  private async endBroadcast() {
    this.broadcastToViewers({ type: 'stream-ended' });
    for (const [ws] of this.viewers) this.safeClose(ws, 1000, 'stream-ended');
    if (this.host) this.safeClose(this.host.ws, 1000, 'stream-ended');
    this.host = null;
    this.viewers.clear();
    this.chatRate = new ChatRateTracker();

    try {
      const now = nowISO();
      await this.env.DB.prepare(
        'UPDATE streams SET is_live = 0, ended_at = ?, viewer_count = 0, updated_at = ? WHERE id = ? AND is_live = 1'
      )
        .bind(now, now, this.streamId)
        .run();
      const session = await this.env.DB.prepare(
        'SELECT id, started_at FROM stream_sessions WHERE stream_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
      )
        .bind(this.streamId)
        .first<{ id: string; started_at: string }>();
      if (session) {
        const duration = Math.max(0, Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000));
        await this.env.DB.prepare('UPDATE stream_sessions SET ended_at = ?, duration_seconds = ?, peak_viewers = ? WHERE id = ?')
          .bind(now, duration, this.peakViewers, session.id)
          .run();
      }
    } catch (e) {
      console.error('room: endBroadcast db failed', e);
    }
    this.peakViewers = 0;
  }

  // ---- helpers ----------------------------------------------------------------

  private userChatAllowed(userId: string): boolean {
    return this.chatRate.allowed(userId);
  }

  private async ensureStreamLoaded() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const row = await this.env.DB.prepare('SELECT peak_viewers FROM streams WHERE id = ?')
        .bind(this.streamId)
        .first<{ peak_viewers: number | null }>();
      this.streamIsValid = !!row;
      this.peakViewers = row?.peak_viewers ?? 0;
    } catch {
      this.streamIsValid = false;
    }
  }

  private getConn(ws: WebSocket): Connection | null {
    if (this.host?.ws === ws) return this.host;
    return this.viewers.get(ws) ?? null;
  }

  private send(ws: WebSocket, data: unknown) {
    if (!isOpen(ws)) return;
    try {
      ws.send(JSON.stringify(data));
    } catch {
      /* socket closing */
    }
  }

  private rejectAndClose(ws: WebSocket, code: string, message: string) {
    this.send(ws, { type: 'rejected', code, message });
    setTimeout(() => this.safeClose(ws, 1000, code), 120);
  }

  private safeClose(ws: WebSocket, code = 1000, reason = '') {
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
  }

  private broadcast(data: unknown) {
    const payload = JSON.stringify(data);
    for (const [ws] of this.viewers) {
      if (!isOpen(ws)) continue;
      try {
        ws.send(payload);
      } catch { /* closing */ }
    }
    if (this.host && isOpen(this.host.ws)) {
      try {
        this.host.ws.send(payload);
      } catch { /* closing */ }
    }
  }

  private broadcastToViewers(data: unknown) {
    const payload = JSON.stringify(data);
    for (const [ws] of this.viewers) {
      if (!isOpen(ws)) continue;
      try {
        ws.send(payload);
      } catch { /* closing */ }
    }
  }

  private broadcastPresence() {
    const count = this.viewers.size;
    const payload = JSON.stringify({ type: 'presence', viewerCount: count });
    for (const [ws] of this.viewers) {
      if (!isOpen(ws)) continue;
      try {
        ws.send(payload);
      } catch { /* closing */ }
    }
    if (this.host && isOpen(this.host.ws)) {
      try {
        this.host.ws.send(payload);
      } catch { /* closing */ }
    }
    this.ensureFlushAlarm();
  }
}

function isOpen(ws: WebSocket): boolean {
  return ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING;
}

/** Per-user chat rate limit (applies to REST chat routed through the room). */
const USER_CHAT_LIMIT = 8;
const USER_CHAT_WINDOW_MS = 10_000;

export class ChatRateTracker {
  private times = new Map<string, number[]>();

  allowed(key: string): boolean {
    const now = Date.now();
    const entry = (this.times.get(key) ?? []).filter((t) => now - t < USER_CHAT_WINDOW_MS);
    if (entry.length >= USER_CHAT_LIMIT) {
      this.times.set(key, entry);
      return false;
    }
    entry.push(now);
    this.times.set(key, entry);
    return true;
  }
}
