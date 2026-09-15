/**
 * Row → API mappers. The database keeps snake_case columns; the API (and the
 * React app) speak camelCase, exactly like the previous Supabase payloads did.
 */

export interface UserRow {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_streamer: number | null;
  is_admin: number | null;
  email_verified: number | null;
  followers_count: number | null;
  following_count: number | null;
  preferences: string | null;
  social_links: string | null;
  last_seen: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface StreamRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  stream_key: string;
  category: string | null;
  tags: string | null;
  stream_type: string | null;
  is_live: number | null;
  is_recording: number | null;
  viewer_count: number | null;
  peak_viewers: number | null;
  thumbnail_url: string | null;
  recording_url: string | null;
  recording_key: string | null;
  recording_expiry: string | null;
  host_connected: number | null;
  last_heartbeat: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string | null;
  // Joined owner columns (see STREAM_SELECT).
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
}

export interface ChatMessageRow {
  id: string;
  stream_id: string;
  user_id: string;
  message: string;
  type: string | null;
  metadata: string | null;
  is_moderated: number | null;
  created_at: string;
  username?: string | null;
  avatar_url?: string | null;
}

export interface StreamSessionRow {
  id: string;
  stream_id: string;
  user_id: string;
  stream_type: string | null;
  viewer_count: number | null;
  peak_viewers: number | null;
  duration: number | null;
  avg_view_duration: number | null;
  avg_bitrate: number | null;
  resolution: string | null;
  recording_url: string | null;
  recording_expiry: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  title?: string | null;
  thumbnail_url?: string | null;
  category?: string | null;
  tags?: string | null;
}

export interface StreamStatRow {
  id: string;
  stream_id: string;
  viewer_count: number | null;
  bandwidth: number | null;
  cpu_usage: number | null;
  memory_usage: number | null;
  errors: string | null;
  timestamp: string;
}

/** Shared column list: `streams` joined with the owner's public profile. */
export const STREAM_SELECT = `
  s.id, s.user_id, s.title, s.description, s.stream_key, s.category, s.tags,
  s.stream_type, s.is_live, s.is_recording, s.viewer_count, s.peak_viewers,
  s.thumbnail_url, s.recording_url, s.recording_key, s.recording_expiry,
  s.host_connected, s.last_heartbeat, s.started_at, s.ended_at, s.created_at, s.updated_at,
  u.username, u.display_name, u.avatar_url
`;

export const STREAM_FROM = `FROM streams s JOIN users u ON u.id = s.user_id`;

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Public profile — safe to return to anyone. */
export function publicUser(row: UserRow) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name ?? row.username,
    avatar: row.avatar_url,
    bio: row.bio,
    isStreamer: !!row.is_streamer,
    followers: row.followers_count ?? 0,
    following: row.following_count ?? 0,
    lastSeen: row.last_seen,
    createdAt: row.created_at,
  };
}

/** The signed-in user's own record, including preferences and email. */
export function privateUser(row: UserRow) {
  return {
    ...publicUser(row),
    email: row.email,
    updatedAt: row.updated_at,
    preferences: parseJson<Record<string, unknown> | null>(row.preferences, null) ?? defaultPreferences(),
    socialLinks: parseJson<unknown[]>(row.social_links, []),
  };
}

export function defaultPreferences() {
  return {
    theme: 'system',
    notifications: { email: true, push: true, streamStart: true, comments: true, followers: true },
    privacy: { showOnlineStatus: true, allowMessages: true, showProfileToUnregistered: true },
    streaming: {
      defaultStreamType: 'internet',
      defaultQuality: '720p',
      autoRecord: false,
      autoDeleteRecordings: true,
      recordingRetentionHours: 6,
    },
  };
}

/** `withKey` is only ever true for the stream owner. */
export function stream(row: StreamRow, withKey = false) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    isLive: !!row.is_live,
    streamKey: withKey ? row.stream_key : '',
    createdAt: row.created_at,
    viewerCount: row.viewer_count ?? 0,
    peakViewers: row.peak_viewers ?? 0,
    isRecording: !!row.is_recording,
    isLocalStream: row.stream_type === 'local',
    thumbnail: row.thumbnail_url,
    url: row.recording_url,
    userId: row.user_id,
    username: row.username ?? undefined,
    displayName: row.display_name ?? undefined,
    userAvatar: row.avatar_url ?? undefined,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    category: row.category,
    tags: parseJson<string[]>(row.tags, []),
    recordingUrl: row.recording_url,
    recordingExpiry: row.recording_expiry,
    streamType: (row.stream_type === 'local' ? 'local' : 'internet') as 'local' | 'internet',
    hostConnected: !!row.host_connected,
    updatedAt: row.updated_at,
  };
}

export function chatMessage(row: ChatMessageRow) {
  return {
    id: row.id,
    streamId: row.stream_id,
    userId: row.user_id,
    // `user_id` is NULL for system messages broadcast by the Durable Object.
    username: row.user_id ? row.username ?? 'Anonymous' : 'system',
    userAvatar: row.avatar_url ?? undefined,
    message: row.message,
    timestamp: row.created_at,
    isModerated: !!row.is_moderated,
    type: (row.type ?? 'text') as 'text' | 'emote' | 'donation' | 'system',
    metadata: parseJson<unknown>(row.metadata, null),
  };
}

export function streamSession(row: StreamSessionRow) {
  return {
    id: row.id,
    streamId: row.stream_id,
    userId: row.user_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    duration: row.duration,
    viewerCount: row.viewer_count ?? 0,
    peakViewers: row.peak_viewers ?? 0,
    avgViewDuration: row.avg_view_duration,
    avgBitrate: row.avg_bitrate,
    resolution: row.resolution,
    recordingUrl: row.recording_url,
    recordingExpiry: row.recording_expiry,
    streamType: (row.stream_type === 'local' ? 'local' : 'internet') as 'local' | 'internet',
    stream: row.title
      ? { title: row.title, thumbnail: row.thumbnail_url, category: row.category, tags: parseJson<string[]>(row.tags, []) }
      : undefined,
  };
}

export function streamStat(row: StreamStatRow) {
  return {
    id: row.id,
    streamId: row.stream_id,
    timestamp: row.timestamp,
    viewerCount: row.viewer_count ?? 0,
    bandwidth: row.bandwidth ?? 0,
    cpuUsage: row.cpu_usage,
    memoryUsage: row.memory_usage,
    errors: parseJson<unknown[]>(row.errors, []),
  };
}
