import { AsyncLocalStorage } from 'async_hooks';
import { EntityManager } from 'typeorm';
import { SqliteQueryRunner } from 'typeorm/driver/sqlite/SqliteQueryRunner';

export type LvDatabaseOptions =
  | {
      type: 'sqlite';
      database: string;
      enableWAL: boolean;
      busyTimeout: number;
    }
  | { type: 'postgres'; url: string };

const DEFAULT_SQLITE_PATH = './data/app.db';

/**
 * How long a SQLite write waits for the file lock before failing with SQLITE_BUSY, in milliseconds.
 * The admin and S3 apps each open their own connection to the same file, and every S3 request
 * writes a throttle counter, so parallel uploads contend for the lock constantly.
 */
const DEFAULT_SQLITE_BUSY_TIMEOUT_MS = 5000;

/**
 * Resolves control-plane DB options from environment variables.
 * SQLite runs in WAL mode, so reads never wait for a writer, and with a busy timeout, so a write
 * waits for the other connection instead of failing at once.
 * @returns Postgres when DATABASE_URL is set; otherwise SQLite at DATABASE_PATH.
 */
export function resolveDatabaseOptions(): LvDatabaseOptions {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl) {
    return { type: 'postgres', url: databaseUrl };
  }

  const busyTimeout = parseInt(process.env.SQLITE_BUSY_TIMEOUT_MS ?? '', 10);
  return {
    type: 'sqlite',
    database: process.env.DATABASE_PATH ?? DEFAULT_SQLITE_PATH,
    enableWAL: true,
    busyTimeout: busyTimeout > 0 ? busyTimeout : DEFAULT_SQLITE_BUSY_TIMEOUT_MS,
  };
}

let sqliteTransactionsPatched = false;
/** Settles when the SQLite transaction running in this process ends; the next one waits for it. */
let sqliteTransactionTail: Promise<void> = Promise.resolve();
/** Set inside a transaction's callback, so a transaction started from there nests instead of waiting for itself. */
const insideSqliteTransaction = new AsyncLocalStorage<true>();

/**
 * Makes SQLite transactions safe when the admin and S3 apps share one connection, and when another process opens the file.
 * - One transaction at a time per process: TypeORM gives every caller the connection's single query runner, so a second
 *   request's transaction would run inside the first one, or fail with "cannot start a transaction within a
 *   transaction". Later transactions wait their turn; one started from inside a transaction nests as before.
 * - `BEGIN IMMEDIATE` instead of TypeORM's deferred `BEGIN`: a transaction that reads and then writes, such as the
 *   throttle counter or a refresh-token rotation, would otherwise fail at once with SQLITE_BUSY when another process
 *   wrote in between, because SQLite cannot upgrade a stale read snapshot and skips the busy timeout. Taking the write
 *   lock up front lets it wait for the busy timeout instead.
 * Applies to every SQLite data source in the process; calling it again does nothing.
 */
export function makeSqliteTransactionsSafe(): void {
  if (sqliteTransactionsPatched) return;
  sqliteTransactionsPatched = true;
  const { query } = SqliteQueryRunner.prototype;
  SqliteQueryRunner.prototype.query = function (
    this: InstanceType<typeof SqliteQueryRunner>,
    sql: string,
    ...rest: unknown[]
  ) {
    return (query as (...args: unknown[]) => Promise<unknown>).call(
      this,
      sql === 'BEGIN TRANSACTION' ? 'BEGIN IMMEDIATE TRANSACTION' : sql,
      ...rest,
    );
  } as typeof query;

  const { transaction } = EntityManager.prototype;
  EntityManager.prototype.transaction = async function (
    this: EntityManager,
    ...args: unknown[]
  ) {
    const run = () =>
      (transaction as (...a: unknown[]) => Promise<unknown>).apply(this, args);
    if (
      this.connection.options.type !== 'sqlite' ||
      this.queryRunner ||
      insideSqliteTransaction.getStore()
    ) {
      return run();
    }
    const before = sqliteTransactionTail;
    let done!: () => void;
    sqliteTransactionTail = new Promise<void>((resolve) => (done = resolve));
    await before;
    try {
      return await insideSqliteTransaction.run(true, run);
    } finally {
      done();
    }
  } as typeof transaction;
}
