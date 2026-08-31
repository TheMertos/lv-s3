import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { SharedCounterEntity } from '../../entities/shared-counter.entity';
import { DbSharedCounterStore } from './db-shared-counter.store';

/**
 * Builds a store with a mocked TypeORM repository.
 * @param overrides - Optional repository method doubles.
 * @returns Store instance and repository mocks.
 */
function createStore(overrides?: {
  findOne?: jest.Mock;
  save?: jest.Mock;
  delete?: jest.Mock;
  transaction?: jest.Mock;
  connectionType?: string;
}) {
  const findOne = overrides?.findOne ?? jest.fn();
  const save = overrides?.save ?? jest.fn().mockResolvedValue(undefined);
  const deleteFn = overrides?.delete ?? jest.fn().mockResolvedValue(undefined);
  const transaction =
    overrides?.transaction ??
    jest.fn(async (fn: (manager: unknown) => Promise<unknown>) => {
      const manager = {
        getRepository: () => ({
          createQueryBuilder: () => {
            const qb = {
              where: jest.fn().mockReturnThis(),
              setLock: jest.fn().mockReturnThis(),
              getOne: findOne,
            };
            return qb;
          },
          save,
          delete: deleteFn,
        }),
      };
      return fn(manager);
    });

  const repo = {
    findOne,
    save,
    delete: deleteFn,
    manager: {
      transaction,
      connection: { options: { type: overrides?.connectionType ?? 'sqlite' } },
    },
  } as unknown as Repository<SharedCounterEntity>;

  return {
    store: new DbSharedCounterStore(repo),
    findOne,
    save,
    delete: deleteFn,
    transaction,
  };
}

/**
 * Builds an in-memory SQLite DataSource + DbSharedCounterStore for integration tests.
 * @returns Initialized data source and store.
 */
async function createSqliteStore(): Promise<{
  dataSource: DataSource;
  store: DbSharedCounterStore;
}> {
  const dataSource = new DataSource({
    type: 'sqlite',
    database: ':memory:',
    entities: [SharedCounterEntity],
    synchronize: true,
  });
  await dataSource.initialize();
  return {
    dataSource,
    store: new DbSharedCounterStore(
      dataSource.getRepository(SharedCounterEntity),
    ),
  };
}

describe('DbSharedCounterStore', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('returns null when the row is missing', async () => {
      const { store, findOne } = createStore({
        findOne: jest.fn().mockResolvedValue(null),
      });

      await expect(store.get('lockout:ip:1.2.3.4')).resolves.toBeNull();
      expect(findOne).toHaveBeenCalledWith({
        where: { key: 'lockout:ip:1.2.3.4' },
      });
    });

    it('returns null when expiresAt is in the past', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-31T12:00:00.000Z'));
      const { store } = createStore({
        findOne: jest.fn().mockResolvedValue({
          key: 'lockout:user:admin',
          failures: 3,
          firstAt: 1,
          lockedUntil: 0,
          expiresAt: Date.now() - 1,
        }),
      });

      await expect(store.get('lockout:user:admin')).resolves.toBeNull();
    });

    it('returns the record when the row is still valid', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-31T12:00:00.000Z'));
      const now = Date.now();
      const { store } = createStore({
        findOne: jest.fn().mockResolvedValue({
          key: 'lockout:ip:10.0.0.1',
          failures: 2,
          firstAt: now - 1000,
          lockedUntil: now + 60_000,
          expiresAt: now + 120_000,
        }),
      });

      await expect(store.get('lockout:ip:10.0.0.1')).resolves.toEqual({
        failures: 2,
        firstAt: now - 1000,
        lockedUntil: now + 60_000,
      });
    });
  });

  describe('set', () => {
    it('upserts the row with expiresAt = now + ttlMs', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-31T12:00:00.000Z'));
      const now = Date.now();
      const { store, save } = createStore();

      await store.set(
        'lockout:ip:1.2.3.4',
        { failures: 1, firstAt: now, lockedUntil: 0 },
        5 * 60_000,
      );

      expect(save).toHaveBeenCalledWith({
        key: 'lockout:ip:1.2.3.4',
        failures: 1,
        firstAt: now,
        lockedUntil: 0,
        expiresAt: now + 5 * 60_000,
      });
    });
  });

  describe('delete', () => {
    it('removes the row by key', async () => {
      const { store, delete: deleteFn } = createStore();

      await store.delete('lockout:user:admin');

      expect(deleteFn).toHaveBeenCalledWith({ key: 'lockout:user:admin' });
    });
  });

  describe('mutate', () => {
    it('runs inside a transaction and persists fn result', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-31T12:00:00.000Z'));
      const now = Date.now();
      const { store, save, transaction } = createStore({
        findOne: jest.fn().mockResolvedValue(null),
      });

      const result = await store.mutate('k', 60_000, (cur) => ({
        failures: (cur?.failures ?? 0) + 1,
        firstAt: now,
        lockedUntil: 0,
      }));

      expect(transaction).toHaveBeenCalled();
      expect(result).toEqual({ failures: 1, firstAt: now, lockedUntil: 0 });
      expect(save).toHaveBeenCalledWith({
        key: 'k',
        failures: 1,
        firstAt: now,
        lockedUntil: 0,
        expiresAt: now + 60_000,
      });
    });

    it('deletes when fn returns null and a row existed', async () => {
      const now = Date.now();
      const { store, delete: deleteFn } = createStore({
        findOne: jest.fn().mockResolvedValue({
          key: 'k',
          failures: 1,
          firstAt: now,
          lockedUntil: 0,
          expiresAt: now + 60_000,
        }),
      });

      await expect(store.mutate('k', 60_000, () => null)).resolves.toBeNull();
      expect(deleteFn).toHaveBeenCalledWith({ key: 'k' });
    });

    it('concurrent mutates do not lose increments (sqlite)', async () => {
      const { dataSource, store } = await createSqliteStore();
      try {
        const parallel = 20;
        await Promise.all(
          Array.from({ length: parallel }, () =>
            store.mutate('race-key', 60_000, (cur) => ({
              failures: (cur?.failures ?? 0) + 1,
              firstAt: cur?.firstAt ?? Date.now(),
              lockedUntil: 0,
            })),
          ),
        );

        const final = await store.get('race-key');
        expect(final?.failures).toBe(parallel);
      } finally {
        await dataSource.destroy();
      }
    });

    it('retries Postgres mutate after unique-violation on cold-key INSERT', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-31T12:00:00.000Z'));
      const now = Date.now();
      const uniqueErr = new QueryFailedError(
        'INSERT',
        [],
        Object.assign(
          new Error('duplicate key value violates unique constraint'),
          {
            code: '23505',
          },
        ),
      );
      let calls = 0;
      const findOne = jest.fn().mockImplementation(async () => {
        // First attempt: cold key; after conflict loser reloads the winner's row.
        if (calls === 0) return null;
        return {
          key: 'cold',
          failures: 1,
          firstAt: now,
          lockedUntil: 0,
          expiresAt: now + 60_000,
        };
      });
      const save = jest.fn().mockImplementation(async () => {
        calls += 1;
        if (calls === 1) throw uniqueErr;
        return undefined;
      });
      const { store, transaction } = createStore({
        findOne,
        save,
        connectionType: 'postgres',
      });

      const result = await store.mutate('cold', 60_000, (cur) => ({
        failures: (cur?.failures ?? 0) + 1,
        firstAt: cur?.firstAt ?? now,
        lockedUntil: 0,
      }));

      expect(transaction).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ failures: 2, firstAt: now, lockedUntil: 0 });
      expect(save).toHaveBeenCalledTimes(2);
    });
  });
});
