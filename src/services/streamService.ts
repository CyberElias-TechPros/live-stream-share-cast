
import { Stream, StreamSettings, StreamStatus } from "@/types";
import { EventEmitter } from "@/lib/eventEmitter";

// Create a class that extends EventEmitter to implement the missing methods
class StreamServiceImpl extends EventEmitter {
  private settings: StreamSettings;
  private activeStream: Stream | null = null;
  
  constructor() {
    super();
    
    // Initialize default settings
    this.settings = {
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
        codec: 'H264',
        bitrate: 2500000,
        keyFrameInterval: 2,
        isLocalStream: false,
        recordStream: false,
        streamType: 'internet',
        localSave: true,
        recordingRetentionHours: 6
      }
    };
  }
  
  getSettings(): StreamSettings {
    return this.settings;
  }
  
  updateSettings(settings: StreamSettings): void {
    this.settings = settings;
  }
  
  async getMediaStream(): Promise<MediaStream> {
    try {
      const constraints: MediaStreamConstraints = {
        audio: this.settings.audio.enabled ? {
          echoCancellation: this.settings.audio.echoCancellation,
          noiseSuppression: this.settings.audio.noiseSuppression,
          autoGainControl: this.settings.audio.autoGainControl,
          deviceId: this.settings.audio.deviceId ? { exact: this.settings.audio.deviceId } : undefined
        } : false,
        video: this.settings.video.enabled ? {
          width: { ideal: this.settings.video.width },
          height: { ideal: this.settings.video.height },
          frameRate: { ideal: this.settings.video.frameRate },
          deviceId: this.settings.video.deviceId ? { exact: this.settings.video.deviceId } : undefined,
          facingMode: this.settings.video.facingMode
        } : false
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.emit('streamStarted', stream);
      this.emit('statusChange', 'live');
      return stream;
    } catch (error) {
      console.error("Error accessing media devices:", error);
      this.emit('statusChange', 'error');
      throw error;
    }
  }
  
  stopStream(): void {
    this.emit('streamEnded');
    this.emit('statusChange', 'idle');
  }
  
  async connectToStream(streamId: string, streamType: 'local' | 'internet'): Promise<void> {
    // Implementation would go here
    this.emit('statusChange', 'connecting');
    
    // Simulate successful connection
    setTimeout(() => {
      this.emit('statusChange', 'live');
    }, 1000);
  }
  
  setActiveStream(stream: Stream | null): void {
    this.activeStream = stream;
  }
  
  startRecording(saveLocally: boolean): void {
    this.emit('recordingStarted');
  }
  
  stopRecording(): void {
    this.emit('recordingStopped');
  }
  
  downloadRecording(filename: string): void {
    this.emit('recordingSaved', { filename });
  }
  
  checkBrowserSupport(): { supported: boolean; features: Record<string, boolean> } {
    const features: Record<string, boolean> = {
      webRTC: !!window.RTCPeerConnection,
      getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      mediaRecorder: !!window.MediaRecorder,
      webSockets: !!window.WebSocket
    };
    
    const supported = Object.values(features).every(Boolean);
    
    return {
      supported,
      features
    };
  }
}

// Export a singleton instance
export const streamService = new StreamServiceImpl();
