import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Renames admin_users.email → username (existing DBs). No-op if already username.
 */
export class AdminUsername1730100000000 implements MigrationInterface {
  name = 'AdminUsername1730100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('admin_users');
    if (!table) return;
    if (
      table.findColumnByName('email') &&
      !table.findColumnByName('username')
    ) {
      await queryRunner.renameColumn(
        'admin_users',
        'email',
        new TableColumn({
          name: 'username',
          type: 'varchar',
          length: '255',
          isUnique: true,
          isNullable: false,
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('admin_users');
    if (
      table?.findColumnByName('username') &&
      !table.findColumnByName('email')
    ) {
      await queryRunner.renameColumn(
        'admin_users',
        'username',
        new TableColumn({
          name: 'email',
          type: 'varchar',
          length: '255',
          isUnique: true,
          isNullable: false,
        }),
      );
    }
  }
}
