import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkOrderComplaintRecommendation1718900000000
  implements MigrationInterface
{
  name = 'AddWorkOrderComplaintRecommendation1718900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS complaint text;`);
    await q.query(
      `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS recommendation text;`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE work_orders DROP COLUMN IF EXISTS recommendation;`);
    await q.query(`ALTER TABLE work_orders DROP COLUMN IF EXISTS complaint;`);
  }
}
