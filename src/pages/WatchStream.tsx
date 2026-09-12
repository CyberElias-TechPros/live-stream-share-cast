import { useParams, Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import StreamViewer from "@/components/StreamViewer";
import ErrorBoundary from "@/components/ErrorBoundary";
import Atmosphere from "@/components/Atmosphere";
import { isValidStreamId } from "@/utils/validationUtils";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const WatchStream = () => {
  const { streamId } = useParams<{ streamId: string }>();

  if (!streamId || !isValidStreamId(streamId)) {
    return (
      <ErrorBoundary>
        <div className="relative min-h-svh bg-background">
          <Atmosphere intensity="page" fixed />
          <div className="relative z-10 flex min-h-svh flex-col">
            <Navigation />
            <main className="flex flex-1 items-center justify-center px-5 pt-24">
              <div className="text-center">
                <p className="overline mb-4">Signal lost</p>
                <h1 className="font-display text-4xl font-bold tracking-tight">Invalid stream</h1>
                <p className="mt-3 text-muted-foreground">
                  The stream identifier is invalid. Check the link and try again.
                </p>
                <Link to="/stream" className="mt-8 inline-block">
                  <Button variant="glow" size="lg">
                    <ArrowLeft size={16} /> Back to live
                  </Button>
                </Link>
              </div>
            </main>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="relative min-h-svh bg-background">
        <Atmosphere intensity="page" fixed />
        <div className="relative z-10 flex min-h-svh flex-col">
          <Navigation />

          <main className="flex-1 pt-24 md:pt-28">
            <ErrorBoundary>
              <StreamViewer streamId={streamId} />
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default WatchStream;
