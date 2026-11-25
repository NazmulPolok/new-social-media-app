"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { API_BASE, apiFetch, getToken, setToken } from "@/lib/api";

export interface UserProfile {
  id: number;
  username: string;
  display_name: string;
  email_hash_preview: string;
  bio: string;
  avatar_url: string;
  cover_url: string;
  created_at: string;
}

export interface LiveEvent {
  event: string;
  timestamp: string;
  title?: string;
  body?: string;
  data?: any;
}

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  liveEvents: LiveEvent[];
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, displayName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  setUserData: (u: UserProfile) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    apiFetch<UserProfile>("/api/auth/me")
      .then((u) => setUser(u))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  // Connect to Webhook-driven SSE communication channel
  useEffect(() => {
    const uid = user?.id ?? 0;
    const es = new EventSource(`${API_BASE}/api/webhooks/stream?user_id=${uid}`);
    es.onmessage = (msg) => {
      try {
        const parsed: LiveEvent = JSON.parse(msg.data);
        if (parsed.event && parsed.event !== "connected") {
          setLiveEvents((prev) => [parsed, ...prev].slice(0, 20));
        }
      } catch {
        // ignore keepalive
      }
    };
    return () => es.close();
  }, [user?.id]);

  const login = async (email: string, password: string) => {
    const res = await apiFetch<{ access_token: string; user: UserProfile }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, email_or_username: email, password }),
    });
    setToken(res.access_token);
    setUser(res.user);
  };

  const register = async (
    username: string,
    displayName: string,
    email: string,
    password: string
  ) => {
    const res = await apiFetch<{ access_token: string; user: UserProfile }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        username,
        display_name: displayName,
        email,
        password,
      }),
    });
    setToken(res.access_token);
    setUser(res.user);
  };

  const logout = () => {
    apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, liveEvents, login, register, logout, setUserData: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
