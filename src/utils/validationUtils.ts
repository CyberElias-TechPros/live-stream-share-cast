
import { z } from 'zod';

// Stream validation schemas
export const streamSettingsSchema = z.object({
  audio: z.object({
    enabled: z.boolean(),
    echoCancellation: z.boolean(),
    noiseSuppression: z.boolean(),
    autoGainControl: z.boolean(),
    deviceId: z.string().optional(),
  }),
  video: z.object({
    enabled: z.boolean(),
    width: z.number().min(320).max(4096),
    height: z.number().min(240).max(2160),
    frameRate: z.number().min(15).max(60),
    deviceId: z.string().optional(),
    facingMode: z.enum(['user', 'environment']).optional(),
  }),
  streaming: z.object({
    codec: z.enum(['H264', 'VP9', 'AV1']),
    bitrate: z.number().min(500000).max(50000000),
    keyFrameInterval: z.number().min(1).max(10),
    isLocalStream: z.boolean(),
    recordStream: z.boolean(),
    streamType: z.enum(['local', 'internet']),
    localSave: z.boolean(),
    recordingRetentionHours: z.number().min(1).max(168),
  }),
});

// User validation schemas
export const userProfileSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().max(100).optional(),
  email: z.string().email(),
  avatarUrl: z.string().url().optional(),
  bio: z.string().max(500).optional(),
  isStreamer: z.boolean(),
  followersCount: z.number().min(0),
  followingCount: z.number().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  lastSeen: z.string().datetime().optional(),
});

export const socialLinkSchema = z.object({
  platform: z.enum(['twitter', 'youtube', 'twitch', 'instagram', 'tiktok', 'discord', 'website']),
  url: z.string().url(),
  username: z.string().optional(),
});

// Input sanitization
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string');
  }
  
  return input
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}

// Email validation
export function isValidEmail(email: string): boolean {
  return z.string().email().safeParse(email).success;
}

// Username validation
export function isValidUsername(username: string): boolean {
  return z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).safeParse(username).success;
}

// Password strength validation
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// Safe JSON parsing with validation
export function safeJsonParse<T>(
  json: string | null | undefined,
  schema: z.ZodSchema<T>,
  defaultValue: T
): T {
  if (!json) return defaultValue;
  
  try {
    const parsed = JSON.parse(json);
    const result = schema.safeParse(parsed);
    
    if (result.success) {
      return result.data;
    } else {
      console.warn('JSON validation failed:', result.error);
      return defaultValue;
    }
  } catch (error) {
    console.warn('JSON parsing failed:', error);
    return defaultValue;
  }
}

// URL validation
export function isValidUrl(url: string): boolean {
  return z.string().url().safeParse(url).success;
}

// Stream ID validation
export function isValidStreamId(streamId: string): boolean {
  return z.string().uuid().safeParse(streamId).success;
}
