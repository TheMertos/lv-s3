/**
 * Nest DI token for the shared counter store used by lockout and throttling.
 */
export const SHARED_COUNTER_STORE = Symbol('SHARED_COUNTER_STORE');

/**
 * Persisted lockout / failure counter record (epoch ms timestamps).
 */
export type SharedCounterRecord = {
  failures: number;
  firstAt: number; // epoch ms
  lockedUntil: number; // epoch ms, 0 if not locked
};

/**
 * Shared counter store for multi-instance login lockout.
 * Implementations may use DB or Redis; callers never touch storage directly.
 */
export interface SharedCounterStore {
  /**
   * Reads the counter record for `key`.
   * @param key - Logical counter key (without Redis key prefix).
   * @returns The stored record, or `null` when missing / expired.
   */
  get(key: string): Promise<SharedCounterRecord | null>;

  /**
   * Writes the counter record for `key` with a TTL.
   * @param key - Logical counter key (without Redis key prefix).
   * @param value - Record to persist (`failures`, `firstAt`, `lockedUntil`).
   * @param ttlMs - Time-to-live in milliseconds.
   */
  set(key: string, value: SharedCounterRecord, ttlMs: number): Promise<void>;

  /**
   * Deletes the counter for `key` (e.g. after successful login).
   * @param key - Logical counter key (without Redis key prefix).
   */
  delete(key: string): Promise<void>;

  /**
   * Atomically loads the record for `key`, applies `fn`, and persists the result (or deletes if fn returns null).
   * Concurrent mutates for the same key must not lose updates.
   * @param key - Logical counter key.
   * @param ttlMs - TTL for the persisted record when fn returns a value.
   * @param fn - Transform current record (null if missing/expired) → next record, or null to delete.
   * @returns The record after mutate, or null if deleted / fn returned null.
   */
  mutate(
    key: string,
    ttlMs: number,
    fn: (current: SharedCounterRecord | null) => SharedCounterRecord | null,
  ): Promise<SharedCounterRecord | null>;
}
