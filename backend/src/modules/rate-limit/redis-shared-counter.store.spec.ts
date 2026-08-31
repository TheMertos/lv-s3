import { resolveRedisKeyPrefix } from './redis-key-prefix';
import { RedisSharedCounterStore } from './redis-shared-counter.store';
import type { SharedCounterRecord } from './shared-counter-store';

/**
 * Minimal Redis client surface used by RedisSharedCounterStore.
 */
type FakeRedis = {
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  watch: jest.Mock;
  unwatch: jest.Mock;
  multi: jest.Mock;
};

/**
 * Builds a chainable MULTI fake that records ops and resolves EXEC.
 * @param execResult - Value returned by `exec` (`null` = WATCH conflict).
 * @returns Multi double with set/del/exec mocks.
 */
function createMulti(execResult: unknown[] | null = []) {
  const multi = {
    set: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(execResult),
  };
  return multi;
}

/**
 * Builds a store with a fake Redis client and default `lv-s3:` prefix.
 * @param overrides - Optional Redis method doubles / prefix override.
 * @returns Store, redis mocks, and resolved prefix.
 */
function createStore(overrides?: {
  get?: jest.Mock;
  set?: jest.Mock;
  del?: jest.Mock;
  watch?: jest.Mock;
  unwatch?: jest.Mock;
  multi?: jest.Mock;
  prefix?: string;
}) {
  const redis: FakeRedis = {
    get: overrides?.get ?? jest.fn().mockResolvedValue(null),
    set: overrides?.set ?? jest.fn().mockResolvedValue('OK'),
    del: overrides?.del ?? jest.fn().mockResolvedValue(1),
    watch: overrides?.watch ?? jest.fn().mockResolvedValue('OK'),
    unwatch: overrides?.unwatch ?? jest.fn().mockResolvedValue('OK'),
    multi: overrides?.multi ?? jest.fn().mockReturnValue(createMulti()),
  };
  const prefix = overrides?.prefix ?? resolveRedisKeyPrefix();
  return {
    store: new RedisSharedCounterStore(redis, prefix),
    redis,
    prefix,
  };
}

/**
 * Collects every Redis key argument passed to get/set/del/watch.
 * @param redis - Fake Redis with jest mocks.
 * @returns Flat list of key strings used in Redis calls.
 */
function collectUsedKeys(redis: FakeRedis): string[] {
  const keys: string[] = [];
  for (const call of redis.get.mock.calls) {
    keys.push(call[0] as string);
  }
  for (const call of redis.set.mock.calls) {
    keys.push(call[0] as string);
  }
  for (const call of redis.del.mock.calls) {
    keys.push(call[0] as string);
  }
  for (const call of redis.watch.mock.calls) {
    keys.push(call[0] as string);
  }
  return keys;
}

