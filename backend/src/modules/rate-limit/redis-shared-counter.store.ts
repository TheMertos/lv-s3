import { Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { prefixedRedisKey } from './redis-key-prefix';
import type {
  SharedCounterRecord,
  SharedCounterStore,
} from './shared-counter-store';

/** Max WATCH/MULTI retries when a concurrent writer races the same key. */
const MUTATE_MAX_RETRIES = 8;

/**
 * Minimal Redis client methods required by RedisSharedCounterStore.
 * Accepts a real ioredis instance or a test double with the same surface.
 * `watch` / `unwatch` / `multi` support optimistic atomic mutate.
 */
export type RedisSharedCounterClient = Pick<
  Redis,
  'get' | 'set' | 'del' | 'watch' | 'unwatch' | 'multi'
>;

/**
 * Redis-backed SharedCounterStore. All keys go through {@link prefixedRedisKey}.
 */
@Injectable()
export class RedisSharedCounterStore implements SharedCounterStore {
  /**
   * @param redis - ioredis client (or compatible fake).
   * @param prefix - Key prefix from {@link resolveRedisKeyPrefix} (must end with `:`).
   */
  constructor(
    private readonly redis: RedisSharedCounterClient,
    private readonly prefix: string,
  ) {}

  /**
   * Converts TTL milliseconds to Redis EX seconds (minimum 1).
   * @param ttlMs - Time-to-live in milliseconds.
   * @returns Whole seconds for Redis SET EX.
   */
  private ttlSeconds(ttlMs: number): number {
    return Math.max(1, Math.ceil(ttlMs / 1000));
  }

  /**
   * Best-effort UNWATCH so a timed-out command cannot leave the shared client watching.
   * @returns Resolves when unwatch completes or after swallowing cleanup errors.
   */
  private async safeUnwatch(): Promise<void> {
    try {
      await this.redis.unwatch();
    } catch {
      // Prefer preserving the original mutate error over a secondary unwatch failure.
    }
  }

  /**
   * Reads and JSON-parses the counter for `key`.
   * @param key - Logical counter key (without Redis key prefix).
   * @returns The stored record, or `null` when missing.
   */
  async get(key: string): Promise<SharedCounterRecord | null> {
    const raw = await this.redis.get(prefixedRedisKey(this.prefix, key));
    if (raw == null) return null;
    return JSON.parse(raw) as SharedCounterRecord;
  }

  /**
   * Serializes `value` as JSON and SETs with EX = ceil(ttlMs/1000), min 1.
   * @param key - Logical counter key (without Redis key prefix).
   * @param value - Record to persist.
   * @param ttlMs - Time-to-live in milliseconds.
   */
  async set(
    key: string,
    value: SharedCounterRecord,
    ttlMs: number,
  ): Promise<void> {
    await this.redis.set(
      prefixedRedisKey(this.prefix, key),
      JSON.stringify(value),
      'EX',
      this.ttlSeconds(ttlMs),
    );
  }

  /**
   * Deletes the counter for `key`.
   * @param key - Logical counter key (without Redis key prefix).
   */
  async delete(key: string): Promise<void> {
    await this.redis.del(prefixedRedisKey(this.prefix, key));
  }

  /**
   * Atomically loads, transforms, and persists (or deletes) via Redis WATCH/MULTI/EXEC.
   * Retries on concurrent modification (up to {@link MUTATE_MAX_RETRIES}).
   * Application `fn` runs in Node between WATCH and EXEC; atomicity comes from
   * aborting EXEC when the watched key changed — not from a Lua script.
   *
   * Each attempt wraps the WATCH path in `try/finally` so `unwatch()` always runs
   * if WATCH was started and EXEC did not clear it (e.g. `commandTimeout` on GET
   * or EXEC). Leaving a shared ioredis client in a watched state would poison
   * later mutates with spurious conflicts.
   * @param key - Logical counter key (without Redis key prefix).
   * @param ttlMs - TTL for the persisted record when `fn` returns a value.
   * @param fn - Transform current record (null if missing) → next, or null to delete.
   * @returns The record after mutate, or null if deleted / fn returned null.
   */
  async mutate(
    key: string,
    ttlMs: number,
    fn: (current: SharedCounterRecord | null) => SharedCounterRecord | null,
  ): Promise<SharedCounterRecord | null> {
    const redisKey = prefixedRedisKey(this.prefix, key);

    for (let attempt = 0; attempt < MUTATE_MAX_RETRIES; attempt++) {
      let watching = false;
      try {
        await this.redis.watch(redisKey);
        watching = true;
        const raw = await this.redis.get(redisKey);
        const current =
          raw == null ? null : (JSON.parse(raw) as SharedCounterRecord);
        const next = fn(current);

        if (next === null && current === null) {
          await this.redis.unwatch();
          watching = false;
          return null;
        }

        const multi = this.redis.multi();
        if (next === null) {
          multi.del(redisKey);
        } else {
          multi.set(
            redisKey,
            JSON.stringify(next),
            'EX',
            this.ttlSeconds(ttlMs),
          );
        }

        const execResult = await multi.exec();
        // Successful or conflicting EXEC clears the client's WATCH state.
        watching = false;
        if (execResult !== null) {
          return next;
        }
        // WATCH conflict: key changed between WATCH and EXEC — retry.
      } finally {
        if (watching) {
          await this.safeUnwatch();
        }
      }
    }

    throw new Error(
      `Redis mutate failed after ${MUTATE_MAX_RETRIES} retries for key=${key}`,
    );
  }
}
