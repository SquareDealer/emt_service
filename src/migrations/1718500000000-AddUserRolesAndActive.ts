import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserRolesAndActive1718500000000 implements MigrationInterface {
  name = 'AddUserRolesAndActive1718500000000';

  public async up(q: QueryRunner): Promise<void> {
    // New roles alongside the existing 'owner'. ADD VALUE is transaction-safe on
    // PG12+ as long as the value isn't *used* in the same tx (master rows are
    // created later via the Users UI/seed, after this migration commits).
    await q.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'master_receptionist';`);
    await q.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'master';`);
    // Soft-deactivation flag (deactivated users can't log in / be assigned).
    await q.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;`,
    );
    // Speeds up the "master sees only own orders" filter.
    await q.query(
      `CREATE INDEX IF NOT EXISTS idx_wo_assigned_master ON work_orders(assigned_master_id);`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_wo_assigned_master;`);
    await q.query(`ALTER TABLE users DROP COLUMN IF EXISTS is_active;`);
    // Postgres can't drop enum values; the added roles are left in place.
  }
}
