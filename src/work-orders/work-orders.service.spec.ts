import { NotFoundException } from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersCoreService } from './work-orders-core.service';
import type { Viewer } from './work-orders-core.service';
import { WorkOrderLinesService } from './work-order-lines.service';
import { PricingService } from './pricing.service';
import { WorkOrder } from '../entities/work-order.entity';
import { LaborLine } from '../entities/labor-line.entity';
import { PartLine } from '../entities/part-line.entity';

/**
 * Pure unit tests with hand-rolled fake repositories (the convention in this
 * repo — see users.service.spec.ts). PricingService is used for real: it is
 * DB-free and its own spec pins the arithmetic.
 */

function wo(p: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: 'wo1',
    vehicle_id: 'v1',
    assigned_master_id: null,
    status: 'in_progress',
    title: null,
    notes: null,
    complaint: null,
    recommendation: null,
    scheduled_at: null,
    scheduled_duration_min: null,
    discount_type: null,
    discount_value: null,
    total_cached: 0,
    total_frozen: null,
    paid_amount: 0,
    closed_at: null,
    doc_number: null,
    order_doc_number: null,
    labor_lines: [],
    part_lines: [],
    ...p,
  } as WorkOrder;
}

interface Harness {
  service: WorkOrdersService;
  lines: WorkOrderLinesService;
  rows: WorkOrder[];
  labor: LaborLine[];
  parts: PartLine[];
  /** Every column name passed to orderBy/addOrderBy during the last loadFull. */
  orderings: string[];
  /** Payload handed to repo.create() by WorkOrdersService.create(). */
  createdWith: Partial<WorkOrder> | null;
  nextvalCalls: number;
  transactions: number;
  /** Payload the duplicate transaction handed to create(WorkOrder, …). */
  copyCreatedWith: Partial<WorkOrder> | null;
}

