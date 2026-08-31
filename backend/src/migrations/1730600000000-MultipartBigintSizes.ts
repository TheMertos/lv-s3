import { MigrationInterface, QueryRunner } from 'typeorm';

export class MultipartBigintSizes1730600000000 implements MigrationInterface {
  name = 'MultipartBigintSizes1730600000000';

  /**
   * Widens Postgres multipart byte counts; SQLite INTEGER is already signed 64-bit.
   * @param queryRunner - Active migration query runner.
   * @returns Promise resolved after columns are widened.
   */
  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;
    await queryRunner.query(`
      ALTER TABLE "multipart_uploads"
        ALTER COLUMN "part_size" TYPE bigint,
        ALTER COLUMN "total_size" TYPE bigint
    `);
    await queryRunner.query(`
      ALTER TABLE "multipart_parts"
        ALTER COLUMN "size" TYPE bigint
    `);
  }

  /**
   * Restores Postgres multipart byte counts to 32-bit integers.
   * @param queryRunner - Active migration query runner.
   * @returns Promise resolved after columns are narrowed.
   */
  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;
    await queryRunner.query(`
      ALTER TABLE "multipart_parts"
        ALTER COLUMN "size" TYPE integer
    `);
    await queryRunner.query(`
      ALTER TABLE "multipart_uploads"
        ALTER COLUMN "part_size" TYPE integer,
        ALTER COLUMN "total_size" TYPE integer
    `);
  }
}
