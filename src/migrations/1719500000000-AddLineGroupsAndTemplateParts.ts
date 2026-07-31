import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * «Группировка работ вместе с запчастями» — an estimate block holding a job and
 * the parts it consumes, plus the catalog link that produces such a block.
 *
 * Groups are DENORMALIZED onto the two line tables rather than living in a table
 * of their own. A group table would buy nothing the documents or the UI need —
 * they want a stable order and a heading, which columns already give — while
 * costing a third repository, an extra join in the already twice-per-mutation
 * loadFull, and a garbage collector for empty groups. Denormalized:
 *   • rename  = one UPDATE ... WHERE group_key = $1 per table
 *   • delete the labour line and the parts keep the group, rendering as a
 *     parts-only block under the same heading — which is exactly right
 *   • an empty group cannot exist by construction
 * `group_key` is a uuid, not the name: identical names must not silently merge
 * two distinct blocks, and renaming must not.
 */
export class AddLineGroupsAndTemplateParts1719500000000 implements MigrationInterface {
  name = 'AddLineGroupsAndTemplateParts1719500000000';

  public async up(q: QueryRunner): Promise<void> {
    for (const table of ['labor_lines', 'part_lines']) {
      await q.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS group_key uuid;`);
      await q.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS group_name text;`);
      await q.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS group_sort integer NOT NULL DEFAULT 0;`,
      );
      await q.query(
        `CREATE INDEX IF NOT EXISTS idx_${table}_group ON ${table} (group_key);`,
      );
    }

    await q.query(`
      ALTER TABLE part_lines ADD COLUMN IF NOT EXISTS part_template_id uuid
        REFERENCES part_templates(id) ON DELETE SET NULL;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS task_template_parts (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        task_template_id uuid NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
        part_template_id uuid NOT NULL REFERENCES part_templates(id) ON DELETE CASCADE,
        -- NULL = applies to every generation; a row naming a generation
        -- supersedes its universal twin for that generation only.
        generation_id    uuid REFERENCES vehicle_generations(id) ON DELETE CASCADE,
        -- nullable: numericTransformer would write an explicit NULL over a
        -- NOT NULL DEFAULT. Treated as 1 when the template is expanded.
        qty              numeric(12,3),
        -- false = offered in the confirmation sheet but not ticked by default
        is_default       boolean NOT NULL DEFAULT true
      );
    `);
    // Postgres does not deduplicate NULLs in a unique index, so the "universal"
    // row needs a concrete sentinel to be unique against.
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_task_template_parts
        ON task_template_parts (
          task_template_id,
          part_template_id,
          coalesce(generation_id, '00000000-0000-0000-0000-000000000000'::uuid)
        );
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS idx_ttp_template ON task_template_parts (task_template_id);`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_ttp_template;`);
    await q.query(`DROP INDEX IF EXISTS uq_task_template_parts;`);
    await q.query(`DROP TABLE IF EXISTS task_template_parts;`);
    await q.query(`ALTER TABLE part_lines DROP COLUMN IF EXISTS part_template_id;`);
    for (const table of ['labor_lines', 'part_lines']) {
      await q.query(`DROP INDEX IF EXISTS idx_${table}_group;`);
      await q.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS group_sort;`);
      await q.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS group_name;`);
      await q.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS group_key;`);
    }
  }
}
