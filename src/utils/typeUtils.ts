
import { SocialLink, UserPreferences } from "@/types";
import { z } from "zod";

/**
 * Enhanced type-safe JSON parsing with Zod validation
 */
export function safeParseJson<T>(
  data: unknown, 
  defaultValue: T,
  validator?: (parsed: unknown) => boolean
): T {
  if (data === null || data === undefined) {
    return defaultValue;
  }
  
  // If it's already the right type, validate if validator provided
  if (typeof data === 'object' && data !== null) {
    if (validator && !validator(data)) {
      console.warn('Type validation failed for parsed data');
      return defaultValue;
    }
    return data as T;
  }
  
  return defaultValue;
}

/**
 * Type guard for SocialLink with enhanced validation
 */
export function isSocialLink(obj: unknown): obj is SocialLink {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  
  const link = obj as Record<string, unknown>;
  
  return (
    typeof link.platform === 'string' &&
    typeof link.url === 'string' &&
    ['twitter', 'youtube', 'twitch', 'instagram', 'tiktok', 'discord', 'website'].includes(link.platform) &&
    isValidUrl(link.url)
  );
}

/**
 * Type guard for UserPreferences with validation
 */
export function isUserPreferences(obj: unknown): obj is UserPreferences {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  
  const prefs = obj as Record<string, unknown>;
  
  // Check if it has at least one valid preference category
  return (
    ('theme' in prefs && typeof prefs.theme === 'object') ||
    ('notifications' in prefs && typeof prefs.notifications === 'object') ||
    ('privacy' in prefs && typeof prefs.privacy === 'object') ||
    ('streaming' in prefs && typeof prefs.streaming === 'object')
  );
}

/**
 * Enhanced social links parser with validation
 */
export function parseSocialLinks(data: unknown): SocialLink[] {
  if (!Array.isArray(data)) {
    return [];
  }
  
  return data
    .filter(isSocialLink)
    .slice(0, 10); // Limit to prevent abuse
}

/**
 * Enhanced UserPreferences parser with defaults
 */
export function parseUserPreferences(
  data: unknown, 
  defaultPrefs: UserPreferences
): UserPreferences {
  if (!data || typeof data !== 'object') {
    return defaultPrefs;
  }
  
  // Deep merge with validation
  const parsedData = data as Partial<UserPreferences>;
  
  return {
    theme: {
      ...defaultPrefs.theme,
      ...(parsedData.theme && typeof parsedData.theme === 'object' ? parsedData.theme : {})
    },
    notifications: {
      ...defaultPrefs.notifications,
      ...(parsedData.notifications && typeof parsedData.notifications === 'object' ? parsedData.notifications : {})
    },
    privacy: {
      ...defaultPrefs.privacy,
      ...(parsedData.privacy && typeof parsedData.privacy === 'object' ? parsedData.privacy : {})
    },
    streaming: {
      ...defaultPrefs.streaming,
      ...(parsedData.streaming && typeof parsedData.streaming === 'object' ? parsedData.streaming : {})
    }
  };
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Type-safe array validator
 */
export function isArrayOf<T>(
  data: unknown,
  itemValidator: (item: unknown) => item is T
): data is T[] {
  return Array.isArray(data) && data.every(itemValidator);
}

/**
 * Safe string converter with length limits
 */
export function safeString(
  value: unknown,
  maxLength: number = 1000,
  defaultValue: string = ''
): string {
  if (typeof value !== 'string') {
    return defaultValue;
  }
  
  return value.slice(0, maxLength).trim();
}

/**
 * Safe number converter with range validation
 */
export function safeNumber(
  value: unknown,
  min?: number,
  max?: number,
  defaultValue: number = 0
): number {
  const num = Number(value);
  
  if (isNaN(num)) {
    return defaultValue;
  }
  
  if (min !== undefined && num < min) {
    return min;
  }
  
  if (max !== undefined && num > max) {
    return max;
  }
  
  return num;
}

/**
 * Safe boolean converter
 */
export function safeBoolean(value: unknown, defaultValue: boolean = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }
  
  if (typeof value === 'number') {
    return value !== 0;
  }
  
  return defaultValue;
}

/**
 * Deep clone with type safety
 */
export function safeClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj;
  }
}
