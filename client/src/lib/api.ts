import type {
  AppSettings,
  ArchiveSort,
  AuthUser,
  CalendarBlock,
  Client,
  ImportReport,
  Paginated,
  PartTemplate,
  PriceListRow,
  TaskTemplatePart,
  TemplatePreview,
  SearchHit,
  TaskTemplate,
  User,
  UserRole,
  Vehicle,
  VehicleGeneration,
  WorkOrder,
  WorkOrderStatus,
} from './types';

// API lives under /api (same-origin behind the reverse proxy in prod; the Vite
// dev proxy forwards /api → backend). Override with VITE_API_URL only to point at
// an absolute backend (e.g. a separate API domain).
const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'crm-token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  /** Parsed response body, when JSON — lets callers read extra fields (e.g. clientId). */
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type Opts = { body?: unknown; form?: FormData; method?: string };

async function request<T>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const method = opts.method ?? (body ? 'POST' : 'GET');
  const res = await fetch(BASE + path, { method, headers, body });

  if (res.status === 401) {
    setToken(null);
    if (!path.startsWith('/auth/')) {
      window.dispatchEvent(new CustomEvent('crm-unauthorized'));
    }
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ||
      `Ошибка ${res.status}`;
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : String(msg), data);
  }
  return data as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

/** Binary GET (e.g. PDF). JWT goes in the header, so a plain <a href> won't do. */
async function requestBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { headers });

  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new CustomEvent('crm-unauthorized'));
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const data = text ? safeJson(text) : null;
    const msg = (data && (data.message || data.error)) || `Ошибка ${res.status}`;
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : String(msg), data);
  }
  return res.blob();
}

