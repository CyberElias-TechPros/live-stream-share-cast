/**
 * Peer-to-peer streaming engine.
 *
 * Media (audio/video) flows **directly between browsers** over WebRTC — the
 * Cloudflare Worker only acts as the signalling bridge, through a per-stream
 * `SignalRoom` Durable Object. When streamer and viewers share a network the
 * stream is delivered locally with minimal latency; when they do not, a TURN
 * server is required (see `docs/DEPLOYMENT.md`).
 *
 * Signalling protocol (JSON frames, relayed by the Durable Object):
 *   viewer → streamer : hello-viewer   (presence, re-sent until ready)
 *   streamer → viewer : streamer-ready (re-announced on hello + periodically)
 *   viewer → streamer : offer          (recvonly SDP)
 *   streamer → viewer : answer
 *   both → each other: ice             (candidates; queued until remote desc)
 *   viewer → streamer : quality        (optional per-viewer bitrate cap)
 *   leaving peer      : close
 *
 * Frames carrying a `to` field are routed to that single peer; everything else
 * is broadcast to the room. The Durable Object stamps the authoritative
 * `from` id, so peers cannot impersonate each other.
 */

import { apiSocket } from "@/integrations/api/client";
import { platformService } from "@/services/platformService";

export type LanState = "idle" | "waiting" | "ready" | "connecting" | "connected" | "failed";

/**
 * `local` keeps media on the network — no TURN relay is offered, so a connection
 * that needs one simply fails instead of leaving the LAN. `internet` adds the
 * TURN credentials minted by the Worker, which is what gets viewers behind
 * symmetric NAT or on mobile networks connected.
 */
export type TransportMode = "local" | "internet";

interface SignalMsg {
  from: string;
  to?: string;
  type: "hello-viewer" | "streamer-ready" | "offer" | "answer" | "ice" | "close" | "quality";
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  /** Requested ceiling for this viewer, in kbps. `null` restores automatic. */
  kbps?: number | null;
}

/**
 * Fallback used only when `/api/config/rtc/ice` cannot be reached: host
 * candidates still connect peers on the same network.
 */
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

let cachedIceServers: RTCIceServer[] | null = null;
let icePromise: Promise<RTCIceServer[]> | null = null;

/**
 * STUN/TURN servers for this session.
 *
 * TURN credentials are minted per request by the Worker (they expire), so they
 * are cached in memory only — never persisted to storage.
 */
async function iceServers(): Promise<RTCIceServer[]> {
  if (cachedIceServers) return cachedIceServers;
  icePromise ??= platformService
    .iceServers()
    .then((servers) => {
      cachedIceServers = servers.length ? servers : FALLBACK_ICE_SERVERS;
      return cachedIceServers;
    })
    .catch(() => FALLBACK_ICE_SERVERS)
    .finally(() => {
      icePromise = null;
    });
  return icePromise;
}

async function iceConfiguration(mode: TransportMode = "internet"): Promise<RTCConfiguration> {
  const servers = await iceServers();
  return {
    // Local mode strips the relays: direct (host/STUN-reflexive) candidates only.
    iceServers: mode === "local" ? servers.filter((server) => !String(server.urls).startsWith("turn")) : servers,
    // A relay-only fallback is used by the browser when no direct path exists.
    iceTransportPolicy: "all",
    bundlePolicy: "max-bundle",
  };
}

const channelName = (streamId: string) => `lan-stream-${streamId}`;

function selfId(): string {
  return `peer-${Math.random().toString(36).slice(2, 10)}`;
}

interface SignalIdentity {
  /** Client-generated peer id — the Durable Object echoes it back as `from`. */
  peerId: string;
  role: "host" | "viewer";
}

/**
 * Opens one long-lived WebSocket used for BOTH sending and receiving signal
 * frames, with queueing while connecting and exponential-backoff reconnects.
 * Returns { send, unsubscribe }.
 */
