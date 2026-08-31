import { MigrationInterface, QueryRunner } from 'typeorm';
import { getMigrationSqlFragments } from './migration-dialect';

/**
 * Adds used_refresh_tokens table for refresh token reuse detection.
 */
export class UsedRefreshTokens1730500000000 implements MigrationInterface {
  name = 'UsedRefreshTokens1730500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const sql = getMigrationSqlFragments(queryRunner.connection.options.type);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "used_refresh_tokens" (
        "token_hash" varchar(64) PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "created_at" ${sql.dateTimeType} NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_used_refresh_tokens_user_id"
      ON "used_refresh_tokens" ("user_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "used_refresh_tokens"`);
  }
}
