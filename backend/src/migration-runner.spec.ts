import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { runMigrations } from './migration-runner';
import { AdminS3Keys1730200000000 } from './migrations/1730200000000-AdminS3Keys';

describe('runMigrations', () => {
  const envBackup = { ...process.env };
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'lv-s3-migrations-'));
    process.env = {
      ...envBackup,
      DATABASE_PATH: join(temporaryDirectory, 'app.db'),
    };
    delete process.env.DATABASE_URL;
  });

  afterEach(async () => {
    process.env = { ...envBackup };
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('resolves SQLite options and applies every migration idempotently', async () => {
    await runMigrations();
    await runMigrations();

    const dataSource = new DataSource({
      type: 'sqlite',
      database: process.env.DATABASE_PATH!,
    });
    await dataSource.initialize();
    const queryRunner = dataSource.createQueryRunner();

    try {
      const tables = await queryRunner.getTables([
        'admin_users',
        'refresh_tokens',
        'service_accounts',
        'multipart_uploads',
        'multipart_parts',
        'audit_logs',
        'used_refresh_tokens',
        'shared_counters',
        'iam_policies',
        'service_account_policies',
        'typeorm_migrations',
      ]);

      expect(tables).toHaveLength(11);
      expect(
        await dataSource.query(
          'SELECT COUNT(*) AS "count" FROM "typeorm_migrations"',
        ),
      ).toEqual([{ count: 10 }]);

      const largeSize = 50 * 1024 * 1024 * 1024;
      await dataSource.query(
        `INSERT INTO "multipart_uploads"
          ("upload_id", "bucket", "object_key", "part_size", "total_size")
         VALUES (?, ?, ?, ?, ?)`,
        ['large-upload', 'my-bucket', 'large.bin', largeSize, largeSize],
      );
      await expect(
        dataSource.query(
          `SELECT "part_size", "total_size"
           FROM "multipart_uploads" WHERE "upload_id" = ?`,
          ['large-upload'],
        ),
      ).resolves.toEqual([
        {
          part_size: largeSize,
          total_size: largeSize,
        },
      ]);
    } finally {
      await queryRunner.release();
      await dataSource.destroy();
    }
  });

  it('rolls back admin S3 key columns before reapplying the migration', async () => {
    const dataSource = new DataSource({
      type: 'sqlite',
      database: process.env.DATABASE_PATH!,
    });
    await dataSource.initialize();
    const queryRunner = dataSource.createQueryRunner();
    const migration = new AdminS3Keys1730200000000();

    try {
      await queryRunner.query(
        'CREATE TABLE "admin_users" ("id" integer PRIMARY KEY)',
      );
      await migration.up(queryRunner);
      await migration.down(queryRunner);

      const rolledBackTable = await queryRunner.getTable('admin_users');
      expect(
        rolledBackTable?.findColumnByName('admin_s3_access_key'),
      ).toBeUndefined();
      expect(
        rolledBackTable?.findColumnByName('admin_s3_secret_encrypted'),
      ).toBeUndefined();

      await migration.up(queryRunner);
      const reappliedTable = await queryRunner.getTable('admin_users');
      expect(
        reappliedTable?.findColumnByName('admin_s3_access_key'),
      ).toBeDefined();
      expect(
        reappliedTable?.findColumnByName('admin_s3_secret_encrypted'),
      ).toBeDefined();
    } finally {
      await queryRunner.release();
      await dataSource.destroy();
    }
  });
});
