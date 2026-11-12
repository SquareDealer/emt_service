export type ClientSource = 'manual' | 'telegram_bot' | 'csv_import';

export type WorkOrderStatus =
  | 'scheduled'
  | 'in_progress'
  | 'waiting'
  | 'done'
  | 'closed';

export type DiscountType = 'percent' | 'fixed';

export type UserRole = 'owner' | 'master_receptionist' | 'master';

export interface User {
  id: string;
  name: string;
  login: string;
  role: UserRole;
  is_active: boolean;
}

export interface Client {
  id: string;
  full_name: string;
  phone: string;
  source: ClientSource;
  discount_default_pct: number | null;
  imported_deals_count: number;
  imported_deals_sum: number;
  /** Orders closed in this CRM — live, on top of the imported history. */
  closed_orders_count: number;
  closed_orders_sum: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  client_id: string;
  vin: string | null;
  /** «MINI», «BMW»… Free text — the generations catalog is a helper, not a constraint. */
  make: string | null;
  model: string | null;
  /** Snapshot of the catalog code («R56»), kept even if the catalog row is retired. */
  generation_code: string | null;
  generation_id: string | null;
  plate: string | null;
  year: number | null;
  mileage: number | null;
  notes: string | null;
  created_at: string;
}

/**
 * Reserved time that is not a work order — a booked lift, a supplier visit, a
 * day off. `user_id === null` means the whole shop is busy.
 */
export interface CalendarBlock {
  id: string;
  title: string | null;
  starts_at: string;
  duration_min: number;
  user_id: string | null;
  user?: { id: string; name: string } | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface VehicleGeneration {
  id: string;
  make: string;
  model: string;
  code: string | null;
  years: string | null;
  sort: number;
  active: boolean;
}

export interface LaborLine {
  id: string;
  work_order_id: string;
  template_id: string | null;
  name: string;
  hours: number | null;
  rate_snapshot: number;
  price_override: number | null;
  /** Per-line discount — applied before the order-level one, the two stack. */
  discount_type: DiscountType | null;
  discount_value: number | null;
  /** Estimate block this line belongs to; null = ungrouped. */
  group_key: string | null;
  group_name: string | null;
  group_sort: number;
  sort: number;
}

export type PartUnit = 'pcs' | 'l';

export interface PartLine {
  id: string;
  work_order_id: string;
  name: string;
  catalog_number: string | null;
  /** Brand, separate from the name — printed instead of the article on the order. */
  manufacturer: string | null;
  qty: number;
  unit: PartUnit;
  unit_price: number;
  /** Catalog entry this line was picked from. */
  part_template_id: string | null;
  discount_type: DiscountType | null;
  discount_value: number | null;
  group_key: string | null;
  group_name: string | null;
  group_sort: number;
  sort: number;
}

export interface WorkOrder {
  id: string;
  vehicle_id: string;
  assigned_master_id: string | null;
  status: WorkOrderStatus;
  title: string | null;
  notes: string | null;
  complaint: string | null;
  recommendation: string | null;
  scheduled_at: string | null;
  scheduled_duration_min: number | null;
  discount_type: DiscountType | null;
  discount_value: number | null;
  total_cached: number;
  total_frozen: number | null;
  paid_amount: number;
  closed_at: string | null;
  doc_number: number | null;
  order_doc_number: number | null;
  created_at: string;
  vehicle?: Vehicle & { client?: Client };
  labor_lines?: LaborLine[];
  part_lines?: PartLine[];
  assigned_master?: { id: string; name: string } | null;
}

export type ArchiveSort = 'closed_desc' | 'closed_asc' | 'total_desc' | 'total_asc';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AppSettings {
  labor_rate: number;
  company_name: string;
  company_inn: string;
  company_address: string;
  company_phone: string;
  vat_rate: number;
  working_hours_start: number;
  working_hours_end: number;
  slot_minutes: number;
  default_appointment_min: number;
}

export interface TaskTemplate {
  id: string;
  name: string;
  default_hours: number | null;
  default_price: number | null;
  active: boolean;
}

export interface PartTemplate {
  id: string;
  name: string;
  manufacturer: string | null;
  catalog_number: string | null;
  unit: PartUnit;
  default_price: number | null;
  /** Закупка за единицу. Приходит только владельцу. */
  purchase_price?: number | null;
  active: boolean;
}

/** Where a price-list figure came from — surfaced so a fallback is never silent. */
export type PriceSource = 'generation' | 'template' | 'rate';

export interface PriceListRow {
  template: TaskTemplate;
  base: { hours: number | null; price: number | null };
  /** null = inherits the base price for this generation. */
  override: { hours: number | null; price: number | null } | null;
  effective: { hours: number | null; price: number | null; source: PriceSource };
  /** How many parts this work pulls in for the selected generation. */
  parts_count: number;
}

/** A part a work pulls in — the link that makes «работа + её запчасти». */
export interface TaskTemplatePart {
  id: string;
  task_template_id: string;
  part_template_id: string;
  part_template?: PartTemplate;
  /** null = for every generation; a generation row supersedes its universal twin. */
  generation_id: string | null;
  qty: number | null;
  is_default: boolean;
  /** Role in the work («фильтр масляный») — what lets a generation part replace it. */
  slot: string | null;
}

export interface TemplatePartCandidate {
  part_template_id: string;
  name: string;
  manufacturer: string | null;
  catalog_number: string | null;
  unit: PartUnit;
  qty: number;
  unit_price: number | null;
  is_default: boolean;
  /** Chosen because it names this car's generation. */
  generation_specific: boolean;
}

export interface TemplatePreview {
  template_id: string;
  group_name: string;
  labor: { name: string; hours: number | null; rate_snapshot: number; price_override: number | null };
  price_source: PriceSource;
  parts: TemplatePartCandidate[];
}

export interface SearchHit {
  id: string;
  type: 'client' | 'vehicle';
  full_name?: string;
  phone?: string;
  source?: ClientSource;
  vin?: string | null;
  plate?: string | null;
  make?: string | null;
  model?: string | null;
  generation_code?: string | null;
  client?: { id: string; full_name: string; phone: string } | null;
}

export interface ImportReport {
  total: number;
  added: number;
  skipped_duplicates: number;
  errors: { line: number; reason: string; raw?: string }[];
}

export interface AuthUser {
  id: string;
  name: string;
  login: string;
  role: UserRole;
}

export const ROLE_LABEL: Record<UserRole, string> = {
  owner: 'Владелец',
  master_receptionist: 'Мастер-приёмщик',
  master: 'Мастер',
};

export const STATUS_ORDER: WorkOrderStatus[] = [
  'scheduled',
  'in_progress',
  'waiting',
  'done',
  'closed',
];

export const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  scheduled: 'Запланирована',
  in_progress: 'В работе',
  waiting: 'Ожидание',
  done: 'Готова',
  closed: 'Выдана',
};

