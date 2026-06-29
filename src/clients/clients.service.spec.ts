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
