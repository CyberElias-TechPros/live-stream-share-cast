
import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  UserRound, 
  Video, 
  Clock, 
  Edit,
  Twitter,
  Instagram,
  Youtube,
  Link as LinkIcon,
  Heart,
  Eye,
  Save
} from "lucide-react";
import { Stream, User } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { profileService } from "@/services/profileService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";

export default function Profile() {
  const { username } = useParams<{ username: string }>();
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState<Partial<User>>({});
  
  const { user, isAuthenticated, updateProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Fetch profile data
  const { 
    data: profile, 
    isLoading: isProfileLoading,
    error: profileError 
  } = useQuery({
    queryKey: ["profile", username],
    queryFn: () => {
      if (!username) throw new Error("No username provided");
      return profileService.getProfileByUsername(username);
    },
    enabled: !!username,
  });
  
  // Fetch user streams
  const { 
    data: streams = [], 
    isLoading: isStreamsLoading 
  } = useQuery({
    queryKey: ["userStreams", profile?.id],
    queryFn: () => {
      if (!profile?.id) throw new Error("No user ID available");
      return profileService.getUserStreams(profile.id);
    },
    enabled: !!profile?.id,
  });
  
  // Check if the current user is following the profile
  const { 
    data: isFollowing = false,
    isLoading: isFollowingLoading 
  } = useQuery({
    queryKey: ["isFollowing", user?.id, profile?.id],
    queryFn: () => {
      if (!user?.id || !profile?.id) return false;
      return profileService.isFollowing(user.id, profile.id);
    },
    enabled: !!user?.id && !!profile?.id && user?.id !== profile?.id,
  });
  
  // Follow/unfollow mutation
  const followMutation = useMutation({
    mutationFn: async (follow: boolean) => {
      if (!user?.id || !profile?.id) throw new Error("User IDs not available");
      
      if (follow) {
        return profileService.followUser(user.id, profile.id);
      } else {
        return profileService.unfollowUser(user.id, profile.id);
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["profile", username] });
      queryClient.invalidateQueries({ queryKey: ["isFollowing", user?.id, profile?.id] });
      
      toast({
        title: variables ? "Following" : "Unfollowed",
        description: variables 
          ? `You are now following ${profile?.displayName || profile?.username}` 
          : `You have unfollowed ${profile?.displayName || profile?.username}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update follow status",
        variant: "destructive"
      });
    }
  });
  
  // Set initial edited profile state
  useEffect(() => {
    if (profile) {
      setEditedProfile(profile);
    }
  }, [profile]);
  
  const isOwnProfile = isAuthenticated && user?.username === username;
  const isLoading = isProfileLoading || isStreamsLoading;
  
  const handleEditToggle = () => {
    if (isEditing) {
      // Cancel editing
      setEditedProfile(profile || {});
    }
    setIsEditing(!isEditing);
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditedProfile(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSaveProfile = async () => {
    try {
      if (!isOwnProfile) {
        throw new Error("You can only edit your own profile");
      }
      
      await updateProfile(editedProfile);
      setIsEditing(false);
      
      // Refresh profile data
      queryClient.invalidateQueries({ queryKey: ["profile", username] });
      
      toast({
        title: "Profile Updated",
        description: "Your profile has been successfully updated.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive"
      });
    }
  };
  
  const handleFollowToggle = () => {
    if (!isAuthenticated) {
      toast({
        title: "Login Required",
        description: "You must be logged in to follow users",
        variant: "default"
      });
      navigate("/login");
      return;
    }
    
    followMutation.mutate(!isFollowing);
  };
  
  if (profileError) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        
        <main className="flex-1 container py-8">
          <div className="max-w-5xl mx-auto text-center">
            <h1 className="text-2xl font-bold mb-4">User Not Found</h1>
            <p className="text-muted-foreground mb-6">The user you're looking for doesn't exist or has been removed.</p>
            <Button onClick={() => navigate("/")}>Go Home</Button>
          </div>
        </main>
      </div>
    );
  }
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        
        <main className="flex-1 container py-8">
          <div className="max-w-5xl mx-auto">
            <div className="mb-8 flex items-start gap-6">
              <Skeleton className="w-24 h-24 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-8 w-48 mb-2" />
                <Skeleton className="h-4 w-32 mb-4" />
                <Skeleton className="h-20 w-full" />
              </div>
            </div>
            
            <Skeleton className="h-10 w-60 mb-6" />
            
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map(item => (
                <Skeleton key={item} className="aspect-video rounded-lg" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }
  
  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        
        <main className="flex-1 container py-8">
          <div className="max-w-5xl mx-auto text-center">
            <h1 className="text-2xl font-bold mb-4">User Not Found</h1>
            <p className="text-muted-foreground mb-6">The user you're looking for doesn't exist or has been removed.</p>
            <Button onClick={() => navigate("/")}>Go Home</Button>
          </div>
        </main>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      
      <main className="flex-1 container py-8">
        <div className="max-w-5xl mx-auto">
          {/* Profile Header */}
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-start gap-6">
              {isEditing ? (
                <div className="flex flex-col items-center">
                  <Avatar className="w-24 h-24">
                    <AvatarImage src={profile.avatar} alt={profile.displayName || profile.username} />
                    <AvatarFallback>{(profile.displayName || profile.username).charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <Button variant="link" className="text-xs mt-2">
                    Change Avatar
                  </Button>
                </div>
              ) : (
                <Avatar className="w-24 h-24">
                  <AvatarImage src={profile.avatar} alt={profile.displayName || profile.username} />
                  <AvatarFallback>{(profile.displayName || profile.username).charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
              )}
              
              <div className="flex-1">
                {isEditing ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1" htmlFor="displayName">
                        Display Name
                      </label>
                      <Input
                        id="displayName"
                        name="displayName"
                        value={editedProfile.displayName || ""}
                        onChange={handleInputChange}
                        placeholder="Display Name"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1" htmlFor="bio">
                        Bio
                      </label>
                      <Textarea
                        id="bio"
                        name="bio"
                        value={editedProfile.bio || ""}
                        onChange={handleInputChange}
                        placeholder="Tell others about yourself"
                        rows={4}
                      />
                    </div>
                    
                    <div className="flex gap-3 mt-4">
                      <Button onClick={handleSaveProfile}>
                        <Save className="mr-2 h-4 w-4" />
                        Save Changes
                      </Button>
                      <Button variant="outline" onClick={handleEditToggle}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                        <h1 className="text-2xl font-bold">
                          {profile.displayName || profile.username}
                        </h1>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <UserRound className="h-4 w-4" />
                          <span>@{profile.username}</span>
                        </div>
                      </div>
                      
                      <div>
                        {isOwnProfile ? (
                          <Button onClick={handleEditToggle}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit Profile
                          </Button>
                        ) : (
                          <Button 
                            variant={isFollowing ? "default" : "outline"}
                            onClick={handleFollowToggle}
                            disabled={followMutation.isPending || isFollowingLoading}
                          >
                            <Heart className={`mr-2 h-4 w-4 ${isFollowing ? 'fill-current' : ''}`} />
                            {isFollowing ? 'Following' : 'Follow'}
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-4 flex flex-wrap gap-6 text-sm">
                      <div className="flex items-center gap-1">
                        <Heart className="h-4 w-4 text-muted-foreground" />
                        <span><strong>{profile.followers ?? 0}</strong> followers</span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <UserRound className="h-4 w-4 text-muted-foreground" />
                        <span><strong>{profile.following ?? 0}</strong> following</span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <Video className="h-4 w-4 text-muted-foreground" />
                        <span><strong>{streams.length}</strong> streams</span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>Joined {format(profile.createdAt, "MMMM yyyy")}</span>
                      </div>
                    </div>
                    
                    <p className="mt-4 text-muted-foreground">
                      {profile.bio || "This user hasn't added a bio yet."}
                    </p>
                    
                    {profile.socialLinks && profile.socialLinks.length > 0 && (
                      <div className="mt-4 flex gap-3">
                        {profile.socialLinks.map((link, index) => {
                          let Icon = LinkIcon;
                          switch (link.platform.toLowerCase()) {
                            case "twitter":
                              Icon = Twitter;
                              break;
                            case "instagram":
                              Icon = Instagram;
                              break;
                            case "youtube":
                              Icon = Youtube;
                              break;
                          }
                          
                          return (
                            <a 
                              key={index}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Icon className="h-5 w-5" />
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          
          {/* Profile Content */}
          <Tabs defaultValue="streams">
            <TabsList className="mb-6">
              <TabsTrigger value="streams">Streams</TabsTrigger>
              <TabsTrigger value="about">About</TabsTrigger>
            </TabsList>
            
            <TabsContent value="streams">
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {streams.length > 0 ? (
                  streams.map(stream => (
                    <Link 
                      key={stream.id}
                      to={`/watch/${stream.id}`}
                      className="group"
                    >
                      <Card className="overflow-hidden border-border transition-all hover:border-stream hover:shadow-md">
                        <div className="aspect-video bg-muted/30 relative">
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
                          
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/50" />
                          
                          {stream.isLive ? (
                            <div className="absolute top-2 left-2">
                              <div className="live-indicator">LIVE</div>
                            </div>
                          ) : (
                            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                              {stream.createdAt ? format(stream.createdAt, "MMM d, yyyy") : "Unknown date"}
                            </div>
                          )}
                          
                          <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-1 rounded">
                            <Eye size={12} />
                            <span>{stream.viewerCount}</span>
                          </div>
                        </div>
                        
                        <CardContent className="p-4">
                          <h3 className="font-semibold mb-1 group-hover:text-stream-light transition-colors">
                            {stream.title}
                          </h3>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {stream.description || "No description provided"}
                          </p>
                        </CardContent>
                      </Card>
                    </Link>
                  ))
                ) : (
                  <div className="col-span-full text-center py-12">
                    <Video className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <h3 className="text-lg font-medium mb-2">No streams yet</h3>
                    <p className="text-muted-foreground">
                      {isOwnProfile ? 
                        "You haven't created any streams yet. Start streaming to see your content here." : 
                        `${profile.displayName || profile.username} hasn't created any streams yet.`
                      }
                    </p>
                    
                    {isOwnProfile && profile.isStreamer && (
                      <Button className="mt-4" asChild>
                        <Link to="/stream/create">Start Streaming</Link>
                      </Button>
                    )}
                    
                    {isOwnProfile && !profile.isStreamer && (
                      <Button className="mt-4" asChild>
                        <Link to="/settings">Enable Streamer Status</Link>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="about">
              <Card>
                <CardHeader>
                  <CardTitle>About {profile.displayName || profile.username}</CardTitle>
                  <CardDescription>Profile information and statistics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium mb-2">Bio</h3>
                    <p className="text-muted-foreground">
                      {profile.bio || "This user hasn't added a bio yet."}
                    </p>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium mb-2">Statistics</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card className="bg-muted/50">
                        <CardContent className="p-4">
                          <div className="text-xs text-muted-foreground mb-1">FOLLOWERS</div>
                          <div className="text-2xl font-bold">{profile.followers ?? 0}</div>
                        </CardContent>
                      </Card>
                      
                      <Card className="bg-muted/50">
                        <CardContent className="p-4">
                          <div className="text-xs text-muted-foreground mb-1">STREAMS</div>
                          <div className="text-2xl font-bold">{streams.length}</div>
                        </CardContent>
                      </Card>
                      
                      <Card className="bg-muted/50">
                        <CardContent className="p-4">
                          <div className="text-xs text-muted-foreground mb-1">JOINED</div>
                          <div className="text-2xl font-bold">
                            {format(profile.createdAt, "yyyy")}
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card className="bg-muted/50">
                        <CardContent className="p-4">
                          <div className="text-xs text-muted-foreground mb-1">TOTAL VIEWS</div>
                          <div className="text-2xl font-bold">
                            {streams.reduce((sum, stream) => sum + (stream.viewerCount || 0), 0)}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="border-t pt-6">
                  {profile.socialLinks && profile.socialLinks.length > 0 ? (
                    <div className="w-full">
                      <h3 className="text-sm font-medium mb-3">Social Links</h3>
                      <div className="flex flex-wrap gap-4">
                        {profile.socialLinks.map((link, index) => {
                          let Icon = LinkIcon;
                          let platform = link.platform;
                          
                          switch (link.platform.toLowerCase()) {
                            case "twitter":
                              Icon = Twitter;
                              platform = "Twitter";
                              break;
                            case "instagram":
                              Icon = Instagram;
                              platform = "Instagram";
                              break;
                            case "youtube":
                              Icon = Youtube;
                              platform = "YouTube";
                              break;
                          }
                          
                          return (
                            <a 
                              key={index}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Icon className="h-4 w-4" />
                              <span>{platform}</span>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No social links provided</p>
                  )}
                </CardFooter>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