function harness(seed: WorkOrder[] = [wo()]): Harness {
  const rows = [...seed];
  const labor: LaborLine[] = [];
  const parts: PartLine[] = [];
  const h: Partial<Harness> = {
    rows, labor, parts, orderings: [], createdWith: null, nextvalCalls: 0, transactions: 0,
    copyCreatedWith: null,
  };

  const makeQb = () => {
    let wantedId: string | undefined;
    // Enough of a query engine for board(): status predicate, closed_at sort, take.
    let statusFilter: 'closed' | 'open' | null = null;
    let byClosedDesc = false;
    let limit: number | null = null;
    const qb = {
      leftJoinAndSelect: () => qb,
      leftJoin: () => qb,
      addSelect: () => qb,
      where: (_sql: string, params?: { id?: string }) => {
        wantedId = params?.id;
        return qb;
      },
      andWhere: (sql?: string) => {
        if (sql === "wo.status = 'closed'") statusFilter = 'closed';
        if (sql === "wo.status <> 'closed'") statusFilter = 'open';
        return qb;
      },
      orderBy: (col: string, dir?: string) => {
        h.orderings!.length = 0;
        h.orderings!.push(col);
        byClosedDesc = col === 'wo.closed_at' && dir === 'DESC';
        return qb;
      },
      addOrderBy: (col: string) => {
        h.orderings!.push(col);
        return qb;
      },
      skip: () => qb,
      take: (n?: number) => {
        limit = n ?? null;
        return qb;
      },
      getOne: async () => {
        const found = rows.find((r) => r.id === wantedId) ?? null;
        if (!found) return null;
        // loadFull returns the order with its lines joined.
        return {
          ...found,
          labor_lines: labor.filter((l) => l.work_order_id === found.id),
          part_lines: parts.filter((p) => p.work_order_id === found.id),
        } as WorkOrder;
      },
      getMany: async () => {
        let out = rows.filter((r) =>
          statusFilter === 'closed'
            ? r.status === 'closed'
            : statusFilter === 'open'
              ? r.status !== 'closed'
              : true,
        );
        if (byClosedDesc) {
          const t = (r: WorkOrder) => (r.closed_at ? new Date(r.closed_at).getTime() : -Infinity);
          out = [...out].sort((a, b) => t(b) - t(a));
        }
        return limit != null ? out.slice(0, limit) : out;
      },
      getManyAndCount: async () => [rows, rows.length],
    };
    return qb;
  };

  const repo = {
    createQueryBuilder: () => makeQb(),
    create: (data: Partial<WorkOrder>) => {
      h.createdWith = data;
      return { id: 'new-wo', ...data } as WorkOrder;
    },
    save: async (w: WorkOrder) => {
      const i = rows.findIndex((r) => r.id === w.id);
      if (i >= 0) rows[i] = { ...rows[i], ...w };
      else rows.push(w);
      return w;
    },
    update: async (id: string, patch: Partial<WorkOrder>) => {
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows[i] = { ...rows[i], ...patch };
      return { affected: i >= 0 ? 1 : 0 };
    },
    findOne: async ({ where }: { where: { id: string } }) =>
      rows.find((r) => r.id === where.id) ?? null,
    delete: async (id: string) => {
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows.splice(i, 1);
      return { affected: i >= 0 ? 1 : 0 };
    },
    query: async () => {
      h.nextvalCalls! += 1;
      return [{ n: 100 + h.nextvalCalls! }];
    },
    manager: {
      transaction: async (cb: (m: unknown) => Promise<void>) => {
        h.transactions! += 1;
        await cb({
          create: (entity: { name: string }, data: Record<string, unknown>) => {
            if (entity.name === 'WorkOrder') h.copyCreatedWith = data as Partial<WorkOrder>;
            return {
              id: entity.name === 'WorkOrder' ? 'copy-wo' : `copy-${Math.random()}`,
              ...data,
            };
          },
          save: async (row: Record<string, unknown>) => {
            if ('vehicle_id' in row) rows.push(row as unknown as WorkOrder);
            else if ('rate_snapshot' in row) labor.push(row as unknown as LaborLine);
            else parts.push(row as unknown as PartLine);
            return row;
          },
        });
      },
    },
  };

  const lineRepo = <T extends { id: string; work_order_id: string }>(store: T[]) => ({
    create: (data: Partial<T>) => ({ id: `line-${store.length + 1}`, ...data }) as T,
    save: async (l: T) => {
      const i = store.findIndex((r) => r.id === l.id);
      if (i >= 0) store[i] = l;
      else store.push(l);
      return l;
    },
    findOne: async ({ where }: { where: { id: string } }) =>
      store.find((r) => r.id === where.id) ?? null,
    delete: async () => ({ affected: 1 }),
  });

  const settings = { getLaborRate: async () => 2000 } as never;
  const core = new WorkOrdersCoreService(repo as never, new PricingService());

  const service = new WorkOrdersService(
    core,
    { findOne: async () => ({ id: 'v1' }) } as never, // vehicleRepo
    settings,
    {} as never, // pdf
    { isAssignable: async () => true } as never, // users
  );

  const lines = new WorkOrderLinesService(
    core,
    lineRepo(labor) as never,
    lineRepo(parts) as never,
    { find: async () => [] } as never, // task_template_parts
    settings,
    { findOne: async () => ({ name: 'T', default_hours: 1, default_price: null }) } as never,
    {
      // Price list: the template's own defaults, no generation override.
      resolveForLine: async (_id: string, _gen: string | null, rate: number) => ({
        hours: 1,
        price_override: null,
        rate_snapshot: rate,
        source: 'template' as const,
      }),
    } as never,
  );

  h.service = service;
  h.lines = lines;
  return h as Harness;
}

const owner: Viewer = { id: 'u-owner', role: 'owner' };
const masterA: Viewer = { id: 'm-a', role: 'master' };
const masterB: Viewer = { id: 'm-b', role: 'master' };

