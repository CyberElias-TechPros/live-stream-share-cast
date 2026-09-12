import { Link } from "react-router-dom";
import { Eye, Radio } from "lucide-react";
import { formatCount } from "@/hooks/useElapsedSeconds";
import type { Stream } from "@/types";
import { cn } from "@/lib/utils";

const CATEGORY_HUES: Record<string, string> = {
  Gaming: "from-violet-600/50 via-fuchsia-500/25",
  Music: "from-rose-500/50 via-orange-400/25",
  Talk: "from-sky-500/50 via-cyan-400/25",
  Tech: "from-cyan-500/50 via-emerald-400/25",
  Art: "from-pink-500/50 via-violet-400/25",
  Sports: "from-emerald-500/50 via-lime-400/25",
  Education: "from-amber-500/50 via-yellow-400/25",
  IRL: "from-indigo-500/50 via-blue-400/25",
  Other: "from-slate-500/50 via-slate-400/25",
};

/** Card for a live (or recent) stream — the atomic unit of Browse/Profile. */
export function StreamCard({ stream, className }: { stream: Stream; className?: string }) {
  const hue = CATEGORY_HUES[stream.category] ?? CATEGORY_HUES.Other;
  const initials = stream.host.displayName?.slice(0, 1).toUpperCase() ?? "?";

  return (
    <Link
      to={`/watch/${stream.id}`}
      className={cn(
        "group relative block overflow-hidden rounded-xl border border-line bg-panel",
        "transition-all duration-300 ease-out-expo hover:-translate-y-1 hover:border-line-strong hover:shadow-[0_16px_40px_-16px_rgba(0,0,0,0.8)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
        className
      )}
      aria-label={stream.isLive ? `Watch ${stream.title} — live now` : `${stream.title} (offline)`}
    >
      <div className={cn("scanlines relative aspect-video overflow-hidden bg-gradient-to-br to-transparent", hue)}>
        {/* Atmospheric placeholder art — category-tinted signal field */}
        <div className="absolute inset-0 opacity-70" aria-hidden="true">
          <div className="grid-bg absolute inset-0" />
          <div
            className="absolute -right-8 -top-8 h-36 w-36 rounded-full blur-3xl transition-transform duration-500 group-hover:scale-125"
            style={{ background: `${stream.host.avatarColor}30` }}
          />
          <span className="absolute inset-0 flex items-center justify-center font-display text-5xl font-bold text-white/15 transition-transform duration-500 group-hover:scale-110">
            {initials}
          </span>
        </div>

        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
          {stream.isLive ? (
            <span className="inline-flex items-center gap-1.5 rounded-md live-gradient px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white shadow-lg shadow-live/30">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-soft" aria-hidden="true" />
              Live
            </span>
          ) : (
            <span className="rounded-md border border-line-strong bg-black/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-text-faint">
              Offline
            </span>
          )}
        </div>

        {stream.isLive && (
          <span className="viewer-count absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm tnum">
            <Eye className="h-3 w-3" aria-hidden="true" />
            {formatCount(stream.viewerCount)}
          </span>
        )}
        <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/70">
          {stream.category}
        </span>
      </div>

      <div className="p-3.5">
        <h3 className="line-clamp-1 font-display text-[15px] font-semibold leading-snug text-text transition-colors group-hover:text-white">
          {stream.title}
        </h3>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-text-muted">
          <Radio className="h-3 w-3 text-text-faint" aria-hidden="true" />
          <span className="truncate">{stream.host.displayName || stream.host.username}</span>
        </p>
      </div>
    </Link>
  );
}

export function StreamCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel">
      <div className="shimmer aspect-video" />
      <div className="space-y-2 p-3.5">
        <div className="shimmer h-4 w-3/4 rounded" />
        <div className="shimmer h-3 w-1/2 rounded" />
      </div>
    </div>
  );
}
