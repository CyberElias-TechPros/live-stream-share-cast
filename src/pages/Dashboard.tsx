
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
import { UserRound, Video, Clock, Eye, BarChart3, Play, Settings, ListFilter, Radio } from "lucide-react";
import Navigation from "@/components/Navigation";
import { Stream, StreamSession } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { profileService } from "@/services/profileService";
import { liveStreamService } from "@/services/liveStreamService";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccentColor } from "@/hooks/useAccent";
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
  const accentColor = useAccentColor("--accent-mid");
  
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
    <div className="relative min-h-svh bg-background">
      <div className="grain-fixed" />
      <div className="relative z-10 flex min-h-svh flex-col">
      <Navigation />

      <main className="flex-1 container pt-28 pb-16">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10">
          <div>
            <p className="overline mb-3 flex items-center gap-2">
              <span className="eq text-[hsl(var(--accent-mid))]">
                <span /><span /><span /><span />
              </span>
              Control room
            </p>
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Your <span className="text-gradient">studio</span>.
            </h1>
            <p className="mt-2 text-muted-foreground">
              Manage your streams and read the numbers that matter.
            </p>
          </div>

          <div>
            <Button variant="glow" size="lg" onClick={handleCreateStream}>
              <Radio className="h-4 w-4" />
              Go live
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
              <Card className="edge-light rounded-2xl border-white/8 bg-card/70 backdrop-blur-md transition-colors hover:border-white/20">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-[10px] tracking-[0.22em] text-muted-foreground/70 uppercase mb-1.5">Total streams</p>
                      <p className="font-display text-3xl font-bold">{streams.length}</p>
                    </div>
                    <div className="grid h-12 w-12 place-items-center rounded-xl bg-signature-soft text-[hsl(var(--accent-hi))] ring-1 ring-white/10">
                      <Video className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="edge-light rounded-2xl border-white/8 bg-card/70 backdrop-blur-md transition-colors hover:border-white/20">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-[10px] tracking-[0.22em] text-muted-foreground/70 uppercase mb-1.5">Live now</p>
                      <p className="font-display text-3xl font-bold">{liveStreams.length}</p>
                    </div>
                    <div className="grid h-12 w-12 place-items-center rounded-xl bg-live/10 text-[hsl(349_86%_65%)] ring-1 ring-live/20">
                      <Play className="h-5 w-5 fill-current" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="edge-light rounded-2xl border-white/8 bg-card/70 backdrop-blur-md transition-colors hover:border-white/20">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-[10px] tracking-[0.22em] text-muted-foreground/70 uppercase mb-1.5">Total viewers</p>
                      <p className="font-display text-3xl font-bold">{totalViewers}</p>
                    </div>
                    <div className="grid h-12 w-12 place-items-center rounded-xl bg-[hsl(190_90%_50%/0.1)] text-[hsl(190_90%_62%)] ring-1 ring-[hsl(190_90%_50%/0.2)]">
                      <Eye className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="edge-light rounded-2xl border-white/8 bg-card/70 backdrop-blur-md transition-colors hover:border-white/20">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-[10px] tracking-[0.22em] text-muted-foreground/70 uppercase mb-1.5">Sessions</p>
                      <p className="font-display text-3xl font-bold">{sessions.length}</p>
                    </div>
                    <div className="grid h-12 w-12 place-items-center rounded-xl bg-[hsl(330_90%_55%/0.1)] text-[hsl(330_90%_68%)] ring-1 ring-[hsl(330_90%_55%/0.2)]">
                      <Clock className="h-5 w-5" />
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
                        <CartesianGrid stroke="hsl(252 20% 16%)" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" stroke="hsl(252 14% 64%)" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="hsl(252 14% 64%)" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{ background: "hsl(252 36% 6%)", border: "1px solid hsl(252 20% 16%)", borderRadius: "12px", color: "hsl(250 30% 96%)" }}
                          labelStyle={{ color: "hsl(250 30% 96%)" }}
                        />
                        <Legend wrapperStyle={{ color: "hsl(252 14% 64%)" }} />
                        <Bar dataKey="views" fill={accentColor} radius={[8, 8, 0, 0]} name="Total Viewers" />
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
                        <CartesianGrid stroke="hsl(252 20% 16%)" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" stroke="hsl(252 14% 64%)" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="hsl(252 14% 64%)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ background: "hsl(252 36% 6%)", border: "1px solid hsl(252 20% 16%)", borderRadius: "12px", color: "hsl(250 30% 96%)" }}
                          labelStyle={{ color: "hsl(250 30% 96%)" }}
                        />
                        <Legend wrapperStyle={{ color: "hsl(252 14% 64%)" }} />
                        <Line type="monotone" dataKey="sessions" stroke={accentColor} strokeWidth={2.5} dot={{ r: 3, fill: accentColor }} activeDot={{ r: 5 }} name="Sessions" />
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
    </div>
  );
}
