import { MigrationInterface, QueryRunner } from 'typeorm';
import { getMigrationSqlFragments } from './migration-dialect';

export class MultipartSchema1730300000000 implements MigrationInterface {
  name = 'MultipartSchema1730300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const sql = getMigrationSqlFragments(queryRunner.connection.options.type);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "multipart_uploads" (
        "id" ${sql.generatedPrimaryKey},
        "upload_id" varchar(64) NOT NULL,
        "bucket" varchar(255) NOT NULL,
        "object_key" text NOT NULL,
        "status" varchar(24) NOT NULL DEFAULT 'in_progress',
        "part_size" ${sql.largeIntegerType},
        "total_size" ${sql.largeIntegerType},
        "created_at" ${sql.dateTimeType} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" ${sql.dateTimeType} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UQ_multipart_upload_id" UNIQUE ("upload_id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "multipart_parts" (
        "id" ${sql.generatedPrimaryKey},
        "upload_ref_id" integer NOT NULL,
        "part_number" integer NOT NULL,
        "size" ${sql.largeIntegerType} NOT NULL,
        "etag" varchar(64) NOT NULL,
        "part_path" text NOT NULL,
        "created_at" ${sql.dateTimeType} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FK_multipart_upload_ref" FOREIGN KEY ("upload_ref_id")
          REFERENCES "multipart_uploads" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_multipart_part_unique"
      ON "multipart_parts" ("upload_ref_id", "part_number")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_multipart_upload_status"
      ON "multipart_uploads" ("status")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_multipart_upload_status"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_multipart_part_unique"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "multipart_parts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "multipart_uploads"`);
  }
}
