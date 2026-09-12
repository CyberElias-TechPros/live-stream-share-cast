import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CameraOff,
  Check,
  CircleDot,
  Copy,
  Download,
  Link2,
  Mic,
  MicOff,
  Radio,
  Settings2,
  Square,
  Users,
  Video,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MessageList } from "@/components/MessageList";
import { useAuth } from "@/contexts/AuthContext";
import { useConfig, useIsLan } from "@/contexts/ConfigContext";
import { useReveal } from "@/hooks/useReveal";
import { useSEO } from "@/hooks/useSEO";
import { useElapsedSeconds, formatDuration } from "@/hooks/useElapsedSeconds";
import { api, absoluteUrl, ApiError } from "@/lib/api";
import { RoomSocket } from "@/lib/roomSocket";
import { QRCodeSVG } from "qrcode.react";
import { Broadcaster } from "@/lib/webrtc";
import { cn } from "@/lib/utils";
import type { ChatMessage, Stream } from "@/types";

type Step = "setup" | "check" | "live";

interface StreamRow {
  stream: Stream;
  ticket?: string;
}

export default function Studio() {
  useSEO({ title: "Studio — go live", robots: "noindex" });
  const { user } = useAuth();
  const navigate = useNavigate();
  const revealRef = useReveal<HTMLDivElement>();

  const [step, setStep] = useState<Step>("setup");
  const [stream, setStream] = useState<Stream | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // device state
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [resolution, setResolution] = useState<"1080p" | "720p" | "480p">("720p");
  const [fps, setFps] = useState<"24" | "30" | "60">("30");
  const [autoRecord, setAutoRecord] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);

  // live state
  const [room, setRoom] = useState<RoomSocket | null>(null);
  const [broadcaster, setBroadcaster] = useState<Broadcaster | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  // recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const previewRef = useRef<HTMLVideoElement>(null);
  const micRafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const config = useConfig();

  useEffect(() => {
    if (user?.preferences?.streaming) {
      const prefs = user.preferences.streaming;
      if (prefs.defaultResolution) setResolution(prefs.defaultResolution);
      if (prefs.defaultFps) setFps(String(prefs.defaultFps) as "24" | "30" | "60");
      setAutoRecord(!!prefs.autoRecord);
    }
  }, [user]);

  const resolutionConstraints = useMemo(() => {
    switch (resolution) {
      case "1080p":
        return { width: { ideal: 1920 }, height: { ideal: 1080 } };
      case "480p":
        return { width: { ideal: 854 }, height: { ideal: 480 } };
      default:
        return { width: { ideal: 1280 }, height: { ideal: 720 } };
    }
  }, [resolution]);

  const refreshPreview = useCallback(
    async (opts: { camera: boolean; mic: boolean }) => {
      // Stop existing tracks before re-requesting.
      mediaStream?.getTracks().forEach((t) => t.stop());
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: opts.camera ? { ...resolutionConstraints, frameRate: { ideal: Number(fps) } } : false,
          audio: opts.mic
            ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            : false,
        });
        setMediaStream(media);
        setDeviceError(null);
        if (previewRef.current) {
          previewRef.current.srcObject = media;
        }
        return media;
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        if (name === "NotAllowedError") {
          setDeviceError("Camera/microphone permission was denied. Allow access in your browser's site settings, then retry.");
        } else if (name === "NotFoundError") {
          setDeviceError("No camera or microphone found. Connect a device and retry.");
        } else {
          setDeviceError("Couldn't access your camera or microphone. Close other apps using them and retry.");
        }
        setMediaStream(null);
        return null;
      }
    },
    [mediaStream, resolutionConstraints, fps]
  );

  // (Re)acquire media on device-step entry and when quality changes.
  useEffect(() => {
    if (step !== "check") return;
    void refreshPreview({ camera: cameraOn, mic: micOn });
    return () => {
      if (micRafRef.current !== null) cancelAnimationFrame(micRafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, resolution, fps]);

  // Mic level meter (setup check only — cheap enough to keep while live too).
  useEffect(() => {
    if (!mediaStream || !micOn) {
      setMicLevel(0);
      return;
    }
    try {
      const ctx = audioCtxRef.current ?? new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(mediaStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (const v of data) sum += v * v;
        setMicLevel(Math.min(1, Math.sqrt(sum / data.length) / 90));
        micRafRef.current = requestAnimationFrame(tick);
      };
      tick();
      return () => {
        source.disconnect();
        analyser.disconnect();
      };
    } catch {
      return;
    }
  }, [mediaStream, micOn]);

  const toggleCamera = () => {
    const next = !cameraOn;
    setCameraOn(next);
    if (mediaStream) {
      mediaStream.getVideoTracks().forEach((t) => (t.enabled = next));
    } else if (next) {
      void refreshPreview({ camera: true, mic: micOn });
    }
  };

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    mediaStream?.getAudioTracks().forEach((t) => (t.enabled = next));
  };

  // ---- Step 1: create the stream -------------------------------------------
  const createStream = async (form: { title: string; description: string; category: string; tags: string; kind: "broadcast" | "call" }) => {
    setCreating(true);
    try {
      const res = await api.post<{ stream: Stream }>("/api/streams", {
        title: form.title,
        description: form.description || undefined,
        category: form.category,
        kind: form.kind,
        tags:
          form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 10) || undefined,
      });
      if (form.kind === "call") {
        // Calls run in their own room page (pre-join → mesh), not the studio console.
        toast.success("Call created — open it to start.");
        navigate(`/watch/${res.stream.id}`);
        return;
      }
      setStream(res.stream);
      setStep("check");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't create the stream. Try again.");
    } finally {
      setCreating(false);
    }
  };

  // ---- Step 3: go live -------------------------------------------------------
  const goLive = useCallback(async () => {
    if (!stream || !config) return;
    setLiveError(null);
    try {
      const media = mediaStream ?? (await refreshPreview({ camera: cameraOn, mic: micOn }));
      if (!media) {
        setStep("check");
        return;
      }

      const start = await api.post<StreamRow>(`/api/streams/${stream.id}/start`);
      if (start.ticket) setTicket(start.ticket);
      setStream(start.stream);

      const room = new RoomSocket(stream.id, {
        onWelcome: (welcome) => {
          if (welcome.role !== "host") return;
          const bc = new Broadcaster(room, config.iceServers);
          bc.publish(media, { maxBitrateBps: resolution === "1080p" ? 4_500_000 : resolution === "480p" ? 900_000 : 2_200_000 });
          setBroadcaster(bc);
          setViewerCount(0);
        },
        onViewerJoined: (viewerId) => {
          broadcasterRef.current?.addViewer(viewerId);
          setViewerCount((c) => Math.max(c, broadcasterRef.current?.viewerCount ?? c));
        },
        onViewerLeft: (viewerId) => {
          broadcasterRef.current?.removeViewer(viewerId);
          setViewerCount(broadcasterRef.current?.viewerCount ?? 0);
        },
        onSignal: (from, payload) => {
          void broadcasterRef.current?.handleViewerSignal(from, payload);
        },
        onPresence: (count) => {
          // Server-side truth; the local peer count converges to it.
          if (count === 0) setViewerCount(0);
        },
        onChat: (msg) => setMessages((prev) => [...prev.slice(-200), msg]),
        onRejected: (_code, message) => setLiveError(message),
        onDisconnected: () => setLiveError("Connection to the room dropped — retrying…"),
        onReconnected: () => setLiveError(null),
      });
      broadcasterRef.current = null;
      setRoom(room);
      room.connect({ type: "join", role: "host", token: start.ticket ?? ticket });

      if (autoRecord) startRecording(media);
      setStep("live");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Going live failed. Check your connection and retry.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, config, mediaStream, cameraOn, micOn, resolution, autoRecord, ticket, refreshPreview]);

  const broadcasterRef = useRef<Broadcaster | null>(null);
  useEffect(() => {
    broadcasterRef.current = broadcaster;
  }, [broadcaster]);

  // ---- Recording -------------------------------------------------------------
  const pickRecorderMime = (): string | undefined => {
    const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm;codecs=h264,opus", "video/webm"];
    return candidates.find((c) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c));
  };

  const startRecording = (media: MediaStream) => {
    try {
      const mimeType = pickRecorderMime();
      const recorder = new MediaRecorder(media, mimeType ? { mimeType, videoBitsPerSecond: 4_000_000 } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setRecordingUrl(URL.createObjectURL(blob));
        setIsRecording(false);
        toast.success("Recording ready", { description: "Download it below before leaving the studio." });
      };
      recorder.start(2000);
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      toast.error("Recording isn't supported in this browser.");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  };

  const downloadRecording = () => {
    if (!recordingUrl) return;
    const a = document.createElement("a");
    a.href = recordingUrl;
    a.download = `imlive-${stream?.id ?? "recording"}.webm`;
    a.click();
  };

  // ---- End broadcast ----------------------------------------------------------
  const endBroadcast = useCallback(async () => {
    if (!stream || ending) return;
    setEnding(true);
    try {
      stopRecording();
      broadcasterRef.current?.dropAll();
      room?.close();
      await api.post(`/api/streams/${stream.id}/stop`);
      toast.success("Broadcast ended");
      navigate("/dashboard");
    } catch {
      toast.error("Ended locally, but the server didn't confirm. Check the dashboard.");
      navigate("/dashboard");
    } finally {
      setEnding(false);
    }
  }, [stream, ending, room, navigate]);

  // Release devices when leaving the page entirely.
  useEffect(() => {
    return () => {
      mediaStream?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warn before leaving a live broadcast.
  useEffect(() => {
    if (step !== "live") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [step]);

  const elapsed = useElapsedSeconds(step === "live" ? stream?.startedAt : null);
  const shareUrl = stream ? absoluteUrl(`/watch/${stream.id}`) : "";

  return (
    <div className="flex min-h-screen flex-col" ref={revealRef}>
      <Navigation />
      <main className="container-app flex-1 py-8">
        {/* stepper */}
        <ol className="mb-8 flex items-center gap-2 text-sm" aria-label="Broadcast steps">
          {(
            [
              ["setup", "Details"],
              ["check", "Devices"],
              ["live", "On air"],
            ] as const
          ).map(([key, label], i) => {
            const order = ["setup", "check", "live"];
            const activeIdx = order.indexOf(step);
            const state = i < activeIdx ? "done" : i === activeIdx ? "current" : "todo";
            return (
              <li key={key} className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold tnum",
                    state === "done" && "border-ok/50 bg-ok/15 text-ok",
                    state === "current" && "border-live bg-live/15 text-live",
                    state === "todo" && "border-line text-text-faint"
                  )}
                >
                  {state === "done" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
                </span>
                <span className={cn(state === "todo" ? "text-text-faint" : "text-text")}>{label}</span>
                {i < 2 && <span className="mx-1 h-px w-8 bg-line" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>

        {step === "setup" && <SetupStep onSubmit={createStream} creating={creating} defaultCategory="Talk" />}
        {step === "check" && stream && (
          <DeviceStep
            stream={stream}
            previewRef={previewRef}
            deviceError={deviceError}
            cameraOn={cameraOn}
            micOn={micOn}
            micLevel={micLevel}
            resolution={resolution}
            fps={fps}
            autoRecord={autoRecord}
            onToggleCamera={toggleCamera}
            onToggleMic={toggleMic}
            onResolution={setResolution}
            onFps={setFps}
            onAutoRecord={setAutoRecord}
            onBack={() => setStep("setup")}
            onLive={() => void goLive()}
            mediaReady={!!mediaStream || !cameraOn}
          />
        )}
        {step === "live" && stream && (
          <LiveStep
            stream={stream}
            previewRef={previewRef}
            mediaStream={mediaStream}
            cameraOn={cameraOn}
            micOn={micOn}
            micLevel={micLevel}
            viewerCount={viewerCount}
            messages={messages}
            liveError={liveError}
            elapsed={elapsed}
            shareUrl={shareUrl}
            isRecording={isRecording}
            recordingUrl={recordingUrl}
            onToggleCamera={toggleCamera}
            onToggleMic={toggleMic}
            onStartRecording={() => mediaStream && startRecording(mediaStream)}
            onStopRecording={stopRecording}
            onDownload={downloadRecording}
            onEnd={() => void endBroadcast()}
            ending={ending}
          />
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SetupStep({
  onSubmit,
  creating,
  defaultCategory,
}: {
  onSubmit: (form: { title: string; description: string; category: string; tags: string; kind: "broadcast" | "call" }) => void;
  creating: boolean;
  defaultCategory: string;
}) {
  const categories = ["Gaming", "Music", "Talk", "Tech", "Art", "Sports", "Education", "IRL", "Other"];
  const [kind, setKind] = useState<"broadcast" | "call">("broadcast");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(defaultCategory);
  const [tags, setTags] = useState("");

  const titleValid = title.trim().length >= 3 && title.length <= 100;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl font-bold tracking-tight">Set up your broadcast</h1>
      <p className="mt-2 text-sm text-text-muted">
        Give your stream a name and a home. You can change any of this later from the dashboard.
      </p>

      <form
        className="panel mt-8 space-y-5 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (titleValid) onSubmit({ title: title.trim(), description, category, tags, kind });
        }}
      >
        <div className="space-y-2">
          <Label>What are we doing?</Label>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Room type">
            <button
              type="button"
              role="radio"
              aria-checked={kind === "broadcast"}
              onClick={() => setKind("broadcast")}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                kind === "broadcast" ? "border-accent bg-accent/10" : "border-line bg-bg-raised hover:border-line-strong"
              )}
            >
              <Radio className={cn("mt-0.5 h-4 w-4", kind === "broadcast" ? "text-accent" : "text-text-faint")} aria-hidden="true" />
              <span>
                <span className="block text-sm font-semibold text-white">Broadcast</span>
                <span className="block text-xs text-text-faint">You present, they watch — live</span>
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={kind === "call"}
              onClick={() => setKind("call")}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                kind === "call" ? "border-accent bg-accent/10" : "border-line bg-bg-raised hover:border-line-strong"
              )}
            >
              <Users className={cn("mt-0.5 h-4 w-4", kind === "call" ? "text-accent" : "text-text-faint")} aria-hidden="true" />
              <span>
                <span className="block text-sm font-semibold text-white">Video call</span>
                <span className="block text-xs text-text-faint">Everyone on camera, up to 8</span>
              </span>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Friday night synth jam"
            maxLength={100}
            required
            aria-describedby="title-hint"
          />
          <p id="title-hint" className="text-xs text-text-faint">
            {titleValid ? "Looks good." : "3–100 characters."}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this stream about?"
            maxLength={2000}
            rows={4}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="lofi, synth, live-set" />
            <p className="text-xs text-text-faint">Comma-separated, up to 10.</p>
          </div>
        </div>

        <div className="flex justify-end border-t border-line pt-5">
          <Button type="submit" variant="accent" disabled={!titleValid || creating}>
            {creating ? "Creating…" : kind === "call" ? "Create the call" : "Continue to devices"}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function DeviceStep({
  stream,
  previewRef,
  deviceError,
  cameraOn,
  micOn,
  micLevel,
  resolution,
  fps,
  autoRecord,
  onToggleCamera,
  onToggleMic,
  onResolution,
  onFps,
  onAutoRecord,
  onBack,
  onLive,
  mediaReady,
}: {
  stream: Stream;
  previewRef: React.RefObject<HTMLVideoElement>;
  deviceError: string | null;
  cameraOn: boolean;
  micOn: boolean;
  micLevel: number;
  resolution: "1080p" | "720p" | "480p";
  fps: "24" | "30" | "60";
  autoRecord: boolean;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onResolution: (v: "1080p" | "720p" | "480p") => void;
  onFps: (v: "24" | "30" | "60") => void;
  onAutoRecord: (v: boolean) => void;
  onBack: () => void;
  onLive: () => void;
  mediaReady: boolean;
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
      <div>
        <div className="scanlines relative aspect-video overflow-hidden rounded-xl border border-line bg-black">
          <video ref={previewRef} autoPlay muted playsInline className="h-full w-full object-cover" aria-label="Camera preview" />
          {!cameraOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-panel text-text-faint">
              <CameraOff className="h-8 w-8" aria-hidden="true" />
              <span className="text-sm">Camera is off</span>
            </div>
          )}
          {!cameraOn && !micOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-panel/95 text-center">
              <AlertTriangle className="h-8 w-8 text-warn" aria-hidden="true" />
              <p className="max-w-xs text-sm text-text-muted">You're about to go live with no camera and no microphone.</p>
            </div>
          )}
        </div>

        {deviceError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{deviceError}</span>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={cameraOn ? "outline" : "danger"} onClick={onToggleCamera}>
                  {cameraOn ? <Camera className="h-4 w-4" aria-hidden="true" /> : <CameraOff className="h-4 w-4" aria-hidden="true" />}
                  {cameraOn ? "Camera on" : "Camera off"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle your camera</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={micOn ? "outline" : "danger"} onClick={onToggleMic}>
                  {micOn ? <Mic className="h-4 w-4" aria-hidden="true" /> : <MicOff className="h-4 w-4" aria-hidden="true" />}
                  {micOn ? "Mic on" : "Mic off"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle your microphone</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="space-y-5">
        <div className="panel p-5">
          <h2 className="flex items-center gap-2 font-display font-semibold">
            <Settings2 className="h-4 w-4 text-accent" aria-hidden="true" /> Broadcast quality
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="res">Resolution</Label>
              <Select value={resolution} onValueChange={(v) => onResolution(v as "1080p" | "720p" | "480p")}>
                <SelectTrigger id="res" aria-label="Resolution">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1080p">1080p — sharp</SelectItem>
                  <SelectItem value="720p">720p — balanced</SelectItem>
                  <SelectItem value="480p">480p — light</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fps">Frame rate</Label>
              <Select value={fps} onValueChange={(v) => onFps(v as "24" | "30" | "60")}>
                <SelectTrigger id="fps" aria-label="Frame rate">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24">24 fps — cinematic</SelectItem>
                  <SelectItem value="30">30 fps — standard</SelectItem>
                  <SelectItem value="60">60 fps — smooth</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between">
              <Label htmlFor="mic-meter" className="text-sm">
                Microphone level
              </Label>
              <span className="micro">{micOn ? (micLevel > 0.02 ? "hearing you" : "quiet") : "muted"}</span>
            </div>
            <div id="mic-meter" className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(micLevel * 100)}>
              <div
                className={cn("h-full rounded-full transition-[width] duration-100", micLevel > 0.85 ? "bg-live" : "bg-ok")}
                style={{ width: `${Math.round(micLevel * 100)}%` }}
              />
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
            <div>
              <Label htmlFor="autorec" className="text-sm">
                Record this broadcast
              </Label>
              <p className="mt-0.5 text-xs text-text-faint">Saved locally in your browser — download when you're done.</p>
            </div>
            <Switch id="autorec" checked={autoRecord} onCheckedChange={onAutoRecord} />
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="micro mb-2">Streaming as</h2>
          <p className="font-display font-semibold">{stream.title}</p>
          <p className="mt-1 text-sm text-text-muted">
            {stream.category} · {stream.tags.length > 0 ? stream.tags.map((t) => `#${t}`).join(" ") : "no tags"}
          </p>
        </div>

        <div className="flex justify-between">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
          </Button>
          <Button variant="live" size="lg" disabled={!mediaReady} onClick={onLive}>
            <CircleDot className="h-4 w-4" aria-hidden="true" /> Go live
          </Button>
        </div>
      </div>
    </div>
  );
}

function LiveStep({
  stream,
  previewRef,
  mediaStream,
  cameraOn,
  micOn,
  micLevel,
  viewerCount,
  messages,
  liveError,
  elapsed,
  shareUrl,
  isRecording,
  recordingUrl,
  onToggleCamera,
  onToggleMic,
  onStartRecording,
  onStopRecording,
  onDownload,
  onEnd,
  ending,
}: {
  stream: Stream;
  previewRef: React.RefObject<HTMLVideoElement>;
  mediaStream: MediaStream | null;
  cameraOn: boolean;
  micOn: boolean;
  micLevel: number;
  viewerCount: number;
  messages: ChatMessage[];
  liveError: string | null;
  elapsed: number;
  shareUrl: string;
  isRecording: boolean;
  recordingUrl: string | null;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onDownload: () => void;
  onEnd: () => void;
  ending: boolean;
}) {
  const isLan = useIsLan();
  const [copied, setCopied] = useState(false);

  // Keep the preview element bound to the media stream.
  useEffect(() => {
    if (previewRef.current && mediaStream && previewRef.current.srcObject !== mediaStream) {
      previewRef.current.srcObject = mediaStream;
    }
  }, [mediaStream, previewRef]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied", { description: "Send it anywhere — viewers join instantly." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — long-press the link instead.");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <div className="scanlines relative aspect-video overflow-hidden rounded-xl border border-live/40 bg-black shadow-[0_0_60px_-18px_hsl(var(--live)/0.45)]">
          <video ref={previewRef} autoPlay muted playsInline className="h-full w-full object-cover" aria-label="Your live preview" />
          {!cameraOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-panel text-text-faint">
              <CameraOff className="h-8 w-8" aria-hidden="true" />
              <span className="text-sm">Camera off — viewers see this too</span>
            </div>
          )}
          <div className="absolute left-3 top-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md live-gradient px-2.5 py-1 text-xs font-bold uppercase tracking-[0.1em] text-white shadow-lg shadow-live/40 animate-pulse-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true" /> On air
            </span>
            <span className="rounded-md bg-black/60 px-2 py-1 text-xs text-white tnum backdrop-blur-sm">{formatDuration(elapsed)}</span>
          </div>
          <div className="absolute right-3 top-3 flex items-center gap-2">
            {isRecording && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-live/90 px-2 py-1 text-xs font-semibold text-white tnum">
                <CircleDot className="h-3.5 w-3.5 animate-pulse-soft" aria-hidden="true" /> REC
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs text-white tnum backdrop-blur-sm">
              <Radio className="h-3.5 w-3.5" aria-hidden="true" /> {viewerCount} watching
            </span>
          </div>
        </div>

        {liveError && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn" role="alert">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> {liveError}
          </div>
        )}

        {/* controls */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant={cameraOn ? "outline" : "danger"} onClick={onToggleCamera}>
            {cameraOn ? <Camera className="h-4 w-4" aria-hidden="true" /> : <CameraOff className="h-4 w-4" aria-hidden="true" />}
            {cameraOn ? "Camera on" : "Camera off"}
          </Button>
          <Button variant={micOn ? "outline" : "danger"} onClick={onToggleMic}>
            {micOn ? <Mic className="h-4 w-4" aria-hidden="true" /> : <MicOff className="h-4 w-4" aria-hidden="true" />}
            {micOn ? "Mic on" : "Mic off"}
          </Button>
          <div className="hidden w-24 sm:block" aria-hidden="true">
            <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
              <div
                className={cn("h-full rounded-full transition-[width] duration-100", micLevel > 0.85 ? "bg-live" : "bg-ok")}
                style={{ width: `${Math.round((micOn ? micLevel : 0) * 100)}%` }}
              />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {!isRecording ? (
              <Button variant="outline" onClick={onStartRecording}>
                <CircleDot className="h-4 w-4 text-live" aria-hidden="true" /> Record
              </Button>
            ) : (
              <Button variant="danger" onClick={onStopRecording}>
                <Square className="h-4 w-4" aria-hidden="true" /> Stop recording
              </Button>
            )}
            {recordingUrl && (
              <Button variant="accent" onClick={onDownload}>
                <Download className="h-4 w-4" aria-hidden="true" /> Download
              </Button>
            )}
            <Button variant="danger" onClick={onEnd} disabled={ending}>
              {ending ? "Ending…" : "End broadcast"}
            </Button>
          </div>
        </div>

        {/* share */}
        <div className="panel mt-5 p-4">
          <h2 className="micro mb-3">Share your stream</h2>
          <div className="flex items-center gap-2">
            <div className="flex h-10 flex-1 items-center gap-2 overflow-hidden rounded-lg border border-line bg-bg-raised px-3">
              <Link2 className="h-4 w-4 shrink-0 text-text-faint" aria-hidden="true" />
              <span className="truncate text-sm text-text-muted">{shareUrl}</span>
            </div>
            <Button variant="accent" onClick={() => void copyLink()}>
              {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          {isLan && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-bg-raised p-3">
              <div className="shrink-0 rounded-md bg-white p-1.5">
                <QRCodeSVG value={shareUrl} size={72} role="img" aria-label={`QR code for ${shareUrl}`} />
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
                  <Wifi className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> LAN mode
                </p>
                <p className="mt-0.5 text-xs text-text-muted">
                  This server is running on your local network — anyone on the same Wi-Fi/LAN can watch or join by opening this address. No internet needed.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* live chat */}
      <aside className="panel flex h-[480px] flex-col overflow-hidden lg:h-[calc(100vh-13rem)]" aria-label="Stream chat">
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Video className="h-4 w-4 text-live" aria-hidden="true" />
          <h2 className="font-display text-sm font-semibold">Room</h2>
          <Badge variant="live" className="ml-auto">
            {viewerCount} live
          </Badge>
        </header>
        <MessageList messages={messages} hostName={stream.host.displayName} />
        <p className="border-t border-line bg-bg-raised/50 px-4 py-2.5 text-center text-xs text-text-faint">
          You'll see chat here as viewers arrive.
        </p>
      </aside>
    </div>
  );
}
