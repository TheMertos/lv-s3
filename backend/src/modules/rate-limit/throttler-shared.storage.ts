import type { ThrottlerStorage } from '@nestjs/throttler';
import type {
  SharedCounterRecord,
  SharedCounterStore,
} from './shared-counter-store';

/** Extra TTL so rows outlive the active window / block. */
const TTL_BUFFER_MS = 60_000;

/** Return shape of ThrottlerStorage.increment (@nestjs/throttler v6). */
type ThrottlerIncrementResult = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

/**
 * Nest `@nestjs/throttler` storage backed by SharedCounterStore (DB or Redis).
 * Hit counts map to `failures`; active blocks use `lockedUntil`.
 */
export class ThrottlerSharedStorage implements ThrottlerStorage {
  /**
   * @param store - Shared counter backend used across app replicas.
   */
  constructor(private readonly store: SharedCounterStore) {}

  /**
   * Builds the logical store key for a throttler tracker.
   * @param throttlerName - Named throttler from module config (e.g. `admin`, `s3`).
   * @param key - Tracker key from ThrottlerGuard.
   * @returns Logical key `throttle:{throttlerName}:{key}` (Redis prefix applied by store).
   */
  private logicalKey(throttlerName: string, key: string): string {
    return `throttle:${throttlerName}:${key}`;
  }

  /**
   * Ceil seconds remaining until `atMs`, floored at 0.
   * @param atMs - Target epoch ms.
   * @param now - Current epoch ms.
   * @returns Whole seconds until `atMs`.
   */
  private secondsUntil(atMs: number, now: number): number {
    return Math.max(0, Math.ceil((atMs - now) / 1000));
  }

  /**
   * Increments the hit counter for `key` and applies block when over `limit`.
   * Uses atomic store.mutate for hit/block transitions so concurrent increments
   * cannot lose counts. Matches `@nestjs/throttler` v6 `ThrottlerStorage.increment`.
   * @param key - Tracker key from the guard.
   * @param ttl - Window length in milliseconds.
   * @param limit - Max hits allowed in the window before block.
   * @param blockDuration - Block length in milliseconds when over limit.
   * @param throttlerName - Named throttler instance.
   * @returns Hit / block status for the guard (`timeToExpire` / `timeToBlockExpire` in seconds).
   */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerIncrementResult> {
    const now = Date.now();
    const storeKey = this.logicalKey(throttlerName, key);
    // Upper bound covering window + block so mutate can persist without a second pass.
    const mutateTtlMs = ttl + blockDuration + TTL_BUFFER_MS;

    let result: ThrottlerIncrementResult | null = null;

    await this.store.mutate(storeKey, mutateTtlMs, (record) => {
      // Active block: do not increment (mirrors ThrottlerStorageService).
      if (record && record.lockedUntil > now) {
        let firstAt = record.firstAt;
        let expiresAt = firstAt + ttl;
        let next: SharedCounterRecord = record;
        if (this.secondsUntil(expiresAt, now) <= 0) {
          firstAt = now;
          expiresAt = now + ttl;
          next = {
            failures: record.failures,
            firstAt,
            lockedUntil: record.lockedUntil,
          };
        }
        result = {
          totalHits: next.failures,
          timeToExpire: this.secondsUntil(expiresAt, now),
          isBlocked: true,
          timeToBlockExpire: this.secondsUntil(next.lockedUntil, now),
        };
        return next;
      }

      let working: SharedCounterRecord | null = record;

      // Block just expired: reset hits, then count this request.
      if (working && working.lockedUntil > 0 && working.lockedUntil <= now) {
        working = { failures: 0, firstAt: working.firstAt, lockedUntil: 0 };
      }

      // Missing record or fixed window expired → start a new window.
      if (!working || now - working.firstAt >= ttl) {
        working = { failures: 0, firstAt: now, lockedUntil: 0 };
      } else {
        // Window still open but display expiry elapsed (clock skew / prior refresh).
        const expiresAt = working.firstAt + ttl;
        if (this.secondsUntil(expiresAt, now) <= 0) {
          working = { ...working, firstAt: now };
        }
      }

      const totalHits = working.failures + 1;
      let lockedUntil = 0;
      let isBlocked = false;
      if (totalHits > limit) {
        isBlocked = true;
        lockedUntil = now + blockDuration;
      }

      const next: SharedCounterRecord = {
        failures: totalHits,
        firstAt: working.firstAt,
        lockedUntil,
      };
      const expiresAt = next.firstAt + ttl;
      result = {
        totalHits,
        timeToExpire: this.secondsUntil(expiresAt, now),
        isBlocked,
        timeToBlockExpire: isBlocked ? this.secondsUntil(lockedUntil, now) : 0,
      };
      return next;
    });

    if (!result) {
      throw new Error(
        `Throttler mutate produced no result for key=${storeKey}`,
      );
    }
    return result;
  }
}
