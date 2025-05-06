
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  UserRound, 
  Settings as SettingsIcon, 
  BellRing, 
  Shield, 
  Video, 
  Save, 
  UploadCloud,
  Globe, 
  Wifi, 
  Clock,
  Moon,
  Sun,
  Laptop
} from "lucide-react";
import Navigation from "@/components/Navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { UserPreferences } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage 
} from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

const profileFormSchema = z.object({
  username: z.string().min(3, {
    message: "Username must be at least 3 characters.",
  }),
  displayName: z.string().optional(),
  bio: z.string().max(500, {
    message: "Bio must not be longer than 500 characters.",
  }).optional(),
  isStreamer: z.boolean().optional(),
});

const streamingSettingsSchema = z.object({
  defaultStreamType: z.enum(["local", "internet"]),
  defaultQuality: z.string(),
  autoRecord: z.boolean(),
  localSave: z.boolean(),
  autoDeleteRecordings: z.boolean(),
  recordingRetentionHours: z.number().min(1).max(72),
});

export default function Settings() {
  const [activeTab, setActiveTab] = useState("profile");
  const { user, isAuthenticated, updateProfile, updateStreamerStatus, updateUserPreferences } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, navigate]);
  
  const profileForm = useForm<z.infer<typeof profileFormSchema>>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      username: user?.username || "",
      displayName: user?.displayName || "",
      bio: user?.bio || "",
      isStreamer: user?.isStreamer || false,
    },
  });
  
  const streamingSettingsForm = useForm<z.infer<typeof streamingSettingsSchema>>({
    resolver: zodResolver(streamingSettingsSchema),
    defaultValues: {
      defaultStreamType: user?.preferences?.streaming?.defaultStreamType || "internet",
      defaultQuality: user?.preferences?.streaming?.defaultQuality || "720p",
      autoRecord: user?.preferences?.streaming?.autoRecord || false,
      localSave: true,
      autoDeleteRecordings: user?.preferences?.streaming?.autoDeleteRecordings || true,
      recordingRetentionHours: user?.preferences?.streaming?.recordingRetentionHours || 6,
    },
  });
  
  useEffect(() => {
    if (user) {
      profileForm.reset({
        username: user.username,
        displayName: user.displayName || "",
        bio: user.bio || "",
        isStreamer: user.isStreamer || false,
      });
      
      streamingSettingsForm.reset({
        defaultStreamType: user.preferences?.streaming?.defaultStreamType || "internet",
        defaultQuality: user.preferences?.streaming?.defaultQuality || "720p",
        autoRecord: user.preferences?.streaming?.autoRecord || false,
        localSave: true,
        autoDeleteRecordings: user.preferences?.streaming?.autoDeleteRecordings || true,
        recordingRetentionHours: user.preferences?.streaming?.recordingRetentionHours || 6,
      });
    }
  }, [user, profileForm, streamingSettingsForm]);
  
  const handleProfileSubmit = async (data: z.infer<typeof profileFormSchema>) => {
    if (!user) return;
    
    try {
      // Update profile
      await updateProfile({
        username: data.username,
        displayName: data.displayName,
        bio: data.bio,
      });
      
      // Update streamer status if changed
      if (data.isStreamer !== user.isStreamer) {
        await updateStreamerStatus(!!data.isStreamer);
      }
    } catch (error) {
      console.error("Failed to update profile:", error);
    }
  };
  
  const handleStreamingSettingsSubmit = async (data: z.infer<typeof streamingSettingsSchema>) => {
    if (!user) return;
    
    try {
      await updateUserPreferences({
        streaming: {
          defaultStreamType: data.defaultStreamType,
          defaultQuality: data.defaultQuality,
          autoRecord: data.autoRecord,
          autoDeleteRecordings: data.autoDeleteRecordings,
          recordingRetentionHours: data.recordingRetentionHours
        }
      });
    } catch (error) {
      console.error("Failed to update streaming settings:", error);
    }
  };
  
  const handleNotificationsUpdate = async (preferences: Partial<UserPreferences['notifications']>) => {
    if (!user) return;
    
    try {
      await updateUserPreferences({
        notifications: {
          ...user.preferences?.notifications,
          ...preferences
        }
      });
    } catch (error) {
      console.error("Failed to update notification settings:", error);
    }
  };
  
  const handlePrivacyUpdate = async (preferences: Partial<UserPreferences['privacy']>) => {
    if (!user) return;
    
    try {
      await updateUserPreferences({
        privacy: {
          ...user.preferences?.privacy,
          ...preferences
        }
      });
    } catch (error) {
      console.error("Failed to update privacy settings:", error);
    }
  };
  
  const handleThemeUpdate = async (theme: UserPreferences['theme']) => {
    if (!user) return;
    
    try {
      await updateUserPreferences({
        theme
      });
    } catch (error) {
      console.error("Failed to update theme settings:", error);
    }
  };
  
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        
        <main className="flex-1 container py-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col lg:flex-row gap-8">
              <div className="lg:w-64 space-y-6">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
              
              <div className="flex-1">
                <Skeleton className="h-64 w-full mb-8" />
                <Skeleton className="h-96 w-full" />
              </div>
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
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-8">
            <div className="lg:w-64 space-y-1">
              <Button 
                variant={activeTab === "profile" ? "default" : "ghost"} 
                className="w-full justify-start"
                onClick={() => setActiveTab("profile")}
              >
                <UserRound className="mr-2 h-4 w-4" />
                Profile
              </Button>
              
              <Button 
                variant={activeTab === "appearance" ? "default" : "ghost"} 
                className="w-full justify-start"
                onClick={() => setActiveTab("appearance")}
              >
                <Sun className="mr-2 h-4 w-4" />
                Appearance
              </Button>
              
              <Button 
                variant={activeTab === "notifications" ? "default" : "ghost"} 
                className="w-full justify-start"
                onClick={() => setActiveTab("notifications")}
              >
                <BellRing className="mr-2 h-4 w-4" />
                Notifications
              </Button>
              
              <Button 
                variant={activeTab === "privacy" ? "default" : "ghost"} 
                className="w-full justify-start"
                onClick={() => setActiveTab("privacy")}
              >
                <Shield className="mr-2 h-4 w-4" />
                Privacy
              </Button>
              
              <Button 
                variant={activeTab === "streaming" ? "default" : "ghost"} 
                className="w-full justify-start"
                onClick={() => setActiveTab("streaming")}
              >
                <Video className="mr-2 h-4 w-4" />
                Streaming
              </Button>
            </div>
            
            <div className="flex-1 space-y-6">
              {activeTab === "profile" && (
                <Form {...profileForm}>
                  <form onSubmit={profileForm.handleSubmit(handleProfileSubmit)} className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Profile</CardTitle>
                        <CardDescription>
                          Update your personal information and streamer status
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="flex items-center gap-6">
                          <Avatar className="h-20 w-20">
                            <AvatarImage src={user.avatar} alt={user.displayName || user.username} />
                            <AvatarFallback>
                              {(user.displayName || user.username).charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          
                          <div>
                            <Button variant="outline">
                              <UploadCloud className="mr-2 h-4 w-4" />
                              Change Avatar
                            </Button>
                          </div>
                        </div>
                        
                        <FormField
                          control={profileForm.control}
                          name="username"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Username</FormLabel>
                              <FormControl>
                                <Input placeholder="username" {...field} />
                              </FormControl>
                              <FormDescription>
                                This is your public username. It must be unique.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={profileForm.control}
                          name="displayName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Display Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Display Name" {...field} />
                              </FormControl>
                              <FormDescription>
                                This is the name that will be displayed to others.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={profileForm.control}
                          name="bio"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Bio</FormLabel>
                              <FormControl>
                                <Textarea 
                                  placeholder="Tell us about yourself" 
                                  className="resize-none min-h-[120px]" 
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                Write a short bio about yourself. This will be visible on your profile.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={profileForm.control}
                          name="isStreamer"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                              <div className="space-y-0.5">
                                <FormLabel className="text-base">Streamer Status</FormLabel>
                                <FormDescription>
                                  Enable this to create and broadcast streams
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </CardContent>
                      <CardFooter>
                        <Button type="submit">
                          <Save className="mr-2 h-4 w-4" />
                          Save Changes
                        </Button>
                      </CardFooter>
                    </Card>
                  </form>
                </Form>
              )}
              
              {activeTab === "appearance" && (
                <Card>
                  <CardHeader>
                    <CardTitle>Appearance</CardTitle>
                    <CardDescription>
                      Customize the appearance of the application
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium mb-4">Theme</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <Card 
                          className={`cursor-pointer border-2 ${user.preferences?.theme === 'light' ? 'border-primary' : 'border-transparent'}`}
                          onClick={() => handleThemeUpdate('light')}
                        >
                          <CardContent className="p-4 flex flex-col items-center">
                            <Sun className="h-8 w-8 mb-2" />
                            <span>Light</span>
                          </CardContent>
                        </Card>
                        
                        <Card 
                          className={`cursor-pointer border-2 ${user.preferences?.theme === 'dark' ? 'border-primary' : 'border-transparent'}`}
                          onClick={() => handleThemeUpdate('dark')}
                        >
                          <CardContent className="p-4 flex flex-col items-center">
                            <Moon className="h-8 w-8 mb-2" />
                            <span>Dark</span>
                          </CardContent>
                        </Card>
                        
                        <Card 
                          className={`cursor-pointer border-2 ${user.preferences?.theme === 'system' ? 'border-primary' : 'border-transparent'}`}
                          onClick={() => handleThemeUpdate('system')}
                        >
                          <CardContent className="p-4 flex flex-col items-center">
                            <Laptop className="h-8 w-8 mb-2" />
                            <span>System</span>
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {activeTab === "notifications" && (
                <Card>
                  <CardHeader>
                    <CardTitle>Notification Settings</CardTitle>
                    <CardDescription>
                      Manage your notification preferences
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between space-x-2">
                        <Label htmlFor="email-notifications" className="flex flex-col space-y-1">
                          <span>Email Notifications</span>
                          <span className="font-normal text-sm text-muted-foreground">
                            Receive notifications via email
                          </span>
                        </Label>
                        <Switch 
                          id="email-notifications" 
                          checked={user.preferences?.notifications?.email || false}
                          onCheckedChange={(checked) => handleNotificationsUpdate({ email: checked })}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between space-x-2">
                        <Label htmlFor="push-notifications" className="flex flex-col space-y-1">
                          <span>Push Notifications</span>
                          <span className="font-normal text-sm text-muted-foreground">
                            Receive notifications in your browser
                          </span>
                        </Label>
                        <Switch 
                          id="push-notifications" 
                          checked={user.preferences?.notifications?.push || false}
                          onCheckedChange={(checked) => handleNotificationsUpdate({ push: checked })}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between space-x-2">
                        <Label htmlFor="stream-start-notifications" className="flex flex-col space-y-1">
                          <span>Stream Start Notifications</span>
                          <span className="font-normal text-sm text-muted-foreground">
                            Get notified when streamers you follow go live
                          </span>
                        </Label>
                        <Switch 
                          id="stream-start-notifications" 
                          checked={user.preferences?.notifications?.streamStart || false}
                          onCheckedChange={(checked) => handleNotificationsUpdate({ streamStart: checked })}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between space-x-2">
                        <Label htmlFor="comment-notifications" className="flex flex-col space-y-1">
                          <span>Comment Notifications</span>
                          <span className="font-normal text-sm text-muted-foreground">
                            Get notified about new comments on your streams
                          </span>
                        </Label>
                        <Switch 
                          id="comment-notifications" 
                          checked={user.preferences?.notifications?.comments || false}
                          onCheckedChange={(checked) => handleNotificationsUpdate({ comments: checked })}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between space-x-2">
                        <Label htmlFor="followers-notifications" className="flex flex-col space-y-1">
                          <span>Follower Notifications</span>
                          <span className="font-normal text-sm text-muted-foreground">
                            Get notified when someone follows you
                          </span>
                        </Label>
                        <Switch 
                          id="followers-notifications" 
                          checked={user.preferences?.notifications?.followers || false}
                          onCheckedChange={(checked) => handleNotificationsUpdate({ followers: checked })}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {activeTab === "privacy" && (
                <Card>
                  <CardHeader>
                    <CardTitle>Privacy Settings</CardTitle>
                    <CardDescription>
                      Manage your privacy preferences
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between space-x-2">
                        <Label htmlFor="show-online-status" className="flex flex-col space-y-1">
                          <span>Show Online Status</span>
                          <span className="font-normal text-sm text-muted-foreground">
                            Let others see when you're online
                          </span>
                        </Label>
                        <Switch 
                          id="show-online-status" 
                          checked={user.preferences?.privacy?.showOnlineStatus || false}
                          onCheckedChange={(checked) => handlePrivacyUpdate({ showOnlineStatus: checked })}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between space-x-2">
                        <Label htmlFor="allow-messages" className="flex flex-col space-y-1">
                          <span>Allow Direct Messages</span>
                          <span className="font-normal text-sm text-muted-foreground">
                            Let others send you direct messages
                          </span>
                        </Label>
                        <Switch 
                          id="allow-messages" 
                          checked={user.preferences?.privacy?.allowMessages || false}
                          onCheckedChange={(checked) => handlePrivacyUpdate({ allowMessages: checked })}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between space-x-2">
                        <Label htmlFor="show-profile-unregistered" className="flex flex-col space-y-1">
                          <span>Public Profile</span>
                          <span className="font-normal text-sm text-muted-foreground">
                            Allow unregistered users to view your profile
                          </span>
                        </Label>
                        <Switch 
                          id="show-profile-unregistered" 
                          checked={user.preferences?.privacy?.showProfileToUnregistered || false}
                          onCheckedChange={(checked) => handlePrivacyUpdate({ showProfileToUnregistered: checked })}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {activeTab === "streaming" && (
                <Form {...streamingSettingsForm}>
                  <form onSubmit={streamingSettingsForm.handleSubmit(handleStreamingSettingsSubmit)} className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Streaming Settings</CardTitle>
                        <CardDescription>
                          Configure your streaming preferences
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <FormField
                            control={streamingSettingsForm.control}
                            name="defaultStreamType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Default Streaming Type</FormLabel>
                                <Select 
                                  onValueChange={field.onChange} 
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select a streaming type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="local">
                                      <div className="flex items-center">
                                        <Wifi className="h-4 w-4 mr-2" />
                                        Local (LAN/WLAN)
                                      </div>
                                    </SelectItem>
                                    <SelectItem value="internet">
                                      <div className="flex items-center">
                                        <Globe className="h-4 w-4 mr-2" />
                                        Internet
                                      </div>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormDescription>
                                  Choose where your streams will be available by default
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={streamingSettingsForm.control}
                            name="defaultQuality"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Default Quality</FormLabel>
                                <Select 
                                  onValueChange={field.onChange} 
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select a quality preset" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="1080p">1080p (High Quality)</SelectItem>
                                    <SelectItem value="720p">720p (Balanced)</SelectItem>
                                    <SelectItem value="480p">480p (Low Bandwidth)</SelectItem>
                                    <SelectItem value="360p">360p (Mobile Friendly)</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormDescription>
                                  Choose your default streaming quality
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        
                        <div className="space-y-4">
                          <FormField
                            control={streamingSettingsForm.control}
                            name="autoRecord"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-base">Auto-Record Streams</FormLabel>
                                  <FormDescription>
                                    Automatically record all your streams
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={streamingSettingsForm.control}
                            name="localSave"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-base">Save Recordings Locally</FormLabel>
                                  <FormDescription>
                                    Save recordings to your device instead of the cloud
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={streamingSettingsForm.control}
                            name="autoDeleteRecordings"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-base">Auto-Delete Cloud Recordings</FormLabel>
                                  <FormDescription>
                                    Automatically delete cloud recordings after a set period
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          
                          {streamingSettingsForm.watch("autoDeleteRecordings") && (
                            <FormField
                              control={streamingSettingsForm.control}
                              name="recordingRetentionHours"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Recording Retention (Hours)</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number" 
                                      min={1} 
                                      max={72} 
                                      {...field}
                                      onChange={e => field.onChange(Number(e.target.value))}
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    How long to keep cloud recordings before auto-deletion (1-72 hours)
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                        </div>
                      </CardContent>
                      <CardFooter>
                        <Button type="submit">
                          <Save className="mr-2 h-4 w-4" />
                          Save Streaming Settings
                        </Button>
                      </CardFooter>
                    </Card>
                  </form>
                </Form>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
