
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ChevronRight, Copy, Check, Mic, MicOff, Video, VideoOff, Settings, Monitor, Share, X, Radio, Clapperboard, Maximize, Link2, ArrowRight, Globe } from "lucide-react";
import { formatViewers } from "@/utils/design";
import Atmosphere from "./Atmosphere";
import LiveBadge from "./LiveBadge";
import { ambientAudio } from "@/lib/ambientAudio";
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
import { LanStreamer } from "@/lib/lanStream";
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
  streamType: z.enum(["local", "internet"]),
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
  const [stageOpen, setStageOpen] = useState(false);
  const [now, setNow] = useState(Date.now());


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
      streamType: "internet" as const,
    },
  });

  /* ----- LAN mode: real peer-to-peer delivery over the local network ----- */
  const streamType = form.watch("streamType");
  const lanStreamerRef = useRef<LanStreamer | null>(null);
  const [lanViewerCount, setLanViewerCount] = useState(0);
  const isLan = streamType === "local";
  const isLanLive = isStreaming && isLan;

  
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

  // Re-attach the media stream whenever the <video> element re-mounts
  // (entering/leaving Stage Mode swaps the video node).
  useEffect(() => {
    if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [stageOpen, step]);

  // Stage Mode: Escape to exit, lock body scroll while open.
  useEffect(() => {
    if (!stageOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStageOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [stageOpen]);

  // While the stage is open: on-air clock + media-arrival refresh.
  useEffect(() => {
    if (!stageOpen) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [stageOpen]);

  const handlePrepareFromStage = () => {
    form.setValue("title", (form.watch("title") || "").trim(), { shouldValidate: true, shouldDirty: true });
    form.handleSubmit(onSubmit)();
  };

  const stageStreamUrl = currentStream
    ? window.location.origin + `/watch/${currentStream.id}`
    : "";

  /* The network choice lives in the form (it can be flipped after creation),
     so read it through a ref to avoid a stale closure in the mutation. */
  const streamTypeRef = useRef(streamType);
  streamTypeRef.current = streamType;

  /* Start/stop the LAN WebRTC broadcaster for this stream. */
  const startLan = useCallback(() => {
    if (!currentStream || streamTypeRef.current !== "local") return;
    const media = streamRef.current;
    if (!media || lanStreamerRef.current) return;
    const streamer = new LanStreamer(currentStream.id, media);
    streamer.onViewerCount = (n) => {
      setLanViewerCount(n);
      if (n > 0) {
        liveStreamService.updateStreamViewCount(currentStream.id, n).catch(() => {});
      }
    };
    streamer.start();
    lanStreamerRef.current = streamer;
  }, [currentStream]);

  const stopLan = useCallback(() => {
    lanStreamerRef.current?.stop();
    lanStreamerRef.current = null;
    setLanViewerCount(0);
  }, []);

  useEffect(() => () => stopLan(), [stopLan]);

  const setStreamType = (t: "local" | "internet") => {
    form.setValue("streamType", t);
    if (currentStream && currentStream.streamType !== t) {
      liveStreamService
        .updateStreamInfo(currentStream.id, { streamType: t })
        .catch(() => {});
    }
  };

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
        streamType: formData.streamType,
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

      startLan();

      if (ambientAudio.enabled) ambientAudio.blip("success");

      toast({
        title: "Stream started",
        description: isLan
          ? "You are live over your local network!"
          : "You are now live!",
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
      stopLan();
      
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

  // ---- Stage Mode: full-screen immersive pre-air / on-air deck ----
  if (stageOpen) {
    return (
      <StageView
        step={step}
        isStreaming={isStreaming}
        currentStream={currentStream}
        videoRef={videoRef}
        hasMedia={!!streamRef.current}
        videoEnabled={videoEnabled}
        audioEnabled={audioEnabled}
        onToggleVideo={handleToggleVideo}
        onToggleAudio={handleToggleAudio}
        title={form.watch("title")}
        onTitleChange={(v) => form.setValue("title", v, { shouldValidate: true, shouldDirty: true })}
        titleError={form.formState.errors.title?.message}
        onPrepare={handlePrepareFromStage}
        preparePending={createStreamMutation.isPending}
        onGoLive={handleStartStream}
        goLivePending={startStreamMutation.isPending}
        onEndStream={handleStopStream}
        endPending={stopStreamMutation.isPending}
        onCopyUrl={handleCopyStreamUrl}
        onShare={handleShareStream}
        onOpenViewer={() => currentStream && navigate(`/watch/${currentStream.id}`)}
        onClose={() => setStageOpen(false)}
        now={now}
        streamUrl={stageStreamUrl}
        isLan={isLan}
        viewerTotal={isLanLive ? lanViewerCount : currentStream?.viewerCount}
      />
    );
  }

  return (
    <div className="grid lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3 space-y-6">
        {/* Preview */}
        <div className="edge-light bg-card rounded-2xl border border-white/10 overflow-hidden">
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
          
          <div className="p-4 flex flex-wrap justify-between items-center gap-3">
            <div>
              <p className="font-medium line-clamp-1">
                {currentStream?.title || "Stream Preview"}
              </p>
              <p className="text-sm text-muted-foreground">
                {isStreaming ? (
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 bg-live rounded-full animate-pulse"></span>
                    Live
                    {isLanLive && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-emerald-300">
                        <Radio size={10} /> LAN
                      </span>
                    )}
                    {isLanLive && lanViewerCount > 0 && (
                      <span className="font-mono text-xs">{lanViewerCount} on this network</span>
                    )}
                  </span>
                ) : "Not streaming yet"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="glass"
                size="sm"
                onClick={() => setStageOpen(true)}
                className="gap-2"
              >
                <Clapperboard className="h-4 w-4" />
                Stage mode
              </Button>

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
                  variant="glow"
                  onClick={handleStartStream}
                  disabled={startStreamMutation.isPending}
                >
                  Go Live
                </Button>
              ) : null}
            </div>
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
          <div className="edge-light bg-card rounded-2xl border border-white/10 overflow-hidden">
            <div className="p-5 border-b border-white/8">
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
                    {isLan
                      ? "LAN mode — anyone on this network who opens your watch link receives the stream straight from your device. No internet required."
                      : "Keep this key secure. You can use it with streaming software like OBS."}
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
          <div className="edge-light bg-card rounded-2xl border border-white/10 overflow-hidden">
            <div className="p-5 border-b border-white/8">
              <h3 className="font-semibold">Stream Analytics</h3>
            </div>
            
            <div className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/[0.04] rounded-lg p-3">
                  <div className="text-xs text-muted-foreground mb-1">
                    {isLanLive ? "LAN VIEWERS" : "VIEWERS"}
                  </div>
                  <div className="text-2xl font-bold">
                    {isLanLive ? lanViewerCount : (currentStream?.viewerCount || 0)}
                  </div>
                </div>
                
                <div className="bg-white/[0.04] rounded-lg p-3">
                  <div className="text-xs text-muted-foreground mb-1">UPTIME</div>
                  <div className="text-2xl font-bold">
                    {currentStream?.startedAt ? (
                      "00:00:00"
                    ) : (
                      "--:--:--"
                    )}
                  </div>
                </div>
                
                <div className="bg-white/[0.04] rounded-lg p-3">
                  <div className="text-xs text-muted-foreground mb-1">STATUS</div>
                  <div className="text-md font-bold flex items-center gap-2">
                    <span className="h-2 w-2 bg-green-500 rounded-full"></span>
                    Excellent
                  </div>
                </div>
                
                <div className="bg-white/[0.04] rounded-lg p-3">
                  <div className="text-xs text-muted-foreground mb-1">QUALITY</div>
                  <div className="text-md font-bold">720p 30fps</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div className="lg:col-span-2">
        <div className="edge-light bg-card rounded-2xl border border-white/10 overflow-hidden">
          <div className="p-5 border-b border-white/8">
            <h3 className="font-semibold">Stream Setup</h3>
          </div>
          
          <div className="p-4">
            {/* Steps */}
            <div className="mb-6">
              <div className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step >= 1 ? "bg-stream text-white" : "bg-white/[0.06] text-muted-foreground"
                }`}>
                  1
                </div>
                <div className={`h-0.5 flex-1 ${
                  step > 1 ? "bg-stream" : "bg-white/10"
                }`}></div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step >= 2 ? "bg-stream text-white" : "bg-white/[0.06] text-muted-foreground"
                }`}>
                  2
                </div>
                <div className={`h-0.5 flex-1 ${
                  step > 2 ? "bg-stream" : "bg-white/10"
                }`}></div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step >= 3 ? "bg-stream text-white" : "bg-white/[0.06] text-muted-foreground"
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
                        step > 1 ? "bg-green-500/20 text-green-500" : "bg-white/[0.06] text-muted-foreground"
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
                        step > 2 ? "bg-green-500/20 text-green-500" : step === 2 ? "bg-stream/20 text-stream" : "bg-white/[0.06] text-muted-foreground"
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
                        step === 3 ? "bg-stream/20 text-stream" : "bg-white/[0.06] text-muted-foreground"
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
                      <label className="text-sm font-medium">Network</label>
                      <p className="text-xs text-muted-foreground">LAN mode or global internet</p>
                    </div>
                    <div className="flex rounded-full border border-white/10 bg-white/[0.04] p-1">
                      <button
                        type="button"
                        onClick={() => setStreamType("local")}
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                          isLan ? "bg-signature text-white shadow-glow" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Radio size={12} />
                        LAN
                      </button>
                      <button
                        type="button"
                        onClick={() => setStreamType("internet")}
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                          !isLan ? "bg-signature text-white shadow-glow" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Globe size={12} />
                        Global
                      </button>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            
            {/* Show help text based on current step */}
            <div className="mt-8 p-4 bg-white/[0.04] rounded-xl">
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

/* ------------------------------------------------------------------ */
/*  Stage Mode — the full-screen, viewfinder-style creator deck        */
/* ------------------------------------------------------------------ */

interface StageViewProps {
  step: number;
  isStreaming: boolean;
  currentStream: Stream | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  hasMedia: boolean;
  videoEnabled: boolean;
  audioEnabled: boolean;
  onToggleVideo: () => void;
  onToggleAudio: () => void;
  title: string;
  onTitleChange: (v: string) => void;
  titleError?: string;
  onPrepare: () => void;
  preparePending: boolean;
  onGoLive: () => void;
  goLivePending: boolean;
  onEndStream: () => void;
  endPending: boolean;
  onCopyUrl: () => void;
  onShare: () => void;
  onOpenViewer: () => void;
  onClose: () => void;
  now: number;
  streamUrl: string;
  isLan: boolean;
  viewerTotal?: number;
}

function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function StageToggle({
  on,
  onClick,
  label,
  onIcon,
  offIcon,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  onIcon: React.ReactNode;
  offIcon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={`${label}: ${on ? "on" : "off"}`}
      className={`relative grid h-12 w-12 place-items-center rounded-2xl border transition-all duration-300 active:scale-95 ${
        on
          ? "border-white/15 bg-white/[0.06] text-foreground hover:bg-white/[0.1]"
          : "border-live/40 bg-live/10 text-[hsl(349_86%_65%)]"
      }`}
    >
      {on ? onIcon : offIcon}
      <span
        className={`absolute -bottom-1 left-1/2 h-1 w-4 -translate-x-1/2 rounded-full ${
          on ? "bg-white/40" : "bg-live"
        }`}
      />
    </button>
  );
}

function StageView({
  step,
  isStreaming,
  currentStream,
  videoRef,
  hasMedia,
  videoEnabled,
  audioEnabled,
  onToggleVideo,
  onToggleAudio,
  title,
  onTitleChange,
  titleError,
  onPrepare,
  preparePending,
  onGoLive,
  goLivePending,
  onEndStream,
  endPending,
  onCopyUrl,
  onShare,
  onOpenViewer,
  onClose,
  now,
  streamUrl,
  isLan,
  viewerTotal,
}: StageViewProps) {
  const startedAt = currentStream?.startedAt
    ? new Date(currentStream.startedAt).getTime()
    : null;
  const elapsed = isStreaming && startedAt ? Math.max(0, now - startedAt) : 0;
  const dim = !hasMedia || !videoEnabled;
  const streamTitle = currentStream?.title || title || "Untitled stream";

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-background">
      <Atmosphere intensity="hero" />
      <div className="grain-fixed" />

      <div className="relative z-10 flex h-full flex-col">
        {/* ---------- top bar ---------- */}
        <header className="flex items-center justify-between px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-signature shadow-glow">
              <Radio className="h-4 w-4 text-white" strokeWidth={2.5} />
            </span>
            <span className="hidden font-display text-lg font-bold tracking-tight sm:block">
              I&rsquo;m&nbsp;Live
            </span>
            <span className="hidden font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase sm:block">
              / Stage
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {isStreaming ? (
              <>
                <LiveBadge />
                <span className="font-mono text-xs tracking-wider text-foreground/85">
                  ON AIR · {formatClock(elapsed)}
                </span>
              </>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5">
                <span className="h-2 w-2 rounded-full bg-[hsl(var(--accent-hi))] animate-pulse" />
                <span className="font-mono text-[11px] tracking-[0.25em] text-muted-foreground uppercase">
                  Pre-air
                </span>
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            aria-label="Exit stage mode"
            title="Exit (Esc)"
            className="grid h-10 w-10 place-items-center rounded-full glass text-muted-foreground transition-all hover:bg-white/10 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* ---------- viewfinder ---------- */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 md:px-8">
          <div className="relative w-full max-w-5xl">
            <div
              className={`absolute -inset-10 rounded-[48px] blur-[90px] transition-colors duration-1000 ${
                isStreaming ? "bg-live/15" : "bg-[hsl(var(--stream-h)_/_0.16)]"
              }`}
              aria-hidden
            />

            <div className="relative aspect-video overflow-hidden rounded-3xl border border-white/12 bg-black shadow-card md:aspect-[21/9]">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
              />

              {dim && (
                <div
                  className="absolute inset-0 grid place-items-center"
                  style={{
                    background:
                      "linear-gradient(135deg, hsl(var(--sig-a) / 0.28) 0%, hsl(252 40% 6%) 65%)",
                  }}
                >
                  <div className="text-center">
                    {hasMedia ? (
                      <VideoOff className="mx-auto h-8 w-8 text-muted-foreground" />
                    ) : (
                      <Monitor className="mx-auto h-8 w-8 text-muted-foreground" />
                    )}
                    <p className="mt-3 font-mono text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
                      {hasMedia ? "Camera off" : "No camera signal"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      {hasMedia
                        ? "Turn your camera on from the deck below."
                        : "Allow camera access, or check your device."}
                    </p>
                  </div>
                </div>
              )}

              {/* corner brackets */}
              <span className="pointer-events-none absolute left-3 top-3 h-7 w-7 rounded-tl-xl border-l-2 border-t-2 border-[hsl(var(--accent-hi))]" aria-hidden />
              <span className="pointer-events-none absolute right-3 top-3 h-7 w-7 rounded-tr-xl border-r-2 border-t-2 border-[hsl(var(--accent-hi))]" aria-hidden />
              <span className="pointer-events-none absolute bottom-3 left-3 h-7 w-7 rounded-bl-xl border-b-2 border-l-2 border-[hsl(var(--accent-hi))]" aria-hidden />
              <span className="pointer-events-none absolute bottom-3 right-3 h-7 w-7 rounded-br-xl border-b-2 border-r-2 border-[hsl(var(--accent-hi))]" aria-hidden />

              {/* overlays */}
              <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  {isStreaming ? (
                    <div className="flex items-center gap-2 rounded-md bg-black/55 px-2.5 py-1 font-mono text-[11px] tracking-wider text-white backdrop-blur-md">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-live opacity-75 animate-ping" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-live" />
                      </span>
                      {formatViewers(viewerTotal ?? 0)} watching
                      {isLan && (
                        <span className="ml-1 rounded border border-emerald-400/30 bg-emerald-400/10 px-1 py-px text-[9px] tracking-wider text-emerald-300">
                          LAN
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-md bg-black/55 px-2.5 py-1 font-mono text-[11px] tracking-wider text-white/80 backdrop-blur-md">
                      <span className="eq text-white">
                        <span /><span /><span /><span />
                      </span>
                      standby
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="hidden rounded-md bg-black/55 px-2.5 py-1 font-mono text-[10px] tracking-wider text-white/80 backdrop-blur-md sm:block">
                    720P · 30FPS · AUTO
                  </div>
                  <div className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[10px] tracking-wider backdrop-blur-md ${audioEnabled ? "bg-black/55 text-white/80" : "bg-live/25 text-[hsl(349_86%_70%)]"}`}>
                    {audioEnabled ? <Mic size={11} /> : <MicOff size={11} />}
                    MIC
                  </div>
                </div>
              </div>

              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/70 to-transparent p-4 sm:p-5">
                <p className="max-w-[70%] truncate font-display text-lg font-bold text-white/90 sm:text-2xl">
                  {streamTitle}
                </p>
                <span className="pointer-events-none select-none font-display text-xl font-extrabold tracking-tight text-white/10 sm:text-2xl">
                  I&rsquo;m Live
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ---------- control deck ---------- */}
        <footer className="px-4 pb-5 pt-4 md:px-8 md:pb-8">
          <div className="mx-auto max-w-4xl glass-deep rounded-3xl p-4 shadow-card md:p-5">
            <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-center">
              <div className="flex items-center justify-center gap-3 md:justify-start">
                <StageToggle
                  on={audioEnabled}
                  onClick={onToggleAudio}
                  label="Microphone"
                  onIcon={<Mic size={18} />}
                  offIcon={<MicOff size={18} />}
                />
                <StageToggle
                  on={videoEnabled}
                  onClick={onToggleVideo}
                  label="Camera"
                  onIcon={<Video size={18} />}
                  offIcon={<VideoOff size={18} />}
                />
              </div>

              <div className="hidden h-10 w-px bg-white/10 md:block" />

              {/* center action per step */}
              {step === 1 && (
                <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-start">
                  <div className="flex-1">
                    <input
                      value={title}
                      onChange={(e) => onTitleChange(e.target.value)}
                      placeholder="Name your stream…"
                      maxLength={100}
                      className={`h-11 w-full rounded-xl border bg-black/40 px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 ${
                        titleError
                          ? "border-destructive"
                          : "border-white/10 focus:border-[hsl(var(--accent-mid))]"
                      }`}
                    />
                    {titleError && (
                      <p className="mt-1.5 text-xs text-destructive">{titleError}</p>
                    )}
                  </div>
                  <Button
                    variant="glow"
                    size="lg"
                    onClick={onPrepare}
                    disabled={preparePending}
                    className="shrink-0"
                  >
                    {preparePending ? "Preparing…" : "Prepare stream"}
                    {!preparePending && (
                      <ArrowRight className="transition-transform duration-300 group-hover/btn:translate-x-1" />
                    )}
                  </Button>
                </div>
              )}

              {step === 2 && (
                <div className="flex flex-1 flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-display text-lg font-bold">{streamTitle}</p>
                    <p className={`font-mono text-[10px] tracking-[0.25em] uppercase ${isLan ? "text-emerald-300/90" : "text-muted-foreground"}`}>
                      {isLan ? "LAN mode · same network only" : "Ready when you are"}
                    </p>
                  </div>
                  <Button
                    variant="glow"
                    size="lg"
                    onClick={onGoLive}
                    disabled={goLivePending}
                    className="relative shrink-0"
                  >
                    <span
                      className="absolute -inset-1.5 -z-10 rounded-full bg-live/25 blur-lg"
                      aria-hidden
                    />
                    <Radio size={16} />
                    {goLivePending ? "Going live…" : "Go live"}
                  </Button>
                </div>
              )}

              {step === 3 && (
                <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3.5 py-3">
                    <Link2 size={13} className="shrink-0 text-[hsl(var(--accent-hi))]" />
                    <span className="truncate font-mono text-[12px] text-white/85">{streamUrl}</span>
                    {isLan && (
                      <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 font-mono text-[9px] tracking-wider text-emerald-300">
                        <Radio size={10} /> LAN
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="glass" onClick={onCopyUrl}>
                      <Copy size={14} /> Copy
                    </Button>
                    <Button variant="glass" onClick={onShare}>
                      <Share size={14} /> Share
                    </Button>
                  </div>
                </div>
              )}

              {/* right cluster */}
              {step === 3 && (
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" onClick={onOpenViewer}>
                    <Maximize size={14} /> Viewer page
                  </Button>
                  <Button variant="destructive" onClick={onEndStream} disabled={endPending}>
                    <span className="h-2.5 w-2.5 rounded-full bg-white/80" />
                    {endPending ? "Ending…" : "End stream"}
                  </Button>
                </div>
              )}

              {step === 1 && (
                <p className="hidden font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60 uppercase lg:block">
                  One step to air
                </p>
              )}
              {step === 2 && (
                <p className="hidden font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60 uppercase lg:block">
                  ESC to exit
                </p>
              )}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default StreamCreator;
