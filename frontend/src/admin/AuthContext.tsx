import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';
import * as api from './api';
import type { AdminSession } from './api';

type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  admin: AdminSession | null;
  status: SessionStatus;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Hydrates the session once on mount by asking the API who (if anyone) the
 * current cookies belong to - the frontend never stores or reads the tokens
 * themselves (they're httpOnly), so this round trip is the only way to know.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    void api.getCurrentAdmin().then((session) => {
      if (cancelled) return;
      setAdmin(session);
      setStatus(session ? 'authenticated' : 'unauthenticated');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await api.login(email, password);
    setAdmin(session);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setAdmin(null);
    setStatus('unauthenticated');
  }, []);

  return <AuthContext value={{ admin, status, login, logout }}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
