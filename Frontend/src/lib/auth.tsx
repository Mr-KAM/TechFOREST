import React, { createContext, useContext, useEffect, useState } from "react";
import { getMe, login as apiLogin, type UserProfile } from "@/lib/api";

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<UserProfile | null>;
  setUser: (user: UserProfile | null) => void;
}

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("token") ?? sessionStorage.getItem("token"),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      getMe()
        .then(setUser)
        .catch(() => {
          localStorage.removeItem("token");
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (email: string, password: string, rememberMe = false) => {
    const res = await apiLogin(email, password);
    if (rememberMe) {
      localStorage.setItem("token", res.access_token);
      sessionStorage.removeItem("token");
    } else {
      sessionStorage.setItem("token", res.access_token);
      localStorage.removeItem("token");
    }
    setToken(res.access_token);
    const profile = await getMe();
    setUser(profile);
  };

  const logout = () => {
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    if (!token) return null;
    const profile = await getMe();
    setUser(profile);
    return profile;
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// ─── Helpers de rôle ────────────────────────────────────────

export const ROLES = {
  SUPERADMIN: "superadmin",
  ADMIN: "admin",
  EDITOR: "editor",
  VIEWER: "viewer",
} as const;

export function hasRole(user: UserProfile | null, ...roles: string[]): boolean {
  if (!user) return false;
  // Le superadmin a accès à tout
  if (user.role === ROLES.SUPERADMIN) return true;
  return roles.includes(user.role);
}

export function isSuperadmin(user: UserProfile | null): boolean {
  return user?.role === ROLES.SUPERADMIN;
}

export function isAdmin(user: UserProfile | null): boolean {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.SUPERADMIN;
}
