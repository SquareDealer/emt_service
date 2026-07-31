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
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

class CreateTemplateDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  default_hours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  default_price?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  default_hours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  default_price?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

import { TaskTemplatesService } from './task-templates.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

/**
 * Reading is open to anyone signed in; editing is owner/receptionist only.
 * Until the price list existed there was no guard here at all — a plain master
 * could delete the entire works catalog. Deliberate behaviour change.
 */
@Controller('task-templates')
@UseGuards(RolesGuard)
export class TaskTemplatesController {
  constructor(private readonly templates: TaskTemplatesService) {}

  @Get()
  findAll(@Query('all') all?: string) {
    return this.templates.findAll(all === 'true' || all === '1');
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.findOne(id);
  }

  @Post()
  @Roles('owner', 'master_receptionist')
  create(@Body() dto: CreateTemplateDto) {
    return this.templates.create(dto);
  }

  @Patch(':id')
  @Roles('owner', 'master_receptionist')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(id, dto);
  }

  /** Soft delete: labor lines keep a link to the template they came from. */
  @Delete(':id')
  @Roles('owner', 'master_receptionist')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.deactivate(id);
  }
}
