
import { supabase } from "@/integrations/supabase/client";
import { ChatMessage } from "@/types";

export const chatService = {
  async getChatMessages(streamId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("stream_id", streamId)
      .order("created_at", { ascending: true });
      
    if (error) {
      console.error("Error fetching chat messages:", error);
      return [];
    }
    
    return (data || []).map(message => ({
      id: message.id,
      streamId: message.stream_id,
      userId: message.user_id,
      username: message.username || 'Anonymous',
      userAvatar: message.avatar_url,
      message: message.message,
      timestamp: new Date(message.created_at),
      isModerated: message.is_moderated || false,
      type: message.type || 'text',
      metadata: message.metadata
    }));
  },
  
  async sendChatMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<ChatMessage | null> {
    const { data, error } = await supabase
      .from("chat_messages")
      .insert({
        stream_id: message.streamId,
        user_id: message.userId,
        username: message.username,
        avatar_url: message.userAvatar,
        message: message.message,
        type: message.type || 'text',
        is_moderated: message.isModerated || false,
        metadata: message.metadata
      })
      .select()
      .single();
      
    if (error) {
      console.error("Error sending chat message:", error);
      return null;
    }
    
    return {
      id: data.id,
      streamId: data.stream_id,
      userId: data.user_id,
      username: data.username || 'Anonymous',
      userAvatar: data.avatar_url,
      message: data.message,
      timestamp: new Date(data.created_at),
      isModerated: data.is_moderated || false,
      type: data.type || 'text',
      metadata: data.metadata
    };
  },
  
  async moderateMessage(messageId: string, isModerated: boolean): Promise<boolean> {
    const { error } = await supabase
      .from("chat_messages")
      .update({ is_moderated: isModerated })
      .eq("id", messageId);
      
    if (error) {
      console.error("Error moderating message:", error);
      return false;
    }
    
    return true;
  },
  
  async deleteMessage(messageId: string): Promise<boolean> {
    const { error } = await supabase
      .from("chat_messages")
      .delete()
      .eq("id", messageId);
      
    if (error) {
      console.error("Error deleting message:", error);
      return false;
    }
    
    return true;
  },
  
  async getRecentChatMessages(streamId: string, limit: number = 50): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("stream_id", streamId)
      .eq("is_moderated", false)
      .order("created_at", { ascending: false })
      .limit(limit);
      
    if (error) {
      console.error("Error fetching recent chat messages:", error);
      return [];
    }
    
    return (data || []).map(message => ({
      id: message.id,
      streamId: message.stream_id,
      userId: message.user_id,
      username: message.username || 'Anonymous',
      userAvatar: message.avatar_url,
      message: message.message,
      timestamp: new Date(message.created_at),
      isModerated: message.is_moderated || false,
      type: message.type || 'text',
      metadata: message.metadata
    })).reverse(); // Reverse to get chronological order
  }
};
