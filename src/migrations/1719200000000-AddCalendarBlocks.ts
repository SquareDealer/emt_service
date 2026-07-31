import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * «Резервные записи» — time marked as busy without a client or a car («для
 * всякой хуйни без имени»): a lift booked for something else, a supplier visit,
 * a day off.
 *
 * A dedicated table rather than a work order with a nullable vehicle_id: blocks
 * must not reach the kanban board, the archive, the documents, `total_cached`
 * or the document numbering, and every one of those would need a special case.
 *
 * `duration_min` mirrors `work_orders.scheduled_duration_min` instead of an
 * `ends_at`, so the timeline's move/resize callbacks work for both kinds.
 */
export class AddCalendarBlocks1719200000000 implements MigrationInterface {
  name = 'AddCalendarBlocks1719200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS calendar_blocks (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title        text,
        starts_at    timestamptz NOT NULL,
        duration_min integer NOT NULL,
        user_id      uuid REFERENCES users(id) ON DELETE CASCADE,
        notes        text,
        created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at   timestamptz NOT NULL DEFAULT now()
      );
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS idx_calendar_blocks_starts ON calendar_blocks (starts_at);`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS idx_calendar_blocks_user ON calendar_blocks (user_id);`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_calendar_blocks_user;`);
    await q.query(`DROP INDEX IF EXISTS idx_calendar_blocks_starts;`);
    await q.query(`DROP TABLE IF EXISTS calendar_blocks;`);
  }
}
