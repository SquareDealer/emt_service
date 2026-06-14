import type {
  AuthUser,
  Client,
  ImportReport,
  SearchHit,
  TaskTemplate,
  Vehicle,
  WorkOrder,
  WorkOrderStatus,
} from './types';

const BASE = import.meta.env.VITE_API_URL || '';
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
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
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
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : String(msg));
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

export const api = {
  // auth
  login: (login: string, password: string) =>
    request<{ access_token: string; user: AuthUser }>('/auth/login', {
      body: { login, password },
    }),
  me: () => request<AuthUser>('/auth/me'),

  // clients
  clients: () => request<Client[]>('/clients'),
  client: (id: string) => request<Client>(`/clients/${id}`),
  createClient: (body: Partial<Client>) => request<Client>('/clients', { body }),
  updateClient: (id: string, body: Partial<Client>) =>
    request<Client>(`/clients/${id}`, { method: 'PATCH', body }),
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

  // work orders
  workOrders: () => request<WorkOrder[]>('/work-orders'),
  board: () => request<Record<WorkOrderStatus, WorkOrder[]>>('/work-orders/board'),
  calendar: (from: string, to: string) =>
    request<WorkOrder[]>(`/work-orders/calendar?from=${from}&to=${to}`),
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
  removeLabor: (id: string, lineId: string) =>
    request<WorkOrder>(`/work-orders/${id}/labor/${lineId}`, { method: 'DELETE' }),
  addPart: (id: string, body: Record<string, unknown>) =>
    request<WorkOrder>(`/work-orders/${id}/parts`, { body }),
  removePart: (id: string, lineId: string) =>
    request<WorkOrder>(`/work-orders/${id}/parts/${lineId}`, { method: 'DELETE' }),

  // templates & settings
  templates: () => request<TaskTemplate[]>('/task-templates'),
  createTemplate: (body: Partial<TaskTemplate>) =>
    request<TaskTemplate>('/task-templates', { body }),
  deleteTemplate: (id: string) =>
    request<void>(`/task-templates/${id}`, { method: 'DELETE' }),
  settings: () => request<{ labor_rate: number }>('/settings'),
  updateSettings: (labor_rate: number) =>
    request<{ labor_rate: number }>('/settings', { method: 'PATCH', body: { labor_rate } }),

  // search
  search: (q: string) => request<SearchHit[]>(`/search?q=${encodeURIComponent(q)}`),
};