describe('WorkOrdersService — role scoping', () => {
  it("404s (not 403) when a master opens another master's order", async () => {
    const h = harness([wo({ assigned_master_id: 'm-a' })]);
    await expect(h.service.findOne('wo1', masterB)).rejects.toBeInstanceOf(NotFoundException);
    // ...and the assigned master still sees it
    await expect(h.service.findOne('wo1', masterA)).resolves.toMatchObject({ id: 'wo1' });
  });

  it('lets owner see an order assigned to someone else', async () => {
    const h = harness([wo({ assigned_master_id: 'm-a' })]);
    await expect(h.service.findOne('wo1', owner)).resolves.toMatchObject({ id: 'wo1' });
  });
});

describe('WorkOrdersService.board', () => {
  const closedOn = (n: number) =>
    wo({ id: `c${n}`, status: 'closed', closed_at: new Date(Date.UTC(2026, 0, n)) });

  it('returns only the 10 most recently closed orders, newest first', async () => {
    const closed = Array.from({ length: 12 }, (_, i) => closedOn(i + 1));
    const open = [1, 2, 3].map((n) => wo({ id: `s${n}`, status: 'scheduled' }));
    // Shuffled on purpose: the cap must follow closed_at, not insertion order.
    const h = harness([...closed.slice(6), ...open, ...closed.slice(0, 6)]);

    const b = await h.service.board(owner);
    expect(b.closed.map((w) => w.id)).toEqual([
      'c12', 'c11', 'c10', 'c9', 'c8', 'c7', 'c6', 'c5', 'c4', 'c3',
    ]);
    expect(b.scheduled).toHaveLength(3);
  });

  it('does not cap the open columns', async () => {
    const h = harness(
      Array.from({ length: 15 }, (_, i) => wo({ id: `s${i}`, status: 'scheduled' })),
    );
    const b = await h.service.board(owner);
    expect(b.scheduled).toHaveLength(15);
    expect(b.closed).toEqual([]);
  });
});

describe('WorkOrdersService — freeze / close', () => {
  it('freezes the total, stamps closed_at and assigns a doc number on close', async () => {
    const h = harness();
    h.labor.push({
      id: 'l1', work_order_id: 'wo1', template_id: null, name: 'Работа',
      hours: 2, rate_snapshot: 1500, price_override: null, sort: 0,
    } as LaborLine);

    await h.service.close('wo1', owner);
    const row = h.rows[0];
    expect(row.status).toBe('closed');
    expect(row.total_frozen).toBe(3000);
    expect(row.closed_at).toBeInstanceOf(Date);
    expect(row.doc_number).toBe(101);
  });

  it('is a no-op when closing an already-closed order', async () => {
    const h = harness();
    await h.service.close('wo1', owner);
    const { closed_at, doc_number, total_frozen } = h.rows[0];

    // A second close must not move the stamp, re-freeze, or burn a sequence value.
    await h.service.close('wo1', owner);
    expect(h.rows[0].closed_at).toBe(closed_at);
    expect(h.rows[0].doc_number).toBe(doc_number);
    expect(h.rows[0].total_frozen).toBe(total_frozen);
    expect(h.nextvalCalls).toBe(1);
  });

  it('clears total_frozen/closed_at on re-open but keeps the doc number', async () => {
    const h = harness();
    await h.service.close('wo1', owner);
    await h.service.updateStatus('wo1', 'in_progress', owner);

    expect(h.rows[0].total_frozen).toBeNull();
    expect(h.rows[0].closed_at).toBeNull();
    // The printed document must stay stable across reopen/reclose.
    expect(h.rows[0].doc_number).toBe(101);
  });

  it('reuses the same doc number when closed again', async () => {
    const h = harness();
    await h.service.close('wo1', owner);
    await h.service.updateStatus('wo1', 'in_progress', owner);
    await h.service.updateStatus('wo1', 'closed', owner);

    expect(h.rows[0].doc_number).toBe(101);
    expect(h.nextvalCalls).toBe(1);
  });
});