function openSignalChannel(
  streamId: string,
  identity: SignalIdentity,
  onMessage: (msg: SignalMsg) => void,
): { send: (msg: SignalMsg) => void; unsubscribe: () => void } {
  let socket: WebSocket | null = null;
  let stopped = false;
  let retry = 0;
  let timer: number | null = null;
  const outbox: SignalMsg[] = [];

  const flush = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    while (outbox.length) {
      const next = outbox.shift();
      if (next) socket.send(JSON.stringify(next));
    }
  };

  const connect = () => {
    if (stopped) return;

    const ws = apiSocket(`/api/ws/signal/${streamId}`, {
      params: { peerId: identity.peerId, role: identity.role },
    });
    socket = ws;

    ws.onopen = () => {
      retry = 0;
      flush();
    };

    ws.onmessage = (event: MessageEvent) => {
      let msg: SignalMsg;
      try {
        msg = JSON.parse(event.data as string) as SignalMsg;
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== "string") return;
      if (msg.from === identity.peerId) return; // our own frame echoing back
      if (msg.to && msg.to !== identity.peerId) return; // addressed to another peer
      onMessage(msg);
    };

    ws.onclose = () => {
      if (stopped) return;
      retry = Math.min(retry + 1, 6);
      timer = window.setTimeout(connect, Math.min(1000 * 2 ** retry, 20_000));
    };

    ws.onerror = () => {
      /* onclose handles the reconnect */
    };
  };

  connect();

  return {
    send: (msg: SignalMsg) => {
      outbox.push(msg);
      if (outbox.length > 50) outbox.shift(); // never let a dead socket grow unbounded
      flush();
    },
    unsubscribe: () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
      socket = null;
    },
  };
}

/* ================================================================== */
/*  Streamer                                                          */
/* ================================================================== */

export class LanStreamer {
  private media: MediaStream;
  private streamId: string;
  private me = selfId();
  private mode: TransportMode;
  private pcs = new Map<string, RTCPeerConnection>();
  private sig: { send: (m: SignalMsg) => void; unsubscribe: () => void } | null = null;
  private readyTimer: number | null = null;
  private stopped = false;

  onViewerCount: ((count: number) => void) | null = null;
  onStateChange: ((active: boolean) => void) | null = null;
  /** Fires when a viewer asks for a different quality (kbps null = automatic). */
  onQualityHint: ((viewer: string, kbps: number | null) => void) | null = null;

  constructor(streamId: string, media: MediaStream, mode: TransportMode = "internet") {
    this.streamId = streamId;
    this.media = media;
    this.mode = mode;
  }

  /**
   * Applies a viewer's quality choice to the encodings we send them. Browsers
   * that do not support `setParameters` simply keep the original encoding, so
   * the request is best-effort and never breaks the call.
   */
  private async applyQuality(viewer: string, kbps: number | null) {
    const pc = this.pcs.get(viewer);
    if (!pc) return;

    for (const sender of pc.getSenders()) {
      if (!sender.track) continue;
      try {
        const params = sender.getParameters();
        params.encodings = params.encodings?.length ? params.encodings : [{}];
        for (const encoding of params.encodings) {
          if (kbps === null) delete encoding.maxBitrate;
          else encoding.maxBitrate = kbps * 1000;
        }
        await sender.setParameters(params);
      } catch (err) {
        console.warn("[LAN] could not apply quality hint:", err);
      }
    }
  }

  get activeViewers(): number {
    let n = 0;
    this.pcs.forEach((pc) => {
      if (pc.connectionState === "connected") n++;
    });
    return n;
  }

  start() {
    if (this.sig) return;

    this.sig = openSignalChannel(this.streamId, { peerId: this.me, role: "host" }, (msg) => this.onSignal(msg));

    // Periodically announce so late-joining viewers can find us.
    this.announce();
    this.readyTimer = window.setInterval(() => this.announce(), 4000);

    console.info("[LAN] streamer ready — channel", channelName(this.streamId));
  }

  private send(m: SignalMsg) {
    this.sig?.send(m);
  }

