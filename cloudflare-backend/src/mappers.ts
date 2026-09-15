import { toBool, parseJson } from "./utils";

export function mapStream(row: any, profile?: any) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    isLive: toBool(row.is_live),
    streamKey: row.stream_key,
    createdAt: row.created_at,
    viewerCount: row.viewer_count || 0,
    isRecording: toBool(row.is_recording),
    isLocalStream: row.stream_type === "local",
    thumbnail: row.thumbnail_url,
    userId: row.user_id,
    username: profile?.username,
    displayName: profile?.display_name,
    userAvatar: profile?.avatar_url,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    category: row.category,
    tags: parseJson<string[]>(row.tags, []),
    recordingUrl: row.recording_url,
    recordingExpiry: row.recording_expiry,
    streamType: (row.stream_type || "internet") as "local" | "internet",
  };
}

export function mapProfile(row: any) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    avatar: row.avatar_url,
    bio: row.bio,
    followers: row.followers_count || 0,
    following: row.following_count || 0,
    isStreamer: toBool(row.is_streamer),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeen: row.last_seen,
    preferences: parseJson(row.preferences, null),
    socialLinks: parseJson(row.social_links, []),
  };
}

export function mapChat(row: any, profile?: any) {
  return {
    id: row.id,
    streamId: row.stream_id,
    userId: row.user_id,
    username: profile?.username || "Anonymous",
    userAvatar: profile?.avatar_url,
    message: row.message,
    timestamp: row.created_at,
    isModerated: toBool(row.is_moderated),
    type: row.type || "text",
    metadata: parseJson(row.metadata, null),
  };
}
