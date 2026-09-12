import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import type { Profile, SelfUser } from "@/types";

interface AuthContextType {
  user: SelfUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (identity: string, password: string) => Promise<void>;
  signup: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: SelfUser | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SelfUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const { user: fresh } = await api.get<{ user: SelfUser }>("/api/auth/me");
      setUser(fresh);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
      }
      // network errors keep the current state; the next call retries
    }
  }, []);

  useEffect(() => {
    void refreshUser().finally(() => setIsLoading(false));
  }, [refreshUser]);

  const login = useCallback(
    async (identity: string, password: string) => {
      const { user: loggedIn } = await api.post<{ user: SelfUser }>("/api/auth/login", { identity, password });
      setUser(loggedIn);
    },
    []
  );

  const signup = useCallback(async (username: string, email: string, password: string) => {
    const { user: created } = await api.post<{ user: SelfUser }>("/api/auth/signup", { username, email, password });
    setUser(created);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      signup,
      logout,
      refreshUser,
      setUser,
    }),
    [user, isLoading, login, signup, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export type { Profile };
