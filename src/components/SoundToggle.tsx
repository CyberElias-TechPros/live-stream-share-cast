import { useState } from "react";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { VolumeX } from "lucide-react";
import { ambientAudio, sceneForPath } from "@/lib/ambientAudio";

/**
 * SoundToggle — enables the whisper-quiet ambient soundscape.
 * Off by default; state persists per browser.
 */
export default function SoundToggle({ className = "" }: { className?: string }) {
  const [enabled, setEnabled] = useState(ambientAudio.enabled);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    await ambientAudio.setEnabled(next);
    if (next) ambientAudio.blip("toggle");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={enabled ? "Turn ambient sound off" : "Turn ambient sound on"}
      title={enabled ? "Ambient sound: on" : "Ambient sound: off"}
      className={`relative grid h-9 w-9 place-items-center rounded-full border transition-all duration-300 ${
        enabled
          ? "border-white/25 bg-white/[0.08] text-foreground"
          : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
      } ${className}`}
    >
      {enabled ? (
        <span className="flex h-3.5 items-end gap-[2.5px]" aria-hidden>
          <span
            className="h-full w-[2.5px] origin-bottom rounded-full bg-[hsl(var(--accent-hi))] animate-[eq-1_1.1s_ease-in-out_infinite]"
          />
          <span
            className="h-full w-[2.5px] origin-bottom rounded-full bg-[hsl(var(--accent-hi))] animate-[eq-2_0.9s_ease-in-out_infinite]"
          />
          <span
            className="h-full w-[2.5px] origin-bottom rounded-full bg-[hsl(var(--accent-hi))] animate-[eq-3_1.3s_ease-in-out_infinite]"
          />
        </span>
      ) : (
        <VolumeX className="h-4 w-4" aria-hidden />
      )}
      {enabled && (
        <span
          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[hsl(var(--accent-hi))] shadow-glow"
          aria-hidden
        />
      )}
    </button>
  );
}

/**
 * SoundCues — mounts once (in App). Crossfades the drone to match the
 * route, plays a soft blip on navigation, and suspends when hidden.
 * Silent when sound is off.
 */
export function SoundCues() {
  const location = useLocation();
  const first = useRef(true);

  useEffect(() => {
    const scene = sceneForPath(location.pathname);
    ambientAudio.setScene(scene);
    if (first.current) {
      first.current = false;
      return;
    }
    if (ambientAudio.enabled) ambientAudio.blip("nav");
  }, [location.pathname]);

  useEffect(() => {
    const onVis = () => ambientAudio.handleVisibility();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return null;
}
