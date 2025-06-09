
import { EventEmitter } from "@/lib/eventEmitter";
import { Stream, StreamSettings, StreamStatus } from "./index";

/**
 * Enhanced StreamService interface with comprehensive type safety
 */
export interface StreamService extends EventEmitter {
  // Core streaming functionality
  getSettings(): StreamSettings;
  updateSettings(settings: StreamSettings): void;
  getMediaStream(): Promise<MediaStream>;
  stopStream(): void;
  connectToStream(streamId: string, streamType: 'local' | 'internet'): Promise<void>;
  
  // Recording functionality
  startRecording(saveLocally: boolean): void;
  stopRecording(): void;
  downloadRecording(filename: string): void;
  
  // Stream management
  setActiveStream(stream: Stream | null): void;
  getCurrentStatus(): StreamStatus;
  
  // Utility functions
  checkBrowserSupport(): {
    supported: boolean;
    features: Record<string, boolean>;
  };
  
  // Cleanup
  cleanup(): void;
  
  // Event emitter methods (explicitly typed)
  on(event: 'streamStarted', listener: (stream: MediaStream) => void): this;
  on(event: 'streamEnded', listener: () => void): this;
  on(event: 'statusChange', listener: (status: StreamStatus) => void): this;
  on(event: 'recordingStarted', listener: (options: { saveLocally: boolean }) => void): this;
  on(event: 'recordingStopped', listener: (data: { saveLocally: boolean; chunks: Blob[] }) => void): this;
  on(event: 'recordingSaved', listener: (data: { filename: string; size: number }) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'settingsUpdated', listener: (settings: StreamSettings) => void): this;
  on(event: 'connected', listener: (data: { streamId: string; streamType: string }) => void): this;
  on(event: 'activeStreamChanged', listener: (stream: Stream | null) => void): this;
  on(event: 'trackEnded', listener: (track: MediaStreamTrack) => void): this;
  on(event: string, listener: (...args: any[]) => void): this;
  
  off(event: string, listener: (...args: any[]) => void): this;
  emit(event: string, ...args: any[]): boolean;
  once(event: string, listener: (...args: any[]) => void): this;
  removeAllListeners(event?: string): this;
}

/**
 * Stream error types for better error handling
 */
export type StreamError = 
  | 'PERMISSION_DENIED'
  | 'DEVICE_NOT_FOUND'
  | 'OVERCONSTRAINED'
  | 'CONNECTION_FAILED'
  | 'RECORDING_FAILED'
  | 'BROWSER_NOT_SUPPORTED'
  | 'INVALID_SETTINGS'
  | 'STREAM_ENDED';

/**
 * Enhanced stream events for real-time updates
 */
export interface StreamEvents {
  streamStarted: (stream: MediaStream) => void;
  streamEnded: () => void;
  statusChange: (status: StreamStatus) => void;
  error: (error: Error) => void;
  recordingStarted: (options: { saveLocally: boolean }) => void;
  recordingStopped: (data: { saveLocally: boolean; chunks: Blob[] }) => void;
  recordingSaved: (data: { filename: string; size: number }) => void;
  settingsUpdated: (settings: StreamSettings) => void;
  connected: (data: { streamId: string; streamType: string }) => void;
  activeStreamChanged: (stream: Stream | null) => void;
  trackEnded: (track: MediaStreamTrack) => void;
  viewerCountChanged: (count: number) => void;
  chatMessage: (message: any) => void;
}

/**
 * Browser support detection interface
 */
export interface BrowserSupport {
  supported: boolean;
  features: {
    webRTC: boolean;
    getUserMedia: boolean;
    mediaRecorder: boolean;
    webSockets: boolean;
    webCodecs: boolean;
    h264Support: boolean;
    vp9Support: boolean;
    screenCapture: boolean;
  };
  warnings: string[];
  recommendations: string[];
}
