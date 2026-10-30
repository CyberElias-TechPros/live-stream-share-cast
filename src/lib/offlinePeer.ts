/**
 * Browser-to-browser signalling for a fully offline LAN room.
 *
 * Unlike `lanStream.ts`, this module never opens an API/WebSocket connection
 * and never asks a public STUN/TURN service for candidates. The two browsers
 * exchange a complete SDP offer/answer by copy and paste. Once the answer is
 * applied, WebRTC carries media directly over the reachable local network.
 */

export const OFFLINE_SIGNAL_PROTOCOL = "imlive-offline-webrtc" as const;
export const OFFLINE_SIGNAL_VERSION = 1 as const;
export const MAX_OFFLINE_SIGNAL_CHARS = 200_000;

export type OfflineSignalType = "offer" | "answer";

export interface OfflineSignal {
  protocol: typeof OFFLINE_SIGNAL_PROTOCOL;
  version: typeof OFFLINE_SIGNAL_VERSION;
  type: OfflineSignalType;
  roomCode: string;
  sdp: string;
}

export class OfflinePeerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflinePeerError";
  }
}

const ROOM_CODE_PATTERN = /^[A-Z0-9]{4,12}$/;

export function createOfflineRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint32Array(6);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

export function normalizeOfflineRoomCode(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 12);
}

function validateRoomCode(roomCode: string): string {
  const normalized = normalizeOfflineRoomCode(roomCode);
  if (!ROOM_CODE_PATTERN.test(normalized)) {
    throw new OfflinePeerError("Use a room code containing 4 to 12 letters or numbers.");
  }
  return normalized;
}

/** Creates an ICE-free peer connection. No network request is made here. */
export function createOfflinePeerConnection(): RTCPeerConnection {
  if (typeof RTCPeerConnection === "undefined") {
    throw new OfflinePeerError("This browser does not provide WebRTC.");
  }

  return new RTCPeerConnection({
    iceServers: [],
    iceCandidatePoolSize: 0,
    iceTransportPolicy: "all",
    bundlePolicy: "max-bundle",
  });
}

function signalFromDescription(
  type: OfflineSignalType,
  roomCode: string,
  description: RTCSessionDescription | null,
): OfflineSignal {
  if (!description?.sdp) {
    throw new OfflinePeerError("The browser did not produce a usable WebRTC description.");
  }
  return {
    protocol: OFFLINE_SIGNAL_PROTOCOL,
    version: OFFLINE_SIGNAL_VERSION,
    type,
    roomCode: validateRoomCode(roomCode),
    sdp: description.sdp,
  };
}

/** Waits for non-trickle ICE to finish so the copied bundle contains candidates. */
export function waitForOfflineIceGathering(
  peer: RTCPeerConnection,
  timeoutMs = 12_000,
): Promise<void> {
  if (peer.iceGatheringState === "complete") return Promise.resolve();

  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", onStateChange);
      resolve();
    };
    const onStateChange = () => {
      if (peer.iceGatheringState === "complete") finish();
    };
    const timeout = window.setTimeout(finish, timeoutMs);
    peer.addEventListener("icegatheringstatechange", onStateChange);
  });
}

export async function createOfflineOffer(
  peer: RTCPeerConnection,
  roomCode: string,
): Promise<OfflineSignal> {
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await waitForOfflineIceGathering(peer);
  return signalFromDescription("offer", roomCode, peer.localDescription);
}

export function encodeOfflineSignal(signal: OfflineSignal): string {
  // Minified JSON is intentional: SDP is already verbose and users may be
  // sharing the bundle through a limited clipboard or messaging surface.
  return JSON.stringify(signal);
}

export function decodeOfflineSignal(raw: string): OfflineSignal {
  const text = raw.trim();
  if (!text) throw new OfflinePeerError("Paste the other device's signalling bundle first.");
  if (text.length > MAX_OFFLINE_SIGNAL_CHARS) {
    throw new OfflinePeerError("That signalling bundle is too large to be valid.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new OfflinePeerError("That bundle is not valid JSON. Copy the complete offer or answer.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new OfflinePeerError("That signalling bundle is not an object.");
  }
  const value = parsed as Partial<OfflineSignal>;
  if (value.protocol !== OFFLINE_SIGNAL_PROTOCOL || value.version !== OFFLINE_SIGNAL_VERSION) {
    throw new OfflinePeerError("This bundle was made by a different offline room version.");
  }
  if (value.type !== "offer" && value.type !== "answer") {
    throw new OfflinePeerError("The bundle must be an offer or an answer.");
  }
  if (typeof value.roomCode !== "string") {
    throw new OfflinePeerError("The bundle does not contain a room code.");
  }
  if (typeof value.sdp !== "string" || value.sdp.length < 20) {
    throw new OfflinePeerError("The bundle does not contain a usable SDP description.");
  }

  return {
    protocol: OFFLINE_SIGNAL_PROTOCOL,
    version: OFFLINE_SIGNAL_VERSION,
    type: value.type,
    roomCode: validateRoomCode(value.roomCode),
    sdp: value.sdp,
  };
}

export function assertOfflineSignalRoom(
  signal: OfflineSignal,
  expectedRoomCode: string,
): void {
  if (signal.roomCode !== validateRoomCode(expectedRoomCode)) {
    throw new OfflinePeerError("The room codes do not match. Paste a bundle from this room.");
  }
}

export async function acceptOfflineOfferAndCreateAnswer(
  peer: RTCPeerConnection,
  offer: OfflineSignal,
): Promise<OfflineSignal> {
  if (offer.type !== "offer") {
    throw new OfflinePeerError("A viewer must paste the broadcaster's offer.");
  }
  await peer.setRemoteDescription({ type: "offer", sdp: offer.sdp });
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  await waitForOfflineIceGathering(peer);
  return signalFromDescription("answer", offer.roomCode, peer.localDescription);
}

export async function acceptOfflineAnswer(
  peer: RTCPeerConnection,
  answer: OfflineSignal,
  expectedRoomCode: string,
): Promise<void> {
  if (answer.type !== "answer") {
    throw new OfflinePeerError("A broadcaster must paste the viewer's answer.");
  }
  assertOfflineSignalRoom(answer, expectedRoomCode);
  await peer.setRemoteDescription({ type: "answer", sdp: answer.sdp });
}
