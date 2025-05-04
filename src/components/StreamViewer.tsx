
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { 
  Volume2, 
  VolumeX, 
  Fullscreen, 
  Minimize,
  MessageSquare,
  UserRound,
  Share
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StreamViewerProps {
  streamId: string;
}

export default function StreamViewer({ streamId }: StreamViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [streamTitle, setStreamTitle] = useState("Live Stream");
  const [streamDescription, setStreamDescription] = useState("");
  const [streamerName, setStreamerName] = useState("LiveCast User");
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    // In a real app, we would connect to the stream server here
    const simulateStreamLoading = () => {
      // Simulating stream connection
      setTimeout(() => {
        setIsLoading(false);
        setIsPlaying(true);
        
        // Simulating stream metadata
        setStreamTitle("Live Demo Stream");
        setStreamerName("John Doe");
        setStreamDescription("This is a demonstration of the LiveCast streaming platform.");
        
        // Simulating viewer count updates
        const interval = setInterval(() => {
          setViewerCount(Math.floor(Math.random() * 10) + 5);
        }, 5000);
        
        return () => clearInterval(interval);
      }, 2000);
    };
    
    simulateStreamLoading();
  }, [streamId]);
  
  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };
  
  const toggleFullscreen = () => {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        toast({
          title: "Fullscreen Error",
          description: `Error attempting to enable fullscreen: ${err.message}`,
          variant: "destructive"
        });
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  };
  
  const shareStream = async () => {
    const shareUrl = window.location.href;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: streamTitle,
          text: `Watch "${streamTitle}" live on LiveCast`,
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
  
  return (
    <div className="grid lg:grid-cols-4 gap-6">
      <div className="lg:col-span-3">
        <div 
          ref={containerRef}
          className="rounded-lg overflow-hidden bg-black border border-border relative"
        >
          {isLoading ? (
            <div className="aspect-video flex items-center justify-center bg-muted/30">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full border-4 border-stream-light border-t-transparent animate-spin mb-4 mx-auto"></div>
                <p className="text-muted-foreground">Connecting to stream...</p>
              </div>
            </div>
          ) : (
            <div className="aspect-video bg-black">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                autoPlay
                src="/placeholder-video.mp4" // In a real app, this would be the stream URL
              />
              
              <div className="absolute top-4 left-4 flex gap-2">
                <div className="live-indicator">LIVE</div>
                <div className="viewer-count">
                  <UserRound size={16} />
                  <span>{viewerCount}</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Stream Controls */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 hover:opacity-100 transition-opacity stream-controls">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-white font-medium">{streamTitle}</h3>
                <p className="text-white/70 text-sm">{streamerName}</p>
              </div>
              
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20 hover:text-white"
                  onClick={toggleMute}
                >
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </Button>
                
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20 hover:text-white"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? <Minimize size={20} /> : <Fullscreen size={20} />}
                </Button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-6">
          <h1 className="text-2xl font-bold mb-2">{streamTitle}</h1>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-full bg-stream"></div>
            <span className="font-medium">{streamerName}</span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground">{viewerCount} viewers</span>
          </div>
          
          <p className="text-muted-foreground">{streamDescription}</p>
        </div>
      </div>
      
      <div className="bg-card rounded-lg border border-border overflow-hidden flex flex-col h-[500px]">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h3 className="font-semibold">Live Chat</h3>
          <Button variant="outline" size="icon" onClick={shareStream}>
            <Share size={18} />
          </Button>
        </div>
        
        <div className="flex-1 p-4 overflow-y-auto hide-scrollbar">
          <div className="space-y-4">
            {/* We'll simulate some chat messages */}
            <div className="flex gap-2">
              <div className="h-8 w-8 rounded-full bg-blue-500 flex-shrink-0"></div>
              <div>
                <p className="text-sm font-medium">User123</p>
                <p className="text-sm">Hello everyone! Great stream!</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <div className="h-8 w-8 rounded-full bg-green-500 flex-shrink-0"></div>
              <div>
                <p className="text-sm font-medium">StreamFan</p>
                <p className="text-sm">How long have you been streaming today?</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <div className="h-8 w-8 rounded-full bg-purple-500 flex-shrink-0"></div>
              <div>
                <p className="text-sm font-medium">ViewerXYZ</p>
                <p className="text-sm">The quality of this stream is amazing!</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <Input placeholder="Send a message..." className="flex-1" />
            <Button size="icon">
              <MessageSquare size={18} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Use the proper Input component from shadcn UI
function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
