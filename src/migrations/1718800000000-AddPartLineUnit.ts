import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Parts can now be measured in pieces or liters. Liters need a fractional qty, so
 * widen `qty` from int to numeric(12,3) and add a `unit` column ('pcs' default).
 */
export class AddPartLineUnit1718800000000 implements MigrationInterface {
  name = 'AddPartLineUnit1718800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE part_lines ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'pcs';`,
    );
    await q.query(
      `ALTER TABLE part_lines ALTER COLUMN qty TYPE numeric(12,3) USING qty::numeric;`,
    );
    await q.query(`ALTER TABLE part_lines ALTER COLUMN qty SET DEFAULT 1;`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE part_lines ALTER COLUMN qty TYPE integer USING round(qty)::integer;`,
    );
    await q.query(`ALTER TABLE part_lines ALTER COLUMN qty SET DEFAULT 1;`);
    await q.query(`ALTER TABLE part_lines DROP COLUMN IF EXISTS unit;`);
  }
}
