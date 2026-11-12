import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ClientsService } from './clients.service';
import { Client } from '../entities/client.entity';
import { WorkOrder } from '../entities/work-order.entity';

/**
 * Mock EntityManager passed to the transaction callback. Lets each test stub the
 * reads (findOne/find/count) and spy on the deletes.
 */
function makeManager(over: Partial<Record<'findOne' | 'find' | 'count', jest.Mock>> = {}) {
  return {
    findOne: over.findOne ?? jest.fn(),
    find: over.find ?? jest.fn().mockResolvedValue([]),
    count: over.count ?? jest.fn().mockResolvedValue(0),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
}

function makeService(manager: ReturnType<typeof makeManager>) {
  const repo = {
    manager: { transaction: (cb: (m: unknown) => unknown) => cb(manager) },
  } as unknown as Repository<Client>;
  return new ClientsService(repo);
}

describe('ClientsService.remove (cascade)', () => {
  it('throws NotFound when the client is missing', async () => {
    const m = makeManager({ findOne: jest.fn().mockResolvedValue(null) });
    const svc = makeService(m);
    await expect(svc.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(m.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete a client that has a closed work order', async () => {
    const m = makeManager({
      findOne: jest.fn().mockResolvedValue({ id: 'c1' }),
      find: jest.fn().mockResolvedValue([{ id: 'v1' }]),
      count: jest.fn().mockResolvedValue(1), // one closed order
    });
    const svc = makeService(m);
    await expect(svc.remove('c1')).rejects.toBeInstanceOf(ConflictException);
    // nothing deleted — the transaction aborts before any delete
    expect(m.delete).not.toHaveBeenCalled();
  });

  it('deletes open work orders then the client (vehicles cascade via FK)', async () => {
    const m = makeManager({
      findOne: jest.fn().mockResolvedValue({ id: 'c1' }),
      find: jest.fn().mockResolvedValue([{ id: 'v1' }, { id: 'v2' }]),
      count: jest.fn().mockResolvedValue(0), // no closed orders
    });
    const svc = makeService(m);
    await svc.remove('c1');

    const entities = m.delete.mock.calls.map((c) => c[0]);
    expect(entities).toEqual([WorkOrder, Client]); // orders first, then client
  });

  it('skips the work-order delete when the client has no vehicles', async () => {
    const m = makeManager({
      findOne: jest.fn().mockResolvedValue({ id: 'c1' }),
      find: jest.fn().mockResolvedValue([]),
    });
    const svc = makeService(m);
    await svc.remove('c1');

    expect(m.count).not.toHaveBeenCalled();
    const entities = m.delete.mock.calls.map((c) => c[0]);
    expect(entities).toEqual([Client]);
  });
});

/**
 * Stats come from one grouped query over closed work orders. node-postgres
 * returns COUNT/SUM as strings, so the service must coerce them.
 */
function makeStatsService(
  clients: Partial<Client>[],
  raw: { client_id: string; count: string; sum: string }[],
) {
  const save = jest.fn(async (c: unknown) => c);
  const calls: { andWhere: unknown[] } = { andWhere: [] };
  const qb = {
    innerJoin: () => qb,
    select: () => qb,
    addSelect: () => qb,
    where: () => qb,
    andWhere: (_sql: string, params?: { clientId?: string }) => {
      calls.andWhere.push(params);
      return qb;
    },
    groupBy: () => qb,
    getRawMany: async () => {
      const only = (calls.andWhere.at(-1) as { clientId?: string } | undefined)?.clientId;
      return only ? raw.filter((r) => r.client_id === only) : raw;
    },
  };
  const repo = {
    find: async () => clients.map((c) => ({ ...c })),
    findOne: async ({ where }: { where: { id: string } }) => {
      const c = clients.find((x) => x.id === where.id);
      return c ? { ...c } : null;
    },
    save,
    manager: { createQueryBuilder: () => qb },
  } as unknown as Repository<Client>;
  return { svc: new ClientsService(repo), save };
}

describe('ClientsService — closed-order history', () => {
  const clients: Partial<Client>[] = [
    { id: 'c1', full_name: 'Иванов', phone: '79000000001', imported_deals_count: 2, imported_deals_sum: 1000 },
    { id: 'c2', full_name: 'Петров', phone: '79000000002', imported_deals_count: 0, imported_deals_sum: 0 },
  ];
  const raw = [{ client_id: 'c1', count: '3', sum: '4500.50' }];

  it('adds closed-order stats to every client, coercing pg strings', async () => {
    const { svc } = makeStatsService(clients, raw);
    const list = await svc.findAll();
    expect(list[0]).toMatchObject({ id: 'c1', closed_orders_count: 3, closed_orders_sum: 4500.5 });
    expect(list[1]).toMatchObject({ id: 'c2', closed_orders_count: 0, closed_orders_sum: 0 });
    // imported history is left untouched — the two sources are summed on display
    expect(list[0].imported_deals_count).toBe(2);
  });

  it('findOne carries the same stats', async () => {
    const { svc } = makeStatsService(clients, raw);
    await expect(svc.findOne('c1')).resolves.toMatchObject({
      closed_orders_count: 3,
      closed_orders_sum: 4500.5,
    });
    await expect(svc.findOne('c2')).resolves.toMatchObject({ closed_orders_count: 0 });
  });

  it('update() does not persist the computed fields', async () => {
    const { svc, save } = makeStatsService(clients, raw);
    await svc.update('c1', { notes: 'vip' });
    const saved = save.mock.calls[0][0] as Record<string, unknown>;
    expect(saved.notes).toBe('vip');
    expect(saved).not.toHaveProperty('closed_orders_count');
    expect(saved).not.toHaveProperty('closed_orders_sum');
  });
});
