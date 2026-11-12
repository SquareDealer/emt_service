import { WorkOrderPdfService } from './work-order-pdf.service';
import { PricingService } from '../pricing.service';
import { WorkOrder } from '../../entities/work-order.entity';
import { LaborLine } from '../../entities/labor-line.entity';
import { PartLine } from '../../entities/part-line.entity';

/**
 * Asserts on the table data, not on rendered bytes: the builders return plain
 * rows and the pdfmake wrappers are trivial. Byte snapshots of a PDF would be
 * unreadable and would churn on every font or layout tweak.
 */

function labor(p: Partial<LaborLine> = {}): LaborLine {
  return {
    id: 'l1',
    work_order_id: 'wo1',
    template_id: null,
    name: 'Замена масла',
    hours: 2,
    rate_snapshot: 1500,
    price_override: null,
    discount_type: null,
    discount_value: null,
    group_key: null,
    group_name: null,
    group_sort: 0,
    sort: 0,
    ...p,
  } as LaborLine;
}

function part(p: Partial<PartLine> = {}): PartLine {
  return {
    id: 'p1',
    work_order_id: 'wo1',
    name: 'Масло Castrol EDGE 5W-30',
    catalog_number: '15A4D5',
    manufacturer: 'Castrol',
    qty: 5,
    unit: 'l',
    unit_price: 900,
    discount_type: null,
    discount_value: null,
    group_key: null,
    group_name: null,
    group_sort: 0,
    sort: 0,
    ...p,
  } as PartLine;
}

const svc = new WorkOrderPdfService(new PricingService());
const col = (table: { head: string[] }, name: string) => table.head.indexOf(name);

describe('calculation tables («Смета»)', () => {
  it('keeps the article in its own column', () => {
    const t = svc.partsRows([part()]);
    const i = col(t, 'Артикул');
    expect(i).toBeGreaterThan(-1);
    expect(t.body[0][i]).toBe('15A4D5');
  });

  it('shows the manufacturer under the part name', () => {
    const t = svc.partsRows([part()]);
    expect(t.body[0][1]).toBe('Масло Castrol EDGE 5W-30\nCastrol');
  });

  it('leaves the name alone when there is no manufacturer', () => {
    const t = svc.partsRows([part({ manufacturer: null })]);
    expect(t.body[0][1]).toBe('Масло Castrol EDGE 5W-30');
  });

  it('drops the column that printed the rate twice', () => {
    // «Цена за нормо-час» and «Цена за 1 н.ч. без скидки» were the same value.
    const t = svc.laborRows([labor()]);
    expect(t.head).toContain('Цена за нормо-час');
    expect(t.head).not.toContain('Цена за 1 н.ч. без скидки');
  });

  it('every column has a width', () => {
    for (const t of [svc.laborRows([labor()]), svc.partsRows([part()])]) {
      expect(t.widths).toHaveLength(t.head.length);
      expect(t.body[0]).toHaveLength(t.head.length);
    }
  });
});

/** Build a work order carrying the given lines. */
function order(labor: LaborLine[], parts: PartLine[]): WorkOrder {
  return { labor_lines: labor, part_lines: parts } as WorkOrder;
}

