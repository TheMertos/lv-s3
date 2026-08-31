import { MigrationInterface, QueryRunner } from 'typeorm';
import { getMigrationSqlFragments } from './migration-dialect';

/**
 * Adds audit_logs table for sensitive admin operation tracking.
 */
export class AuditLogSchema1730400000000 implements MigrationInterface {
  name = 'AuditLogSchema1730400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const sql = getMigrationSqlFragments(queryRunner.connection.options.type);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" ${sql.generatedPrimaryKey},
        "action" varchar(64) NOT NULL,
        "actor_type" varchar(16) NOT NULL DEFAULT 'admin',
        "actor_id" integer,
        "actor_name" varchar(255),
        "resource_type" varchar(64),
        "resource_id" varchar(255),
        "metadata" text,
        "ip" varchar(64),
        "correlation_id" varchar(128),
        "created_at" ${sql.dateTimeType} NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_action" ON "audit_logs" ("action")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_created_at" ON "audit_logs" ("created_at")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
  }
}
