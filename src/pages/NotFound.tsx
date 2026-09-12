import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Brand";
import Navigation from "@/components/Navigation";
import { useSEO } from "@/hooks/useSEO";

export default function NotFound() {
  useSEO({ title: "Page not found", robots: "noindex" });
  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-24">
        <div className="grid-bg absolute inset-0" aria-hidden="true" />
        <div className="relative text-center">
          <p className="micro">Signal lost</p>
          <h1 className="mt-3 font-display text-[clamp(5rem,18vw,10rem)] font-bold leading-none tracking-tighter text-panel-2">
            4<span className="text-live">0</span>4
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-text-muted">
            This page isn't on air. It may have been moved, deleted, or never existed.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild variant="live">
              <Link to="/">Back to home</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/browse">Browse live streams</Link>
            </Button>
          </div>
          <div className="mt-10 flex justify-center opacity-80">
            <Logo className="text-lg" />
          </div>
        </div>
      </main>
    </div>
  );
}