  private announce() {
    if (this.stopped) return;
    this.send({ from: this.me, type: "streamer-ready" });
  }

  private onSignal(msg: SignalMsg) {
    if (!msg || msg.from === this.me || this.stopped) return;

    switch (msg.type) {
      case "hello-viewer":
        // Respond to the newcomer so their UI flips to "Connect".
        this.send({ from: this.me, to: msg.from, type: "streamer-ready" });
        break;

      case "offer":
        if (msg.sdp) void this.handleOffer(msg.from, msg.sdp);
        break;

      case "quality":
        this.onQualityHint?.(msg.from, msg.kbps ?? null);
        void this.applyQuality(msg.from, msg.kbps ?? null);
        break;

      case "ice": {
        const pc = this.pcs.get(msg.from);
        if (pc && msg.candidate) {
          pc.addIceCandidate(msg.candidate).catch(() => {
            /* stale candidate — safe to ignore */
          });
        }
        break;
      }

      case "close":
        this.closePeer(msg.from);
        break;
    }
  }

  private async handleOffer(from: string, sdp: RTCSessionDescriptionInit) {
    // Re-join: replace any existing connection from this peer.
    const existing = this.pcs.get(from);
    if (existing) {
      existing.close();
      this.pcs.delete(from);
    }

    const pc = new RTCPeerConnection(await iceConfiguration(this.mode));
    this.pcs.set(from, pc);

    // Send all current tracks on this connection.
    this.media.getTracks().forEach((track) => {
      pc.addTrack(track, this.media);
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.send({
          from: this.me,
          to: from,
          type: "ice",
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        this.closePeer(from);
      }
      this.emitCount();
    };

    try {
      await pc.setRemoteDescription(sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.send({ from: this.me, to: from, type: "answer", sdp: answer });
    } catch (err) {
      console.warn("[LAN] answer failed:", err);
      this.closePeer(from);
    }

    this.emitCount();
  }

  private closePeer(from: string) {
    const pc = this.pcs.get(from);
    if (pc) {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      this.pcs.delete(from);
    }
    this.emitCount();
  }

  private emitCount() {
    if (this.stopped) return;
    const n = this.activeViewers;
    this.onViewerCount?.(n);
    this.onStateChange?.(n > 0);
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.readyTimer) window.clearInterval(this.readyTimer);
    this.readyTimer = null;
    // Tell everyone we're done.
    this.send({ from: this.me, type: "close" });
    this.pcs.forEach((pc) => {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
    });
    this.pcs.clear();
    this.sig?.unsubscribe();
    this.sig = null;
    console.info("[LAN] streamer stopped");
  }
}

/* ================================================================== */
/*  Viewer                                                            */
/* ================================================================== */

export class LanViewer {
  private streamId: string;
  private mode: TransportMode;
  private me = selfId();
  private pc: RTCPeerConnection | null = null;
  private queuedCandidates: RTCIceCandidateInit[] = [];
  private sig: { send: (m: SignalMsg) => void; unsubscribe: () => void } | null = null;
  private helloTimer: number | null = null;
  private stopped = false;
  private _ready = false;

  /** Set from the host's `streamer-ready` frame, used to address quality hints. */
  private streamerId: string | null = null;

  onStream: ((media: MediaStream | null) => void) | null = null;
  onState: ((state: LanState) => void) | null = null;

  constructor(streamId: string, mode: TransportMode = "internet") {
    this.streamId = streamId;
    this.mode = mode;
  }

  get streamerReady(): boolean {
    return this._ready;
  }

  /** The live peer connection, for measuring real playback statistics. */
  get peerConnection(): RTCPeerConnection | null {
    return this.pc;
  }

  /**
   * Asks the host to cap the video bitrate sent to this viewer. `null` restores
   * the host's automatic encoding. Works because the host owns the encoder —
   * the request travels over the same signalling channel as the SDP.
   */
  requestQuality(kbps: number | null): void {
    if (!this.pc) return;
    this.send({ from: this.me, to: this.streamerId ?? undefined, type: "quality", kbps });
  }

  /** Opens the peer connection (ICE servers resolved on demand). */
  async connect(): Promise<void> {
    if (this.pc) return;

    this.pc = new RTCPeerConnection(await iceConfiguration(this.mode));

    this.pc.addTransceiver("video", { direction: "recvonly" });
    this.pc.addTransceiver("audio", { direction: "recvonly" });

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.send({
          from: this.me,
          type: "ice",
          candidate: e.candidate.toJSON(),
        });
      }
    };

    this.pc.ontrack = (e) => {
      if (e.streams && e.streams[0]) {
        this.emitState("connected");
        this.onStream?.(e.streams[0]);
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      const s = this.pc.connectionState;
      if (s === "connected") this.emitState("connected");
      else if (s === "failed") {
        // Release the dead peer so "Try again" can build a fresh one.
        this.pc.onicecandidate = null;
        this.pc.close();
        this.pc = null;
        this.emitState("failed");
      }
    };

    void this.createOffer();
  }

  private send(m: SignalMsg) {
    this.sig?.send(m);
  }

  private async createOffer() {
    const pc = this.pc;
    if (!pc) return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.emitState("connecting");
      this.send({ from: this.me, type: "offer", sdp: offer });
    } catch (err) {
      console.warn("[LAN] offer failed:", err);
      this.emitState("failed");
    }
  }

