import { MigrationInterface, QueryRunner } from 'typeorm';
import { getMigrationSqlFragments } from './migration-dialect';

/**
 * Initial schema for admin auth and S3 service accounts.
 */
export class InitialSchema1730000000000 implements MigrationInterface {
  name = 'InitialSchema1730000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const sql = getMigrationSqlFragments(queryRunner.connection.options.type);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_users" (
        "id" ${sql.generatedPrimaryKey},
        "uuid" varchar(36) NOT NULL,
        "username" varchar(255) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "role" varchar(32) NOT NULL DEFAULT 'admin',
        "created_at" ${sql.dateTimeType} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UQ_admin_uuid" UNIQUE ("uuid"),
        CONSTRAINT "UQ_admin_username" UNIQUE ("username")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refresh_tokens" (
        "id" ${sql.generatedPrimaryKey},
        "user_id" integer NOT NULL,
        "token_hash" varchar(64) NOT NULL,
        "expires_at" ${sql.dateTimeType} NOT NULL,
        "created_at" ${sql.dateTimeType} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FK_refresh_user" FOREIGN KEY ("user_id") REFERENCES "admin_users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "service_accounts" (
        "id" ${sql.generatedPrimaryKey},
        "access_key" varchar(64) NOT NULL,
        "secret_encrypted" text NOT NULL,
        "label" varchar(255),
        "disabled" boolean NOT NULL DEFAULT ${sql.booleanFalse},
        "created_at" ${sql.dateTimeType} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UQ_service_access_key" UNIQUE ("access_key")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "service_accounts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_users"`);
  }
}
