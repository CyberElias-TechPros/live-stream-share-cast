import { Link } from "react-router-dom";
import {
  ArrowRight,
  Play,
  Share2,
  ShieldCheck,
  Clapperboard,
  MonitorSmartphone,
  Copy,
  Check,
  Globe2,
  Radio,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import Atmosphere from "@/components/Atmosphere";
import Reveal from "@/components/Reveal";
import Marquee from "@/components/Marquee";
import HeroPlayer from "@/components/HeroPlayer";
import ErrorBoundary from "@/components/ErrorBoundary";

const TICKER = [
  "Ultra-low latency",
  "End-to-end encrypted",
  "4K @ 60fps",
  "One-link sharing",
  "Built-in recording",
  "Live chat in the loop",
  "Local & global",
  "Zero installs",
];

const STEPS = [
  {
    n: "01",
    icon: Radio,
    title: "Flip the switch",
    body: "Open I'm Live, grant camera access, and hit go. You're broadcasting in about four seconds — faster than your coffee cools.",
  },
  {
    n: "02",
    icon: Share2,
    title: "Send one link",
    body: "Every stream gets a single beautiful URL. Text it, post it, slap it on a screen — the link is the invitation.",
  },
  {
    n: "03",
    icon: Play,
    title: "Watch instantly",
    body: "Your viewers tap and they're there — in any browser, on any screen, with chat and zero friction.",
  },
];

function CopyChip() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText("imlive.to/s/your-stream").catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="group/chip flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-left transition-colors hover:border-white/25"
    >
      <span className="truncate font-mono text-[12px] text-white/85">imlive.to/s/your-stream</span>
      <span className={`shrink-0 transition-colors ${copied ? "text-emerald-400" : "text-white/50 group-hover/chip:text-white"}`}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </span>
    </button>
  );
}

