import type { RoomSocket } from "./roomSocket";
import type { CallPeer } from "@/types";

/**
 * CallEngine — mesh (many-to-many) WebRTC for call rooms.
 *
 * Topology: every participant publishes its local tracks to every other
 * participant over a dedicated RTCPeerConnection per peer. Signaling rides
 * the RoomSocket relay (`signal` to any participant id).
 *
 * Offer direction is deterministic — *whoever joined later creates the offer*:
 *   - On welcome, the joiner offers to every peer in the snapshot (impolite side).
 *   - On peer-joined, existing participants wait for that peer's offer (polite side).
 * Both sides run the perfect-negotiation collision handler anyway, so refresh
 * races and reconnects self-heal instead of deadlocking.
 *
 * Scale note: mesh upload grows linearly with participants; rooms cap at 8
 * (server-enforced). An SFU is the documented upgrade path beyond that.
 */

interface SignalPayload {
  type?: string;
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}

function isIcePayload(payload: unknown): payload is { candidate: RTCIceCandidateInit } {
  const p = payload as SignalPayload;
  return typeof p?.candidate === "object" && p.candidate !== null;
}

function isDescriptionPayload(payload: unknown): payload is { type: RTCSdpType; sdp: string } {
  const p = payload as SignalPayload;
  return (
    (p?.type === "offer" || p?.type === "answer" || p?.type === "pranswer" || p?.type === "rollback") &&
    typeof p?.sdp === "string"
  );
}

interface PeerEntry {
  pc: RTCPeerConnection;
  username: string;
  isHost: boolean;
  /** Polite side waits for the offer; impolite side creates it. */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
}

export interface CallEngineHandlers {
  onPeerStream: (peerId: string, stream: MediaStream) => void;
  onPeerState: (peerId: string, state: RTCPeerConnectionState) => void;
  onPeerRetracted: (peerId: string) => void;
}

export class CallEngine {
  private peers = new Map<string, PeerEntry>();
  private closed = false;

  constructor(
    private readonly room: RoomSocket,
    private readonly iceServers: RTCIceServer[],
    private readonly localStream: MediaStream | null,
    private readonly handlers: CallEngineHandlers
  ) {}

  /** Snapshot from welcome — we are the newcomer; offer to each of them. */
  async connectToPeers(peers: CallPeer[]): Promise<void> {
    for (const peer of peers) {
      if (!this.peers.has(peer.id)) {
        this.createPeer(peer.id, peer.username, peer.isHost, false);
      }
    }
    for (const [peerId, entry] of this.peers) {
      if (entry.pc.signalingState === "stable" && !entry.makingOffer) {
        await this.makeOffer(peerId);
      }
    }
  }

  /** A peer joined after us — they will offer; we answer (polite). */
  addPeer(peer: CallPeer): void {
    if (this.peers.has(peer.id)) return;
    this.createPeer(peer.id, peer.username, peer.isHost, true);
  }

  removePeer(peerId: string): void {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    try {
      entry.pc.close();
    } catch {
      /* noop */
    }
    this.peers.delete(peerId);
    this.handlers.onPeerRetracted(peerId);
  }

  get peerIds(): string[] {
    return [...this.peers.keys()];
  }

  /** Enable/disable the local camera/mic tracks everywhere they are sent. */
  setTrackEnabled(kind: "audio" | "video", enabled: boolean): void {
    for (const track of this.localStream?.getTracks() ?? []) {
      if (track.kind === kind) track.enabled = enabled;
    }
  }

  /**
   * Handle a relayed signal. Creates the peer connection on first contact
   * (the incoming offer is what tells polite sides a new peer exists).
   */
  async handleSignal(from: string, payload: unknown): Promise<void> {
    if (this.closed) return;
    let entry = this.peers.get(from);
    if (!entry) {
      if (!isDescriptionPayload(payload) || payload.type !== "offer") return; // stray candidate
      entry = this.createPeer(from, "guest", false, true);
    }
    const { pc } = entry;

    try {
      if (isDescriptionPayload(payload)) {
        // Perfect negotiation (mdn pattern): offer collision is resolved by
        // rolling back on the polite side, ignoring on the impolite side.
        const readyForOffer = !entry.makingOffer && (pc.signalingState === "stable" || pc.signalingState === "have-local-offer");
        const offerCollision = payload.type === "offer" && !readyForOffer;
        entry.ignoreOffer = !entry.polite && offerCollision;
        if (entry.ignoreOffer) return;

        await pc.setRemoteDescription({ type: payload.type, sdp: payload.sdp });
        if (payload.type === "offer") {
          await pc.setLocalDescription();
          this.room.sendSignal(from, { type: pc.localDescription!.type, sdp: pc.localDescription!.sdp });
        }
      } else if (isIcePayload(payload) && payload.candidate) {
        if (!entry.ignoreOffer) {
          await pc.addIceCandidate(payload.candidate).catch(() => {
            /* candidate after connect — safe to drop */
          });
        }
      }
    } catch (error) {
      console.error("[call] signaling failed for peer", from, error);
    }
  }

  private createPeer(peerId: string, username: string, isHost: boolean, polite: boolean): PeerEntry {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: "max-bundle" });
    const entry: PeerEntry = { pc, username, isHost, polite, makingOffer: false, ignoreOffer: false };
    this.peers.set(peerId, entry);

    // Publish local tracks (if the participant brought cam/mic).
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    } else {
      // Receive-only transceivers so receiving works with no local media.
      pc.addTransceiver("audio", { direction: "recvonly" });
      pc.addTransceiver("video", { direction: "recvonly" });
    }

    pc.addEventListener("negotiationneeded", () => {
      void this.makeOffer(peerId);
    });

    pc.addEventListener("icecandidate", (event) => {
      if (event.candidate) {
        this.room.sendSignal(peerId, { candidate: event.candidate.toJSON() });
      }
    });

    pc.addEventListener("track", (event) => {
      const [stream] = event.streams;
      const media = stream ?? new MediaStream([event.track]);
      this.handlers.onPeerStream(peerId, media);
    });

    pc.addEventListener("connectionstatechange", () => {
      this.handlers.onPeerState(peerId, pc.connectionState);
      if (pc.connectionState === "failed") {
        // ICE restart — a fresh offer recovers transient network drops.
        pc.restartIce();
      }
    });

    return entry;
  }

  private async makeOffer(peerId: string): Promise<void> {
    const entry = this.peers.get(peerId);
    if (!entry || this.closed) return;
    try {
      entry.makingOffer = true;
      await entry.pc.setLocalDescription();
      if (entry.pc.localDescription) {
        this.room.sendSignal(peerId, {
          type: entry.pc.localDescription.type,
          sdp: entry.pc.localDescription.sdp,
        });
      }
    } catch (error) {
      console.error("[call] offer failed for peer", peerId, error);
    } finally {
      entry.makingOffer = false;
    }
  }

  close(): void {
    this.closed = true;
    for (const [peerId, entry] of this.peers) {
      try {
        entry.pc.close();
      } catch {
        /* noop */
      }
      this.handlers.onPeerRetracted(peerId);
    }
    this.peers.clear();
  }
}
