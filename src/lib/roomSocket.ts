import { roomWsUrl } from "./api";

/**
 * RoomSocket — resilient client for the per-stream Durable Object room.
 *
 * Protocol:
 *   → { type: "join", role: "host"|"viewer", token? }
 *   → { type: "signal", to, payload }        (WebRTC offer/answer/ICE relay)
 *   → { type: "ping" }
 *
 * Chat is sent over authenticated REST (session cookie) and received here.
 *   ← { type: "welcome" | "presence" | "viewer-joined" | "viewer-left"
 *      | "host-present" | "host-left" | "signal" | "chat" | "chat-enabled"
 *      | "chat-error" | "chat-throttled" | "stream-ended" | "rejected" | "pong" }
 */

export interface RoomEvents {
  onOpen?: () => void;
  onWelcome?: (msg: { role: "host" | "viewer"; viewerId?: string; viewerCount?: number; hostPresent?: boolean }) => void;
  onPresence?: (viewerCount: number) => void;
  onViewerJoined?: (viewerId: string) => void;
  onViewerLeft?: (viewerId: string) => void;
  onHostPresent?: () => void;
  onHostLeft?: () => void;
  onSignal?: (from: string, payload: unknown) => void;
  onChat?: (msg: { id: string; username: string; text: string; ts: number }) => void;
  onStreamEnded?: () => void;
  onRejected?: (code: string, message: string) => void;
  onDisconnected?: () => void;
  onReconnected?: () => void;
}

type Json = Record<string, unknown>;

const PING_INTERVAL = 25_000;

export class RoomSocket {
  private ws: WebSocket | null = null;
  private events: RoomEvents = {};
  private joinMessage: Json;
  private pingTimer: number | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private intentionalClose = false;
  private everConnected = false;

  constructor(
    private readonly streamId: string,
    events: RoomEvents = {}
  ) {
    this.events = events;
    this.joinMessage = {};
  }

  connect(joinMessage: Json) {
    this.joinMessage = joinMessage;
    this.open();
  }

  private open() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.intentionalClose = false;

    let ws: WebSocket;
    try {
      ws = new WebSocket(roomWsUrl(this.streamId));
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "join", ...this.joinMessage }));
      this.pingTimer = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, PING_INTERVAL);
    });

    ws.addEventListener("message", (event) => {
      let msg: Json;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      this.handle(msg);
    });

    ws.addEventListener("close", () => {
      this.clearPing();
      if (this.intentionalClose) return;
      this.events.onDisconnected?.();
      this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      /* close handler manages recovery */
    });
  }

  private handle(msg: Json) {
    switch (msg.type) {
      case "welcome":
        this.reconnectAttempts = 0;
        if (this.everConnected) this.events.onReconnected?.();
        this.everConnected = true;
        this.events.onWelcome?.({
          role: msg.role as "host" | "viewer",
          viewerId: msg.viewerId as string | undefined,
          viewerCount: msg.viewerCount as number | undefined,
          hostPresent: !!msg.hostPresent,
        });
        break;
      case "presence":
        this.events.onPresence?.(Number(msg.viewerCount ?? 0));
        break;
      case "viewer-joined":
        this.events.onViewerJoined?.(String(msg.viewerId));
        break;
      case "viewer-left":
        this.events.onViewerLeft?.(String(msg.viewerId));
        break;
      case "host-present":
        this.events.onHostPresent?.();
        break;
      case "host-left":
        this.events.onHostLeft?.();
        break;
      case "signal":
        this.events.onSignal?.(String(msg.from), msg.payload);
        break;
      case "chat":
        this.events.onChat?.({
          id: String(msg.id),
          username: String(msg.username ?? "viewer"),
          text: String(msg.text ?? ""),
          ts: Number(msg.ts ?? Date.now()),
        });
        break;
      case "stream-ended":
        this.events.onStreamEnded?.();
        this.close();
        break;
      case "rejected":
        this.events.onRejected?.(String(msg.code ?? "error"), String(msg.message ?? "Connection rejected"));
        this.close();
        break;
      default:
        break;
    }
  }

  send(msg: Json) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  sendSignal(to: string, payload: unknown) {
    this.send({ type: "signal", to, payload });
  }

  private clearPing() {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 15_000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  close() {
    this.intentionalClose = true;
    this.clearPing();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.ws?.close(1000, "client closing");
    } catch {
      /* already closed */
    }
    this.ws = null;
  }
}
