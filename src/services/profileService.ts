
import { supabase } from "@/integrations/supabase/client";
import { User } from "@/types";

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
      lastSeen: data.last_seen ? new Date(data.last_seen) : undefined
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
      lastSeen: data.last_seen ? new Date(data.last_seen) : undefined
    };
  }
};
