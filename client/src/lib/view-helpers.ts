// Pure helpers shared by containers and pure *View components.
// Must stay free of api/auth/query/toast imports.
import { endOfWeek, format } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Users,
  LayoutGrid,
  CalendarDays,
  Archive,
  Upload,
  Settings,
  Tag,
  type LucideIcon,
} from 'lucide-react';
import { vehicleLabel } from './format';
import { canManageUsers, isPlainMaster } from './roles';
import type { TimelineEvent } from './schedule';
import type { TemplatePreview, UserRole, WorkOrder } from './types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { to: '/clients', label: 'Клиенты', icon: Users },
  { to: '/board', label: 'Доска', icon: LayoutGrid },
  { to: '/calendar', label: 'Календарь', icon: CalendarDays },
  { to: '/price-list', label: 'Прайс-лист', icon: Tag },
  { to: '/archive', label: 'Архив', icon: Archive },
  { to: '/import', label: 'Импорт базы', icon: Upload },
  { to: '/settings', label: 'Настройки', icon: Settings },
];

/**
 * A plain master has no business in Settings (rates, requisites, staff);
 * base import is owner-only.
 */
export function navForRole(role: UserRole | undefined): NavItem[] {
  return NAV.filter((n) => {
    if (n.to === '/settings' && isPlainMaster(role)) return false;
    if (n.to === '/price-list' && isPlainMaster(role)) return false;
    if (n.to === '/import' && !canManageUsers(role)) return false;
    return true;
  });
}

export function eventTitle(w: WorkOrder): string {
  return w.title?.trim() || `${vehicleLabel(w.vehicle)} ${w.vehicle?.plate || ''}`.trim();
}

export function workOrderToEvent(
  w: WorkOrder,
  defaultDurMin: number,
  opts: { showMaster?: boolean } = {},
): TimelineEvent | null {
  if (!w.scheduled_at) return null;
  return {
    id: w.id,
    start: new Date(w.scheduled_at),
    durationMin: w.scheduled_duration_min ?? defaultDurMin,
    status: w.status,
    title: eventTitle(w),
    subtitle: w.vehicle?.client?.full_name ?? '',
    masterName: opts.showMaster ? w.assigned_master?.name : undefined,
  };
}

export function calendarRangeLabel(view: 'week' | 'day', days: Date[]): string {
  return view === 'day'
    ? format(days[0], 'd MMMM yyyy', { locale: ru })
    : `${format(days[0], 'd MMM', { locale: ru })} — ${format(endOfWeek(days[0], { weekStartsOn: 1 }), 'd MMM yyyy', { locale: ru })}`;
}

export function templateTotal(
  preview: TemplatePreview | undefined,
  picked: ReadonlySet<string>,
  qty: Record<string, string>,
): number {
  if (!preview) return 0;
  const labor =
    preview.labor.price_override ?? (preview.labor.hours ?? 0) * preview.labor.rate_snapshot;
  const parts = preview.parts
    .filter((p) => picked.has(p.part_template_id))
    .reduce((s, p) => s + (Number(qty[p.part_template_id]) || 0) * (p.unit_price ?? 0), 0);
  return labor + parts;
}

export function isEmptyWo(w: WorkOrder | null): boolean {
  return (
    !!w &&
    w.status === 'scheduled' &&
    (w.labor_lines?.length ?? 0) === 0 &&
    (w.part_lines?.length ?? 0) === 0 &&
    !w.title?.trim() &&
    !w.notes?.trim() &&
    !w.complaint?.trim() &&
    !w.recommendation?.trim() &&
    !w.scheduled_at &&
    !w.discount_type
  );
}
