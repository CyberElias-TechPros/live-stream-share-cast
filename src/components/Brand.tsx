import { cn } from "@/lib/utils";

/** The "I'm Live" wordmark with the signature live-dot apostrophe. */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center font-display font-bold tracking-tight text-text", className)}>
      <span>I</span>
      <span className="relative mx-[1px] inline-flex h-[0.62em] w-[0.62em] items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-live/25 animate-pulse-soft" aria-hidden="true" />
        <span className="h-[0.34em] w-[0.34em] rounded-full bg-live shadow-[0_0_10px_hsl(var(--live)/0.8)]" aria-hidden="true" />
      </span>
      {!compact && <span>M&nbsp;LIVE</span>}
    </span>
  );
}

/** Decorative equalizer bars (pure CSS, reduced-motion safe). */
export function Equalizer({ className, bars = 5, active = true }: { className?: string; bars?: number; active?: boolean }) {
  return (
    <span className={cn("inline-flex h-4 items-end gap-[3px]", className)} aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={cn("w-[3px] rounded-full bg-current", active && "eq-bar")}
          style={{
            height: `${[60, 100, 45, 85, 70, 95, 55][i % 7]}%`,
            animationDelay: `${(i % 5) * 0.13}s`,
            animationPlayState: active ? undefined : "paused",
          }}
        />
      ))}
    </span>
  );
}
