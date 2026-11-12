import { BadRequestException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { parseEdges, parsePrev } from './analytics.controller';
import { PricingService } from '../work-orders/pricing.service';
import { WorkOrder } from '../entities/work-order.entity';
import { LaborLine } from '../entities/labor-line.entity';

const D = (s: string) => new Date(s);

function wo(id: string, closed: string, p: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id, doc_number: 1, status: 'closed', discount_type: null, discount_value: null,
    total_frozen: 5000, closed_at: D(closed),
    labor_lines: [{
      id: 'l' + id, template_id: null, name: 'Замена масла', hours: 2, rate_snapshot: 2500,
      price_override: null, discount_type: null, discount_value: null,
    } as LaborLine],
    part_lines: [],
    vehicle: { make: 'MINI', model: 'Hatch', generation_code: 'R56', client: { id: 'c1', full_name: 'Иванов' } },
    ...p,
  } as unknown as WorkOrder;
}

function setup(rows: WorkOrder[]) {
  const calls = {
    where: [] as string[],
    andWhere: [] as string[],
    addSelect: [] as string[],
    params: {} as Record<string, unknown>,
    created: 0,
  };
  const qb: Record<string, unknown> = {};
  qb.leftJoinAndSelect = () => qb;
  qb.addSelect = (s: string) => { calls.addSelect.push(s); return qb; };
  qb.where = (s: string, params?: object) => { calls.where.push(s); Object.assign(calls.params, params); return qb; };
  qb.andWhere = (s: string, params?: object) => { calls.andWhere.push(s); Object.assign(calls.params, params); return qb; };
  qb.getMany = async () => rows;
  const repo = { createQueryBuilder: () => { calls.created += 1; return qb; } };
  const service = new AnalyticsService(repo as never, new PricingService());
  return { service, calls };
}

const NOV = [D('2026-11-01T00:00:00Z'), D('2026-12-01T00:00:00Z')];
const OCT = { from: D('2026-10-01T00:00:00Z'), to: D('2026-11-01T00:00:00Z') };
const rows = () => [
  wo('a', '2026-11-03T10:00:00Z'),
  wo('b', '2026-11-20T10:00:00Z'),
  wo('c', '2026-10-15T10:00:00Z'),
];

describe('AnalyticsService', () => {
  it('loadClosed берёт только closed в полуинтервале и явно выбирает закупку', async () => {
    const { service, calls } = setup([]);
    await service.loadClosed(D('2026-11-01T00:00:00Z'), D('2026-12-01T00:00:00Z'));
    expect(calls.addSelect).toContain('part.purchase_price');
    expect([...calls.where, ...calls.andWhere].join(' ')).toMatch(/wo\.status = 'closed'|wo\.status = :status/);
    expect(calls.andWhere.join(' ')).toMatch(/closed_at >= :from AND wo\.closed_at < :to/);
    expect(calls.params).toMatchObject({
      from: D('2026-11-01T00:00:00Z'), to: D('2026-12-01T00:00:00Z'),
    });
  });

  it('summary делит наряды на текущий и прошлый период', async () => {
    const { service, calls } = setup(rows());
    const s = await service.summary(NOV, OCT);
    expect(s.totals.orders).toBe(2);
    expect(s.previous?.orders).toBe(1);
    expect(s.buckets).toHaveLength(1);
    expect(s.buckets[0].orders).toBe(2);
    expect(calls.created).toBe(1);
    expect(calls.params.from).toEqual(OCT.from);
    expect(calls.params.to).toEqual(NOV[1]);
  });

  it('summary без prev отдаёт previous: null и не расширяет выборку', async () => {
    const { service, calls } = setup(rows());
    const s = await service.summary(NOV, null);
    expect(s.previous).toBeNull();
    expect(s.totals.orders).toBe(2);
    expect(calls.params).toMatchObject({ from: NOV[0], to: NOV[1] });
  });

  it('breakdown строится только по текущему периоду', async () => {
    const { service } = setup(rows());
    const s = await service.summary(NOV, OCT);
    expect(s.breakdown.labor).toHaveLength(1);
    expect(s.breakdown.labor[0]).toMatchObject({ count: 2, hours: 4, revenue: 10000 });
    expect(s.breakdown.vehicles[0].orders).toBe(2);
  });
});

describe('parseEdges', () => {
  it.each([undefined, '', '2026-11-01T00:00:00Z'])('меньше двух границ → 400: %p', (raw) => {
    expect(() => parseEdges(raw)).toThrow(BadRequestException);
  });
  it('не ISO → 400', () => expect(() => parseEdges('вчера,сегодня')).toThrow(BadRequestException));
  it('не по возрастанию → 400', () => {
    expect(() => parseEdges('2026-12-01T00:00:00Z,2026-11-01T00:00:00Z')).toThrow(BadRequestException);
  });
  it('равные соседние границы → 400', () => {
    expect(() => parseEdges('2026-11-01T00:00:00Z,2026-11-01T00:00:00Z')).toThrow(BadRequestException);
  });
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString()).join(',');
  it('64 границы → 400', () => expect(() => parseEdges(many(64))).toThrow(BadRequestException));
  it('63 границы проходят', () => expect(parseEdges(many(63))).toHaveLength(63));
  it('сообщение называет параметр', () => {
    expect(() => parseEdges('вчера,сегодня')).toThrow(/edges/);
  });
});

describe('parsePrev', () => {
  it('без обоих → null', () => expect(parsePrev(undefined, undefined)).toBeNull());
  it('только prev_from → 400', () => {
    expect(() => parsePrev('2026-10-01T00:00:00Z', undefined)).toThrow(/prev_from и prev_to/);
  });
  it('только prev_to → 400', () => {
    expect(() => parsePrev(undefined, '2026-11-01T00:00:00Z')).toThrow(BadRequestException);
  });
  it('prev_from >= prev_to → 400', () => {
    expect(() => parsePrev('2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')).toThrow(BadRequestException);
    expect(() => parsePrev('2026-12-01T00:00:00Z', '2026-11-01T00:00:00Z')).toThrow(BadRequestException);
  });
  it('не ISO → 400 с именем параметра', () => {
    expect(() => parsePrev('вчера', '2026-11-01T00:00:00Z')).toThrow(/prev_from/);
    expect(() => parsePrev('2026-10-01T00:00:00Z', 'завтра')).toThrow(/prev_to/);
  });
  it('корректная пара разбирается', () => {
    expect(parsePrev('2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z')).toEqual(OCT);
  });
});