export const api = {
  // auth
  login: (login: string, password: string) =>
    request<{ access_token: string; user: AuthUser }>('/auth/login', {
      body: { login, password },
    }),
  me: () => request<AuthUser>('/auth/me'),

  // users (staff)
  users: () => request<User[]>('/users'),
  createUser: (body: { name: string; login: string; password: string; role: UserRole }) =>
    request<User>('/users', { body }),
  updateUser: (
    id: string,
    body: Partial<{ name: string; role: UserRole; password: string; is_active: boolean }>,
  ) => request<User>(`/users/${id}`, { method: 'PATCH', body }),
  deleteUser: (id: string) =>
    request<{ id: string }>(`/users/${id}`, { method: 'DELETE' }),

  // clients
  clients: () => request<Client[]>('/clients'),
  client: (id: string) => request<Client>(`/clients/${id}`),
  createClient: (body: Partial<Client>) => request<Client>('/clients', { body }),
  updateClient: (id: string, body: Partial<Client>) =>
    request<Client>(`/clients/${id}`, { method: 'PATCH', body }),
  deleteClient: (id: string) =>
    request<void>(`/clients/${id}`, { method: 'DELETE' }),
  clientVehicles: (id: string) => request<Vehicle[]>(`/clients/${id}/vehicles`),
  importClients: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<ImportReport>('/clients/import', { form });
  },

  // vehicles
  createVehicle: (body: Partial<Vehicle>) => request<Vehicle>('/vehicles', { body }),
  vehicle: (id: string) => request<Vehicle & { client?: Client }>(`/vehicles/${id}`),
  updateVehicle: (id: string, body: Partial<Vehicle>) =>
    request<Vehicle>(`/vehicles/${id}`, { method: 'PATCH', body }),

  // vehicle generations (справочник поколений — ключ прайс-листа)
  vehicleGenerations: (all = false) =>
    request<VehicleGeneration[]>(`/vehicle-generations${all ? '?all=1' : ''}`),
  createVehicleGeneration: (body: Partial<VehicleGeneration>) =>
    request<VehicleGeneration>('/vehicle-generations', { body }),
  updateVehicleGeneration: (id: string, body: Partial<VehicleGeneration>) =>
    request<VehicleGeneration>(`/vehicle-generations/${id}`, { method: 'PATCH', body }),
  /** Soft delete — the row is retired, not removed (vehicles reference it). */
  deactivateVehicleGeneration: (id: string) =>
    request<VehicleGeneration>(`/vehicle-generations/${id}`, { method: 'DELETE' }),

  // calendar blocks (резервные записи — время занято, но это не наряд)
  calendarBlocks: (from: string, to: string) =>
    request<CalendarBlock[]>(
      `/calendar-blocks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  createCalendarBlock: (body: Partial<CalendarBlock>) =>
    request<CalendarBlock>('/calendar-blocks', { body }),
  updateCalendarBlock: (id: string, body: Partial<CalendarBlock>) =>
    request<CalendarBlock>(`/calendar-blocks/${id}`, { method: 'PATCH', body }),
  deleteCalendarBlock: (id: string) =>
    request<void>(`/calendar-blocks/${id}`, { method: 'DELETE' }),

  // work orders
  workOrders: () => request<WorkOrder[]>('/work-orders'),
  board: () => request<Record<WorkOrderStatus, WorkOrder[]>>('/work-orders/board'),
  calendar: (from: string, to: string) =>
    request<WorkOrder[]>(`/work-orders/calendar?from=${from}&to=${to}`),
  archive: (p: { q?: string; sort?: ArchiveSort; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    if (p.q) qs.set('q', p.q);
    if (p.sort) qs.set('sort', p.sort);
    if (p.page) qs.set('page', String(p.page));
    if (p.pageSize) qs.set('pageSize', String(p.pageSize));
    return request<Paginated<WorkOrder>>(`/work-orders/archive?${qs}`);
  },
  workOrder: (id: string) => request<WorkOrder>(`/work-orders/${id}`),
  createWorkOrder: (body: Partial<WorkOrder>) =>
    request<WorkOrder>('/work-orders', { body }),
  updateWorkOrder: (id: string, body: Partial<WorkOrder>) =>
    request<WorkOrder>(`/work-orders/${id}`, { method: 'PATCH', body }),
  setStatus: (id: string, status: WorkOrderStatus) =>
    request<WorkOrder>(`/work-orders/${id}/status`, { method: 'PATCH', body: { status } }),
  closeWorkOrder: (id: string) =>
    request<WorkOrder>(`/work-orders/${id}/close`, { method: 'POST' }),
  deleteWorkOrder: (id: string) =>
    request<void>(`/work-orders/${id}`, { method: 'DELETE' }),
  addLabor: (id: string, body: Record<string, unknown>) =>
    request<WorkOrder>(`/work-orders/${id}/labor`, { body }),
  updateLabor: (id: string, lineId: string, body: Record<string, unknown>) =>
    request<WorkOrder>(`/work-orders/${id}/labor/${lineId}`, { method: 'PATCH', body }),
  removeLabor: (id: string, lineId: string) =>
    request<WorkOrder>(`/work-orders/${id}/labor/${lineId}`, { method: 'DELETE' }),
  addPart: (id: string, body: Record<string, unknown>) =>
    request<WorkOrder>(`/work-orders/${id}/parts`, { body }),
  updatePart: (id: string, lineId: string, body: Record<string, unknown>) =>
    request<WorkOrder>(`/work-orders/${id}/parts/${lineId}`, { method: 'PATCH', body }),
  removePart: (id: string, lineId: string) =>
    request<WorkOrder>(`/work-orders/${id}/parts/${lineId}`, { method: 'DELETE' }),
  /** Copy the order (optionally onto another car) — the estimate comes along. */
  duplicateWorkOrder: (id: string, vehicle_id?: string) =>
    request<WorkOrder>(`/work-orders/${id}/duplicate`, { body: { vehicle_id } }),

  /** What applying a price-list entry would add — shown for confirmation. */
  templatePreview: (id: string, templateId: string) =>
    request<TemplatePreview>(`/work-orders/${id}/template-preview?template_id=${templateId}`),
  applyTemplate: (
    id: string,
    body: { template_id: string; part_template_ids?: string[]; qty?: Record<string, number> },
  ) => request<WorkOrder>(`/work-orders/${id}/apply-template`, { body }),

  // estimate blocks
  renameGroup: (id: string, groupKey: string, name: string) =>
    request<WorkOrder>(`/work-orders/${id}/groups/${groupKey}`, { method: 'PATCH', body: { name } }),
  moveGroup: (id: string, groupKey: string, direction: 'up' | 'down') =>
    request<WorkOrder>(`/work-orders/${id}/groups/${groupKey}/move`, { body: { direction } }),
  ungroup: (id: string, groupKey: string) =>
    request<WorkOrder>(`/work-orders/${id}/groups/${groupKey}`, { method: 'DELETE' }),

  setPaid: (id: string, paid_amount: number) =>
    request<WorkOrder>(`/work-orders/${id}/paid`, { method: 'PATCH', body: { paid_amount } }),
  workOrderPdf: (id: string) => requestBlob(`/work-orders/${id}/pdf`),
  workOrderOrderPdf: (id: string) => requestBlob(`/work-orders/${id}/order-pdf`),

  // price list (works priced per generation)
  priceList: (generationId?: string) =>
    request<PriceListRow[]>(`/price-list${generationId ? `?generation_id=${generationId}` : ''}`),
  setPrice: (templateId: string, generationId: string, body: { hours?: number | null; price?: number | null }) =>
    request<unknown>(`/price-list/${templateId}/${generationId}`, { method: 'PUT', body }),
  /** Reset a work to the shared base price for that generation. */
  clearPrice: (templateId: string, generationId: string) =>
    request<void>(`/price-list/${templateId}/${generationId}`, { method: 'DELETE' }),
  copyPrices: (body: { from_generation_id: string; to_generation_id: string; mode?: 'replace' | 'fill' }) =>
    request<{ copied: number; skipped: number }>('/price-list/copy', { body }),

  // parts a work pulls in
  templateParts: (templateId: string) =>
    request<TaskTemplatePart[]>(`/price-list/${templateId}/parts`),
  attachTemplatePart: (
    templateId: string,
    partTemplateId: string,
    body: { generation_id?: string | null; qty?: number | null; is_default?: boolean; slot?: string | null },
  ) => request<TaskTemplatePart>(`/price-list/${templateId}/parts/${partTemplateId}`, { method: 'PUT', body }),
  detachTemplatePart: (templateId: string, partTemplateId: string, generationId?: string | null) =>
    request<void>(
      `/price-list/${templateId}/parts/${partTemplateId}${generationId ? `?generation_id=${generationId}` : ''}`,
      { method: 'DELETE' },
    ),

  // parts catalog
  partTemplates: (q?: string) =>
    request<PartTemplate[]>(`/part-templates${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  createPartTemplate: (body: Partial<PartTemplate>) =>
    request<PartTemplate>('/part-templates', { body }),
  updatePartTemplate: (id: string, body: Partial<PartTemplate>) =>
    request<PartTemplate>(`/part-templates/${id}`, { method: 'PATCH', body }),
  deactivatePartTemplate: (id: string) =>
    request<PartTemplate>(`/part-templates/${id}`, { method: 'DELETE' }),

  // templates & settings
  templates: () => request<TaskTemplate[]>('/task-templates'),
  updateTemplate: (id: string, body: Partial<TaskTemplate>) =>
    request<TaskTemplate>(`/task-templates/${id}`, { method: 'PATCH', body }),
  createTemplate: (body: Partial<TaskTemplate>) =>
    request<TaskTemplate>('/task-templates', { body }),
  deleteTemplate: (id: string) =>
    request<void>(`/task-templates/${id}`, { method: 'DELETE' }),
  settings: () => request<AppSettings>('/settings'),
  updateSettings: (body: Partial<AppSettings>) =>
    request<AppSettings>('/settings', { method: 'PATCH', body }),

  // search
  search: (q: string) => request<SearchHit[]>(`/search?q=${encodeURIComponent(q)}`),
};