describe('WorkOrdersService.create', () => {
  it('sets total_cached and paid_amount explicitly (numericTransformer workaround)', async () => {
    // Both columns are NOT NULL with a DB default, but numericTransformer maps
    // undefined -> null, so TypeORM emits an explicit NULL and the default never
    // applies. Dropping these two lines makes every create() fail at the DB.
    const h = harness([]);
    await h.service.create({ vehicle_id: 'v1' } as never, owner).catch(() => undefined);
    expect(h.createdWith).toMatchObject({ total_cached: 0, paid_amount: 0 });
  });

  it('force-assigns a plain master to themselves', async () => {
    const h = harness([]);
    await h.service
      .create({ vehicle_id: 'v1', assigned_master_id: 'someone-else' } as never, masterA)
      .catch(() => undefined);
    expect(h.createdWith?.assigned_master_id).toBe('m-a');
  });
});

describe('WorkOrdersService — line ordering', () => {
  it('appends new lines at the end of their list', async () => {
    const h = harness();
    await h.lines.addLaborLine('wo1', { name: 'Первая' } as never, owner);
    await h.lines.addLaborLine('wo1', { name: 'Вторая' } as never, owner);
    await h.lines.addPartLine('wo1', { name: 'Деталь', unit_price: 100 } as never, owner);
    await h.lines.addPartLine('wo1', { name: 'Ещё', unit_price: 50 } as never, owner);

    expect(h.labor.map((l) => l.sort)).toEqual([0, 1]);
    expect(h.parts.map((p) => p.sort)).toEqual([0, 1]);
  });

  it('orders lines by sort with created_at as the tiebreak', async () => {
    // Without an explicit ORDER BY, Postgres returns lines in heap order, which
    // an UPDATE changes — lines visibly jumped around after an edit.
    const h = harness();
    await h.service.findOne('wo1', owner);
    // Blocks first, then position inside the block, created_at as the tiebreak.
    expect(h.orderings).toEqual([
      'labor.group_sort',
      'labor.sort',
      'labor.created_at',
      'part.group_sort',
      'part.sort',
      'part.created_at',
    ]);
  });
});

describe('WorkOrdersService — closed estimate is locked', () => {
  it('rejects line mutations on a closed order', async () => {
    const h = harness([wo({ status: 'closed' })]);
    await expect(
      h.lines.addLaborLine('wo1', { name: 'Работа' } as never, owner),
    ).rejects.toThrow(/зафиксирована/);
    await expect(
      h.lines.addPartLine('wo1', { name: 'Деталь', unit_price: 1 } as never, owner),
    ).rejects.toThrow(/зафиксирована/);
  });

  it('rejects a discount change while the order stays closed', async () => {
    const h = harness([wo({ status: 'closed' })]);
    await expect(
      h.service.update('wo1', { discount_type: 'percent', discount_value: 10 }, owner),
    ).rejects.toThrow(/зафиксирована/);
  });
});

