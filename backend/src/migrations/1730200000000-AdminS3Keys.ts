import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin users get S3 API keys (same identity as console + S3 SigV4).
 */
export class AdminS3Keys1730200000000 implements MigrationInterface {
  name = 'AdminS3Keys1730200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "admin_users" ADD COLUMN "admin_s3_access_key" varchar(64)
    `);
    await queryRunner.query(`
      ALTER TABLE "admin_users" ADD COLUMN "admin_s3_secret_encrypted" text
    `);
  }

  /**
   * Removes admin S3 credential columns when rolling the migration back.
   * @param queryRunner Active TypeORM migration query runner.
   * @returns A promise that resolves after existing credential columns are removed.
   */
  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('admin_users');
    if (!table) return;

    const secretColumn = table.findColumnByName('admin_s3_secret_encrypted');
    if (secretColumn) {
      await queryRunner.dropColumn(table, secretColumn);
    }

    const accessKeyColumn = table.findColumnByName('admin_s3_access_key');
    if (accessKeyColumn) {
      await queryRunner.dropColumn(table, accessKeyColumn);
    }
  }
}
