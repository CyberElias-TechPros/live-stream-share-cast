import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';

/**
 * WebRTC signalling room — Cloudflare's stand-in for Supabase Realtime here.
 *
 * Protocol (all frames are JSON, relayed verbatim):
 *   server → peer : { type: 'welcome', id, role, peers }
 *   both   → both : { type: 'hello-viewer' | 'streamer-ready' | 'offer' |
 *                     'answer' | 'ice' | 'close' | 'quality', from, to?, sdp?,
 *                     candidate?, kbps? }
 *   server → peer : { type: 'peer-left', id }
 *
 * Frames with a `to` field are routed to that single peer; everything else is
 * broadcast to the room (excluding the sender). The broadcaster is the peer
 * that connected with `role=host`.
 */

interface Attachment {
  id: string;
  role: 'host' | 'viewer';
  userId: string;
}

const MAX_FRAME_BYTES = 64 * 1024;
const MAX_SDP_BYTES = 48 * 1024;
const MAX_CANDIDATE_BYTES = 8 * 1024;
const MAX_FRAMES_PER_WINDOW = 120;
const FRAME_RATE_WINDOW_MS = 10_000;
const ALLOWED_FRAME_TYPES = new Set(['hello-viewer', 'streamer-ready', 'offer', 'answer', 'ice', 'close', 'quality', 'ping']);

export class SignalRoom extends DurableObject<Env> {
  private streamId = '';
  private sequence = 0;
  private frameRates = new Map<string, { startedAt: number; count: number }>();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    await this.ensureStreamId(url);

    if (url.pathname === '/ws') return this.handleUpgrade(request, url);

    if (url.pathname === '/stats') {
      const sockets = this.ctx.getWebSockets();
      return Response.json({
        streamId: this.streamId,
        peers: sockets.length,
        roles: sockets.map((ws) => ((ws.deserializeAttachment() ?? {}) as Attachment).role),
      });
    }

