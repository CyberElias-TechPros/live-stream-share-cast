import { Fragment } from "react";

interface MarqueeProps {
  items: string[];
  className?: string;
}

/**
 * Marquee — infinite capability ticker. Duplicated track, seamless -50% loop.
 */
export default function Marquee({ items, className = "" }: MarqueeProps) {
  const row = (ariaHidden: boolean) => (
    <div
      aria-hidden={ariaHidden || undefined}
      className="flex shrink-0 items-center"
    >
      {items.map((item, i) => (
        <Fragment key={i}>
          <span className="whitespace-nowrap font-mono text-[11px] md:text-xs tracking-[0.3em] uppercase text-muted-foreground">
            {item}
          </span>
          <span className="mx-6 md:mx-8 inline-block h-1 w-1 rounded-full bg-gradient-to-r from-stream to-signal shrink-0" />
        </Fragment>
      ))}
    </div>
  );

  return (
    <div className={`relative overflow-hidden border-y border-border/60 bg-card/40 py-4 backdrop-blur-sm ${className}`}>
      <div className="flex w-max animate-marquee">
        {row(false)}
        {row(true)}
      </div>
      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}
