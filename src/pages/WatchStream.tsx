
import { useParams } from "react-router-dom";
import Navigation from "@/components/Navigation";
import StreamViewer from "@/components/StreamViewer";

const WatchStream = () => {
  const { streamId } = useParams<{ streamId: string }>();
  
  if (!streamId) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        
        <main className="flex-1 container py-8">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold mb-2">Stream Not Found</h1>
            <p className="text-muted-foreground">The stream you're looking for doesn't exist or has ended.</p>
          </div>
        </main>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      
      <main className="flex-1 container py-8">
        <StreamViewer streamId={streamId} />
      </main>
    </div>
  );
};

export default WatchStream;
