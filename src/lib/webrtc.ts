import type { RoomSocket } from "./roomSocket";

/**
 * WebRTC transport over the RoomDO signaling relay.
 *
 * Topology: one publishing host, N subscribing viewers, direct peer
 * connections host↔viewer. Viewers initiate the offer (the host never needs
 * the viewer list up front); ICE trickles through the room relay.
 *
 * Scale note: this mesh is intentional for the product's "instant, personal
 * broadcast" use-case (small audiences, zero infrastructure). A-hosted SFU
 * (e.g. Cloudflare Calls) is the documented upgrade path for large audiences.
 */

export interface PeerStats {
  viewerId: string;
  state: RTCPeerConnectionState;
}

interface SignalPayload {
  type?: string;
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}

function isIcePayload(payload: unknown): payload is { candidate: RTCIceCandidateInit } {
  const p = payload as SignalPayload;
  return typeof p?.candidate === "object" && p.candidate !== null;
}

function isSdpPayload(payload: unknown): payload is { type: RTCSdpType; sdp: string } {
  const p = payload as SignalPayload;
  return (p?.type === "offer" || p?.type === "answer" || p?.type === "pranswer" || p?.type === "rollback") && typeof p?.sdp === "string";
}

// ---------------------------------------------------------------------------
// Host side — publishes a local MediaStream to each viewer
// ---------------------------------------------------------------------------

export class Broadcaster {
  private peers = new Map<string, RTCPeerConnection>();
  private mediaStream: MediaStream | null = null;
  private maxBitrateBps: number | null = null;

  constructor(
    private readonly room: RoomSocket,
    private readonly iceServers: RTCIceServer[]
  ) {}

  /** Begin publishing; call once the room socket is joined as host. */
  publish(mediaStream: MediaStream, opts: { maxBitrateBps?: number } = {}) {
    this.mediaStream = mediaStream;
    this.maxBitrateBps = opts.maxBitrateBps ?? null;
  }

  get viewerCount(): number {
    return this.peers.size;
  }

  get stats(): PeerStats[] {
    return [...this.peers.entries()].map(([viewerId, pc]) => ({ viewerId, state: pc.connectionState }));
  }

  /** A viewer joined — nothing to do until its offer arrives. */
  addViewer(viewerId: string): void {
    if (this.peers.has(viewerId)) return;
    // Connection is created when the viewer's offer arrives (viewer-initiated).
  }

  removeViewer(viewerId: string): void {
    const pc = this.peers.get(viewerId);
    if (pc) {
      pc.close();
      this.peers.delete(viewerId);
    }
  }

  dropAll(): void {
    for (const [id] of this.peers) this.removeViewer(id);
  }

  /** Handle a signal from a viewer (offer or ICE candidate). */
  async handleViewerSignal(viewerId: string, payload: unknown): Promise<void> {
    if (!this.mediaStream) return;

    let pc = this.peers.get(viewerId);
    if (!pc) {
      if (!isSdpPayload(payload) || payload.type !== "offer") return; // ignore candidates before offer
      pc = this.createPeer(viewerId);
    }

    try {
      if (isSdpPayload(payload)) {
        if (payload.type !== "offer") return;
        await pc.setRemoteDescription({ type: "offer", sdp: payload.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.room.sendSignal(viewerId, { type: answer.type, sdp: answer.sdp });
      } else if (isIcePayload(payload) && payload.candidate) {
        await pc.addIceCandidate(payload.candidate).catch(() => {
          /* candidate arrived after connect — safe to drop */
        });
      }
    } catch (error) {
      console.error(`[broadcaster] signaling failed for ${viewerId}`, error);
    }
  }

  private createPeer(viewerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: "max-bundle" });
    this.peers.set(viewerId, pc);

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        pc.addTrack(track, this.mediaStream);
      }
    }

    if (this.maxBitrateBps !== null) {
      // Apply an upload bandwidth ceiling once the sender is negotiated.
      pc.addEventListener("negotiationneeded", () => {
        for (const sender of pc.getSenders()) {
          const params = sender.getParameters();
          params.encodings = params.encodings?.length ? params.encodings : [{}];
          params.encodings[0]!.maxBitrate = this.maxBitrateBps!;
          params.degradationPreference = "maintain-framerate";
          sender.setParameters(params).catch(() => {});
        }
      });
    }

    pc.addEventListener("icecandidate", (event) => {
      if (event.candidate) {
        this.room.sendSignal(viewerId, { candidate: event.candidate.toJSON() });
      }
    });

    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.removeViewer(viewerId);
      }
    });

    return pc;
  }
}