describe('RedisSharedCounterStore', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('key prefix', () => {
    it('uses only keys starting with the default lv-s3: prefix', async () => {
      const record: SharedCounterRecord = {
        failures: 1,
        firstAt: 1000,
        lockedUntil: 0,
      };
      const { store, redis, prefix } = createStore();

      await store.set('lockout:ip:1.2.3.4', record, 60_000);
      await store.get('lockout:ip:1.2.3.4');
      await store.delete('lockout:ip:1.2.3.4');

      const keys = collectUsedKeys(redis);
      expect(keys.length).toBeGreaterThan(0);
      expect(prefix).toBe('lv-s3:');
      for (const key of keys) {
        expect(key.startsWith(prefix)).toBe(true);
      }
    });

    it('uses only keys starting with a configured custom prefix', async () => {
      const prefix = resolveRedisKeyPrefix('app-prod');
      const { store, redis } = createStore({ prefix });

      await store.set(
        'lockout:user:admin',
        { failures: 2, firstAt: 1, lockedUntil: 0 },
        1500,
      );
      await store.get('lockout:user:admin');
      await store.delete('lockout:user:admin');

      const keys = collectUsedKeys(redis);
      expect(prefix).toBe('app-prod:');
      for (const key of keys) {
        expect(key.startsWith(prefix)).toBe(true);
      }
    });
  });

  describe('get', () => {
    it('returns null when the key is missing', async () => {
      const { store, redis } = createStore({
        get: jest.fn().mockResolvedValue(null),
      });

      await expect(store.get('lockout:ip:1.2.3.4')).resolves.toBeNull();
      expect(redis.get).toHaveBeenCalledWith('lv-s3:lockout:ip:1.2.3.4');
    });

    it('parses and returns a stored JSON record', async () => {
      const record: SharedCounterRecord = {
        failures: 3,
        firstAt: 100,
        lockedUntil: 200,
      };
      const { store, redis } = createStore({
        get: jest.fn().mockResolvedValue(JSON.stringify(record)),
      });

      await expect(store.get('lockout:user:admin')).resolves.toEqual(record);
      expect(redis.get).toHaveBeenCalledWith('lv-s3:lockout:user:admin');
    });
  });

  describe('set', () => {
    it('SETs JSON with EX = ceil(ttlMs/1000), minimum 1', async () => {
      const record: SharedCounterRecord = {
        failures: 1,
        firstAt: 50,
        lockedUntil: 0,
      };
      const { store, redis } = createStore();

      await store.set('lockout:ip:10.0.0.1', record, 1500);

      expect(redis.set).toHaveBeenCalledWith(
        'lv-s3:lockout:ip:10.0.0.1',
        JSON.stringify(record),
        'EX',
        2,
      );
    });

    it('uses EX 1 when ttlMs is below one second', async () => {
      const record: SharedCounterRecord = {
        failures: 0,
        firstAt: 1,
        lockedUntil: 0,
      };
      const { store, redis } = createStore();

      await store.set('lockout:ip:9.9.9.9', record, 100);

      expect(redis.set).toHaveBeenCalledWith(
        'lv-s3:lockout:ip:9.9.9.9',
        JSON.stringify(record),
        'EX',
        1,
      );
    });
  });

  describe('delete', () => {
    it('DELs the prefixed key', async () => {
      const { store, redis } = createStore();

      await store.delete('lockout:user:admin');

      expect(redis.del).toHaveBeenCalledWith('lv-s3:lockout:user:admin');
    });
  });

  describe('mutate', () => {
    it('WATCH/GET then MULTI SET and returns next on successful EXEC', async () => {
      const multi = createMulti([['OK']]);
      const { store, redis } = createStore({
        get: jest.fn().mockResolvedValue(null),
        multi: jest.fn().mockReturnValue(multi),
      });

      const next = await store.mutate('lockout:ip:1.1.1.1', 1500, (cur) => ({
        failures: (cur?.failures ?? 0) + 1,
        firstAt: 10,
        lockedUntil: 0,
      }));

      expect(redis.watch).toHaveBeenCalledWith('lv-s3:lockout:ip:1.1.1.1');
      expect(multi.set).toHaveBeenCalledWith(
        'lv-s3:lockout:ip:1.1.1.1',
        JSON.stringify({ failures: 1, firstAt: 10, lockedUntil: 0 }),
        'EX',
        2,
      );
      expect(multi.exec).toHaveBeenCalled();
      expect(next).toEqual({ failures: 1, firstAt: 10, lockedUntil: 0 });
    });

    it('retries when EXEC returns null then succeeds', async () => {
      const failMulti = createMulti(null);
      const okMulti = createMulti([['OK']]);
      const multi = jest
        .fn()
        .mockReturnValueOnce(failMulti)
        .mockReturnValueOnce(okMulti);
      const { store } = createStore({
        get: jest
          .fn()
          .mockResolvedValue(
            JSON.stringify({ failures: 1, firstAt: 1, lockedUntil: 0 }),
          ),
        multi,
      });

      const next = await store.mutate('k', 60_000, (cur) => ({
        failures: (cur?.failures ?? 0) + 1,
        firstAt: cur?.firstAt ?? 1,
        lockedUntil: 0,
      }));

      expect(multi).toHaveBeenCalledTimes(2);
      expect(next?.failures).toBe(2);
    });

    it('unwatches and returns null when missing and fn deletes', async () => {
      const { store, redis } = createStore({
        get: jest.fn().mockResolvedValue(null),
      });

      await expect(store.mutate('k', 60_000, () => null)).resolves.toBeNull();
      expect(redis.unwatch).toHaveBeenCalled();
      expect(redis.multi).not.toHaveBeenCalled();
    });

    it('unwatches in finally when get throws after WATCH (timeout leak)', async () => {
      const { store, redis } = createStore({
        get: jest.fn().mockRejectedValue(new Error('Command timed out')),
      });

      await expect(
        store.mutate('k', 60_000, (cur) => ({
          failures: (cur?.failures ?? 0) + 1,
          firstAt: 1,
          lockedUntil: 0,
        })),
      ).rejects.toThrow('Command timed out');

      expect(redis.watch).toHaveBeenCalled();
      expect(redis.unwatch).toHaveBeenCalled();
    });

    it('unwatches in finally when MULTI EXEC throws after WATCH', async () => {
      const multi = {
        set: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('Command timed out')),
      };
      const { store, redis } = createStore({
        get: jest.fn().mockResolvedValue(null),
        multi: jest.fn().mockReturnValue(multi),
      });

      await expect(
        store.mutate('k', 60_000, () => ({
          failures: 1,
          firstAt: 1,
          lockedUntil: 0,
        })),
      ).rejects.toThrow('Command timed out');

      expect(redis.watch).toHaveBeenCalled();
      expect(redis.unwatch).toHaveBeenCalled();
    });
  });
});
