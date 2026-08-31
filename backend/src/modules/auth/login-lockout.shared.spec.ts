import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { SharedCounterEntity } from '../../entities/shared-counter.entity';
import { DbSharedCounterStore } from '../rate-limit/db-shared-counter.store';
import { LoginLockoutService } from './login-lockout.service';

/**
 * Builds a ConfigService stub with a low max-attempt threshold for fast tests.
 * @returns ConfigService double for LoginLockoutService.
 */
function createLockoutConfig(): ConfigService {
  return {
    get: (key: string, defaultValue?: string) => {
      const map: Record<string, string> = {
        ADMIN_LOGIN_MAX_ATTEMPTS: '3',
        ADMIN_LOGIN_LOCKOUT_MINUTES: '1',
        ADMIN_LOGIN_WINDOW_MINUTES: '15',
      };
      return map[key] ?? defaultValue;
    },
  } as ConfigService;
}

describe('LoginLockoutService shared store', () => {
  let dataSource: DataSource;
  let store: DbSharedCounterStore;
  let config: ConfigService;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [SharedCounterEntity],
      synchronize: true,
    });
    await dataSource.initialize();
    store = new DbSharedCounterStore(
      dataSource.getRepository(SharedCounterEntity),
    );
    config = createLockoutConfig();
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('instance B sees lockout recorded by instance A (shared DB store)', async () => {
    const a = new LoginLockoutService(config, store);
    const b = new LoginLockoutService(config, store);

    for (let i = 0; i < 3; i++) {
      await a.recordFailure('1.1.1.1', 'admin');
    }

    await expect(b.assertNotLocked('1.1.1.1', 'admin')).rejects.toThrow(
      HttpException,
    );
    try {
      await b.assertNotLocked('1.1.1.1', 'admin');
    } catch (e) {
      const ex = e as HttpException;
      expect(ex.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(ex.getResponse()).toMatchObject({ code: 'LOCKED_OUT' });
    }
  });
});
