
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
  WifiOff,
  Gauge,
  Radio
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Stream, StreamStatus } from "@/types";
import { LanViewer, type LanState } from "@/lib/lanStream";
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

  /* ----- LAN mode: receive the stream peer-to-peer over the local network ----- */
  const isLan = !!stream?.isLocalStream;
  const [lanState, setLanState] = useState<LanState>("idle");
  const [lanSoundBlocked, setLanSoundBlocked] = useState(false);
  const [lanEnded, setLanEnded] = useState(false);
  const lanViewerRef = useRef<LanViewer | null>(null);

  useEffect(() => {
    if (!isLan || status !== "live" || !stream) return;
    const viewer = new LanViewer(stream.id);
    lanViewerRef.current = viewer;
    viewer.onState = (s) => {
      setLanState(s);
      if (s === "failed") {
        toast({
          title: "Connection failed",
          description: "Make sure you're on the same network as the host.",
          variant: "destructive",
        });
      }
    };
    viewer.onStream = (ms) => {
      const el = videoRef.current;
      if (ms && el) {
        el.srcObject = ms;
        el.muted = false;
        el.play().catch(() => {
          // Autoplay with sound blocked — start muted, offer a tap-to-unmute.
          el.muted = true;
          setLanSoundBlocked(true);
          el.play().catch(() => {});
        });
      } else if (!ms) {
        if (el) el.srcObject = null;
        setLanEnded(true);
      }
    };
    viewer.start();
    return () => {
      viewer.disconnect();
      lanViewerRef.current = null;
      setLanEnded(false);
      setLanSoundBlocked(false);
      setLanState("idle");
    };
  }, [isLan, status, stream, toast]);

  const handleLanConnect = () => {
    setLanSoundBlocked(false);
    lanViewerRef.current?.connect();
  };

  const handleLanUnmute = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = false;
    el.play().catch(() => {});
    setLanSoundBlocked(false);
  };

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
          <div className="relative aspect-video flex items-center justify-center overflow-hidden bg-black">
            <div className="absolute inset-0 opacity-40" style={{ background: 'linear-gradient(120deg, hsl(var(--sig-a) / 0.5), hsl(var(--sig-c) / 0.45), hsl(252 70% 10%))' }} />
            <div className="relative text-center">
              <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
                <div className="h-6 w-6 rounded-full border-2 border-[hsl(var(--accent-mid))] border-t-transparent animate-spin" />
              </div>
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-white/60">
                {status === 'connecting' ? 'Connecting to stream' : 'Tuning in'}
              </p>
            </div>
          </div>
        );
      
      case 'error':
        return (
          <div className="relative aspect-video flex items-center justify-center overflow-hidden bg-black">
            <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(60% 80% at 50% 30%, hsl(349 86% 45% / 0.4), transparent 70%)' }} />
            <div className="relative text-center p-4">
              <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-red-500/10 text-red-400">
                <Wifi className="h-6 w-6" />
              </div>
              <p className="font-display text-xl font-bold text-white mb-1">Signal lost</p>
              <p className="text-sm text-white/50">
                There was a problem connecting to this stream. Please try again later.
              </p>
            </div>
          </div>
        );

      case 'ended':
        return (
          <div className="relative aspect-video flex items-center justify-center overflow-hidden bg-black">
            <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(60% 80% at 50% 30%, hsl(252 30% 30% / 0.6), transparent 70%)' }} />
            <div className="relative text-center p-4">
              <p className="font-display text-xl font-bold text-white mb-1">Broadcast ended</p>
              <p className="text-sm text-white/50">
                This stream has ended. Check back later for more content.
              </p>
            </div>
          </div>
        );
      
      case 'live':
      default:
        /* LAN streams arrive over WebRTC on the local network, not a CDN URL. */
        if (isLan) {
          if (lanEnded) {
            return (
              <div className="relative aspect-video flex items-center justify-center overflow-hidden bg-black">
                <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(60% 80% at 50% 30%, hsl(252 30% 30% / 0.6), transparent 70%)' }} />
                <div className="relative text-center p-4">
                  <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/5">
                    <WifiOff className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="font-display text-xl font-bold text-white mb-1">The host ended the stream</p>
                  <p className="text-sm text-white/50">Check back later for more content.</p>
                </div>
              </div>
            );
          }

          return (
            <div className="relative aspect-video bg-black">
              <video
                ref={videoRef}
                className={`h-full w-full object-cover ${lanState === "connected" ? "" : "invisible"}`}
                playsInline
              />

              {lanState !== "connected" && (
                <div className="absolute inset-0 grid place-items-center overflow-hidden">
                  <div className="absolute inset-0 opacity-30" style={{ background: 'linear-gradient(120deg, hsl(var(--stream-h) / 0.35), hsl(252 60% 8%) 70%)' }} />
                  <div className="relative text-center p-6">
                    {lanState === "ready" ? (
                      <>
                        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-emerald-400/30 bg-emerald-400/10">
                          <Radio className="h-6 w-6 text-emerald-300" />
                        </div>
                        <p className="font-display text-xl font-bold text-white mb-1">Stream found on this network</p>
                        <p className="mb-6 text-sm text-white/50">
                          The host is broadcasting over your local network.
                        </p>
                        <Button variant="glow" size="lg" onClick={handleLanConnect}>
                          <Radio size={16} />
                          Connect to stream
                        </Button>
                        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.25em] text-white/35">
                          Peer-to-peer · no internet needed
                        </p>
                      </>
                    ) : lanState === "connecting" ? (
                      <>
                        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
                          <div className="h-6 w-6 rounded-full border-2 border-emerald-300/80 border-t-transparent animate-spin" />
                        </div>
                        <p className="font-mono text-xs uppercase tracking-[0.25em] text-white/60">
                          Linking peer-to-peer…
                        </p>
                      </>
                    ) : lanState === "failed" ? (
                      <>
                        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-red-500/10 text-red-400">
                          <WifiOff className="h-6 w-6" />
                        </div>
                        <p className="font-display text-xl font-bold text-white mb-1">Connection failed</p>
                        <p className="mb-6 text-sm text-white/50">
                          Make sure you and the host are on the same network.
                        </p>
                        <Button variant="glass" onClick={handleLanConnect}>
                          <Wifi size={15} />
                          Try again
                        </Button>
                      </>
                    ) : (
                      /* waiting */
                      <>
                        <div className="relative mx-auto mb-5 grid h-16 w-16 place-items-center">
                          <span className="absolute inline-flex h-full w-full rounded-full border border-emerald-300/40 opacity-60 animate-ping" />
                          <span className="absolute inline-flex h-10 w-10 rounded-full border border-emerald-300/60" />
                          <Radio className="h-6 w-6 text-emerald-300" />
                        </div>
                        <p className="font-display text-xl font-bold text-white mb-1">Scanning this network…</p>
                        <p className="text-sm text-white/50">
                          Waiting for the host to start broadcasting on this network.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {lanState === "connected" && (
                <>
                  <div className="absolute left-4 top-4 flex gap-2">
                    <div className="live-indicator">LIVE</div>
                    <div className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-black/50 px-2.5 py-1 font-mono text-[10px] tracking-wider text-emerald-300 backdrop-blur-md">
                      <Radio size={11} />
                      LAN
                    </div>
                  </div>
                  {lanSoundBlocked && (
                    <button
                      onClick={handleLanUnmute}
                      className="absolute bottom-16 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-black/70 px-4 py-2 text-xs text-white backdrop-blur-md transition-colors hover:bg-black/50"
                    >
                      <VolumeX size={14} />
                      Tap to enable sound
                    </button>
                  )}
                </>
              )}
            </div>
          );
        }

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
      className={`relative overflow-hidden bg-black border border-white/10 ${className}`}
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
        <div className="absolute top-4 right-4 rounded-lg border border-white/10 bg-black/60 px-3 py-2 font-mono text-[11px] tracking-wider text-white backdrop-blur-md">
          <div className="flex items-center gap-1.5 mb-1">
            <Gauge size={12} className="text-[hsl(var(--accent-mid))]" />
            <span>{bandwidth ? `${(bandwidth / 1000).toFixed(1)} Mbps` : '-- Mbps'}</span>
          </div>
          <div className="flex gap-2 text-white/70">
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
