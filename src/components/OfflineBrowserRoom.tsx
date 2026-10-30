import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Clipboard,
  Copy,
  Globe2,
  Link2,
  Radio,
  RefreshCw,
  ShieldOff,
  Video,
  WifiOff,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  acceptOfflineAnswer,
  acceptOfflineOfferAndCreateAnswer,
  createOfflineOffer,
  createOfflinePeerConnection,
  createOfflineRoomCode,
  decodeOfflineSignal,
  encodeOfflineSignal,
  normalizeOfflineRoomCode,
} from "@/lib/offlinePeer";

type RoomRole = "broadcaster" | "viewer";
type RoomStatus = "idle" | "preparing" | "waiting" | "connecting" | "connected" | "failed";

function statusLabel(status: RoomStatus): string {
  switch (status) {
    case "preparing": return "Preparing camera and local offer";
    case "waiting": return "Waiting for the other device";
    case "connecting": return "Connecting directly over the LAN";
    case "connected": return "Connected — media is local";
    case "failed": return "Needs attention";
    default: return "Ready to begin";
  }
}

function readableMediaError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Camera or microphone permission was denied. Allow both permissions, then try again.";
    }
    if (error.name === "NotFoundError") return "No camera or microphone was found on this device.";
    if (error.name === "NotReadableError") return "The camera or microphone is already in use by another app.";
  }
  return error instanceof Error ? error.message : "The browser could not start the local room.";
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Use the hidden textarea fallback below when clipboard permission is off.
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "true");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  input.remove();
  return copied;
}

async function readClipboard(): Promise<string | null> {
  try {
    if (navigator.clipboard?.readText) return await navigator.clipboard.readText();
  } catch {
    return null;
  }
  return null;
}

