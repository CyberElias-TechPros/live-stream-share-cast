/**
 * Profiles, follow graph and avatars — now served by the Cloudflare Worker.
 *
 * Public profile reads hit `/api/users/:id`; anything belonging to the signed-in
 * user hits `/api/users/me`, which returns the private fields (email,
 * preferences, social links).
 */

import { api, tokenStore } from '@/integrations/api/client';
import { defaultPreferences, toStreams, toUser, toUsers } from '@/integrations/api/mappers';
import type { Stream, User, UserPreferences } from '@/types';

function isMe(userId: string): boolean {
  return !!userId && tokenStore.userId === userId;
}

function mergePreferences(preferences?: UserPreferences | null): UserPreferences {
  return { ...defaultPreferences(), ...(preferences ?? {}) };
}

export const profileService = {
  async getProfile(userId: string): Promise<User | null> {
    try {
      const data = isMe(userId)
        ? await api.get<{ user: unknown }>('/users/me')
        : await api.get<{ user: unknown }>(`/users/${userId}`);
      const user = toUser(data.user);
      return { ...user, preferences: mergePreferences(user.preferences) };
    } catch (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
  },

  async getProfileByUsername(username: string): Promise<User | null> {
    try {
      const data = await api.get<{ user: unknown }>(`/profiles/${encodeURIComponent(username)}`);
      const user = toUser(data.user);
      return { ...user, preferences: mergePreferences(user.preferences) };
    } catch (error) {
      console.error('Error fetching profile by username:', error);
      return null;
    }
  },

  async updateProfile(userId: string, updates: Partial<User>): Promise<User | null> {
    try {
      const data = await api.patch<{ user: unknown }>('/users/me', {
        username: updates.username,
        displayName: updates.displayName,
        bio: updates.bio,
        avatar: updates.avatar,
        isStreamer: updates.isStreamer,
        socialLinks: updates.socialLinks,
        preferences: updates.preferences,
      });
      const user = toUser(data.user);
      return { ...user, preferences: mergePreferences(user.preferences) };
    } catch (error) {
      console.error('Error updating profile:', error);
      return null;
    }
  },

  async updateStreamerStatus(userId: string, isStreamer: boolean): Promise<boolean> {
    try {
      await api.post('/users/me/streamer', { isStreamer });
      return true;
    } catch (error) {
      console.error('Error updating streamer status:', error);
      return false;
    }
  },

  async updateUserPreferences(userId: string, preferences: Partial<UserPreferences>): Promise<boolean> {
    try {
      await api.patch('/users/me/preferences', { preferences });
      return true;
    } catch (error) {
      console.error('Error updating user preferences:', error);
      return false;
    }
  },

  async uploadAvatar(file: Blob, filename = 'avatar.png'): Promise<string | null> {
    try {
      const form = new FormData();
      form.append('file', file, filename);
      const data = await api.upload<{ url: string; user: unknown }>('/users/me/avatar', form);
      return data.url;
    } catch (error) {
      console.error('Error uploading avatar:', error);
      return null;
    }
  },

  async getUserStreams(userId: string): Promise<Stream[]> {
    try {
      const data = isMe(userId)
        ? await api.get<{ streams: unknown[] }>('/users/me/streams')
        : await api.get<{ streams: unknown[] }>(`/users/${userId}/streams`);
      return toStreams(data.streams);
    } catch (error) {
      console.error('Error fetching user streams:', error);
      return [];
    }
  },

  async getFollowers(userId: string): Promise<User[]> {
    try {
      const data = await api.get<{ users: unknown[] }>(`/users/${userId}/followers`);
      return toUsers(data.users);
    } catch (error) {
      console.error('Error fetching followers:', error);
      return [];
    }
  },

  async getFollowing(userId: string): Promise<User[]> {
    try {
      const data = await api.get<{ users: unknown[] }>(`/users/${userId}/following`);
      return toUsers(data.users);
    } catch (error) {
      console.error('Error fetching following:', error);
      return [];
    }
  },

  async followUser(followerId: string, followingId: string): Promise<boolean> {
    try {
      await api.put(`/users/${followingId}/follow`);
      return true;
    } catch (error) {
      console.error('Error following user:', error);
      return false;
    }
  },

  async unfollowUser(followerId: string, followingId: string): Promise<boolean> {
    try {
      await api.delete(`/users/${followingId}/follow`);
      return true;
    } catch (error) {
      console.error('Error unfollowing user:', error);
      return false;
    }
  },

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    try {
      const data = await api.get<{ isFollowing: boolean }>(`/users/${followingId}/follow`, { auth: true });
      return !!data.isFollowing;
    } catch {
      return false;
    }
  },
};

function defaultUserPreferences(): UserPreferences {
  return defaultPreferences();
}