describe('order document blocks («Заказ-наряд»)', () => {
  const G = 'group-1';

  it('does not print the article anywhere', () => {
    const [block] = svc.orderBlocks(order([], [part()]));
    expect(block.table.head).not.toContain('Артикул');
    expect(block.table.body.flat().join(' | ')).not.toContain('15A4D5');
  });

  it('still identifies the part by manufacturer', () => {
    const [block] = svc.orderBlocks(order([], [part()]));
    expect(block.table.body[0][1]).toBe('Масло Castrol EDGE 5W-30 · Castrol');
  });

  it('groups a work with its parts into one block that totals itself', () => {
    // 2 ч × 1500 = 3000 plus 5 л × 900 = 4500
    const blocks = svc.orderBlocks(
      order(
        [labor({ group_key: G, group_name: 'Замена масла' })],
        [part({ group_key: G, group_name: 'Замена масла' })],
      ),
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe('Замена масла');
    expect(blocks[0].total).toBe('7500.00');
    expect(blocks[0].table.body).toHaveLength(2);
  });

  it('numbers the lines within each block', () => {
    const blocks = svc.orderBlocks(
      order(
        [labor({ group_key: G, group_name: 'Блок' })],
        [part({ group_key: G, group_name: 'Блок' })],
      ),
    );
    expect(blocks[0].table.body.map((r) => r[0])).toEqual(['1', '2']);
  });

  it('shows quantity in the units the line uses', () => {
    const blocks = svc.orderBlocks(
      order([labor({ group_key: G, group_name: 'Б' })], [part({ group_key: G, group_name: 'Б' })]),
    );
    const rows = blocks[0].table.body;
    expect(rows[0][2]).toBe('2.00 н/ч'); // labour → normo-hours
    expect(rows[1][2]).toBe('5.00 л'); // part → its own unit
  });

  it('keeps a parts-only block when the work line is deleted', () => {
    // Deleting the work must not orphan the parts — the block survives under
    // the same heading, which is the point of denormalized groups.
    const [block] = svc.orderBlocks(order([], [part({ group_key: G, group_name: 'Замена масла' })]));
    expect(block.name).toBe('Замена масла');
    expect(block.total).toBe('4500.00');
  });

  it('puts ungrouped lines in a trailing block', () => {
    const blocks = svc.orderBlocks(
      order([labor({ group_key: G, group_name: 'Замена масла' }), labor({ name: 'Разное' })], []),
    );
    expect(blocks.map((b) => b.name)).toEqual(['Замена масла', 'Прочие работы и запчасти']);
  });

  it('uses a plain heading when nothing is grouped', () => {
    const [block] = svc.orderBlocks(order([labor()], [part()]));
    expect(block.name).toBe('Работы и запчасти');
  });
});

describe('the «Скидка» column carries real values', () => {
  it('is blank when the line has no discount, not a hardcoded 0.00', () => {
    for (const t of [svc.laborRows([labor()]), svc.partsRows([part()])]) {
      expect(t.body[0][col(t, 'Скидка')]).toBe('');
    }
    const [block] = svc.orderBlocks({ labor_lines: [labor()], part_lines: [part()] } as WorkOrder);
    expect(block.table.body[0][col(block.table, 'Скидка')]).toBe('');
  });

  it('prints the percent discount and the reduced total', () => {
    // 2 ч × 1500 = 3000, −10% = 300 → 2700
    const t = svc.laborRows([labor({ discount_type: 'percent', discount_value: 10 })]);
    const row = t.body[0];
    expect(row[col(t, 'Цена без скидки')]).toBe('3000.00');
    expect(row[col(t, 'Скидка')]).toBe('300.00');
    expect(row[col(t, 'Сумма')]).toBe('2700.00');
  });

  it('prints a fixed discount capped at the line value', () => {
    // 5 л × 900 = 4500, fixed 9999 cannot take more than the line itself
    const t = svc.partsRows([part({ discount_type: 'fixed', discount_value: 9999 })]);
    const row = t.body[0];
    expect(row[col(t, 'Скидка')]).toBe('4500.00');
    expect(row[col(t, 'Сумма')]).toBe('0.00');
  });

  it('«Цена без скидки» and «Сумма» differ once a discount exists', () => {
    const t = svc.partsRows([part({ discount_type: 'percent', discount_value: 20 })]);
    const row = t.body[0];
    expect(row[col(t, 'Цена без скидки')]).not.toBe(row[col(t, 'Сумма')]);
  });
});

describe('empty estimates', () => {
  it('produces no rows rather than a fake one', () => {
    for (const t of [svc.laborRows([]), svc.partsRows([])]) {
      expect(t.body).toEqual([]);
    }
    expect(svc.orderBlocks({ labor_lines: [], part_lines: [] } as unknown as WorkOrder)).toEqual([]);
  });
});

describe('calculation title — printable before the order is closed', () => {
  it('prints number and close date for a closed order', () => {
    expect(svc.calcTitleLine({ doc_number: 17, closed_at: new Date(2026, 2, 5, 10) })).toBe(
      '№ 17 от 05-03-2026',
    );
  });

  it('drops the number and dates an open order by today', () => {
    expect(
      svc.calcTitleLine({ doc_number: null, closed_at: null }, new Date(2026, 10, 12, 9)),
    ).toBe('от 12-11-2026');
  });

  it('renders a real PDF for an open order with an empty estimate', async () => {
    const open = {
      id: 'wo1', status: 'in_progress', doc_number: null, closed_at: null,
      total_cached: 0, total_frozen: null, paid_amount: 0,
      labor_lines: [], part_lines: [],
    } as unknown as WorkOrder;
    const settings = { companyName: 'EMT', companyInn: '', companyAddress: '', companyPhone: '', vatRate: 0 };
    const buf = await svc.build(open, settings, 'calc');
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });
});

describe('document header — logo centred, shared by both documents', () => {
  const settings = { companyName: 'EMT', companyInn: '7700000000', companyAddress: 'Москва', companyPhone: '', vatRate: 0 };
  const widths = (cols: unknown[]) => cols.map((c) => (c as { width: unknown }).width);

  it('flanks the logo with two equal star columns', () => {
    const cols = svc.headerColumns('data:image/png;base64,AAAA', settings, 'EMT');
    expect(widths(cols)).toEqual(['*', 130, '*']);
    expect(cols[1]).toMatchObject({ image: 'data:image/png;base64,AAAA', alignment: 'center' });
    expect(JSON.stringify(cols[2])).toContain('7700000000'); // requisites stay on the right
  });

  it('keeps the geometry and prints no placeholder when the logo file is missing', () => {
    const cols = svc.headerColumns(null, settings, 'EMT');
    expect(widths(cols)).toEqual(['*', 130, '*']);
    expect(JSON.stringify(cols)).not.toContain('STO');
    expect(cols[1]).not.toHaveProperty('image');
  });
});
