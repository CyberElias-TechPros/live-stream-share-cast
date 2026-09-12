import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, LogOut, Mic, MicOff, PhoneOff, QrCode, Users, Video, VideoOff, Wifi } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { api, absoluteUrl, ApiError, joinCall } from "@/lib/api";
import { RoomSocket } from "@/lib/roomSocket";
import { CallEngine } from "@/lib/callEngine";
import { useAuth } from "@/contexts/AuthContext";
import { useConfig, useIsLan } from "@/contexts/ConfigContext";
import { useSEO } from "@/hooks/useSEO";
import { MessageList } from "@/components/MessageList";
import { ErrorState, PageLoader } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { CallPeer, ChatMessage, Stream } from "@/types";

/**
 * CallRoom — mesh video-call UI for streams with kind = "call".
 *
 * Phases: prejoin (green room: preview + device toggles + LAN invite) →
 * in-call (participant tiles + controls + chat) → ended/left/error.
 * The owner joins with the host role (and can end the call for everyone);
 * everyone else joins as a caller with a participant ticket.
 */
export function CallRoom({ streamId, initialStream }: { streamId: string; initialStream: Stream }) {
  const { user, isLoading: authLoading } = useAuth();
  const config = useConfig();
  const isLan = useIsLan();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [stream, setStream] = useState(initialStream);
  const [phase, setPhase] = useState<"prejoin" | "connecting" | "incall" | "left" | "ended" | "error">("prejoin");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  // Local media (green room + call)
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);

  // Live call state
  const roomRef = useRef<RoomSocket | null>(null);
  const engineRef = useRef<CallEngine | null>(null);
  const [selfId, setSelfId] = useState<string>("host");
  const [isOwnerInCall, setIsOwnerInCall] = useState(false);
  const [participants, setParticipants] = useState<Map<string, CallPeer>>(new Map());
  const [peerStreams, setPeerStreams] = useState<Map<string, MediaStream>>(new Map());
  const [peerStates, setPeerStates] = useState<Map<string, RTCPeerConnectionState>>(new Map());
  const [participantCount, setParticipantCount] = useState(1);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [endConfirm, setEndConfirm] = useState(false);

  const isOwner = user?.username === stream.host.username;
  const joinUrl = absoluteUrl(`/watch/${stream.id}`);

  useSEO({
    title: `${stream.title} — video call on I'm Live`,
    description: stream.description?.slice(0, 150) || `Join ${stream.title}, a live video call on I'm Live.`,
    robots: "noindex",
  });

  // Chat history seed.
  const { data: chatHistory } = useQuery({
    queryKey: ["chat", streamId],
    queryFn: () => api.get<{ messages: ChatMessage[] }>(`/api/streams/${streamId}/chat?limit=50`),
    select: (d) => d.messages,
  });
  useEffect(() => {
    if (chatHistory) setMessages((prev) => (prev.length === 0 ? chatHistory : prev));
  }, [chatHistory]);

  // ---- green room preview ----------------------------------------------------
  const refreshPreview = useCallback(
    async (camera: boolean, mic: boolean): Promise<MediaStream | null> => {
      mediaStream?.getTracks().forEach((t) => t.stop());
      if (!camera && !mic) {
        setMediaStream(null);
        return null;
      }
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: camera ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
          audio: mic ? { echoCancellation: true, noiseSuppression: true } : false,
        });
        setMediaStream(media);
        return media;
      } catch {
        toast.error("Camera/microphone unavailable. Check browser permissions.");
        setCameraOn(false);
        setMicOn(false);
        setMediaStream(null);
        return null;
      }
    },
    [mediaStream]
  );

  useEffect(() => {
    if (phase !== "prejoin" || authLoading || !user) return;
    void refreshPreview(cameraOn, micOn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, cameraOn, micOn, authLoading, user?.id]);

  useEffect(() => {
    if (previewRef.current && mediaStream) {
      previewRef.current.srcObject = mediaStream;
    }
  }, [mediaStream, phase]);

  const toggleMic = () => {
    const next = !micOn;
    mediaStream?.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  };
  const toggleCamera = () => {
    const next = !cameraOn;
    mediaStream?.getVideoTracks().forEach((t) => (t.enabled = next));
    setCameraOn(next);
  };

  // ---- teardown ----------------------------------------------------------------
  const teardown = useCallback(() => {
    engineRef.current?.close();
    engineRef.current = null;
    roomRef.current?.close();
    roomRef.current = null;
    setParticipants(new Map());
    setPeerStreams(new Map());
    setPeerStates(new Map());
  }, []);

  useEffect(() => () => {
    engineRef.current?.close();
    roomRef.current?.close();
    mediaStream?.getTracks().forEach((t) => t.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- join ----------------------------------------------------------------------
  const enterCall = useCallback(
    (ticket: string, owner: boolean) => {
      setPhase("connecting");
      const room = new RoomSocket(streamId, {
        onWelcome: (welcome) => {
          setSelfId(welcome.role === "host" ? "host" : (welcome.viewerId ?? ""));
          setIsOwnerInCall(welcome.role === "host");
          setParticipantCount(welcome.viewerCount ?? 1);
          const peers = welcome.peers ?? [];
          setParticipants(new Map(peers.map((p) => [p.id, p])));

          const engine = new CallEngine(room, config?.iceServers ?? [], mediaStream, {
            onPeerStream: (peerId, media) => setPeerStreams((prev) => new Map(prev).set(peerId, media)),
            onPeerState: (peerId, state) => setPeerStates((prev) => new Map(prev).set(peerId, state)),
            onPeerRetracted: (peerId) =>
              setPeerStreams((prev) => {
                const next = new Map(prev);
                next.delete(peerId);
                return next;
              }),
          });
          engineRef.current = engine;
          void engine.connectToPeers(peers);
          setPhase("incall");
        },
        onPeerJoined: (peer) => {
          setParticipants((prev) => new Map(prev).set(peer.id, peer));
          engineRef.current?.addPeer(peer);
        },
        onPeerLeft: (peerId) => {
          setParticipants((prev) => {
            const next = new Map(prev);
            next.delete(peerId);
            return next;
          });
          engineRef.current?.removePeer(peerId);
        },
        onSignal: (from, payload) => {
          void engineRef.current?.handleSignal(from, payload);
        },
        onPresence: (count) => setParticipantCount(count),
        onChat: (msg) => setMessages((prev) => [...prev.slice(-200), msg]),
        onStreamEnded: () => {
          teardown();
          setPhase("ended");
        },
        onRejected: (_code, message) => {
          teardown();
          setErrorText(message);
          setPhase("error");
        },
        onDisconnected: () => setErrorText("Connection to the call dropped — retrying…"),
        onReconnected: () => setErrorText(null),
      });
      roomRef.current = room;
      room.connect({ type: "join", role: owner ? "host" : "caller", token: ticket });
    },
    [streamId, config, mediaStream, teardown]
  );

  const handleOwnerStart = async () => {
    setJoining(true);
    try {
      const start = await api.post<{ stream: Stream; ticket: string }>(`/api/streams/${streamId}/start`);
      setStream(start.stream);
      void queryClient.invalidateQueries({ queryKey: ["stream", streamId] });
      enterCall(start.ticket, true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start the call. Try again.");
      setPhase("prejoin");
    } finally {
      setJoining(false);
    }
  };

  const handleGuestJoin = async () => {
    setJoining(true);
    try {
      const { ticket } = await joinCall(streamId);
      enterCall(ticket, false);
    } catch (err) {
      if (err instanceof ApiError && err.code === "not_live") {
        toast.info("This call hasn't started yet.");
        setPhase("prejoin");
      } else {
        toast.error(err instanceof ApiError ? err.message : "Couldn't join the call. Try again.");
        setPhase("error");
        setErrorText(err instanceof ApiError ? err.message : "Couldn't join the call.");
      }
    } finally {
      setJoining(false);
    }
  };

  const leaveCall = () => {
    teardown();
    setPhase("left");
  };

  const endCallForEveryone = async () => {
    setEndConfirm(false);
    try {
      await api.post(`/api/streams/${streamId}/stop`);
    } catch {
      /* the room closes regardless */
    }
    teardown();
    setStream((s) => ({ ...s, isLive: false }));
    setPhase("ended");
    void queryClient.invalidateQueries({ queryKey: ["stream", streamId] });
  };

  const sendChat = async () => {
    const text = chatDraft.trim();
    if (!text) return;
    setChatDraft("");
    try {
      await api.post(`/api/streams/${streamId}/chat`, { text });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Message failed to send.");
    }
  };

  const toggleInCallMic = () => {
    const next = !micOn;
    engineRef.current?.setTrackEnabled("audio", next);
    mediaStream?.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  };
  const toggleInCallCamera = () => {
    const next = !cameraOn;
    engineRef.current?.setTrackEnabled("video", next);
    mediaStream?.getVideoTracks().forEach((t) => (t.enabled = next));
    setCameraOn(next);
  };

  // ---- render --------------------------------------------------------------------
  const tiles = useMemo(() => {
    const list: { id: string; username: string; isHost: boolean; stream: MediaStream | null; state?: RTCPeerConnectionState }[] = [];
    if (phase === "incall") {
      list.push({ id: selfId, username: user?.displayName ?? "You", isHost: isOwnerInCall, stream: mediaStream });
    }
    for (const [id, peer] of participants) {
      list.push({ id, username: peer.username, isHost: peer.isHost, stream: peerStreams.get(id) ?? null, state: peerStates.get(id) });
    }
    return list;
  }, [phase, selfId, user, isOwnerInCall, mediaStream, participants, peerStreams, peerStates]);

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6">
      {/* header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-bold text-white sm:text-2xl">{stream.title}</h1>
            {stream.isLive ? (
              <Badge className="live-gradient border-0 text-white">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true" />
                Call live
              </Badge>
            ) : (
              <Badge variant="outline" className="text-text-faint">Offline</Badge>
            )}
            {isLan && (
              <Badge variant="outline" className="gap-1 text-text-faint">
                <Wifi className="h-3 w-3" aria-hidden="true" /> LAN
              </Badge>
            )}
          </div>
          <p className="micro mt-1">Video call · up to 8 participants · peer-to-peer</p>
        </div>
        {phase === "incall" && (
          <div className="flex items-center gap-2 text-sm text-text-secondary" aria-live="polite">
            <Users className="h-4 w-4" aria-hidden="true" />
            {participantCount} in call
          </div>
        )}
      </div>

      {errorText && phase !== "error" && (
        <div className="mb-4 rounded-lg border border-line bg-panel px-4 py-2 text-sm text-amber-300" role="status">
          {errorText}
        </div>
      )}

      {phase === "prejoin" && (
        <PrejoinPanel
          stream={stream}
          isOwner={isOwner}
          user={user}
          authLoading={authLoading}
          joining={joining}
          cameraOn={cameraOn}
          micOn={micOn}
          previewRef={previewRef}
          hasPreview={!!mediaStream}
          joinUrl={joinUrl}
          isLan={isLan}
          onStart={handleOwnerStart}
          onJoin={handleGuestJoin}
          onToggleCamera={toggleCamera}
          onToggleMic={toggleMic}
        />
      )}

      {phase === "connecting" && <PageLoader label="Connecting to the call…" />}

      {(phase === "incall" || phase === "left") && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          {/* tiles */}
          <div>
            <div
              className={cn(
                "grid gap-3",
                tiles.length <= 1 ? "grid-cols-1" : tiles.length <= 4 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
              )}
            >
              {tiles.map((tile) => (
                <CallTile key={tile.id} tile={tile} muted={tile.id === selfId} left={phase === "left"} />
              ))}
            </div>

            {phase === "incall" && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-line bg-panel p-3">
                <Button variant={micOn ? "outline" : "danger"} size="lg" onClick={toggleInCallMic} aria-pressed={!micOn} aria-label={micOn ? "Mute microphone" : "Unmute microphone"}>
                  {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                  <span className="ml-2">{micOn ? "Mute" : "Unmute"}</span>
                </Button>
                <Button variant={cameraOn ? "outline" : "danger"} size="lg" onClick={toggleInCallCamera} aria-pressed={!cameraOn} aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}>
                  {cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                  <span className="ml-2">{cameraOn ? "Stop video" : "Start video"}</span>
                </Button>
                <Button variant="outline" size="lg" onClick={() => void navigator.clipboard.writeText(joinUrl).then(() => toast.success("Invite link copied"))} aria-label="Copy invite link">
                  <Copy className="h-5 w-5" />
                  <span className="ml-2">Invite</span>
                </Button>
                {isOwnerInCall ? (
                  <Button variant="live" size="lg" onClick={() => setEndConfirm(true)} aria-label="End the call for everyone">
                    <PhoneOff className="h-5 w-5" />
                    <span className="ml-2">End call</span>
                  </Button>
                ) : (
                  <Button variant="live" size="lg" onClick={leaveCall} aria-label="Leave the call">
                    <LogOut className="h-5 w-5" />
                    <span className="ml-2">Leave</span>
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* chat */}
          <aside className="flex h-[28rem] flex-col rounded-xl border border-line bg-panel lg:h-[34rem]" aria-label="Call chat">
            <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-white">Call chat</div>
            <div className="min-h-0 flex-1 overflow-hidden"><MessageList messages={messages} hostName={stream.host.displayName} /></div>
            <form
              className="flex gap-2 border-t border-line p-2"
              onSubmit={(e) => {
                e.preventDefault();
                void sendChat();
              }}
            >
              <input
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                placeholder="Say something…"
                maxLength={500}
                className="min-w-0 flex-1 rounded-md border border-line bg-black/30 px-3 py-2 text-sm text-white placeholder:text-text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                aria-label="Chat message"
              />
              <Button type="submit" variant="accent" disabled={!chatDraft.trim()}>
                Send
              </Button>
            </form>
          </aside>
        </div>
      )}

      {phase === "left" && (
        <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={() => navigate("/browse")}>
            Back to Browse
          </Button>
        </div>
      )}

      {phase === "ended" && (
        <div className="rounded-xl border border-line bg-panel p-10 text-center">
          <PhoneOff className="mx-auto mb-3 h-10 w-10 text-text-faint" aria-hidden="true" />
          <h2 className="font-display text-xl font-bold text-white">Call ended</h2>
          <p className="mt-1 text-sm text-text-secondary">{isOwner ? "You ended the call for everyone." : "The host ended the call."}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="outline" onClick={() => navigate("/browse")}>
              Browse
            </Button>
            <Button variant="outline" onClick={() => navigate(`/profile/${stream.host.username}`)}>
              Host profile
            </Button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <ErrorState
          title="Couldn't join the call"
          message={errorText ?? "Something went wrong."}
          action={
            <Button variant="outline" onClick={() => { setErrorText(null); setPhase("prejoin"); }}>
              Back
            </Button>
          }
        />
      )}

      {/* owner: end-for-everyone confirmation */}
      <Dialog open={endConfirm} onOpenChange={setEndConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End the call for everyone?</DialogTitle>
            <DialogDescription>
              This ends the call for all {participantCount} participants and archives it on your dashboard. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEndConfirm(false)}>
              Cancel
            </Button>
            <Button variant="live" onClick={() => void endCallForEveryone()}>
              End for everyone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CallTile({
  tile,
  muted,
  left,
}: {
  tile: { id: string; username: string; isHost: boolean; stream: MediaStream | null; state?: RTCPeerConnectionState };
  muted: boolean;
  left: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const connecting = !tile.stream || tile.state === "connecting" || tile.state === "new";

  useEffect(() => {
    if (videoRef.current && tile.stream) {
      videoRef.current.srcObject = tile.stream;
      videoRef.current.play().catch(() => {
        /* autoplay policy — user gesture already happened on join */
      });
    }
  }, [tile.stream]);

  return (
    <div className="scanlines relative aspect-video overflow-hidden rounded-xl border border-line bg-black/60">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={cn("h-full w-full object-cover", (!tile.stream || left) && "hidden")}
        aria-label={`${tile.username}'s video`}
      />
      {(!tile.stream || left) && (
        <div className="absolute inset-0 grid-bg flex items-center justify-center">
          <span className="font-display text-4xl font-bold text-white/20" aria-hidden="true">
            {tile.username.slice(0, 1).toUpperCase()}
          </span>
        </div>
      )}
      {connecting && !left && (
        <div className="absolute bottom-11 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
          connecting…
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
        <span className="rounded-md bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">{tile.username}</span>
        {tile.isHost && (
          <span className="rounded-md live-gradient px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Host</span>
        )}
      </div>
    </div>
  );
}

function PrejoinPanel({
  stream,
  isOwner,
  user,
  authLoading,
  joining,
  cameraOn,
  micOn,
  previewRef,
  hasPreview,
  joinUrl,
  isLan,
  onStart,
  onJoin,
  onToggleCamera,
  onToggleMic,
}: {
  stream: Stream;
  isOwner: boolean;
  user: { displayName: string } | null;
  authLoading: boolean;
  joining: boolean;
  cameraOn: boolean;
  micOn: boolean;
  previewRef: React.RefObject<HTMLVideoElement>;
  hasPreview: boolean;
  joinUrl: string;
  isLan: boolean;
  onStart: () => void;
  onJoin: () => void;
  onToggleCamera: () => void;
  onToggleMic: () => void;
}) {
  if (authLoading) return <PageLoader label="Checking your session…" />;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="scanlines relative aspect-video overflow-hidden rounded-xl border border-line bg-black/60">
        <video ref={previewRef} autoPlay playsInline muted className={cn("h-full w-full scale-x-[-1] object-cover", !hasPreview && "hidden")} aria-label="Your camera preview" />
        {!hasPreview && (
          <div className="absolute inset-0 grid-bg flex flex-col items-center justify-center gap-2">
            <VideoOff className="h-8 w-8 text-text-faint" aria-hidden="true" />
            <p className="text-sm text-text-faint">{cameraOn || micOn ? "Starting devices…" : "Camera and microphone are off"}</p>
          </div>
        )}
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
          <Button variant={micOn ? "outline" : "danger"} size="icon" onClick={onToggleMic} aria-label={micOn ? "Mute microphone" : "Unmute microphone"} aria-pressed={!micOn}>
            {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </Button>
          <Button variant={cameraOn ? "outline" : "danger"} size="icon" onClick={onToggleCamera} aria-label={cameraOn ? "Turn camera off" : "Turn camera on"} aria-pressed={!cameraOn}>
            {cameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-line bg-panel p-4">
          <h2 className="font-display text-lg font-bold text-white">
            {isOwner ? (stream.isLive ? "Rejoin your call" : "Start your call") : stream.isLive ? "Join the call" : "Waiting for the host"}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {isOwner
              ? stream.isLive
                ? "The call is live — rejoining connects you to everyone waiting."
                : "Starting the call opens it for everyone who has the link. It ends when you end it."
              : stream.isLive
                ? "Join with your camera and microphone — everyone in the call sees and hears you."
                : "The host hasn't started this call yet. Keep this page open — you'll be able to join once it's live."}
          </p>

          {!user ? (
            <div className="mt-4 rounded-lg border border-line bg-black/30 p-3 text-sm text-text-secondary">
              You need an account to join calls.
              <div className="mt-2 flex gap-2">
                <Button asChild size="sm" variant="accent">
                  <Link to={`/login?from=${encodeURIComponent(`/watch/${stream.id}`)}`}>Sign in</Link>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link to={`/signup?from=${encodeURIComponent(`/watch/${stream.id}`)}`}>Create account</Link>
                </Button>
              </div>
            </div>
          ) : (
            <Button
              className="mt-4 w-full"
              size="lg"
              variant="live"
              disabled={joining || (!stream.isLive && !isOwner)}
              onClick={isOwner ? onStart : onJoin}
            >
              {joining ? "Connecting…" : isOwner ? (stream.isLive ? "Rejoin call" : "Start call") : "Join call"}
            </Button>
          )}
          {!isOwner && user && !stream.isLive && (
            <Button className="mt-2 w-full" variant="ghost" onClick={() => void navigator.clipboard.writeText(joinUrl).then(() => toast.success("Invite link copied"))}>
              <Copy className="mr-2 h-4 w-4" /> Copy invite link
            </Button>
          )}
        </div>

        {/* LAN invite panel */}
        {isLan && (
          <div className="rounded-xl border border-line bg-panel p-4">
            <div className="flex items-center gap-2">
              <Wifi className="h-4 w-4 text-accent" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-white">On the same Wi-Fi?</h3>
            </div>
            <p className="mt-1 text-xs text-text-secondary">
              People on this local network can join without internet — they just open this address:
            </p>
            <div className="mt-2 flex justify-center rounded-lg bg-white p-2">
              <QRCodeSVG value={joinUrl} size={132} role="img" aria-label={`QR code for ${joinUrl}`} />
            </div>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(joinUrl).then(() => toast.success("Address copied"))}
              className="mt-2 w-full truncate rounded-md border border-line bg-black/30 px-2 py-1.5 text-xs text-text-secondary hover:text-white"
              aria-label={`Copy address ${joinUrl}`}
            >
              <QrCode className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
              {joinUrl}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