  private onSignal(msg: SignalMsg) {
    if (!msg || msg.from === this.me || this.stopped) return;
    // Signaling is shared on one broadcast channel: ignore offers/answers/ICE
    // addressed to other viewers.
    if (msg.to && msg.to !== this.me) return;

    switch (msg.type) {
      case "streamer-ready":
        this.streamerId = msg.from;
        if (!this._ready) {
          this._ready = true;
          if (this.helloTimer) window.clearInterval(this.helloTimer);
          this.helloTimer = null;
          this.emitState(this.pc ? (this.pc.connectionState === "connected" ? "connected" : "connecting") : "ready");
        }
        break;

      case "answer": {
        const pc = this.pc;
        if (!pc || !msg.sdp) return;
        pc.setRemoteDescription(msg.sdp).then(() => {
          // Flush candidates that arrived before the remote description.
          this.queuedCandidates.forEach((c) =>
            pc.addIceCandidate(c).catch(() => undefined)
          );
          this.queuedCandidates = [];
        }).catch((err) => {
          console.warn("[LAN] answer rejected:", err);
        });
        break;
      }

      case "ice": {
        const pc = this.pc;
        if (!pc || !msg.candidate) return;
        if (pc.currentRemoteDescription) {
          pc.addIceCandidate(msg.candidate).catch(() => undefined);
        } else {
          this.queuedCandidates.push(msg.candidate);
        }
        break;
      }

      case "close":
        // Streamer ended — drop the connection so the UI can react.
        if (this.pc) {
          try {
            this.pc.close();
          } catch {
            /* ignore */
          }
          this.pc = null;
        }
        this._ready = false;
        this.emitState("waiting");
        this.onStream?.(null);
        break;
    }
  }

  /** Starts listening for the streamer and keeps knocking until found. */
  start() {
    if (this.sig) return;
    this.sig = openSignalChannel(this.streamId, { peerId: this.me, role: "host" }, (msg) => this.onSignal(msg));
    this.knock();
    this.helloTimer = window.setInterval(() => this.knock(), 3000);
    this.emitState(this._ready ? "ready" : "waiting");
  }

  private knock() {
    if (this.stopped || this._ready) return;
    this.send({ from: this.me, type: "hello-viewer" });
  }

  private emitState(state: LanState) {
    if (this.stopped) return;
    this.onState?.(state);
  }

  disconnect() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.helloTimer) window.clearInterval(this.helloTimer);
    this.helloTimer = null;
    this.send({ from: this.me, type: "close" });
    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        /* ignore */
      }
      this.pc = null;
    }
    this.onStream?.(null);
    this.sig?.unsubscribe();
    this.sig = null;
  }
}
