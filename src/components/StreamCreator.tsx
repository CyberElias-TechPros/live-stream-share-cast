
import { useState, useRef, useEffect } from "react";
import { useStream } from "@/contexts/StreamContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Camera, 
  CameraOff, 
  Mic, 
  MicOff, 
  Share, 
  Copy, 
  CircleDot, 
  StopCircle, 
  Download,
  Loader,
  Signal,
  UserRound,
  Video,
  VideoOff
} from "lucide-react";
import { StreamStatus } from "@/types";
import { streamService } from "@/services/streamService";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function StreamCreator() {
  const { 
    settings, 
    updateSettings, 
    startStream, 
    stopStream, 
    status,
    startRecording, 
    stopRecording, 
    downloadRecording
  } = useStream();

  const { user } = useAuth();
  const { toast } = useToast();
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [streamUrl, setStreamUrl] = useState("");
  const [viewerCount, setViewerCount] = useState(0);
  const [bandwidth, setBandwidth] = useState(0);
  
  // Stream stats
  useEffect(() => {
    const handleStats = (stats: any) => {
      if (stats.viewerCount) {
        setViewerCount(stats.viewerCount);
      }
      if (stats.bandwidth) {
        setBandwidth(stats.bandwidth);
      }
    };
    
    streamService.on('stats', handleStats);
    
    return () => {
      streamService.off('stats', handleStats);
    };
  }, []);
  
  // Get available media devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        // Request permission to access media devices
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        const videoInputs = devices.filter(device => device.kind === 'videoinput');
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        
        setVideoDevices(videoInputs);
        setAudioDevices(audioInputs);
      } catch (error) {
        console.error("Error accessing media devices:", error);
        toast({
          title: "Device Access Error",
          description: "Could not access camera or microphone. Please check your permissions.",
          variant: "destructive"
        });
      }
    };
    
    getDevices();
  }, []);
  
  const handleStartStream = async () => {
    if (!title.trim()) {
      toast({
        title: "Stream Title Required",
        description: "Please enter a title for your stream.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      // Ensure user is a streamer
      if (user && !user.isStreamer) {
        const { error } = await supabase
          .from('profiles')
          .update({ is_streamer: true })
          .eq('id', user.id);
          
        if (error) throw error;
      }
      
      // Start the stream
      const stream = await startStream(title, description);
      
      // Attach the stream to the video element
      if (videoRef.current) {
        streamService.attachStreamToVideo(videoRef.current);
      }
      
      setIsStreaming(true);
      setStreamUrl(window.location.origin + "/watch/" + stream.id);
      
      // Create a stream record in the database
      if (user) {
        const { error } = await supabase.from('streams').insert([
          {
            id: stream.id,
            user_id: user.id,
            title: stream.title,
            description: stream.description,
            stream_key: stream.streamKey,
            is_live: true,
            started_at: new Date().toISOString(),
            viewer_count: 0,
            tags: []
          }
        ]);
        
        if (error) {
          console.error("Error saving stream to database:", error);
        }
      }
      
      toast({
        title: "Stream Started",
        description: "Your stream is now live!",
      });
    } catch (error: any) {
      console.error("Failed to start stream:", error);
      toast({
        title: "Stream Start Failed",
        description: error.message || "Failed to start stream. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  const handleStopStream = async () => {
    try {
      stopStream();
      setIsStreaming(false);
      
      if (isRecording) {
        stopRecording();
        setIsRecording(false);
      }
      
      // Update the stream record in the database
      if (user) {
        const { error } = await supabase.from('streams').update({
          is_live: false,
          ended_at: new Date().toISOString()
        }).eq('user_id', user.id).eq('is_live', true);
        
        if (error) {
          console.error("Error updating stream status in database:", error);
        }
      }
      
      toast({
        title: "Stream Ended",
        description: "Your stream has ended successfully.",
      });
    } catch (error: any) {
      console.error("Failed to stop stream:", error);
      toast({
        title: "Stream End Failed",
        description: error.message || "Failed to end stream. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  const handleToggleCamera = () => {
    updateSettings({
      video: {
        ...settings.video,
        enabled: !settings.video.enabled
      }
    });
  };
  
  const handleToggleMicrophone = () => {
    updateSettings({
      audio: {
        ...settings.audio,
        enabled: !settings.audio.enabled
      }
    });
  };
  
  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
      setIsRecording(false);
      toast({
        title: "Recording Stopped",
        description: "Your stream recording has been stopped.",
      });
    } else {
      startRecording();
      setIsRecording(true);
      toast({
        title: "Recording Started",
        description: "Your stream is now being recorded.",
      });
      
      // Update the stream record in the database
      if (user) {
        supabase.from('streams').update({
          is_recording: true
        }).eq('user_id', user.id).eq('is_live', true).then(({ error }) => {
          if (error) {
            console.error("Error updating recording status in database:", error);
          }
        });
      }
    }
  };
  
  const handleVideoDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateSettings({
      video: {
        ...settings.video,
        deviceId: e.target.value
      }
    });
  };
  
  const handleAudioDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateSettings({
      audio: {
        ...settings.audio,
        deviceId: e.target.value
      }
    });
  };
  
  const handleQualityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const quality = e.target.value;
    
    switch(quality) {
      case "high":
        updateSettings({
          video: {
            ...settings.video,
            width: 1920,
            height: 1080,
            frameRate: 30
          },
          streaming: {
            ...settings.streaming,
            bitrate: 5000000 // 5 Mbps
          }
        });
        break;
      case "medium":
        updateSettings({
          video: {
            ...settings.video,
            width: 1280,
            height: 720,
            frameRate: 30
          },
          streaming: {
            ...settings.streaming,
            bitrate: 2500000 // 2.5 Mbps
          }
        });
        break;
      case "low":
        updateSettings({
          video: {
            ...settings.video,
            width: 854,
            height: 480,
            frameRate: 24
          },
          streaming: {
            ...settings.streaming,
            bitrate: 1000000 // 1 Mbps
          }
        });
        break;
    }
  };
  
  const handleCopyStreamUrl = () => {
    navigator.clipboard.writeText(streamUrl);
    toast({
      title: "URL Copied",
      description: "Stream URL copied to clipboard.",
    });
  };
  
  const handleDownloadRecording = () => {
    downloadRecording(`${title || 'stream'}-${new Date().toISOString()}.webm`);
    toast({
      title: "Download Started",
      description: "Your recording download has started.",
    });
  };
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Video Preview and Controls */}
      <div className="space-y-4">
        <div className="aspect-video bg-muted/30 relative rounded-lg overflow-hidden border border-border">
          {status === 'idle' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Video className="h-16 w-16 mx-auto text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">Camera preview will appear here</p>
              </div>
            </div>
          )}
          
          {status === 'connecting' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader className="h-8 w-8 animate-spin text-stream" />
              <p className="ml-2">Connecting...</p>
            </div>
          )}
          
          {status === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-destructive">
                <VideoOff className="h-16 w-16 mx-auto" />
                <p className="mt-2">Failed to connect to camera</p>
              </div>
            </div>
          )}
          
          <video 
            ref={videoRef} 
            className={`w-full h-full object-cover ${status !== 'live' ? 'hidden' : ''}`}
            muted 
            playsInline
          />
          
          {isStreaming && (
            <div className="absolute top-2 left-2">
              <div className="bg-red-500 text-white px-2 py-1 rounded-md flex items-center">
                <CircleDot className="h-4 w-4 mr-1" />
                LIVE
              </div>
            </div>
          )}
          
          {isRecording && (
            <div className="absolute top-2 right-2">
              <div className="bg-red-500 text-white px-2 py-1 rounded-md flex items-center">
                <CircleDot className="h-4 w-4 mr-1" />
                REC
              </div>
            </div>
          )}
        </div>
        
        {/* Stream Stats */}
        {isStreaming && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-card p-3 rounded-lg border border-border">
              <div className="flex items-center text-sm">
                <UserRound className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="font-medium">{viewerCount}</span>
                <span className="ml-1 text-muted-foreground">Viewers</span>
              </div>
            </div>
            
            <div className="bg-card p-3 rounded-lg border border-border">
              <div className="flex items-center text-sm">
                <Signal className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="font-medium">{(bandwidth / 1000).toFixed(1)}</span>
                <span className="ml-1 text-muted-foreground">Mbps</span>
              </div>
            </div>
          </div>
        )}
        
        {/* Stream Controls */}
        <div className="flex flex-wrap gap-2">
          <Button 
            type="button" 
            variant={settings.video.enabled ? "default" : "outline"}
            size="icon"
            onClick={handleToggleCamera}
          >
            {settings.video.enabled ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
          </Button>
          
          <Button 
            type="button" 
            variant={settings.audio.enabled ? "default" : "outline"}
            size="icon"
            onClick={handleToggleMicrophone}
          >
            {settings.audio.enabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </Button>
          
          {isStreaming ? (
            <Button 
              type="button" 
              variant="destructive"
              className="ml-auto"
              onClick={handleStopStream}
            >
              <StopCircle className="h-5 w-5 mr-2" />
              End Stream
            </Button>
          ) : (
            <Button 
              type="button" 
              variant="default"
              className="ml-auto"
              onClick={handleStartStream}
              disabled={status === 'connecting'}
            >
              <CircleDot className="h-5 w-5 mr-2" />
              Start Stream
            </Button>
          )}
          
          {isStreaming && (
            <Button 
              type="button" 
              variant={isRecording ? "destructive" : "outline"}
              onClick={handleToggleRecording}
            >
              {isRecording ? (
                <>
                  <StopCircle className="h-5 w-5 mr-2" />
                  Stop Recording
                </>
              ) : (
                <>
                  <CircleDot className="h-5 w-5 mr-2" />
                  Record
                </>
              )}
            </Button>
          )}
        </div>
        
        {/* Stream URL Share */}
        {isStreaming && (
          <div className="bg-card p-4 rounded-lg border border-border">
            <Label>Stream URL</Label>
            <div className="flex mt-2">
              <Input value={streamUrl} readOnly className="rounded-r-none" />
              <Button 
                type="button" 
                variant="secondary" 
                className="rounded-l-none"
                onClick={handleCopyStreamUrl}
              >
                <Copy className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="mt-3 flex space-x-2">
              <Button 
                type="button" 
                className="flex-1"
                onClick={() => window.open(streamUrl, '_blank')}
              >
                <Share className="h-5 w-5 mr-2" />
                Open Stream
              </Button>
              
              {isRecording && (
                <Button 
                  type="button" 
                  variant="outline"
                  className="flex-1"
                  onClick={handleDownloadRecording}
                >
                  <Download className="h-5 w-5 mr-2" />
                  Download
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Stream Settings Form */}
      <div className="space-y-4">
        <div className="bg-card p-4 rounded-lg border border-border">
          <h3 className="text-lg font-medium mb-4">Stream Details</h3>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter your stream title"
                disabled={isStreaming}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your stream (optional)"
                disabled={isStreaming}
              />
            </div>
          </div>
        </div>
        
        <div className="bg-card p-4 rounded-lg border border-border">
          <h3 className="text-lg font-medium mb-4">Stream Settings</h3>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="video-quality">Quality</Label>
              <select
                id="video-quality"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                onChange={handleQualityChange}
                disabled={isStreaming}
              >
                <option value="high">High (1080p)</option>
                <option value="medium" selected>Medium (720p)</option>
                <option value="low">Low (480p)</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="video-device">Camera</Label>
              <select
                id="video-device"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                onChange={handleVideoDeviceChange}
                disabled={isStreaming}
              >
                {videoDevices.length === 0 && (
                  <option value="">No cameras available</option>
                )}
                {videoDevices.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${device.deviceId.slice(0, 5)}...`}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="audio-device">Microphone</Label>
              <select
                id="audio-device"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                onChange={handleAudioDeviceChange}
                disabled={isStreaming}
              >
                {audioDevices.length === 0 && (
                  <option value="">No microphones available</option>
                )}
                {audioDevices.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                id="echo-cancellation"
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={settings.audio.echoCancellation}
                onChange={(e) => updateSettings({
                  audio: {
                    ...settings.audio,
                    echoCancellation: e.target.checked
                  }
                })}
                disabled={isStreaming}
              />
              <Label htmlFor="echo-cancellation">Echo Cancellation</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                id="noise-suppression"
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={settings.audio.noiseSuppression}
                onChange={(e) => updateSettings({
                  audio: {
                    ...settings.audio,
                    noiseSuppression: e.target.checked
                  }
                })}
                disabled={isStreaming}
              />
              <Label htmlFor="noise-suppression">Noise Suppression</Label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