const Index = () => {
  return (
    <ErrorBoundary>
      <div className="relative min-h-svh overflow-hidden bg-background">
        <Atmosphere intensity="hero" />
        <div className="grain-fixed" />

        <div className="relative z-10 flex min-h-svh flex-col">
          <Navigation />

          <main className="flex-1">
            {/* ============================ HERO ============================ */}
            <section className="relative px-5 pt-32 pb-16 sm:pt-36 md:pb-24">
              <div className="mx-auto max-w-4xl text-center">
                <Reveal>
                  <div className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 backdrop-blur-md">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-live opacity-75 animate-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
                    </span>
                    <span className="font-mono text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
                      2,847 creators broadcasting now
                    </span>
                  </div>
                </Reveal>

                <Reveal delay={90}>
                  <h1 className="font-display text-5xl font-bold leading-[0.98] tracking-tight text-balance sm:text-6xl md:text-7xl lg:text-[5.4rem]">
                    Go live in a&nbsp;click.
                    <br />
                    <span className="text-gradient">Watch in real time.</span>
                  </h1>
                </Reveal>

                <Reveal delay={180}>
                  <p className="mx-auto mt-7 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                    I&rsquo;m Live turns your camera into a broadcast. Share one
                    link, and anyone on earth can tune in instantly — no
                    downloads, no friction, no waiting.
                  </p>
                </Reveal>

                <Reveal delay={270}>
                  <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                    <Link to="/stream/create" className="w-full sm:w-auto">
                      <Button variant="glow" size="lg" className="w-full sm:w-auto">
                        Start streaming
                        <ArrowRight className="transition-transform duration-300 group-hover/btn:translate-x-1" />
                      </Button>
                    </Link>
                    <Link to="/stream" className="w-full sm:w-auto">
                      <Button variant="glass" size="lg" className="w-full sm:w-auto">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-black">
                          <Play className="h-3 w-3 translate-x-[0.5px] fill-current" />
                        </span>
                        Watch live now
                      </Button>
                    </Link>
                  </div>
                </Reveal>

                <Reveal delay={360}>
                  <p className="mt-8 font-mono text-[11px] tracking-[0.25em] text-muted-foreground/70 uppercase">
                    Free to start&nbsp;&nbsp;·&nbsp;&nbsp;No downloads&nbsp;&nbsp;·&nbsp;&nbsp;Any browser
                  </p>
                </Reveal>
              </div>

              <Reveal delay={200} className="mt-16 md:mt-20">
                <HeroPlayer />
              </Reveal>
            </section>

            {/* ============================ TICKER ============================ */}
            <Marquee items={TICKER} />

            {/* ============================ BENTO ============================ */}
            <section className="container relative py-24 md:py-32">
              <Reveal>
                <div className="mb-14 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="overline mb-4">Why I&rsquo;m Live</p>
                    <h2 className="max-w-xl font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
                      Built like a stage,
                      <br />
                      <span className="text-muted-foreground">runs like a signal.</span>
                    </h2>
                  </div>
                  <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                    Every part of the pipeline — encode, route, render — is
                    tuned for the moment a stranger taps your link and just
                    <em className="text-foreground not-italic font-medium">shows up</em>.
                  </p>
                </div>
              </Reveal>

              <div className="grid gap-4 md:grid-cols-3">
                {/* Wide: one-click sharing */}
                <Reveal className="md:col-span-2">
                  <div className="group edge-light relative h-full overflow-hidden rounded-3xl border border-white/8 bg-card p-7 transition-all duration-500 hover:border-white/20 sm:p-9">
                    <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[hsl(var(--accent-mid)_/_0.14)] blur-3xl transition-opacity duration-700 group-hover:opacity-100 md:opacity-60" />
                    <div className="relative">
                      <div className="mb-5 inline-grid h-11 w-11 place-items-center rounded-xl bg-signature-soft text-[hsl(var(--accent-hi))] ring-1 ring-white/10">
                        <Share2 size={20} />
                      </div>
                      <h3 className="font-display text-2xl font-bold tracking-tight">One-click sharing</h3>
                      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                        A unique link, generated the instant you go live. That
                        single URL is your stage door — share it anywhere and
                        your audience is already in the seats.
                      </p>
                      <div className="mt-6 max-w-sm">
                        <CopyChip />
                      </div>
                    </div>
                  </div>
                </Reveal>

                <Reveal delay={100}>
                  <div className="group edge-light relative h-full overflow-hidden rounded-3xl border border-white/8 bg-card p-7 transition-all duration-500 hover:border-white/20">
                    <div className="absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-[hsl(190_90%_50%/0.12)] blur-3xl transition-opacity duration-700 md:opacity-50 group-hover:opacity-100" />
                    <div className="relative flex h-full flex-col">
                      <div className="mb-5 inline-grid h-11 w-11 w-fit place-items-center rounded-xl bg-signature-soft text-[hsl(var(--accent-hi))] ring-1 ring-white/10">
                        <Globe2 size={20} />
                      </div>
                      <h3 className="font-display text-xl font-bold tracking-tight">Ultra-low latency</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        24 milliseconds glass-to-glass. Close enough to a
                        conversation, not a broadcast.
                      </p>
                      <div className="mt-auto flex items-end gap-1 pt-6 text-[hsl(var(--accent-mid))]">
                        <div className="eq h-7 w-full">
                          <span /><span /><span /><span />
                        </div>
                        <span className="font-mono text-[11px] text-muted-foreground">24ms</span>
                      </div>
                    </div>
                  </div>
                </Reveal>

                <Reveal>
                  <div className="group edge-light relative h-full overflow-hidden rounded-3xl border border-white/8 bg-card p-7 transition-all duration-500 hover:border-white/20">
                    <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[hsl(160_80%_45%/0.12)] blur-3xl transition-opacity duration-700 md:opacity-50 group-hover:opacity-100" />
                    <div className="relative">
                      <div className="mb-5 inline-grid h-11 w-11 place-items-center rounded-xl bg-signature-soft text-[hsl(160_70%_60%)] ring-1 ring-white/10">
                        <ShieldCheck size={20} />
                      </div>
                      <h3 className="font-display text-xl font-bold tracking-tight">Private by design</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        Encrypted end-to-end, viewable only by whoever holds
                        your link. Your stream stays yours.
                      </p>
                      <p className="mt-5 font-mono text-[10px] tracking-[0.25em] text-muted-foreground/60">
                        E2E · AES-256 · NO ADS
                      </p>
                    </div>
                  </div>
                </Reveal>

                <Reveal delay={100}>
                  <div className="group edge-light relative h-full overflow-hidden rounded-3xl border border-white/8 bg-card p-7 transition-all duration-500 hover:border-white/20">
                    <div className="absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-[hsl(var(--signal-h)_/_0.12)] blur-3xl transition-opacity duration-700 md:opacity-50 group-hover:opacity-100" />
                    <div className="relative flex h-full flex-col">
                      <div className="mb-5 inline-grid h-11 w-11 w-fit place-items-center rounded-xl bg-signature-soft text-[hsl(330_90%_70%)] ring-1 ring-white/10">
                        <Clapperboard size={20} />
                      </div>
                      <h3 className="font-display text-xl font-bold tracking-tight">Record & save</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        One click and the whole session is captured, ready to
                        download, share, or archive.
                      </p>
                      <div className="mt-auto pt-6">
                        <div className="flex h-1.5 gap-1 overflow-hidden">
                          <span className="flex-[3] rounded-full bg-gradient-to-r from-stream to-signal" />
                          <span className="flex-1 rounded-full bg-white/15" />
                        </div>
                        <p className="mt-2 font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60">
                          REC · 00:42:17
                        </p>
                      </div>
                    </div>
                  </div>
                </Reveal>

                <Reveal delay={200} className="md:col-span-2">
                  <div className="group edge-light relative h-full overflow-hidden rounded-3xl border border-white/8 bg-card p-7 transition-all duration-500 hover:border-white/20 sm:p-9">
                    <div className="absolute -right-24 -bottom-24 h-72 w-72 rounded-full bg-[hsl(var(--stream-h)_/_0.14)] blur-3xl transition-opacity duration-700 md:opacity-60 group-hover:opacity-100" />
                    <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="mb-5 inline-grid h-11 w-11 place-items-center rounded-xl bg-signature-soft text-[hsl(var(--accent-hi))] ring-1 ring-white/10">
                          <MonitorSmartphone size={20} />
                        </div>
                        <h3 className="font-display text-2xl font-bold tracking-tight">Every screen on earth</h3>
                        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                          Desktop, phone, tablet, browser, meeting, big screen.
                          No apps, no plugins, no &ldquo;please update your browser.&rdquo;
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {["MAC", "WIN", "IOS", "AND", "WEB"].map((os) => (
                          <span
                            key={os}
                            className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-black/30 font-mono text-[10px] tracking-widest text-white/70 transition-all duration-300 group-hover:border-white/20"
                          >
                            {os}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </Reveal>
              </div>
            </section>

            {/* ============================ HOW IT WORKS ============================ */}
            <section className="relative py-24 md:py-32">
              <div className="absolute inset-x-0 top-1/2 -z-0 mx-auto h-px max-w-5xl bg-gradient-to-r from-transparent via-white/10 to-transparent" aria-hidden />
              <div className="container relative">
                <Reveal>
                  <div className="mx-auto mb-16 max-w-2xl text-center">
                    <p className="overline mb-4">Three moves</p>
                    <h2 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
                      From camera to crowd
                      <br className="hidden sm:block" /> in <span className="text-gradient">three moves</span>
                    </h2>
                  </div>
                </Reveal>

                <div className="grid gap-10 md:grid-cols-3 md:gap-6">
                  {STEPS.map((step, i) => (
                    <Reveal key={step.n} delay={i * 130}>
                      <div className="group relative text-center md:text-left">
                        <div className="mb-6 flex items-center justify-center gap-4 md:justify-start">
                          <span className="font-mono text-sm text-muted-foreground/50">{step.n}</span>
                          <span className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
                        </div>
                        <div className="relative mx-auto mb-6 w-fit md:mx-0">
                          <div className="absolute -inset-3 rounded-full bg-[hsl(var(--accent-mid)_/_0.18)] opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
                          <div className="relative grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-card shadow-card transition-transform duration-500 group-hover:-translate-y-1">
                            <step.icon className="h-6 w-6 text-[hsl(var(--accent-hi))]" />
                          </div>
                        </div>
                        <h3 className="font-display text-xl font-bold tracking-tight">{step.title}</h3>
                        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground md:mx-0">
                          {step.body}
                        </p>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>
            </section>

            {/* ============================ CTA ============================ */}
            <section className="container pb-8">
              <Reveal>
                <div className="relative overflow-hidden rounded-[2rem] border border-white/10 px-6 py-20 text-center sm:px-12 md:py-28">
                  <div className="absolute inset-0 -z-10" aria-hidden>
                    <div className="absolute inset-0 bg-[hsl(252_40%_6%)]" />
                    <div className="absolute -top-1/2 left-1/2 h-full w-[130%] -translate-x-1/2 rounded-full bg-[hsl(var(--stream-h)_/_0.3)] blur-[100px]" />
                    <div className="absolute -bottom-40 -right-20 h-80 w-80 rounded-full bg-[hsl(var(--signal-h)_/_0.22)] blur-[90px]" />
                    <div className="absolute inset-0 blueprint" />
                  </div>

                  <p className="overline mb-5">No account needed to watch</p>
                  <h2 className="mx-auto max-w-2xl font-display text-4xl font-bold leading-[1.02] tracking-tight sm:text-5xl md:text-6xl">
                    The stage is dark.
                    <br />
                    <span className="text-gradient">You&rsquo;re up next.</span>
                  </h2>
                  <p className="mx-auto mt-5 max-w-md text-muted-foreground">
                    Sign up to save recordings and build your audience — or
                    just start streaming in the next four seconds.
                  </p>
                  <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                    <Link to="/stream/create" className="w-full sm:w-auto">
                      <Button variant="glow" size="lg" className="w-full sm:w-auto">
                        Go live now
                        <ArrowRight className="transition-transform duration-300 group-hover/btn:translate-x-1" />
                      </Button>
                    </Link>
                    <Link to="/signup" className="w-full sm:w-auto">
                      <Button variant="glass" size="lg" className="w-full sm:w-auto">
                        Create free account
                      </Button>
                    </Link>
                  </div>
                </div>
              </Reveal>
            </section>
          </main>

          <Footer />
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default Index;
