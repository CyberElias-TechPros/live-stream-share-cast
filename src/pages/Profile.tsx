
import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
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

export default function Profile() {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<User | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState<Partial<User>>({});
  const [isFollowing, setIsFollowing] = useState(false);
  
  const { user, isAuthenticated, updateProfile } = useAuth();
  const { toast } = useToast();
  
  const isOwnProfile = isAuthenticated && user?.username === username;
  
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setIsLoading(true);
        
        // In a real app, we would fetch the user profile from an API
        // For now, let's simulate it
        setTimeout(() => {
          const mockUser: User = {
            id: "user-123",
            username: username || "username",
            displayName: `${username}'s Display Name`,
            email: `${username}@example.com`,
            bio: "This is a sample bio. The user has not added any additional information about themselves yet.",
            avatar: `https://ui-avatars.com/api/?name=${username}&background=random`,
            followers: Math.floor(Math.random() * 1000),
            following: Math.floor(Math.random() * 500),
            isStreamer: true,
            createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
            socialLinks: [
              { platform: "twitter", url: "https://twitter.com/" },
              { platform: "instagram", url: "https://instagram.com/" }
            ]
          };
          
          setProfile(mockUser);
          setEditedProfile(mockUser);
          
          // Generate mock streams
          const mockStreams: Stream[] = Array(6).fill(0).map((_, index) => ({
            id: `stream-${index}`,
            title: `${username}'s Stream #${index + 1}`,
            description: "This is a sample stream description.",
            isLive: index === 0, // Make the first one live
            streamKey: `key-${index}`,
            createdAt: new Date(Date.now() - (index * 24 * 60 * 60 * 1000)), // Each one a day apart
            viewerCount: Math.floor(Math.random() * 100),
            isRecording: false,
            isLocalStream: false,
            userId: "user-123",
            thumbnail: `https://picsum.photos/seed/${username}${index}/640/360`
          }));
          
          setStreams(mockStreams);
          setIsLoading(false);
        }, 1000);
      } catch (error) {
        console.error("Error fetching profile:", error);
        setIsLoading(false);
        toast({
          title: "Error",
          description: "Failed to load user profile",
          variant: "destructive"
        });
      }
    };
    
    fetchProfile();
  }, [username, toast]);
  
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
      
      // In a real app, we would call updateProfile from AuthContext
      // For now, let's simulate success
      await updateProfile(editedProfile);
      
      setProfile(prev => prev ? { ...prev, ...editedProfile } : null);
      setIsEditing(false);
      
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
      return;
    }
    
    setIsFollowing(!isFollowing);
    
    if (profile) {
      setProfile(prev => {
        if (!prev) return null;
        return {
          ...prev,
          followers: (prev.followers || 0) + (isFollowing ? -1 : 1)
        };
      });
    }
    
    toast({
      title: isFollowing ? "Unfollowed" : "Following",
      description: isFollowing ? 
        `You have unfollowed ${profile?.displayName || username}` : 
        `You are now following ${profile?.displayName || username}`,
    });
  };
  
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
                    <AvatarImage src={profile?.avatar} alt={profile?.displayName} />
                    <AvatarFallback>{profile?.displayName?.charAt(0) || "U"}</AvatarFallback>
                  </Avatar>
                  <Button variant="link" className="text-xs mt-2">
                    Change Avatar
                  </Button>
                </div>
              ) : (
                <Avatar className="w-24 h-24">
                  <AvatarImage src={profile?.avatar} alt={profile?.displayName} />
                  <AvatarFallback>{profile?.displayName?.charAt(0) || "U"}</AvatarFallback>
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
                          {profile?.displayName || username}
                        </h1>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <UserRound className="h-4 w-4" />
                          <span>@{profile?.username}</span>
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
                        <span><strong>{profile?.followers ?? 0}</strong> followers</span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <UserRound className="h-4 w-4 text-muted-foreground" />
                        <span><strong>{profile?.following ?? 0}</strong> following</span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <Video className="h-4 w-4 text-muted-foreground" />
                        <span><strong>{streams.length}</strong> streams</span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>Joined {profile?.createdAt.toLocaleDateString()}</span>
                      </div>
                    </div>
                    
                    <p className="mt-4 text-muted-foreground">
                      {profile?.bio || "This user hasn't added a bio yet."}
                    </p>
                    
                    {profile?.socialLinks && profile.socialLinks.length > 0 && (
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
                {streams.map(stream => (
                  <Link 
                    key={stream.id}
                    to={`/watch/${stream.id}`}
                    className="group"
                  >
                    <Card className="overflow-hidden border-border transition-all hover:border-stream hover:shadow-md">
                      <div className="aspect-video bg-muted/30 relative">
                        {stream.thumbnail && (
                          <img 
                            src={stream.thumbnail} 
                            alt={stream.title} 
                            className="w-full h-full object-cover"
                          />
                        )}
                        
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/50" />
                        
                        {stream.isLive ? (
                          <div className="absolute top-2 left-2">
                            <div className="live-indicator">LIVE</div>
                          </div>
                        ) : (
                          <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                            {new Date(stream.createdAt).toLocaleDateString()}
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
                ))}
                
                {streams.length === 0 && (
                  <div className="col-span-full text-center py-12">
                    <Video className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <h3 className="text-lg font-medium mb-2">No streams yet</h3>
                    <p className="text-muted-foreground">
                      {isOwnProfile ? 
                        "You haven't created any streams yet. Start streaming to see your content here." : 
                        `${profile?.displayName || username} hasn't created any streams yet.`
                      }
                    </p>
                    
                    {isOwnProfile && (
                      <Button className="mt-4" asChild>
                        <Link to="/stream/create">Start Streaming</Link>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="about">
              <Card>
                <CardHeader>
                  <CardTitle>About {profile?.displayName || username}</CardTitle>
                  <CardDescription>Profile information and statistics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium mb-2">Bio</h3>
                    <p className="text-muted-foreground">
                      {profile?.bio || "This user hasn't added a bio yet."}
                    </p>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium mb-2">Statistics</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card className="bg-muted/50">
                        <CardContent className="p-4">
                          <div className="text-xs text-muted-foreground mb-1">FOLLOWERS</div>
                          <div className="text-2xl font-bold">{profile?.followers ?? 0}</div>
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
                            {profile?.createdAt.toLocaleDateString(undefined, { year: 'numeric' })}
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card className="bg-muted/50">
                        <CardContent className="p-4">
                          <div className="text-xs text-muted-foreground mb-1">TOTAL VIEWS</div>
                          <div className="text-2xl font-bold">
                            {Math.floor(Math.random() * 10000)}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="border-t pt-6">
                  {profile?.socialLinks && profile.socialLinks.length > 0 ? (
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
