import { resolveRedisKeyPrefix as resolveRedisKeyPrefixFromEnv } from '../modules/rate-limit/redis-key-prefix';

/**
 * Returns the Redis connection URL from `REDIS_URL`.
 * Unset or empty/whitespace values mean Redis is disabled (DB table fallback).
 *
 * @returns Trimmed Redis URL, or `null` when unset/empty.
 */
export function resolveRedisUrl(): string | null {
  const trimmed = process.env.REDIS_URL?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Returns the Redis key prefix from `REDIS_KEY_PREFIX`.
 * Delegates to the rate-limit helper; does not duplicate prefix rules.
 *
 * @returns Non-empty prefix that always ends with `:`.
 */
export function resolveRedisKeyPrefix(): string {
  return resolveRedisKeyPrefixFromEnv(process.env.REDIS_KEY_PREFIX);
}
