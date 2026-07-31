import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The MVP assumed every car is a MINI: `vehicles.model` was a single free-text
 * field actually holding the generation code (R56/F56…), and both PDFs printed
 * a literal «Марка: Mini». That blocks recording anything else, and a price list
 * split by generation needs the generation to be a real reference, not a string.
 *
 * Adds a `vehicle_generations` catalog plus `make` / `generation_code` /
 * `generation_id` on `vehicles`. The two text columns are denormalized on
 * purpose: they always render (even if a catalog row is later deleted), while
 * the FK is what the price list joins on.
 *
 * The backfill is strictly ADDITIVE — `vehicles.model` is left exactly as the
 * user typed it. Real data holds things like «Кабрио R57» and «R60 Countryman»,
 * so an exact match would be wrong and an overwrite would be unrecoverable.
 * Normalizing `model` is a separate migration, after a human reviews the matches.
 */
export class AddVehicleMakeAndGenerations1719100000000 implements MigrationInterface {
  name = 'AddVehicleMakeAndGenerations1719100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS vehicle_generations (
        id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        make   text NOT NULL,
        model  text NOT NULL,
        code   text,
        years  text,
        sort   integer NOT NULL DEFAULT 0,
        active boolean NOT NULL DEFAULT true
      );
    `);
    // Case-folded so "MINI"/"Mini" cannot both be inserted.
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_generations
        ON vehicle_generations (lower(make), lower(model), lower(coalesce(code, '')));
    `);

    // Seeded here rather than in SeedService because the backfill below depends
    // on these rows, and migrationsRun happens before onApplicationBootstrap.
    await q.query(`
      INSERT INTO vehicle_generations (make, model, code, years, sort) VALUES
        ('MINI', 'Hatch',      'R50', '2001–2006', 10),
        ('MINI', 'Hatch',      'R53', '2002–2006', 11),
        ('MINI', 'Cabrio',     'R52', '2004–2008', 12),
        ('MINI', 'Hatch',      'R56', '2006–2013', 20),
        ('MINI', 'Clubman',    'R55', '2007–2014', 21),
        ('MINI', 'Cabrio',     'R57', '2008–2015', 22),
        ('MINI', 'Countryman', 'R60', '2010–2016', 23),
        ('MINI', 'Coupe',      'R58', '2011–2015', 24),
        ('MINI', 'Roadster',   'R59', '2012–2015', 25),
        ('MINI', 'Paceman',    'R61', '2012–2016', 26),
        ('MINI', 'Hatch',      'F56', '2013–2024', 30),
        ('MINI', 'Hatch 5D',   'F55', '2014–2024', 31),
        ('MINI', 'Clubman',    'F54', '2015–2024', 32),
        ('MINI', 'Cabrio',     'F57', '2015–2024', 33),
        ('MINI', 'Countryman', 'F60', '2017–2024', 34),
        ('MINI', 'Cooper SE',  'J01', '2024–',     40),
        ('MINI', 'Countryman', 'U25', '2024–',     41),
        ('MINI', 'Cooper',     'F66', '2024–',     42),
        ('MINI', 'Cooper 5D',  'F65', '2024–',     43)
      ON CONFLICT DO NOTHING;
    `);

    await q.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS make text;`);
    await q.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS generation_code text;`);
    await q.query(`
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS generation_id uuid
        REFERENCES vehicle_generations(id) ON DELETE SET NULL;
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS idx_vehicles_generation ON vehicles (generation_id);`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS idx_vehicles_make_trgm ON vehicles USING gin (make gin_trgm_ops);`,
    );

    // Everything recorded so far was entered under the "all cars are MINI"
    // assumption the UI hardcoded, so that is the correct make for existing rows.
    await q.query(`UPDATE vehicles SET make = 'MINI' WHERE make IS NULL;`);

    // Pull the generation code out as a whole word: real values look like
    // «R56», «Кабрио R57», «R60 Countryman». Anything that does not match is
    // left NULL for a human to set — never guessed.
    await q.query(`
      UPDATE vehicles v
         SET generation_code = g.code,
             generation_id   = g.id
        FROM vehicle_generations g
       WHERE v.model IS NOT NULL
         AND v.generation_id IS NULL
         AND upper(g.code) = (regexp_match(upper(v.model), '\\y([RFUJ][0-9]{2})\\y'))[1];
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_vehicles_make_trgm;`);
    await q.query(`DROP INDEX IF EXISTS idx_vehicles_generation;`);
    await q.query(`ALTER TABLE vehicles DROP COLUMN IF EXISTS generation_id;`);
    await q.query(`ALTER TABLE vehicles DROP COLUMN IF EXISTS generation_code;`);
    await q.query(`ALTER TABLE vehicles DROP COLUMN IF EXISTS make;`);
    await q.query(`DROP INDEX IF EXISTS uq_vehicle_generations;`);
    await q.query(`DROP TABLE IF EXISTS vehicle_generations;`);
  }
}
