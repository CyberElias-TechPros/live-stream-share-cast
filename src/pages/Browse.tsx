
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Users } from "lucide-react";
import Navigation from "@/components/Navigation";
import { Stream } from "@/types";

// Mock data for streams
const mockStreams: Stream[] = [
  {
    id: "1",
    title: "Live Coding Session",
    description: "Building a web app with React and TypeScript",
    isLive: true,
    streamKey: "mock-key-1",
    createdAt: new Date(),
    viewerCount: 24,
    isRecording: false,
    isLocalStream: false,
  },
  {
    id: "2",
    title: "Gaming Stream",
    description: "Playing the latest games",
    isLive: true,
    streamKey: "mock-key-2",
    createdAt: new Date(),
    viewerCount: 57,
    isRecording: true,
    isLocalStream: false,
  },
  {
    id: "3",
    title: "Music Session",
    description: "Live guitar practice",
    isLive: true,
    streamKey: "mock-key-3",
    createdAt: new Date(),
    viewerCount: 12,
    isRecording: false,
    isLocalStream: true,
  },
  {
    id: "4",
    title: "Art & Design",
    description: "Digital illustration process",
    isLive: true,
    streamKey: "mock-key-4",
    createdAt: new Date(),
    viewerCount: 36,
    isRecording: true,
    isLocalStream: false,
  },
];

const Browse = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [streams] = useState<Stream[]>(mockStreams);
  
  const filteredStreams = streams.filter((stream) =>
    stream.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (stream.description && stream.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      
      <main className="flex-1 container py-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <h1 className="text-3xl font-bold">Live Streams</h1>
          
          <div className="flex w-full md:w-auto gap-2">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search streams..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <Link to="/stream/create">
              <Button>Start Streaming</Button>
            </Link>
          </div>
        </div>
        
        {filteredStreams.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredStreams.map((stream) => (
              <Link 
                key={stream.id} 
                to={`/watch/${stream.id}`}
                className="group"
              >
                <div className="rounded-lg overflow-hidden border border-border bg-card transition-all hover:border-stream hover:shadow-md">
                  <div className="aspect-video bg-muted/30 relative">
                    {/* In a real app, this would be a thumbnail */}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/50">
                      <div className="absolute top-2 left-2">
                        <div className="live-indicator">LIVE</div>
                      </div>
                      
                      <div className="absolute bottom-2 right-2">
                        <div className="viewer-count">
                          <Users size={16} />
                          <span>{stream.viewerCount}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4">
                    <h3 className="font-semibold mb-2 group-hover:text-stream-light transition-colors">
                      {stream.title}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {stream.description || "No description provided"}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-2">No streams found</h2>
            <p className="text-muted-foreground">
              {searchQuery ? `No results for "${searchQuery}"` : "There are no live streams at the moment"}
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Browse;

// Temporary component for the Input while we don't have the actual Input component
function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
