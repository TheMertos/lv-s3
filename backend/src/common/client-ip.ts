import { Request } from 'express';
import { trustProxySetting } from '../config/validate-env';

/**
 * Resolves the client IP for rate limiting and lockout.
 * Uses X-Forwarded-For only when TRUST_PROXY is configured.
 */
export function resolveClientIp(req: Request, fallbackIp?: string): string {
  if (!trustProxySetting()) return fallbackIp || '0.0.0.0';
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]!.trim();
  }
  return req.ip || fallbackIp || '0.0.0.0';
}
