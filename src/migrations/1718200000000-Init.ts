import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1718200000000 implements MigrationInterface {
  name = 'Init1718200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

    // --- enums ---
    await q.query(`CREATE TYPE work_order_status AS ENUM (
      'scheduled', 'in_progress', 'waiting', 'done', 'closed'
    );`);
    await q.query(`CREATE TYPE discount_type AS ENUM ('percent', 'fixed');`);
    await q.query(`CREATE TYPE user_role AS ENUM ('owner');`);
    await q.query(`CREATE TYPE client_source AS ENUM ('manual', 'telegram_bot', 'csv_import');`);

    // --- clients ---
    await q.query(`CREATE TABLE clients (
      id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name            text NOT NULL,
      phone                text NOT NULL,
      source               client_source NOT NULL DEFAULT 'manual',
      discount_default_pct numeric(5,2),
      imported_deals_count int NOT NULL DEFAULT 0,
      imported_deals_sum   numeric(14,2) NOT NULL DEFAULT 0,
      notes                text,
      created_at           timestamptz NOT NULL DEFAULT now(),
      updated_at           timestamptz NOT NULL DEFAULT now()
    );`);

    // --- vehicles ---
    await q.query(`CREATE TABLE vehicles (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id  uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      vin        text,
      model      text,
      plate      text,
      year       int,
      mileage    int,
      notes      text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );`);

    // --- users ---
    await q.query(`CREATE TABLE users (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name          text NOT NULL,
      login         text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      role          user_role NOT NULL DEFAULT 'owner'
    );`);

    // --- work_orders ---
    await q.query(`CREATE TABLE work_orders (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vehicle_id             uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
      assigned_master_id     uuid REFERENCES users(id),
      status                 work_order_status NOT NULL DEFAULT 'scheduled',
      title                  text,
      scheduled_at           timestamptz,
      scheduled_duration_min int,
      discount_type          discount_type,
      discount_value         numeric(12,2),
      total_cached           numeric(12,2) NOT NULL DEFAULT 0,
      total_frozen           numeric(12,2),
      created_at             timestamptz NOT NULL DEFAULT now(),
      updated_at             timestamptz NOT NULL DEFAULT now(),
      closed_at              timestamptz
    );`);

    // --- task_templates ---
    await q.query(`CREATE TABLE task_templates (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name          text NOT NULL,
      default_hours numeric(6,2),
      default_price numeric(12,2),
      active        boolean NOT NULL DEFAULT true
    );`);

    // --- labor_lines ---
    await q.query(`CREATE TABLE labor_lines (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      work_order_id  uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      template_id    uuid REFERENCES task_templates(id),
      name           text NOT NULL,
      hours          numeric(6,2),
      rate_snapshot  numeric(12,2) NOT NULL,
      price_override numeric(12,2)
    );`);

    // --- part_lines ---
    await q.query(`CREATE TABLE part_lines (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      work_order_id  uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      name           text NOT NULL,
      catalog_number text,
      qty            int NOT NULL DEFAULT 1,
      unit_price     numeric(12,2) NOT NULL
    );`);

    // --- settings (key-value) ---
    await q.query(`CREATE TABLE settings (
      key        text PRIMARY KEY,
      value      text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );`);

    // --- indexes ---
    await q.query(`CREATE INDEX idx_clients_name_trgm   ON clients USING gin (full_name gin_trgm_ops);`);
    await q.query(`CREATE INDEX idx_clients_phone_trgm  ON clients USING gin (phone gin_trgm_ops);`);
    await q.query(`CREATE INDEX idx_clients_source      ON clients(source);`);
    await q.query(`CREATE INDEX idx_vehicles_vin_trgm   ON vehicles USING gin (vin gin_trgm_ops);`);
    await q.query(`CREATE INDEX idx_vehicles_plate_trgm ON vehicles USING gin (plate gin_trgm_ops);`);
    await q.query(`CREATE INDEX idx_vehicles_client     ON vehicles(client_id);`);
    await q.query(`CREATE INDEX idx_wo_vehicle          ON work_orders(vehicle_id);`);
    await q.query(`CREATE INDEX idx_wo_status           ON work_orders(status);`);
    await q.query(`CREATE INDEX idx_wo_scheduled        ON work_orders(scheduled_at);`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS settings;`);
    await q.query(`DROP TABLE IF EXISTS part_lines;`);
    await q.query(`DROP TABLE IF EXISTS labor_lines;`);
    await q.query(`DROP TABLE IF EXISTS task_templates;`);
    await q.query(`DROP TABLE IF EXISTS work_orders;`);
    await q.query(`DROP TABLE IF EXISTS users;`);
    await q.query(`DROP TABLE IF EXISTS vehicles;`);
    await q.query(`DROP TABLE IF EXISTS clients;`);
    await q.query(`DROP TYPE IF EXISTS client_source;`);
    await q.query(`DROP TYPE IF EXISTS user_role;`);
    await q.query(`DROP TYPE IF EXISTS discount_type;`);
    await q.query(`DROP TYPE IF EXISTS work_order_status;`);
  }
}
