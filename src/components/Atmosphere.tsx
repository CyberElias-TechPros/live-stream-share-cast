/**
 * Atmosphere — the cinematic backdrop of the whole product.
 * Aurora blobs + fine blueprint grid + fixed film grain.
 * Render once per page.
 */

interface AtmosphereProps {
  /** "hero" = brighter, more saturated (landing/auth). "page" = calmer (app screens). */
  intensity?: "hero" | "page";
  /** Pin the atmosphere to the viewport (app pages) instead of the section. */
  fixed?: boolean;
  className?: string;
}

export default function Atmosphere({ intensity = "hero", fixed = false, className = "" }: AtmosphereProps) {
  const hero = intensity === "hero";

  return (
    <div aria-hidden className={`pointer-events-none ${fixed ? "fixed" : "absolute"} inset-0 overflow-hidden ${className}`}>
      {/* Aurora */}
      <div
        className={`absolute -top-[30%] left-1/2 -translate-x-1/2 h-[90vh] w-[140vw] rounded-full blur-[120px] animate-aurora ${
          hero ? "bg-[hsl(var(--stream-h)_/_0.34)]" : "bg-[hsl(var(--stream-h)_/_0.16)]"
        }`}
        style={{ animationDuration: "26s" }}
      />
      <div
        className={`absolute top-[10%] -right-[25%] h-[70vh] w-[80vw] rounded-full blur-[110px] animate-aurora-alt ${
          hero ? "bg-[hsl(var(--signal-h)_/_0.22)]" : "bg-[hsl(var(--signal-h)_/_0.1)]"
        }`}
        style={{ animationDuration: "32s" }}
      />
      <div
        className={`absolute -bottom-[30%] -left-[20%] h-[60vh] w-[70vw] rounded-full blur-[120px] animate-aurora ${
          hero ? "bg-[hsl(var(--stream-lo)_/_0.16)]" : "bg-[hsl(var(--stream-lo)_/_0.07)]"
        }`}
        style={{ animationDuration: "40s" }}
      />

      {/* Blueprint grid, fading from the top */}
      <div className="absolute inset-0 blueprint" />

      {/* Horizon glow line */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[hsl(263_83%_62%/0.4)] to-transparent" />
    </div>
  );
}
