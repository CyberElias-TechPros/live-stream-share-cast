import { Play, Volume2, Maximize, Settings2 } from "lucide-react";
import LiveBadge from "./LiveBadge";
import { formatViewers } from "@/utils/design";

/**
 * HeroPlayer — a cinematic, fully-CSS recreation of the product in action.
 * The "stream" is a living scene: gradient field, sheen sweep, EQ bars,
 * ghost chat, floating telemetry chips.
 */

const CHAT = [
  { who: "nova", color: "hsl(var(--accent-mid))", text: "the latency on this is unreal" },
  { who: "kai", color: "hsl(190 90% 60%)", text: "joined from tokyo ✈️" },
  { who: "mika", color: "hsl(330 90% 68%)", text: "first stream here — love it" },
];

export default function HeroPlayer() {
  return (
    <div className="relative mx-auto w-full max-w-5xl">
      {/* Ambient glow under the player */}
      <div className="absolute -inset-x-16 -bottom-10 top-1/3 rounded-[40px] bg-[hsl(var(--stream-h)_/_0.22)] blur-[90px]" aria-hidden />

      <div className="relative rounded-3xl glass-deep p-2 shadow-card sm:p-2.5">
        <div className="relative overflow-hidden rounded-2xl bg-black">
          {/* The living stream scene */}
          <div className="relative aspect-[16/9] sm:aspect-[21/9]">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(120deg, hsl(var(--sig-a) / 0.55) 0%, hsl(var(--sig-b) / 0.6) 35%, hsl(var(--sig-c) / 0.55) 68%, hsl(252 70% 16%) 100%)",
              }}
            />
            <div
              className="absolute inset-0 opacity-70"
              style={{
                background:
                  "radial-gradient(70% 90% at 75% 20%, hsl(var(--sig-c) / 0.5) 0%, transparent 55%), radial-gradient(60% 80% at 15% 85%, hsl(var(--sig-a) / 0.45) 0%, transparent 55%)",
              }}
            />
            {/* sheen sweep */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute top-0 bottom-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent animate-sheen" />
            </div>
            {/* depth vignette */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(120% 100% at 50% 0%, transparent 40%, hsl(252 60% 3% / 0.55) 100%)",
              }}
            />

            {/* faux "talent" silhouette glow */}
            <div className="absolute left-1/2 top-1/2 h-[52%] w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-t-full bg-white/[0.05] blur-xl" aria-hidden />

            {/* top overlay */}
            <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <LiveBadge />
                <div className="hidden sm:block">
                  <div className="viewer-count">
                    <span>{formatViewers(4821)} watching</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="viewer-count hidden md:flex">
                  <span className="eq text-white">
                    <span /><span /><span /><span />
                  </span>
                  <span>audio</span>
                </div>
                <div className="viewer-count">
                  <span>4K · 60</span>
                </div>
              </div>
            </div>

            {/* ghost chat */}
            <div className="absolute right-4 bottom-16 hidden w-64 flex-col gap-2 md:flex lg:bottom-20">
              {CHAT.map((m, i) => (
                <div
                  key={m.who}
                  className="rounded-xl bg-black/45 px-3 py-2 backdrop-blur-md"
                  style={{
                    opacity: 0.55 + i * 0.18,
                    animation: `slide-in 0.7s cubic-bezier(0.16,1,0.3,1) ${0.4 + i * 0.5}s both`,
                  }}
                >
                  <span className="font-mono text-[10px] font-semibold" style={{ color: m.color }}>
                    {m.who}
                  </span>
                  <p className="text-[12px] leading-snug text-white/85">{m.text}</p>
                </div>
              ))}
            </div>

            {/* control bar */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 sm:p-5">
              <div className="mb-3 h-[3px] w-full overflow-hidden rounded-full bg-white/15">
                <div className="h-full w-full origin-left animate-pulse bg-gradient-to-r from-stream via-[hsl(var(--accent-mid))] to-signal" style={{ animationDuration: "3s" }} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 sm:gap-4">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105">
                    <Play className="h-4 w-4 translate-x-[1px] fill-current" />
                  </span>
                  <Volume2 className="h-5 w-5 text-white/80" />
                  <span className="hidden font-mono text-[11px] tracking-wider text-white/70 sm:block">
                    LIVE · 12:48:06
                  </span>
                </div>
                <div className="flex items-center gap-3 sm:gap-4">
                  <span className="hidden rounded-md bg-white/10 px-2 py-0.5 font-mono text-[10px] tracking-wider text-white/85 sm:block">
                    AUTO
                  </span>
                  <Settings2 className="h-5 w-5 text-white/80" />
                  <Maximize className="h-5 w-5 text-white/80" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating telemetry chips */}
      <div className="absolute -left-6 top-10 hidden animate-float-slow xl:block" style={{ animationDelay: "0.4s" }}>
        <div className="glass rounded-2xl px-4 py-3 shadow-card">
          <p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">GLASS-TO-GLASS</p>
          <p className="mt-1 font-display text-2xl font-bold text-gradient">24ms</p>
        </div>
      </div>
      <div className="absolute -right-8 top-1/3 hidden animate-float xl:block">
        <div className="glass rounded-2xl px-4 py-3 shadow-card">
          <p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">ENCRYPTION</p>
          <p className="mt-1 font-display text-lg font-bold text-foreground">E2E · AES-256</p>
        </div>
      </div>
      <div className="absolute -bottom-8 -left-4 hidden animate-float md:block" style={{ animationDelay: "1.6s" }}>
        <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3 shadow-card">
          <div className="eq text-[hsl(var(--accent-mid))]">
            <span /><span /><span /><span />
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">SIGNAL</p>
            <p className="font-display text-lg font-bold text-foreground">Locked · 4.2 Mbps</p>
          </div>
        </div>
      </div>
    </div>
  );
}
