
import Navigation from "@/components/Navigation";
import StreamCreator from "@/components/StreamCreator";
import ErrorBoundary from "@/components/ErrorBoundary";
import Atmosphere from "@/components/Atmosphere";
import Reveal from "@/components/Reveal";
import { Radio } from "lucide-react";

const CreateStream = () => {
  return (
    <ErrorBoundary>
      <div className="relative min-h-svh bg-background">
        <Atmosphere intensity="page" fixed />
        <div className="grain-fixed" />
        <div className="relative z-10 flex min-h-svh flex-col">
          <Navigation />

          <main className="flex-1 container pt-28 pb-16">
            <Reveal>
              <div className="mb-8">
                <p className="overline mb-3 flex items-center gap-2">
                  <Radio size={13} className="text-[hsl(var(--accent-mid))]" />
                  Pre-air check
                </p>
                <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
                  Set your <span className="text-gradient">stage</span>.
                </h1>
                <p className="mt-2 max-w-lg text-muted-foreground">
                  Camera, audio, quality — dial it in, then flip the switch.
                </p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <ErrorBoundary>
                <StreamCreator />
              </ErrorBoundary>
            </Reveal>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default CreateStream;
