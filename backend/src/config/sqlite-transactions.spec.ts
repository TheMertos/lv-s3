import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { makeSqliteTransactionsSafe } from './database-config';

describe('makeSqliteTransactionsSafe', () => {
  let dir: string;
  let first: DataSource;
  let second: DataSource;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lv-s3-sqlite-'));
    const options = {
      type: 'sqlite' as const,
      database: path.join(dir, 'app.db'),
      enableWAL: true,
      busyTimeout: 5000,
    };
    first = await new DataSource(options).initialize();
    second = await new DataSource(options).initialize();
    await first.query(
      'CREATE TABLE counters (key TEXT PRIMARY KEY, hits INTEGER)',
    );
  });

  afterEach(async () => {
    await first.destroy();
    await second.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('lets a read-then-write transaction wait for the other connection instead of failing with SQLITE_BUSY', async () => {
    makeSqliteTransactionsSafe();
    let otherWrite: Promise<unknown> = Promise.resolve();
    // The throttle counter's pattern: read, then write, while the other app's connection writes in between.
    await first.transaction(async (em) => {
      await em.query('SELECT hits FROM counters WHERE key = ?', ['a']);
      otherWrite = second.query("INSERT INTO counters VALUES ('b', 1)");
      await new Promise((resolve) => setTimeout(resolve, 50));
      await em.query("INSERT INTO counters VALUES ('a', 1)");
    });
    await otherWrite;

    expect(await second.query('SELECT key FROM counters ORDER BY key')).toEqual(
      [{ key: 'a' }, { key: 'b' }],
    );
  });

  it('runs transactions on one shared connection one after another instead of nesting them', async () => {
    makeSqliteTransactionsSafe();
    const order: string[] = [];
    const run = (key: string) =>
      first.transaction(async (em) => {
        order.push(`begin ${key}`);
        await em.query('SELECT hits FROM counters WHERE key = ?', [key]);
        await new Promise((resolve) => setTimeout(resolve, 20));
        await em.query('INSERT INTO counters VALUES (?, 1)', [key]);
        order.push(`end ${key}`);
      });
    const failing = first
      .transaction(async (em) => {
        await em.query("INSERT INTO counters VALUES ('x', 1)");
        throw new Error('rolled back');
      })
      .catch((error: Error) => error.message);

    await Promise.all([run('a'), failing, run('b')]);

    expect(await failing).toBe('rolled back');
    expect(order).toEqual(['begin a', 'end a', 'begin b', 'end b']);
    expect(await first.query('SELECT key FROM counters ORDER BY key')).toEqual([
      { key: 'a' },
      { key: 'b' },
    ]);
  });
});
