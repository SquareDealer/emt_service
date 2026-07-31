import { ForbiddenException } from '@nestjs/common';
import { CalendarBlocksService } from './calendar-blocks.service';
import { CalendarBlock } from '../entities/calendar-block.entity';
import { Viewer } from '../work-orders/work-orders.service';

/**
 * Pure unit tests with a fake repository (repo convention — see
 * users.service.spec.ts). The query builder is stubbed to record the predicates
 * the service composes, then the filtering is applied in JS over the seed rows,
 * so the overlap and scoping rules are exercised without a database.
 */

function block(p: Partial<CalendarBlock> = {}): CalendarBlock {
  return {
    id: 'b1',
    title: null,
    starts_at: new Date('2026-08-03T09:00:00Z'),
    duration_min: 60,
    user_id: null,
    notes: null,
    created_by: 'u1',
    created_at: new Date(),
    ...p,
  } as CalendarBlock;
}

function harness(seed: CalendarBlock[]) {
  const rows = [...seed];
  const saved: CalendarBlock[] = [];

  const makeQb = () => {
    const preds: { sql: string; params: Record<string, unknown> }[] = [];
    const qb = {
      leftJoin: () => qb,
      addSelect: () => qb,
      where: (sql: string, params: Record<string, unknown> = {}) => {
        preds.push({ sql, params });
        return qb;
      },
      andWhere: (sql: string, params: Record<string, unknown> = {}) => {
        preds.push({ sql, params });
        return qb;
      },
      orderBy: () => qb,
      getOne: async () => filter(rows, preds)[0] ?? null,
      getMany: async () => filter(rows, preds),
    };
    return qb;
  };

  const repo = {
    createQueryBuilder: () => makeQb(),
    create: (data: Partial<CalendarBlock>) => ({ id: 'new-b', ...data }) as CalendarBlock,
    save: async (b: CalendarBlock) => {
      saved.push(b);
      const i = rows.findIndex((r) => r.id === b.id);
      if (i >= 0) rows[i] = b;
      else rows.push(b);
      return b;
    },
    delete: async (id: string) => {
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows.splice(i, 1);
      return { affected: i >= 0 ? 1 : 0 };
    },
  };

  return { rows, saved, service: new CalendarBlocksService(repo as never) };
}

/** Apply the recorded predicates to the seed rows. */
function filter(
  rows: CalendarBlock[],
  preds: { sql: string; params: Record<string, unknown> }[],
): CalendarBlock[] {
  return rows.filter((r) =>
    preds.every(({ sql, params }) => {
      if (sql.includes('b.id = :id')) return r.id === params.id;
      if (sql.includes('b.starts_at < :toDate')) return r.starts_at < (params.toDate as Date);
      if (sql.includes('interval')) {
        const end = new Date(r.starts_at.getTime() + r.duration_min * 60_000);
        return end > (params.fromDate as Date);
      }
      if (sql.includes('b.user_id IS NULL OR b.user_id = :viewerId')) {
        return r.user_id === null || r.user_id === params.viewerId;
      }
      return true;
    }),
  );
}

const owner: Viewer = { id: 'u-owner', role: 'owner' };
const masterA: Viewer = { id: 'm-a', role: 'master' };
const masterB: Viewer = { id: 'm-b', role: 'master' };

const WED_FROM = '2026-08-05T00:00:00Z';
const WED_TO = '2026-08-06T00:00:00Z';

describe('CalendarBlocksService.range — overlap, not start-in-range', () => {
  it('returns a multi-day block in the middle of its span', async () => {
    // Monday 09:00 + 4 days: it starts before the window and ends after it, so a
    // start-in-range filter (what work_orders does) would miss it entirely.
    const h = harness([
      block({ id: 'holiday', starts_at: new Date('2026-08-03T09:00:00Z'), duration_min: 4 * 24 * 60 }),
    ]);
    const found = await h.service.range(WED_FROM, WED_TO, owner);
    expect(found.map((b) => b.id)).toEqual(['holiday']);
  });

  it('excludes blocks that end exactly at the window start (half-open)', async () => {
    const h = harness([
      block({ id: 'ends-at-boundary', starts_at: new Date('2026-08-04T23:00:00Z'), duration_min: 60 }),
      block({ id: 'crosses-boundary', starts_at: new Date('2026-08-04T23:00:00Z'), duration_min: 120 }),
    ]);
    const found = await h.service.range(WED_FROM, WED_TO, owner);
    expect(found.map((b) => b.id)).toEqual(['crosses-boundary']);
  });

  it('excludes blocks starting exactly at the window end', async () => {
    const h = harness([
      block({ id: 'next-day', starts_at: new Date('2026-08-06T00:00:00Z'), duration_min: 60 }),
    ]);
    expect(await h.service.range(WED_FROM, WED_TO, owner)).toEqual([]);
  });

  it('rejects an unparseable range instead of binding NaN', async () => {
    const h = harness([]);
    await expect(h.service.range('не-дата', WED_TO, owner)).rejects.toThrow(/диапазон/);
  });
});

