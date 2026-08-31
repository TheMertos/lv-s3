import { MigrationInterface, QueryRunner } from 'typeorm';
import { getMigrationSqlFragments } from './migration-dialect';

/**
 * Adds iam_policies and service_account_policies for Phase C IAM.
 * Join table uses integer columns without FKs for SQLite/Postgres portability;
 * orphan cleanup is handled in the service layer on SA/policy delete.
 */
export class IamPolicies1730800000000 implements MigrationInterface {
  name = 'IamPolicies1730800000000';

  /**
   * Creates IAM policy storage and the SA↔policy join table.
   * @param queryRunner - Active migration query runner.
   * @returns Promise resolved after both tables (and indexes) exist.
   */
  async up(queryRunner: QueryRunner): Promise<void> {
    const sql = getMigrationSqlFragments(queryRunner.connection.options.type);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "iam_policies" (
        "id" ${sql.generatedPrimaryKey},
        "name" varchar(128) NOT NULL,
        "document" text NOT NULL,
        "created_at" ${sql.dateTimeType} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" ${sql.dateTimeType} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UQ_iam_policies_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "service_account_policies" (
        "service_account_id" integer NOT NULL,
        "policy_id" integer NOT NULL,
        PRIMARY KEY ("service_account_id", "policy_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sa_policies_service_account_id"
        ON "service_account_policies" ("service_account_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sa_policies_policy_id"
        ON "service_account_policies" ("policy_id")
    `);
  }

  /**
   * Drops the IAM policy tables (join first).
   * @param queryRunner - Active migration query runner.
   * @returns Promise resolved after both tables are dropped.
   */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "service_account_policies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "iam_policies"`);
  }
}
