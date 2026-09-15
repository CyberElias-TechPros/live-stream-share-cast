/**
 * Auth state for the app — backed by the Cloudflare Worker API.
 *
 * Sessions are JWT access tokens (1h) + rotating refresh tokens (30d) issued by
 * `/api/auth/*`. Tokens live in localStorage; a failed refresh clears them and
 * drops the user back to a logged-out state.
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, tokenStore, ApiRequestError, SESSION_EXPIRED_EVENT } from '@/integrations/api/client';
import { toUser } from '@/integrations/api/mappers';
import type { User, UserPreferences } from '@/types';
import { toast } from '@/hooks/use-toast';
import { profileService } from '@/services/profileService';

export interface AuthContextType {
  user: User | null;
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

interface AuthResponse {
  user: unknown;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.get<{ user: unknown }>('/auth/me');
      setUser(toUser(data.user));
    } catch (error) {
      // A 401 here means "no valid session", which is a normal logged-out state.
      if (!(error instanceof ApiRequestError) || error.status !== 401) {
        console.error('Error refreshing user:', error);
      }
      setUser(null);
    }
  }, []);

  // Bootstrap: hydrate from an existing token pair.
  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      try {
        if (!tokenStore.access && !tokenStore.refresh) {
          setIsLoading(false);
          return;
        }
        await refreshUser();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void initialize();

    // The API client fires this when a refresh attempt fails for good.
    const handleExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);

    return () => {
      cancelled = true;
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    };
  }, [refreshUser]);

  const adoptSession = useCallback(async (data: AuthResponse, redirectTo?: string) => {
    tokenStore.setTokens(data.accessToken, data.refreshToken);
    setUser(toUser(data.user));
    if (redirectTo) navigate(redirectTo);
  }, [navigate]);

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const data = await api.post<AuthResponse>('/auth/login', { email, password }, { auth: false });
      await adoptSession(data);

      toast({
        title: 'Login successful',
        description: 'You have successfully logged in',
      });

      navigate('/');
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: 'Login failed',
        description: error instanceof Error ? error.message : 'Failed to log in. Please check your credentials.',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (username: string, email: string, password: string) => {
    try {
      setIsLoading(true);
      const data = await api.post<AuthResponse>(
        '/auth/signup',
        { username, email, password, displayName: username },
        { auth: false },
      );
      await adoptSession(data);

      toast({
        title: 'Account created',
        description: 'Welcome to I’m Live — you’re signed in.',
      });

      navigate('/');
    } catch (error) {
      console.error('Sign up error:', error);
      const message =
        error instanceof ApiRequestError && error.code === 'username_taken'
          ? 'That username is already taken'
          : error instanceof ApiRequestError && error.code === 'email_taken'
            ? 'An account with this email already exists'
            : error instanceof Error
              ? error.message
              : 'Failed to create account';

      toast({
        title: 'Sign up failed',
        description: message,
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      // Best effort: the server revokes the session, the client drops the tokens.
      await api.post('/auth/logout').catch(() => undefined);
    } finally {
      tokenStore.clear();
      setUser(null);
      setIsLoading(false);

      toast({
        title: 'Logged out',
        description: 'You have been successfully logged out',
      });

      navigate('/login');
    }
  };

  const updateProfile = async (updates: Partial<User>) => {
    try {
      if (!user) throw new Error('No authenticated user');

      const updatedProfile = await profileService.updateProfile(user.id, updates);
      if (!updatedProfile) throw new Error('Failed to update profile');

      setUser(updatedProfile);

      toast({
        title: 'Profile updated',
        description: 'Your profile has been successfully updated',
      });
    } catch (error) {
      console.error('Profile update error:', error);
      toast({
        title: 'Profile update failed',
        description: error instanceof Error ? error.message : 'Failed to update profile',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const updateStreamerStatus = async (isStreamer: boolean) => {
    try {
      if (!user) throw new Error('No authenticated user');

      const success = await profileService.updateStreamerStatus(user.id, isStreamer);
      if (!success) throw new Error('Failed to update streamer status');

      setUser((prev) => (prev ? { ...prev, isStreamer } : null));

      toast({
        title: isStreamer ? 'Streamer status enabled' : 'Streamer status disabled',
        description: isStreamer
          ? 'You can now create and broadcast streams'
          : 'Your streamer privileges have been removed',
      });
    } catch (error) {
      console.error('Streamer status update error:', error);
      toast({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Failed to update streamer status',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const updateUserPreferences = async (preferences: Partial<UserPreferences>) => {
    try {
      if (!user) throw new Error('No authenticated user');

      const success = await profileService.updateUserPreferences(user.id, preferences);
      if (!success) throw new Error('Failed to update preferences');

      setUser((prev) =>
        prev
          ? {
              ...prev,
              preferences: {
                ...(prev.preferences ?? {}),
                ...preferences,
              } as UserPreferences,
            }
          : null,
      );

      toast({
        title: 'Preferences updated',
        description: 'Your preferences have been saved',
      });
    } catch (error) {
      console.error('Preferences update error:', error);
      toast({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Failed to update preferences',
        variant: 'destructive',
      });
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        signup,
        logout,
        updateProfile,
        updateStreamerStatus,
        refreshUser,
        updateUserPreferences,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
