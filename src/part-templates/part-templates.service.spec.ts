import { PART_TEMPLATES_LIMIT, PartTemplatesService } from './part-templates.service';

function harness(row?: Record<string, unknown>) {
  const calls = {
    limit: [] as number[],
    where: [] as string[],
    addSelect: [] as string[],
    queries: 0,
  };
  const saved: Record<string, unknown>[] = [];
  let rows: Record<string, unknown>[] = [];
  const qb = {
    select() { return qb; },
    addSelect(s: string) { calls.addSelect.push(s); return qb; },
    where(sql: string) { calls.where.push(sql); return qb; },
    andWhere(sql: string) { calls.where.push(sql); return qb; },
    orderBy() { return qb; },
    limit(n: number) { calls.limit.push(n); return qb; },
    getMany: async () => rows,
    // Like the real select:false column: the row has purchase_price only when asked for.
    getOne: async () => {
      if (!row) return null;
      const { purchase_price, ...rest } = row;
      return calls.addSelect.includes('p.purchase_price') ? { ...row } : { ...rest, _hidden: purchase_price };
    },
  };
  const repo = {
    createQueryBuilder: () => { calls.queries++; return qb; },
    create: (x: Record<string, unknown>) => ({ ...x }),
    save: async (x: Record<string, unknown>) => { saved.push(x); return x; },
  };
  return {
    service: new PartTemplatesService(repo as never),
    calls,
    saved,
    setRows: (r: Record<string, unknown>[]) => { rows = r; },
  };
}

describe('PartTemplatesService.findAll', () => {
  // The part picker shows «все запчасти» and filters them locally — a 100-row
  // page silently hid the tail of the catalog.
  it('returns up to 500 parts, so the picker sees the whole catalog', async () => {
    const h = harness();
    await h.service.findAll();
    expect(PART_TEMPLATES_LIMIT).toBe(500);
    expect(h.calls.limit).toEqual([500]);
  });

  it('still searches by name, article and manufacturer', async () => {
    const h = harness();
    await h.service.findAll(' mann ');
    expect(h.calls.where.join(' ')).toContain('p.catalog_number ILIKE');
    expect(h.calls.limit).toEqual([500]);
  });

  it('findAll без withCost не запрашивает закупку', async () => {
    const h = harness();
    await h.service.findAll();
    expect(h.calls.addSelect).not.toContain('p.purchase_price');
  });

  it('findAll(…, …, true) запрашивает закупку', async () => {
    const h = harness();
    await h.service.findAll(undefined, false, true);
    expect(h.calls.addSelect).toContain('p.purchase_price');
  });
});

describe('PartTemplatesService.findOne', () => {
  it('без withCost не запрашивает закупку, с withCost — запрашивает', async () => {
    const plain = harness({ id: 'p1', name: 'Фильтр', purchase_price: 520 });
    const a = await plain.service.findOne('p1');
    expect(plain.calls.addSelect).not.toContain('p.purchase_price');
    expect(a).not.toHaveProperty('purchase_price');

    const withCost = harness({ id: 'p1', name: 'Фильтр', purchase_price: 520 });
    const b = await withCost.service.findOne('p1', true);
    expect(withCost.calls.addSelect).toContain('p.purchase_price');
    expect(b.purchase_price).toBe(520);
  });

  it('бросает NotFound, если строки нет', async () => {
    const h = harness();
    await expect(h.service.findOne('nope')).rejects.toThrow('Запчасть не найдена');
  });
});

describe('PartTemplatesService purchase_price writes', () => {
  it('update без purchase_price в dto не трогает закупку', async () => {
    const h = harness({ id: 'p1', name: 'Фильтр', purchase_price: 520 });
    await h.service.update('p1', { name: 'Фильтр масляный' });
    expect(h.saved).toHaveLength(1);
    expect(h.saved[0].name).toBe('Фильтр масляный');
    expect(h.saved[0]).not.toHaveProperty('purchase_price');
  });

  it('update с purchase_price: null очищает закупку', async () => {
    const h = harness({ id: 'p1', name: 'Фильтр', purchase_price: 520 });
    await h.service.update('p1', { purchase_price: null });
    expect(h.saved[0].purchase_price).toBeNull();
  });

  it('update с purchase_price: 300 выставляет значение', async () => {
    const h = harness({ id: 'p1', name: 'Фильтр', purchase_price: 520 });
    await h.service.update('p1', { purchase_price: 300 });
    expect(h.saved[0].purchase_price).toBe(300);
  });

  it('create с purchase_price: 0 сохраняет ноль, а не null', async () => {
    const h = harness();
    await h.service.create({ name: 'Хомут', purchase_price: 0 });
    expect(h.saved[0].purchase_price).toBe(0);
  });

  it('create без purchase_price не выставляет поле', async () => {
    const h = harness();
    await h.service.create({ name: 'Хомут' });
    expect(h.saved[0]).not.toHaveProperty('purchase_price');
  });
});

describe('PartTemplatesService.purchasePrices', () => {
  it('purchasePrices([]) не ходит в базу и возвращает пустую Map', async () => {
    const h = harness();
    const m = await h.service.purchasePrices([]);
    expect(m.size).toBe(0);
    expect(h.calls.queries).toBe(0);
  });

  it('возвращает Map id → закупка, null для пустой закупки', async () => {
    const h = harness();
    h.setRows([
      { id: 'a', purchase_price: 100 },
      { id: 'b', purchase_price: null },
      { id: 'c' },
    ]);
    const m = await h.service.purchasePrices(['a', 'b', 'c']);
    expect(h.calls.addSelect).toContain('p.purchase_price');
    expect(m.get('a')).toBe(100);
    expect(m.get('b')).toBeNull();
    expect(m.get('c')).toBeNull();
  });
});
