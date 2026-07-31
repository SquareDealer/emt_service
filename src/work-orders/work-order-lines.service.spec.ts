import { WorkOrderLinesService } from './work-order-lines.service';
import { WorkOrder } from '../entities/work-order.entity';
import { LaborLine } from '../entities/labor-line.entity';
import { PartLine } from '../entities/part-line.entity';
import { TaskTemplatePart } from '../entities/task-template-part.entity';
import { PartTemplate } from '../entities/part-template.entity';
import type { Viewer } from './work-orders-core.service';

const owner: Viewer = { id: 'u-owner', role: 'owner' };
const R56 = 'gen-r56';

function partTemplate(id: string, name: string, price = 100): PartTemplate {
  return {
    id,
    name,
    manufacturer: 'MANN',
    catalog_number: `art-${id}`,
    unit: 'pcs',
    default_price: price,
    active: true,
  };
}

function link(p: Partial<TaskTemplatePart>): TaskTemplatePart {
  return {
    id: `ttp-${Math.random()}`,
    task_template_id: 'tpl',
    generation_id: null,
    qty: null,
    is_default: true,
    ...p,
  } as TaskTemplatePart;
}

/**
 * The work order the fake core hands back. Lines accumulate in `labor`/`parts`
 * so the group assembled by applyTemplate can be inspected.
 */
function harness(links: TaskTemplatePart[], vehicleGeneration: string | null = R56) {
  const labor: LaborLine[] = [];
  const parts: PartLine[] = [];

  const order = {
    id: 'wo1',
    status: 'in_progress',
    vehicle: { id: 'v1', generation_id: vehicleGeneration },
    labor_lines: labor,
    part_lines: parts,
  } as unknown as WorkOrder;

  let recomputes = 0;
  let transactions = 0;

  const core = {
    assertOpen: async () => order,
    loadFull: async () => order,
    recompute: async () => {
      recomputes += 1;
      return 0;
    },
  };

  const manager = {
    create: (_entity: unknown, data: Record<string, unknown>) => ({ id: `x${Math.random()}`, ...data }),
    save: async (row: Record<string, unknown>) => {
      if ('rate_snapshot' in row) labor.push(row as unknown as LaborLine);
      else parts.push(row as unknown as PartLine);
      return row;
    },
  };

  const lineRepo = () => ({
    create: (d: unknown) => d,
    save: async (d: unknown) => d,
    findOne: async () => null,
    delete: async () => ({ affected: 1 }),
    update: async () => ({ affected: 1 }),
    manager: {
      transaction: async (cb: (m: typeof manager) => Promise<void>) => {
        transactions += 1;
        await cb(manager);
      },
    },
  });

  const service = new WorkOrderLinesService(
    core as never,
    lineRepo() as never,
    lineRepo() as never,
    {
      // Distinguish the universal query (IsNull operator) from the generation one.
      find: async ({ where }: { where: { generation_id: unknown } }) => {
        const universal = typeof where.generation_id !== 'string';
        return links.filter((l) => (universal ? l.generation_id === null : l.generation_id === where.generation_id));
      },
    } as never,
    { getLaborRate: async () => 2000 } as never,
    { findOne: async () => ({ id: 'tpl', name: 'Замена масла', default_hours: 1, default_price: 2500 }) } as never,
    {
      resolveForLine: async (_t: string, _g: string | null, rate: number) => ({
        hours: 1,
        price_override: 2500,
        rate_snapshot: rate,
        source: 'generation' as const,
      }),
    } as never,
  );

  return {
    service,
    labor,
    parts,
    counts: () => ({ recomputes, transactions }),
  };
}

