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
    isAdmin: !!dto.isAdmin,
    emailVerified: dto.emailVerified === undefined ? undefined : !!dto.emailVerified,
    createdAt: toDate(dto.createdAt) ?? new Date(),
    updatedAt: toDate(dto.updatedAt),
    lastSeen: toDate(dto.lastSeen),
    socialLinks: (dto.socialLinks ?? undefined) as SocialLink[] | undefined,
    websiteUrl: dto.websiteUrl ?? null,
    donationUrl: dto.donationUrl ?? null,
    pronouns: dto.pronouns ?? null,
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

/* ------------------------ notifications / VOD / schedule ---------------------- */

export function toNotification(dto: any) {
  return {
    id: dto.id,
    type: dto.type ?? 'system',
    title: dto.title ?? '',
    body: dto.body ?? undefined,
    url: dto.url ?? undefined,
    actorId: dto.actorId ?? undefined,
    actorUsername: dto.actorUsername ?? undefined,
    actorAvatar: dto.actorAvatar ?? undefined,
    streamId: dto.streamId ?? undefined,
    data: dto.data ?? null,
    readAt: toDate(dto.readAt),
    createdAt: toDate(dto.createdAt) ?? new Date(),
  };
}

export const toNotifications = (rows: any[] | undefined) => (rows ?? []).map(toNotification);

export function toRecording(dto: any) {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description ?? undefined,
    url: dto.url ?? null,
    thumbnail: dto.thumbnail ?? null,
    durationSeconds: dto.durationSeconds ?? null,
    sizeBytes: dto.sizeBytes ?? null,
    mimeType: dto.mimeType ?? null,
    visibility: (dto.visibility ?? 'public') as 'public' | 'unlisted' | 'private',
    status: dto.status ?? 'ready',
    source: dto.source ?? 'live',
    views: dto.views ?? 0,
    watchMinutes: dto.watchMinutes ?? 0,
    category: dto.category ?? null,
    tags: dto.tags ?? [],
    isMature: !!dto.isMature,
    clipOf: dto.clipOf ?? null,
    clipStart: dto.clipStart ?? null,
    clipEnd: dto.clipEnd ?? null,
    retentionExpiresAt: toDate(dto.retentionExpiresAt) ?? null,
    publishedAt: toDate(dto.publishedAt) ?? null,
    createdAt: toDate(dto.createdAt) ?? new Date(),
    updatedAt: toDate(dto.updatedAt) ?? null,
    streamId: dto.streamId ?? null,
    userId: dto.userId,
    username: dto.username ?? undefined,
    displayName: dto.displayName ?? undefined,
    userAvatar: dto.userAvatar ?? undefined,
    isOwner: !!dto.isOwner,
    isClip: !!dto.isClip,
  };
}

export const toRecordings = (rows: any[] | undefined) => (rows ?? []).map(toRecording);

export function toScheduledBroadcast(dto: any) {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description ?? null,
    category: dto.category ?? null,
    tags: dto.tags ?? [],
    thumbnail: dto.thumbnail ?? null,
    scheduledFor: toDate(dto.scheduledFor) ?? new Date(),
    durationMinutes: dto.durationMinutes ?? null,
    timezone: dto.timezone ?? null,
    status: dto.status ?? 'scheduled',
    streamId: dto.streamId ?? null,
    reminderCount: dto.reminderCount ?? 0,
    reminderSentAt: toDate(dto.reminderSentAt) ?? null,
    createdAt: toDate(dto.createdAt) ?? new Date(),
    userId: dto.userId,
    username: dto.username ?? undefined,
    displayName: dto.displayName ?? undefined,
    userAvatar: dto.userAvatar ?? undefined,
    isOwner: !!dto.isOwner,
    isReminded: !!dto.isReminded,
  };
}

export const toScheduledBroadcasts = (rows: any[] | undefined) => (rows ?? []).map(toScheduledBroadcast);

export function toReport(dto: any) {
  return {
    id: dto.id,
    targetType: dto.targetType,
    targetId: dto.targetId,
    reason: dto.reason,
    details: dto.details ?? null,
    status: dto.status ?? 'open',
    resolution: dto.resolution ?? null,
    createdAt: toDate(dto.createdAt) ?? new Date(),
    reporterUsername: dto.reporterUsername ?? null,
    targetUsername: dto.targetUsername ?? null,
  };
}

export const toReports = (rows: any[] | undefined) => (rows ?? []).map(toReport);
