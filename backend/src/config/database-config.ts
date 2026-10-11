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
