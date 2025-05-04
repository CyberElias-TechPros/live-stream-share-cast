
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

interface StreamViewerProps {
  streamId: string;
}

export default function StreamViewer({ streamId }: StreamViewerProps) {
  const [chatMessage, setChatMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [stream, setStream] = useState<Stream | null>(null);
  const [status, setStatus] = useState<StreamStatus>('loading');
  const [isFollowing, setIsFollowing] = useState(false);
  
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const { joinStream, leaveStream, sendChatMessage, status: streamStatus, viewerCount } = useStream();
  
  // Simulate loading stream data
  useEffect(() => {
    const fetchStream = async () => {
      try {
        setStatus('loading');
        
        // In a real app, we would fetch the stream from an API
        // For now, let's simulate it
        setTimeout(() => {
          const mockStream: Stream = {
            id: streamId,
            title: "Live Demo Stream",
            description: "This is a demonstration of the LiveCast streaming platform.",
            isLive: true,
            streamKey: `key-${streamId}`,
            createdAt: new Date(),
            viewerCount: Math.floor(Math.random() * 50) + 5,
            isRecording: false,
            isLocalStream: false,
            userId: "streamer-123",
            startedAt: new Date(Date.now() - 3600000), // Started 1 hour ago
            bandwidth: 2500,
            tags: ["gaming", "live", "demo"]
          };
          
          setStream(mockStream);
          setStatus('live');
        }, 2000);
        
        // In a real app, we would join the stream via WebRTC
        try {
          await joinStream(streamId);
        } catch (error) {
          console.error("Error joining stream:", error);
        }
      } catch (error) {
        console.error("Error fetching stream:", error);
        setStatus('error');
        toast({
          title: "Error",
          description: "Failed to load the stream",
          variant: "destructive"
        });
      }
    };
    
    fetchStream();
    
    return () => {
      leaveStream();
    };
  }, [streamId, joinStream, leaveStream, toast]);
  
  // Simulate loading chat messages
  useEffect(() => {
    // In a real app, we would connect to a WebSocket for chat
    const simulateChatMessages = () => {
      const mockMessages: ChatMessage[] = [
        {
          id: "1",
          streamId,
          userId: "user-123",
          username: "User123",
          userAvatar: "https://ui-avatars.com/api/?name=User123&background=blue",
          message: "Hello everyone! Great stream!",
          timestamp: new Date(Date.now() - 5 * 60000)
        },
        {
          id: "2",
          streamId,
          userId: "user-456",
          username: "StreamFan",
          userAvatar: "https://ui-avatars.com/api/?name=StreamFan&background=green",
          message: "How long have you been streaming today?",
          timestamp: new Date(Date.now() - 3 * 60000)
        },
        {
          id: "3",
          streamId,
          userId: "user-789",
          username: "ViewerXYZ",
          userAvatar: "https://ui-avatars.com/api/?name=ViewerXYZ&background=purple",
          message: "The quality of this stream is amazing!",
          timestamp: new Date(Date.now() - 1 * 60000)
        }
      ];
      
      setChatMessages(mockMessages);
      
      // Simulate new messages coming in
      const interval = setInterval(() => {
        const randomNames = [
          "ChatPro", "GameLover", "StreamViewer", "TechFan", 
          "MusicBuff", "ArtEnjoyer", "SportsFan", "CoolViewer"
        ];
        const randomMessages = [
          "Nice stream!", "Hello from Brazil!", "Keep up the good work!",
          "First time watching, this is great!", "Can you explain what you're doing?",
          "Love the content!", "Wow, that's impressive!", "How did you learn to do that?",
          "I'm enjoying this stream so much!", "What equipment are you using?"
        ];
        
        const randomNameIndex = Math.floor(Math.random() * randomNames.length);
        const randomMessageIndex = Math.floor(Math.random() * randomMessages.length);
        
        const newMessage: ChatMessage = {
          id: Date.now().toString(),
          streamId,
          userId: `user-${Date.now()}`,
          username: randomNames[randomNameIndex],
          userAvatar: `https://ui-avatars.com/api/?name=${randomNames[randomNameIndex]}&background=random`,
          message: randomMessages[randomMessageIndex],
          timestamp: new Date()
        };
        
        setChatMessages(prev => [...prev, newMessage]);
      }, 8000);
      
      return () => clearInterval(interval);
    };
    
    if (status === 'live') {
      const timer = setTimeout(simulateChatMessages, 2000);
      return () => clearTimeout(timer);
    }
  }, [status, streamId]);
  
  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);
  
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
    
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      streamId,
      userId: user?.id || 'guest',
      username: user?.username || 'Guest User',
      userAvatar: user?.avatar,
      message: chatMessage,
      timestamp: new Date()
    };
    
    setChatMessages(prev => [...prev, newMessage]);
    sendChatMessage(chatMessage);
    setChatMessage('');
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
              <h1 className="text-2xl font-bold mb-1">{stream?.title || "Loading..."}</h1>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-stream flex-shrink-0"></div>
                <span className="font-medium">Streamer Name</span>
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
            {chatMessages.map(message => (
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
            ))}
            
            {chatMessages.length === 0 && status === 'live' && (
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
              disabled={!isAuthenticated}
            />
            <Button type="submit" size="icon" disabled={!isAuthenticated}>
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
