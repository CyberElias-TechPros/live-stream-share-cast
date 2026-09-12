import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  MessageSquare,
  Share,
  Flag,
  Heart,
  ArrowLeft,
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
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { liveStreamService } from "@/services/liveStreamService";
import { chatService } from "@/services/chatService";
import { supabase } from "@/integrations/supabase/client";
import { formatViewers, initials } from "@/utils/design";

interface StreamViewerProps {
  streamId: string;
}

export default function StreamViewer({ streamId }: StreamViewerProps) {
  const [chatMessage, setChatMessage] = useState('');
  const [isFollowing, setIsFollowing] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const { joinStream, leaveStream, sendChatMessage, status: streamStatus, viewerCount } = useStream();
  const navigate = useNavigate();

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

  // Chat subscription
  useEffect(() => {
    const subscription = supabase
      .channel(`stream-chat-${streamId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `stream_id=eq.${streamId}`
        },
        () => {
          // Invalidate the query cache to trigger a refetch
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
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

  const handleFollowClick = () => {
    if (!isAuthenticated) {
      toast({
        title: "Login Required",
        description: "You must be logged in to follow streamers",
        variant: "default"
      });
      return;
    }

    setIsFollowing(!isFollowing);
    toast({
      title: isFollowing ? "Unfollowed" : "Following",
      description: isFollowing ? "You've unfollowed this streamer" : "You're now following this streamer",
      variant: "default"
    });
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

  const reportStream = () => {
    toast({
      title: "Report Submitted",
      description: "Thank you for your report. Our team will review this stream.",
      variant: "default"
    });
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
                <Button
                  variant={isFollowing ? "glow" : "glass"}
                  onClick={handleFollowClick}
                >
                  <Heart className={`h-4 w-4 ${isFollowing ? "fill-current" : ""}`} />
                  {isFollowing ? 'Following' : 'Follow'}
                </Button>
                <Button variant="glass" onClick={shareStream}>
                  <Share className="h-4 w-4" />
                  Share
                </Button>
                <Button variant="ghost" size="icon" className="rounded-full" onClick={reportStream} aria-label="Report stream">
                  <Flag className="h-4 w-4" />
                </Button>
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
                <div key={message.id} className="flex gap-3 group">
                  <Avatar className="h-8 w-8 shrink-0 rounded-full">
                    <AvatarImage src={message.userAvatar} />
                    <AvatarFallback className="bg-signature-soft text-[10px] font-semibold text-[hsl(var(--accent-hi))]">
                      {initials(message.username)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate text-[13px] font-semibold">{message.username}</p>
                      <p className="shrink-0 font-mono text-[10px] text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
                        {formatDistanceToNow(message.timestamp, { addSuffix: true })}
                      </p>
                    </div>
                    <p className="break-words text-[13px] leading-relaxed text-foreground/85">{message.message}</p>
                  </div>
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
