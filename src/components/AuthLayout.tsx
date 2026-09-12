import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Radio } from "lucide-react";
import Atmosphere from "./Atmosphere";
import Reveal from "./Reveal";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

const MANIFESTO = [
  { k: "01", v: "One link, every screen" },
  { k: "02", v: "24ms glass-to-glass" },
  { k: "03", v: "Encrypted by default" },
];

/**
 * AuthLayout — split-screen immersive auth.
 * Left: living manifesto on the aurora. Right: the form in deep glass.
 */
export default function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="relative min-h-svh overflow-hidden bg-background">
      <Atmosphere intensity="hero" />
      <div className="grain-fixed" />

      <div className="relative z-10 mx-auto grid min-h-svh w-full max-w-6xl grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
        {/* Manifesto panel */}
        <div className="relative hidden flex-col justify-between p-12 lg:flex xl:p-16">
          <Link to="/" className="inline-flex items-center gap-2.5 self-start">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-signature shadow-glow">
              <Radio className="h-5 w-5 text-white" strokeWidth={2.5} />
            </span>
            <span className="font-display text-lg font-bold tracking-tight">I&rsquo;m&nbsp;Live</span>
          </Link>

          <div>
            <Reveal>
              <p className="overline mb-6">The broadcast standard</p>
              <h2 className="font-display text-5xl font-bold leading-[1.02] tracking-tight xl:text-6xl">
                The moment
                <br />
                you go live,
                <br />
                <span className="text-gradient">everyone is there.</span>
              </h2>
            </Reveal>

            <Reveal delay={150}>
              <ul className="mt-12 space-y-5">
                {MANIFESTO.map((m) => (
                  <li key={m.k} className="flex items-center gap-4">
                    <span className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground/60">{m.k}</span>
                    <span className="h-px w-8 bg-gradient-to-r from-stream/60 to-transparent" />
                    <span className="text-sm font-medium text-foreground/90">{m.v}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          <Reveal delay={250}>
            <div className="glass rounded-2xl p-5">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {["A", "M", "J", "K"].map((c, i) => (
                    <span
                      key={c}
                      className="grid h-7 w-7 place-items-center rounded-full text-[10px] font-semibold text-white ring-2 ring-[hsl(252_36%_6%)]"
                      style={{ background: `linear-gradient(135deg, hsl(${258 + i * 28} 85% 55%), hsl(${300 + i * 22} 90% 48%))` }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">12,480 creators</span> started their first stream this week
                </p>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Form panel */}
        <div className="flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md">
            <Link to="/" className="mb-10 inline-flex items-center gap-2.5 lg:hidden">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-signature shadow-glow">
                <Radio className="h-5 w-5 text-white" strokeWidth={2.5} />
              </span>
              <span className="font-display text-lg font-bold tracking-tight">I&rsquo;m&nbsp;Live</span>
            </Link>

            <Reveal>
              <h1 className="font-display text-4xl font-bold tracking-tight">{title}</h1>
              <p className="mt-2 text-muted-foreground">{subtitle}</p>
            </Reveal>

            <Reveal delay={120}>
              <div className="mt-10 glass-deep edge-light rounded-3xl p-7 shadow-card sm:p-8">
                {children}
              </div>
            </Reveal>

            {footer && (
              <Reveal delay={200}>
                <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>
              </Reveal>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