/** How many closed orders the board's «Выдана» column shows. Mirrors the server. */
export const BOARD_CLOSED_LIMIT = 10;

// Аналитика владельца (`/analytics/*`). Поля — snake_case, как в ответе API.
// margin и markup_pct — доли 0…1, null когда делить не на что.

export interface AnalyticsTotals {
  orders: number;
  hours: number;
  revenue: number;
  labor: number;
  parts_sale: number;
  parts_cost: number;
  markup: number;
  unknown_sale: number;
  unknown_count: number;
  discounts: number;
  profit: number;
  margin: number | null;
  avg_check: number | null;
}

export interface AnalyticsBucket {
  from: string;
  to: string;
  orders: number;
  labor: number;
  markup: number;
  cost: number;
  unknown: number;
  revenue: number;
  profit: number;
}

export interface AnalyticsLaborRow {
  key: string;
  name: string;
  count: number;
  hours: number;
  revenue: number;
  per_hour: number | null;
}

export interface AnalyticsPartRow {
  key: string;
  name: string;
  manufacturer: string | null;
  unit: PartUnit;
  qty: number;
  revenue: number;
  cost: number | null;
  markup: number | null;
  markup_pct: number | null;
  unknown_count: number;
}

export interface AnalyticsVehicleRow {
  key: string;
  name: string;
  orders: number;
  revenue: number;
  profit: number;
  margin: number | null;
  avg_check: number | null;
  unknown_count: number;
}

export interface AnalyticsClientRow extends Omit<AnalyticsVehicleRow, 'key'> {
  client_id: string;
  vehicle: string;
  last_closed_at: string;
}

export interface AnalyticsBreakdown {
  labor: AnalyticsLaborRow[];
  parts: AnalyticsPartRow[];
  vehicles: AnalyticsVehicleRow[];
  clients: AnalyticsClientRow[];
}

export interface AnalyticsSummary {
  totals: AnalyticsTotals;
  /** Период сравнения; null, если prev не передан. */
  previous: AnalyticsTotals | null;
  buckets: AnalyticsBucket[];
  breakdown: AnalyticsBreakdown;
}

/** Запчасти закрытых нарядов без закупки — строки для дозаполнения. */
export interface MissingCostRow {
  part_line_id: string;
  work_order_id: string;
  doc_number: number | null;
  closed_at: string;
  vehicle: string;
  client: string;
  name: string;
  manufacturer: string | null;
  qty: number;
  unit: PartUnit;
  net: number;
}

/** Строка запчасти наряда с закупкой (только владельцу). */
export interface PartCostRow {
  part_line_id: string;
  name: string;
  manufacturer: string | null;
  qty: number;
  unit: PartUnit;
  purchase_price: number | null;
}

/** Элемент PATCH /analytics/part-costs. null — очистить закупку. */
export interface PartCostItem {
  part_line_id: string;
  purchase_price: number | null;
}