describe('WorkOrdersService.duplicate', () => {
  /** A closed, paid, numbered order with a two-line block. */
  function closedOrder() {
    const h = harness([
      wo({
        status: 'closed',
        title: 'ТО',
        notes: 'заметка',
        complaint: 'стук',
        discount_type: 'percent',
        discount_value: 10,
        total_frozen: 5000,
        paid_amount: 5000,
        closed_at: new Date('2026-01-01'),
        doc_number: 42,
        order_doc_number: 7,
        scheduled_at: new Date('2026-01-01T10:00:00Z'),
        scheduled_duration_min: 90,
        assigned_master_id: 'm-a',
      }),
    ]);
    h.labor.push({
      id: 'l1', work_order_id: 'wo1', template_id: 't1', name: 'Замена масла',
      hours: 2, rate_snapshot: 1500, price_override: null,
      discount_type: 'percent', discount_value: 10,
      group_key: 'g1', group_name: 'Замена масла', group_sort: 1, sort: 0,
    } as LaborLine);
    h.parts.push({
      id: 'p1', work_order_id: 'wo1', name: 'Масло', catalog_number: 'OIL',
      manufacturer: 'Castrol', part_template_id: 'pt1', qty: 5, unit: 'l', unit_price: 900,
      discount_type: null, discount_value: null,
      group_key: 'g1', group_name: 'Замена масла', group_sort: 1, sort: 0,
    } as PartLine);
    return h;
  }

  const copyOf = (h: Harness) => h.rows.find((r) => r.id === 'copy-wo')!;

  it('copies the estimate line for line, blocks included', async () => {
    const h = closedOrder();
    await h.service.duplicate('wo1', undefined, owner);

    const copiedLabor = h.labor.find((l) => l.work_order_id === 'copy-wo')!;
    const copiedPart = h.parts.find((p) => p.work_order_id === 'copy-wo')!;
    expect(copiedLabor).toMatchObject({
      name: 'Замена масла',
      // The agreed quote travels with the copy — it is not re-priced at today's rate.
      rate_snapshot: 1500,
      discount_type: 'percent',
      discount_value: 10,
      group_key: 'g1',
      group_name: 'Замена масла',
    });
    expect(copiedPart).toMatchObject({
      manufacturer: 'Castrol',
      part_template_id: 'pt1',
      qty: 5,
      group_key: 'g1',
    });
  });

  it('leaves behind everything that belonged to the original run', async () => {
    const h = closedOrder();
    await h.service.duplicate('wo1', undefined, owner);
    const copy = copyOf(h);

    expect(copy.status).toBe('scheduled');
    expect(copy.scheduled_at).toBeNull();
    expect(copy.scheduled_duration_min).toBeNull();
    expect(copy.paid_amount).toBe(0);
    expect(copy.doc_number).toBeUndefined();
    expect(copy.order_doc_number).toBeUndefined();
    expect(copy.closed_at).toBeUndefined();
    expect(copy.total_frozen).toBeUndefined();
  });

  it('carries over the notes and the order discount', async () => {
    const h = closedOrder();
    await h.service.duplicate('wo1', undefined, owner);
    expect(copyOf(h)).toMatchObject({
      title: 'ТО',
      notes: 'заметка',
      complaint: 'стук',
      discount_type: 'percent',
      discount_value: 10,
    });
  });

  it('sets total_cached and paid_amount explicitly on insert (numericTransformer)', async () => {
    // Both columns carry a transformer, so an unset value is written as an
    // explicit NULL and the DB default never applies. The insert must name them.
    const h = closedOrder();
    await h.service.duplicate('wo1', undefined, owner);
    expect(h.copyCreatedWith).toMatchObject({ total_cached: 0, paid_amount: 0 });
  });

  it('recomputes the copy’s total instead of carrying the frozen one', async () => {
    // 2 ч × 1500 −10% = 2700, plus 5 × 900 = 4500 → 7200, minus the order's 10%.
    const h = closedOrder();
    await h.service.duplicate('wo1', undefined, owner);
    expect(copyOf(h).total_cached).toBe(6480);
    expect(copyOf(h).paid_amount).toBe(0);
  });

  it('runs as one transaction', async () => {
    // 1 + N + M inserts without one leave a half-copied estimate behind.
    const h = closedOrder();
    await h.service.duplicate('wo1', undefined, owner);
    expect(h.transactions).toBe(1);
  });

  it('moves the copy onto another car when asked', async () => {
    const h = closedOrder();
    await h.service.duplicate('wo1', 'v2', owner);
    expect(copyOf(h).vehicle_id).toBe('v2');
  });

  it('assigns a master’s copy to themselves', async () => {
    // Otherwise they would create an order and immediately 404 on it.
    const h = closedOrder();
    await h.service.duplicate('wo1', undefined, masterA);
    expect(copyOf(h).assigned_master_id).toBe('m-a');

    const h2 = closedOrder();
    await h2.service.duplicate('wo1', undefined, owner);
    expect(copyOf(h2).assigned_master_id).toBe('m-a'); // owner keeps the source's
  });

  it('refuses to copy an order the viewer cannot see', async () => {
    const h = closedOrder();
    await expect(h.service.duplicate('wo1', undefined, masterB)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('leaves the source untouched', async () => {
    const h = closedOrder();
    await h.service.duplicate('wo1', undefined, owner);
    const source = h.rows.find((r) => r.id === 'wo1')!;
    expect(source).toMatchObject({ status: 'closed', doc_number: 42, paid_amount: 5000 });
    expect(h.labor.filter((l) => l.work_order_id === 'wo1')).toHaveLength(1);
  });
});
