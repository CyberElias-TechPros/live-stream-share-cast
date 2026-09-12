import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Camera,
  Eye,
  Link2,
  MessageSquare,
  MonitorSmartphone,
  Radio,
  Shield,
  Video,
  Zap,
} from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Equalizer, Logo } from "@/components/Brand";
import { useReveal } from "@/hooks/useReveal";
import { useSEO, SITE_DEFAULT_DESCRIPTION } from "@/hooks/useSEO";
import { formatCount } from "@/hooks/useElapsedSeconds";
import { api } from "@/lib/api";
import type { Stream } from "@/types";

const STEPS = [
  {
    n: "01",
    icon: Camera,
    title: "Open the studio",
    body: "Create a stream, check your camera and mic in a live preview, and pick your quality. No installs, no encoder setup.",
  },
  {
    n: "02",
    icon: Link2,
    title: "Share one link",
    body: "Every stream gets a single URL. Send it anywhere — chat, text, social. Viewers join in their browser instantly.",
  },
  {
    n: "03",
    icon: Radio,
    title: "Go live, for real",
    body: "Your camera streams peer-to-peer with sub-second latency. Real viewer counts, real-time chat, one click to record.",
  },
];

const FEATURES = [
  {
    icon: Zap,
    title: "Sub-second latency",
    body: "WebRTC moves frames straight from your camera to your viewers — no 20-second delays, no buffering wheels.",
    span: "md:col-span-2",
  },
  {
    icon: MessageSquare,
    title: "Live chat, built in",
    body: "Every stream carries a real-time chat room. Signed-in viewers talk; you see the room react as it happens.",
  },
  {
    icon: Eye,
    title: "Honest viewer counts",
    body: "Presence is tracked at the connection level. If someone's watching, you'll know — no phantom numbers.",
  },
  {
    icon: Video,
    title: "One-click recording",
    body: "Capture your broadcast locally in full quality and download the file the moment you go offline.",
  },
  {
    icon: Shield,
    title: "Your link, your room",
    body: "Streams are unlisted by default — only people with the link can watch. Nothing to index, nothing to scrape.",
    span: "md:col-span-2",
  },
  {
    icon: MonitorSmartphone,
    title: "Any modern browser",
    body: "Chrome, Edge, Firefox, Safari — desktop or phone. Your audience brings the device they already have.",
  },
];

