import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Search, ArrowUpRight, Play, Radio } from "lucide-react";
import Navigation from "@/components/Navigation";
import Atmosphere from "@/components/Atmosphere";
import Reveal from "@/components/Reveal";
import LiveBadge, { ViewerPill } from "@/components/LiveBadge";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Stream } from "@/types";
import { liveStreamService } from "@/services/liveStreamService";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { sceneBackground, SCENE_VIGNETTE, initials } from "@/utils/design";
import { useSearchParams } from "react-router-dom";

function StreamScene({ seed, title, letter }: { seed: string; title: string; letter: string }) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: sceneBackground(seed) }} />
      <div className="absolute inset-0 opacity-60" style={{ background: SCENE_VIGNETTE }} />
      {/* sheen */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 bottom-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent animate-sheen" style={{ animationDelay: "1.2s" }} />
      </div>
      <span
        className="absolute inset-0 grid place-items-center font-display text-[7rem] font-extrabold text-white/12 select-none"
        aria-hidden
      >
        {letter}
      </span>
      {/* bottom fade for readability */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
      <span className="sr-only">{title}</span>
    </>
  );
}

function StreamCard({ stream, featured = false }: { stream: Stream; featured?: boolean }) {
  const letter = (stream.title || "?").charAt(0).toUpperCase();
  const seed = stream.id || stream.title;

  if (featured) {
    return (
      <Link to={`/watch/${stream.id}`} className="group relative block overflow-hidden rounded-3xl border border-white/10 transition-all duration-500 hover:border-white/25">
        <div className="relative aspect-[16/10] sm:aspect-[21/9] overflow-hidden">
          {stream.thumbnail ? (
            <img src={stream.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
          ) : (
            <StreamScene seed={seed} title={stream.title} letter={letter} />
          )}

          <div className="absolute left-4 top-4 flex items-center gap-2">
            <LiveBadge />
            {stream.isLocalStream && (
              <span className="flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-400/15 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-300 backdrop-blur-md">
                <Radio size={10} /> LAN
              </span>
            )}
            {stream.category && (
              <span className="rounded-md bg-black/55 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-white/85 backdrop-blur-md">
                {stream.category}
              </span>
            )}
          </div>
          <ViewerPill count={stream.viewerCount} className="absolute right-4 top-4" />

          {/* hover play */}
          <div className="absolute inset-0 grid place-items-center opacity-0 transition-all duration-500 group-hover:opacity-100">
            <span className="grid h-16 w-16 scale-90 place-items-center rounded-full bg-white text-black shadow-2xl transition-transform duration-500 group-hover:scale-100">
              <Play className="h-6 w-6 translate-x-0.5 fill-current" />
            </span>
          </div>

          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
            <h3 className={`font-display font-bold tracking-tight text-white drop-shadow ${featured ? "text-2xl sm:text-4xl" : "text-lg"}`}>
              {stream.title}
            </h3>
            <div className="mt-2 flex items-center gap-2.5">
              <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-full bg-white/20 ring-1 ring-white/30">
                {stream.userAvatar ? (
                  <img src={stream.userAvatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="font-mono text-[9px] font-semibold text-white">{initials(stream.displayName || stream.username)}</span>
                )}
              </span>
              <span className="text-sm font-medium text-white/90">
                {stream.displayName || stream.username || "Streamer"}
              </span>
              {stream.description && (
                <p className="hidden max-w-md truncate text-sm text-white/65 sm:block">
                  {stream.description}
                </p>
              )}
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link to={`/watch/${stream.id}`} className="group block">
      <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-card transition-all duration-500 group-hover:-translate-y-1 group-hover:border-white/20 group-hover:shadow-glow">
        <div className="relative aspect-video overflow-hidden">
          {stream.thumbnail ? (
            <img src={stream.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
          ) : (
            <StreamScene seed={seed} title={stream.title} letter={letter} />
          )}

          <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
            <LiveBadge size="sm" />
            {stream.isLocalStream && (
              <span className="flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-400/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-300 backdrop-blur-md">
                <Radio size={9} /> LAN
              </span>
            )}
          </div>
          <ViewerPill count={stream.viewerCount} className="absolute right-2.5 top-2.5" />

          <div className="absolute inset-0 grid place-items-center opacity-0 transition-all duration-500 group-hover:opacity-100">
            <span className="grid h-11 w-11 scale-90 place-items-center rounded-full bg-white text-black transition-transform duration-500 group-hover:scale-100">
              <Play className="h-4 w-4 translate-x-[1px] fill-current" />
            </span>
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="line-clamp-1 font-display text-[15px] font-bold tracking-tight transition-colors group-hover:text-white">
              {stream.title}
            </h3>
            <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all duration-300 group-hover:opacity-100" />
          </div>
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
            {stream.description || "No description — just tune in."}
          </p>
          <div className="mt-3.5 flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-full bg-signature-soft ring-1 ring-white/15">
              {stream.userAvatar ? (
                <img src={stream.userAvatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="font-mono text-[9px] font-semibold text-[hsl(var(--accent-hi))]">{initials(stream.displayName || stream.username)}</span>
              )}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {stream.displayName || stream.username || "Streamer"}
            </span>
            {stream.category && (
              <span className="ml-auto shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                {stream.category}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

const Browse = () => {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [searchQuery, setSearchQuery] = useState(initialQuery);

  useEffect(() => {
    setSearchQuery(searchParams.get("q") || "");
  }, [searchParams]);

  const { data: streams = [], isLoading } = useQuery({
    queryKey: ["streams"],
    queryFn: () => liveStreamService.getAllStreams(),
    refetchInterval: 30000,
  });

  const liveStreams = streams.filter((s) => s.isLive);
  const filteredStreams = liveStreams.filter(
    (stream) =>
      stream.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (stream.description && stream.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const featured = filteredStreams[0];
  const rest = filteredStreams.slice(1);

  return (
    <ErrorBoundary>
      <div className="relative min-h-svh bg-background">
        <Atmosphere intensity="page" fixed />
        <div className="grain-fixed" />

        <div className="relative z-10 flex min-h-svh flex-col">
          <Navigation />

          <main className="flex-1">
            {/* Header */}
            <section className="container pt-32 pb-10">
              <Reveal>
                <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
                  <div>
                    <p className="overline mb-4 flex items-center gap-2">
                      <span className="eq text-[hsl(var(--accent-mid))]">
                        <span /><span /><span /><span />
                      </span>
                      On air right now
                    </p>
                    <h1 className="font-display text-5xl font-bold tracking-tight sm:text-6xl">
                      The floor is <span className="text-gradient">live.</span>
                    </h1>
                    <p className="mt-3 font-mono text-xs tracking-[0.2em] text-muted-foreground">
                      {isLoading ? "TUNING IN…" : `${filteredStreams.length} CHANNEL${filteredStreams.length === 1 ? "" : "S"} · PICK ONE`}
                    </p>
                  </div>

                  <div className="flex w-full gap-2 md:w-auto md:items-center">
                    <div className="relative flex-1 md:w-72">
                      <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="search"
                        placeholder="Search channels…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-11 w-full rounded-full border border-white/10 bg-white/[0.05] pl-11 pr-4 text-sm outline-none backdrop-blur-md transition-colors placeholder:text-muted-foreground/60 focus:border-[hsl(var(--accent-mid)_/_0.5)] focus:bg-white/[0.07]"
                      />
                    </div>
                    <Link to="/stream/create" className="shrink-0">
                      <Button variant="glow" className="w-full md:w-auto">
                        <Radio size={16} /> Go live
                      </Button>
                    </Link>
                  </div>
                </div>
              </Reveal>
            </section>

            {/* Grid */}
            <section className="container pb-24">
              {isLoading ? (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  <div className="sm:col-span-2 lg:row-span-2">
                    <Skeleton className="aspect-[21/9] w-full rounded-3xl" />
                  </div>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-[16/10] w-full rounded-2xl" />
                  ))}
                </div>
              ) : filteredStreams.length > 0 ? (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {featured && (
                    <div className="sm:col-span-2 lg:row-span-2">
                      <Reveal>
                        <StreamCard stream={featured} featured />
                      </Reveal>
                    </div>
                  )}
                  {rest.map((stream, i) => (
                    <Reveal key={stream.id} delay={Math.min(i, 8) * 60}>
                      <StreamCard stream={stream} />
                    </Reveal>
                  ))}
                </div>
              ) : (
                <Reveal>
                  <div className="relative overflow-hidden rounded-[2rem] border border-white/8 py-24 text-center">
                    <div className="absolute left-1/2 top-0 -translate-x-1/2 h-64 w-[36rem] max-w-full rounded-full bg-[hsl(var(--stream-h)_/_0.18)] blur-[100px]" aria-hidden />
                    <div className="relative mx-auto max-w-md px-6">
                      <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-card shadow-card">
                        <Radio className="h-7 w-7 text-muted-foreground" />
                      </div>
                      <h2 className="font-display text-3xl font-bold tracking-tight">
                        {searchQuery ? "Nothing on that channel." : "No one is live yet."}
                      </h2>
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        {searchQuery
                          ? `No streams match “${searchQuery}”. Try another search, or be the first to broadcast it.`
                          : "The airwaves are quiet. Change that — the first stream of the night gets all the attention."}
                      </p>
                      <Link to="/stream/create" className="mt-8 inline-block">
                        <Button variant="glow" size="lg">
                          Start your stream
                          <ArrowUpRight className="transition-transform duration-300 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Reveal>
              )}
            </section>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default Browse;
