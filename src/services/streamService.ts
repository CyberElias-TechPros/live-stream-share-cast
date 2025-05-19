
import EventEmitter from "@/lib/eventEmitter";
import { StreamSettings, StreamStatus } from "@/types";

class StreamService extends EventEmitter {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private activeStreamId: string | null = null;
  private activeStream: MediaStream | null = null;
  private settings: StreamSettings = {
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
      bitrate: 1500000, // 1.5 Mbps
      keyFrameInterval: 2, // seconds
      isLocalStream: false,
      recordStream: false,
      streamType: 'internet',
      localSave: true,
      recordingRetentionHours: 6,
      autoDeleteRecordings: false
    }
  };
  
  constructor() {
    super();
    this.checkBrowserSupport();
  }
  
  getSettings(): StreamSettings {
    return this.settings;
  }
  
  updateSettings(newSettings: StreamSettings): void {
    this.settings = {
      ...this.settings,
      ...newSettings,
      audio: {
        ...this.settings.audio,
        ...newSettings.audio
      },
      video: {
        ...this.settings.video,
        ...newSettings.video
      },
      streaming: {
        ...this.settings.streaming,
        ...newSettings.streaming
      }
    };
  }

  async getMediaStream(): Promise<MediaStream> {
    try {
      const constraints = {
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
      this.activeStream = stream;
      this.emit('streamStarted', stream);
      this.emit('statusChange', 'live');
      
      return stream;
    } catch (error) {
      console.error('Error getting media stream:', error);
      this.emit('statusChange', 'error');
      throw error;
    }
  }
  
  stopStream(): void {
    if (this.activeStream) {
      this.activeStream.getTracks().forEach(track => track.stop());
      this.activeStream = null;
      this.stopRecording();
      this.emit('streamEnded');
      this.emit('statusChange', 'idle');
    }
    
    this.activeStreamId = null;
  }
  
  setActiveStream(stream: any): void {
    this.activeStreamId = stream?.id || null;
  }
  
  startRecording(localSave: boolean = true): void {
    if (!this.activeStream) {
      console.error('Cannot start recording without an active stream');
      return;
    }
    
    try {
      const options = {
        mimeType: 'video/webm;codecs=vp9'
      };
      
      this.mediaRecorder = new MediaRecorder(this.activeStream, options);
      this.recordedChunks = [];
      
      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };
      
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        this.emit('recordingSaved', { blob, filename: `recording-${Date.now()}.webm` });
        this.emit('recordingStopped');
      };
      
      this.mediaRecorder.start(1000); // Capture in 1 second chunks
      this.emit('recordingStarted');
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  }
  
  stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.emit('recordingStopped');
    }
  }
  
  downloadRecording(filename: string): void {
    if (this.recordedChunks.length === 0) {
      console.error('No recording data available');
      return;
    }
    
    const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
  }
  
  checkBrowserSupport(): { supported: boolean; features: Record<string, boolean> } {
    const features = {
      getUserMedia: !!navigator.mediaDevices?.getUserMedia,
      webRTC: !!window.RTCPeerConnection,
      mediaRecorder: !!window.MediaRecorder,
      webSockets: !!window.WebSocket
    };
    
    const supported = Object.values(features).every(Boolean);
    
    return {
      supported,
      features
    };
  }

  async connectToStream(streamId: string, streamType: 'local' | 'internet' = 'internet'): Promise<void> {
    this.emit('statusChange', 'connecting');
    
    try {
      // Here we would implement the logic to connect to the stream
      // This would typically involve WebRTC or WebSockets
      this.activeStreamId = streamId;
      
      // Simulate successful connection after a short delay
      setTimeout(() => {
        this.emit('statusChange', 'live');
      }, 1000);
    } catch (error) {
      console.error('Error connecting to stream:', error);
      this.emit('statusChange', 'error');
      throw error;
    }
  }
}

export const streamService = new StreamService();
