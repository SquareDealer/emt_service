import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Amount the client has paid so far (single running total, editable even after
 * close — payments may arrive in installments). Feeds the "Оплачено"/"Остаток"
 * rows of the documents. NOT NULL DEFAULT 0 so existing orders read as unpaid.
 */
export class AddWorkOrderPaidAmount1718600000000 implements MigrationInterface {
  name = 'AddWorkOrderPaidAmount1718600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2) NOT NULL DEFAULT 0;`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE work_orders DROP COLUMN IF EXISTS paid_amount;`);
  }
}
