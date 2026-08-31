import { MigrationInterface, QueryRunner } from 'typeorm';
import { getMigrationSqlFragments } from './migration-dialect';

/**
 * Adds shared_counters table for multi-instance lockout / throttle state.
 */
export class SharedCounters1730700000000 implements MigrationInterface {
  name = 'SharedCounters1730700000000';

  /**
   * Creates the shared_counters table (SQLite + Postgres portable types).
   * @param queryRunner - Active migration query runner.
   * @returns Promise resolved after the table is created.
   */
  async up(queryRunner: QueryRunner): Promise<void> {
    const sql = getMigrationSqlFragments(queryRunner.connection.options.type);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shared_counters" (
        "key" varchar(191) PRIMARY KEY NOT NULL,
        "failures" integer NOT NULL,
        "first_at" ${sql.largeIntegerType} NOT NULL,
        "locked_until" ${sql.largeIntegerType} NOT NULL,
        "expires_at" ${sql.largeIntegerType} NOT NULL
      )
    `);
  }

  /**
   * Drops the shared_counters table.
   * @param queryRunner - Active migration query runner.
   * @returns Promise resolved after the table is dropped.
   */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "shared_counters"`);
  }
}
