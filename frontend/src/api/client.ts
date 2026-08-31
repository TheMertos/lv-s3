import { messageFromApiBody } from '@/lib/api-error';

import createClient, { type Client, type Middleware } from 'openapi-fetch';

import type { components, paths } from './generated/admin-api';

export type { components, paths };

type TokenHandlers = {
  getAccessToken: () => string | null;
  setAccessToken: (token: string | null) => void;
};

let tokenHandlers: TokenHandlers = {
  getAccessToken: () => null,
  setAccessToken: () => {},
};

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Registers getters/setters so fetch helpers can attach and refresh the access token.
 */
export function registerTokenHandlers(handlers: TokenHandlers): void {
  tokenHandlers = handlers;
}

/**
 * Resolves the admin API base URL (same-origin in prod, proxy or explicit host in dev).
 */
export function resolveAdminApiBase(): string {
  const fromEnv = import.meta.env.VITE_ADMIN_API?.trim();
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined') {
    if (import.meta.env.DEV) {
      if (import.meta.env.VITE_ADMIN_PROXY === '1') {
        return '';
      }
      const port = import.meta.env.VITE_ADMIN_PORT?.trim() || '9001';
      return `http://127.0.0.1:${port}`;
    }
    return '';
  }
  const port = import.meta.env.VITE_ADMIN_PORT?.trim() || '9001';
  return `http://127.0.0.1:${port}`;
}

/**
 * Redirects to login and clears in-memory token on 401.
 */
function redirectToLogin(): never {
  tokenHandlers.setAccessToken(null);
  window.location.href = '/';
  throw new Error('Unauthorized');
}

/**
 * Single-flight refresh via POST /auth/refresh (HttpOnly cookie).
 */
async function refreshAccessTokenOnce(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${resolveAdminApiBase()}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!response.ok) return null;
        const data = (await response.json()) as { accessToken: string };
        tokenHandlers.setAccessToken(data.accessToken);
        return data.accessToken;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

/**
 * Fetch wrapper: always sends credentials; on 401 retries once after refresh.
 * Preserves Request headers/body when openapi-fetch passes a Request as the first argument.
 */
export async function credentialedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const original = input instanceof Request ? input : new Request(input, init);
  const url = original.url;
  const isAuthFlow = /\/auth\/(login|refresh|logout)(\?|$)/.test(url);

  /**
   * Builds an authenticated Request from a source Request (clone-safe for retries).
   */
  const withAuth = (source: Request, overrideAuth?: string): Request => {
    const headers = new Headers(source.headers);
    if (overrideAuth) {
      headers.set('Authorization', `Bearer ${overrideAuth}`);
    } else if (!headers.has('Authorization')) {
      const token = tokenHandlers.getAccessToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
    }
    return new Request(source, { headers, credentials: 'include' });
  };

  const retrySource = original.clone();
  let response = await fetch(withAuth(original));

  if (response.status === 401 && !isAuthFlow) {
    const newToken = await refreshAccessTokenOnce();
    if (newToken) {
      response = await fetch(withAuth(retrySource, newToken));
    }
    if (response.status === 401) redirectToLogin();
  }

  return response;
}

/**
 * Unauthenticated OpenAPI client (login, health); still sends cookies for refresh.
 */
export function createPublicClient(): Client<paths, `${string}/${string}`> {
  return createClient<paths>({ baseUrl: resolveAdminApiBase(), fetch: credentialedFetch });
}

/**
 * OpenAPI client with Bearer token from the passed token or in-memory session.
 */
export function createAuthClient(token: string): Client<paths, `${string}/${string}`> {
  const client = createClient<paths>({ baseUrl: resolveAdminApiBase(), fetch: credentialedFetch });
  const authMiddleware: Middleware = {
    onRequest({ request }) {
      request.headers.set('Authorization', `Bearer ${token}`);
      return request;
    },
  };
  client.use(authMiddleware);
  return client;
}

/**
 * Returns response data or throws with a unified API error message.
 */
export function unwrapData<T>(
  result: { data?: T; error?: unknown; response: Response },
  fallback: string,
): T {
  if (result.error !== undefined || result.data === undefined) {
    throw new Error(messageFromApiBody(result.error, fallback));
  }
  return result.data;
}

/**
 * Authenticated JSON fetch for endpoints missing OpenAPI response schemas.
 */
export async function authFetchJson<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${token}`,
  };
  if (init?.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await credentialedFetch(`${resolveAdminApiBase()}${path}`, { ...init, headers });
  if (response.status === 401) redirectToLogin();
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(messageFromApiBody(body, 'Request failed'));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

/**
 * Authenticated multipart/form-data fetch.
 */
export async function authFetchForm<T>(
  token: string,
  path: string,
  body: FormData,
  method = 'POST',
): Promise<T> {
  const response = await credentialedFetch(`${resolveAdminApiBase()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  if (response.status === 401) redirectToLogin();
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(messageFromApiBody(errBody, 'Request failed'));
  }
  return response.json() as Promise<T>;
}
