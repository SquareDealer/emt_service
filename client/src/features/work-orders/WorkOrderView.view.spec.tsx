import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { WorkOrderView } from './WorkOrderView';
import type { WorkOrderViewProps } from './WorkOrderView';
import { money, orderTotal } from '../../lib/format';
import type { Client, LaborLine, PartLine, Vehicle, WorkOrder } from '../../lib/types';

// ---------------------------------------------------------------- fixture
// Copy of WO_FULL from e2e/desktop/stub.ts (e2e/ is outside the unit-test tree).

const CLIENT: Client = {
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

const MASTER = { id: 'user-master', name: 'Тимур Газизов' };

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

const WO_FULL: WorkOrder = {
  id: 'wo-full',
  vehicle_id: VEHICLE_R56.id,
  assigned_master_id: MASTER.id,
  assigned_master: { id: MASTER.id, name: MASTER.name },
  status: 'in_progress',
  title: 'ТО и тормоза',
  notes: null,
  complaint: 'Скрип при торможении, пора менять масло',
  recommendation: 'Проверить задние колодки через 10 000 км',
  scheduled_at: '2026-11-18T09:00:00+03:00',
  scheduled_duration_min: 180,
  discount_type: 'percent',
  discount_value: 5,
  total_cached: 15950.5,
  total_frozen: null,
  paid_amount: 0,
  closed_at: null,
  doc_number: null,
  order_doc_number: null,
  created_at: '2026-11-17T18:00:00+03:00',
  vehicle: { ...VEHICLE_R56, client: CLIENT },
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
};

// ---------------------------------------------------------------- harness

const noop = () => {};
const base = (over: Partial<WorkOrderViewProps> = {}): WorkOrderViewProps => ({
  wo: WO_FULL,
  back: { to: '/board', label: 'Доска' },
  templates: [{ id: 'tpl-oil', name: 'Замена масла и фильтра', default_hours: 1, default_price: null, active: true }],
  staff: [],
  canAssign: true,
  laborRate: 3000,
  editLaborId: null,
  editPartId: null,
  pending: {},
  scheduleSlot: <div data-demo="wo-schedule" />,
  onUpdate: noop,
  onStatus: noop,
  onCloseOrder: noop,
  onPdf: noop,
  onOrderPdf: noop,
  onPaid: noop,
  onAddLabor: noop,
  onEditLabor: noop,
  onDelLabor: noop,
  onAddPart: noop,
  onEditPart: noop,
  onDelPart: noop,
  onRenameGroup: noop,
  onMoveGroup: noop,
  onUngroup: noop,
  onPickTemplate: noop,
  onDuplicate: noop,
  onAskDelete: noop,
  onSave: noop,
  onStartEditLabor: noop,
  onStartEditPart: noop,
  ...over,
});
const html = (p: Partial<WorkOrderViewProps> = {}) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <WorkOrderView {...base(p)} />
    </MemoryRouter>,
  );

/** Opening tags of every <button> whose aria-label is one of the line-edit actions. */
const lineEditButtons = (h: string) =>
  h.match(/<button[^>]*aria-label="(Изменить|Удалить|Добавить работу|Добавить запчасть|Выше|Ниже|Переименовать блок|Разгруппировать)"[^>]*>/g) ?? [];