    return new Response('Not found', { status: 404 });
  }

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

  private async handleUpgrade(request: Request, url: URL): Promise<Response> {
    await this.ensureStreamId(url);
    const role = url.searchParams.get('role') === 'host' ? 'host' : 'viewer';

    const upgrade = request.headers.get('Upgrade');
    if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const parsedMaxViewers = Number(url.searchParams.get('maxViewers') ?? 8);
    const maxViewers = Number.isFinite(parsedMaxViewers) ? Math.max(1, Math.min(Math.floor(parsedMaxViewers), 100)) : 8;
    const sockets = this.ctx.getWebSockets();
    const viewerCount = sockets.filter((ws) => ((ws.deserializeAttachment() ?? {}) as Attachment).role === 'viewer').length;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    const requestedPeerId = url.searchParams.get('peerId');
    const generatedPeerId = `peer-${++this.sequence}-${Math.random().toString(36).slice(2, 8)}`;
    const candidatePeerId = requestedPeerId && /^[A-Za-z0-9._:-]{1,100}$/.test(requestedPeerId)
      ? requestedPeerId
      : generatedPeerId;
    const id = this.peerIds().includes(candidatePeerId) ? generatedPeerId : candidatePeerId;
    const attachment: Attachment = {
      id,
      role,
      userId: url.searchParams.get('userId') || 'anonymous',
    };

    if (role === 'viewer' && viewerCount >= maxViewers) {
      // Accept long enough to deliver a structured product error instead of
      // making the browser spin through reconnect attempts forever.
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment(attachment);
      this.send(server, {
        type: 'error',
        code: 'p2p_capacity',
        error: `This broadcast has reached its ${maxViewers}-viewer peer-to-peer limit`,
        maxViewers,
      });
      server.close(1013, 'P2P audience capacity reached');
      return new Response(null, { status: 101, webSocket: client });
    }

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);

    this.send(server, {
      type: 'welcome',
      id: attachment.id,
      role: attachment.role,
      streamId: this.streamId,
      peers: this.peerIds().filter((id) => id !== attachment.id),
    });

    // Tell the room somebody new arrived (used to kick off offers/announcements).
    this.broadcast({ type: 'peer-joined', id: attachment.id, role: attachment.role }, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, data: ArrayBuffer | string) {
    const raw = typeof data === 'string' ? data : new TextDecoder().decode(data);
    if (new TextEncoder().encode(raw).byteLength > MAX_FRAME_BYTES) {
      return this.send(ws, { type: 'error', code: 'frame_too_large', error: 'Signalling frame too large' });
    }

    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return this.send(ws, { type: 'error', code: 'malformed_frame', error: 'Malformed JSON' });
    }

    const attachment = (ws.deserializeAttachment() ?? {}) as Attachment;
    const type = typeof frame.type === 'string' ? frame.type : '';

    const now = Date.now();
    const bucket = this.frameRates.get(attachment.id);
    const nextBucket = !bucket || now - bucket.startedAt >= FRAME_RATE_WINDOW_MS
      ? { startedAt: now, count: 1 }
      : { startedAt: bucket.startedAt, count: bucket.count + 1 };
    this.frameRates.set(attachment.id, nextBucket);
    if (nextBucket.count > MAX_FRAMES_PER_WINDOW) {
      return this.send(ws, {
        type: 'error',
        code: 'rate_limited',
        error: 'Signalling messages are arriving too quickly',
        retryAfterSeconds: Math.ceil(FRAME_RATE_WINDOW_MS / 1000),
      });
    }

    if (!ALLOWED_FRAME_TYPES.has(type)) {
      return this.send(ws, { type: 'error', code: 'invalid_frame_type', error: 'Unsupported signalling frame' });
    }

    if (type === 'ping') {
      return this.send(ws, { type: 'pong', at: Date.now() });
    }

    // A viewer may only address the host, and a host may only address a
    // viewer. This keeps the room a broadcaster-to-viewer topology instead of
    // becoming an unauthorised peer mesh.
    const target = typeof frame.to === 'string' && frame.to.length ? frame.to : null;
    if (target && !/^[A-Za-z0-9._:-]{1,100}$/.test(target)) {
      return this.send(ws, { type: 'error', code: 'invalid_target', error: 'Invalid signalling peer id' });
    }
    const targetSocket = target ? this.findPeer(target) : null;
    const targetAttachment = targetSocket
      ? ((targetSocket.deserializeAttachment() ?? {}) as Attachment)
      : null;

    if (target && !targetSocket) {
      return this.send(ws, { type: 'error', code: 'target_not_found', error: 'The signalling peer is no longer connected' });
    }
    if (targetAttachment && targetAttachment.role === attachment.role) {
      return this.send(ws, { type: 'error', code: 'invalid_target', error: 'Signalling peers must have opposite roles' });
    }

    if (
      (attachment.role === 'viewer' && !['hello-viewer', 'offer', 'ice', 'quality', 'close'].includes(type)) ||
      (attachment.role === 'host' && !['streamer-ready', 'answer', 'ice', 'close'].includes(type))
    ) {
      return this.send(ws, { type: 'error', code: 'invalid_role_frame', error: 'That frame is not valid for this peer role' });
    }

    if (type === 'quality') {
      const kbps = frame.kbps;
      if (kbps !== null && (typeof kbps !== 'number' || !Number.isFinite(kbps) || kbps < 64 || kbps > 10_000)) {
        return this.send(ws, { type: 'error', code: 'invalid_quality', error: 'Quality must be between 64 and 10000 kbps, or null' });
      }
    }

    if (type === 'offer' || type === 'answer') {
      const sdp = frame.sdp;
      const description = sdp && typeof sdp === 'object' ? sdp as Record<string, unknown> : null;
      const sdpText = description && typeof description.sdp === 'string' ? description.sdp : '';
      if (!description || !['offer', 'answer'].includes(String(description.type)) || !sdpText || new TextEncoder().encode(sdpText).byteLength > MAX_SDP_BYTES) {
        return this.send(ws, { type: 'error', code: 'invalid_sdp', error: 'A valid bounded SDP description is required' });
      }
    }

    if (type === 'ice') {
      const candidate = frame.candidate;
      const candidateObject = candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : null;
      const candidateText = candidateObject && typeof candidateObject.candidate === 'string' ? candidateObject.candidate : '';
      const mid = candidateObject?.sdpMid;
      const mLine = candidateObject?.sdpMLineIndex;
      if (
        !candidateObject ||
        !candidateText ||
        new TextEncoder().encode(candidateText).byteLength > MAX_CANDIDATE_BYTES ||
        (mid !== undefined && mid !== null && typeof mid !== 'string') ||
        (mLine !== undefined && mLine !== null && (typeof mLine !== 'number' || !Number.isInteger(mLine) || mLine < 0))
      ) {
        return this.send(ws, { type: 'error', code: 'invalid_ice', error: 'A valid bounded ICE candidate is required' });
      }
    }

    // Authoritative sender id — clients cannot impersonate each other.
    frame.from = attachment.id;
    frame.role = attachment.role;

    if (targetSocket) {
      this.send(targetSocket, frame);
      return;
    }
    this.broadcast(frame, ws);
  }

  async webSocketClose(ws: WebSocket) {
    const attachment = (ws.deserializeAttachment() ?? {}) as Attachment;
    this.frameRates.delete(attachment.id);
    this.broadcast({ type: 'peer-left', id: attachment?.id }, ws);
  }

  async webSocketError(ws: WebSocket) {
    const attachment = (ws.deserializeAttachment() ?? {}) as Attachment;
    this.frameRates.delete(attachment.id);
    this.broadcast({ type: 'peer-left', id: attachment?.id }, ws);
    try {
      ws.close(1011, 'Signalling error');
    } catch {
      /* already closed */
    }
  }

  /* -------------------------------- helpers --------------------------------- */

  private peerIds(): string[] {
    return this.ctx.getWebSockets().map((ws) => ((ws.deserializeAttachment() ?? {}) as Attachment).id);
  }

  private findPeer(id: string): WebSocket | null {
    for (const ws of this.ctx.getWebSockets()) {
      if (((ws.deserializeAttachment() ?? {}) as Attachment).id === id) return ws;
    }
    return null;
  }

  private broadcast(event: Record<string, unknown>, except?: WebSocket) {
    const payload = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      if (except && ws === except) continue;
      try {
        ws.send(payload);
      } catch {
        /* ignore */
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
}
