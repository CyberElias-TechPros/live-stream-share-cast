
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { supabase } from "@/integrations/supabase/client";
import { User, UserPreferences } from "@/types";
import { toast } from "@/hooks/use-toast";
import { profileService } from "@/services/profileService";

interface AuthContextType {
  user: User | null;
  supabaseUser: SupabaseUser | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  updateStreamerStatus: (isStreamer: boolean) => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUserPreferences: (preferences: Partial<UserPreferences>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  
  // Initialize auth and listen for auth changes
  useEffect(() => {
    // First, set up the auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        setSupabaseUser(newSession?.user ?? null);
        
        // Use setTimeout to avoid potential deadlocks
        if (newSession?.user) {
          setTimeout(() => {
            fetchUserProfile(newSession.user.id);
          }, 0);
        } else {
          setUser(null);
        }
      }
    );
    
    // Then check for existing session
    const initializeAuth = async () => {
      try {
        setIsLoading(true);
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        
        setSession(currentSession);
        setSupabaseUser(currentSession?.user ?? null);
        
        if (currentSession?.user) {
          await fetchUserProfile(currentSession.user.id);
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    initializeAuth();
    
    return () => {
      subscription.unsubscribe();
    };
  }, []);
  
  const fetchUserProfile = async (userId: string) => {
    try {
      const userProfile = await profileService.getProfile(userId);
      
      if (userProfile) {
        setUser(userProfile);
      } else {
        // No profile found, user might need to create one
        if (supabaseUser) {
          // This should not happen if the database trigger is set up correctly,
          // but just in case we handle it here
          const newUser: User = {
            id: supabaseUser.id,
            username: supabaseUser.email?.split('@')[0] || `user_${Date.now().toString(36)}`,
            email: supabaseUser.email || '',
            createdAt: new Date(),
            isStreamer: false
          };
          
          await updateProfile(newUser);
        }
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (error) {
        throw error;
      }
      
      // User will be set by the auth state change listener
      toast({
        title: "Login successful",
        description: "You have successfully logged in",
      });
      
      navigate("/");
    } catch (error: any) {
      console.error("Login error:", error);
      toast({
        title: "Login failed",
        description: error.message || "Failed to log in. Please check your credentials.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const signup = async (username: string, email: string, password: string) => {
    try {
      setIsLoading(true);
      
      // First check if username is already taken
      const { data: existingUsers } = await supabase
        .from("profiles")
        .select("username")
        .eq("username", username)
        .limit(1);
      
      if (existingUsers && existingUsers.length > 0) {
        throw new Error("Username is already taken");
      }
      
      // Create the user
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            display_name: username
          }
        }
      });
      
      if (error) {
        throw error;
      }
      
      toast({
        title: "Success",
        description: "Your account has been created. Please check your email for verification.",
      });
      
      // Note: The user will be set by the auth state change listener
      // if email verification is not required
      
    } catch (error: any) {
      console.error("Sign up error:", error);
      toast({
        title: "Sign up failed",
        description: error.message || "Failed to create account",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const logout = async () => {
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        throw error;
      }
      
      // Clear user state
      setUser(null);
      setSupabaseUser(null);
      setSession(null);
      
      toast({
        title: "Logged out",
        description: "You have been successfully logged out",
      });
      
      navigate("/login");
    } catch (error: any) {
      console.error("Logout error:", error);
      toast({
        title: "Logout failed",
        description: error.message || "Failed to log out",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const updateProfile = async (updates: Partial<User>) => {
    try {
      if (!user) {
        throw new Error("No authenticated user");
      }
      
      const updatedProfile = await profileService.updateProfile(user.id, updates);
      
      if (!updatedProfile) {
        throw new Error("Failed to update profile");
      }
      
      setUser(updatedProfile);
      
      toast({
        title: "Profile updated",
        description: "Your profile has been successfully updated",
      });
    } catch (error: any) {
      console.error("Profile update error:", error);
      toast({
        title: "Profile update failed",
        description: error.message || "Failed to update profile",
        variant: "destructive"
      });
      throw error;
    }
  };
  
  const updateStreamerStatus = async (isStreamer: boolean) => {
    try {
      if (!user) {
        throw new Error("No authenticated user");
      }
      
      const success = await profileService.updateStreamerStatus(user.id, isStreamer);
      
      if (!success) {
        throw new Error("Failed to update streamer status");
      }
      
      // Update local user state
      setUser(prev => prev ? { ...prev, isStreamer } : null);
      
      toast({
        title: isStreamer ? "Streamer status enabled" : "Streamer status disabled",
        description: isStreamer 
          ? "You can now create and broadcast streams" 
          : "Your streamer privileges have been removed",
      });
    } catch (error: any) {
      console.error("Streamer status update error:", error);
      toast({
        title: "Update failed",
        description: error.message || "Failed to update streamer status",
        variant: "destructive"
      });
      throw error;
    }
  };
  
  const updateUserPreferences = async (preferences: Partial<UserPreferences>) => {
    try {
      if (!user) {
        throw new Error("No authenticated user");
      }
      
      const success = await profileService.updateUserPreferences(user.id, preferences);
      
      if (!success) {
        throw new Error("Failed to update preferences");
      }
      
      // Update local user state
      setUser(prev => {
        if (!prev) return null;
        
        return {
          ...prev,
          preferences: {
            ...prev.preferences,
            ...preferences
          }
        };
      });
      
      toast({
        title: "Preferences updated",
        description: "Your preferences have been successfully updated",
      });
    } catch (error: any) {
      console.error("Preferences update error:", error);
      toast({
        title: "Update failed",
        description: error.message || "Failed to update preferences",
        variant: "destructive"
      });
      throw error;
    }
  };
  
  const refreshUser = async () => {
    if (!supabaseUser) return;
    await fetchUserProfile(supabaseUser.id);
  };
  
  return (
    <AuthContext.Provider value={{
      user,
      supabaseUser,
      session,
      isLoading,
      isAuthenticated: !!user,
      login,
      signup,
      logout,
      updateProfile,
      updateStreamerStatus,
      refreshUser,
      updateUserPreferences
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
