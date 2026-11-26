import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, tokens } from "./api";
import type { Me } from "./types";

interface AuthCtx { user: Me | null; ready: boolean; login: (identifier: string, password: string) => Promise<Me>; logout: () => void; enter: (u: Me) => void }
const Auth = createContext<AuthCtx>({ user: null, ready: true, login: async () => { throw new Error("no provider"); }, logout: () => {}, enter: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [ready, setReady] = useState(!tokens.hasRefresh);
  useEffect(() => {
    if (!tokens.hasRefresh) return;
    api<Me>("/me/").then(setUser).catch(() => tokens.clear()).finally(() => setReady(true));
  }, []);
  const login = useCallback(async (identifier: string, password: string) => {
    const r = await api<{ user: Me; access: string; refresh: string }>("/auth/login/", { method: "POST", body: { identifier, password } });
    tokens.set(r.access, r.refresh);
    setUser(r.user);
    return r.user;
  }, []);
  const logout = useCallback(() => { tokens.clear(); setUser(null); }, []);
  const enter = useCallback((u: Me) => setUser(u), []); // signed in for this visit only, nothing stored
  const value = useMemo(() => ({ user, ready, login, logout, enter }), [user, ready, login, logout, enter]);
  return <Auth.Provider value={value}>{children}</Auth.Provider>;
}
export const useAuth = () => useContext(Auth);
