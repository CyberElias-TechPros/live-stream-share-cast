
import { useState, useEffect, useCallback, useRef } from 'react';
import { streamService } from '@/services/streamService';
import { StreamStatus, StreamSettings } from '@/types';
import { useToast } from '@/hooks/use-toast';

export interface UseStreamManagerReturn {
  status: StreamStatus;
  mediaStream: MediaStream | null;
  isRecording: boolean;
  settings: StreamSettings;
  error: Error | null;
  
  // Actions
  startStream: () => Promise<void>;
  stopStream: () => void;
  updateSettings: (settings: StreamSettings) => void;
  startRecording: (saveLocally?: boolean) => void;
  stopRecording: () => void;
  downloadRecording: (filename: string) => void;
  
  // Utility
  checkBrowserSupport: () => ReturnType<typeof streamService.checkBrowserSupport>;
  cleanup: () => void;
}

export const useStreamManager = (): UseStreamManagerReturn => {
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [settings, setSettings] = useState<StreamSettings>(() => streamService.getSettings());
  const [error, setError] = useState<Error | null>(null);
  
  const { toast } = useToast();
  const cleanupRef = useRef<(() => void) | null>(null);

  // Event handlers
  const handleStreamStarted = useCallback((stream: MediaStream) => {
    setMediaStream(stream);
    setError(null);
    toast({
      title: "Stream Started",
      description: "Your stream is now live!",
    });
  }, [toast]);

  const handleStreamEnded = useCallback(() => {
    setMediaStream(null);
    setIsRecording(false);
  }, []);

  const handleStatusChange = useCallback((newStatus: StreamStatus) => {
    setStatus(newStatus);
  }, []);

  const handleError = useCallback((err: Error) => {
    setError(err);
    toast({
      title: "Stream Error",
      description: err.message,
      variant: "destructive",
    });
  }, [toast]);

  const handleRecordingStarted = useCallback(() => {
    setIsRecording(true);
    toast({
      title: "Recording Started",
      description: "Your stream is now being recorded.",
    });
  }, [toast]);

  const handleRecordingStopped = useCallback(() => {
    setIsRecording(false);
    toast({
      title: "Recording Stopped",
      description: "Recording has been saved.",
    });
  }, [toast]);

  const handleSettingsUpdated = useCallback((newSettings: StreamSettings) => {
    setSettings(newSettings);
  }, []);

  // Set up event listeners
  useEffect(() => {
    streamService.on('streamStarted', handleStreamStarted);
    streamService.on('streamEnded', handleStreamEnded);
    streamService.on('statusChange', handleStatusChange);
    streamService.on('error', handleError);
    streamService.on('recordingStarted', handleRecordingStarted);
    streamService.on('recordingStopped', handleRecordingStopped);
    streamService.on('settingsUpdated', handleSettingsUpdated);

    // Store cleanup function
    cleanupRef.current = () => {
      streamService.off('streamStarted', handleStreamStarted);
      streamService.off('streamEnded', handleStreamEnded);
      streamService.off('statusChange', handleStatusChange);
      streamService.off('error', handleError);
      streamService.off('recordingStarted', handleRecordingStarted);
      streamService.off('recordingStopped', handleRecordingStopped);
      streamService.off('settingsUpdated', handleSettingsUpdated);
    };

    return cleanupRef.current;
  }, [
    handleStreamStarted,
    handleStreamEnded,
    handleStatusChange,
    handleError,
    handleRecordingStarted,
    handleRecordingStopped,
    handleSettingsUpdated,
  ]);

  // Actions
  const startStream = useCallback(async () => {
    try {
      setError(null);
      await streamService.getMediaStream();
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  }, []);

  const stopStream = useCallback(() => {
    try {
      streamService.stopStream();
    } catch (err) {
      setError(err as Error);
    }
  }, []);

  const updateSettings = useCallback((newSettings: StreamSettings) => {
    try {
      streamService.updateSettings(newSettings);
    } catch (err) {
      setError(err as Error);
    }
  }, []);

  const startRecording = useCallback((saveLocally: boolean = true) => {
    try {
      streamService.startRecording(saveLocally);
    } catch (err) {
      setError(err as Error);
    }
  }, []);

  const stopRecording = useCallback(() => {
    try {
      streamService.stopRecording();
    } catch (err) {
      setError(err as Error);
    }
  }, []);

  const downloadRecording = useCallback((filename: string) => {
    try {
      streamService.downloadRecording(filename);
    } catch (err) {
      setError(err as Error);
    }
  }, []);

  const checkBrowserSupport = useCallback(() => {
    return streamService.checkBrowserSupport();
  }, []);

  const cleanup = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
    }
    streamService.cleanup();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    status,
    mediaStream,
    isRecording,
    settings,
    error,
    startStream,
    stopStream,
    updateSettings,
    startRecording,
    stopRecording,
    downloadRecording,
    checkBrowserSupport,
    cleanup,
  };
};
