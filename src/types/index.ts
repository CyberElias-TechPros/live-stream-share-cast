export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarColor: string;
  followersCount: number;
  followingCount: number;
  socialLinks: SocialLink[];
  createdAt: string;
}

export interface SelfUser extends PublicUser {
  email: string;
  preferences: {
    streaming?: {
      defaultResolution?: "1080p" | "720p" | "480p";
      defaultFps?: 24 | 30 | 60;
      autoRecord?: boolean;
      recordingRetentionHours?: number;
    };
  };
}

export interface SocialLink {
  platform: string;
  url: string;
}

export type StreamKind = "broadcast" | "call";

export interface Stream {
  id: string;
  title: string;
  description: string;
  category: string;
  kind: StreamKind;
  tags: string[];
  isLive: boolean;
  viewerCount: number;
  peakViewers: number;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  host: {
    username: string;
    displayName: string;
    avatarColor: string;
  };
  hasRecording: boolean;
  recordingExpiresAt: string | null;
}

export interface StreamWithLastSession extends Stream {
  lastSession: {
    peakViewers: number | null;
    durationSeconds: number | null;
  };
}

export interface ChatMessage {
  id: string;
  username: string;
  text: string;
  ts: number | string;
  pending?: boolean;
}

export interface BroadcastSession {
  id: string;
  streamId: string;
  streamTitle: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  peakViewers: number;
}

export interface Profile extends PublicUser {
  isSelf: boolean;
  isFollowing: boolean;
  broadcastCount: number;
  totalBroadcastSeconds: number;
}

export interface AppConfig {
  mode: "cloud" | "lan";
  iceServers: RTCIceServer[];
  turnConfigured: boolean;
  recordingsEnabled: boolean;
  categories: string[];
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export type ConnectionQuality = "excellent" | "good" | "fair" | "poor" | "unknown";

/** One remote participant in a mesh call room. */
export interface CallPeer {
  id: string;
  username: string;
  isHost: boolean;
}
