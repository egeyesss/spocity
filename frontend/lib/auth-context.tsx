"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { ApiError, fetchAPI } from "./api";

export interface AuthUser {
  display_name: string;
  spotify_user_id: string;
  username: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const STORAGE_KEY = "spocity_user";

const AuthContext = createContext<AuthContextValue | null>(null);

function readCache(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Initialise from cache so the UI doesn't flash unauthenticated on reload.
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Hydrate from localStorage first, then confirm with the server.
    const cached = readCache();
    if (cached) setUser(cached);

    fetchAPI<AuthUser>("/api/auth/me/")
      .then((fresh) => {
        setUser(fresh);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      })
      .catch((err) => {
        // 401/403 means the session is genuinely gone — purge the stale cache.
        // For network errors (status 0) we keep the cached user rather than
        // logging them out because of a dropped connection.
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          setUser(null);
          localStorage.removeItem(STORAGE_KEY);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    // Await the server call so the Django session is gone before the caller
    // navigates. Without this, router.push() can happen while the sessionid
    // cookie is still valid, leaving the user authenticated on the next SSR hit.
    // Errors are swallowed: the user is logged out locally regardless.
    await fetchAPI("/api/auth/logout/", { method: "POST" }).catch(() => {});
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
