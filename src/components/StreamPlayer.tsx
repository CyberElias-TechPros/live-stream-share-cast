
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { 
  Volume2, 
  VolumeX, 
  Fullscreen, 
  Minimize,
  UserRound,
  Settings,
  Wifi,
  Gauge
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Stream, StreamStatus } from "@/types";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

interface StreamPlayerProps {
  stream: Stream | null;
  status?: StreamStatus;
  autoPlay?: boolean;
  showControls?: boolean;
  showStats?: boolean;
  className?: string;
}

export default function StreamPlayer({ 
  stream,
  status = "idle",
  autoPlay = true,
  showControls = true,
  showStats = false,
  className = ""
}: StreamPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [qualityOption, setQualityOption] = useState('auto');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Network stats
  const [bandwidth, setBandwidth] = useState<number | null>(null);
  const [resolution, setResolution] = useState<string | null>(null);
  const [frameRate, setFrameRate] = useState<number | null>(null);
  const [bufferHealth, setBufferHealth] = useState<number | null>(null);
  
  useEffect(() => {
    if (autoPlay && videoRef.current && status === 'live') {
      videoRef.current.play().catch(error => {
        console.error("Error playing video:", error);
        // Autoplay may be blocked by browser policy
        if (error.name === "NotAllowedError") {
          toast({
            title: "Autoplay blocked",
            description: "Please click play to start the stream",
            variant: "default"
          });
        }
      });
    }
  }, [autoPlay, status, toast]);
  
  useEffect(() => {
    if (showStats && videoRef.current && status === 'live') {
      // In a real app, we would get these from WebRTC stats API
      const statsInterval = setInterval(() => {
        // Simulate bandwidth fluctuation
        setBandwidth(Math.floor(Math.random() * 3000) + 1500); // 1.5-4.5 Mbps
        setResolution(stream?.qualityOptions?.[0]?.resolution.width + 'x' + 
                     stream?.qualityOptions?.[0]?.resolution.height || '1280x720');
        setFrameRate(30);
        
        if (videoRef.current) {
          const buffered = videoRef.current.buffered;
          if (buffered.length > 0) {
            const bufferEnd = buffered.end(buffered.length - 1);
            const bufferSize = bufferEnd - videoRef.current.currentTime;
            setBufferHealth(bufferSize);
          }
        }
      }, 2000);
      
      return () => clearInterval(statsInterval);
    }
  }, [showStats, status, stream]);
  
  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };
  
  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };
  
  const changeVolume = (newVolume: number) => {
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      setVolume(newVolume);
      if (newVolume === 0) {
        videoRef.current.muted = true;
        setIsMuted(true);
      } else if (isMuted) {
        videoRef.current.muted = false;
        setIsMuted(false);
      }
    }
  };
  
  const changeQuality = (quality: string) => {
    setQualityOption(quality);
    toast({
      title: "Quality changed",
      description: `Stream quality set to ${quality}`,
      variant: "default"
    });
    
    // In a real app, we would switch video sources or call adaptive bitrate APIs
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
  
  const renderContent = () => {
    switch (status) {
      case 'loading':
      case 'connecting':
        return (
          <div className="aspect-video flex items-center justify-center bg-muted/30">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full border-4 border-stream-light border-t-transparent animate-spin mb-4 mx-auto"></div>
              <p className="text-muted-foreground">
                {status === 'connecting' ? 'Connecting to stream...' : 'Loading stream...'}
              </p>
            </div>
          </div>
        );
      
      case 'error':
        return (
          <div className="aspect-video flex items-center justify-center bg-muted/30">
            <div className="text-center p-4">
              <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center mb-4 mx-auto">
                <Wifi className="h-6 w-6" />
              </div>
              <p className="text-lg font-medium mb-2">Stream Error</p>
              <p className="text-muted-foreground">
                There was a problem connecting to this stream. Please try again later.
              </p>
            </div>
          </div>
        );
      
      case 'ended':
        return (
          <div className="aspect-video flex items-center justify-center bg-muted/30">
            <div className="text-center p-4">
              <p className="text-lg font-medium mb-2">Stream Ended</p>
              <p className="text-muted-foreground">
                This stream has ended. Check back later for more content.
              </p>
            </div>
          </div>
        );
      
      case 'live':
      default:
        return (
          <div className="aspect-video bg-black">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              autoPlay={autoPlay}
              muted={isMuted}
              poster={stream?.thumbnail}
              src="/placeholder-video.mp4" // In a real app, this would be the stream URL
            />
            
            {stream?.isLive && (
              <div className="absolute top-4 left-4 flex gap-2">
                <div className="live-indicator">LIVE</div>
                <div className="viewer-count">
                  <UserRound size={16} />
                  <span>{stream.viewerCount}</span>
                </div>
              </div>
            )}
          </div>
        );
    }
  };
  
  return (
    <div 
      ref={containerRef}
      className={`relative rounded-lg overflow-hidden bg-black border border-border ${className}`}
    >
      {/* Stream Content */}
      {renderContent()}
      
      {/* Stream Controls */}
      {showControls && status === 'live' && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 hover:opacity-100 transition-opacity stream-controls">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-white font-medium">{stream?.title || 'Live Stream'}</h3>
              <p className="text-white/70 text-sm">{stream?.userId || 'Streamer'}</p>
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
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 hover:text-white"
                  >
                    <Settings size={20} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Stream Quality</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => changeQuality('auto')}>
                    Auto {qualityOption === 'auto' && '✓'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => changeQuality('1080p')}>
                    1080p {qualityOption === '1080p' && '✓'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => changeQuality('720p')}>
                    720p {qualityOption === '720p' && '✓'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => changeQuality('480p')}>
                    480p {qualityOption === '480p' && '✓'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => changeQuality('360p')}>
                    360p {qualityOption === '360p' && '✓'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
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
      )}
      
      {/* Stream Statistics */}
      {showStats && status === 'live' && (
        <div className="absolute top-4 right-4 bg-black/70 p-2 rounded text-xs text-white">
          <div className="flex items-center gap-1 mb-1">
            <Gauge size={12} />
            <span>{bandwidth ? `${(bandwidth / 1000).toFixed(1)} Mbps` : '-- Mbps'}</span>
          </div>
          <div className="flex gap-2">
            <span>{resolution || '1280x720'}</span>
            <span>{frameRate || 30}fps</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function StreamPlayerSkeleton() {
  return (
    <div className="rounded-lg overflow-hidden border border-border">
      <Skeleton className="aspect-video" />
    </div>
  );
}