describe('template parts — universal vs generation-specific', () => {
  const oil = partTemplate('oil', 'Масло Castrol 5 л', 4500);
  const filter = partTemplate('filter', 'Фильтр MANN', 800);
  const filterR56 = partTemplate('filter-r56', 'Фильтр MANN R56', 900);

  it('applies universal parts when the car has no generation', async () => {
    const h = harness(
      [link({ part_template_id: 'oil', part_template: oil }), link({ part_template_id: 'filter', part_template: filter })],
      null,
    );
    const preview = await h.service.previewTemplate('wo1', 'tpl', owner);
    expect(preview.parts.map((p) => p.name).sort()).toEqual(['Масло Castrol 5 л', 'Фильтр MANN']);
  });

  it('a generation row replaces the universal one in the SAME slot', async () => {
    // The two filters are DIFFERENT catalog entries — that is the whole point,
    // and why matching on part_template_id could never fire. Matching on the
    // slot lets the R56 filter win while the universal oil survives; swapping
    // the entire set instead would leave an R56 oil change without any oil.
    const h = harness([
      link({ part_template_id: 'oil', part_template: oil, slot: 'масло' }),
      link({ part_template_id: 'filter', part_template: filter, slot: 'фильтр масляный' }),
      link({
        part_template_id: 'filter-r56',
        part_template: filterR56,
        slot: 'фильтр масляный',
        generation_id: R56,
        qty: 2,
      }),
    ]);
    const preview = await h.service.previewTemplate('wo1', 'tpl', owner);

    const names = preview.parts.map((p) => p.name).sort();
    expect(names).toContain('Масло Castrol 5 л'); // the universal part survives
    expect(names).toContain('Фильтр MANN R56'); // the generation one won its slot
    expect(names).not.toContain('Фильтр MANN');
    expect(preview.parts).toHaveLength(2);

    const replaced = preview.parts.find((p) => p.part_template_id === 'filter-r56')!;
    expect(replaced.qty).toBe(2);
    expect(replaced.generation_specific).toBe(true);
  });

  it('matches slots regardless of case and stray spaces', async () => {
    const h = harness([
      link({ part_template_id: 'filter', part_template: filter, slot: 'Фильтр Масляный' }),
      link({ part_template_id: 'filter-r56', part_template: filterR56, slot: ' фильтр масляный ', generation_id: R56 }),
    ]);
    const preview = await h.service.previewTemplate('wo1', 'tpl', owner);
    expect(preview.parts.map((p) => p.name)).toEqual(['Фильтр MANN R56']);
  });

  it('adds an unslotted generation part alongside, replacing nothing', async () => {
    // No slot = "this part stands alone", so it must not knock anything out.
    const h = harness([
      link({ part_template_id: 'oil', part_template: oil }),
      link({ part_template_id: 'filter-r56', part_template: filterR56, generation_id: R56 }),
    ]);
    const preview = await h.service.previewTemplate('wo1', 'tpl', owner);
    expect(preview.parts.map((p) => p.name).sort()).toEqual(['Масло Castrol 5 л', 'Фильтр MANN R56']);
  });

  it('ignores rows belonging to another generation', async () => {
    const h = harness([
      link({ part_template_id: 'filter', part_template: filterR56, generation_id: 'gen-f56' }),
    ]);
    expect((await h.service.previewTemplate('wo1', 'tpl', owner)).parts).toEqual([]);
  });

  it('defaults a missing quantity to 1', async () => {
    const h = harness([link({ part_template_id: 'oil', part_template: oil, qty: null })]);
    expect((await h.service.previewTemplate('wo1', 'tpl', owner)).parts[0].qty).toBe(1);
  });

  it('reports where the labour price came from', async () => {
    const h = harness([]);
    const preview = await h.service.previewTemplate('wo1', 'tpl', owner);
    expect(preview.price_source).toBe('generation');
    expect(preview.labor).toMatchObject({ name: 'Замена масла', price_override: 2500 });
  });
});

describe('applying a template', () => {
  const oil = partTemplate('oil', 'Масло', 4500);
  const extra = partTemplate('extra', 'Присадка', 300);

  it('adds the work and its parts as one block, inside a transaction', async () => {
    const h = harness([
      link({ part_template_id: 'oil', part_template: oil }),
      link({ part_template_id: 'extra', part_template: extra }),
    ]);
    await h.service.applyTemplate('wo1', { template_id: 'tpl' }, owner);

    expect(h.labor).toHaveLength(1);
    expect(h.parts).toHaveLength(2);
    const keys = new Set([...h.labor, ...h.parts].map((l) => l.group_key));
    expect(keys.size).toBe(1); // one block
    expect([...keys][0]).toBeTruthy();
    expect(h.labor[0].group_name).toBe('Замена масла');
    // 1 + N inserts without a transaction would leave a half-built estimate.
    expect(h.counts().transactions).toBe(1);
    expect(h.counts().recomputes).toBe(1);
  });

  it('takes only the parts that were ticked', async () => {
    const h = harness([
      link({ part_template_id: 'oil', part_template: oil }),
      link({ part_template_id: 'extra', part_template: extra }),
    ]);
    await h.service.applyTemplate('wo1', { template_id: 'tpl', part_template_ids: ['oil'] }, owner);
    expect(h.parts.map((p) => p.name)).toEqual(['Масло']);
  });

  it('leaves out parts the template does not tick by default', async () => {
    const h = harness([
      link({ part_template_id: 'oil', part_template: oil }),
      link({ part_template_id: 'extra', part_template: extra, is_default: false }),
    ]);
    await h.service.applyTemplate('wo1', { template_id: 'tpl' }, owner);
    expect(h.parts.map((p) => p.name)).toEqual(['Масло']);
  });

  it('honours a quantity override', async () => {
    const h = harness([link({ part_template_id: 'oil', part_template: oil, qty: 4 })]);
    await h.service.applyTemplate('wo1', { template_id: 'tpl', qty: { oil: 5 } }, owner);
    expect(h.parts[0].qty).toBe(5);
  });

  it('carries the catalog link and brand onto the line', async () => {
    const h = harness([link({ part_template_id: 'oil', part_template: oil })]);
    await h.service.applyTemplate('wo1', { template_id: 'tpl' }, owner);
    expect(h.parts[0]).toMatchObject({
      part_template_id: 'oil',
      manufacturer: 'MANN',
      catalog_number: 'art-oil',
      unit_price: 4500,
    });
  });

  it('starts a fresh block each time it is applied', async () => {
    const h = harness([link({ part_template_id: 'oil', part_template: oil })]);
    await h.service.applyTemplate('wo1', { template_id: 'tpl' }, owner);
    await h.service.applyTemplate('wo1', { template_id: 'tpl' }, owner);
    const keys = new Set(h.labor.map((l) => l.group_key));
    expect(keys.size).toBe(2);
    // ...and the second block sorts after the first.
    expect(h.labor[1].group_sort).toBeGreaterThan(h.labor[0].group_sort);
  });
});
