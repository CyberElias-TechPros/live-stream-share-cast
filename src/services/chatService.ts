
import { supabase } from "@/integrations/supabase/client";
import { ChatMessage } from "@/types";

interface SendChatMessageParams {
  streamId: string;
  userId: string;
  username: string;
  userAvatar?: string;
  message: string;
  type?: 'text' | 'emote' | 'donation' | 'system';
  metadata?: any;
}

export const chatService = {
  async getChatMessages(streamId: string): Promise<ChatMessage[]> {
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select(`
          *,
          profiles:user_id (
            username,
            avatar_url
          )
        `)
        .eq("stream_id", streamId)
        .order("created_at", { ascending: true });
        
      if (error) {
        console.error("Error fetching chat messages:", error);
        return [];
      }
      
      return (data || []).map(msg => ({
        id: msg.id,
        streamId: msg.stream_id,
        userId: msg.user_id,
        username: msg.profiles?.username || "Anonymous",
        userAvatar: msg.profiles?.avatar_url,
        message: msg.message,
        timestamp: new Date(msg.created_at),
        isModerated: msg.is_moderated || false,
        type: (msg.type as 'text' | 'emote' | 'donation' | 'system') || 'text',
        metadata: msg.metadata
      }));
    } catch (err) {
      console.error("Error in getChatMessages:", err);
      return [];
    }
  },
  
  async sendChatMessage(params: SendChatMessageParams): Promise<ChatMessage | null> {
    try {
      const { streamId, userId, username, userAvatar, message, type = 'text', metadata } = params;
      
      const { data, error } = await supabase
        .from("chat_messages")
        .insert({
          stream_id: streamId,
          user_id: userId,
          message,
          type,
          metadata,
          created_at: new Date().toISOString()
        })
        .select(`
          *,
          profiles:user_id (
            username,
            avatar_url
          )
        `)
        .single();
        
      if (error || !data) {
        console.error("Error sending chat message:", error);
        return null;
      }
      
      return {
        id: data.id,
        streamId: data.stream_id,
        userId: data.user_id,
        username: data.profiles?.username || username,
        userAvatar: data.profiles?.avatar_url || userAvatar,
        message: data.message,
        timestamp: new Date(data.created_at),
        isModerated: data.is_moderated || false,
        type: (data.type as 'text' | 'emote' | 'donation' | 'system'),
        metadata: data.metadata
      };
    } catch (err) {
      console.error("Error in sendChatMessage:", err);
      return null;
    }
  },
  
  async moderateMessage(messageId: string, isModerated: boolean): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("chat_messages")
        .update({ is_moderated: isModerated })
        .eq("id", messageId);
        
      if (error) {
        console.error("Error moderating message:", error);
        return false;
      }
      
      return true;
    } catch (err) {
      console.error("Error in moderateMessage:", err);
      return false;
    }
  },
  
  async getLatestChatMessages(streamId: string, limit: number = 50): Promise<ChatMessage[]> {
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select(`
          *,
          profiles:user_id (
            username,
            avatar_url
          )
        `)
        .eq("stream_id", streamId)
        .eq("is_moderated", false)
        .order("created_at", { ascending: false })
        .limit(limit);
        
      if (error) {
        console.error("Error fetching latest chat messages:", error);
        return [];
      }
      
      return (data || []).map(msg => ({
        id: msg.id,
        streamId: msg.stream_id,
        userId: msg.user_id,
        username: msg.profiles?.username || "Anonymous",
        userAvatar: msg.profiles?.avatar_url,
        message: msg.message,
        timestamp: new Date(msg.created_at),
        isModerated: msg.is_moderated || false,
        type: (msg.type as 'text' | 'emote' | 'donation' | 'system') || 'text',
        metadata: msg.metadata
      })).reverse(); // Reverse to get chronological order
    } catch (err) {
      console.error("Error in getLatestChatMessages:", err);
      return [];
    }
  }
};
