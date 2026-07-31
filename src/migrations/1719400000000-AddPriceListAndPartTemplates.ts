import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * «Прайс лист раздельный по поколениям» + «шаблон для запчастей по аналогии с
 * работами».
 *
 * The works catalog stays single (`task_templates`) and a generation only
 * OVERRIDES its price. Duplicating the whole list per generation would strand
 * `labor_lines.template_id`, multiply every rename by fifteen, and give
 * universal jobs («Диагностика») fifteen identical rows. A per-generation view
 * is a UI pivot over this shape, not a different schema.
 *
 * `generation_id` is NOT NULL here on purpose: the base price lives in
 * `task_templates.default_*`, so there is no "NULL means universal" row — and
 * therefore none of the trouble that Postgres not deduplicating NULLs in a
 * UNIQUE constraint would cause.
 */
export class AddPriceListAndPartTemplates1719400000000 implements MigrationInterface {
  name = 'AddPriceListAndPartTemplates1719400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS part_templates (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name           text NOT NULL,
        manufacturer   text,
        catalog_number text,
        unit           text NOT NULL DEFAULT 'pcs',
        -- nullable: numericTransformer emits an explicit NULL for an unset
        -- column, so a NOT NULL DEFAULT would never apply and every insert
        -- without an explicit price would fail.
        default_price  numeric(12,2),
        active         boolean NOT NULL DEFAULT true
      );
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS idx_part_templates_name_trgm
         ON part_templates USING gin (name gin_trgm_ops);`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS idx_part_templates_cat_trgm
         ON part_templates USING gin (catalog_number gin_trgm_ops);`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS idx_part_templates_brand_trgm
         ON part_templates USING gin (manufacturer gin_trgm_ops);`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS template_generation_prices (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id   uuid NOT NULL REFERENCES task_templates(id)      ON DELETE CASCADE,
        generation_id uuid NOT NULL REFERENCES vehicle_generations(id) ON DELETE CASCADE,
        hours         numeric(6,2),
        price         numeric(12,2),
        CONSTRAINT uq_template_generation UNIQUE (template_id, generation_id)
      );
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS idx_tgp_generation
         ON template_generation_prices (generation_id);`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_tgp_generation;`);
    await q.query(`DROP TABLE IF EXISTS template_generation_prices;`);
    await q.query(`DROP INDEX IF EXISTS idx_part_templates_brand_trgm;`);
    await q.query(`DROP INDEX IF EXISTS idx_part_templates_cat_trgm;`);
    await q.query(`DROP INDEX IF EXISTS idx_part_templates_name_trgm;`);
    await q.query(`DROP TABLE IF EXISTS part_templates;`);
  }
}
