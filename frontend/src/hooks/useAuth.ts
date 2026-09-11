import { useCallback, useEffect, useState } from "react";
import type { AppUser } from "../types";
import { api, getToken, setToken } from "../lib/api";

const USER_KEY = "biolink_user";

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as AppUser) : null;
    } catch {
      return null;
    }
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setReady(true);
      return;
    }
    api<AppUser>("/api/auth/me")
      .then((me) => {
        setUser(me);
        localStorage.setItem(USER_KEY, JSON.stringify(me));
      })
      .catch(() => {
        setToken(null);
        localStorage.removeItem(USER_KEY);
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  const login = useCallback((loggedUser: AppUser) => {
    setUser(loggedUser);
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(loggedUser));
    } catch {
      /* ignore */
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    try {
      localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return {
    user,
    isAuthenticated: !!user && !!getToken(),
    ready,
    login,
    logout,
  };
}