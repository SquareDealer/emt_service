import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sequential number for the «Заказ-наряд» document — independent of the
 * calculation's `doc_number` (its own sequence). Assigned lazily on first
 * generation (the doc can be produced at ANY status, before close), then kept
 * stable. Unique index allows multiple NULLs (orders that never printed one).
 */
export class AddWorkOrderOrderNumber1718700000000 implements MigrationInterface {
  name = 'AddWorkOrderOrderNumber1718700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS order_doc_number integer;`,
    );
    await q.query(`CREATE SEQUENCE IF NOT EXISTS work_order_order_number_seq;`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_work_orders_order_doc_number ON work_orders (order_doc_number);`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS uq_work_orders_order_doc_number;`);
    await q.query(
      `ALTER TABLE work_orders DROP COLUMN IF EXISTS order_doc_number;`,
    );
    await q.query(`DROP SEQUENCE IF EXISTS work_order_order_number_seq;`);
  }
}
