import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * «Скидка на конкретную работу» — a discount that belongs to one estimate line
 * rather than the whole order. Applied to parts too: both PDF tables already
 * print a «Скидка» column that was a hardcoded '0.00', so the symmetric version
 * costs nothing extra and stops those columns from lying.
 *
 * Also adds `part_lines.manufacturer` — the brand was previously buried inside
 * the part name, which is why the printed article had to carry it.
 *
 * Reuses the existing `discount_type` PG enum: synchronize is off, so TypeORM
 * will not try to recreate the type.
 */
export class AddLineDiscountsAndManufacturer1719300000000 implements MigrationInterface {
  name = 'AddLineDiscountsAndManufacturer1719300000000';

  public async up(q: QueryRunner): Promise<void> {
    for (const table of ['labor_lines', 'part_lines']) {
      await q.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS discount_type discount_type;`,
      );
      await q.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS discount_value numeric(12,2);`,
      );
    }
    await q.query(`ALTER TABLE part_lines ADD COLUMN IF NOT EXISTS manufacturer text;`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE part_lines DROP COLUMN IF EXISTS manufacturer;`);
    for (const table of ['labor_lines', 'part_lines']) {
      await q.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS discount_value;`);
      await q.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS discount_type;`);
    }
  }
}
