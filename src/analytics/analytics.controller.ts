import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  AnalyticsService,
  AnalyticsSummary,
  MissingCostRow,
  PartCostRow,
} from './analytics.service';

const MAX_EDGES = 63;

/** Повтор параметра (`?from=a&from=b`) приходит массивом — это 400, а не TypeError. */
function parseIso(raw: unknown, param: string): Date {
  if (typeof raw !== 'string') {
    throw new BadRequestException(`Параметр ${param}: ожидается одна ISO-дата`);
  }
  const d = new Date(raw.trim());
  if (!raw.trim() || Number.isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}/.test(raw.trim())) {
    throw new BadRequestException(`Параметр ${param}: «${raw}» — не ISO-дата`);
  }
  return d;
}

/** `edges` — от 2 до 63 ISO-инстантов через запятую, строго по возрастанию. */
export function parseEdges(raw: unknown): Date[] {
  if (raw !== undefined && typeof raw !== 'string') {
    throw new BadRequestException('Параметр edges: ожидается одна строка через запятую');
  }
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
  rawFrom: unknown,
  rawTo: unknown,
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

/** `from`/`to` отчёта о закупках: обязательны, from < to. */
export function parseRange(rawFrom: unknown, rawTo: unknown): { from: Date; to: Date } {
  const from = parseIso(rawFrom, 'from');
  const to = parseIso(rawTo, 'to');
  if (from.getTime() >= to.getTime()) {
    throw new BadRequestException('Параметр from должен быть раньше to');
  }
  return { from, to };
}

export class PartCostItemDto {
  @IsUUID()
  part_line_id: string;

  // Поле обязательно: пропускается проверка только для явного null (очистка закупки).
  @ValidateIf((o: PartCostItemDto) => o.purchase_price !== null)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  purchase_price: number | null;
}

export class SetPartCostsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PartCostItemDto)
  items: PartCostItemDto[];
}

@Controller('analytics')
@UseGuards(RolesGuard)
@Roles('owner')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  // Параметры типизированы unknown намеренно: при типе string ValidationPipe
  // (transform: true) склеивает повтор `?edges=a&edges=b` в 'a,b' через String(),
  // и парсер не увидит массив, который должен дать 400.
  summary(
    @Query('edges') edges?: unknown,
    @Query('prev_from') prevFrom?: unknown,
    @Query('prev_to') prevTo?: unknown,
  ): Promise<AnalyticsSummary> {
    return this.analytics.summary(parseEdges(edges), parsePrev(prevFrom, prevTo));
  }

  @Get('missing-costs')
  missingCosts(@Query('from') from?: unknown, @Query('to') to?: unknown): Promise<MissingCostRow[]> {
    const range = parseRange(from, to);
    return this.analytics.missingCosts(range.from, range.to);
  }

  @Get('part-costs/:workOrderId')
  partCosts(@Param('workOrderId', ParseUUIDPipe) id: string): Promise<PartCostRow[]> {
    return this.analytics.partCosts(id);
  }

  @Patch('part-costs')
  setPartCosts(@Body() dto: SetPartCostsDto): Promise<{ updated: number }> {
    return this.analytics.setPartCosts(dto.items);
  }
}
