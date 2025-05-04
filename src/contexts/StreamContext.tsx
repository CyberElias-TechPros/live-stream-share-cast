
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Stream, StreamStatus, StreamSettings, StreamStats } from '@/types';
import { streamService } from '@/services/streamService';

interface StreamContextType {
  currentStream: Stream | null;
  streams: Stream[];
  isLoading: boolean;
  error: string | null;
  status: StreamStatus;
  stats: StreamStats | null;
  settings: StreamSettings;
  viewerCount: number;
  updateSettings: (settings: Partial<StreamSettings>) => void;
  startStream: (title: string, description?: string) => Promise<Stream>;
  stopStream: () => void;
  joinStream: (streamId: string) => Promise<void>;
  leaveStream: () => void;
  sendChatMessage: (message: string) => void;
  startRecording: () => void;
  stopRecording: () => Blob | null;
  downloadRecording: (filename: string) => void;
}

const defaultSettings: StreamSettings = {
  audio: {
    enabled: true,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  },
  video: {
    enabled: true,
    width: 1280,
    height: 720,
    frameRate: 30
  },
  streaming: {
    codec: 'VP8',
    bitrate: 2500000, // 2.5 Mbps
    keyFrameInterval: 120,
    isLocalStream: false,
    recordStream: false
  }
};

const StreamContext = createContext<StreamContextType | undefined>(undefined);

export function StreamProvider({ children }: { children: ReactNode }) {
  const [currentStream, setCurrentStream] = useState<Stream | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [stats, setStats] = useState<StreamStats | null>(null);
  const [settings, setSettings] = useState<StreamSettings>(defaultSettings);
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    // Listen for stream service events
    const handleStatusChange = (newStatus: StreamStatus) => {
      setStatus(newStatus);
    };

    const handleError = (err: any) => {
      setError(err.message || 'An error occurred');
    };

    const handleStats = (newStats: StreamStats) => {
      setStats(newStats);
      if (newStats.viewerCount !== undefined) {
        setViewerCount(newStats.viewerCount);
      }
    };

    streamService.on('statusChange', handleStatusChange);
    streamService.on('error', handleError);
    streamService.on('stats', handleStats);

    // Clean up event listeners
    return () => {
      streamService.off('statusChange', handleStatusChange);
      streamService.off('error', handleError);
      streamService.off('stats', handleStats);
    };
  }, []);

  const updateSettings = (newSettings: Partial<StreamSettings>) => {
    const updatedSettings = {
      ...settings,
      ...newSettings,
      audio: {
        ...settings.audio,
        ...(newSettings.audio || {})
      },
      video: {
        ...settings.video,
        ...(newSettings.video || {})
      },
      streaming: {
        ...settings.streaming,
        ...(newSettings.streaming || {})
      }
    };
    
    setSettings(updatedSettings);
    streamService.updateSettings(updatedSettings);
  };

  const startStream = async (title: string, description?: string): Promise<Stream> => {
    try {
      setIsLoading(true);
      setError(null);
      
      await streamService.getMediaStream();
      
      // In a real app, we would make an API call to create the stream record
      const newStream: Stream = {
        id: crypto.randomUUID(),
        title,
        description,
        isLive: true,
        streamKey: crypto.randomUUID(),
        createdAt: new Date(),
        viewerCount: 0,
        isRecording: false,
        isLocalStream: settings.streaming.isLocalStream,
        userId: 'current-user', // Would come from auth context
        startedAt: new Date(),
        bandwidth: 0,
        tags: []
      };
      
      setCurrentStream(newStream);
      setStreams(prev => [newStream, ...prev]);
      
      return newStream;
    } catch (err: any) {
      setError(err.message || 'Failed to start stream');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const stopStream = () => {
    streamService.stopStream();
    
    if (currentStream) {
      // Update the stream to reflect it's no longer live
      const updatedStream = {
        ...currentStream,
        isLive: false,
        endedAt: new Date()
      };
      
      setCurrentStream(null);
      setStreams(prev => prev.map(stream => 
        stream.id === updatedStream.id ? updatedStream : stream
      ));
      
      // In a real app, we would make an API call to update the stream record
    }
  };

  const joinStream = async (streamId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // In a real app, we would fetch the stream data from the API
      const foundStream = streams.find(s => s.id === streamId);
      
      if (!foundStream) {
        throw new Error('Stream not found');
      }
      
      await streamService.connectToStream(streamId);
      setCurrentStream(foundStream);
    } catch (err: any) {
      setError(err.message || 'Failed to join stream');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const leaveStream = () => {
    streamService.stopStream();
    setCurrentStream(null);
  };

  const sendChatMessage = (message: string) => {
    if (!currentStream) {
      setError('Not connected to a stream');
      return;
    }
    
    // In a real app, we would send this to a WebSocket or data channel
    console.log(`Sending message to stream ${currentStream.id}: ${message}`);
  };

  const startRecording = () => {
    streamService.startRecording();
    
    if (currentStream) {
      setCurrentStream({
        ...currentStream,
        isRecording: true
      });
    }
  };

  const stopRecording = () => {
    const recordingBlob = streamService.stopRecording();
    
    if (currentStream) {
      setCurrentStream({
        ...currentStream,
        isRecording: false
      });
    }
    
    return recordingBlob;
  };

  const downloadRecording = (filename: string) => {
    streamService.downloadRecording(filename);
  };

  const value = {
    currentStream,
    streams,
    isLoading,
    error,
    status,
    stats,
    settings,
    viewerCount,
    updateSettings,
    startStream,
    stopStream,
    joinStream,
    leaveStream,
    sendChatMessage,
    startRecording,
    stopRecording,
    downloadRecording
  };

  return (
    <StreamContext.Provider value={value}>
      {children}
    </StreamContext.Provider>
  );
}

export function useStream() {
  const context = useContext(StreamContext);
  
  if (context === undefined) {
    throw new Error('useStream must be used within a StreamProvider');
  }
  
  return context;
}
