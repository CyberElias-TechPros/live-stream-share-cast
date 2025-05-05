
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  MessageSquare,
  Share,
  Flag,
  Heart
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useStream } from "@/contexts/StreamContext";
import StreamPlayer from "./StreamPlayer";
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
import { formatDistanceToNow } from 'date-fns';
import { ChatMessage, Stream, StreamStatus } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { liveStreamService } from "@/services/liveStreamService";
import { chatService } from "@/services/chatService";
import { supabase } from "@/integrations/supabase/client";

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
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  
  // Fetch chat messages
  const { data: chatMessages = [], isLoading: isChatLoading } = useQuery({
    queryKey: ["streamChat", streamId],
    queryFn: () => chatService.getChatMessages(streamId),
    refetchInterval: 5000, // Refresh every 5 seconds
    enabled: !!streamId,
  });

  // Chat subscription
  useEffect(() => {
    // Set up real-time subscription for new chat messages
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
          // Simply invalidate the query cache to trigger a refetch
          // This is more efficient than manually managing state
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
          title: stream?.title || "LiveCast Stream",
          text: `Watch "${stream?.title}" live on LiveCast`,
          url: shareUrl,
        });
      } catch (error) {
        console.error("Error sharing:", error);
        // Fallback to copy to clipboard
        navigator.clipboard.writeText(shareUrl);
        toast({
          title: "Link Copied",
          description: "Stream link copied to clipboard"
        });
      }
    } else {
      // Fallback for browsers that don't support sharing API
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
      <div className="flex flex-col items-center justify-center py-12">
        <h1 className="text-2xl font-bold mb-4">Stream Not Found or Has Ended</h1>
        <p className="text-muted-foreground mb-6">This stream may have ended or doesn't exist.</p>
        <Button onClick={() => navigate("/stream")}>Browse Live Streams</Button>
      </div>
    );
  }
  
  return (
    <div className="grid lg:grid-cols-4 gap-6">
      <div className="lg:col-span-3">
        {/* Stream Player */}
        <StreamPlayer 
          stream={stream} 
          status={status} 
          showControls={true}
          showStats={true}
        />
        
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold mb-1">{isStreamLoading ? "Loading..." : stream?.title}</h1>
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  {stream?.userAvatar ? (
                    <AvatarImage src={stream.userAvatar} />
                  ) : null}
                  <AvatarFallback>
                    {stream?.username?.charAt(0).toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium">{stream?.displayName || stream?.username || "Streamer"}</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">
                  {stream?.viewerCount || viewerCount} viewers
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">
                  {stream?.startedAt ? 
                    `Started ${formatDistanceToNow(stream.startedAt, { addSuffix: true })}` : 
                    'Live'
                  }
                </span>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant={isFollowing ? "default" : "outline"} 
                onClick={handleFollowClick}
              >
                <Heart className={`mr-2 h-4 w-4 ${isFollowing ? 'fill-current' : ''}`} />
                {isFollowing ? 'Following' : 'Follow'}
              </Button>
              <Button variant="outline" onClick={shareStream}>Share</Button>
              <Button variant="ghost" size="icon" onClick={reportStream}>
                <Flag className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <Tabs defaultValue="about" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="about">About</TabsTrigger>
              <TabsTrigger value="stats">Stats</TabsTrigger>
            </TabsList>
            
            <TabsContent value="about">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-muted-foreground">
                    {stream?.description || "No description provided"}
                  </p>
                  
                  {stream?.tags && stream.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {stream.tags.map(tag => (
                        <span 
                          key={tag} 
                          className="px-2 py-1 rounded-full bg-muted text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="stats">
              <Card>
                <CardHeader>
                  <CardTitle>Stream Statistics</CardTitle>
                  <CardDescription>Live performance metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-muted/50 p-3 rounded">
                      <div className="text-muted-foreground text-xs font-medium mb-1">VIEWERS</div>
                      <div className="text-xl font-bold">{stream?.viewerCount || viewerCount}</div>
                    </div>
                    <div className="bg-muted/50 p-3 rounded">
                      <div className="text-muted-foreground text-xs font-medium mb-1">BANDWIDTH</div>
                      <div className="text-xl font-bold">{stream?.bandwidth ? `${(stream.bandwidth / 1000).toFixed(1)} Mbps` : 'N/A'}</div>
                    </div>
                    <div className="bg-muted/50 p-3 rounded">
                      <div className="text-muted-foreground text-xs font-medium mb-1">STREAM TIME</div>
                      <div className="text-xl font-bold">
                        {stream?.startedAt ? 
                          formatDistanceToNow(stream.startedAt, { includeSeconds: true }) : 
                          'N/A'
                        }
                      </div>
                    </div>
                    <div className="bg-muted/50 p-3 rounded">
                      <div className="text-muted-foreground text-xs font-medium mb-1">QUALITY</div>
                      <div className="text-xl font-bold">720p</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      
      <div className="bg-card rounded-lg border border-border overflow-hidden flex flex-col h-[600px]">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h3 className="font-semibold">Live Chat</h3>
          <Button variant="outline" size="icon" onClick={shareStream}>
            <Share size={18} />
          </Button>
        </div>
        
        <div 
          ref={chatContainerRef}
          className="flex-1 p-4 overflow-y-auto hide-scrollbar"
        >
          <div className="space-y-4">
            {isChatLoading ? (
              Array(3).fill(0).map((_, i) => (
                <div key={i} className="flex gap-2">
                  <div className="h-8 w-8 rounded-full bg-muted/50"></div>
                  <div className="flex-1">
                    <div className="h-4 w-24 bg-muted/50 rounded mb-2"></div>
                    <div className="h-4 w-full bg-muted/50 rounded"></div>
                  </div>
                </div>
              ))
            ) : chatMessages.length > 0 ? (
              chatMessages.map(message => (
                <div key={message.id} className="flex gap-2 group">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={message.userAvatar} />
                    <AvatarFallback>
                      {message.username.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{message.username}</p>
                      <p className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                        {formatDistanceToNow(message.timestamp, { addSuffix: true })}
                      </p>
                    </div>
                    <p className="text-sm">{message.message}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No messages yet</p>
                <p className="text-xs">Be the first to say hello!</p>
              </div>
            )}
          </div>
        </div>
        
        <div className="p-4 border-t border-border">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Input 
              placeholder={isAuthenticated ? "Send a message..." : "Log in to chat"} 
              className="flex-1" 
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              disabled={!isAuthenticated || sendMessageMutation.isPending}
            />
            <Button 
              type="submit" 
              size="icon" 
              disabled={!isAuthenticated || sendMessageMutation.isPending}
            >
              <MessageSquare size={18} />
            </Button>
          </form>
          
          {!isAuthenticated && (
            <p className="text-xs text-center mt-2 text-muted-foreground">
              <a href="/login" className="text-stream hover:underline">Log in</a> to join the conversation
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
