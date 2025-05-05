
import { supabase } from "@/integrations/supabase/client";
import { ChatMessage } from "@/types";

export const chatService = {
  async getChatMessages(streamId: string, limit = 50): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from("chat_messages")
      .select(`
        id,
        message,
        created_at,
        type,
        metadata,
        is_moderated,
        profiles:user_id (
          id,
          username,
          avatar_url
        )
      `)
      .eq("stream_id", streamId)
      .order("created_at", { ascending: true })
      .limit(limit);
    
    if (error || !data) {
      console.error("Error fetching chat messages:", error);
      return [];
    }
    
    return data.map(item => ({
      id: item.id,
      streamId,
      userId: item.profiles.id,
      username: item.profiles.username,
      userAvatar: item.profiles.avatar_url,
      message: item.message,
      timestamp: new Date(item.created_at),
      isModerated: item.is_moderated,
      type: item.type as 'text' | 'emote' | 'donation' | 'system',
      metadata: item.metadata
    }));
  },
  
  async sendChatMessage(message: Omit<ChatMessage, "id" | "timestamp">): Promise<ChatMessage | null> {
    const { data, error } = await supabase
      .from("chat_messages")
      .insert({
        stream_id: message.streamId,
        user_id: message.userId,
        message: message.message,
        type: message.type || "text",
        metadata: message.metadata
      })
      .select()
      .single();
    
    if (error || !data) {
      console.error("Error sending chat message:", error);
      return null;
    }
    
    return {
      id: data.id,
      streamId: data.stream_id,
      userId: data.user_id,
      username: message.username,
      userAvatar: message.userAvatar,
      message: data.message,
      timestamp: new Date(data.created_at),
      isModerated: data.is_moderated,
      type: data.type as 'text' | 'emote' | 'donation' | 'system',
      metadata: data.metadata
    };
  }
};
