
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { UserRound, Video, Clock, Eye, BarChart3, Play, Settings, ListFilter } from "lucide-react";
import Navigation from "@/components/Navigation";
import { Stream, StreamSession } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { profileService } from "@/services/profileService";
import { liveStreamService } from "@/services/liveStreamService";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Dashboard() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [sessions, setSessions] = useState<StreamSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "live" | "ended">("all");
  
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    
    const fetchData = async () => {
      setIsLoading(true);
      if (user) {
        try {
          const [userStreams, streamSessions] = await Promise.all([
            profileService.getUserStreams(user.id),
            liveStreamService.getStreamSessions(user.id)
          ]);
          
          setStreams(userStreams);
          setSessions(streamSessions);
        } catch (error) {
          console.error("Error fetching dashboard data:", error);
        } finally {
          setIsLoading(false);
        }
      }
    };
    
    fetchData();
  }, [user, isAuthenticated, navigate]);
  
  const totalViewers = streams.reduce((sum, stream) => sum + (stream.viewerCount || 0), 0);
  const liveStreams = streams.filter(stream => stream.isLive);
  
  // Calculate analytics data
  const viewsByStream = streams.map(stream => ({
    name: stream.title,
    views: stream.viewerCount || 0,
    isLive: stream.isLive
  }));
  
  const sessionsByDate = sessions.reduce((acc: Record<string, number>, session) => {
    const date = format(session.startedAt, "yyyy-MM-dd");
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {});
  
  const sessionData = Object.entries(sessionsByDate).map(([date, count]) => ({
    date,
    sessions: count
  }));
  
  // Filter streams based on selected filter
  const filteredStreams = streams.filter(stream => {
    if (filter === "live") return stream.isLive;
    if (filter === "ended") return !stream.isLive;
    return true;
  });
  
  const handleCreateStream = () => {
    navigate("/stream/create");
  };
  
  const handleViewStream = (streamId: string) => {
    navigate(`/watch/${streamId}`);
  };
  
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      
      <main className="flex-1 container py-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Manage your streams and view analytics</p>
          </div>
          
          <div className="mt-4 lg:mt-0">
            <Button onClick={handleCreateStream}>
              <Video className="mr-2 h-4 w-4" />
              Create New Stream
            </Button>
          </div>
        </div>
        
        {isLoading ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
            <Skeleton className="h-[400px] w-full mb-8" />
          </>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Total Streams</p>
                      <p className="text-3xl font-bold">{streams.length}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Video className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Live Streams</p>
                      <p className="text-3xl font-bold">{liveStreams.length}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                      <Play className="h-6 w-6 text-green-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Total Viewers</p>
                      <p className="text-3xl font-bold">{totalViewers}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                      <Eye className="h-6 w-6 text-blue-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Stream Sessions</p>
                      <p className="text-3xl font-bold">{sessions.length}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                      <Clock className="h-6 w-6 text-orange-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Analytics */}
            <Tabs defaultValue="streams" className="space-y-8">
              <TabsList className="grid grid-cols-2 sm:grid-cols-4 sm:w-[600px]">
                <TabsTrigger value="streams">Streams</TabsTrigger>
                <TabsTrigger value="viewers">Viewers</TabsTrigger>
                <TabsTrigger value="sessions">Sessions</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
              </TabsList>
              
              <TabsContent value="streams" className="space-y-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Your Streams</h2>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <ListFilter className="h-4 w-4 mr-2" />
                        {filter === "all" ? "All Streams" : filter === "live" ? "Live Only" : "Ended Only"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setFilter("all")}>All Streams</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilter("live")}>Live Only</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilter("ended")}>Ended Only</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredStreams.length > 0 ? (
                    filteredStreams.map(stream => (
                      <Card key={stream.id} className="overflow-hidden">
                        <div className="aspect-video relative bg-muted">
                          {stream.thumbnail ? (
                            <img 
                              src={stream.thumbnail} 
                              alt={stream.title} 
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted">
                              <Video className="h-12 w-12 text-muted-foreground opacity-20" />
                            </div>
                          )}
                          
                          {stream.isLive && (
                            <div className="absolute top-2 left-2">
                              <Badge variant="destructive" className="animate-pulse">LIVE</Badge>
                            </div>
                          )}
                          
                          <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-1 rounded">
                            <Eye size={12} />
                            <span>{stream.viewerCount}</span>
                          </div>
                        </div>
                        
                        <CardContent className="pt-4">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-medium line-clamp-1">{stream.title}</h3>
                            
                            <Badge variant={stream.streamType === 'local' ? 'outline' : 'secondary'}>
                              {stream.streamType === 'local' ? 'Local' : 'Internet'}
                            </Badge>
                          </div>
                          
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                            {stream.description || "No description provided"}
                          </p>
                          
                          {stream.tags && stream.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {stream.tags.slice(0, 3).map(tag => (
                                <Badge key={tag} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                              {stream.tags.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{stream.tags.length - 3}
                                </Badge>
                              )}
                            </div>
                          )}
                        </CardContent>
                        
                        <CardFooter className="border-t pt-4 flex justify-between">
                          <p className="text-xs text-muted-foreground">
                            {stream.startedAt ? (
                              stream.isLive ? (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  Started {formatDistanceToNow(stream.startedAt, { addSuffix: true })}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  Streamed on {format(stream.startedAt, "MMM d, yyyy")}
                                </span>
                              )
                            ) : (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Created {formatDistanceToNow(stream.createdAt, { addSuffix: true })}
                              </span>
                            )}
                          </p>
                          
                          <Button size="sm" onClick={() => handleViewStream(stream.id)}>
                            {stream.isLive ? "Watch" : "View"}
                          </Button>
                        </CardFooter>
                      </Card>
                    ))
                  ) : (
                    <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                      <Video className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
                      <h3 className="text-lg font-medium mb-2">No streams found</h3>
                      <p className="text-muted-foreground mb-6">
                        {filter === "all" 
                          ? "You haven't created any streams yet." 
                          : filter === "live" 
                            ? "You don't have any active streams." 
                            : "You don't have any ended streams."}
                      </p>
                      <Button onClick={handleCreateStream}>Create your first stream</Button>
                    </div>
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="viewers" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Viewers by Stream</CardTitle>
                    <CardDescription>Total viewer count for each of your streams</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={viewsByStream}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="views" fill="#8884d8" name="Total Viewers" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="sessions" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Sessions</CardTitle>
                    <CardDescription>Your most recent streaming sessions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {sessions.length > 0 ? (
                      <div className="space-y-4">
                        {sessions.slice(0, 5).map(session => {
                          const streamData = streams.find(s => s.id === session.streamId);
                          return (
                            <div key={session.id} className="flex items-center p-3 rounded-lg border">
                              <div className="mr-4">
                                {streamData?.thumbnail ? (
                                  <img 
                                    src={streamData.thumbnail} 
                                    alt="Thumbnail" 
                                    className="w-20 h-12 object-cover rounded"
                                  />
                                ) : (
                                  <div className="w-20 h-12 bg-muted rounded flex items-center justify-center">
                                    <Video className="h-6 w-6 opacity-50" />
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex-1">
                                <h4 className="font-medium line-clamp-1">{streamData?.title || "Untitled Stream"}</h4>
                                <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground mt-1">
                                  <span className="flex items-center gap-1">
                                    <Eye className="h-3 w-3" /> 
                                    {session.viewerCount || 0} viewers
                                  </span>
                                  
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> 
                                    {session.duration 
                                      ? `${Math.floor(session.duration / 60)}m ${session.duration % 60}s` 
                                      : "In progress"}
                                  </span>
                                  
                                  <span>
                                    {format(session.startedAt, "MMM d, yyyy 'at' h:mm a")}
                                  </span>
                                  
                                  <Badge variant={session.streamType === 'local' ? 'outline' : 'secondary'} className="text-xs">
                                    {session.streamType === 'local' ? 'Local' : 'Internet'}
                                  </Badge>
                                </div>
                              </div>
                              
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleViewStream(session.streamId)}
                              >
                                Details
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <Clock className="h-12 w-12 text-muted-foreground opacity-20 mx-auto mb-4" />
                        <h3 className="text-lg font-medium mb-2">No sessions yet</h3>
                        <p className="text-muted-foreground mb-6">Start a new stream to begin recording sessions</p>
                        <Button onClick={handleCreateStream}>Create Stream</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="analytics" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Streaming Activity</CardTitle>
                    <CardDescription>Number of streaming sessions over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart data={sessionData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="sessions" stroke="#8884d8" name="Sessions" />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}
