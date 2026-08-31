import type {
  SharedCounterRecord,
  SharedCounterStore,
} from './shared-counter-store';
import { ThrottlerSharedStorage } from './throttler-shared.storage';

/**
 * In-memory SharedCounterStore that honors TTL via expiresAt.
 * @returns Fake store and a Map for assertions.
 */
function createFakeStore(): {
  store: SharedCounterStore;
  map: Map<string, SharedCounterRecord & { expiresAt: number }>;
} {
  const map = new Map<string, SharedCounterRecord & { expiresAt: number }>();
  return {
    map,
    store: {
      /**
       * @param key - Counter key.
       * @returns Record or null when missing / expired.
       */
      async get(key: string): Promise<SharedCounterRecord | null> {
        const row = map.get(key);
        if (!row || row.expiresAt < Date.now()) return null;
        return {
          failures: row.failures,
          firstAt: row.firstAt,
          lockedUntil: row.lockedUntil,
        };
      },
      /**
       * @param key - Counter key.
       * @param value - Record to store.
       * @param ttlMs - Time-to-live in milliseconds.
       */
      async set(
        key: string,
        value: SharedCounterRecord,
        ttlMs: number,
      ): Promise<void> {
        map.set(key, { ...value, expiresAt: Date.now() + ttlMs });
      },
      /**
       * @param key - Counter key to remove.
       */
      async delete(key: string): Promise<void> {
        map.delete(key);
      },
      /**
       * @param key - Counter key.
       * @param ttlMs - Time-to-live in milliseconds.
       * @param fn - Transform current → next, or null to delete.
       * @returns Record after mutate, or null if deleted.
       */
      async mutate(
        key: string,
        ttlMs: number,
        fn: (current: SharedCounterRecord | null) => SharedCounterRecord | null,
      ): Promise<SharedCounterRecord | null> {
        const row = map.get(key);
        const current =
          !row || row.expiresAt < Date.now()
            ? null
            : {
                failures: row.failures,
                firstAt: row.firstAt,
                lockedUntil: row.lockedUntil,
              };
        const next = fn(current);
        if (next === null) {
          map.delete(key);
          return null;
        }
        map.set(key, { ...next, expiresAt: Date.now() + ttlMs });
        return next;
      },
    },
  };
}

describe('ThrottlerSharedStorage', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('increments hits under the logical throttle key', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-31T12:00:00.000Z'));
    const { store, map } = createFakeStore();
    const storage = new ThrottlerSharedStorage(store);

    const first = await storage.increment(
      'ip-hash',
      60_000,
      3,
      60_000,
      'admin',
    );
    expect(first).toMatchObject({
      totalHits: 1,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    expect(first.timeToExpire).toBe(60);
    expect(map.has('throttle:admin:ip-hash')).toBe(true);
    expect(map.get('throttle:admin:ip-hash')?.failures).toBe(1);

    const second = await storage.increment(
      'ip-hash',
      60_000,
      3,
      60_000,
      'admin',
    );
    expect(second.totalHits).toBe(2);
    expect(second.isBlocked).toBe(false);
  });

  it('keeps admin and s3 counters on separate logical keys', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-31T12:00:00.000Z'));
    const { store, map } = createFakeStore();
    const storage = new ThrottlerSharedStorage(store);

    await storage.increment('ip-hash', 60_000, 120, 60_000, 'admin');
    await storage.increment('ip-hash', 60_000, 300, 60_000, 's3');
    await storage.increment('ip-hash', 60_000, 300, 60_000, 's3');

    expect(map.get('throttle:admin:ip-hash')?.failures).toBe(1);
    expect(map.get('throttle:s3:ip-hash')?.failures).toBe(2);
    expect(map.has('throttle:default:ip-hash')).toBe(false);
  });

  it('blocks when hits exceed limit and stops incrementing while blocked', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-31T12:00:00.000Z'));
    const { store, map } = createFakeStore();
    const storage = new ThrottlerSharedStorage(store);
    const ttl = 60_000;
    const limit = 2;
    const blockDuration = 30_000;

    await storage.increment('k', ttl, limit, blockDuration, 's3');
    await storage.increment('k', ttl, limit, blockDuration, 's3');
    const blocked = await storage.increment(
      'k',
      ttl,
      limit,
      blockDuration,
      's3',
    );

    expect(blocked.totalHits).toBe(3);
    expect(blocked.isBlocked).toBe(true);
    expect(blocked.timeToBlockExpire).toBe(30);
    expect(map.get('throttle:s3:k')?.lockedUntil).toBe(
      Date.now() + blockDuration,
    );

    const stillBlocked = await storage.increment(
      'k',
      ttl,
      limit,
      blockDuration,
      's3',
    );
    expect(stillBlocked.totalHits).toBe(3);
    expect(stillBlocked.isBlocked).toBe(true);
  });

  it('resets after block expiry and counts a fresh hit', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-31T12:00:00.000Z'));
    const { store } = createFakeStore();
    const storage = new ThrottlerSharedStorage(store);
    const ttl = 60_000;
    const limit = 1;
    const blockDuration = 10_000;

    await storage.increment('k', ttl, limit, blockDuration, 'admin');
    const blocked = await storage.increment(
      'k',
      ttl,
      limit,
      blockDuration,
      'admin',
    );
    expect(blocked.isBlocked).toBe(true);

    jest.advanceTimersByTime(blockDuration + 1);

    const after = await storage.increment(
      'k',
      ttl,
      limit,
      blockDuration,
      'admin',
    );
    expect(after.isBlocked).toBe(false);
    expect(after.totalHits).toBe(1);
    expect(after.timeToBlockExpire).toBe(0);
  });

  it('starts a new window after ttl when not blocked', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-31T12:00:00.000Z'));
    const { store, map } = createFakeStore();
    const storage = new ThrottlerSharedStorage(store);
    const ttl = 5_000;

    await storage.increment('k', ttl, 10, ttl, 'admin');
    await storage.increment('k', ttl, 10, ttl, 'admin');
    expect(map.get('throttle:admin:k')?.failures).toBe(2);

    jest.advanceTimersByTime(ttl + 1);

    const next = await storage.increment('k', ttl, 10, ttl, 'admin');
    expect(next.totalHits).toBe(1);
    expect(next.isBlocked).toBe(false);
  });
});
