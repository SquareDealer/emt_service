import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Закупочная цена запчасти — для аналитики владельца (маржа по закрытым нарядам).
 *
 * Nullable: у старых строк закупки нет, и это «неизвестно», а не ноль. Колонки в
 * сущностях помечены `select: false`, чтобы цена не утекла в обычные выборки.
 * Частичный индекс по `closed_at` — аналитика читает только закрытые наряды.
 */
export class AddPartPurchasePrice1719700000000 implements MigrationInterface {
  name = 'AddPartPurchasePrice1719700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE part_lines ADD COLUMN IF NOT EXISTS purchase_price numeric(12,2);`);
    await q.query(`ALTER TABLE part_templates ADD COLUMN IF NOT EXISTS purchase_price numeric(12,2);`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS idx_work_orders_closed_at ON work_orders (closed_at) WHERE status = 'closed';`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_work_orders_closed_at;`);
    await q.query(`ALTER TABLE part_templates DROP COLUMN IF EXISTS purchase_price;`);
    await q.query(`ALTER TABLE part_lines DROP COLUMN IF EXISTS purchase_price;`);
  }
}
