
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, UserRound } from "lucide-react";
import Navigation from "@/components/Navigation";
import { Stream } from "@/types";
import { liveStreamService } from "@/services/liveStreamService";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

const Browse = () => {
  const [searchQuery, setSearchQuery] = useState("");
  
  const { data: streams = [], isLoading } = useQuery({
    queryKey: ["streams"],
    queryFn: () => liveStreamService.getAllStreams(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  
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
        
        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded-lg overflow-hidden border border-border bg-card">
                <Skeleton className="aspect-video w-full" />
                <div className="p-4">
                  <Skeleton className="h-5 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredStreams.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredStreams.map((stream) => (
              <Link 
                key={stream.id} 
                to={`/watch/${stream.id}`}
                className="group"
              >
                <div className="rounded-lg overflow-hidden border border-border bg-card transition-all hover:border-stream hover:shadow-md">
                  <div className="aspect-video bg-muted/30 relative">
                    {stream.thumbnail ? (
                      <img 
                        src={stream.thumbnail} 
                        alt={stream.title} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-stream/20 to-stream/5 flex items-center justify-center">
                        <span className="text-stream-light font-semibold">
                          {stream.title.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/50">
                      <div className="absolute top-2 left-2">
                        <div className="px-1.5 py-0.5 bg-red-500 text-white text-xs font-semibold rounded">LIVE</div>
                      </div>
                      
                      <div className="absolute bottom-2 right-2">
                        <div className="px-2 py-0.5 bg-black/60 text-white text-xs rounded-full flex items-center gap-1">
                          <UserRound size={12} />
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
                    {stream.username && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-5 w-5 rounded-full bg-stream/20 overflow-hidden">
                          {stream.userAvatar ? (
                            <img src={stream.userAvatar} alt={stream.username} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs">
                              {stream.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {stream.displayName || stream.username}
                        </span>
                      </div>
                    )}
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
            <Link to="/stream/create" className="mt-4 inline-block">
              <Button>Start Your Own Stream</Button>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
};

export default Browse;