describe('CalendarBlocksService — visibility', () => {
  const seed = [
    block({ id: 'shop', user_id: null }),
    block({ id: 'mine', user_id: 'm-a' }),
    block({ id: 'theirs', user_id: 'm-b' }),
  ];

  it('shows a master the shop-wide block plus their own, never another master’s', async () => {
    // Deliberately NOT the work-order rule («assigned to me»): a shop-wide block
    // means everyone is busy, so hiding it would let a master double-book.
    const h = harness(seed);
    const found = await h.service.range(undefined, undefined, masterA);
    expect(found.map((b) => b.id).sort()).toEqual(['mine', 'shop']);
  });

  it('shows the owner everything', async () => {
    const h = harness(seed);
    const found = await h.service.range(undefined, undefined, owner);
    expect(found.map((b) => b.id).sort()).toEqual(['mine', 'shop', 'theirs']);
  });
});

describe('CalendarBlocksService — write permissions', () => {
  it('forces a master’s block onto themselves', async () => {
    const h = harness([]);
    await h.service.create(
      { starts_at: '2026-08-05T10:00:00Z', duration_min: 60, user_id: null },
      masterA,
    );
    expect(h.saved[0].user_id).toBe('m-a');
    expect(h.saved[0].created_by).toBe('m-a');
  });

  it('lets the owner book the shop as a whole', async () => {
    const h = harness([]);
    await h.service.create({ starts_at: '2026-08-05T10:00:00Z', duration_min: 60 }, owner);
    expect(h.saved[0].user_id).toBeNull();
  });

  it('stops a master editing or deleting a shop-wide block', async () => {
    const h = harness([block({ id: 'shop', user_id: null })]);
    await expect(h.service.update('shop', { duration_min: 30 }, masterA)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(h.service.remove('shop', masterA)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s a master on another master’s block rather than leaking it', async () => {
    const h = harness([block({ id: 'theirs', user_id: 'm-b' })]);
    await expect(h.service.update('theirs', { duration_min: 30 }, masterA)).rejects.toThrow(
      /не найдена/,
    );
  });

  it('lets a master manage their own block', async () => {
    const h = harness([block({ id: 'mine', user_id: 'm-a' })]);
    await expect(h.service.update('mine', { title: 'Обед' }, masterA)).resolves.toBeTruthy();
    await expect(h.service.remove('mine', masterA)).resolves.toBeUndefined();
  });

  it('lets the owner manage a master’s block', async () => {
    const h = harness([block({ id: 'theirs', user_id: 'm-b' })]);
    await expect(h.service.update('theirs', { title: 'Правка' }, owner)).resolves.toBeTruthy();
  });
});

describe('CalendarBlocksService — input handling', () => {
  it('keeps a nameless block nameless («для всякой хуйни без имени»)', async () => {
    const h = harness([]);
    await h.service.create({ starts_at: '2026-08-05T10:00:00Z', duration_min: 60 }, owner);
    expect(h.saved[0].title).toBeNull();

    const h2 = harness([]);
    await h2.service.create(
      { starts_at: '2026-08-05T10:00:00Z', duration_min: 60, title: '   ' },
      owner,
    );
    expect(h2.saved[0].title).toBeNull();
  });

  it('rejects nonsense times and durations', async () => {
    const h = harness([]);
    await expect(
      h.service.create({ starts_at: 'вчера', duration_min: 60 }, owner),
    ).rejects.toThrow(/время начала/);
    await expect(
      h.service.create({ starts_at: '2026-08-05T10:00:00Z', duration_min: 0 }, owner),
    ).rejects.toThrow(/длительность/i);
  });

  it('masterB cannot reassign their block to someone else', async () => {
    const h = harness([block({ id: 'mine', user_id: 'm-b' })]);
    await h.service.update('mine', { user_id: 'm-a' }, masterB);
    expect(h.saved[0].user_id).toBe('m-b');
  });
});
