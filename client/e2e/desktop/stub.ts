import type { Page, Route } from '@playwright/test';
import type {
  AppSettings,
  AuthUser,
  CalendarBlock,
  Client,
  LaborLine,
  PartLine,
  PartTemplate,
  PriceListRow,
  SearchHit,
  TaskTemplate,
  TemplatePreview,
  User,
  Vehicle,
  VehicleGeneration,
  WorkOrder,
  WorkOrderStatus,
} from '../../src/lib/types';

/**
 * Shared API stub for the desktop e2e suite. Every `/api/**` call is answered
 * from the fixtures below, so tests need no backend and no credentials.
 *
 * Overriding: pass `overrides` to `stubApi` to swap data, or register extra
 * `page.route(...)` calls AFTER `stubApi` — Playwright tries the most recently
 * registered route first, and `route.fallback()` hands a request back to the
 * stub (e.g. to count a DELETE and still let the stub answer it).
 */

/** Wednesday, 10:40 Moscow. Tests freeze the clock here so snapshots are stable. */
export const FIXED_NOW = new Date('2026-11-18T10:40:00+03:00');

export const OWNER: AuthUser = { id: 'user-owner', name: 'Ринат Хаматов', login: 'owner', role: 'owner' };
export const MASTER: AuthUser = { id: 'user-master', name: 'Тимур Газизов', login: 'timur', role: 'master' };

const USERS: User[] = [
  { ...OWNER, is_active: true },
  { ...MASTER, is_active: true },
  { id: 'user-recept', name: 'Алсу Миннуллина', login: 'alsu', role: 'master_receptionist', is_active: true },
];

export const SETTINGS: AppSettings = {
  labor_rate: 3000,
  company_name: 'СТО «Татарин»',
  company_inn: '1655123456',
  company_address: 'г. Казань, ул. Техническая, 12',
  company_phone: '+7 (843) 200-11-22',
  vat_rate: 0,
  working_hours_start: 8,
  working_hours_end: 20,
  slot_minutes: 30,
  default_appointment_min: 60,
};

export const CLIENT: Client = {
  id: 'client-hero',
  full_name: 'Васильев Андрей Сергеевич',
  phone: '79271234567',
  source: 'manual',
  discount_default_pct: 5,
  imported_deals_count: 3,
  imported_deals_sum: 48500,
  notes: 'Приезжает по субботам',
  created_at: '2025-03-14T09:00:00+03:00',
  updated_at: '2026-10-01T09:00:00+03:00',
};

const VEHICLE_R56: Vehicle = {
  id: 'veh-r56',
  client_id: CLIENT.id,
  vin: 'WMWSU31090T123456',
  make: 'MINI',
  model: 'Hatch',
  generation_code: 'R56',
  generation_id: 'gen-r56',
  plate: 'А123ВС116',
  year: 2010,
  mileage: 142300,
  notes: null,
  created_at: '2025-03-14T09:05:00+03:00',
};

const VEHICLE_F56: Vehicle = {
  id: 'veh-f56',
  client_id: CLIENT.id,
  vin: 'WMWXR71060T654321',
  make: 'MINI',
  model: 'Cooper S',
  generation_code: 'F56',
  generation_id: 'gen-f56',
  plate: 'Х777ОО116',
  year: 2018,
  mileage: 68900,
  notes: null,
  created_at: '2025-06-02T12:00:00+03:00',
};

export const CLIENT_VEHICLES: Vehicle[] = [VEHICLE_R56, VEHICLE_F56];

export const GENERATIONS: VehicleGeneration[] = [
  { id: 'gen-r50', make: 'MINI', model: 'Hatch', code: 'R50', years: '2001–2006', sort: 1, active: true },
  { id: 'gen-r56', make: 'MINI', model: 'Hatch', code: 'R56', years: '2006–2013', sort: 2, active: true },
  { id: 'gen-f56', make: 'MINI', model: 'Hatch', code: 'F56', years: '2014–2023', sort: 3, active: true },
];

export const TEMPLATES: TaskTemplate[] = [
  { id: 'tpl-oil', name: 'Замена масла и фильтра', default_hours: 1, default_price: null, active: true },
  { id: 'tpl-pads', name: 'Замена передних колодок', default_hours: null, default_price: 2800, active: true },
  { id: 'tpl-diag', name: 'Компьютерная диагностика', default_hours: 0.5, default_price: null, active: true },
];

