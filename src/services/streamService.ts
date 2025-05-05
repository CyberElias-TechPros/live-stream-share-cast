
import { EventEmitter } from '@/lib/eventEmitter';
import { 
  Stream, 
  StreamStatus, 
  StreamSettings,
  WebRTCConnection
} from '@/types';

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
      recordStream: false
    }
  };

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

  startRecording(): void {
    if (!this.mediaStream) {
      throw new Error('No media stream available');
    }
    
    if (this.settings.streaming.recordStream && MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
      this.recordedChunks = [];
      
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: this.settings.streaming.bitrate
      });
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };
      
      this.mediaRecorder.onstop = () => {
        this.emit('recordingStopped');
      };
      
      this.mediaRecorder.start(1000); // Record in 1-second chunks
      this.emit('recordingStarted');
    } else {
      this.emit('error', { message: 'Recording is not supported or enabled' });
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

  downloadRecording(filename: string): void {
    const recordingBlob = this.stopRecording();
    
    if (recordingBlob) {
      const url = URL.createObjectURL(recordingBlob);
      const a = document.createElement('a');
      document.body.appendChild(a);
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    }
  }

  // For demo purposes, generate a unique shareable link
  generateShareableLink(): string {
    const randomId = Math.random().toString(36).substring(2, 15);
    const baseUrl = window.location.origin;
    return `${baseUrl}/watch/${randomId}`;
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
          viewerCount: this.connections.size
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
  async connectToStream(streamId: string): Promise<MediaStream> {
    try {
      this.setStatus('connecting');
      
      // In a real implementation, we would connect to a signaling server,
      // exchange SDP and ICE candidates, and establish a WebRTC connection
      
      // For now, we'll simulate receiving a stream after a delay
      return new Promise((resolve) => {
        setTimeout(() => {
          // Create a mock video stream
          const mockVideoStream = new MediaStream();
          this.setStatus('live');
          resolve(mockVideoStream);
        }, 2000);
      });
    } catch (error) {
      this.setStatus('error');
      this.emit('error', { message: 'Failed to connect to stream', error });
      throw error;
    }
  }
}

export const streamService = new StreamService();
