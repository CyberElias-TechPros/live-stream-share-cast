
import { EventEmitter } from "@/lib/eventEmitter";
import { Stream, StreamSettings, StreamStatus } from "./index";

// Extend the StreamService to include EventEmitter capabilities
export interface StreamService extends EventEmitter {
  getSettings(): StreamSettings;
  updateSettings(settings: StreamSettings): void;
  getMediaStream(): Promise<MediaStream>;
  stopStream(): void;
  connectToStream(streamId: string, streamType: 'local' | 'internet'): Promise<void>;
  startRecording(saveLocally: boolean): void;
  stopRecording(): void;
  downloadRecording(filename: string): void;
  checkBrowserSupport(): {
    supported: boolean;
    features: Record<string, boolean>;
  };
  setActiveStream(stream: Stream | null): void;
}