export const PRICE_LIST: PriceListRow[] = [
  {
    template: TEMPLATES[0],
    base: { hours: 1, price: null },
    override: null,
    effective: { hours: 1, price: null, source: 'template' },
    parts_count: 2,
  },
  {
    template: TEMPLATES[1],
    base: { hours: null, price: 2800 },
    override: { hours: null, price: 3200 },
    effective: { hours: null, price: 3200, source: 'generation' },
    parts_count: 1,
  },
  {
    template: TEMPLATES[2],
    base: { hours: 0.5, price: null },
    override: null,
    effective: { hours: 0.5, price: null, source: 'template' },
    parts_count: 0,
  },
];

export const PART_TEMPLATES: PartTemplate[] = [];

export const TEMPLATE_PREVIEW: TemplatePreview = {
  template_id: 'tpl-oil',
  group_name: 'Замена масла и фильтра',
  labor: { name: 'Замена масла и фильтра', hours: 1, rate_snapshot: 3000, price_override: null },
  price_source: 'template',
  parts: [
    {
      part_template_id: 'part-oil',
      name: 'Масло моторное 5W-30',
      manufacturer: 'Castrol',
      catalog_number: 'EDGE-5W30',
      unit: 'l',
      qty: 4,
      unit_price: 1250,
      is_default: true,
      generation_specific: false,
    },
    {
      part_template_id: 'part-filter',
      name: 'Фильтр масляный',
      manufacturer: 'Mann',
      catalog_number: 'HU 7010 z',
      unit: 'pcs',
      qty: 1,
      unit_price: 890,
      is_default: true,
      generation_specific: true,
    },
  ],
};

export const SEARCH_HITS: SearchHit[] = [
  {
    id: CLIENT.id,
    type: 'client',
    full_name: CLIENT.full_name,
    phone: CLIENT.phone,
    source: 'manual',
  },
  {
    id: VEHICLE_R56.id,
    type: 'vehicle',
    vin: VEHICLE_R56.vin,
    plate: VEHICLE_R56.plate,
    make: 'MINI',
    model: 'Hatch',
    generation_code: 'R56',
    client: { id: CLIENT.id, full_name: CLIENT.full_name, phone: CLIENT.phone },
  },
];

// ---------------------------------------------------------------- work orders

const withClient = (v: Vehicle): Vehicle & { client: Client } => ({ ...v, client: CLIENT });

function labor(over: Partial<LaborLine> & Pick<LaborLine, 'id' | 'name'>): LaborLine {
  return {
    work_order_id: 'wo-full',
    template_id: null,
    hours: null,
    rate_snapshot: 3000,
    price_override: null,
    discount_type: null,
    discount_value: null,
    group_key: null,
    group_name: null,
    group_sort: 0,
    sort: 0,
    ...over,
  };
}

function part(over: Partial<PartLine> & Pick<PartLine, 'id' | 'name'>): PartLine {
  return {
    work_order_id: 'wo-full',
    catalog_number: null,
    manufacturer: null,
    qty: 1,
    unit: 'pcs',
    unit_price: 0,
    part_template_id: null,
    discount_type: null,
    discount_value: null,
    group_key: null,
    group_name: null,
    group_sort: 0,
    sort: 0,
    ...over,
  };
}

const GRP_OIL = '11111111-1111-4111-8111-111111111111';
const GRP_PADS = '22222222-2222-4222-8222-222222222222';

function baseWo(over: Partial<WorkOrder> & Pick<WorkOrder, 'id' | 'vehicle_id'>): WorkOrder {
  return {
    assigned_master_id: null,
    status: 'scheduled',
    title: null,
    notes: null,
    complaint: null,
    recommendation: null,
    scheduled_at: null,
    scheduled_duration_min: null,
    discount_type: null,
    discount_value: null,
    total_cached: 0,
    total_frozen: null,
    paid_amount: 0,
    closed_at: null,
    doc_number: null,
    order_doc_number: null,
    created_at: '2026-11-17T18:00:00+03:00',
    labor_lines: [],
    part_lines: [],
    assigned_master: null,
    ...over,
  };
}

/**
 * Two estimate blocks, a 10% discount on the first labor line, a 5% order
 * discount and an assigned master — so the total exercises stacked discounts.
 *   oil block : labor 3000 (−10% = 2700) + oil 4×1250 + filter 890   = 8590
 *   pads block: labor 2800 + pads 5400                               = 8200
 *   net 16790 − 5% (839.50) = 15950.50
 */
