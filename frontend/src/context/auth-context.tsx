import { createContext, useContext, type ReactNode } from 'react';

/** Admin bucket row shown in the console. */
export type BucketRow = { name: string; publicRead: boolean; encryptAtRest: boolean };

/** Auth and bucket/upload helpers exposed to the admin console. */
export type AuthContextValue = {
  token: string;
  logout: () => void;
  loadBuckets: () => Promise<BucketRow[]>;
  buckets: BucketRow[];
  bucketsLoading: boolean;
  bucketsError: string;
  setBuckets: (b: BucketRow[]) => void;
  uploadFile: (bucket: string, key: string, file: File) => Promise<void>;
};

const AuthCtx = createContext<AuthContextValue | null>(null);

/**
 * Returns the admin auth context; throws if used outside the provider.
 */
export function useAuth(): AuthContextValue {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth must be used within AuthCtx provider');
  return c;
}

/**
 * Provides auth state and bucket helpers to the console subtree.
 */
export function AuthProvider({ value, children }: { value: AuthContextValue; children: ReactNode }) {
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
