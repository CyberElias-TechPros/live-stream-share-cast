import { Link } from "react-router-dom";
import { Radio } from "lucide-react";
import Reveal from "./Reveal";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Browse live", to: "/stream" },
      { label: "Start streaming", to: "/stream/create" },
      { label: "Dashboard", to: "/dashboard" },
      { label: "Settings", to: "/settings" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Log in", to: "/login" },
      { label: "Sign up", to: "/signup" },
      { label: "Forgot password", to: "/forgot-password" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", to: "/privacy" },
      { label: "Terms", to: "/terms" },
      { label: "Help", to: "/help" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="relative mt-24 border-t border-white/8 bg-[hsl(252_40%_3.5%/0.6)]">
      <div className="container pt-16 pb-10">
        <Reveal>
          <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <Link to="/" className="inline-flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-signature shadow-glow">
                  <Radio className="h-5 w-5 text-white" strokeWidth={2.5} />
                </span>
                <span className="font-display text-xl font-bold tracking-tight">I&rsquo;m&nbsp;Live</span>
              </Link>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
                Your camera is a broadcast. Share one link and anyone on the
                planet can tune in — instantly.
              </p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-live opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
                </span>
                <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
                  2,847 creators live now
                </span>
              </div>
            </div>

            {columns.map((col) => (
              <div key={col.title}>
                <h4 className="overline mb-5">{col.title}</h4>
                <ul className="space-y-3">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link
                        to={l.to}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Reveal>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/6 pt-8 md:flex-row">
          <p className="font-mono text-[11px] tracking-wider text-muted-foreground/70">
            © {new Date().getFullYear()} I&rsquo;m LIVE. BROADCAST FROM EVERYWHERE.
          </p>
          <p className="font-mono text-[11px] tracking-wider text-muted-foreground/70">
            SIGNAL&nbsp;STRENGTH&nbsp;
            <span className="text-gradient font-semibold">100%</span>
          </p>
        </div>
      </div>

      {/* Giant wordmark */}
      <div className="pointer-events-none select-none overflow-hidden">
        <p className="bg-gradient-to-b from-white/[0.07] to-transparent bg-clip-text text-center font-display font-extrabold leading-none tracking-tight text-[18vw]">
          I&rsquo;m&nbsp;Live
        </p>
      </div>
    </footer>
  );
}
