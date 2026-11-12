import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SetPartCostsDto, parseEdges, parsePrev, parseRange } from './analytics.controller';
import { PricingService } from '../work-orders/pricing.service';
import { WorkOrder } from '../entities/work-order.entity';
import { LaborLine } from '../entities/labor-line.entity';
import { PartLine } from '../entities/part-line.entity';

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
  const service = new AnalyticsService(repo as never, {} as never, new PricingService());
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

function part(id: string, p: Partial<PartLine> = {}): PartLine {
  return {
    id, name: 'Фильтр', manufacturer: 'Mann', qty: 1, unit: 'pcs', unit_price: 1000,
    discount_type: null, discount_value: null, part_template_id: null, purchase_price: null,
    ...p,
  } as PartLine;
}

function costSetup(opts: { woExists?: boolean; known?: string[]; lines?: PartLine[]; orders?: WorkOrder[] } = {}) {
  const log = {
    transactions: 0,
    updates: [] as [string, unknown][],
    updateEntities: [] as unknown[],
    addSelect: [] as string[],
    orderBy: [] as string[],
  };
  const known = new Set(opts.known ?? []);
  const qb: Record<string, unknown> = {};
  qb.leftJoinAndSelect = () => qb;
  qb.where = () => qb;
  qb.andWhere = () => qb;
  qb.addSelect = (s: string) => { log.addSelect.push(s); return qb; };
  qb.orderBy = (s: string) => { log.orderBy.push(s); return qb; };
  qb.addOrderBy = (s: string) => { log.orderBy.push(s); return qb; };
  qb.getMany = async () => opts.lines ?? opts.orders ?? [];
  const repo = {
    createQueryBuilder: () => qb,
    findOne: async () => (opts.woExists === false ? null : { id: 'w1' }),
  };
  const partRepo = {
    createQueryBuilder: () => qb,
    find: async (o: { where: { id: { value: string[] } } }) =>
      o.where.id.value.filter((id) => known.has(id)).map((id) => ({ id })),
    manager: {
      transaction: async (fn: (m: unknown) => Promise<void>) => {
        log.transactions += 1;
        await fn({
          update: async (entity: unknown, id: string, patch: unknown) => {
            log.updateEntities.push(entity);
            log.updates.push([id, patch]);
          },
        });
      },
    },
  };
  const service = new AnalyticsService(repo as never, partRepo as never, new PricingService());
  return { service, log };
}

