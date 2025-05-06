
import { supabase } from "@/integrations/supabase/client";
import { Stream, StreamStats, StreamError, StreamSession } from "@/types";

export const liveStreamService = {
  async getAllStreams(): Promise<Stream[]> {
    const { data, error } = await supabase
      .from("streams")
      .select(`
        id,
        title,
        description,
        stream_key,
        is_live,
        is_recording,
        started_at,
        ended_at,
        created_at,
        viewer_count,
        thumbnail_url,
        category,
        tags,
        stream_type,
        recording_url,
        recording_expiry,
        profiles:user_id (
          id, 
          username, 
          display_name,
          avatar_url
        )
      `)
      .eq("is_live", true)
      .order("viewer_count", { ascending: false });
    
    if (error) {
      console.error("Error fetching streams:", error);
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
      userId: stream.profiles.id,
      username: stream.profiles.username,
      displayName: stream.profiles.display_name,
      userAvatar: stream.profiles.avatar_url,
      startedAt: stream.started_at ? new Date(stream.started_at) : undefined,
      endedAt: stream.ended_at ? new Date(stream.ended_at) : undefined,
      category: stream.category,
      tags: stream.tags || [],
      recordingUrl: stream.recording_url,
      recordingExpiry: stream.recording_expiry ? new Date(stream.recording_expiry) : undefined,
      streamType: stream.stream_type || 'internet'
    }));
  },
  
  async getStreamById(streamId: string): Promise<Stream | null> {
    const { data, error } = await supabase
      .from("streams")
      .select(`
        id,
        title,
        description,
        stream_key,
        is_live,
        is_recording,
        started_at,
        ended_at,
        created_at,
        viewer_count,
        thumbnail_url,
        category,
        tags,
        stream_type,
        recording_url,
        recording_expiry,
        profiles:user_id (
          id, 
          username, 
          display_name,
          avatar_url
        )
      `)
      .eq("id", streamId)
      .single();
    
    if (error || !data) {
      console.error("Error fetching stream:", error);
      return null;
    }
    
    return {
      id: data.id,
      title: data.title,
      description: data.description,
      isLive: data.is_live,
      streamKey: data.stream_key,
      createdAt: new Date(data.created_at),
      viewerCount: data.viewer_count || 0,
      isRecording: data.is_recording || false,
      isLocalStream: data.stream_type === 'local',
      thumbnail: data.thumbnail_url,
      userId: data.profiles.id,
      username: data.profiles.username,
      displayName: data.profiles.display_name,
      userAvatar: data.profiles.avatar_url,
      startedAt: data.started_at ? new Date(data.started_at) : undefined,
      endedAt: data.ended_at ? new Date(data.ended_at) : undefined,
      category: data.category,
      tags: data.tags || [],
      recordingUrl: data.recording_url,
      recordingExpiry: data.recording_expiry ? new Date(data.recording_expiry) : undefined,
      streamType: data.stream_type || 'internet'
    };
  },
  
  async createStream(stream: Partial<Stream>): Promise<Stream | null> {
    // First get the stream key from our edge function
    const { data: keyData, error: keyError } = await supabase.functions.invoke("generate-stream-key");
    
    if (keyError || !keyData) {
      console.error("Error generating stream key:", keyError);
      return null;
    }
    
    const streamKey = keyData.stream_key;
    
    // Calculate recording expiry time if needed
    let recordingExpiry = null;
    if (stream.isRecording) {
      const expiryHours = 6; // Default to 6 hours
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + expiryHours);
      recordingExpiry = expiryDate.toISOString();
    }
    
    // Now create the stream
    const { data, error } = await supabase
      .from("streams")
      .insert({
        title: stream.title || "Untitled Stream",
        description: stream.description,
        stream_key: streamKey,
        user_id: stream.userId,
        category: stream.category,
        tags: stream.tags || [],
        stream_type: stream.streamType || 'internet',
        recording_expiry: recordingExpiry
      })
      .select()
      .single();
    
    if (error || !data) {
      console.error("Error creating stream:", error);
      return null;
    }
    
    return {
      id: data.id,
      title: data.title,
      description: data.description,
      isLive: data.is_live || false,
      streamKey: data.stream_key,
      createdAt: new Date(data.created_at),
      viewerCount: data.viewer_count || 0,
      isRecording: data.is_recording || false,
      isLocalStream: data.stream_type === 'local',
      thumbnail: data.thumbnail_url,
      userId: data.user_id,
      startedAt: data.started_at ? new Date(data.started_at) : undefined,
      endedAt: data.ended_at ? new Date(data.ended_at) : undefined,
      category: data.category,
      tags: data.tags || [],
      recordingUrl: data.recording_url,
      recordingExpiry: data.recording_expiry ? new Date(data.recording_expiry) : undefined,
      streamType: data.stream_type || 'internet'
    };
  },
  
  async startStream(streamId: string, isRecording: boolean = false): Promise<boolean> {
    // Calculate recording expiry time if needed
    let updates: any = {
      is_live: true,
      started_at: new Date().toISOString(),
      ended_at: null,
      is_recording: isRecording
    };
    
    if (isRecording) {
      const expiryHours = 6; // Default to 6 hours
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + expiryHours);
      updates.recording_expiry = expiryDate.toISOString();
    }
    
    const { error } = await supabase
      .from("streams")
      .update(updates)
      .eq("id", streamId);
    
    if (error) {
      console.error("Error starting stream:", error);
      return false;
    }
    
    // Get stream details to create session
    const { data: streamData } = await supabase
      .from("streams")
      .select("user_id, stream_type")
      .eq("id", streamId)
      .single();
    
    if (!streamData) {
      console.error("Error fetching stream data for session creation");
      return false;
    }
    
    // Create a stream session
    const { error: sessionError } = await supabase
      .from("stream_sessions")
      .insert({
        stream_id: streamId,
        user_id: streamData.user_id,
        stream_type: streamData.stream_type || 'internet'
      });
    
    if (sessionError) {
      console.error("Error creating stream session:", sessionError);
    }
    
    return !error;
  },
  
  async stopStream(streamId: string): Promise<boolean> {
    const now = new Date().toISOString();
    
    const { error } = await supabase
      .from("streams")
      .update({
        is_live: false,
        ended_at: now
      })
      .eq("id", streamId);
    
    if (error) {
      console.error("Error stopping stream:", error);
      return false;
    }
    
    // Update the stream session
    const { data: sessionData } = await supabase
      .from("stream_sessions")
      .select("id, started_at")
      .eq("stream_id", streamId)
      .order("created_at", { ascending: false })
      .limit(1);
    
    if (sessionData && sessionData.length > 0) {
      const sessionId = sessionData[0].id;
      const startedAt = new Date(sessionData[0].started_at);
      const endedAt = new Date();
      const durationSeconds = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);
      
      await supabase
        .from("stream_sessions")
        .update({
          ended_at: now,
          duration: durationSeconds
        })
        .eq("id", sessionId);
    }
    
    return !error;
  },
  
  async getStreamStats(streamId: string): Promise<StreamStats[]> {
    const { data, error } = await supabase
      .from("stream_stats")
      .select("*")
      .eq("stream_id", streamId)
      .order("timestamp", { ascending: true });
    
    if (error) {
      console.error("Error fetching stream stats:", error);
      return [];
    }
    
    return (data || []).map(stat => ({
      timestamp: new Date(stat.timestamp),
      viewerCount: stat.viewer_count || 0,
      bandwidth: stat.bandwidth || 0,
      cpuUsage: stat.cpu_usage,
      memoryUsage: stat.memory_usage,
      errors: stat.errors ? mapJsonToStreamErrors(stat.errors) : [] // Convert JSON to StreamError array
    }));
  },
  
  async updateStreamViewCount(streamId: string, count: number): Promise<boolean> {
    const { error } = await supabase
      .from("streams")
      .update({ viewer_count: count })
      .eq("id", streamId);
    
    if (error) {
      console.error("Error updating stream view count:", error);
      return false;
    }
    
    // Also add to stream stats
    await supabase
      .from("stream_stats")
      .insert({
        stream_id: streamId,
        viewer_count: count
      });
    
    return !error;
  },
  
  async updateStreamInfo(streamId: string, updates: Partial<Stream>): Promise<boolean> {
    const { error } = await supabase
      .from("streams")
      .update({
        title: updates.title,
        description: updates.description,
        category: updates.category,
        tags: updates.tags,
        updated_at: new Date().toISOString(),
        thumbnail_url: updates.thumbnail,
        stream_type: updates.streamType,
        is_recording: updates.isRecording
      })
      .eq("id", streamId);
    
    if (error) {
      console.error("Error updating stream info:", error);
      return false;
    }
    
    return !error;
  },
  
  async saveRecordingUrl(streamId: string, recordingUrl: string, retentionHours: number = 6): Promise<boolean> {
    // Calculate expiry time
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + retentionHours);
    
    const { error } = await supabase
      .from("streams")
      .update({
        recording_url: recordingUrl,
        recording_expiry: expiryDate.toISOString()
      })
      .eq("id", streamId);
    
    if (error) {
      console.error("Error saving recording URL:", error);
      return false;
    }
    
    return !error;
  },
  
  async getStreamSessions(userId: string): Promise<StreamSession[]> {
    const { data, error } = await supabase
      .from("stream_sessions")
      .select(`
        *,
        streams:stream_id (
          title,
          thumbnail_url,
          category,
          tags
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("Error fetching stream sessions:", error);
      return [];
    }
    
    return (data || []).map(session => ({
      id: session.id,
      streamId: session.stream_id,
      userId: session.user_id,
      startedAt: new Date(session.started_at),
      endedAt: session.ended_at ? new Date(session.ended_at) : undefined,
      viewerCount: session.viewer_count || 0,
      duration: session.duration,
      recordingUrl: session.recording_url,
      recordingExpiry: session.recording_expiry ? new Date(session.recording_expiry) : undefined,
      peakViewers: session.peak_viewers,
      avgViewDuration: session.avg_view_duration,
      streamType: session.stream_type || 'internet'
    }));
  },
  
  async getActiveStreams(): Promise<Stream[]> {
    return this.getAllStreams();
  },
  
  async getFeaturedStreams(limit: number = 5): Promise<Stream[]> {
    const { data, error } = await supabase
      .from("streams")
      .select(`
        id,
        title,
        description,
        stream_key,
        is_live,
        is_recording,
        started_at,
        ended_at,
        created_at,
        viewer_count,
        thumbnail_url,
        category,
        tags,
        stream_type,
        profiles:user_id (
          id, 
          username, 
          display_name,
          avatar_url
        )
      `)
      .eq("is_live", true)
      .order("viewer_count", { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error("Error fetching featured streams:", error);
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
      userId: stream.profiles.id,
      username: stream.profiles.username,
      displayName: stream.profiles.display_name,
      userAvatar: stream.profiles.avatar_url,
      startedAt: stream.started_at ? new Date(stream.started_at) : undefined,
      endedAt: stream.ended_at ? new Date(stream.ended_at) : undefined,
      category: stream.category,
      tags: stream.tags || [],
      streamType: stream.stream_type || 'internet'
    }));
  }
};

// Helper function to convert JSON errors to proper StreamError objects
function mapJsonToStreamErrors(jsonErrors: any): StreamError[] {
  if (!jsonErrors) return [];
  
  // Handle array of errors
  if (Array.isArray(jsonErrors)) {
    return jsonErrors.map(err => ({
      timestamp: err.timestamp ? new Date(err.timestamp) : new Date(),
      code: err.code || 'unknown',
      message: err.message || 'Unknown error',
      details: err.details
    }));
  }
  
  // Handle single error object
  if (typeof jsonErrors === 'object') {
    return [{
      timestamp: jsonErrors.timestamp ? new Date(jsonErrors.timestamp) : new Date(),
      code: jsonErrors.code || 'unknown',
      message: jsonErrors.message || 'Unknown error',
      details: jsonErrors.details
    }];
  }
  
  // Handle unexpected format (string, etc.)
  return [{
    timestamp: new Date(),
    code: 'parse_error',
    message: 'Error parsing error data',
    details: jsonErrors
  }];
}
