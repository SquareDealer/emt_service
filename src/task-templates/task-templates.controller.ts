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

@Controller('task-templates')
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
  create(@Body() dto: CreateTemplateDto) {
    return this.templates.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.remove(id);
  }
}
