import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AnalyticsService, AnalyticsSummary } from './analytics.service';

const MAX_EDGES = 63;

function parseIso(raw: string, param: string): Date {
  const d = new Date(raw.trim());
  if (!raw.trim() || Number.isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}/.test(raw.trim())) {
    throw new BadRequestException(`Параметр ${param}: «${raw}» — не ISO-дата`);
  }
  return d;
}

/** `edges` — от 2 до 63 ISO-инстантов через запятую, строго по возрастанию. */
export function parseEdges(raw: string | undefined): Date[] {
  const parts = raw ? raw.split(',') : [];
  if (parts.length < 2) {
    throw new BadRequestException('Параметр edges: нужно минимум две границы периода');
  }
  if (parts.length > MAX_EDGES) {
    throw new BadRequestException(`Параметр edges: не больше ${MAX_EDGES} границ`);
  }
  const edges = parts.map((p) => parseIso(p, 'edges'));
  for (let i = 1; i < edges.length; i++) {
    if (edges[i].getTime() <= edges[i - 1].getTime()) {
      throw new BadRequestException('Параметр edges: границы должны строго возрастать');
    }
  }
  return edges;
}

/** `prev_from`/`prev_to` — только парой, prev_from < prev_to; без них — null. */
export function parsePrev(
  rawFrom: string | undefined,
  rawTo: string | undefined,
): { from: Date; to: Date } | null {
  if (rawFrom === undefined && rawTo === undefined) return null;
  if (rawFrom === undefined || rawTo === undefined) {
    throw new BadRequestException('Параметры prev_from и prev_to передаются только вместе');
  }
  const from = parseIso(rawFrom, 'prev_from');
  const to = parseIso(rawTo, 'prev_to');
  if (from.getTime() >= to.getTime()) {
    throw new BadRequestException('Параметр prev_from должен быть раньше prev_to');
  }
  return { from, to };
}

@Controller('analytics')
@UseGuards(RolesGuard)
@Roles('owner')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  summary(
    @Query('edges') edges?: string,
    @Query('prev_from') prevFrom?: string,
    @Query('prev_to') prevTo?: string,
  ): Promise<AnalyticsSummary> {
    return this.analytics.summary(parseEdges(edges), parsePrev(prevFrom, prevTo));
  }
}
