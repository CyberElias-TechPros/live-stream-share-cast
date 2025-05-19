import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { streamService } from "@/services/streamService";
import { liveStreamService } from "@/services/liveStreamService";
import { Stream, StreamStatus, StreamSettings, ChatMessage } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { chatService } from "@/services/chatService";
import { useToast } from "@/hooks/use-toast";

interface StreamContextType {
  status: StreamStatus;
  viewerCount: number;
  localStream: MediaStream | null;
  isRecording: boolean;
  streamSettings: StreamSettings;
  activeStream: Stream | null;
  isLocalStream: boolean;
  joinStream: (streamId: string) => Promise<void>;
  leaveStream: () => void;
  startStream: (streamId: string) => Promise<void>;
  stopStream: () => Promise<void>;
  updateStreamSettings: (settings: Partial<StreamSettings>) => void;
  sendChatMessage: (message: string) => Promise<void>;
  toggleRecording: () => void;
  downloadRecording: (filename?: string) => void;
  browserSupport: {
    supported: boolean;
    features: Record<string, boolean>;
  };
}

const StreamContext = createContext<StreamContextType | undefined>(undefined);

export function StreamProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [viewerCount, setViewerCount] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [activeStream, setActiveStream] = useState<Stream | null>(null);
  const [streamSettings, setStreamSettings] = useState<StreamSettings>(
    streamService.getSettings()
  );
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  
  const browserSupport = streamService.checkBrowserSupport();
  
  // Initialize stream service event listeners
  useEffect(() => {
    const handleStatusChange = (newStatus: StreamStatus) => {
      setStatus(newStatus);
    };
    
    const handleStreamStarted = (stream: MediaStream) => {
      setLocalStream(stream);
    };
    
    const handleStreamEnded = () => {
      setLocalStream(null);
    };
    
    const handleRecordingStarted = () => {
      setIsRecording(true);
    };
    
    const handleRecordingStopped = () => {
      setIsRecording(false);
    };
    
    const handleRecordingSaved = (data: any) => {
      toast({
        title: "Recording Saved",
        description: `Recording saved as ${data.filename}`,
      });
    };
    
    const handleStats = (stats: any) => {
      if (activeStream && activeStream.id) {
        // Update viewer count locally for immediate feedback
        setViewerCount(stats.viewerCount || 0);
      }
    };
    
    // Subscribe to events
    streamService.on("statusChange", handleStatusChange);
    streamService.on("streamStarted", handleStreamStarted);
    streamService.on("streamEnded", handleStreamEnded);
    streamService.on("recordingStarted", handleRecordingStarted);
    streamService.on("recordingStopped", handleRecordingStopped);
    streamService.on("recordingSaved", handleRecordingSaved);
    streamService.on("stats", handleStats);
    
    // Unsubscribe from events on cleanup
    return () => {
      streamService.off("statusChange", handleStatusChange);
      streamService.off("streamStarted", handleStreamStarted);
      streamService.off("streamEnded", handleStreamEnded);
      streamService.off("recordingStarted", handleRecordingStarted);
      streamService.off("recordingStopped", handleRecordingStopped);
      streamService.off("recordingSaved", handleRecordingSaved);
      streamService.off("stats", handleStats);
    };
  }, [activeStream, toast]);
  
  // Use user preferences for stream settings when available
  useEffect(() => {
    if (isAuthenticated && user?.preferences?.streaming) {
      const userSettings = user.preferences.streaming;
      
      updateStreamSettings({
        streaming: {
          codec: streamSettings.streaming.codec,
          bitrate: streamSettings.streaming.bitrate,
          keyFrameInterval: streamSettings.streaming.keyFrameInterval,
          isLocalStream: userSettings.defaultStreamType === 'local',
          streamType: userSettings.defaultStreamType || 'internet',
          recordStream: userSettings.autoRecord || false,
          recordingRetentionHours: userSettings.recordingRetentionHours || 6,
          localSave: true, // Default to local saving
          autoDeleteRecordings: userSettings.autoDeleteRecordings || false
        }
      });
    }
  }, [isAuthenticated, user]);
  
  const joinStream = async (streamId: string) => {
    try {
      // Get stream details
      const stream = await liveStreamService.getStreamById(streamId);
      
      if (!stream) {
        throw new Error("Stream not found");
      }
      
      setActiveStream(stream);
      streamService.setActiveStream(stream);
      
      if (stream.isLive) {
        // Connect to the stream
        const streamType = stream.streamType || 'internet';
        await streamService.connectToStream(streamId, streamType);
        
        // Update viewer count
        const currentCount = stream.viewerCount || 0;
        await liveStreamService.updateStreamViewCount(streamId, currentCount + 1);
        setViewerCount(currentCount + 1);
      }
    } catch (error) {
      console.error("Error joining stream:", error);
      setStatus("error");
    }
  };
  
  const leaveStream = () => {
    if (activeStream && activeStream.isLive) {
      // Update viewer count on leave
      const currentCount = activeStream.viewerCount || 0;
      if (currentCount > 0) {
        liveStreamService.updateStreamViewCount(activeStream.id, currentCount - 1)
          .catch(err => console.error("Error updating viewer count:", err));
      }
    }
    
    setActiveStream(null);
    streamService.setActiveStream(null);
    setLocalStream(null);
    setStatus("idle");
  };
  
  const startStream = async (streamId: string) => {
    try {
      // Start local media stream
      const mediaStream = await streamService.getMediaStream();
      setLocalStream(mediaStream);
      
      // Get stream details
      const stream = await liveStreamService.getStreamById(streamId);
      
      if (!stream) {
        throw new Error("Stream not found");
      }
      
      // Start stream in the database
      await liveStreamService.startStream(streamId, streamSettings.streaming.recordStream);
      
      // Set active stream
      const updatedStream = await liveStreamService.getStreamById(streamId);
      if (updatedStream) {
        setActiveStream(updatedStream);
        streamService.setActiveStream(updatedStream);
      }
      
      // Start recording if enabled
      if (streamSettings.streaming.recordStream) {
        streamService.startRecording(streamSettings.streaming.localSave);
      }
      
      toast({
        title: "Stream Started",
        description: "Your stream is now live!",
      });
    } catch (error) {
      console.error("Error starting stream:", error);
      setStatus("error");
      
      toast({
        title: "Stream Error",
        description: "Failed to start streaming. Please check your camera and microphone permissions.",
        variant: "destructive"
      });
    }
  };
  
  const stopStream = async () => {
    try {
      if (!activeStream) {
        return;
      }
      
      // Stop recording if active
      if (isRecording) {
        toggleRecording();
      }
      
      // Stop stream in the database
      await liveStreamService.stopStream(activeStream.id);
      
      // Stop local media stream
      streamService.stopStream();
      
      // Clear active stream
      setActiveStream(null);
      streamService.setActiveStream(null);
      
      toast({
        title: "Stream Ended",
        description: "Your stream has been ended",
      });
    } catch (error) {
      console.error("Error stopping stream:", error);
      
      toast({
        title: "Error",
        description: "Failed to stop stream",
        variant: "destructive"
      });
    }
  };
  
  const updateStreamSettings = (settings: Partial<StreamSettings>) => {
    const newSettings = {
      ...streamSettings,
      ...settings,
      audio: {
        ...streamSettings.audio,
        ...settings.audio
      },
      video: {
        ...streamSettings.video,
        ...settings.video
      },
      streaming: {
        ...streamSettings.streaming,
        ...settings.streaming
      }
    };
    
    setStreamSettings(newSettings);
    streamService.updateSettings(newSettings);
  };
  
  const sendChatMessage = async (message: string) => {
    if (!activeStream || !isAuthenticated || !user) {
      console.error("Cannot send message - no active stream or not authenticated");
      return;
    }
    
    try {
      await chatService.sendChatMessage({
        streamId: activeStream.id,
        userId: user.id,
        username: user.username,
        userAvatar: user.avatar,
        message,
        type: "text"
      });
    } catch (error) {
      console.error("Error sending chat message:", error);
      throw error;
    }
  };
  
  const toggleRecording = () => {
    if (isRecording) {
      streamService.stopRecording();
    } else {
      if (!localStream) {
        toast({
          title: "Error",
          description: "Cannot start recording without an active stream",
          variant: "destructive"
        });
        return;
      }
      
      streamService.startRecording(streamSettings.streaming.localSave);
      
      toast({
        title: "Recording Started",
        description: streamSettings.streaming.localSave 
          ? "Recording will be saved to your device" 
          : "Recording will be saved to the cloud"
      });
    }
  };
  
  const downloadRecording = (filename?: string) => {
    if (!isRecording) {
      toast({
        title: "No Recording",
        description: "There is no active recording to download",
        variant: "destructive"
      });
      return;
    }
    
    try {
      const defaultName = `stream-recording-${new Date().toISOString().replace(/:/g, '-')}.webm`;
      streamService.downloadRecording(filename || defaultName);
      
      toast({
        title: "Recording Downloaded",
        description: "Your recording has been downloaded"
      });
    } catch (error) {
      console.error("Error downloading recording:", error);
      
      toast({
        title: "Download Failed",
        description: "Failed to download recording",
        variant: "destructive"
      });
    }
  };
  
  return (
    <StreamContext.Provider
      value={{
        status,
        viewerCount,
        localStream,
        isRecording,
        streamSettings,
        activeStream,
        isLocalStream: streamSettings.streaming.streamType === 'local',
        joinStream,
        leaveStream,
        startStream,
        stopStream,
        updateStreamSettings,
        sendChatMessage,
        toggleRecording,
        downloadRecording,
        browserSupport
      }}
    >
      {children}
    </StreamContext.Provider>
  );
}

export function useStream() {
  const context = useContext(StreamContext);
  if (context === undefined) {
    throw new Error("useStream must be used within a StreamProvider");
  }
  return context;
}
