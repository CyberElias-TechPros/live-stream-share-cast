
import { SocialLink, UserPreferences } from "@/types";

/**
 * Safely parse JSON data to a specific type with validation
 * @param data The JSON data to parse
 * @param validator Optional validation function
 * @returns The parsed data or a default value
 */
export function safeParseJson<T>(
  data: unknown, 
  defaultValue: T,
  validator?: (parsed: unknown) => boolean
): T {
  if (data === null || data === undefined) {
    return defaultValue;
  }
  
  // If it's already the right type, return it
  if (typeof data === 'object' && data !== null) {
    if (validator && !validator(data)) {
      return defaultValue;
    }
    return data as T;
  }
  
  return defaultValue;
}

/**
 * Validate if an object is a SocialLink
 */
export function isSocialLink(obj: unknown): obj is SocialLink {
  return (
    typeof obj === 'object' && 
    obj !== null && 
    'platform' in obj && 
    'url' in obj &&
    typeof (obj as SocialLink).platform === 'string' &&
    typeof (obj as SocialLink).url === 'string'
  );
}

/**
 * Safely parse social links from JSON data
 */
export function parseSocialLinks(data: unknown): SocialLink[] {
  if (!Array.isArray(data)) {
    return [];
  }
  
  return data.filter(isSocialLink);
}

/**
 * Validate if an object is a UserPreferences object
 */
export function isUserPreferences(obj: unknown): obj is UserPreferences {
  return (
    typeof obj === 'object' && 
    obj !== null && 
    (
      'theme' in obj || 
      'notifications' in obj || 
      'privacy' in obj ||
      'streaming' in obj
    )
  );
}

/**
 * Safely parse UserPreferences from JSON data
 */
export function parseUserPreferences(data: unknown, defaultPrefs: UserPreferences): UserPreferences {
  if (data === null || data === undefined || typeof data !== 'object') {
    return defaultPrefs;
  }
  
  // Return a merged object with defaults for any missing properties
  return {
    ...defaultPrefs,
    ...(data as Partial<UserPreferences>)
  };
}
