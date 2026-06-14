export type ClientSource = 'manual' | 'telegram_bot' | 'csv_import';

export type WorkOrderStatus =
  | 'scheduled'
  | 'in_progress'
  | 'waiting'
  | 'done'
  | 'closed';

export type DiscountType = 'percent' | 'fixed';

export interface Client {
  id: string;
  full_name: string;
  phone: string;
  source: ClientSource;
  discount_default_pct: number | null;
  imported_deals_count: number;
  imported_deals_sum: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  client_id: string;
  vin: string | null;
  model: string | null;
  plate: string | null;
  year: number | null;
  mileage: number | null;
  notes: string | null;
  created_at: string;
}

export interface LaborLine {
  id: string;
  work_order_id: string;
  template_id: string | null;
  name: string;
  hours: number | null;
  rate_snapshot: number;
  price_override: number | null;
}

export interface PartLine {
  id: string;
  work_order_id: string;
  name: string;
  catalog_number: string | null;
  qty: number;
  unit_price: number;
}

export interface WorkOrder {
  id: string;
  vehicle_id: string;
  assigned_master_id: string | null;
  status: WorkOrderStatus;
  title: string | null;
  notes: string | null;
  scheduled_at: string | null;
  scheduled_duration_min: number | null;
  discount_type: DiscountType | null;
  discount_value: number | null;
  total_cached: number;
  total_frozen: number | null;
  closed_at: string | null;
  created_at: string;
  vehicle?: Vehicle & { client?: Client };
  labor_lines?: LaborLine[];
  part_lines?: PartLine[];
}

export interface TaskTemplate {
  id: string;
  name: string;
  default_hours: number | null;
  default_price: number | null;
  active: boolean;
}

export interface SearchHit {
  id: string;
  type: 'client' | 'vehicle';
  full_name?: string;
  phone?: string;
  source?: ClientSource;
  vin?: string | null;
  plate?: string | null;
  model?: string | null;
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
  role: string;
}

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
