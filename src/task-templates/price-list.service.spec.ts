import { BadRequestException } from '@nestjs/common';
import { PriceListService } from './price-list.service';

/**
 * Hand-rolled fakes: the template and price inserts go through one manager, so
 * the test can tell that both happened inside the SAME transaction.
 */
function harness(knownGenerations: string[] = ['g1']) {
  const templates: Record<string, unknown>[] = [];
  const overrides: Record<string, unknown>[] = [];
  let transactions = 0;
  let directSaves = 0;

  const manager = {
    create: (_entity: unknown, data: Record<string, unknown>) => ({ ...data }),
    save: async (row: Record<string, unknown>) => {
      if ('template_id' in row) {
        overrides.push(row);
        return row;
      }
      const saved = { id: `tpl-${templates.length + 1}`, ...row };
      templates.push(saved);
      return saved;
    },
  };

  const service = new PriceListService(
    {
      manager: {
        transaction: async (cb: (m: typeof manager) => Promise<unknown>) => {
          transactions += 1;
          return cb(manager);
        },
      },
    } as never,
    {
      // Anything written outside the transaction would land here.
      save: async (row: unknown) => {
        directSaves += 1;
        return row;
      },
    } as never,
    {
      findOne: async ({ where }: { where: { id: string } }) =>
        knownGenerations.includes(where.id) ? { id: where.id } : null,
    } as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { service, templates, overrides, counts: () => ({ transactions, directSaves }) };
}

describe('PriceListService.createWork', () => {
  it('creates a work with a base price and no override', async () => {
    const h = harness();
    const created = await h.service.createWork({ name: 'Замена свечей', default_hours: 1 });

    expect(h.templates).toHaveLength(1);
    expect(h.templates[0]).toMatchObject({ name: 'Замена свечей', default_hours: 1, default_price: null });
    expect(created.id).toBe('tpl-1');
    expect(h.overrides).toEqual([]);
    expect(h.counts().directSaves).toBe(0);
  });

  it('creates the work and its generation price in one transaction', async () => {
    const h = harness();
    const created = await h.service.createWork({
      name: 'Замена свечей',
      generation_id: 'g1',
      hours: 1.5,
      price: 4000,
    });

    expect(h.templates[0]).toMatchObject({ name: 'Замена свечей', default_hours: null, default_price: null });
    expect(h.overrides).toEqual([
      { template_id: created.id, generation_id: 'g1', hours: 1.5, price: 4000 },
    ]);
    // A work saved without its price would silently be charged at the base rate.
    expect(h.counts().transactions).toBe(1);
    expect(h.counts().directSaves).toBe(0);
  });

  it('keeps a lone generation figure and nulls the other', async () => {
    const h = harness();
    await h.service.createWork({ name: 'Диагностика', generation_id: 'g1', price: 1500 });
    expect(h.overrides[0]).toMatchObject({ hours: null, price: 1500 });
  });

  it('skips the override when a generation is named but no figures given', async () => {
    const h = harness();
    await h.service.createWork({ name: 'Замена свечей', generation_id: 'g1', hours: null, price: null });
    expect(h.templates).toHaveLength(1);
    expect(h.overrides).toEqual([]);
  });

  it('trims the name', async () => {
    const h = harness();
    await h.service.createWork({ name: '  Замена свечей ' });
    expect(h.templates[0].name).toBe('Замена свечей');
  });

  it('rejects a blank name', async () => {
    const h = harness();
    const attempt = h.service.createWork({ name: '   ' });
    await expect(attempt).rejects.toThrow(BadRequestException);
    await expect(attempt).rejects.toThrow('Укажите название работы');
    expect(h.templates).toEqual([]);
  });

  it('rejects an unknown generation', async () => {
    const h = harness();
    const attempt = h.service.createWork({ name: 'Замена свечей', generation_id: 'nope', price: 4000 });
    await expect(attempt).rejects.toThrow('Поколение не найдено в справочнике');
    expect(h.templates).toEqual([]);
    expect(h.overrides).toEqual([]);
  });
});
