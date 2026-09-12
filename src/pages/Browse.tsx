import { useMemo, useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Radio, Search, SearchX, Video } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StreamCard, StreamCardSkeleton } from "@/components/StreamCard";
import { EmptyState } from "@/components/States";
import { useReveal } from "@/hooks/useReveal";
import { useSEO } from "@/hooks/useSEO";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Stream } from "@/types";

const ALL_CATEGORIES = ["All", "Gaming", "Music", "Talk", "Tech", "Art", "Sports", "Education", "IRL", "Other"];

export default function Browse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const category = searchParams.get("category") ?? "All";
  const q = searchParams.get("q") ?? "";
  const revealRef = useReveal<HTMLDivElement>();

  useSEO({
    title: "Browse live streams",
    description: "Watch live streams happening right now on I'm Live — gaming, music, talk, tech and more, all in your browser.",
  });

  // Keep local input in sync when navigation changes the query param.
  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  const { data: streams = [], isLoading } = useQuery({
    queryKey: ["streams", "browse", q, category],
    queryFn: () =>
      api.get<{ streams: Stream[] }>("/api/streams", {
        live: 1,
        limit: 48,
        q: q || undefined,
        category: category !== "All" ? category : undefined,
      }),
    select: (d) => d.streams,
    refetchInterval: 20_000,
  });

  const filtered = useMemo(() => streams, [streams]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "All") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setParam("q", search.trim());
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      <main className="flex-1" ref={revealRef}>
        <div className="container-app py-10">
          <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="micro flex items-center gap-2">
                <span className="live-dot" aria-hidden="true" /> Live right now
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Browse streams</h1>
            </div>
            <form onSubmit={submitSearch} role="search" className="flex w-full gap-2 md:w-80">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint" aria-hidden="true" />
                <Input
                  type="search"
                  placeholder="Search streams or streamers"
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search live streams"
                />
              </div>
              <Button type="submit" variant="outline">Search</Button>
            </form>
          </header>

          <nav className="mt-7 flex flex-wrap gap-2" aria-label="Filter by category">
            {ALL_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setParam("category", c)}
                aria-pressed={category === c}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all duration-200",
                  category === c
                    ? "border-transparent bg-text text-bg"
                    : "border-line text-text-muted hover:border-line-strong hover:text-text"
                )}
              >
                {c}
              </button>
            ))}
          </nav>

          <section className="mt-8" aria-live="polite">
            {isLoading ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <StreamCardSkeleton key={i} />
                ))}
              </div>
            ) : filtered.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map((stream, i) => (
                  <div
                    key={stream.id}
                    className="reveal"
                    style={{ "--reveal-delay": `${Math.min(i * 60, 360)}ms` } as React.CSSProperties}
                  >
                    <StreamCard stream={stream} />
                  </div>
                ))}
              </div>
            ) : q || category !== "All" ? (
              <EmptyState
                icon={<SearchX className="h-6 w-6" aria-hidden="true" />}
                title="No live streams match"
                description={`Nothing live under "${q || category}" right now. Try a different search or check back soon.`}
                action={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setSearchParams({}, { replace: true });
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<Radio className="h-6 w-6" aria-hidden="true" />}
                title="The airwaves are quiet"
                description="No one is live at this exact moment. Be the one who changes that — your first broadcast is one click away."
                action={
                  <Button asChild variant="live">
                    <Link to="/studio">
                      <Video className="h-4 w-4" aria-hidden="true" /> Start streaming
                    </Link>
                  </Button>
                }
              />
            )}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