export default function OfflineBrowserRoom() {
  const [role, setRole] = useState<RoomRole>("broadcaster");
  const [roomCode, setRoomCode] = useState(createOfflineRoomCode);
  const [offerText, setOfferText] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [hostAnswerText, setHostAnswerText] = useState("");
  const [viewerOfferText, setViewerOfferText] = useState("");
  const [status, setStatus] = useState<RoomStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const stopSession = useCallback((clearBundles = false) => {
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setStatus("idle");
    setError(null);
    if (clearBundles) {
      setOfferText("");
      setAnswerText("");
      setHostAnswerText("");
      setViewerOfferText("");
    }
  }, []);

  useEffect(() => () => stopSession(true), [stopSession]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  const attachPeerEvents = useCallback((peer: RTCPeerConnection) => {
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") setStatus("connected");
      else if (["failed", "closed"].includes(peer.connectionState)) setStatus("failed");
      else if (peer.connectionState === "connecting") setStatus("connecting");
    };
    peer.oniceconnectionstatechange = () => {
      if (["failed", "disconnected"].includes(peer.iceConnectionState)) {
        setError("The local network path was interrupted. Check that both devices are on the same Wi-Fi and not on an isolated guest network.");
      }
    };
    peer.onicecandidateerror = () => {
      setError("The browser could not discover a local route. Check Wi-Fi reachability, firewall rules, guest-network isolation, and VPN settings.");
    };
  }, []);

  const startBroadcaster = async () => {
    if (peerRef.current || localStreamRef.current) stopSession(false);
    setError(null);
    setClipboardNotice(null);
    setStatus("preparing");
    try {
      const normalizedRoomCode = normalizeOfflineRoomCode(roomCode);
      setRoomCode(normalizedRoomCode);
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser cannot request camera and microphone access in the current context.");
      }
      const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const peer = createOfflinePeerConnection();
      attachPeerEvents(peer);
      media.getTracks().forEach((track) => peer.addTrack(track, media));
      localStreamRef.current = media;
      setLocalStream(media);
      peerRef.current = peer;
      const offer = await createOfflineOffer(peer, normalizedRoomCode);
      setOfferText(encodeOfflineSignal(offer));
      setStatus("waiting");
    } catch (cause) {
      peerRef.current?.close();
      peerRef.current = null;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      setStatus("failed");
      setError(readableMediaError(cause));
    }
  };

  const applyBroadcasterAnswer = async () => {
    setError(null);
    try {
      const answer = decodeOfflineSignal(hostAnswerText);
      const peer = peerRef.current;
      if (!peer) throw new Error("Start the broadcaster first so this room has an offer.");
      await acceptOfflineAnswer(peer, answer, roomCode);
      setStatus("connecting");
    } catch (cause) {
      setStatus("failed");
      setError(readableMediaError(cause));
    }
  };

  const startViewer = async () => {
    if (peerRef.current) stopSession(false);
    setError(null);
    setClipboardNotice(null);
    try {
      const offer = decodeOfflineSignal(viewerOfferText);
      if (offer.type !== "offer") throw new Error("Paste the broadcaster's offer, not an answer.");
      const peer = createOfflinePeerConnection();
      peer.addTransceiver("video", { direction: "recvonly" });
      peer.addTransceiver("audio", { direction: "recvonly" });
      attachPeerEvents(peer);
      peer.ontrack = (event) => {
        const stream = event.streams[0] ?? remoteStreamRef.current ?? new MediaStream();
        if (!event.streams[0] && !stream.getTracks().some((track) => track.id === event.track.id)) {
          stream.addTrack(event.track);
        }
        remoteStreamRef.current = stream;
        setRemoteStream(stream);
      };
      peerRef.current = peer;
      setRoomCode(offer.roomCode);
      setStatus("preparing");
      const answer = await acceptOfflineOfferAndCreateAnswer(peer, offer);
      setAnswerText(encodeOfflineSignal(answer));
      setStatus("waiting");
    } catch (cause) {
      peerRef.current?.close();
      peerRef.current = null;
      setStatus("failed");
      setError(readableMediaError(cause));
    }
  };

  const handleCopy = async (text: string, label: string) => {
    const copied = await copyText(text);
    setClipboardNotice(copied ? `${label} copied` : `Select and copy the ${label.toLowerCase()} manually`);
    window.setTimeout(() => setClipboardNotice(null), 2500);
  };

  const pasteFromClipboard = async (setter: (text: string) => void, label: string) => {
    const value = await readClipboard();
    if (value) {
      setter(value);
      setClipboardNotice(`${label} pasted`);
    } else {
      setClipboardNotice("Clipboard permission is unavailable — paste into the field manually");
    }
    window.setTimeout(() => setClipboardNotice(null), 3000);
  };

  const changeRole = (nextRole: RoomRole) => {
    if (nextRole === role) return;
    stopSession(true);
    setRole(nextRole);
    setRoomCode(createOfflineRoomCode());
  };

  const reset = () => {
    stopSession(true);
    setRoomCode(createOfflineRoomCode());
  };

  const isSecureEnough = typeof window !== "undefined" && (window.isSecureContext || ["localhost", "127.0.0.1"].includes(window.location.hostname));

  return (
    <div className="relative min-h-svh overflow-hidden bg-background">
      <div className="grain-fixed" />
      <header className="relative z-10 border-b border-white/8 bg-background/70 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5" aria-label="I'm Live home">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-signature shadow-glow"><Radio className="h-4 w-4 text-white" /></span>
            <span className="font-display text-[17px] font-bold tracking-tight">I&rsquo;m Live</span>
          </Link>
          <Link to="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Back to app</Link>
        </div>
      </header>

      <main className="container relative z-10 max-w-5xl py-12 sm:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="overline mb-4 flex items-center justify-center gap-2"><WifiOff className="h-3.5 w-3.5" /> Fully offline room</p>
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-6xl">A local stage, <span className="text-gradient">no cloud.</span></h1>
          <p className="mx-auto mt-5 max-w-2xl text-muted-foreground">
            Exchange one WebRTC bundle by copy and paste, then stream directly between browsers on the same reachable LAN. No Worker, API, STUN, TURN, CDN, or internet media traffic is used after this page is loaded.
          </p>
        </div>

        {!isSecureEnough && (
          <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100" role="alert">
            Camera access and WebRTC may be blocked because this page is not in a secure browser context. Open the cached app over HTTPS or localhost; do not use a plain HTTP address on another device.
          </div>
        )}

        <div className="mx-auto mt-10 grid max-w-3xl gap-3 rounded-2xl border border-white/10 bg-card/60 p-2 sm:grid-cols-2" role="tablist" aria-label="Offline room role">
          <button type="button" role="tab" aria-selected={role === "broadcaster"} onClick={() => changeRole("broadcaster")} className={`rounded-xl px-4 py-3 text-left transition-colors ${role === "broadcaster" ? "bg-signature text-white shadow-glow" : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"}`}>
            <span className="flex items-center gap-2 font-medium"><Video className="h-4 w-4" /> Broadcaster</span>
            <span className="mt-1 block text-xs opacity-80">Share camera and microphone from this device</span>
          </button>
          <button type="button" role="tab" aria-selected={role === "viewer"} onClick={() => changeRole("viewer")} className={`rounded-xl px-4 py-3 text-left transition-colors ${role === "viewer" ? "bg-signature text-white shadow-glow" : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"}`}>
            <span className="flex items-center gap-2 font-medium"><Globe2 className="h-4 w-4" /> Viewer</span>
            <span className="mt-1 block text-xs opacity-80">Receive the local stream without an account</span>
          </button>
        </div>

        <div className="mx-auto mt-6 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
          <span className="flex min-w-0 items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${status === "connected" ? "bg-emerald-400" : status === "failed" ? "bg-red-400" : "bg-amber-300"}`} aria-hidden="true" /><span role="status" aria-live="polite">{statusLabel(status)}</span></span>
          <span className="flex items-center gap-3">
            <span className={isOnline ? "text-emerald-300" : "text-amber-200"}>{isOnline ? "Internet available — not used" : "Browser is offline"}</span>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Room {roomCode || "—"}</span>
          </span>
        </div>

        {error && (
          <div className="mx-auto mt-4 flex max-w-3xl items-start gap-3 rounded-xl border border-red-300/25 bg-red-300/10 p-4 text-sm text-red-100" role="alert">
            <X className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} className="rounded p-1 text-red-100/70 hover:bg-white/10 hover:text-white" aria-label="Dismiss error"><X className="h-4 w-4" /></button>
          </div>
        )}
        {clipboardNotice && <p className="mx-auto mt-3 max-w-3xl text-center text-xs text-emerald-300" role="status">{clipboardNotice}</p>}

        <div className="mx-auto mt-8 grid max-w-5xl gap-5 lg:grid-cols-2">
          {role === "broadcaster" ? (
            <>
              <section className="rounded-3xl border border-white/10 bg-card/70 p-5 shadow-card sm:p-7" aria-labelledby="broadcast-step-1">
                <p className="overline mb-3">Step 01</p>
                <h2 id="broadcast-step-1" className="font-display text-2xl font-bold">Create the local offer</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Keep the room code private enough for your group. It is a human check, not encryption.</p>
                <label htmlFor="offline-room-code" className="mt-5 block text-sm font-medium">Room code</label>
                <div className="mt-2 flex gap-2">
                  <Input id="offline-room-code" value={roomCode} onChange={(event) => setRoomCode(normalizeOfflineRoomCode(event.target.value))} disabled={status !== "idle"} maxLength={12} className="font-mono tracking-[0.2em]" />
                  <Button type="button" variant="outline" size="icon" onClick={() => setRoomCode(createOfflineRoomCode())} disabled={status !== "idle"} aria-label="Generate a new room code"><RefreshCw /></Button>
                </div>
                <Button type="button" variant="glow" className="mt-5 w-full" onClick={() => void startBroadcaster()} disabled={status === "preparing" || status === "waiting" || status === "connecting" || status === "connected"}>
                  <Video /> Start camera and make offer
                </Button>
                {offerText && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between gap-3"><label htmlFor="offline-offer" className="text-sm font-medium">Offer bundle</label><Button type="button" variant="ghost" size="sm" onClick={() => void handleCopy(offerText, "Offer bundle")}><Copy /> Copy</Button></div>
                    <Textarea id="offline-offer" value={offerText} readOnly rows={8} className="mt-2 resize-y font-mono text-[10px] leading-relaxed" aria-describedby="offline-offer-help" />
                    <p id="offline-offer-help" className="mt-2 text-xs text-muted-foreground">Send this complete text to the viewer. It contains local ICE candidates but no account token.</p>
                  </div>
                )}
              </section>
              <section className="rounded-3xl border border-white/10 bg-card/70 p-5 shadow-card sm:p-7" aria-labelledby="broadcast-step-2">
                <p className="overline mb-3">Step 02</p>
                <h2 id="broadcast-step-2" className="font-display text-2xl font-bold">Apply the viewer answer</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">The viewer pastes your offer, creates an answer, and sends it back here.</p>
                <div className="mt-5 flex items-center justify-between gap-3"><label htmlFor="offline-host-answer" className="text-sm font-medium">Answer bundle</label><Button type="button" variant="ghost" size="sm" onClick={() => void pasteFromClipboard(setHostAnswerText, "Answer bundle")}><Clipboard /> Paste</Button></div>
                <Textarea id="offline-host-answer" value={hostAnswerText} onChange={(event) => setHostAnswerText(event.target.value)} placeholder="Paste the viewer answer here" rows={8} className="mt-2 resize-y font-mono text-[10px] leading-relaxed" />
                <div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => void applyBroadcasterAnswer()} disabled={!hostAnswerText || !peerRef.current}><Link2 /> Apply answer</Button><Button type="button" variant="ghost" onClick={reset}><RefreshCw /> New room</Button></div>
              </section>
            </>
          ) : (
            <>
              <section className="rounded-3xl border border-white/10 bg-card/70 p-5 shadow-card sm:p-7" aria-labelledby="viewer-step-1">
                <p className="overline mb-3">Step 01</p>
                <h2 id="viewer-step-1" className="font-display text-2xl font-bold">Paste the broadcaster offer</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Ask the broadcaster for the complete offer bundle. It is local signalling data, not a public link.</p>
                <div className="mt-5 flex items-center justify-between gap-3"><label htmlFor="offline-viewer-offer" className="text-sm font-medium">Offer bundle</label><Button type="button" variant="ghost" size="sm" onClick={() => void pasteFromClipboard(setViewerOfferText, "Offer bundle")}><Clipboard /> Paste</Button></div>
                <Textarea id="offline-viewer-offer" value={viewerOfferText} onChange={(event) => setViewerOfferText(event.target.value)} placeholder="Paste the broadcaster offer here" rows={9} className="mt-2 resize-y font-mono text-[10px] leading-relaxed" />
                <Button type="button" variant="glow" className="mt-4 w-full" onClick={() => void startViewer()} disabled={!viewerOfferText || status === "preparing" || status === "waiting" || status === "connecting" || status === "connected"}><Link2 /> Make viewer answer</Button>
              </section>
              <section className="rounded-3xl border border-white/10 bg-card/70 p-5 shadow-card sm:p-7" aria-labelledby="viewer-step-2">
                <p className="overline mb-3">Step 02</p>
                <h2 id="viewer-step-2" className="font-display text-2xl font-bold">Send the answer back</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Copy this answer to the broadcaster. Playback begins after they apply it.</p>
                {answerText ? (
                  <>
                    <div className="mt-5 flex items-center justify-between gap-3"><label htmlFor="offline-viewer-answer" className="text-sm font-medium">Answer bundle</label><Button type="button" variant="ghost" size="sm" onClick={() => void handleCopy(answerText, "Answer bundle")}><Copy /> Copy</Button></div>
                    <Textarea id="offline-viewer-answer" value={answerText} readOnly rows={9} className="mt-2 resize-y font-mono text-[10px] leading-relaxed" />
                  </>
                ) : <div className="mt-5 rounded-xl border border-dashed border-white/15 p-5 text-sm text-muted-foreground">Your answer appears here after the offer is accepted.</div>}
                <Button type="button" variant="ghost" className="mt-4" onClick={reset}><RefreshCw /> New room</Button>
              </section>
            </>
          )}
        </div>

        {(localStream || remoteStream) && (
          <section className="mx-auto mt-6 max-w-5xl rounded-3xl border border-white/10 bg-card/70 p-5 shadow-card sm:p-7" aria-labelledby="offline-preview-title">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="overline mb-2">Local media</p><h2 id="offline-preview-title" className="font-display text-2xl font-bold">Direct preview</h2></div><span className="flex items-center gap-2 text-xs text-emerald-300"><ShieldOff className="h-4 w-4" /> No cloud media path</span></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {localStream && <div><p className="mb-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">Broadcaster preview</p><video ref={localVideoRef} autoPlay muted playsInline className="aspect-video w-full rounded-2xl bg-black object-cover" /></div>}
              {remoteStream && <div><p className="mb-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">Viewer playback</p><video ref={remoteVideoRef} autoPlay playsInline controls className="aspect-video w-full rounded-2xl bg-black object-cover" /></div>}
            </div>
          </section>
        )}

        <section className="mx-auto mt-6 max-w-5xl rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-muted-foreground sm:p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-foreground"><ShieldOff className="h-4 w-4 text-emerald-300" /> What fully offline means</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 sm:gap-x-8"><li>• Media uses browser WebRTC host candidates only.</li><li>• Signalling is manual copy and paste, not the Worker.</li><li>• Both devices must be on the same reachable subnet.</li><li>• Chat, discovery, cloud recording, and global links are unavailable.</li></ul>
        </section>

        <div className="mx-auto mt-8 flex max-w-5xl flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-2"><WifiOff className="h-3.5 w-3.5" /> Keep this app cached before disconnecting the internet.</span><Link to="/help" className="flex items-center gap-1 text-foreground hover:text-[hsl(var(--accent-hi))]">Troubleshooting <Link2 className="h-3 w-3" /></Link></div>
      </main>
    </div>
  );
}
