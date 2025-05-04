
export interface Stream {
  id: string;
  title: string;
  description?: string;
  isLive: boolean;
  streamKey: string;
  createdAt: Date;
  viewerCount: number;
  isRecording: boolean;
  isLocalStream: boolean;
  thumbnail?: string;
  url?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface StreamSession {
  id: string;
  startedAt: Date;
  endedAt?: Date;
  viewCount: number;
  duration?: number;
  recordingUrl?: string;
}

export type StreamStatus = "idle" | "connecting" | "live" | "error" | "ended";
