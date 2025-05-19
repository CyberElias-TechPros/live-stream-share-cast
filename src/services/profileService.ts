import { supabase } from "@/integrations/supabase/client";
import { User, UserPreferences, SocialLink, Stream } from "@/types";

export const profileService = {
  async getProfile(userId: string): Promise<User | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
      
    if (error || !data) {
      console.error("Error fetching profile:", error);
      return null;
    }
    
    return {
      id: data.id,
      username: data.username,
      email: data.email,
      displayName: data.display_name,
      avatar: data.avatar_url,
      bio: data.bio,
      followers: data.followers_count || 0,
      following: data.following_count || 0,
      isStreamer: data.is_streamer || false,
      createdAt: new Date(data.created_at),
      updatedAt: data.updated_at ? new Date(data.updated_at) : undefined,
      lastSeen: data.last_seen ? new Date(data.last_seen) : undefined,
      preferences: data.preferences as UserPreferences || defaultUserPreferences(),
      socialLinks: data.social_links as SocialLink[] || []
    };
  },
  
  async getProfileByUsername(username: string): Promise<User | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("username", username)
      .single();
      
    if (error || !data) {
      console.error("Error fetching profile by username:", error);
      return null;
    }
    
    return {
      id: data.id,
      username: data.username,
      email: data.email,
      displayName: data.display_name,
      avatar: data.avatar_url,
      bio: data.bio,
      followers: data.followers_count || 0,
      following: data.following_count || 0,
      isStreamer: data.is_streamer || false,
      createdAt: new Date(data.created_at),
      updatedAt: data.updated_at ? new Date(data.updated_at) : undefined,
      lastSeen: data.last_seen ? new Date(data.last_seen) : undefined,
      preferences: data.preferences as UserPreferences || defaultUserPreferences(),
      socialLinks: data.social_links as SocialLink[] || []
    };
  },
  
  async updateProfile(userId: string, updates: Partial<User>): Promise<User | null> {
    const { data, error } = await supabase
      .from("profiles")
      .update({
        username: updates.username,
        display_name: updates.displayName,
        bio: updates.bio,
        avatar_url: updates.avatar,
        is_streamer: updates.isStreamer,
        social_links: updates.socialLinks as any,
        preferences: updates.preferences as any,
        updated_at: new Date().toISOString()
      })
      .eq("id", userId)
      .select()
      .single();
    
    if (error || !data) {
      console.error("Error updating profile:", error);
      return null;
    }
    
    return {
      id: data.id,
      username: data.username,
      email: data.email,
      displayName: data.display_name,
      avatar: data.avatar_url,
      bio: data.bio,
      followers: data.followers_count || 0,
      following: data.following_count || 0,
      isStreamer: data.is_streamer || false,
      createdAt: new Date(data.created_at),
      updatedAt: data.updated_at ? new Date(data.updated_at) : undefined,
      lastSeen: data.last_seen ? new Date(data.last_seen) : undefined,
      preferences: data.preferences as UserPreferences || defaultUserPreferences(),
      socialLinks: data.social_links as SocialLink[] || []
    };
  },
  
  async updateStreamerStatus(userId: string, isStreamer: boolean): Promise<boolean> {
    const { error } = await supabase
      .from("profiles")
      .update({
        is_streamer: isStreamer,
        updated_at: new Date().toISOString()
      })
      .eq("id", userId);
    
    if (error) {
      console.error("Error updating streamer status:", error);
      return false;
    }
    
    return true;
  },
  
  async updateUserPreferences(userId: string, preferences: Partial<UserPreferences>): Promise<boolean> {
    const { data: currentData, error: fetchError } = await supabase
      .from("profiles")
      .select("preferences")
      .eq("id", userId)
      .single();
      
    if (fetchError) {
      console.error("Error fetching current preferences:", fetchError);
      return false;
    }
    
    const currentPreferences = currentData?.preferences || defaultUserPreferences();
    const updatedPreferences = {
      ...currentPreferences,
      ...preferences
    };
    
    const { error } = await supabase
      .from("profiles")
      .update({
        preferences: updatedPreferences,
        updated_at: new Date().toISOString()
      })
      .eq("id", userId);
    
    if (error) {
      console.error("Error updating user preferences:", error);
      return false;
    }
    
    return true;
  },
  
  async getUserStreams(userId: string): Promise<Stream[]> {
    const { data, error } = await supabase
      .from("streams")
      .select(`
        *,
        profiles:user_id (
          username,
          display_name,
          avatar_url
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("Error fetching user streams:", error);
      return [];
    }
    
    return (data || []).map(stream => ({
      id: stream.id,
      title: stream.title,
      description: stream.description,
      isLive: stream.is_live,
      streamKey: stream.stream_key,
      createdAt: new Date(stream.created_at),
      viewerCount: stream.viewer_count || 0,
      isRecording: stream.is_recording || false,
      isLocalStream: stream.stream_type === 'local',
      thumbnail: stream.thumbnail_url,
      userId: stream.user_id,
      startedAt: stream.started_at ? new Date(stream.started_at) : undefined,
      endedAt: stream.ended_at ? new Date(stream.ended_at) : undefined,
      category: stream.category,
      tags: stream.tags || [],
      username: stream.profiles?.username,
      displayName: stream.profiles?.display_name,
      userAvatar: stream.profiles?.avatar_url,
      recordingUrl: stream.recording_url,
      recordingExpiry: stream.recording_expiry ? new Date(stream.recording_expiry) : undefined,
      streamType: (stream.stream_type || 'internet') as 'local' | 'internet'
    }));
  },
  
  async getFollowers(userId: string): Promise<User[]> {
    const { data, error } = await supabase
      .from("followers")
      .select(`
        follower_id,
        follower:follower_id (*)
      `)
      .eq("following_id", userId);
    
    if (error) {
      console.error("Error fetching followers:", error);
      return [];
    }
    
    return (data || []).map(item => ({
      id: item.follower.id,
      username: item.follower.username,
      email: item.follower.email,
      displayName: item.follower.display_name,
      avatar: item.follower.avatar_url,
      bio: item.follower.bio,
      followers: item.follower.followers_count || 0,
      following: item.follower.following_count || 0,
      isStreamer: item.follower.is_streamer || false,
      createdAt: new Date(item.follower.created_at),
      updatedAt: item.follower.updated_at ? new Date(item.follower.updated_at) : undefined,
      lastSeen: item.follower.last_seen ? new Date(item.follower.last_seen) : undefined
    }));
  },
  
  async getFollowing(userId: string): Promise<User[]> {
    const { data, error } = await supabase
      .from("followers")
      .select(`
        following_id,
        following:following_id (*)
      `)
      .eq("follower_id", userId);
    
    if (error) {
      console.error("Error fetching following:", error);
      return [];
    }
    
    return (data || []).map(item => ({
      id: item.following.id,
      username: item.following.username,
      email: item.following.email,
      displayName: item.following.display_name,
      avatar: item.following.avatar_url,
      bio: item.following.bio,
      followers: item.following.followers_count || 0,
      following: item.following.following_count || 0,
      isStreamer: item.following.is_streamer || false,
      createdAt: new Date(item.following.created_at),
      updatedAt: item.following.updated_at ? new Date(item.following.updated_at) : undefined,
      lastSeen: item.following.last_seen ? new Date(item.following.last_seen) : undefined
    }));
  },
  
  async followUser(followerId: string, followingId: string): Promise<boolean> {
    const { error } = await supabase
      .from("followers")
      .insert({
        follower_id: followerId,
        following_id: followingId
      });
    
    if (error) {
      console.error("Error following user:", error);
      return false;
    }
    
    return true;
  },
  
  async unfollowUser(followerId: string, followingId: string): Promise<boolean> {
    const { error } = await supabase
      .from("followers")
      .delete()
      .eq("follower_id", followerId)
      .eq("following_id", followingId);
    
    if (error) {
      console.error("Error unfollowing user:", error);
      return false;
    }
    
    return true;
  },
  
  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("followers")
      .select("*")
      .eq("follower_id", followerId)
      .eq("following_id", followingId)
      .single();
    
    if (error) {
      return false;
    }
    
    return !!data;
  }
};

function defaultUserPreferences(): UserPreferences {
  return {
    theme: 'system',
    notifications: {
      email: true,
      push: true,
      streamStart: true,
      comments: true,
      followers: true
    },
    privacy: {
      showOnlineStatus: true,
      allowMessages: true,
      showProfileToUnregistered: true
    },
    streaming: {
      defaultStreamType: 'internet',
      defaultQuality: '720p',
      autoRecord: false,
      autoDeleteRecordings: true,
      recordingRetentionHours: 6
    }
  };
}
