import { describe, expect, it } from 'vitest';
import type { PartCostRow, PartLine } from '../../lib/types';
import { costRows, costTotals, linesSignature } from './part-costs';

function line(over: Partial<PartLine> & { id: string }): PartLine {
  return {
    work_order_id: 'wo1',
    name: `Деталь ${over.id}`,
    catalog_number: null,
    manufacturer: null,
    qty: 1,
    unit: 'pcs',
    unit_price: 1000,
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

function cost(id: string, purchase_price: number | null): PartCostRow {
  return { part_line_id: id, name: '', manufacturer: null, qty: 1, unit: 'pcs', purchase_price };
}

describe('costRows', () => {
  it('закупка строки = qty × цена, наценка от суммы строки', () => {
    const [row] = costRows([line({ id: 'a', qty: 2, unit_price: 6900 })], [cost('a', 4700)]);
    expect(row).toMatchObject({ sale: 13800, cost: 9400, markup: 4400, purchase_price: 4700 });
    expect(row.markup_pct).toBeCloseTo(4400 / 9400, 10);
  });

  it('скидка строки уменьшает sale', () => {
    const [row] = costRows(
      [line({ id: 'a', qty: 2, unit_price: 6900, discount_type: 'percent', discount_value: 10 })],
      [cost('a', 4700)],
    );
    expect(row.sale).toBe(12420);
    expect(row.markup).toBe(12420 - 9400);
  });

  it('нет записи о закупке → всё null, sale на месте', () => {
    const [row] = costRows([line({ id: 'a', qty: 2, unit_price: 6900 })], []);
    expect(row).toMatchObject({
      sale: 13800,
      purchase_price: null,
      cost: null,
      markup: null,
      markup_pct: null,
    });
  });

  it('закупка с purchase_price null в записи — как отсутствие', () => {
    const [row] = costRows([line({ id: 'a' })], [cost('a', null)]);
    expect(row).toMatchObject({ purchase_price: null, cost: null, markup: null, markup_pct: null });
  });

  it('закупка 0 → cost 0, markup = sale, markup_pct null', () => {
    const [row] = costRows([line({ id: 'a', qty: 2, unit_price: 6900 })], [cost('a', 0)]);
    expect(row).toMatchObject({ cost: 0, markup: 13800, markup_pct: null });
  });

  it('дробные литры не теряют копейки', () => {
    const [row] = costRows([line({ id: 'a', qty: 4.7, unit: 'l', unit_price: 1500 })], [cost('a', 980)]);
    expect(row.cost).toBe(4606);
    expect(row.unit).toBe('l');
  });

  it('сохраняет порядок строк наряда и переносит название и производителя', () => {
    const rows = costRows(
      [line({ id: 'b', manufacturer: 'Bosch' }), line({ id: 'a' }), line({ id: 'c' })],
      [cost('a', 10), cost('c', 20), cost('b', 30)],
    );
    expect(rows.map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(rows[0]).toMatchObject({ name: 'Деталь b', manufacturer: 'Bosch', purchase_price: 30 });
  });
});

describe('costTotals', () => {
  it('считает только известные и число пропусков', () => {
    const rows = costRows(
      [line({ id: 'a', qty: 2, unit_price: 6900 }), line({ id: 'b', unit_price: 500 })],
      [cost('a', 4700)],
    );
    expect(costTotals(rows)).toEqual({ sale: 13800, cost: 9400, markup: 4400, missing: 1 });
  });

  it('пустой список → нули', () => {
    expect(costTotals([])).toEqual({ sale: 0, cost: 0, markup: 0, missing: 0 });
  });
});

describe('linesSignature', () => {
  const base = [line({ id: 'a', qty: 1 }), line({ id: 'b', qty: 2 })];

  it('меняется при смене количества', () => {
    expect(linesSignature([line({ id: 'a', qty: 1 }), line({ id: 'b', qty: 3 })])).not.toBe(linesSignature(base));
  });

  it('меняется при удалении и добавлении строки', () => {
    expect(linesSignature(base.slice(0, 1))).not.toBe(linesSignature(base));
    expect(linesSignature([...base, line({ id: 'c' })])).not.toBe(linesSignature(base));
  });

  it('не меняется при смене цены', () => {
    const repriced = [line({ id: 'a', qty: 1, unit_price: 9 }), line({ id: 'b', qty: 2, unit_price: 9 })];
    expect(linesSignature(repriced)).toBe(linesSignature(base));
  });
});
