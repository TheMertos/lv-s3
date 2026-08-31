/** Default Redis key prefix when `REDIS_KEY_PREFIX` is unset or empty. */
const DEFAULT_REDIS_KEY_PREFIX = 'lv-s3:';

/**
 * Resolves the Redis key prefix from an env value.
 * Unset or empty values become `lv-s3:` so keys are never written unprefixed.
 * A non-empty prefix without a trailing colon gets `:` appended.
 *
 * @param envValue - Optional `REDIS_KEY_PREFIX` env string.
 * @returns Non-empty prefix that always ends with `:`.
 */
export function resolveRedisKeyPrefix(envValue?: string): string {
  const trimmed = envValue?.trim() ?? '';
  if (trimmed.length === 0) {
    return DEFAULT_REDIS_KEY_PREFIX;
  }
  return trimmed.endsWith(':') ? trimmed : `${trimmed}:`;
}

/**
 * Joins a Redis key prefix with a logical key.
 *
 * @param prefix - Prefix from {@link resolveRedisKeyPrefix} (must end with `:`).
 * @param key - Logical key (e.g. `lockout:ip:1.2.3.4`).
 * @returns Prefixed Redis key (`prefix` + `key`).
 */
export function prefixedRedisKey(prefix: string, key: string): string {
  return `${prefix}${key}`;
}
