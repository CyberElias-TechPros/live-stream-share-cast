import { supabase } from "@/integrations/supabase/client";
import { User, UserPreferences, SocialLink, Stream } from "@/types";
import { parseSocialLinks, parseUserPreferences } from "@/utils/typeUtils";

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
    
    // Use type-safe parsing for JSON fields
    const preferences = parseUserPreferences(data.preferences, defaultUserPreferences());
    const socialLinks = parseSocialLinks(data.social_links);
    
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
      preferences,
      socialLinks
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
    
    // Use type-safe parsing for JSON fields
    const preferences = parseUserPreferences(data.preferences, defaultUserPreferences());
    const socialLinks = parseSocialLinks(data.social_links);
    
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
      preferences,
      socialLinks
    };
  },
  
  async updateProfile(userId: string, updates: Partial<User>): Promise<User | null> {
    // Create an object with only the fields that should be updated
    const updateData: Record<string, any> = {};
    
    if (updates.username !== undefined) updateData.username = updates.username;
    if (updates.displayName !== undefined) updateData.display_name = updates.displayName;
    if (updates.bio !== undefined) updateData.bio = updates.bio;
    if (updates.avatar !== undefined) updateData.avatar_url = updates.avatar;
    if (updates.isStreamer !== undefined) updateData.is_streamer = updates.isStreamer;
    if (updates.socialLinks !== undefined) updateData.social_links = updates.socialLinks;
    if (updates.preferences !== undefined) updateData.preferences = updates.preferences;
    
    // Add updated_at timestamp
    updateData.updated_at = new Date().toISOString();
    
    const { data, error } = await supabase
      .from("profiles")
      .update(updateData)
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
      socialLinks: data.social_links ? (data.social_links as unknown as SocialLink[]) : []
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
    
    // Safely parse the current preferences using our utility function
    const currentPreferences = parseUserPreferences(currentData?.preferences, defaultUserPreferences());
    
    // Create updated preferences object by merging current and new preferences
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
    // Fix: Properly specify the relationship with explicit column naming
    const { data, error } = await supabase
      .from("followers")
      .select(`
        follower_id,
        follower_profiles:profiles!follower_id(
          id, username, email, display_name, avatar_url, bio, 
          followers_count, following_count, is_streamer,
          created_at, updated_at, last_seen, preferences, social_links
        )
      `)
      .eq("following_id", userId);
    
    if (error) {
      console.error("Error fetching followers:", error);
      return [];
    }
    
    return (data || []).map(item => {
      const profile = item.follower_profiles;
      if (!profile) return null;
      
      // Use type-safe parsing for JSON fields
      const preferences = parseUserPreferences(profile.preferences, defaultUserPreferences());
      const socialLinks = parseSocialLinks(profile.social_links);
      
      return {
        id: profile.id,
        username: profile.username,
        email: profile.email,
        displayName: profile.display_name,
        avatar: profile.avatar_url,
        bio: profile.bio,
        followers: profile.followers_count || 0,
        following: profile.following_count || 0,
        isStreamer: profile.is_streamer || false,
        createdAt: new Date(profile.created_at),
        updatedAt: profile.updated_at ? new Date(profile.updated_at) : undefined,
        lastSeen: profile.last_seen ? new Date(profile.last_seen) : undefined,
        preferences,
        socialLinks
      };
    }).filter(Boolean) as User[];
  },
  
  async getFollowing(userId: string): Promise<User[]> {
    // Fix: Properly specify the relationship with explicit column naming
    const { data, error } = await supabase
      .from("followers")
      .select(`
        following_id,
        following_profiles:profiles!following_id(
          id, username, email, display_name, avatar_url, bio, 
          followers_count, following_count, is_streamer,
          created_at, updated_at, last_seen, preferences, social_links
        )
      `)
      .eq("follower_id", userId);
    
    if (error) {
      console.error("Error fetching following:", error);
      return [];
    }
    
    return (data || []).map(item => {
      const profile = item.following_profiles;
      if (!profile) return null;
      
      // Use type-safe parsing for JSON fields
      const preferences = parseUserPreferences(profile.preferences, defaultUserPreferences());
      const socialLinks = parseSocialLinks(profile.social_links);
      
      return {
        id: profile.id,
        username: profile.username,
        email: profile.email,
        displayName: profile.display_name,
        avatar: profile.avatar_url,
        bio: profile.bio,
        followers: profile.followers_count || 0,
        following: profile.following_count || 0,
        isStreamer: profile.is_streamer || false,
        createdAt: new Date(profile.created_at),
        updatedAt: profile.updated_at ? new Date(profile.updated_at) : undefined,
        lastSeen: profile.last_seen ? new Date(profile.last_seen) : undefined,
        preferences,
        socialLinks
      };
    }).filter(Boolean) as User[];
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