export const WO_FULL: WorkOrder = baseWo({
  id: 'wo-full',
  vehicle_id: VEHICLE_R56.id,
  assigned_master_id: MASTER.id,
  assigned_master: { id: MASTER.id, name: MASTER.name },
  status: 'in_progress',
  title: 'ТО и тормоза',
  complaint: 'Скрип при торможении, пора менять масло',
  recommendation: 'Проверить задние колодки через 10 000 км',
  scheduled_at: '2026-11-18T09:00:00+03:00',
  scheduled_duration_min: 180,
  discount_type: 'percent',
  discount_value: 5,
  total_cached: 15950.5,
  vehicle: withClient(VEHICLE_R56),
  labor_lines: [
    labor({
      id: 'll-oil',
      template_id: 'tpl-oil',
      name: 'Замена масла и фильтра',
      hours: 1,
      discount_type: 'percent',
      discount_value: 10,
      group_key: GRP_OIL,
      group_name: 'Замена масла и фильтра',
      group_sort: 0,
      sort: 0,
    }),
    labor({
      id: 'll-pads',
      template_id: 'tpl-pads',
      name: 'Замена передних колодок',
      price_override: 2800,
      group_key: GRP_PADS,
      group_name: 'Передние тормоза',
      group_sort: 1,
      sort: 0,
    }),
  ],
  part_lines: [
    part({
      id: 'pl-oil',
      name: 'Масло моторное 5W-30',
      manufacturer: 'Castrol',
      catalog_number: 'EDGE-5W30',
      qty: 4,
      unit: 'l',
      unit_price: 1250,
      group_key: GRP_OIL,
      group_name: 'Замена масла и фильтра',
      group_sort: 0,
      sort: 1,
    }),
    part({
      id: 'pl-filter',
      name: 'Фильтр масляный',
      manufacturer: 'Mann',
      catalog_number: 'HU 7010 z',
      unit_price: 890,
      group_key: GRP_OIL,
      group_name: 'Замена масла и фильтра',
      group_sort: 0,
      sort: 2,
    }),
    part({
      id: 'pl-pads',
      name: 'Колодки тормозные передние',
      manufacturer: 'Brembo',
      catalog_number: 'P 06 073',
      unit_price: 5400,
      group_key: GRP_PADS,
      group_name: 'Передние тормоза',
      group_sort: 1,
      sort: 1,
    }),
  ],
});

/** Just-created order: no lines, no title — the page auto-deletes it on leave. */
export const WO_EMPTY: WorkOrder = baseWo({
  id: 'wo-empty',
  vehicle_id: VEHICLE_F56.id,
  vehicle: withClient(VEHICLE_F56),
});

const WO_DONE: WorkOrder = baseWo({
  id: 'wo-done',
  vehicle_id: VEHICLE_F56.id,
  assigned_master_id: MASTER.id,
  assigned_master: { id: MASTER.id, name: MASTER.name },
  status: 'done',
  title: 'Компьютерная диагностика',
  scheduled_at: '2026-11-17T14:00:00+03:00',
  scheduled_duration_min: 60,
  total_cached: 1500,
  vehicle: withClient(VEHICLE_F56),
  labor_lines: [
    labor({ id: 'll-diag', work_order_id: 'wo-done', name: 'Компьютерная диагностика', hours: 0.5 }),
  ],
});

const WO_WAITING: WorkOrder = baseWo({
  id: 'wo-waiting',
  vehicle_id: VEHICLE_R56.id,
  status: 'waiting',
  title: 'Замена ремня ГРМ',
  scheduled_at: '2026-11-19T11:00:00+03:00',
  scheduled_duration_min: 240,
  total_cached: 24800,
  vehicle: withClient(VEHICLE_R56),
});

const WO_CLOSED: WorkOrder = baseWo({
  id: 'wo-closed',
  vehicle_id: VEHICLE_R56.id,
  status: 'closed',
  title: 'Замена свечей',
  scheduled_at: '2026-10-20T10:00:00+03:00',
  scheduled_duration_min: 60,
  total_cached: 6400,
  total_frozen: 6400,
  paid_amount: 6400,
  closed_at: '2026-10-20T13:00:00+03:00',
  doc_number: 41,
  vehicle: withClient(VEHICLE_R56),
});

export const BOARD: Record<WorkOrderStatus, WorkOrder[]> = {
  scheduled: [{ ...WO_EMPTY, title: 'Диагностика подвески' }],
  in_progress: [WO_FULL],
  waiting: [WO_WAITING],
  done: [WO_DONE],
  closed: [WO_CLOSED],
};

/** Week of Mon 16 – Sun 22 Nov 2026 (now = Wed 18 Nov, 10:40). */
export const CALENDAR_WEEK: WorkOrder[] = [
  { ...WO_DONE },
  { ...WO_FULL },
  { ...WO_WAITING },
  {
    ...WO_CLOSED,
    id: 'wo-mon',
    title: 'Замена колодок',
    status: 'closed',
    scheduled_at: '2026-11-16T10:00:00+03:00',
    scheduled_duration_min: 90,
  },
];

