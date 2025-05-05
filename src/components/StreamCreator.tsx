
import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ChevronRight, Copy, Check, Mic, MicOff, Video, VideoOff, Settings, Monitor, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useStream } from "@/contexts/StreamContext";
import { useAuth } from "@/contexts/AuthContext";
import { Stream } from "@/types";
import { liveStreamService } from "@/services/liveStreamService";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";

const streamFormSchema = z.object({
  title: z
    .string()
    .min(3, { message: "Title must be at least 3 characters long" })
    .max(100, { message: "Title cannot exceed 100 characters" }),
  description: z
    .string()
    .max(2000, { message: "Description cannot exceed 2000 characters" })
    .optional(),
  category: z.string().optional(),
  tags: z.string().optional(),
});

type StreamFormValues = z.infer<typeof streamFormSchema>;

const StreamCreator = () => {
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [streamKey, setStreamKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStream, setCurrentStream] = useState<Stream | null>(null);
  const [step, setStep] = useState(1); // 1: Setup, 2: Configure, 3: Live
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  
  const form = useForm<StreamFormValues>({
    resolver: zodResolver(streamFormSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "Other",
      tags: "",
    },
  });
  
  // Get user media
  useEffect(() => {
    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoEnabled ? true : false,
          audio: audioEnabled ? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } : false
        });
        
        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error("Error accessing media devices:", error);
        toast({
          title: "Camera access error",
          description: "Please check your camera and microphone permissions",
          variant: "destructive"
        });
      }
    };
    
    if (step !== 3) { // Only get media during setup and config
      getMedia();
    }
    
    return () => {
      if (streamRef.current && step !== 3) { // Don't stop stream when we're live
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [videoEnabled, audioEnabled, step, toast]);

  // Create stream mutation
  const createStreamMutation = useMutation({
    mutationFn: async (formData: StreamFormValues) => {
      if (!user) throw new Error("Not authenticated");
      
      const newStream = await liveStreamService.createStream({
        title: formData.title,
        description: formData.description,
        userId: user.id,
        category: formData.category,
        tags: formData.tags?.split(",").map(tag => tag.trim()) || [],
      });
      
      if (!newStream) throw new Error("Failed to create stream");
      return newStream;
    },
    onSuccess: (data) => {
      setCurrentStream(data);
      setStreamKey(data.streamKey);
      setStep(2); // Move to configure step
      
      toast({
        title: "Stream created",
        description: "Your stream has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to create stream",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive"
      });
    }
  });
  
  // Start streaming mutation
  const startStreamMutation = useMutation({
    mutationFn: async () => {
      if (!currentStream) throw new Error("No stream created");
      return liveStreamService.startStream(currentStream.id);
    },
    onSuccess: () => {
      setIsStreaming(true);
      setStep(3); // Move to live step
      
      toast({
        title: "Stream started",
        description: "You are now live!",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to start stream",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive"
      });
    }
  });
  
  // Stop streaming mutation
  const stopStreamMutation = useMutation({
    mutationFn: async () => {
      if (!currentStream) throw new Error("No active stream");
      return liveStreamService.stopStream(currentStream.id);
    },
    onSuccess: () => {
      setIsStreaming(false);
      
      toast({
        title: "Stream ended",
        description: "Your stream has been ended.",
      });
      
      navigate(`/watch/${currentStream?.id}`);
    },
    onError: (error) => {
      toast({
        title: "Failed to stop stream",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive"
      });
    }
  });
  
  const onSubmit = (formData: StreamFormValues) => {
    createStreamMutation.mutate(formData);
  };
  
  const handleToggleVideo = () => {
    setVideoEnabled(!videoEnabled);
    
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !videoEnabled;
      });
    }
  };
  
  const handleToggleAudio = () => {
    setAudioEnabled(!audioEnabled);
    
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !audioEnabled;
      });
    }
  };
  
  const handleCopyStreamKey = () => {
    if (streamKey) {
      navigator.clipboard.writeText(streamKey);
      setCopied(true);
      
      setTimeout(() => {
        setCopied(false);
      }, 3000);
      
      toast({
        title: "Stream key copied",
        description: "Stream key has been copied to clipboard",
      });
    }
  };
  
  const handleCopyStreamUrl = () => {
    const streamUrl = window.location.origin + `/watch/${currentStream?.id}`;
    navigator.clipboard.writeText(streamUrl);
    
    toast({
      title: "Stream URL copied",
      description: "Stream URL has been copied to clipboard",
    });
  };
  
  const handleStartStream = () => {
    startStreamMutation.mutate();
  };
  
  const handleStopStream = () => {
    stopStreamMutation.mutate();
  };
  
  const handleShareStream = async () => {
    if (!currentStream) return;
    
    const streamUrl = window.location.origin + `/watch/${currentStream.id}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: currentStream.title,
          text: `Watch my livestream: ${currentStream.title}`,
          url: streamUrl,
        });
      } catch (error) {
        console.error("Error sharing:", error);
        navigator.clipboard.writeText(streamUrl);
        
        toast({
          title: "URL Copied",
          description: "Stream URL copied to clipboard",
        });
      }
    } else {
      navigator.clipboard.writeText(streamUrl);
      
      toast({
        title: "URL Copied",
        description: "Stream URL copied to clipboard",
      });
    }
  };
  
  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h2 className="text-2xl font-bold mb-6">Authentication Required</h2>
        <p className="text-muted-foreground text-center mb-8">
          You need to be logged in to create a stream.
        </p>
        <Button onClick={() => navigate("/login")}>Log In</Button>
      </div>
    );
  }
  
  return (
    <div className="grid lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3 space-y-6">
        {/* Preview */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="relative aspect-video bg-black">
            {step === 3 ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center px-6">
                  <h3 className="text-xl font-semibold mb-2">🔴 You're Live!</h3>
                  <p className="text-muted-foreground mb-6">
                    Your stream is now live. Share the link with your viewers.
                  </p>
                  
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Button className="w-full" variant="outline" onClick={handleCopyStreamUrl}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy Stream Link
                    </Button>
                    
                    <Button className="w-full" onClick={handleShareStream}>
                      <Share className="mr-2 h-4 w-4" />
                      Share Stream
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <video 
                ref={videoRef}
                autoPlay 
                muted 
                playsInline
                className="w-full h-full object-cover"
              ></video>
            )}
            
            {step !== 3 && (
              <div className="absolute bottom-4 left-4 right-4 flex justify-center">
                <div className="bg-black/60 backdrop-blur-sm rounded-full px-4 py-2 flex gap-2">
                  <Button 
                    size="icon" 
                    variant={videoEnabled ? "ghost" : "destructive"}
                    onClick={handleToggleVideo}
                  >
                    {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
                  </Button>
                  
                  <Button 
                    size="icon" 
                    variant={audioEnabled ? "ghost" : "destructive"}
                    onClick={handleToggleAudio}
                  >
                    {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
                  </Button>
                </div>
              </div>
            )}
          </div>
          
          <div className="p-4 flex justify-between items-center">
            <div>
              <p className="font-medium line-clamp-1">
                {currentStream?.title || "Stream Preview"}
              </p>
              <p className="text-sm text-muted-foreground">
                {isStreaming ? (
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 bg-red-500 rounded-full animate-pulse"></span>
                    Live
                  </span>
                ) : "Not streaming yet"}
              </p>
            </div>
            
            {step === 3 ? (
              <Button 
                variant="destructive" 
                onClick={handleStopStream}
                disabled={stopStreamMutation.isPending}
              >
                End Stream
              </Button>
            ) : step === 2 ? (
              <Button 
                onClick={handleStartStream}
                disabled={startStreamMutation.isPending}
              >
                Go Live
              </Button>
            ) : null}
          </div>
        </div>
        
        {/* Stream Settings */}
        {step === 1 && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stream Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter your stream title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe your stream (optional)" 
                        className="resize-none min-h-[120px]"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Gaming, Music, Technology, etc."
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Add tags separated by commas"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="flex justify-end">
                <Button 
                  type="submit"
                  disabled={createStreamMutation.isPending}
                >
                  Create Stream
                </Button>
              </div>
            </form>
          </Form>
        )}
        
        {/* Stream Configuration - Step 2 */}
        {step === 2 && (
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold">Stream Configuration</h3>
            </div>
            
            <div className="p-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Stream Key</label>
                  <div className="flex items-center">
                    <Input 
                      type="password" 
                      value={streamKey || ""} 
                      readOnly
                      className="font-mono"
                    />
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      onClick={handleCopyStreamKey}
                      className="ml-2"
                    >
                      {copied ? <Check size={18} /> : <Copy size={18} />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Keep this key secure. You can use it with streaming software like OBS.
                  </p>
                </div>
                
                <div className="space-y-2 pt-4">
                  <h3 className="font-medium mb-2">Stream Information</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Title</label>
                      <p className="text-sm">{currentStream?.title}</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Category</label>
                      <p className="text-sm">{currentStream?.category || "Uncategorized"}</p>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <label className="text-xs font-medium text-muted-foreground">Description</label>
                      <p className="text-sm">{currentStream?.description || "No description"}</p>
                    </div>
                  </div>
                </div>
                
                <div className="pt-2">
                  <p className="text-sm text-muted-foreground mb-2">Ready to go live? Click the Go Live button above.</p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Stream Analytics - Step 3 */}
        {step === 3 && (
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold">Stream Analytics</h3>
            </div>
            
            <div className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-muted/30 rounded p-3">
                  <div className="text-xs text-muted-foreground mb-1">VIEWERS</div>
                  <div className="text-2xl font-bold">{currentStream?.viewerCount || 0}</div>
                </div>
                
                <div className="bg-muted/30 rounded p-3">
                  <div className="text-xs text-muted-foreground mb-1">UPTIME</div>
                  <div className="text-2xl font-bold">
                    {currentStream?.startedAt ? (
                      "00:00:00"
                    ) : (
                      "--:--:--"
                    )}
                  </div>
                </div>
                
                <div className="bg-muted/30 rounded p-3">
                  <div className="text-xs text-muted-foreground mb-1">STATUS</div>
                  <div className="text-md font-bold flex items-center gap-2">
                    <span className="h-2 w-2 bg-green-500 rounded-full"></span>
                    Excellent
                  </div>
                </div>
                
                <div className="bg-muted/30 rounded p-3">
                  <div className="text-xs text-muted-foreground mb-1">QUALITY</div>
                  <div className="text-md font-bold">720p 30fps</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div className="lg:col-span-2">
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold">Stream Setup</h3>
          </div>
          
          <div className="p-4">
            {/* Steps */}
            <div className="mb-6">
              <div className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step >= 1 ? "bg-stream text-white" : "bg-muted text-muted-foreground"
                }`}>
                  1
                </div>
                <div className={`h-0.5 flex-1 ${
                  step > 1 ? "bg-stream" : "bg-muted"
                }`}></div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step >= 2 ? "bg-stream text-white" : "bg-muted text-muted-foreground"
                }`}>
                  2
                </div>
                <div className={`h-0.5 flex-1 ${
                  step > 2 ? "bg-stream" : "bg-muted"
                }`}></div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step >= 3 ? "bg-stream text-white" : "bg-muted text-muted-foreground"
                }`}>
                  3
                </div>
              </div>
              
              <div className="flex justify-between mt-2 px-1 text-xs text-muted-foreground">
                <span>Setup</span>
                <span>Configure</span>
                <span>Live</span>
              </div>
            </div>
            
            {/* Tab content */}
            <Tabs defaultValue="guide" className="mt-6">
              <TabsList className="w-full">
                <TabsTrigger value="guide" className="flex-1">Guide</TabsTrigger>
                <TabsTrigger value="settings" className="flex-1">Settings</TabsTrigger>
              </TabsList>
              
              <TabsContent value="guide" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold flex items-center">
                    <Settings className="h-4 w-4 mr-2" />
                    Getting Started
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Follow these steps to start your stream and engage with your audience.
                  </p>
                  
                  <ul className="space-y-4 mt-4">
                    <li className="flex gap-3">
                      <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center ${
                        step > 1 ? "bg-green-500/20 text-green-500" : "bg-muted text-muted-foreground"
                      }`}>
                        {step > 1 ? <Check size={14} /> : "1"}
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Create Stream</p>
                        <p className="text-xs text-muted-foreground">Fill in your stream details and click "Create Stream".</p>
                      </div>
                    </li>
                    
                    <li className="flex gap-3">
                      <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center ${
                        step > 2 ? "bg-green-500/20 text-green-500" : step === 2 ? "bg-stream/20 text-stream" : "bg-muted text-muted-foreground"
                      }`}>
                        {step > 2 ? <Check size={14} /> : "2"}
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Configure Stream</p>
                        <p className="text-xs text-muted-foreground">Adjust your camera, microphone, and stream settings.</p>
                      </div>
                    </li>
                    
                    <li className="flex gap-3">
                      <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center ${
                        step === 3 ? "bg-stream/20 text-stream" : "bg-muted text-muted-foreground"
                      }`}>
                        {step > 3 ? <Check size={14} /> : "3"}
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Go Live</p>
                        <p className="text-xs text-muted-foreground">Click "Go Live" to start streaming to your audience.</p>
                      </div>
                    </li>
                  </ul>
                </div>
              </TabsContent>
              
              <TabsContent value="settings" className="space-y-4 pt-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium">Camera</label>
                      <p className="text-xs text-muted-foreground">Turn your camera on/off</p>
                    </div>
                    <Button 
                      size="sm" 
                      variant={videoEnabled ? "default" : "destructive"}
                      onClick={handleToggleVideo}
                    >
                      {videoEnabled ? <Video className="h-4 w-4 mr-2" /> : <VideoOff className="h-4 w-4 mr-2" />}
                      {videoEnabled ? "On" : "Off"}
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium">Microphone</label>
                      <p className="text-xs text-muted-foreground">Turn your microphone on/off</p>
                    </div>
                    <Button 
                      size="sm" 
                      variant={audioEnabled ? "default" : "destructive"}
                      onClick={handleToggleAudio}
                    >
                      {audioEnabled ? <Mic className="h-4 w-4 mr-2" /> : <MicOff className="h-4 w-4 mr-2" />}
                      {audioEnabled ? "On" : "Off"}
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium">Stream Type</label>
                      <p className="text-xs text-muted-foreground">Public or private stream</p>
                    </div>
                    <Button size="sm" variant="outline" disabled>
                      <Monitor className="h-4 w-4 mr-2" />
                      Public
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            
            {/* Show help text based on current step */}
            <div className="mt-8 p-4 bg-muted/30 rounded-lg">
              <h4 className="text-sm font-medium mb-2">
                {step === 1 ? "Getting Started" : 
                 step === 2 ? "Ready to Go Live" : 
                 "You're Now Live!"}
              </h4>
              <p className="text-xs text-muted-foreground">
                {step === 1 ? "Complete your stream information and click the Create Stream button to proceed." : 
                 step === 2 ? "Configure your stream settings and click Go Live when you're ready to start streaming." : 
                 "Your stream is now live. Share your stream link with your audience."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StreamCreator;
