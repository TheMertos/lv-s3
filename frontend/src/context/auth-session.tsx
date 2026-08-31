import * as admin from '@/api/admin';
import { registerTokenHandlers } from '@/api/client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/** Auth session state exposed to the admin console. */
export type AuthSessionContextValue = {
  accessToken: string | null;
  /** True after the initial refresh attempt on mount completes. */
  isReady: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setAccessToken: (token: string | null) => void;
};

const AuthSessionCtx = createContext<AuthSessionContextValue | null>(null);

/**
 * Returns the auth session context; throws if used outside the provider.
 */
export function useAuthSession(): AuthSessionContextValue {
  const ctx = useContext(AuthSessionCtx);
  if (!ctx) throw new Error('useAuthSession must be used within AuthSessionProvider');
  return ctx;
}

/**
 * Attempts to restore an access token using the HttpOnly refresh cookie.
 */
async function tryRefresh(): Promise<string | null> {
  try {
    const result = await admin.refreshAccessToken();
    return result.accessToken;
  } catch {
    return null;
  }
}

/**
 * Provides in-memory access token state and login/logout helpers.
 */
export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    registerTokenHandlers({
      getAccessToken: () => accessToken,
      setAccessToken,
    });
  }, [accessToken]);

  useEffect(() => {
    let active = true;
    void tryRefresh().then((token) => {
      if (!active) return;
      if (token) setAccessToken(token);
      setIsReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await admin.login(username, password);
    setAccessToken(result.accessToken);
  }, []);

  const logout = useCallback(async () => {
    try {
      await admin.logout();
    } finally {
      setAccessToken(null);
    }
  }, []);

  const value = useMemo(
    () => ({ accessToken, isReady, login, logout, setAccessToken }),
    [accessToken, isReady, login, logout],
  );

  return <AuthSessionCtx.Provider value={value}>{children}</AuthSessionCtx.Provider>;
}
