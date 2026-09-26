import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  MessageSquare,
  Share,
  Flag,
  Heart,
  ArrowLeft,
  Ban,
  EyeOff,
  MoreHorizontal,
  RotateCcw,
  Timer,
  UserRound,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useStream } from "@/contexts/StreamContext";
import StreamPlayer from "./StreamPlayer";
import LiveBadge, { ViewerPill } from "./LiveBadge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { ChatMessage, Stream, StreamStatus } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { liveStreamService } from "@/services/liveStreamService";
import { chatService } from "@/services/chatService";
import { moderationService } from "@/services/moderationService";
import { analyticsService, watchTracker } from "@/services/analyticsService";
import FollowButton from "@/components/FollowButton";
import ReportDialog from "@/components/ReportDialog";
import TipButton from "@/components/TipButton";
import { formatViewers, initials } from "@/utils/design";

interface StreamViewerProps {
  streamId: string;
}

export default function StreamViewer({ streamId }: StreamViewerProps) {
  const [chatMessage, setChatMessage] = useState('');

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const { joinStream, leaveStream, sendChatMessage, status: streamStatus, viewerCount } = useStream();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch stream data
  const { data: stream, isLoading: isStreamLoading, error: streamError } = useQuery({
    queryKey: ["stream", streamId],
    queryFn: () => liveStreamService.getStreamById(streamId),
    refetchInterval: 30000,
  });

  // Fetch chat messages
  const { data: chatMessages = [], isLoading: isChatLoading } = useQuery({
    queryKey: ["streamChat", streamId],
    queryFn: () => chatService.getChatMessages(streamId),
    refetchInterval: 5000,
    enabled: !!streamId,
  });

  // The broadcaster gets the host role on the socket: host-only moderation
  // frames are accepted and the room is marked as owned by this connection.
  const isHost = !!user?.id && !!stream?.userId && user.id === stream.userId;

  // Live chat: the stream's Durable Object pushes new messages over a socket,
  // which invalidates the query cache to trigger a refetch.
  useEffect(() => {
    const subscription = chatService.subscribeToStream(
      streamId,
      (event) => {
        if (event.type === "chat" || event.type === "moderation") {
          queryClient.invalidateQueries({ queryKey: ["streamChat", streamId] });
        }
        if (event.type === "presence" && typeof event.viewers === "number") {
          queryClient.invalidateQueries({ queryKey: ["stream", streamId] });
        }
      },
      { role: isHost ? "host" : "viewer" },
    );

    return () => subscription.close();
  }, [streamId, queryClient, isHost]);

  // Watch-time tracking: one session per visit, closed on unmount.
  useEffect(() => {
    if (!streamId) return;
    let tracker: { stop(): void } | null = null;
    let cancelled = false;

    void watchTracker.start({ streamId }).then((handle) => {
      if (cancelled) handle?.stop();
      else tracker = handle;
    });

    return () => {
      cancelled = true;
      tracker?.stop();
    };
  }, [streamId]);

  // Join stream effect
  useEffect(() => {
    if (streamId) {
      try {
        joinStream(streamId);
      } catch (error) {
        console.error("Error joining stream:", error);
      }
    }

    return () => {
      leaveStream();
    };
  }, [streamId, joinStream, leaveStream]);

  const [moderatingId, setModeratingId] = useState<string | null>(null);

  /** Hide or restore a message for everyone in the room. */
  const handleToggleMessage = async (message: ChatMessage) => {
    setModeratingId(message.id);
    const ok = await chatService.moderateMessage(message.id, !message.isModerated);
    setModeratingId(null);

    if (!ok) {
      toast({ title: 'Could not update that message', variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['streamChat', streamId] });
    toast({ title: message.isModerated ? 'Message restored' : 'Message hidden' });
  };

  /** Timeout (mute) or ban the author of a message in this room. */
  const handleRestrict = async (message: ChatMessage, kind: 'timeout' | 'ban') => {
    if (!message.userId) {
      toast({ title: 'That message has no author to restrict', variant: 'destructive' });
      return;
    }

    const reason = window.prompt(
      kind === 'timeout' ? `Mute @${message.username} for 10 minutes — reason?` : `Ban @${message.username} from this chat — reason?`,
      kind === 'timeout' ? 'Chat rules' : 'Chat rules',
    );
    if (reason === null) return;

    setModeratingId(message.id);
    const ok = await moderationService.restrict(streamId, {
      userId: message.userId,
      kind,
      durationMinutes: kind === 'timeout' ? 10 : undefined,
      reason: reason || undefined,
    });
    setModeratingId(null);

    if (!ok) {
      toast({ title: kind === 'timeout' ? 'Could not mute that viewer' : 'Could not ban that viewer', variant: 'destructive' });
      return;
    }
    // The room hides their messages until the restriction ends.
    queryClient.invalidateQueries({ queryKey: ['streamChat', streamId] });
    toast({
      title: kind === 'timeout' ? `@${message.username} muted for 10 minutes` : `@${message.username} banned from chat`,
      description: 'Manage the list from Moderation → Chat rules.',
    });
  };

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Status derived from data
  const status: StreamStatus = isStreamLoading
    ? "loading"
    : streamError
    ? "error"
    : !stream
    ? "error"
    : stream.isLive
    ? "live"
    : "ended";

  // Send chat message mutation
  const sendMessageMutation = useMutation({
    mutationFn: (message: string) => {
      if (!user || !stream) throw new Error("Not authenticated or no stream");

      return chatService.sendChatMessage({
        streamId,
        userId: user.id,
        username: user.username,
        userAvatar: user.avatar,
        message,
        type: "text"
      });
    },
    onSuccess: () => {
      setChatMessage("");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();

    if (!chatMessage.trim()) {
      return;
    }

    if (!isAuthenticated) {
      toast({
        title: "Login Required",
        description: "You must be logged in to send messages",
        variant: "default"
      });
      return;
    }

    sendMessageMutation.mutate(chatMessage);
  };


  const shareStream = async () => {
    const shareUrl = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title: stream?.title || "I'm Live Stream",
          text: `Watch "${stream?.title}" live on I'm Live`,
          url: shareUrl,
        });
      } catch (error) {
        console.error("Error sharing stream:", error);
        navigator.clipboard.writeText(shareUrl);
        toast({
          title: "Link Copied",
          description: "Stream link copied to clipboard"
        });
      }
    } else {
      navigator.clipboard.writeText(shareUrl);
      toast({
        title: "Link Copied",
        description: "Stream link copied to clipboard"
      });
    }
  };


  // If stream has ended and is not found or no longer live
  if (status === "error" || (stream && !stream.isLive && stream.endedAt)) {
    return (
      <div className="mx-auto grid max-w-3xl flex-1 place-items-center px-5 py-24 text-center">
        <div>
          <p className="overline mb-4">Signal ended</p>
          <h1 className="font-display text-4xl font-bold tracking-tight">
            Stream not found or has ended
          </h1>
          <p className="mt-3 text-muted-foreground">
            This stream may have ended or no longer exists.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link to="/stream">
              <Button variant="glow" size="lg">Browse live streams</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pb-16 md:px-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* ============ LEFT: PLAYER + META ============ */}
        <div className="min-w-0">
          <StreamPlayer
            stream={stream}
            status={status}
            showControls={true}
            showStats={true}
            className="rounded-2xl shadow-glow-lg"
          />

          <div className="mt-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <LiveBadge size="sm" />
                  {stream?.category && (
                    <span className="rounded-md border border-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      {stream.category}
                    </span>
                  )}
                </div>
                <h1 className="mt-2.5 font-display text-3xl font-bold leading-tight tracking-tight md:text-4xl">
                  {isStreamLoading ? "Tuning in…" : stream?.title}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-signature-soft ring-2 ring-[hsl(var(--accent-mid)_/_0.45)]">
                      <Avatar className="h-full w-full">
                        {stream?.userAvatar ? (
                          <AvatarImage src={stream.userAvatar} />
                        ) : null}
                        <AvatarFallback className="bg-signature text-xs font-semibold text-white">
                          {initials(stream?.displayName || stream?.username)}
                        </AvatarFallback>
                      </Avatar>
                    </span>
                    <span className="font-medium">{stream?.displayName || stream?.username || "Streamer"}</span>
                  </div>
                  <span className="text-white/20">·</span>
                  <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                    <ViewerPill count={stream?.viewerCount || viewerCount} light={false} className="bg-white/[0.07]" />
                  </span>
                  <span className="text-white/20">·</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {stream?.startedAt
                      ? `ON AIR ${formatDistanceToNow(stream.startedAt, { addSuffix: true })}`
                      : 'ON AIR'}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {stream && <FollowButton userId={stream.userId} username={stream.username} />}
                {stream && stream.userId !== user?.id && (
                  <TipButton streamerId={stream.userId} streamerName={stream.displayName || stream.username} streamId={streamId} />
                )}
                <Button variant="glass" onClick={shareStream}>
                  <Share className="h-4 w-4" />
                  Share
                </Button>
                <ReportDialog targetType="stream" targetId={streamId} iconOnly variant="ghost" />
              </div>
            </div>

            <Tabs defaultValue="about" className="mt-8 w-full">
              <TabsList className="glass h-10 rounded-full bg-white/[0.04] p-1">
                <TabsTrigger value="about" className="rounded-full">About</TabsTrigger>
                <TabsTrigger value="stats" className="rounded-full">Stats</TabsTrigger>
              </TabsList>

              <TabsContent value="about" className="mt-4">
                <Card className="rounded-2xl border-white/8 bg-card/70 backdrop-blur-md">
                  <CardContent className="pt-6">
                    <p className="leading-relaxed text-muted-foreground">
                      {stream?.description || "No description provided."}
                    </p>

                    {stream?.tags && stream.tags.length > 0 && (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {stream.tags.map(tag => (
                          <span
                            key={tag}
                            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[11px] tracking-wider text-muted-foreground"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="stats" className="mt-4">
                <Card className="rounded-2xl border-white/8 bg-card/70 backdrop-blur-md">
                  <CardHeader>
                    <CardTitle className="font-display text-lg font-bold">Stream telemetry</CardTitle>
                    <CardDescription>Live performance metrics</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { label: "VIEWERS", value: String(stream?.viewerCount || viewerCount || 0) },
                        { label: "BANDWIDTH", value: stream?.bandwidth ? `${(stream.bandwidth / 1000).toFixed(1)} Mbps` : 'N/A' },
                        {
                          label: "STREAM TIME",
                          value: stream?.startedAt
                            ? formatDistanceToNow(stream.startedAt, { includeSeconds: true })
                            : 'N/A',
                        },
                        { label: "QUALITY", value: '720p' },
                      ].map((s) => (
                        <div key={s.label} className="rounded-xl border border-white/8 bg-black/30 p-4">
                          <div className="font-mono text-[10px] tracking-[0.22em] text-muted-foreground/70">{s.label}</div>
                          <div className="mt-1.5 font-display text-xl font-bold">{s.value}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* ============ RIGHT: LIVE CHAT ============ */}
        <div className="flex h-[480px] flex-col overflow-hidden rounded-2xl glass-deep shadow-card lg:h-[calc(100vh-14rem)] lg:min-h-[560px]">
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="eq text-[hsl(var(--accent-mid))]">
                <span /><span /><span /><span />
              </span>
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em]">
                Live chat
              </h3>
            </div>
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
              {formatViewers(stream?.viewerCount || viewerCount)} IN ROOM
            </span>
          </div>

          <div
            ref={chatContainerRef}
            className="hide-scrollbar flex-1 space-y-4 overflow-y-auto p-4"
          >
            {isChatLoading ? (
              Array(3).fill(0).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-white/10" />
                  <div className="flex-1">
                    <div className="mb-2 h-3.5 w-24 animate-pulse rounded bg-white/10" />
                    <div className="h-3.5 w-full animate-pulse rounded bg-white/10" />
                  </div>
                </div>
              ))
            ) : chatMessages.length > 0 ? (
              chatMessages.map((message: ChatMessage) => (
                <div key={message.id} className="group flex gap-3">
                  <Avatar className="h-8 w-8 shrink-0 rounded-full">
                    <AvatarImage src={message.userAvatar} />
                    <AvatarFallback className="bg-signature-soft text-[10px] font-semibold text-[hsl(var(--accent-hi))]">
                      {initials(message.username)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate text-[13px] font-semibold">{message.username}</p>
                      {isHost && message.userId === stream?.userId && (
                        <span className="shrink-0 rounded-full bg-signature-soft px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[hsl(var(--accent-hi))]">
                          host
                        </span>
                      )}
                      <p className="shrink-0 font-mono text-[10px] text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
                        {formatDistanceToNow(message.timestamp, { addSuffix: true })}
                      </p>
                    </div>

                    {message.isModerated ? (
                      <p className="text-[13px] italic leading-relaxed text-muted-foreground/70">
                        Message hidden by a moderator
                        {isHost && (
                          <button
                            type="button"
                            onClick={() => void handleToggleMessage(message)}
                            className="ml-2 not-italic text-[hsl(var(--accent-hi))] underline-offset-2 hover:underline"
                          >
                            restore
                          </button>
                        )}
                      </p>
                    ) : (
                      <p className="break-words text-[13px] leading-relaxed text-foreground/85">{message.message}</p>
                    )}
                  </div>

                  {isHost && message.userId !== stream?.userId && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Moderate message from ${message.username}`}
                          disabled={moderatingId === message.id}
                          className="h-6 shrink-0 rounded-md px-1 text-muted-foreground opacity-0 transition-opacity hover:bg-white/10 hover:text-foreground focus:opacity-100 group-hover:opacity-100 disabled:opacity-40"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onClick={() => void handleToggleMessage(message)}>
                          {message.isModerated ? (
                            <>
                              <RotateCcw className="mr-2 h-3.5 w-3.5" /> Restore message
                            </>
                          ) : (
                            <>
                              <EyeOff className="mr-2 h-3.5 w-3.5" /> Hide message
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void handleRestrict(message, "timeout")}>
                          <Timer className="mr-2 h-3.5 w-3.5" /> Mute 10 minutes
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => void handleRestrict(message, "ban")}>
                          <Ban className="mr-2 h-3.5 w-3.5" /> Ban from chat
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link to={`/profile/${message.username}`} className="cursor-pointer">
                            <UserRound className="mr-2 h-3.5 w-3.5" /> View profile
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))
            ) : (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-white/8 bg-white/[0.03]">
                    <MessageSquare className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">The room is quiet</p>
                  <p className="mt-1 font-mono text-[11px] tracking-wider text-muted-foreground/70">
                    BE THE FIRST TO SAY HI
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-white/8 p-4">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                placeholder={isAuthenticated ? "Say something…" : "Log in to chat"}
                className="h-11 flex-1 rounded-full border border-white/10 bg-white/[0.05] px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-[hsl(var(--accent-mid)_/_0.5)] disabled:opacity-50"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                disabled={!isAuthenticated || sendMessageMutation.isPending}
              />
              <Button
                type="submit"
                variant="glow"
                size="icon"
                className="rounded-full"
                disabled={!isAuthenticated || sendMessageMutation.isPending}
                aria-label="Send message"
              >
                <MessageSquare size={18} />
              </Button>
            </form>

            {!isAuthenticated && (
              <p className="mt-2.5 text-center font-mono text-[10px] tracking-wider text-muted-foreground/70">
                <Link to="/login" className="text-[hsl(var(--accent-hi))] hover:underline">
                  LOG IN
                </Link>{" "}
                TO JOIN THE CONVERSATION
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
