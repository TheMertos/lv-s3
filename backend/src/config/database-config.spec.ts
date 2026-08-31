import { resolveDatabaseOptions } from './database-config';

describe('resolveDatabaseOptions', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('returns postgres when DATABASE_URL is set', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/app';
    delete process.env.DATABASE_PATH;

    expect(resolveDatabaseOptions()).toEqual({
      type: 'postgres',
      url: 'postgres://user:pass@localhost:5432/app',
    });
  });

  it('returns sqlite with default path when DATABASE_URL is unset', () => {
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_PATH;

    expect(resolveDatabaseOptions()).toEqual({
      type: 'sqlite',
      database: './data/app.db',
    });
  });

  it('returns sqlite with DATABASE_PATH override when DATABASE_URL is unset', () => {
    delete process.env.DATABASE_URL;
    process.env.DATABASE_PATH = '/tmp/custom.db';

    expect(resolveDatabaseOptions()).toEqual({
      type: 'sqlite',
      database: '/tmp/custom.db',
    });
  });

  it('prefers postgres when DATABASE_URL is non-empty even if DATABASE_PATH is set', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/app';
    process.env.DATABASE_PATH = '/tmp/ignored.db';

    expect(resolveDatabaseOptions()).toEqual({
      type: 'postgres',
      url: 'postgres://user:pass@localhost:5432/app',
    });
  });
});