export const CALENDAR_BLOCKS: CalendarBlock[] = [
  {
    id: 'block-lunch',
    title: 'Обед',
    starts_at: '2026-11-18T13:00:00+03:00',
    duration_min: 60,
    user_id: null,
    user: null,
    notes: null,
    created_by: OWNER.id,
    created_at: '2026-11-10T09:00:00+03:00',
  },
];

// ---------------------------------------------------------------------- stub

export interface StubData {
  /** Logged-in user (`/auth/me`). */
  me: AuthUser;
  settings: AppSettings;
  users: User[];
  /** Detail orders by id (`/work-orders/:id`). */
  workOrders: Record<string, WorkOrder>;
  /** Flat list (`/work-orders`) — the client card filters it by client. */
  workOrdersList: WorkOrder[];
  board: Record<WorkOrderStatus, WorkOrder[]>;
  calendar: WorkOrder[];
  calendarBlocks: CalendarBlock[];
  templates: TaskTemplate[];
  templatePreview: TemplatePreview;
  client: Client;
  clientVehicles: Vehicle[];
  generations: VehicleGeneration[];
  priceList: PriceListRow[];
  partTemplates: PartTemplate[];
  searchHits: SearchHit[];
}

export const DEFAULT_STUB: StubData = {
  me: OWNER,
  settings: SETTINGS,
  users: USERS,
  workOrders: { [WO_FULL.id]: WO_FULL, [WO_EMPTY.id]: WO_EMPTY },
  workOrdersList: [WO_FULL, WO_DONE, WO_WAITING, WO_CLOSED, WO_EMPTY],
  board: BOARD,
  calendar: CALENDAR_WEEK,
  calendarBlocks: CALENDAR_BLOCKS,
  templates: TEMPLATES,
  templatePreview: TEMPLATE_PREVIEW,
  client: CLIENT,
  clientVehicles: CLIENT_VEHICLES,
  generations: GENERATIONS,
  priceList: PRICE_LIST,
  partTemplates: PART_TEMPLATES,
  searchHits: SEARCH_HITS,
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * Answer every `/api/**` GET from `StubData` (merged over `DEFAULT_STUB`).
 * Mutations get an empty `{}` 200 from the catch-all unless a test registers its
 * own route afterwards. Also seeds the JWT and a stable UI state in localStorage.
 */
export async function stubApi(page: Page, overrides: Partial<StubData> = {}): Promise<void> {
  const d: StubData = { ...DEFAULT_STUB, ...overrides };

  await page.addInitScript(() => {
    localStorage.setItem('crm-token', 'test-token');
    localStorage.setItem('crm-cal-orientation', 'vertical');
    localStorage.setItem('crm-price-generation', 'gen-r56');
  });

  // Registered first = lowest priority: any unmatched call (and every mutation).
  await page.route('**/api/**', (route) => json(route, {}));

  // Data routes: GET only, other methods fall through to the catch-all.
  const get = (match: (path: string, url: URL) => boolean, body: (path: string, url: URL) => unknown) =>
    page.route(
      (url) => url.pathname.startsWith('/api/') && match(url.pathname.slice(4), url),
      (route) => {
        if (route.request().method() !== 'GET') return route.fallback();
        const url = new URL(route.request().url());
        const out = body(url.pathname.slice(4), url);
        return out === undefined ? json(route, { message: 'Not Found' }, 404) : json(route, out);
      },
    );

  get((p) => p === '/auth/me', () => d.me);
  get((p) => p === '/settings', () => d.settings);
  get((p) => p === '/users', () => d.users);
  get((p) => p === '/task-templates', () => d.templates);
  get((p) => p === '/vehicle-generations', () => d.generations);
  get((p) => p === '/price-list', () => d.priceList);
  get((p) => p === '/part-templates', () => d.partTemplates);
  get((p) => p === '/calendar-blocks', () => d.calendarBlocks);
  get((p) => p === '/search', (_p, url) => {
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    return d.searchHits.filter((h) =>
      [h.full_name, h.vin, h.plate, h.phone].some((f) => f?.toLowerCase().includes(q)),
    );
  });

  get((p) => p === '/clients/' + d.client.id, () => d.client);
  get((p) => p === `/clients/${d.client.id}/vehicles`, () => d.clientVehicles);

  get((p) => p === '/work-orders', () => d.workOrdersList);
  get((p) => p === '/work-orders/board', () => d.board);
  get((p) => p === '/work-orders/calendar', () => d.calendar);
  get(
    (p) => /^\/work-orders\/[^/]+$/.test(p) && p !== '/work-orders/board' && p !== '/work-orders/calendar',
    (p) => d.workOrders[p.split('/')[2]],
  );
  get((p) => /^\/work-orders\/[^/]+\/template-preview$/.test(p), () => d.templatePreview);
}
