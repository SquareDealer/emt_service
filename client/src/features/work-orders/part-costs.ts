import { partTotal, round2 } from '../../lib/format';
import type { PartCostRow, PartLine, PartUnit } from '../../lib/types';

export interface CostRow {
  id: string;
  name: string;
  manufacturer: string | null;
  qty: number;
  unit: PartUnit;
  /** Сумма строки после скидки строки, до скидки наряда. */
  sale: number;
  /** Закупка за единицу; null — не указана. */
  purchase_price: number | null;
  cost: number | null;
  markup: number | null;
  markup_pct: number | null;
}

/** Строки запчастей наряда с закупкой; порядок — как в наряде. */
export function costRows(lines: PartLine[], costs: PartCostRow[]): CostRow[] {
  const byId = new Map(costs.map((c) => [c.part_line_id, c.purchase_price]));
  return lines.map((l) => {
    const sale = partTotal(l);
    const purchase_price = byId.get(l.id) ?? null;
    const cost = purchase_price === null ? null : round2(l.qty * purchase_price);
    const markup = cost === null ? null : round2(sale - cost);
    return {
      id: l.id,
      name: l.name,
      manufacturer: l.manufacturer,
      qty: l.qty,
      unit: l.unit,
      sale,
      purchase_price,
      cost,
      markup,
      markup_pct: cost !== null && markup !== null && cost > 0 ? markup / cost : null,
    };
  });
}

/** Итоги только по строкам с известной закупкой; missing — сколько строк без неё. */
export function costTotals(rows: CostRow[]): { sale: number; cost: number; markup: number; missing: number } {
  let sale = 0;
  let cost = 0;
  let markup = 0;
  let missing = 0;
  for (const r of rows) {
    if (r.cost === null || r.markup === null) {
      missing++;
      continue;
    }
    sale += r.sale;
    cost += r.cost;
    markup += r.markup;
  }
  return { sale: round2(sale), cost: round2(cost), markup: round2(markup), missing };
}

/** Меняется, когда меняется состав или количество строк — ключ для повторного запроса закупок. */
export function linesSignature(lines: PartLine[]): string {
  return lines.map((l) => `${l.id}:${l.qty}`).join('|');
}
