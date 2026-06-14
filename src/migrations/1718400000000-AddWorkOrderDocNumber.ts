import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sequential human-readable document number for the calculation PDF.
 * Assigned once, on first freeze (close), and kept stable across re-open/re-close.
 * Sequence (not serial default) so only closed orders consume numbers → near-gapless.
 * Unique index allows multiple NULLs (open orders have no number yet).
 */
export class AddWorkOrderDocNumber1718400000000 implements MigrationInterface {
  name = 'AddWorkOrderDocNumber1718400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS doc_number integer;`,
    );
    await q.query(`CREATE SEQUENCE IF NOT EXISTS work_order_doc_number_seq;`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_work_orders_doc_number ON work_orders (doc_number);`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS uq_work_orders_doc_number;`);
    await q.query(`ALTER TABLE work_orders DROP COLUMN IF EXISTS doc_number;`);
    await q.query(`DROP SEQUENCE IF EXISTS work_order_doc_number_seq;`);
  }
}
