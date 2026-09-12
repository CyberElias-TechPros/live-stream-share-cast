import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Eye,
  Maximize,
  MessageSquare,
  Radio,
  Send,
  UserCheck,
  UserPlus,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StreamCard } from "@/components/StreamCard";
import { MessageList } from "@/components/MessageList";
import { EmptyState, PageLoader } from "@/components/States";
import { useAuth } from "@/contexts/AuthContext";
import { useSEO } from "@/hooks/useSEO";
import { useElapsedSeconds, initialsOf } from "@/hooks/useElapsedSeconds";
import { api, ApiError } from "@/lib/api";
import { RoomSocket } from "@/lib/roomSocket";
import { ViewerEngine, readViewerStats, type ViewerState } from "@/lib/webrtc";
import { cn } from "@/lib/utils";
import type { AppConfig, ChatMessage, Stream } from "@/types";

export default function WatchStream() {
  const { streamId = "" } = useParams<{ streamId: string }>();
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const [viewerCount, setViewerCount] = useState(0);
  const [viewerState, setViewerState] = useState<ViewerState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [connectionSummary, setConnectionSummary] = useState<{ resolution: string; fps: number; rttMs: number | null } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<RoomSocket | null>(null);
  const engineRef = useRef<ViewerEngine | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const statsPrev = useRef<{ bytes: number; t: number }>({ bytes: 0, t: 0 });

  const { data: stream, isLoading, error } = useQuery({
    queryKey: ["stream", streamId],
    queryFn: () => api.get<{ stream: Stream }>(`/api/streams/${streamId}`),
    select: (d) => d.stream,
    refetchInterval: (query) => (query.state.data?.stream.isLive ? 30_000 : false),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<AppConfig>("/api/config"),
    staleTime: Infinity,
  });

  const { data: chatHistory } = useQuery({
    queryKey: ["chat", streamId],
    queryFn: () => api.get<{ messages: ChatMessage[] }>(`/api/streams/${streamId}/chat?limit=50`),
    select: (d) => d.messages,
    enabled: !!streamId,
  });

  // Seed chat from history once.
  useEffect(() => {
    if (chatHistory) {
      setMessages((prev) => (prev.length === 0 ? chatHistory : prev));
    }
  }, [chatHistory]);

  const ended = stream ? !stream.isLive : false;

  useSEO({
    title: stream ? `${stream.title} — live on I'm Live` : "Watch",
    description: stream?.description?.slice(0, 150) || `Watch ${stream?.title ?? "live streams"} on I'm Live.`,
    robots: "noindex", // transient live content — profile & browse carry SEO
    type: "video.other",
    jsonLd: stream
      ? [
          {
            "@context": "https://schema.org",
            "@type": "BroadcastEvent",
            name: stream.title,
            description: stream.description || undefined,
            isLiveBroadcast: stream.isLive,
            startDate: stream.startedAt ?? stream.createdAt,
            endDate: stream.endedAt ?? undefined,
            recordedAt: undefined,
            workPerformed: {
              "@type": "VideoObject",
              name: stream.title,
              description: stream.description || stream.title,
              uploadDate: stream.createdAt,
            },
          },
        ]
      : undefined,
  });

  // ---- Room + WebRTC lifecycle -------------------------------------------
  const attachViewerEngine = useCallback(
    (room: RoomSocket, iceServers: RTCIceServer[], hostPresent: boolean) => {
      const engine = new ViewerEngine(room, iceServers, {
        onState: (state) => setViewerState(state),
        onStream: (media) => {
          if (videoRef.current) {
            videoRef.current.srcObject = media;
            videoRef.current.play().catch(() => {
              /* autoplay blocked — the unmute/play overlay handles it */
            });
          }
        },
      });
      engineRef.current = engine;
      if (hostPresent) {
        void engine.subscribe();
      }
    },
    []
  );

  useEffect(() => {
    if (!streamId || !config) return;

    const room = new RoomSocket(streamId, {
      onWelcome: (welcome) => {
        setViewerCount(welcome.viewerCount ?? 0);
        if (welcome.role === "viewer") {
          attachViewerEngine(room, config.iceServers, !!welcome.hostPresent);
        }
      },
      onPresence: (count) => setViewerCount(count),
      onHostPresent: () => void engineRef.current?.subscribe(),
      onHostLeft: () => {
        engineRef.current?.stop();
        setViewerState("idle");
        if (videoRef.current) videoRef.current.srcObject = null;
      },
      onSignal: (from, payload) => {
        void engineRef.current?.handleHostSignal(payload);
        void from;
      },
      onChat: (msg) => setMessages((prev) => [...prev.slice(-200), msg]),
      onStreamEnded: () => {
        engineRef.current?.stop();
        setViewerState("ended");
        if (videoRef.current) videoRef.current.srcObject = null;
        void queryClient.invalidateQueries({ queryKey: ["stream", streamId] });
      },
      onRejected: (code, message) => {
        if (code === "not_found") setViewerState("ended");
        toast.error(message);
      },
      onDisconnected: () => setViewerState((s) => (s === "live" ? "reconnecting" : s)),
    });

    roomRef.current = room;
    room.connect({ type: "join", role: "viewer" });

    return () => {
      room.close();
      engineRef.current?.stop();
      roomRef.current = null;
      engineRef.current = null;
    };
  }, [streamId, config, attachViewerEngine, queryClient, isAuthenticated]);

  const sendChat = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = draft.trim();
      if (!text || sendingChat) return;
      if (!isAuthenticated) {
        toast("Sign in to join the conversation");
        return;
      }
      setSendingChat(true);
      try {
        await api.post(`/api/streams/${streamId}/chat`, { text: text.slice(0, 500) });
        setDraft("");
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 429) toast.warning(err.message);
          else toast.error(err.message);
        }
      } finally {
        setSendingChat(false);
      }
    },
    [draft, isAuthenticated, sendingChat, streamId]
  );

  // ---- Real stats polling ---------------------------------------------------
  useEffect(() => {
    if (viewerState !== "live") return;
    const timer = window.setInterval(async () => {
      const stats = await readViewerStats(pcRef.current ?? null);
      if (!stats) return;
      const now = performance.now();
      const kbps = statsPrev.current.t
        ? Math.max(0, ((stats.bytesReceived - statsPrev.current.bytes) * 8) / ((now - statsPrev.current.t) / 1000) / 1000)
        : 0;
      statsPrev.current = { bytes: stats.bytesReceived, t: now };
      setConnectionSummary({ resolution: stats.resolution, fps: stats.fps, rttMs: stats.rttMs });
      void kbps;
    }, 3000);
    return () => clearInterval(timer);
  }, [viewerState]);

  // Keep pcRef pointing at the active peer connection for stats.
  useEffect(() => {
    const t = window.setInterval(() => {
      pcRef.current = engineRef.current?.peerConnection ?? null;
    }, 2000);
    return () => clearInterval(t);
  }, []);

  // ---- Follow ---------------------------------------------------------------
  const { data: profile, refetch: refetchProfile } = useQuery({
    queryKey: ["profile", stream?.host.username],
    queryFn: () => api.get<{ profile: import("@/types").Profile }>(`/api/users/${stream!.host.username}`),
    select: (d) => d.profile,
    enabled: !!stream,
  });

  const [followBusy, setFollowBusy] = useState(false);
  const toggleFollow = async () => {
    if (!isAuthenticated) {
      toast("Sign in to follow streamers");
      return;
    }
    if (!profile || profile.isSelf || followBusy) return;
    setFollowBusy(true);
    try {
      const res = profile.isFollowing
        ? await api.delete<{ following: boolean }>(`/api/users/${profile.username}/follow`)
        : await api.post<{ following: boolean }>(`/api/users/${profile.username}/follow`);
      toast.success(res.following ? `Following ${profile.displayName}` : `Unfollowed ${profile.displayName}`);
      void refetchProfile();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) toast.error("Session expired — sign in again.");
      else toast.error("Couldn't update follow. Try again.");
    } finally {
      setFollowBusy(false);
    }
  };

  const elapsed = useElapsedSeconds(stream?.isLive ? stream.startedAt : null);

  const related = useQuery({
    queryKey: ["streams", "related", stream?.id],
    queryFn: () => api.get<{ streams: Stream[] }>("/api/streams", { live: 1, limit: 4 }),
    select: (d) => d.streams.filter((s) => s.id !== stream?.id).slice(0, 4),
    enabled: ended && !!stream,
  });

  const stateOverlay = useMemo(() => {
    if (ended) return { icon: Radio, title: "This broadcast has ended", body: "Catch the next one — follow the streamer to know when they go live." };
    switch (viewerState) {
      case "idle":
        return { icon: null, title: "Connecting…", body: "Setting up your seat in the room." };
      case "connecting":
        return { icon: null, title: "Connecting to the host…", body: "Negotiating a direct peer connection." };
      case "reconnecting":
        return { icon: AlertTriangle, title: "Connection hiccup", body: "Trying to restore the stream…" };
      case "failed":
        return { icon: AlertTriangle, title: "Couldn't connect", body: "The peer connection failed. Retrying may help." };
      default:
        return null;
    }
  }, [ended, viewerState]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navigation />
        <PageLoader label="Tuning in" />
      </div>
    );
  }

  if (error || !stream) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navigation />
        <main className="container-app flex flex-1 items-center justify-center py-16">
          <EmptyState
            icon={<Radio className="h-6 w-6" aria-hidden="true" />}
            title="Stream not found"
            description="This stream doesn't exist, was deleted, or the link is wrong."
            action={
              <Button asChild variant="outline">
                <Link to="/browse">Browse live streams</Link>
              </Button>
            }
          />
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      <main className="container-app flex-1 py-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          {/* ===== Player column ===== */}
          <div>
            <div className="relative overflow-hidden rounded-xl border border-line bg-black shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]">
              <div className="scanlines relative aspect-video">
                <video
                  ref={videoRef}
                  className="h-full w-full bg-black"
                  playsInline
                  autoPlay
                  onClick={() => void videoRef.current?.play().catch(() => {})}
                  aria-label={stream.title}
                />

                {stateOverlay && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/90 p-6 text-center animate-fade-in">
                    {stateOverlay.icon && <stateOverlay.icon className="h-8 w-8 text-live" aria-hidden="true" />}
                    <h2 className="font-display text-xl font-semibold">{stateOverlay.title}</h2>
                    <p className="max-w-sm text-sm text-text-muted">{stateOverlay.body}</p>
                    {viewerState === "failed" && !ended && (
                      <Button variant="outline" size="sm" onClick={() => {
                        setViewerState("connecting");
                        void engineRef.current?.subscribe();
                      }}>
                        Retry connection
                      </Button>
                    )}
                    {ended && (
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/profile/${stream.host.username}`}>Visit channel</Link>
                      </Button>
                    )}
                  </div>
                )}

                {/* top overlay chrome */}
                <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
                  {stream.isLive ? (
                    <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-md live-gradient px-2 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-white shadow-lg shadow-live/40">
                      <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-soft" aria-hidden="true" />
                      Live
                    </span>
                  ) : (
                    <Badge>Offline</Badge>
                  )}
                </div>

                {/* bottom chrome */}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-3">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-black/50 px-2 py-1 text-xs text-white tnum backdrop-blur-sm">
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    {viewerCount} watching
                  </span>
                  <PlayerControls videoRef={videoRef} />
                </div>
              </div>
            </div>

            {/* meta */}
            <div className="mt-5">
              <h1 className="font-display text-2xl font-bold tracking-tight">{stream.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-text-muted">
                <span className="inline-flex items-center gap-2">
                  <Eye className="h-4 w-4 text-text-faint" aria-hidden="true" />
                  <span className="tnum">{viewerCount}</span> watching
                </span>
                {stream.isLive && (
                  <span className="inline-flex items-center gap-2">
                    <span className="live-dot" aria-hidden="true" />
                    uptime <span className="tnum">{formatUptime(elapsed)}</span>
                  </span>
                )}
                {connectionSummary?.resolution && (
                  <span className="micro">
                    {connectionSummary.resolution} · {connectionSummary.fps}fps
                    {connectionSummary.rttMs !== null && ` · ${connectionSummary.rttMs}ms rtt`}
                  </span>
                )}
              </div>

              <Separator className="my-5" />

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-11 w-11">
                    <AvatarFallback style={{ background: `${stream.host.avatarColor}22`, color: stream.host.avatarColor }}>
                      {initialsOf(stream.host.displayName || stream.host.username)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <Link
                      to={`/profile/${stream.host.username}`}
                      className="font-display font-semibold text-text hover:text-accent transition-colors"
                    >
                      {stream.host.displayName || stream.host.username}
                    </Link>
                    <p className="text-xs text-text-faint">
                      @{stream.host.username}
                      {profile && profile.broadcastCount > 0 && ` · ${profile.broadcastCount} broadcasts`}
                    </p>
                  </div>
                </div>

                {!profile?.isSelf && (
                  <Button
                    variant={profile?.isFollowing ? "outline" : "accent"}
                    size="sm"
                    onClick={() => void toggleFollow()}
                    disabled={followBusy}
                  >
                    {profile?.isFollowing ? (
                      <>
                        <UserCheck className="h-4 w-4" aria-hidden="true" /> Following
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" aria-hidden="true" /> Follow
                      </>
                    )}
                  </Button>
                )}
              </div>

              {stream.description && (
                <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-text-muted">
                  {stream.description}
                </p>
              )}

              {stream.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {stream.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="normal-case tracking-normal">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {ended && related.data && related.data.length > 0 && (
              <section className="mt-10" aria-label="Other live streams">
                <h2 className="micro mb-4">Live elsewhere</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {related.data.map((s) => (
                    <StreamCard key={s.id} stream={s} />
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ===== Chat column ===== */}
          <aside className="panel flex h-[560px] flex-col overflow-hidden lg:h-[calc(100vh-9rem)] lg:sticky lg:top-20" aria-label="Stream chat">
            <header className="flex items-center gap-2 border-b border-line px-4 py-3">
              <MessageSquare className="h-4 w-4 text-accent" aria-hidden="true" />
              <h2 className="font-display text-sm font-semibold">Chat</h2>
              <span className="micro ml-auto tnum">{viewerCount} here</span>
            </header>

            <MessageList messages={messages} hostName={stream.host.displayName} />

            <form onSubmit={sendChat} className="flex gap-2 border-t border-line p-3">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={isAuthenticated ? "Say something…" : "Sign in to chat"}
                maxLength={500}
                disabled={!isAuthenticated || sendingChat}
                aria-label="Chat message"
              />
              <Button type="submit" size="icon" variant="accent" disabled={!draft.trim() || !isAuthenticated || sendingChat}>
                <Send className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Send</span>
              </Button>
            </form>
            {!isAuthenticated && (
              <p className="border-t border-line bg-bg-raised/50 px-4 py-2.5 text-center text-xs text-text-muted">
                <Link to="/login" className="text-accent hover:underline">Sign in</Link> to join the conversation
              </p>
            )}
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function formatUptime(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(s).padStart(2, "0")}s`;
}

function PlayerControls({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement> }) {
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [showVolume, setShowVolume] = useState(false);

  // Browsers block unmuted autoplay: start muted, offer one-click unmute.
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.muted = true;
  }, [videoRef]);

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    v.volume = volume;
    setMuted(v.muted);
    if (!v.muted) void v.play().catch(() => {});
  };

  const changeVolume = (val: number) => {
    const v = videoRef.current;
    setVolume(val);
    if (v) {
      v.volume = val;
      v.muted = val === 0;
      setMuted(val === 0);
    }
  };

  const fullscreen = () => {
    const el = videoRef.current?.parentElement?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => {});
  };

  return (
    <div className="pointer-events-auto flex items-center gap-1.5">
      <div
        className="flex items-center gap-2"
        onMouseEnter={() => setShowVolume(true)}
        onMouseLeave={() => setShowVolume(false)}
      >
        <button
          onClick={toggleMute}
          className="rounded-md bg-black/50 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => changeVolume(Number(e.target.value))}
          className={cn(
            "h-1 w-0 cursor-pointer appearance-none rounded-full bg-white/30 transition-all duration-300 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white",
            showVolume && "w-20"
          )}
          aria-label="Volume"
        />
      </div>
      <button
        onClick={fullscreen}
        className="rounded-md bg-black/50 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
        aria-label={document.fullscreenElement ? "Exit fullscreen" : "Fullscreen"}
      >
        <Maximize className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
