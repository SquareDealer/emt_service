import { PART_TEMPLATES_LIMIT, PartTemplatesService } from './part-templates.service';

function harness() {
  const calls = { limit: [] as number[], where: [] as string[] };
  const qb = {
    where(sql: string) { calls.where.push(sql); return qb; },
    andWhere(sql: string) { calls.where.push(sql); return qb; },
    orderBy() { return qb; },
    limit(n: number) { calls.limit.push(n); return qb; },
    getMany: async () => [],
  };
  const repo = { createQueryBuilder: () => qb };
  return { service: new PartTemplatesService(repo as never), calls };
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
});
