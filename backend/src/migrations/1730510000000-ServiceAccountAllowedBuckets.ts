import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds allowed_buckets column to service_accounts for bucket-scoped access.
 */
export class ServiceAccountAllowedBuckets1730510000000 implements MigrationInterface {
  name = 'ServiceAccountAllowedBuckets1730510000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "service_accounts"
      ADD COLUMN "allowed_buckets" text
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "service_accounts" DROP COLUMN "allowed_buckets"
    `);
  }
}