describe('WorkOrderView', () => {
  it('wo-total shows the order total', () => {
    const h = html();
    const m = h.match(/data-demo="wo-total"[^>]*>(.*?)<\/div>/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('Итого');
    expect(m![1]).toContain(money(orderTotal(WO_FULL)));
  });

  it('renders one estimate-group per block, in group_sort order', () => {
    const ids = [...html().matchAll(/data-demo="estimate-group" data-id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual([GRP_OIL, GRP_PADS]);
  });

  it('carries the data-demo hooks', () => {
    const h = html();
    for (const name of [
      'wo-title', 'wo-status', 'wo-delete', 'add-from-price', 'labor-panel', 'labor-add', 'parts-panel',
      'part-add', 'wo-summary', 'wo-master', 'wo-schedule', 'wo-discount', 'wo-total', 'wo-paid', 'wo-save',
      'wo-close', 'wo-order-pdf', 'wo-duplicate',
    ]) {
      expect(h, name).toContain(`data-demo="${name}"`);
    }
    expect(h.match(/data-demo="labor-row"/g)).toHaveLength(2);
    expect(h.match(/data-demo="part-row"/g)).toHaveLength(3);
    expect(html({ wo: { ...WO_FULL, status: 'closed', total_frozen: 15950.5 } })).toContain('data-demo="wo-report-pdf"');
  });

  it('laborDraft fills the line being edited', () => {
    const h = html({ editLaborId: 'll-oil', laborDraft: { name: 'Замена цепи' } });
    expect(h.match(/<input[^>]*value="Замена цепи"/g)).toHaveLength(1);
    // The read-only row of the edited line is replaced by the form.
    expect(h.match(/data-demo="labor-row"/g)).toHaveLength(1);
    expect(html()).not.toContain('Замена цепи');
  });

  it('laborDraft / partDraft fill the add forms when nothing is being edited', () => {
    const h = html({ laborDraft: { name: 'Замена цепи', hours: '2' }, partDraft: { name: 'Цепь ГРМ', price: '9800' } });
    expect(h).toMatch(/data-demo="labor-add"(?:(?!data-demo=).)*value="Замена цепи"(?:(?!data-demo=).)*value="2"/);
    expect(h).toMatch(/data-demo="part-add"(?:(?!data-demo=).)*value="Цепь ГРМ"(?:(?!data-demo=).)*value="9800"/);
  });

  it('highlightLineId sets one data-highlight, hoverLineId one data-hover', () => {
    const h = html({ highlightLineId: 'pl-filter' });
    expect(h.match(/data-highlight/g)).toHaveLength(1);
    expect(h).toMatch(/data-demo="part-row"[^>]*data-highlight/);
    const g = html({ hoverLineId: 'll-pads' });
    expect(g.match(/data-hover/g)).toHaveLength(1);
    expect(g).toMatch(/data-demo="labor-row"[^>]*data-hover/);
    const n = html();
    expect(n).not.toContain('data-highlight');
    expect(n).not.toContain('data-hover');
  });

  it('rowStyle merges into estimate rows by running index', () => {
    const h = html({ rowStyle: (i) => (i === 3 ? { marginTop: 7 } : {}) });
    expect(h.match(/margin-top:7px/g)).toHaveLength(1);
    // index 3 = second part line (labor 0..1, parts 2..4)
    expect(h).toMatch(/data-demo="part-row"[^>]*style="margin-top:7px"[^>]*>(?:(?!data-demo=).)*Фильтр масляный/);
    expect(html()).not.toContain('margin-top:7px');
  });

  it('line edit controls are live on an open order', () => {
    // Add buttons need a name (and a price for parts) — the drafts supply them.
    const btns = lineEditButtons(html({ laborDraft: { name: 'Ремонт' }, partDraft: { name: 'Цепь', price: '100' } }));
    expect(btns).toHaveLength(2 * 2 + 3 * 2 + 2 + 2 * 4);
    expect(btns.filter((b) => /\sdisabled=""/.test(b))).toHaveLength(0);
    // Without drafts the empty add forms keep their buttons disabled, as before.
    expect(lineEditButtons(html()).filter((b) => /\sdisabled=""/.test(b))).toHaveLength(2);
  });

  it('a closed order offers no enabled line edit controls', () => {
    const h = html({ wo: { ...WO_FULL, status: 'closed', total_frozen: 15950.5 } });
    expect(lineEditButtons(h).filter((b) => !/\sdisabled=""/.test(b))).toHaveLength(0);
    expect(h).not.toContain('data-demo="add-from-price"');
    expect(h).toMatch(/<input[^>]*data-demo="wo-title"[^>]*disabled=""|<input[^>]*disabled=""[^>]*data-demo="wo-title"/);
  });

  it('pending flags disable their buttons', () => {
    const h = html({ pending: { close: true, delete: true } });
    expect(h).toMatch(/<button[^>]*data-demo="wo-close"[^>]*disabled=""/);
    expect(h).toMatch(/<button[^>]*data-demo="wo-delete"[^>]*disabled=""/);
    expect(html()).not.toMatch(/<button[^>]*data-demo="wo-close"[^>]*disabled=""/);
  });
});
