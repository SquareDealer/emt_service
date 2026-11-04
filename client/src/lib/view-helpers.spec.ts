import { describe, expect, it } from 'vitest';
import {
  calendarRangeLabel,
  isEmptyWo,
  navForRole,
  templateTotal,
  workOrderToEvent,
} from './view-helpers';
import type { TemplatePreview, WorkOrder } from './types';

const wo = (patch: Partial<WorkOrder> = {}): WorkOrder =>
  ({
    id: 'w1',
    status: 'scheduled',
    title: null,
    notes: null,
    complaint: null,
    recommendation: null,
    scheduled_at: null,
    scheduled_duration_min: null,
    discount_type: null,
    labor_lines: [],
    part_lines: [],
    ...patch,
  }) as unknown as WorkOrder;

describe('navForRole', () => {
  const tos = (role: Parameters<typeof navForRole>[0]) => navForRole(role).map((n) => n.to);

  it('hides settings and price list from a plain master', () => {
    expect(tos('master')).not.toContain('/settings');
    expect(tos('master')).not.toContain('/price-list');
  });
  it('shows import to the owner only', () => {
    expect(tos('owner')).toContain('/import');
    expect(tos('master_receptionist')).not.toContain('/import');
    expect(tos('master')).not.toContain('/import');
  });
  it('keeps settings for the receptionist', () => {
    expect(tos('master_receptionist')).toContain('/settings');
  });
});

describe('workOrderToEvent', () => {
  it('returns null without scheduled_at', () => {
    expect(workOrderToEvent(wo(), 60)).toBeNull();
  });
  it('falls back to the default duration', () => {
    const e = workOrderToEvent(wo({ scheduled_at: '2026-11-18T07:40:00Z' }), 45);
    expect(e?.durationMin).toBe(45);
    expect(e?.start.toISOString()).toBe('2026-11-18T07:40:00.000Z');
  });
  it('omits masterName when showMaster is false', () => {
    const w = wo({
      scheduled_at: '2026-11-18T07:40:00Z',
      assigned_master: { name: 'Иван' },
    } as Partial<WorkOrder>);
    expect(workOrderToEvent(w, 60, { showMaster: false })?.masterName).toBeUndefined();
    expect(workOrderToEvent(w, 60, { showMaster: true })?.masterName).toBe('Иван');
  });
});

describe('calendarRangeLabel', () => {
  it('formats a single day', () => {
    expect(calendarRangeLabel('day', [new Date(2026, 10, 18)])).toBe('18 ноября 2026');
  });
  it('formats a week', () => {
    const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 10, 16 + i));
    expect(calendarRangeLabel('week', days)).toBe('16 нояб. — 22 нояб. 2026');
  });
});

describe('templateTotal', () => {
  const preview = (labor: Partial<TemplatePreview['labor']>, parts: unknown[] = []) =>
    ({
      labor: { name: 'x', hours: null, rate_snapshot: 0, price_override: null, ...labor },
      parts,
    }) as unknown as TemplatePreview;

  it('sums override labor and picked parts', () => {
    const p = preview({ price_override: 5000 }, [
      { part_template_id: 'a', unit_price: 1000, qty: 2 },
      { part_template_id: 'b', unit_price: 300, qty: 1 },
    ]);
    expect(templateTotal(p, new Set(['a']), { a: '2', b: '1' })).toBe(7000);
  });
  it('uses hours times rate without parts', () => {
    expect(templateTotal(preview({ hours: 2, rate_snapshot: 2500 }), new Set(), {})).toBe(5000);
  });
  it('is 0 without a preview', () => {
    expect(templateTotal(undefined, new Set(), {})).toBe(0);
  });
});

describe('isEmptyWo', () => {
  it('is false for null (nothing to delete)', () => {
    expect(isEmptyWo(null)).toBe(false);
  });
  it('is true for a blank scheduled order', () => {
    expect(isEmptyWo(wo())).toBe(true);
  });
  it('is false with a line', () => {
    expect(isEmptyWo(wo({ labor_lines: [{}] as never }))).toBe(false);
  });
  it('is false with scheduled_at', () => {
    expect(isEmptyWo(wo({ scheduled_at: '2026-11-18T07:40:00Z' }))).toBe(false);
  });
});
