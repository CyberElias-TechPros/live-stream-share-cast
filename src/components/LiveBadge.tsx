import { formatViewers } from "@/utils/design";

interface LiveBadgeProps {
  size?: "sm" | "md";
  /** Show the animated equalizer bars */
  equalizer?: boolean;
  className?: string;
}

/**
 * LiveBadge — the signature pulsing "LIVE" mark.
 * Used everywhere a stream is on air.
 */
export default function LiveBadge({ size = "md", equalizer = true, className = "" }: LiveBadgeProps) {
  const sm = size === "sm";

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md bg-live/90 font-mono font-semibold text-white tracking-[0.18em] shadow-glow-live ${
        sm ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]"
      } ${className}`}
    >
      <span className={`rounded-full bg-white animate-pulse-dot ${sm ? "h-1 w-1" : "h-1.5 w-1.5"}`} />
      LIVE
      {equalizer && (
        <span className={`eq text-white ${sm ? "h-[8px] scale-90" : "h-[10px]"}`}>
          <span />
          <span />
          <span />
          <span />
        </span>
      )}
    </div>
  );
}

interface ViewerPillProps {
  count?: number;
  className?: string;
  light?: boolean;
}

export function ViewerPill({ count, className = "", light = true }: ViewerPillProps) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[11px] tracking-wider ${
        light ? "bg-black/55 text-white/90" : "bg-white/10 text-white"
      } backdrop-blur-md ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-live opacity-75 animate-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-live" />
      </span>
      {formatViewers(count)}
    </div>
  );
}