// ---------------------------------------------------------------------------
// Viewer side — subscribes to the host's published stream
// ---------------------------------------------------------------------------

export type ViewerState = "idle" | "connecting" | "live" | "reconnecting" | "ended" | "failed";

export class ViewerEngine {
  private pc: RTCPeerConnection | null = null;
  private remoteStream: MediaStream | null = null;

  constructor(
    private readonly room: RoomSocket,
    private readonly iceServers: RTCIceServer[],
    private readonly handlers: {
      onState: (state: ViewerState) => void;
      onStream: (stream: MediaStream) => void;
    }
  ) {}

  get state(): ViewerState {
    return this.pc?.connectionState === "connected" ? "live" : this.pc ? "connecting" : "idle";
  }

  /** Live peer connection reference (for stats). */
  get peerConnection(): RTCPeerConnection | null {
    return this.pc;
  }

  /** Host is present — start (or restart) the subscription. */
  async subscribe(): Promise<void> {
    this.teardownPeer();
    this.handlers.onState("connecting");

    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: "max-bundle" });
    this.pc = pc;

    pc.addEventListener("track", (event) => {
      const [stream] = event.streams;
      if (stream) {
        this.remoteStream = stream;
        this.handlers.onStream(stream);
      } else {
        // Fallback for senders that don't associate a stream.
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
          this.handlers.onStream(this.remoteStream);
        }
        this.remoteStream.addTrack(event.track);
      }
    });

    pc.addEventListener("icecandidate", (event) => {
      if (event.candidate) {
        this.room.sendSignal("host", { candidate: event.candidate.toJSON() });
      }
    });

    pc.addEventListener("connectionstatechange", () => {
      switch (pc.connectionState) {
        case "connected":
          this.handlers.onState("live");
          break;
        case "disconnected":
          this.handlers.onState("reconnecting");
          break;
        case "failed":
          this.handlers.onState("failed");
          break;
        case "closed":
        case "new":
          break;
      }
    });

    // Receive-only transceivers: we never send media upstream.
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.room.sendSignal("host", { type: offer.type, sdp: offer.sdp });
  }

  /** Handle a signal from the host (answer or ICE candidate). */
  async handleHostSignal(payload: unknown): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    try {
      if (isSdpPayload(payload)) {
        if (payload.type !== "answer") return;
        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription({ type: "answer", sdp: payload.sdp });
        }
      } else if (isIcePayload(payload) && payload.candidate) {
        await pc.addIceCandidate(payload.candidate).catch(() => {});
      }
    } catch (error) {
      console.error("[viewer] signaling failed", error);
    }
  }

  stop(): void {
    this.teardownPeer();
    this.handlers.onState("idle");
  }

  private teardownPeer() {
    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        /* noop */
      }
      this.pc = null;
    }
    this.remoteStream = null;
  }
}

/** Read live connection stats for a receiving peer connection. */
export interface ViewerStats {
  bytesReceived: number;
  resolution: string;
  fps: number;
  rttMs: number | null;
  packetsLost: number | null;
  jitterMs: number | null;
}

export async function readViewerStats(pc: RTCPeerConnection | null): Promise<ViewerStats | null> {
  if (!pc || pc.connectionState !== "connected") return null;
  try {
    const report = await pc.getStats();
    let bytesReceived = 0;
    let resolution = "";
    let fps = 0;
    let rttMs: number | null = null;
    let packetsLost: number | null = null;
    let jitterMs: number | null = null;

    report.forEach((s) => {
      const stat = s as unknown as Record<string, number | string | undefined>;
      if (stat.type === "inbound-rtp" && stat.kind === "video") {
        bytesReceived = Number(stat.bytesReceived ?? 0);
        resolution = stat.frameWidth ? `${stat.frameWidth}×${stat.frameHeight}` : resolution;
        fps = Math.round(Number(stat.framesPerSecond ?? 0));
        packetsLost = stat.packetsLost !== undefined ? Number(stat.packetsLost) : packetsLost;
        jitterMs = stat.jitter !== undefined ? Math.round(Number(stat.jitter) * 1000) : jitterMs;
      }
      if (stat.type === "candidate-pair" && stat.state === "succeeded") {
        rttMs = stat.currentRoundTripTime !== undefined ? Math.round(Number(stat.currentRoundTripTime) * 1000) : rttMs;
      }
    });
    return { bytesReceived, resolution, fps, rttMs, packetsLost, jitterMs };
  } catch {
    return null;
  }
}
