
import { StreamStatus } from "@/types";

class StreamService {
  private mediaStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private streamStatus: StreamStatus = "idle";
  private listeners: Map<string, Function[]> = new Map();
  
  // Get user media stream (camera/mic)
  async getMediaStream(options: MediaStreamConstraints = { video: true, audio: true }): Promise<MediaStream> {
    try {
      this.streamStatus = "connecting";
      this.notifyListeners("statusChange", this.streamStatus);
      
      this.mediaStream = await navigator.mediaDevices.getUserMedia(options);
      this.streamStatus = "live";
      this.notifyListeners("statusChange", this.streamStatus);
      
      return this.mediaStream;
    } catch (error) {
      console.error("Error accessing media devices:", error);
      this.streamStatus = "error";
      this.notifyListeners("statusChange", this.streamStatus);
      this.notifyListeners("error", error);
      throw error;
    }
  }
  
  // Connect stream to video element
  attachStreamToVideo(videoElement: HTMLVideoElement): void {
    if (!this.mediaStream) {
      throw new Error("No media stream available");
    }
    
    this.videoElement = videoElement;
    this.videoElement.srcObject = this.mediaStream;
    this.videoElement.onloadedmetadata = () => {
      if (this.videoElement) {
        this.videoElement.play().catch(error => {
          console.error("Error playing video:", error);
          this.notifyListeners("error", error);
        });
      }
    };
  }
  
  // Start recording the stream
  startRecording(): void {
    if (!this.mediaStream) {
      throw new Error("No media stream available");
    }
    
    this.recordedChunks = [];
    const options = { mimeType: "video/webm; codecs=vp9" };
    
    try {
      this.mediaRecorder = new MediaRecorder(this.mediaStream, options);
    } catch (error) {
      console.error("Error creating MediaRecorder:", error);
      // Fallback to a more widely supported format
      try {
        this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType: "video/webm" });
      } catch (fallbackError) {
        console.error("Error creating fallback MediaRecorder:", fallbackError);
        this.notifyListeners("error", fallbackError);
        throw fallbackError;
      }
    }
    
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
        this.notifyListeners("recordingData", event.data);
      }
    };
    
    this.mediaRecorder.onstop = () => {
      this.notifyListeners("recordingStopped", this.recordedChunks);
    };
    
    // Record in 1-second chunks
    this.mediaRecorder.start(1000);
    this.notifyListeners("recordingStarted");
  }
  
  // Stop recording
  stopRecording(): Blob | null {
    if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
      return null;
    }
    
    this.mediaRecorder.stop();
    
    if (this.recordedChunks.length === 0) {
      return null;
    }
    
    const blob = new Blob(this.recordedChunks, { type: "video/webm" });
    return blob;
  }
  
  // Download recorded video
  downloadRecording(filename = "recording.webm"): void {
    const blob = new Blob(this.recordedChunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
  
  // Stop streaming
  stopStream(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    
    this.mediaStream = null;
    this.streamStatus = "ended";
    this.notifyListeners("statusChange", this.streamStatus);
  }
  
  // Get current stream status
  getStatus(): StreamStatus {
    return this.streamStatus;
  }
  
  // Generate a shareable link
  generateShareableLink(): string {
    // In a real implementation, this would generate a unique ID and save it to a database
    const streamId = Math.random().toString(36).substring(2, 15);
    return `${window.location.origin}/watch/${streamId}`;
  }
  
  // Event handling
  addEventListener(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    
    this.listeners.get(event)?.push(callback);
  }
  
  removeEventListener(event: string, callback: Function): void {
    if (!this.listeners.has(event)) return;
    
    const callbacks = this.listeners.get(event) || [];
    const index = callbacks.indexOf(callback);
    
    if (index !== -1) {
      callbacks.splice(index, 1);
    }
  }
  
  private notifyListeners(event: string, data?: any): void {
    if (!this.listeners.has(event)) return;
    
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(callback => callback(data));
  }
}

// Singleton instance
export const streamService = new StreamService();
