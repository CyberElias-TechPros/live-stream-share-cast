
export interface Stream {
  id: string;
  title: string;
  description?: string;
  isLive: boolean;
  streamKey: string;
  createdAt: Date;
  viewerCount: number;
  isRecording: boolean;
  isLocalStream: boolean;
  thumbnail?: string;
  url?: string;
  userId: string;
  roomId?: string;
  qualityOptions?: StreamQuality[];
  startedAt?: Date;
  endedAt?: Date;
  bandwidth?: number;
  category?: string;
  tags?: string[];
  username?: string;
  displayName?: string;
  userAvatar?: string;
  recordingUrl?: string;
  recordingExpiry?: Date;
  streamType: 'local' | 'internet';
}

export interface StreamQuality {
  id: string;
  label: string; // e.g. "720p", "480p", "360p"
  resolution: {
    width: number;
    height: number;
  };
  bitrate: number;
  codec: string; // e.g. "H.264", "VP8"
}

export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  displayName?: string;
  bio?: string;
  followers?: number;
  following?: number;
  isStreamer?: boolean;
  createdAt: Date;
  updatedAt?: Date;
  lastSeen?: Date;
  socialLinks?: SocialLink[];
  preferences?: UserPreferences;
}

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  notifications?: {
    email: boolean;
    push: boolean;
    streamStart: boolean;
    comments: boolean;
    followers: boolean;
  };
  privacy?: {
    showOnlineStatus: boolean;
    allowMessages: boolean;
    showProfileToUnregistered: boolean;
  };
  streaming?: {
    defaultStreamType: 'local' | 'internet';
    defaultQuality: string;
    autoRecord: boolean;
    autoDeleteRecordings: boolean;
    recordingRetentionHours: number;
  };
}

export interface SocialLink {
  platform: string;
  url: string;
}

export interface StreamSession {
  id: string;
  streamId: string;
  userId: string;
  startedAt: Date;
  endedAt?: Date;
  viewerCount: number;
  duration?: number;
  recordingUrl?: string;
  recordingExpiry?: Date;
  peakViewers?: number;
  avgViewDuration?: number;
  streamStats?: StreamStats[];
  streamType: 'local' | 'internet';
}

export interface StreamStats {
  timestamp: Date;
  viewerCount: number;
  bandwidth: number;
  cpuUsage?: number;
  memoryUsage?: number;
  errors?: StreamError[];
}

export interface StreamError {
  timestamp: Date;
  code: string;
  message: string;
  details?: any;
}

export interface StreamSettings {
  audio: {
    enabled: boolean;
    deviceId?: string;
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
  };
  video: {
    enabled: boolean;
    deviceId?: string;
    width: number;
    height: number;
    frameRate: number;
    facingMode?: 'user' | 'environment';
  };
  streaming: {
    codec: 'VP8' | 'VP9' | 'H264';
    bitrate: number;
    keyFrameInterval: number;
    isLocalStream: boolean;
    recordStream: boolean;
    streamType: 'local' | 'internet';
    localSave: boolean;
    recordingRetentionHours: number;
    autoDeleteRecordings?: boolean;
  };
}

export type StreamStatus = 
  | "idle"
  | "connecting"
  | "live"
  | "error"
  | "ended"
  | "loading"
  | "buffering";

export interface WebRTCConnection {
  peerConnection: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
  stream?: MediaStream;
  streamId: string;
  userId?: string;
  connectionState: RTCPeerConnectionState;
}

export interface ChatMessage {
  id: string;
  streamId: string;
  userId: string;
  username: string;
  userAvatar?: string;
  message: string;
  timestamp: Date;
  isModerated?: boolean;
  type: 'text' | 'emote' | 'donation' | 'system';
  metadata?: any;
}
