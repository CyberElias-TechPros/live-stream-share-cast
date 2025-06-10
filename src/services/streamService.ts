import { Stream, StreamSettings, StreamStatus } from "@/types";
import { EventEmitter } from "@/lib/eventEmitter";
import { streamSettingsSchema } from "@/utils/validationUtils";

export interface StreamServiceInterface {
  getSettings(): StreamSettings;
  updateSettings(settings: StreamSettings): void;
  getMediaStream(): Promise<MediaStream>;
  stopStream(): void;
  connectToStream(streamId: string, streamType: 'local' | 'internet'): Promise<void>;
  startRecording(saveLocally: boolean): void;
  stopRecording(): void;
  downloadRecording(filename: string): void;
  checkBrowserSupport(): {
    supported: boolean;
    features: Record<string, boolean>;
  };
  setActiveStream(stream: Stream | null): void;
  getCurrentStatus(): StreamStatus;
  cleanup(): void;
}

class StreamServiceImpl extends EventEmitter implements StreamServiceInterface {
  private settings: StreamSettings;
  private activeStream: Stream | null = null;
  private currentMediaStream: MediaStream | null = null;
  private currentStatus: StreamStatus = 'idle';
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  
  constructor() {
    super();
    
    // Initialize with validated default settings - fix: ensure all required properties are provided
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
    return { ...this.settings }; // Return a copy to prevent mutation
  }
  
  updateSettings(settings: StreamSettings): void {
    try {
      // Validate settings using Zod schema
      const validatedSettings = streamSettingsSchema.parse(settings);
      this.settings = validatedSettings;
      this.emit('settingsUpdated', validatedSettings);
    } catch (error) {
      console.error('Invalid stream settings:', error);
      this.emit('error', new Error('Invalid stream settings provided'));
    }
  }
  
  async getMediaStream(): Promise<MediaStream> {
    try {
      this.setStatus('connecting');
      
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
      this.currentMediaStream = stream;
      
      // Set up stream event listeners
      stream.getTracks().forEach(track => {
        track.addEventListener('ended', () => {
          this.emit('trackEnded', track);
        });
      });
      
      this.setStatus('live');
      this.emit('streamStarted', stream);
      return stream;
    } catch (error) {
      this.setStatus('error');
      this.emit('error', error);
      throw error;
    }
  }
  
  stopStream(): void {
    try {
      if (this.currentMediaStream) {
        this.currentMediaStream.getTracks().forEach(track => {
          track.stop();
        });
        this.currentMediaStream = null;
      }
      
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.stopRecording();
      }
      
      this.setStatus('idle');
      this.emit('streamEnded');
    } catch (error) {
      console.error('Error stopping stream:', error);
      this.emit('error', error);
    }
  }
  
  async connectToStream(streamId: string, streamType: 'local' | 'internet'): Promise<void> {
    try {
      this.setStatus('connecting');
      
      // Validate stream ID
      if (!streamId || streamId.length < 10) {
        throw new Error('Invalid stream ID');
      }
      
      // Simulate connection logic - replace with actual implementation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      this.setStatus('live');
      this.emit('connected', { streamId, streamType });
    } catch (error) {
      this.setStatus('error');
      this.emit('error', error);
      throw error;
    }
  }
  
  setActiveStream(stream: Stream | null): void {
    this.activeStream = stream;
    this.emit('activeStreamChanged', stream);
  }
  
  startRecording(saveLocally: boolean): void {
    try {
      if (!this.currentMediaStream) {
        throw new Error('No active media stream to record');
      }
      
      if (!MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        throw new Error('Recording not supported in this browser');
      }
      
      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(this.currentMediaStream, {
        mimeType: 'video/webm;codecs=vp9'
      });
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };
      
      this.mediaRecorder.onstop = () => {
        this.emit('recordingStopped', {
          saveLocally,
          chunks: this.recordedChunks
        });
      };
      
      this.mediaRecorder.start(1000); // Record in 1 second chunks
      this.emit('recordingStarted', { saveLocally });
    } catch (error) {
      console.error('Error starting recording:', error);
      this.emit('error', error);
    }
  }
  
  stopRecording(): void {
    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      this.emit('error', error);
    }
  }
  
  downloadRecording(filename: string): void {
    try {
      if (this.recordedChunks.length === 0) {
        throw new Error('No recording data available');
      }
      
      const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.endsWith('.webm') ? filename : `${filename}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.emit('recordingSaved', { filename, size: blob.size });
    } catch (error) {
      console.error('Error downloading recording:', error);
      this.emit('error', error);
    }
  }
  
  checkBrowserSupport(): { supported: boolean; features: Record<string, boolean> } {
    const features: Record<string, boolean> = {
      webRTC: !!window.RTCPeerConnection,
      getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      mediaRecorder: !!window.MediaRecorder,
      webSockets: !!window.WebSocket,
      webCodecs: 'VideoEncoder' in window && 'VideoDecoder' in window,
      h264Support: MediaRecorder.isTypeSupported('video/webm;codecs=h264'),
      vp9Support: MediaRecorder.isTypeSupported('video/webm;codecs=vp9'),
      screenCapture: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)
    };
    
    const supported = features.webRTC && features.getUserMedia && features.mediaRecorder && features.webSockets;
    
    return { supported, features };
  }
  
  getCurrentStatus(): StreamStatus {
    return this.currentStatus;
  }
  
  private setStatus(status: StreamStatus): void {
    if (this.currentStatus !== status) {
      this.currentStatus = status;
      this.emit('statusChange', status);
    }
  }
  
  cleanup(): void {
    this.stopStream();
    this.removeAllListeners();
    this.recordedChunks = [];
  }
}

// Export singleton instance
export const streamService = new StreamServiceImpl();

// Export type for dependency injection
export type StreamService = StreamServiceInterface;
