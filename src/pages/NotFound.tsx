import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Radio, ArrowLeft } from "lucide-react";
import Atmosphere from "@/components/Atmosphere";
import Reveal from "@/components/Reveal";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="relative grid min-h-svh place-items-center overflow-hidden bg-background px-5">
      <Atmosphere intensity="hero" />
      <div className="grain-fixed" />

      <div className="relative z-10 text-center">
        <Reveal>
          <div className="mx-auto mb-8 grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-card shadow-card">
            <Radio className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-mono text-[11px] tracking-[0.35em] text-muted-foreground uppercase">
            No signal on this frequency
          </p>
          <h1 className="mt-4 font-display text-[6rem] font-extrabold leading-none tracking-tight sm:text-[9rem]">
            <span className="text-gradient">404</span>
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-muted-foreground">
            The page you&rsquo;re looking for isn&rsquo;t broadcasting. Check the
            address, or head back to a live channel.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/" className="w-full sm:w-auto">
              <Button variant="glow" size="lg" className="w-full sm:w-auto">
                <ArrowLeft size={16} /> Return home
              </Button>
            </Link>
            <Link to="/stream" className="w-full sm:w-auto">
              <Button variant="glass" size="lg" className="w-full sm:w-auto">
                Browse live streams
              </Button>
            </Link>
          </div>
        </Reveal>
      </div>
    </div>
  );
};

export default NotFound;
