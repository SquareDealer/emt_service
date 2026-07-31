import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PartUnit } from '../entities/part-line.entity';
import { PartTemplatesService } from './part-templates.service';

class CreatePartTemplateDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  manufacturer?: string | null;

  @IsOptional()
  @IsString()
  catalog_number?: string | null;

  @IsOptional()
  @IsIn(['pcs', 'l'])
  unit?: PartUnit;

  @IsOptional()
  @IsNumber()
  @Min(0)
  default_price?: number | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class UpdatePartTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string | null;

  @IsOptional()
  @IsString()
  catalog_number?: string | null;

  @IsOptional()
  @IsIn(['pcs', 'l'])
  unit?: PartUnit;

  @IsOptional()
  @IsNumber()
  @Min(0)
  default_price?: number | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Anyone signed in may read the catalog; only owner/receptionist may shape it. */
@Controller('part-templates')
@UseGuards(RolesGuard)
export class PartTemplatesController {
  constructor(private readonly parts: PartTemplatesService) {}

  @Get()
  findAll(@Query('q') q?: string, @Query('all') all?: string) {
    return this.parts.findAll(q, all === 'true' || all === '1');
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.parts.findOne(id);
  }

  @Post()
  @Roles('owner', 'master_receptionist')
  create(@Body() dto: CreatePartTemplateDto) {
    return this.parts.create(dto);
  }

  @Patch(':id')
  @Roles('owner', 'master_receptionist')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePartTemplateDto) {
    return this.parts.update(id, dto);
  }

  /** Soft delete — estimate lines reference catalog entries. */
  @Delete(':id')
  @Roles('owner', 'master_receptionist')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.parts.deactivate(id);
  }
}
