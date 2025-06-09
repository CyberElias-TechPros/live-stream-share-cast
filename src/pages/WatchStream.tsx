
import { useParams } from "react-router-dom";
import Navigation from "@/components/Navigation";
import StreamViewer from "@/components/StreamViewer";
import ErrorBoundary from "@/components/ErrorBoundary";
import { isValidStreamId } from "@/utils/validationUtils";

const WatchStream = () => {
  const { streamId } = useParams<{ streamId: string }>();
  
  if (!streamId || !isValidStreamId(streamId)) {
    return (
      <ErrorBoundary>
        <div className="min-h-screen flex flex-col">
          <Navigation />
          
          <main className="flex-1 container py-8">
            <div className="text-center py-12">
              <h1 className="text-2xl font-bold mb-2">Invalid Stream</h1>
              <p className="text-muted-foreground">
                The stream identifier is invalid. Please check the URL and try again.
              </p>
            </div>
          </main>
        </div>
      </ErrorBoundary>
    );
  }
  
  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col">
        <Navigation />
        
        <main className="flex-1 container py-8">
          <ErrorBoundary>
            <StreamViewer streamId={streamId} />
          </ErrorBoundary>
        </main>
      </div>
    </ErrorBoundary>
  );
};

export default WatchStream;
