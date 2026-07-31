import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Estimate lines had no ordering column at all, so `loadFull()` returned them in
 * whatever order Postgres produced — which changes after an UPDATE (MVCC rewrites
 * the row to the end of the heap). Add an explicit `sort` plus `created_at` as a
 * permanent tiebreak; grouping (work + its parts) depends on a stable order.
 *
 * Also: index the two FK columns (Postgres does not index FKs automatically) and
 * re-point `labor_lines.template_id` to ON DELETE SET NULL — it was created
 * without an ON DELETE clause, so deleting a template that any line ever used
 * raised an FK violation instead of clearing the provenance link.
 */
export class AddLineOrderingAndIndexes1719000000000 implements MigrationInterface {
  name = 'AddLineOrderingAndIndexes1719000000000';

  public async up(q: QueryRunner): Promise<void> {
    for (const table of ['labor_lines', 'part_lines']) {
      await q.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS sort integer NOT NULL DEFAULT 0;`,
      );
      await q.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();`,
      );
      // Backfill insert order from the physical row order — the only proxy we
      // have, since there was no timestamp either. Runs once; new rows get their
      // sort from the service.
      await q.query(`
        UPDATE ${table} t SET sort = s.rn - 1
        FROM (
          SELECT id, row_number() OVER (PARTITION BY work_order_id ORDER BY ctid) AS rn
          FROM ${table}
        ) s
        WHERE t.id = s.id AND t.sort = 0;
      `);
      await q.query(
        `CREATE INDEX IF NOT EXISTS idx_${table}_wo ON ${table} (work_order_id);`,
      );
    }

    // The Init migration created this FK unnamed, so the actual constraint name
    // is whatever Postgres generated. Look it up instead of guessing.
    await q.query(`
      DO $$
      DECLARE cname text;
      BEGIN
        SELECT con.conname INTO cname
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          JOIN pg_attribute att
            ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
         WHERE rel.relname = 'labor_lines'
           AND con.contype = 'f'
           AND att.attname = 'template_id'
         LIMIT 1;
        IF cname IS NOT NULL THEN
          EXECUTE format('ALTER TABLE labor_lines DROP CONSTRAINT %I', cname);
        END IF;
      END $$;
    `);
    await q.query(`
      ALTER TABLE labor_lines
        ADD CONSTRAINT labor_lines_template_id_fkey
        FOREIGN KEY (template_id) REFERENCES task_templates(id) ON DELETE SET NULL;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE labor_lines DROP CONSTRAINT IF EXISTS labor_lines_template_id_fkey;`,
    );
    await q.query(`
      ALTER TABLE labor_lines
        ADD CONSTRAINT labor_lines_template_id_fkey
        FOREIGN KEY (template_id) REFERENCES task_templates(id);
    `);
    for (const table of ['labor_lines', 'part_lines']) {
      await q.query(`DROP INDEX IF EXISTS idx_${table}_wo;`);
      await q.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS created_at;`);
      await q.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS sort;`);
    }
  }
}
