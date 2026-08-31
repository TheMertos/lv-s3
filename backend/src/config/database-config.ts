export type LvDatabaseOptions =
  | { type: 'sqlite'; database: string }
  | { type: 'postgres'; url: string };

const DEFAULT_SQLITE_PATH = './data/app.db';

/**
 * Resolves control-plane DB options from environment variables.
 * @returns Postgres when DATABASE_URL is set; otherwise SQLite at DATABASE_PATH.
 */
export function resolveDatabaseOptions(): LvDatabaseOptions {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl) {
    return { type: 'postgres', url: databaseUrl };
  }

  return {
    type: 'sqlite',
    database: process.env.DATABASE_PATH ?? DEFAULT_SQLITE_PATH,
  };
}