export default function Index() {
  const revealRef = useReveal<HTMLDivElement>();
  useSEO({
    title: "I'm Live — Go live from your browser in seconds",
    description: SITE_DEFAULT_DESCRIPTION,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "I'm Live",
        url: typeof window !== "undefined" ? window.location.origin : "https://imlive.app",
        description: SITE_DEFAULT_DESCRIPTION,
        potentialAction: {
          "@type": "SearchAction",
          target: `${typeof window !== "undefined" ? window.location.origin : ""}/browse?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: "I'm Live",
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Web",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
    ],
  });

  const { data: liveStreams = [] } = useQuery({
    queryKey: ["live-streams", "ticker"],
    queryFn: () => api.get<{ streams: Stream[] }>("/api/streams", { live: 1, limit: 12 }),
    select: (d) => d.streams,
    refetchInterval: 30_000,
  });

  return (
    <div className="flex min-h-screen flex-col" ref={revealRef}>
      <Navigation />

      <main className="flex-1">
        {/* ============ HERO ============ */}
        <section className="noise relative overflow-hidden" aria-labelledby="hero-heading">
          <div className="grid-bg absolute inset-0" aria-hidden="true" />
          <div
            className="absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full blur-3xl"
            style={{ background: "radial-gradient(closest-side, hsl(var(--accent)/0.16), transparent)" }}
            aria-hidden="true"
          />
          <div
            className="absolute -left-40 top-40 h-[320px] w-[320px] rounded-full blur-3xl"
            style={{ background: "radial-gradient(closest-side, hsl(var(--live)/0.12), transparent)" }}
            aria-hidden="true"
          />

          <div className="container-app relative grid items-center gap-14 pb-20 pt-16 sm:pt-24 lg:grid-cols-[1.15fr_0.85fr] lg:pb-28">
            <div>
              <p className="reveal micro flex items-center gap-2" style={{ "--reveal-delay": "0ms" } as React.CSSProperties}>
                <span className="live-dot" aria-hidden="true" />
                On air — live video for the open web
              </p>

              <h1
                id="hero-heading"
                className="reveal mt-5 font-display text-[clamp(2.9rem,8vw,5.5rem)] font-bold leading-[0.98] tracking-[-0.03em]"
                style={{ "--reveal-delay": "80ms" } as React.CSSProperties}
              >
                Be seen.
                <br />
                <span className="text-gradient">In real time.</span>
                <span className="caret-blink ml-2 inline-block h-[0.78em] w-[3px] translate-y-[0.08em] bg-live align-baseline" aria-hidden="true" />
              </h1>

              <p
                className="reveal mt-6 max-w-xl text-lg leading-relaxed text-text-muted"
                style={{ "--reveal-delay": "160ms" } as React.CSSProperties}
              >
                I'm Live turns your browser into a broadcast studio. Go live from your camera in one click, share a
                single link, and watch the room respond — chat, viewers, and reactions, all in real time.
              </p>

              <div className="reveal mt-9 flex flex-col gap-3 sm:flex-row" style={{ "--reveal-delay": "240ms" } as React.CSSProperties}>
                <Button asChild variant="live" size="lg" className="group">
                  <Link to="/studio">
                    <Video className="h-4 w-4" aria-hidden="true" />
                    Start streaming
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/browse">
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    Watch live now
                  </Link>
                </Button>
              </div>

              <dl className="reveal mt-10 flex flex-wrap gap-x-10 gap-y-4" style={{ "--reveal-delay": "320ms" } as React.CSSProperties}>
                {[
                  ["~0.5s", "glass-to-glass latency"],
                  ["0", "installs for you or viewers"],
                  ["1 link", "to share everywhere"],
                ].map(([value, label]) => (
                  <div key={label}>
                    <dt className="sr-only">{label}</dt>
                    <dd className="font-display text-xl font-bold text-text tnum">{value}</dd>
                    <dd className="micro mt-0.5">{label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Console mock — stylized product tease (decorative) */}
            <div className="reveal relative mx-auto w-full max-w-md" style={{ "--reveal-delay": "300ms" } as React.CSSProperties} aria-hidden="true">
              <div className="animate-float">
                <div className="panel-glass scanlines relative overflow-hidden p-4 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)]">
                  <div className="flex items-center justify-between">
                    <Badge variant="live">● On Air</Badge>
                    <span className="micro tnum">00:42:17</span>
                  </div>
                  <div className="relative mt-3 aspect-video overflow-hidden rounded-lg border border-line bg-gradient-to-br from-accent-deep/40 via-panel to-live/20">
                    <div className="grid-bg absolute inset-0 opacity-60" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Equalizer className="h-10 text-live" bars={7} />
                    </div>
                    <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white tnum">
                      <Eye className="h-3 w-3" /> 47 watching
                    </span>
                  </div>
                  <div className="mt-3 space-y-2 text-[13px] leading-snug">
                    <p className="text-text-faint">
                      <span className="font-semibold text-accent">nova</span> this latency is unreal 🔥
                    </p>
                    <p className="text-text-faint">
                      <span className="font-semibold text-live-hot">orbit</span> sharing the link with the team rn
                    </p>
                  </div>
                </div>
                {/* floating chips */}
                <div className="panel-glass absolute -left-6 -top-5 hidden items-center gap-2 px-3 py-2 text-xs text-text-muted sm:flex">
                  <span className="live-dot" /> viewer joined
                </div>
                <div className="panel-glass absolute -bottom-5 -right-4 hidden items-center gap-2 px-3 py-2 text-xs text-text-muted sm:flex">
                  <MessageSquare className="h-3.5 w-3.5 text-accent" /> chat: 12 new
                </div>
              </div>
            </div>
          </div>

          {/* Live ticker — only when the world is actually live */}
          {liveStreams.length > 0 && (
            <div className="marquee-paused relative border-y border-line bg-bg-raised/60 py-3" aria-label="Live right now">
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-bg to-transparent" aria-hidden="true" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-bg to-transparent" aria-hidden="true" />
              <div className="flex w-max animate-marquee gap-10 px-6">
                {[...liveStreams, ...liveStreams].map((s, i) => (
                  <Link
                    key={`${s.id}-${i}`}
                    to={`/watch/${s.id}`}
                    className="flex items-center gap-2.5 whitespace-nowrap text-sm text-text-muted transition-colors hover:text-text"
                  >
                    <span className="live-dot" aria-hidden="true" />
                    <span className="font-medium text-text">{s.title}</span>
                    <span className="text-text-faint">· {s.host.displayName || s.host.username}</span>
                    <span className="inline-flex items-center gap-1 text-text-faint tnum">
                      <Eye className="h-3 w-3" /> {formatCount(s.viewerCount)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ============ HOW IT WORKS ============ */}
        <section className="container-app py-20 sm:py-28" aria-labelledby="how-heading">
          <div className="reveal max-w-2xl">
            <p className="micro">How it works</p>
            <h2 id="how-heading" className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              From zero to on air in under a minute
            </h2>
          </div>
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li
                key={step.n}
                className="reveal panel group relative overflow-hidden p-6 transition-colors duration-300 hover:border-line-strong"
                style={{ "--reveal-delay": `${i * 90}ms` } as React.CSSProperties}
              >
                <span
                  className="pointer-events-none absolute -right-3 -top-7 font-display text-[7rem] font-bold leading-none text-panel-2 transition-colors duration-300 group-hover:text-line"
                  aria-hidden="true"
                >
                  {step.n}
                </span>
                <div className="relative">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-panel-2 text-accent">
                    <step.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ============ FEATURES BENTO ============ */}
        <section className="border-y border-line bg-bg-raised/30 py-20 sm:py-28" aria-labelledby="features-heading">
          <div className="container-app">
            <div className="reveal flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
              <div className="max-w-2xl">
                <p className="micro">Why I'm Live</p>
                <h2 id="features-heading" className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                  A studio that respects your time
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-relaxed text-text-muted">
                No dashboards to learn, no OBS scenes to wire. The essentials of live video, engineered well.
              </p>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {FEATURES.map((f, i) => (
                <article
                  key={f.title}
                  className={`reveal panel group p-6 transition-all duration-300 hover:-translate-y-1 hover:border-line-strong ${f.span ?? ""}`}
                  style={{ "--reveal-delay": `${(i % 3) * 90}ms` } as React.CSSProperties}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-live/25 bg-live/10 text-live transition-shadow duration-300 group-hover:shadow-[0_0_24px_-6px_hsl(var(--live)/0.5)]">
                    <f.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-muted">{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ============ CTA ============ */}
        <section className="noise relative overflow-hidden py-24 sm:py-32" aria-labelledby="cta-heading">
          <div
            className="absolute left-1/2 top-1/2 h-[380px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
            style={{ background: "radial-gradient(closest-side, hsl(var(--live)/0.14), transparent)" }}
            aria-hidden="true"
          />
          <div className="reveal container-app relative text-center">
            <Logo className="justify-center text-2xl" />
            <h2 id="cta-heading" className="mx-auto mt-6 max-w-2xl font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Your audience is one link away.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-text-muted">
              Create a free account, open the studio, and go live before the coffee cools.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild variant="live" size="lg" className="group">
                <Link to="/signup">
                  Go live now
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link to="/browse">See who's live</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
