import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';

/**
 * WebRTC signalling room — Cloudflare's stand-in for Supabase Realtime here.
 *
 * Protocol (all frames are JSON, relayed verbatim):
 *   server → peer : { type: 'welcome', id, role, peers }
 *   both   → both : { type: 'hello-viewer' | 'streamer-ready' | 'offer' |
 *                     'answer' | 'ice' | 'close', from, to?, sdp?, candidate? }
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

export class SignalRoom extends DurableObject<Env> {
  private streamId = '';
  private sequence = 0;

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

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    const attachment: Attachment = {
      id: url.searchParams.get('peerId') || `peer-${++this.sequence}-${Math.random().toString(36).slice(2, 8)}`,
      role,
      userId: url.searchParams.get('userId') || 'anonymous',
    };

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
    if (raw.length > MAX_FRAME_BYTES) {
      return this.send(ws, { type: 'error', error: 'Signalling frame too large' });
    }

    let frame: Record<string, any>;
    try {
      frame = JSON.parse(raw);
    } catch {
      return this.send(ws, { type: 'error', error: 'Malformed JSON' });
    }

    const attachment = (ws.deserializeAttachment() ?? {}) as Attachment;

    if (frame.type === 'ping') {
      return this.send(ws, { type: 'pong', at: Date.now() });
    }

    // Authoritative sender id — clients cannot impersonate each other.
    frame.from = attachment.id;
    frame.role = attachment.role;

    const target = typeof frame.to === 'string' && frame.to.length ? frame.to : null;
    if (target) {
      const peer = this.findPeer(target);
      if (peer) this.send(peer, frame);
      return;
    }
    this.broadcast(frame, ws);
  }

  async webSocketClose(ws: WebSocket) {
    const attachment = (ws.deserializeAttachment() ?? {}) as Attachment;
    this.broadcast({ type: 'peer-left', id: attachment?.id }, ws);
  }

  async webSocketError(ws: WebSocket) {
    const attachment = (ws.deserializeAttachment() ?? {}) as Attachment;
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
