import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkOrderNotes1718300000000 implements MigrationInterface {
  name = 'AddWorkOrderNotes1718300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS notes text;`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE work_orders DROP COLUMN IF EXISTS notes;`);
  }
}
