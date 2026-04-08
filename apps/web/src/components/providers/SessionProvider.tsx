'use client';

import { authClient } from '@/lib/api-client/auth.client';
import { ApiError } from '@/lib/api-client/base';
import type { Role } from '@vantrade/types';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type SessionUser = {
  id: string;
  email: string;
  role: Role;
};

type SessionContextValue = {
  user: SessionUser | null;
  loading: boolean;
  refreshSession: () => Promise<void>;
  setSessionUser: (user: SessionUser | null) => void;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    setLoading(true);

    try {
      const session = await authClient.me();
      setUser(session.user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const setSessionUser = useCallback((nextUser: SessionUser | null) => {
    setUser(nextUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authClient.logout();
    } catch {
      // best-effort logout
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      refreshSession,
      setSessionUser,
      logout,
    }),
    [loading, logout, refreshSession, setSessionUser, user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return context;
}
