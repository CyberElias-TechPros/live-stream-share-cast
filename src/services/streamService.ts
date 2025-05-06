import { EventEmitter } from '@/lib/eventEmitter';
import { 
  Stream, 
  StreamStatus, 
  StreamSettings,
  WebRTCConnection
} from '@/types';
import { liveStreamService } from './liveStreamService';

class StreamService extends EventEmitter {
  private mediaStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private connections: Map<string, WebRTCConnection> = new Map();
  private status: StreamStatus = 'idle';
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
      bitrate: 2500000, // 2.5 Mbps
      keyFrameInterval: 120,
      isLocalStream: false,
      recordStream: false,
      streamType: 'internet',
      localSave: true,
      recordingRetentionHours: 6
    }
  };
  private activeStream: Stream | null = null;

  constructor() {
    super();
    this.configureMediaConstraints = this.configureMediaConstraints.bind(this);
    this.getMediaStream = this.getMediaStream.bind(this);
    this.stopStream = this.stopStream.bind(this);
  }

  private setStatus(status: StreamStatus): void {
    this.status = status;
    this.emit('statusChange', status);
  }

  public getStatus(): StreamStatus {
    return this.status;
  }

  public updateSettings(newSettings: Partial<StreamSettings>): void {
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

    // If we have an active stream, we need to restart it with the new settings
    if (this.mediaStream) {
      this.stopStream();
      this.getMediaStream().catch(err => {
        this.emit('error', { message: 'Failed to restart stream with new settings', error: err });
      });
    }
  }

  public getSettings(): StreamSettings {
    return this.settings;
  }

  public setActiveStream(stream: Stream | null): void {
    this.activeStream = stream;
  }

  public getActiveStream(): Stream | null {
    return this.activeStream;
  }

  private configureMediaConstraints(): MediaStreamConstraints {
    const { audio, video } = this.settings;
    
    return {
      audio: audio.enabled ? {
        deviceId: audio.deviceId ? { exact: audio.deviceId } : undefined,
        echoCancellation: audio.echoCancellation,
        noiseSuppression: audio.noiseSuppression,
        autoGainControl: audio.autoGainControl
      } : false,
      video: video.enabled ? {
        deviceId: video.deviceId ? { exact: video.deviceId } : undefined,
        width: { ideal: video.width },
        height: { ideal: video.height },
        frameRate: { ideal: video.frameRate },
        facingMode: video.facingMode
      } : false
    };
  }

  async getMediaStream(customConstraints?: MediaStreamConstraints): Promise<MediaStream> {
    try {
      this.setStatus('connecting');
      
      const constraints = customConstraints || this.configureMediaConstraints();
      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Apply codec preferences if supported
      if (this.settings.streaming.codec && RTCRtpSender.getCapabilities) {
        const capabilities = RTCRtpSender.getCapabilities('video');
        if (capabilities && capabilities.codecs) {
          // Prioritize selected codec
          // This would be applied to any RTCPeerConnection we create
          // Implementation specifics would go here
        }
      }
      
      this.setStatus('live');
      this.emit('streamStarted', this.mediaStream);
      this.startBandwidthMonitoring();
      
      return this.mediaStream;
    } catch (error) {
      this.setStatus('error');
      this.emit('error', { message: 'Failed to get media stream', error });
      throw error;
    }
  }

  attachStreamToVideo(videoElement: HTMLVideoElement): void {
    if (!this.mediaStream) {
      throw new Error('No media stream available');
    }
    
    this.videoElement = videoElement;
    this.videoElement.srcObject = this.mediaStream;
    this.videoElement.muted = true; // Mute local preview
    this.videoElement.play().catch(error => {
      this.emit('error', { message: 'Failed to play video', error });
    });
  }

  stopStream(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    
    this.stopBandwidthMonitoring();
    this.connections.forEach(connection => {
      connection.peerConnection.close();
    });
    this.connections.clear();
    
    this.setStatus('ended');
    this.emit('streamEnded');
  }

  startRecording(localSave: boolean = true): void {
    if (!this.mediaStream) {
      throw new Error('No media stream available');
    }
    
    if (this.settings.streaming.recordStream) {
      this.recordedChunks = [];
      
      const mimeType = 'video/webm;codecs=vp9';
      
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        this.emit('error', { message: 'Recording codec is not supported by this browser' });
        return;
      }
      
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: mimeType,
        videoBitsPerSecond: this.settings.streaming.bitrate
      });
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };
      
      this.mediaRecorder.onstop = () => {
        if (this.recordedChunks.length > 0) {
          const recordingBlob = new Blob(this.recordedChunks, { type: mimeType });
          
          if (localSave) {
            this.saveRecordingLocally(recordingBlob);
          } else if (this.activeStream) {
            this.uploadRecording(recordingBlob, this.activeStream.id);
          }
        }
        
        this.emit('recordingStopped');
      };
      
      this.mediaRecorder.start(1000); // Record in 1-second chunks
      this.emit('recordingStarted');
    } else {
      this.emit('error', { message: 'Recording is not enabled in settings' });
    }
  }

  stopRecording(): Blob | null {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      
      if (this.recordedChunks.length > 0) {
        const recordingBlob = new Blob(this.recordedChunks, { type: 'video/webm' });
        return recordingBlob;
      }
    }
    
    return null;
  }

  downloadRecording(filename: string = 'recording.webm'): void {
    if (this.recordedChunks.length === 0) {
      this.emit('error', { message: 'No recording data available to download' });
      return;
    }
    
    try {
      const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      this.emit('recordingDownloaded', { filename, size: blob.size });
    } catch (error) {
      this.emit('error', { message: 'Failed to download recording', error });
    }
  }

  private saveRecordingLocally(blob: Blob): void {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `stream-recording-${timestamp}.webm`;
      
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      this.emit('recordingSaved', {
        url,
        filename,
        size: blob.size,
        type: blob.type
      });
    } catch (error) {
      this.emit('error', { message: 'Failed to save recording locally', error });
    }
  }

  private async uploadRecording(blob: Blob, streamId: string): Promise<void> {
    try {
      // First we need to upload the blob to storage
      const file = new File([blob], `recording-${streamId}-${Date.now()}.webm`, { type: blob.type });
      
      // Create a form data object
      const formData = new FormData();
      formData.append('file', file);
      
      // Upload to Supabase Storage via edge function
      const response = await fetch('https://earvjqvafjivvgrfeqxn.supabase.co/functions/v1/upload-recording', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to upload recording: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data && data.url) {
        // Update the stream with the recording URL
        await liveStreamService.saveRecordingUrl(
          streamId, 
          data.url, 
          this.settings.streaming.recordingRetentionHours
        );
        
        this.emit('recordingUploaded', {
          url: data.url,
          streamId,
          size: blob.size,
          expiresIn: this.settings.streaming.recordingRetentionHours
        });
      }
    } catch (error) {
      this.emit('error', { message: 'Failed to upload recording', error });
    }
  }

  // Bandwidth and stats monitoring
  private bandwidthMonitorInterval: any = null;
  private lastBytesSent = 0;
  private lastTimestamp = 0;

  private startBandwidthMonitoring(): void {
    if (this.bandwidthMonitorInterval) {
      clearInterval(this.bandwidthMonitorInterval);
    }

    this.bandwidthMonitorInterval = setInterval(() => {
      // In a real implementation, we would gather stats from RTCPeerConnection
      // For now, we'll just emit simulated stats
      const currentTimestamp = Date.now();
      const bytesSent = this.lastBytesSent + Math.floor(Math.random() * 100000);
      
      if (this.lastTimestamp > 0) {
        const timeDiff = currentTimestamp - this.lastTimestamp; // ms
        const byteDiff = bytesSent - this.lastBytesSent;
        const bandwidthKbps = (byteDiff * 8) / timeDiff; // kbps
        
        this.emit('stats', {
          bandwidth: bandwidthKbps,
          timestamp: new Date(),
          resolution: `${this.settings.video.width}x${this.settings.video.height}`,
          frameRate: this.settings.video.frameRate,
          codec: this.settings.streaming.codec,
          viewerCount: this.connections.size,
          streamType: this.settings.streaming.streamType
        });
      }
      
      this.lastBytesSent = bytesSent;
      this.lastTimestamp = currentTimestamp;
    }, 1000);
  }

  private stopBandwidthMonitoring(): void {
    if (this.bandwidthMonitorInterval) {
      clearInterval(this.bandwidthMonitorInterval);
      this.bandwidthMonitorInterval = null;
    }
    this.lastBytesSent = 0;
    this.lastTimestamp = 0;
  }

  // WebRTC Connection Management (simplified)
  async createPeerConnection(streamId: string, userId?: string): Promise<WebRTCConnection> {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
        // In production, you would add TURN servers for reliable connections
      ]
    };
    
    const peerConnection = new RTCPeerConnection(config);
    
    // Add tracks from our stream to the peer connection
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, this.mediaStream!);
      });
    }
    
    // Create data channel for messaging
    const dataChannel = peerConnection.createDataChannel('chat');
    dataChannel.onopen = () => {
      this.emit('dataChannelOpen', { streamId, userId });
    };
    dataChannel.onmessage = (event) => {
      this.emit('dataChannelMessage', { streamId, userId, message: event.data });
    };
    
    // Connection state monitoring
    peerConnection.oniceconnectionstatechange = () => {
      if (peerConnection.iceConnectionState === 'disconnected' ||
          peerConnection.iceConnectionState === 'failed') {
        this.emit('peerDisconnected', { streamId, userId });
      }
    };
    
    // Create and store the connection
    const connection: WebRTCConnection = {
      peerConnection,
      dataChannel,
      streamId,
      userId,
      connectionState: peerConnection.connectionState || 'new'
    };
    
    this.connections.set(streamId, connection);
    return connection;
  }

  // For viewer: connect to a stream
  async connectToStream(streamId: string, streamType: 'local' | 'internet' = 'internet'): Promise<MediaStream> {
    try {
      this.setStatus('connecting');
      
      if (streamType === 'local') {
        // For local streaming, we would connect directly via LAN/WebRTC
        return this.connectToLocalStream(streamId);
      } else {
        // For internet streaming, we would use a signaling server and TURN if needed
        return this.connectToInternetStream(streamId);
      }
    } catch (error) {
      this.setStatus('error');
      this.emit('error', { message: 'Failed to connect to stream', error });
      throw error;
    }
  }

  private async connectToLocalStream(streamId: string): Promise<MediaStream> {
    // This would use a direct WebRTC connection on the local network
    // For simplicity, we'll simulate this
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockVideoStream = new MediaStream();
        this.setStatus('live');
        this.emit('connectedToLocalStream', { streamId });
        resolve(mockVideoStream);
      }, 1000);
    });
  }

  private async connectToInternetStream(streamId: string): Promise<MediaStream> {
    // This would use a signaling server and TURN servers for internet streaming
    // For simplicity, we'll simulate this
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockVideoStream = new MediaStream();
        this.setStatus('live');
        this.emit('connectedToInternetStream', { streamId });
        resolve(mockVideoStream);
      }, 2000);
    });
  }

  // Helper methods for device detection
  async getAvailableDevices(): Promise<{
    videoDevices: MediaDeviceInfo[];
    audioDevices: MediaDeviceInfo[];
  }> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      const audioDevices = devices.filter(device => device.kind === 'audioinput');
      
      return { videoDevices, audioDevices };
    } catch (error) {
      this.emit('error', { message: 'Failed to get available devices', error });
      return { videoDevices: [], audioDevices: [] };
    }
  }

  // For checking if the browser supports necessary features
  checkBrowserSupport(): {
    supported: boolean;
    features: Record<string, boolean>;
  } {
    const features = {
      webRTC: !!window.RTCPeerConnection,
      mediaDevices: !!navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia,
      mediaRecorder: !!window.MediaRecorder,
      webSocket: !!window.WebSocket,
      h264: false,
      vp8: false,
      vp9: false
    };
    
    if (RTCRtpSender && RTCRtpSender.getCapabilities) {
      const capabilities = RTCRtpSender.getCapabilities('video');
      if (capabilities && capabilities.codecs) {
        features.h264 = capabilities.codecs.some(c => c.mimeType.includes('H264'));
        features.vp8 = capabilities.codecs.some(c => c.mimeType.includes('VP8'));
        features.vp9 = capabilities.codecs.some(c => c.mimeType.includes('VP9'));
      }
    }
    
    const supported = features.webRTC && features.mediaDevices;
    
    return { supported, features };
  }
}

export const streamService = new StreamService();