describe('AnalyticsService: закупки', () => {
  const orders = () => [
    wo('o5', '2026-11-05T10:00:00Z', {
      doc_number: 1539,
      total_frozen: 3000,
      labor_lines: [],
      part_lines: [part('p1', { purchase_price: 500 }), part('p2', { name: 'Масло', unit_price: 3000 })],
    }),
    wo('o10', '2026-11-10T10:00:00Z', {
      doc_number: 1541,
      total_frozen: 1000,
      labor_lines: [],
      part_lines: [part('p3')],
    }),
  ];

  it('missingCosts отдаёт только строки с cost null, новые сверху', async () => {
    const { service } = costSetup({ orders: orders() });
    const rows = await service.missingCosts(NOV[0], NOV[1]);
    expect(rows.map((r) => r.doc_number)).toEqual([1541, 1539]);
    expect(rows.map((r) => r.part_line_id)).toEqual(['p3', 'p2']);
    expect(rows[0]).toMatchObject({
      work_order_id: 'o10', client: 'Иванов', vehicle: 'MINI Hatch R56',
      name: 'Фильтр', manufacturer: 'Mann', qty: 1, unit: 'pcs',
      closed_at: '2026-11-10T10:00:00.000Z',
    });
  });

  it('missingCosts отдаёт net после скидок, а не qty × unit_price', async () => {
    const { service } = costSetup({
      orders: [
        wo('o1', '2026-11-05T10:00:00Z', {
          total_frozen: 800,
          labor_lines: [],
          part_lines: [part('p1', { qty: 2, unit_price: 500, discount_type: 'percent', discount_value: 20 })],
        }),
      ],
    });
    const rows = await service.missingCosts(NOV[0], NOV[1]);
    expect(rows).toHaveLength(1);
    expect(rows[0].net).toBe(800);
    expect(rows[0].net).not.toBe(1000);
  });

  it('setPartCosts пишет все строки в одной транзакции', async () => {
    const { service, log } = costSetup({ known: ['a', 'b'] });
    const res = await service.setPartCosts([
      { part_line_id: 'a', purchase_price: 5200 },
      { part_line_id: 'b', purchase_price: 0 },
    ]);
    expect(res).toEqual({ updated: 2 });
    expect(log.transactions).toBe(1);
    expect(log.updates).toEqual([['a', { purchase_price: 5200 }], ['b', { purchase_price: 0 }]]);
  });

  it('setPartCosts: неизвестный part_line_id → 404, ни одна строка не записана', async () => {
    const { service, log } = costSetup({ known: ['a'] });
    await expect(
      service.setPartCosts([
        { part_line_id: 'a', purchase_price: 1 },
        { part_line_id: 'нет', purchase_price: 1 },
      ]),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(log.updates).toEqual([]);
    expect(log.transactions).toBe(0);
  });

  it('setPartCosts работает для строки закрытого наряда и не меняет total_frozen', async () => {
    const { service, log } = costSetup({ known: ['a'] });
    await service.setPartCosts([{ part_line_id: 'a', purchase_price: 700 }]);
    // пишем только в part_lines и только purchase_price: наряд и его заморозка не затронуты
    expect(log.updateEntities).toEqual([PartLine]);
    expect(log.updates).toEqual([['a', { purchase_price: 700 }]]);
  });

  it('setPartCosts: повтор part_line_id → 400, ничего не записано', async () => {
    const { service, log } = costSetup({ known: ['a'] });
    await expect(
      service.setPartCosts([
        { part_line_id: 'a', purchase_price: 1 },
        { part_line_id: 'a', purchase_price: 2 },
      ]),
    ).rejects.toThrow(/part_line_id повторяется/);
    expect(log.transactions).toBe(0);
    expect(log.updates).toEqual([]);
  });

  it('setPartCosts(null) очищает закупку', async () => {
    const { service, log } = costSetup({ known: ['a'] });
    await service.setPartCosts([{ part_line_id: 'a', purchase_price: null }]);
    expect(log.updates).toEqual([['a', { purchase_price: null }]]);
  });

  it('partCosts читает закупку явно и в порядке сметы', async () => {
    const { service, log } = costSetup({
      lines: [part('p1', { purchase_price: 500 }), part('p2')],
    });
    const rows = await service.partCosts('w1');
    expect(log.addSelect).toContain('p.purchase_price');
    expect(log.orderBy).toEqual(['p.group_sort', 'p.sort', 'p.created_at']);
    expect(rows.map((r) => [r.part_line_id, r.purchase_price])).toEqual([['p1', 500], ['p2', null]]);
  });

  it('partCosts для несуществующего наряда → 404', async () => {
    const { service } = costSetup({ woExists: false });
    await expect(service.partCosts('нет')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SetPartCostsDto', () => {
  const U1 = '11111111-1111-4111-8111-111111111111';
  const U2 = '22222222-2222-4222-8222-222222222222';
  const check = async (body: unknown) => (await validate(plainToInstance(SetPartCostsDto, body))).length;
  const item = (extra: object = {}) => ({ part_line_id: U1, purchase_price: 100, ...extra });

  it('корректное тело проходит, 0 и явный null допустимы', async () => {
    expect(await check({ items: [item(), item({ part_line_id: U2, purchase_price: 0 })] })).toBe(0);
    expect(await check({ items: [item({ purchase_price: null })] })).toBe(0);
  });
  it('отсутствующее purchase_price не проходит', async () => {
    expect(await check({ items: [{ part_line_id: U1 }] })).toBeGreaterThan(0);
  });
  it('отрицательное, строка и NaN-подобное не проходят', async () => {
    expect(await check({ items: [item({ purchase_price: -1 })] })).toBeGreaterThan(0);
    expect(await check({ items: [item({ purchase_price: '5' })] })).toBeGreaterThan(0);
  });
  it('purchase_price выше предела numeric(12,2) не проходит, сам предел проходит', async () => {
    expect(await check({ items: [item({ purchase_price: 10_000_000_000 })] })).toBeGreaterThan(0);
    expect(await check({ items: [item({ purchase_price: 9_999_999_999.99 })] })).toBe(0);
  });
  it('part_line_id должен быть uuid', async () => {
    expect(await check({ items: [item({ part_line_id: 'abc' })] })).toBeGreaterThan(0);
  });
  it('пустой список и больше 200 элементов не проходят, 200 проходит', async () => {
    expect(await check({ items: [] })).toBeGreaterThan(0);
    expect(await check({ items: Array.from({ length: 201 }, () => item()) })).toBeGreaterThan(0);
    expect(await check({ items: Array.from({ length: 200 }, () => item()) })).toBe(0);
  });
  it('items не массив → ошибка', async () => {
    expect(await check({})).toBeGreaterThan(0);
    expect(await check({ items: 'x' })).toBeGreaterThan(0);
  });
});

describe('parseRange', () => {
  it('корректный период разбирается', () => {
    expect(parseRange('2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z')).toEqual({ from: NOV[0], to: NOV[1] });
  });
  it('нет параметра или не ISO → 400 с именем параметра', () => {
    expect(() => parseRange(undefined, '2026-12-01T00:00:00Z')).toThrow(/from/);
    expect(() => parseRange('2026-11-01T00:00:00Z', 'завтра')).toThrow(/to/);
  });
  it('from >= to → 400', () => {
    expect(() => parseRange('2026-12-01T00:00:00Z', '2026-11-01T00:00:00Z')).toThrow(BadRequestException);
    expect(() => parseRange('2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')).toThrow(BadRequestException);
  });
  it('повторный параметр (массив) → 400, а не TypeError', () => {
    const arr = ['2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z'];
    expect(() => parseRange(arr, '2026-12-01T00:00:00Z')).toThrow(BadRequestException);
    expect(() => parseRange('2026-11-01T00:00:00Z', arr)).toThrow(/to/);
  });
});

describe('query-параметры массивом', () => {
  const arr = ['2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z'];
  it('parseEdges(string[]) → 400', () => {
    expect(() => parseEdges(arr)).toThrow(BadRequestException);
  });
  it('parsePrev(string[]) → 400', () => {
    expect(() => parsePrev(arr, '2026-11-01T00:00:00Z')).toThrow(BadRequestException);
    expect(() => parsePrev('2026-10-01T00:00:00Z', arr)).toThrow(/prev_to/);
  });
});

describe('parseEdges', () => {
  it.each([undefined, '', '2026-11-01T00:00:00Z'])('меньше двух границ → 400: %p', (raw) => {
    expect(() => parseEdges(raw)).toThrow(BadRequestException);
  });
  it('date-only и инстант без зоны → 400 с именем параметра', () => {
    expect(() => parseEdges('2026-11-01,2026-12-01T00:00:00Z')).toThrow(/edges/);
    expect(() => parseEdges('2026-11-01T00:00:00,2026-12-01T00:00:00Z')).toThrow(BadRequestException);
  });
  it('инстант со смещением ±hh:mm принимается', () => {
    expect(parseEdges('2026-11-01T00:00:00+03:00,2026-12-01T00:00:00.500Z')).toHaveLength(2);
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

describe('parseRange / parsePrev: полный инстант', () => {
  it('date-only → 400 с именем параметра', () => {
    expect(() => parseRange('2026-11-01', '2026-12-01T00:00:00Z')).toThrow(/from/);
    expect(() => parsePrev('2026-10-01T00:00:00Z', '2026-11-01')).toThrow(/prev_to/);
  });
  it('инстант без зоны → 400', () => {
    expect(() => parseRange('2026-11-01T00:00:00', '2026-12-01T00:00:00Z')).toThrow(BadRequestException);
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
