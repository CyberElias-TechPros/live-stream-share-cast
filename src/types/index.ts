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
  /** Only present on the signed-in user's own record. */
  isAdmin?: boolean;
  emailVerified?: boolean;
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

/* ------------------------------- notifications ------------------------------- */

export interface AppNotification {
  id: string;
  type: 'stream_live' | 'follow' | 'chat_reply' | 'chat_mention' | 'tip' | 'system' | 'moderation' | 'schedule' | string;
  title: string;
  body?: string;
  url?: string;
  actorId?: string;
  actorUsername?: string;
  actorAvatar?: string;
  streamId?: string;
  data?: Record<string, unknown> | null;
  readAt?: Date;
  createdAt: Date;
}

/* --------------------------------- recordings -------------------------------- */

export interface Recording {
  id: string;
  title: string;
  description?: string;
  url?: string | null;
  thumbnail?: string | null;
  durationSeconds?: number | null;
  sizeBytes?: number | null;
  mimeType?: string | null;
  visibility: 'public' | 'unlisted' | 'private';
  status: 'processing' | 'ready' | 'failed' | 'deleted';
  source: 'live' | 'upload' | 'clip' | string;
  views: number;
  watchMinutes: number;
  category?: string | null;
  tags: string[];
  isMature: boolean;
  clipOf?: string | null;
  clipStart?: number | null;
  clipEnd?: number | null;
  retentionExpiresAt?: Date | null;
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt?: Date | null;
  streamId?: string | null;
  userId: string;
  username?: string;
  displayName?: string;
  userAvatar?: string;
  isOwner: boolean;
  isClip: boolean;
}

/* ---------------------------------- schedule --------------------------------- */

export interface ScheduledBroadcast {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  tags: string[];
  thumbnail?: string | null;
  scheduledFor: Date;
  durationMinutes?: number | null;
  timezone?: string | null;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  streamId?: string | null;
  reminderCount: number;
  reminderSentAt?: Date | null;
  createdAt: Date;
  userId: string;
  username?: string;
  displayName?: string;
  userAvatar?: string;
  isOwner: boolean;
  isReminded: boolean;
}

/* -------------------------------- moderation --------------------------------- */

export interface ContentReport {
  id: string;
  targetType: 'stream' | 'user' | 'chat_message' | 'recording';
  targetId: string;
  reason: string;
  details?: string | null;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  resolution?: string | null;
  createdAt: Date;
  reporterUsername?: string | null;
  targetUsername?: string | null;
}

export interface BlockedUser {
  id: string;
  userId: string;
  username: string;
  displayName?: string;
  avatar?: string;
  createdAt: Date;
}

/*----------------------------------- tips ------------------------------------ */

export interface TipConfig {
  enabled: boolean;
  provider: string;
  currency: string;
  minTipCents: number;
  maxTipCents: number;
  presets: number[];
  hasDonationLink: boolean;
  donationUrl?: string | null;
}

export interface Tip {
  id: string;
  amountCents: number;
  currency: string;
  message?: string | null;
  status: 'pending' | 'paid' | 'failed' | 'refunded' | 'expired';
  createdAt: Date;
  paidAt?: Date | null;
  streamerUsername?: string | null;
  streamerName?: string | null;
  streamerAvatar?: string | null;
  checkoutUrl?: string | null;
}

/* ------------------------------- platform config ------------------------------ */

export interface PlatformConfig {
  brand: {
    name: string;
    tagline?: string;
    url?: string | null;
    supportEmail?: string | null;
    docsUrl?: string | null;
    statusUrl?: string | null;
    socials: Record<string, string>;
    termsVersion: string;
    privacyVersion: string;
    legalEntity?: string | null;
    jurisdiction?: string | null;
  };
  limits: {
    maxChatMessageLength: number;
    maxTitleLength: number;
    maxBioLength: number;
    maxTags: number;
    maxUploadBytes: number;
    maxAvatarBytes: number;
    recordingRetentionHours: number;
    staleStreamMinutes: number;
    chatHistoryPageSize: number;
    maxStreamsPerUser: number;
    maxScheduledPerUser: number;
    defaultTipPresets: number[];
  };
  features: {
    signups: boolean;
    emailVerificationRequired: boolean;
    chat: boolean;
    scheduling: boolean;
    vod: boolean;
    clips: boolean;
    tips: boolean;
    webhooks: boolean;
    apiTokens: boolean;
    schedulingReminders: boolean;
    modConsole: boolean;
    dataExport: boolean;
    accountDeletion: boolean;
    pushNotifications: boolean;
  };
  captcha: { provider: string; siteKey?: string | null; enabled: boolean };
  payments: {
    provider: string;
    enabled: boolean;
    currency: string;
    minTipCents: number;
    maxTipCents: number;
    presets: number[];
  };
  analytics: { provider: string; siteId?: string | null; scriptUrl?: string | null; sentryDsn?: string | null };
  push: { enabled: boolean; publicKey?: string | null };
  webrtc: { stunUrls: string[]; turnConfigured: boolean };
  integrations: { email: boolean; turn: boolean; captcha: boolean; payments: boolean };
  environment: string;
  apiOrigin: string;
  version: string;
  serverTime: string;
}

export interface WatchHistoryEntry {
  sessionId: string;
  streamId?: string | null;
  recordingId?: string | null;
  title: string;
  thumbnail?: string | null;
  url?: string | null;
  watchedSeconds: number;
  joinedAt: Date;
  leftAt?: Date | null;
}
