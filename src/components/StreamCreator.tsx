
import { useState, useRef, useEffect } from "react";
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
  Record, 
  StopCircle, 
  Download,
  Loader
} from "lucide-react";
import { StreamStatus } from "@/types";
import { streamService } from "@/services/streamService";
import { useToast } from "@/hooks/use-toast";

export default function StreamCreator() {
  const [streamTitle, setStreamTitle] = useState("My Stream");
  const [streamDescription, setStreamDescription] = useState("");
  const [isLocalStream, setIsLocalStream] = useState(true);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("idle");
  const [shareableLink, setShareableLink] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState("");
  const [selectedAudioDevice, setSelectedAudioDevice] = useState("");
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const { toast } = useToast();
  
  useEffect(() => {
    // Get available media devices
    async function getDevices() {
      try {
        // We need to request permissions first to get device labels
        const initialStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        initialStream.getTracks().forEach(track => track.stop());
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        const videoDevices = devices.filter(device => device.kind === "videoinput");
        const audioDevices = devices.filter(device => device.kind === "audioinput");
        
        setVideoDevices(videoDevices);
        setAudioDevices(audioDevices);
        
        if (videoDevices.length > 0) {
          setSelectedVideoDevice(videoDevices[0].deviceId);
        }
        
        if (audioDevices.length > 0) {
          setSelectedAudioDevice(audioDevices[0].deviceId);
        }
      } catch (error) {
        console.error("Error enumerating devices:", error);
        toast({
          title: "Permission Error",
          description: "Please allow camera and microphone access to use this feature.",
          variant: "destructive"
        });
      }
    }
    
    getDevices();
    
    // Listen for stream status changes
    streamService.addEventListener("statusChange", (status: StreamStatus) => {
      setStreamStatus(status);
    });
    
    streamService.addEventListener("error", (error: any) => {
      toast({
        title: "Streaming Error",
        description: error.message || "An error occurred while streaming",
        variant: "destructive"
      });
    });
    
    streamService.addEventListener("recordingStarted", () => {
      setIsRecording(true);
      toast({
        title: "Recording Started",
        description: "Your stream is now being recorded"
      });
    });
    
    streamService.addEventListener("recordingStopped", () => {
      setIsRecording(false);
    });
    
    return () => {
      // Clean up
      if (streamStatus === "live") {
        streamService.stopStream();
      }
    };
  }, [toast]);
  
  const startStream = async () => {
    try {
      const constraints: MediaStreamConstraints = {
        video: isVideoEnabled ? { deviceId: selectedVideoDevice ? { exact: selectedVideoDevice } : undefined } : false,
        audio: isAudioEnabled ? { deviceId: selectedAudioDevice ? { exact: selectedAudioDevice } : undefined } : false
      };
      
      const stream = await streamService.getMediaStream(constraints);
      
      if (videoRef.current) {
        streamService.attachStreamToVideo(videoRef.current);
      }
      
      const link = streamService.generateShareableLink();
      setShareableLink(link);
      
      toast({
        title: "Stream Started",
        description: "Your stream is now live"
      });
    } catch (error: any) {
      toast({
        title: "Error Starting Stream",
        description: error.message || "Failed to start stream",
        variant: "destructive"
      });
    }
  };
  
  const stopStream = () => {
    if (isRecording) {
      stopRecording();
    }
    
    streamService.stopStream();
    setShareableLink("");
    
    toast({
      title: "Stream Ended",
      description: "Your stream has been stopped"
    });
  };
  
  const toggleRecording = () => {
    if (!isRecording) {
      streamService.startRecording();
    } else {
      stopRecording();
    }
  };
  
  const stopRecording = () => {
    const recordingBlob = streamService.stopRecording();
    setIsRecording(false);
    
    if (recordingBlob) {
      toast({
        title: "Recording Stopped",
        description: "Your recording is ready for download"
      });
    }
  };
  
  const downloadRecording = () => {
    const filename = `${streamTitle.replace(/\s+/g, '_')}_${new Date().toISOString()}.webm`;
    streamService.downloadRecording(filename);
    
    toast({
      title: "Download Started",
      description: "Your recording is being downloaded"
    });
  };
  
  const copyShareableLink = () => {
    navigator.clipboard.writeText(shareableLink);
    
    toast({
      title: "Link Copied",
      description: "Shareable link copied to clipboard"
    });
  };
  
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <div className="rounded-lg overflow-hidden bg-black border border-border relative">
          {streamStatus === "idle" ? (
            <div className="aspect-video flex items-center justify-center bg-muted/30">
              <div className="text-center p-6">
                <Camera size={48} className="mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl font-medium mb-2">Ready to Stream</h3>
                <p className="text-muted-foreground">
                  Configure your stream settings and click "Start Streaming" to begin
                </p>
              </div>
            </div>
          ) : streamStatus === "connecting" ? (
            <div className="aspect-video flex items-center justify-center bg-muted/30">
              <div className="text-center p-6">
                <Loader size={48} className="mx-auto mb-4 text-stream animate-spin" />
                <h3 className="text-xl font-medium mb-2">Connecting...</h3>
                <p className="text-muted-foreground">
                  Initializing your camera and microphone
                </p>
              </div>
            </div>
          ) : (
            <div className="aspect-video bg-black">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                muted
                playsInline
              />
              
              {streamStatus === "live" && (
                <div className="absolute top-4 left-4 flex gap-2">
                  <div className="live-indicator">LIVE</div>
                  <div className="viewer-count">
                    <Users size={16} />
                    <span>0</span>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Stream Controls */}
          {streamStatus === "live" && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-3 bg-black/60 p-2 rounded-full stream-controls">
              <Button
                variant="ghost"
                size="icon"
                className="stream-button"
                onClick={() => setIsVideoEnabled(!isVideoEnabled)}
              >
                {isVideoEnabled ? <Camera size={20} /> : <CameraOff size={20} />}
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                className="stream-button"
                onClick={() => setIsAudioEnabled(!isAudioEnabled)}
              >
                {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                className="stream-button"
                onClick={toggleRecording}
              >
                {isRecording ? <StopCircle size={20} className="text-red-500" /> : <Record size={20} />}
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                className="stream-button"
                onClick={stopStream}
              >
                <StopCircle size={20} />
              </Button>
            </div>
          )}
        </div>
        
        {/* Stream Information */}
        <div className="mt-6">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Stream Title</Label>
              <Input
                id="title"
                value={streamTitle}
                onChange={(e) => setStreamTitle(e.target.value)}
                placeholder="Enter a title for your stream"
                disabled={streamStatus === "live"}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={streamDescription}
                onChange={(e) => setStreamDescription(e.target.value)}
                placeholder="Describe your stream..."
                disabled={streamStatus === "live"}
              />
            </div>
          </div>
        </div>
      </div>
      
      <div>
        <div className="bg-card rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold mb-4">Stream Settings</h2>
          
          <div className="space-y-6">
            <div className="grid gap-2">
              <Label>Stream Type</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={isLocalStream ? "default" : "outline"}
                  className="justify-start"
                  onClick={() => setIsLocalStream(true)}
                  disabled={streamStatus === "live"}
                >
                  <Wifi className="mr-2 h-4 w-4" />
                  Local
                </Button>
                
                <Button
                  variant={!isLocalStream ? "default" : "outline"}
                  className="justify-start"
                  onClick={() => setIsLocalStream(false)}
                  disabled={streamStatus === "live"}
                >
                  <Share className="mr-2 h-4 w-4" />
                  Internet
                </Button>
              </div>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="video-device">Camera</Label>
              <select
                id="video-device"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedVideoDevice}
                onChange={(e) => setSelectedVideoDevice(e.target.value)}
                disabled={streamStatus === "live"}
              >
                {videoDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${videoDevices.indexOf(device) + 1}`}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="audio-device">Microphone</Label>
              <select
                id="audio-device"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedAudioDevice}
                onChange={(e) => setSelectedAudioDevice(e.target.value)}
                disabled={streamStatus === "live"}
              >
                {audioDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${audioDevices.indexOf(device) + 1}`}
                  </option>
                ))}
              </select>
            </div>
            
            {streamStatus !== "live" ? (
              <Button 
                className="w-full" 
                onClick={startStream}
                disabled={!isVideoEnabled && !isAudioEnabled}
              >
                Start Streaming
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>Share Your Stream</Label>
                  <div className="flex">
                    <Input value={shareableLink} readOnly className="rounded-r-none" />
                    <Button 
                      variant="secondary" 
                      className="rounded-l-none px-3" 
                      onClick={copyShareableLink}
                    >
                      <Copy size={16} />
                    </Button>
                  </div>
                </div>
                
                <Button 
                  className="w-full" 
                  variant="destructive" 
                  onClick={stopStream}
                >
                  End Stream
                </Button>
                
                {isRecording && (
                  <Button 
                    className="w-full" 
                    variant="outline" 
                    onClick={downloadRecording}
                  >
                    <Download className="mr-2 h-4 w-4" /> Download Recording
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
