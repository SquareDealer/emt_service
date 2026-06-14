import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, getToken, setToken } from './api';
import type { AuthUser } from './types';

interface AuthCtx {
  user: AuthUser | null;
  ready: boolean;
  login: (login: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    let active = true;
    if (getToken()) {
      api
        .me()
        .then((u) => active && setUser(u))
        .catch(() => active && setToken(null))
        .finally(() => active && setReady(true));
    } else {
      setReady(true);
    }
    const onUnauth = () => setUser(null);
    window.addEventListener('crm-unauthorized', onUnauth);
    return () => {
      active = false;
      window.removeEventListener('crm-unauthorized', onUnauth);
    };
  }, []);

  const login = useCallback(async (l: string, p: string) => {
    const res = await api.login(l, p);
    setToken(res.access_token);
    setUser(res.user);
  }, []);

  return <Ctx.Provider value={{ user, ready, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
