import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoginLockoutService } from './login-lockout.service';
import type {
  SharedCounterRecord,
  SharedCounterStore,
} from '../rate-limit/shared-counter-store';

/**
 * In-memory SharedCounterStore for lockout unit tests (ignores TTL).
 * @returns A Map-backed store implementing SharedCounterStore.
 */
function createMemoryStore(): SharedCounterStore {
  const map = new Map<string, SharedCounterRecord>();
  return {
    /**
     * @param key - Counter key.
     * @returns Stored record or null.
     */
    async get(key: string): Promise<SharedCounterRecord | null> {
      return map.get(key) ?? null;
    },
    /**
     * @param key - Counter key.
     * @param value - Record to store.
     * @param _ttlMs - Unused in the fake store.
     */
    async set(
      key: string,
      value: SharedCounterRecord,
      _ttlMs: number,
    ): Promise<void> {
      map.set(key, { ...value });
    },
    /**
     * @param key - Counter key to remove.
     */
    async delete(key: string): Promise<void> {
      map.delete(key);
    },
    /**
     * @param key - Counter key.
     * @param _ttlMs - Unused in the fake store.
     * @param fn - Transform current → next, or null to delete.
     * @returns Record after mutate, or null if deleted.
     */
    async mutate(
      key: string,
      _ttlMs: number,
      fn: (current: SharedCounterRecord | null) => SharedCounterRecord | null,
    ): Promise<SharedCounterRecord | null> {
      const next = fn(map.get(key) ?? null);
      if (next === null) {
        map.delete(key);
        return null;
      }
      map.set(key, { ...next });
      return next;
    },
  };
}

describe('LoginLockoutService', () => {
  const config = {
    get: (key: string, defaultValue?: string) => {
      const map: Record<string, string> = {
        ADMIN_LOGIN_MAX_ATTEMPTS: '3',
        ADMIN_LOGIN_LOCKOUT_MINUTES: '1',
        ADMIN_LOGIN_WINDOW_MINUTES: '15',
      };
      return map[key] ?? defaultValue;
    },
  } as ConfigService;

  let service: LoginLockoutService;

  beforeEach(() => {
    service = new LoginLockoutService(config, createMemoryStore());
  });

  it('allows login before max failures', async () => {
    await expect(
      service.assertNotLocked('1.2.3.4', 'admin'),
    ).resolves.toBeUndefined();
    await service.recordFailure('1.2.3.4', 'admin');
    await service.recordFailure('1.2.3.4', 'admin');
    await expect(
      service.assertNotLocked('1.2.3.4', 'admin'),
    ).resolves.toBeUndefined();
  });

  it('locks out after max failures', async () => {
    for (let i = 0; i < 3; i++) {
      await service.recordFailure('9.9.9.9', 'locked-user');
    }
    await expect(
      service.assertNotLocked('9.9.9.9', 'locked-user'),
    ).rejects.toThrow(HttpException);
    try {
      await service.assertNotLocked('9.9.9.9', 'locked-user');
    } catch (e) {
      const ex = e as HttpException;
      expect(ex.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const body = ex.getResponse() as {
        code: string;
        retryAfterSeconds: number;
      };
      expect(body.code).toBe('LOCKED_OUT');
      expect(body.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('clears failures on success', async () => {
    await service.recordFailure('8.8.8.8', 'user');
    await service.recordFailure('8.8.8.8', 'user');
    await service.recordSuccess('8.8.8.8', 'user');
    await expect(
      service.assertNotLocked('8.8.8.8', 'user'),
    ).resolves.toBeUndefined();
  });
});
