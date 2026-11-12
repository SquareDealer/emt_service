import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PriceListService } from './price-list.service';

class SetPriceDto {
  /** Null clears just that figure and keeps inheriting it from the base. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  hours?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number | null;
}

class AttachPartDto {
  /** null/absent = the part applies to every generation. */
  @IsOptional()
  @IsUUID()
  generation_id?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  qty?: number | null;

  /** false = offered on the confirmation sheet but not ticked. */
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;

  /**
   * Role of the part in the work («фильтр масляный»). A generation row replaces
   * the universal one occupying the same slot.
   */
  @IsOptional()
  @IsString()
  slot?: string | null;
}

class CreateWorkDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  default_hours?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  default_price?: number | null;

  /** null/absent = only the shared base figures are stored. */
  @IsOptional()
  @IsUUID()
  generation_id?: string | null;

  /** This generation's own figures; both empty = no override is created. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  hours?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number | null;
}

class CopyPricesDto {
  @IsUUID()
  from_generation_id: string;

  @IsUUID()
  to_generation_id: string;

  /** 'fill' keeps what the target already has; 'replace' overwrites it. */
  @IsOptional()
  @IsIn(['replace', 'fill'])
  mode?: 'replace' | 'fill';
}

/**
 * Reading the price list is open to any signed-in user (a master needs to see
 * what a job costs); changing it is owner/receptionist only.
 */
@Controller('price-list')
@UseGuards(RolesGuard)
export class PriceListController {
  constructor(private readonly priceList: PriceListService) {}

  @Get()
  list(@Query('generation_id') generationId?: string) {
    return this.priceList.list(generationId);
  }

  /** A new work, optionally with its price for one generation. */
  @Post('works')
  @Roles('owner', 'master_receptionist')
  createWork(@Body() dto: CreateWorkDto) {
    return this.priceList.createWork(dto);
  }

  @Put(':templateId/:generationId')
  @Roles('owner', 'master_receptionist')
  setPrice(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('generationId', ParseUUIDPipe) generationId: string,
    @Body() dto: SetPriceDto,
  ) {
    return this.priceList.setPrice(templateId, generationId, dto);
  }

  /** Reset to the shared base price. */
  @Delete(':templateId/:generationId')
  @Roles('owner', 'master_receptionist')
  @HttpCode(204)
  clearPrice(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('generationId', ParseUUIDPipe) generationId: string,
  ) {
    return this.priceList.clearPrice(templateId, generationId);
  }

  /** Parts a work pulls in — «группировка работ вместе с запчастями». */
  @Get(':templateId/parts')
  listParts(@Param('templateId', ParseUUIDPipe) templateId: string) {
    return this.priceList.listParts(templateId);
  }

  @Put(':templateId/parts/:partTemplateId')
  @Roles('owner', 'master_receptionist')
  attachPart(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('partTemplateId', ParseUUIDPipe) partTemplateId: string,
    @Body() dto: AttachPartDto,
  ) {
    return this.priceList.attachPart(templateId, partTemplateId, dto);
  }

  @Delete(':templateId/parts/:partTemplateId')
  @Roles('owner', 'master_receptionist')
  @HttpCode(204)
  detachPart(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('partTemplateId', ParseUUIDPipe) partTemplateId: string,
    @Query('generation_id') generationId?: string,
  ) {
    return this.priceList.detachPart(templateId, partTemplateId, generationId || null);
  }

  @Post('copy')
  @Roles('owner', 'master_receptionist')
  copy(@Body() dto: CopyPricesDto) {
    return this.priceList.copy(dto.from_generation_id, dto.to_generation_id, dto.mode ?? 'fill');
  }
}
