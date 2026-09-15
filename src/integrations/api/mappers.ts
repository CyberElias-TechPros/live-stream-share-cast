/**
 * DTO → domain model mappers.
 *
 * The Worker already speaks camelCase; all these do is revive the fields the
 * app models as `Date` and normalise optional/null values.
 */

import type { ChatMessage, Stream, StreamSession, StreamStats, User, UserPreferences, SocialLink } from '@/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

function toDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function toStream(dto: any): Stream {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description ?? undefined,
    isLive: !!dto.isLive,
    streamKey: dto.streamKey ?? '',
    createdAt: toDate(dto.createdAt) ?? new Date(),
    viewerCount: dto.viewerCount ?? 0,
    isRecording: !!dto.isRecording,
    isLocalStream: dto.streamType === 'local' || !!dto.isLocalStream,
    thumbnail: dto.thumbnail ?? undefined,
    url: dto.url ?? dto.recordingUrl ?? undefined,
    userId: dto.userId,
    roomId: dto.roomId ?? dto.id,
    qualityOptions: dto.qualityOptions,
    startedAt: toDate(dto.startedAt),
    endedAt: toDate(dto.endedAt),
    bandwidth: dto.bandwidth,
    category: dto.category ?? undefined,
    tags: dto.tags ?? [],
    username: dto.username ?? undefined,
    displayName: dto.displayName ?? undefined,
    userAvatar: dto.userAvatar ?? dto.avatar ?? undefined,
    recordingUrl: dto.recordingUrl ?? undefined,
    recordingExpiry: toDate(dto.recordingExpiry),
    streamType: dto.streamType === 'local' ? 'local' : 'internet',
    ...('peakViewers' in dto ? { peakViewers: dto.peakViewers } : {}),
    ...('hostConnected' in dto ? { hostConnected: !!dto.hostConnected } : {}),
  } as Stream;
}

export const toStreams = (rows: any[] | undefined): Stream[] => (rows ?? []).map(toStream);

export function toChatMessage(dto: any): ChatMessage {
  return {
    id: dto.id,
    streamId: dto.streamId,
    userId: dto.userId ?? '',
    username: dto.username ?? 'Anonymous',
    userAvatar: dto.userAvatar ?? undefined,
    message: dto.message,
    timestamp: toDate(dto.timestamp) ?? new Date(),
    isModerated: !!dto.isModerated,
    type: (dto.type ?? 'text') as ChatMessage['type'],
    metadata: dto.metadata ?? undefined,
  };
}

export const toChatMessages = (rows: any[] | undefined): ChatMessage[] => (rows ?? []).map(toChatMessage);

export function defaultPreferences(): UserPreferences {
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

export function toUser(dto: any): User {
  return {
    id: dto.id,
    username: dto.username,
    email: dto.email ?? '',
    avatar: dto.avatar ?? undefined,
    displayName: dto.displayName ?? dto.username,
    bio: dto.bio ?? undefined,
    followers: dto.followers ?? 0,
    following: dto.following ?? 0,
    isStreamer: !!dto.isStreamer,
    createdAt: toDate(dto.createdAt) ?? new Date(),
    updatedAt: toDate(dto.updatedAt),
    lastSeen: toDate(dto.lastSeen),
    socialLinks: (dto.socialLinks ?? undefined) as SocialLink[] | undefined,
    preferences: (dto.preferences ?? defaultPreferences()) as UserPreferences,
  };
}

export const toUsers = (rows: any[] | undefined): User[] => (rows ?? []).map(toUser);

export function toStreamSession(dto: any): StreamSession {
  return {
    id: dto.id,
    streamId: dto.streamId,
    userId: dto.userId,
    startedAt: toDate(dto.startedAt) ?? new Date(),
    endedAt: toDate(dto.endedAt),
    viewerCount: dto.viewerCount ?? 0,
    duration: dto.duration ?? undefined,
    recordingUrl: dto.recordingUrl ?? undefined,
    recordingExpiry: toDate(dto.recordingExpiry),
    peakViewers: dto.peakViewers ?? undefined,
    avgViewDuration: dto.avgViewDuration ?? undefined,
    streamType: dto.streamType === 'local' ? 'local' : 'internet',
  };
}

export const toStreamSessions = (rows: any[] | undefined): StreamSession[] => (rows ?? []).map(toStreamSession);

export function toStreamStats(dto: any): StreamStats {
  return {
    timestamp: toDate(dto.timestamp) ?? new Date(),
    viewerCount: dto.viewerCount ?? 0,
    bandwidth: dto.bandwidth ?? 0,
    cpuUsage: dto.cpuUsage ?? undefined,
    memoryUsage: dto.memoryUsage ?? undefined,
    errors: dto.errors ?? [],
  };
}

export const toStreamStatsList = (rows: any[] | undefined): StreamStats[] => (rows ?? []).map(toStreamStats);
