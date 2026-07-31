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
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { VehicleGenerationsService } from './vehicle-generations.service';

class CreateGenerationDto {
  @IsString()
  @MinLength(1)
  make: string;

  @IsString()
  @MinLength(1)
  model: string;

  @IsOptional()
  @IsString()
  code?: string | null;

  @IsOptional()
  @IsString()
  years?: string | null;

  @IsOptional()
  @IsInt()
  sort?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class UpdateGenerationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  make?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  model?: string;

  @IsOptional()
  @IsString()
  code?: string | null;

  @IsOptional()
  @IsString()
  years?: string | null;

  @IsOptional()
  @IsInt()
  sort?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/**
 * Reading the catalog is open to any authenticated user (the vehicle form needs
 * it); editing it is owner/receptionist only — a plain master must not be able
 * to reshape the reference the price list is keyed by.
 */
@Controller('vehicle-generations')
@UseGuards(RolesGuard)
export class VehicleGenerationsController {
  constructor(private readonly generations: VehicleGenerationsService) {}

  @Get()
  findAll(@Query('all') all?: string) {
    return this.generations.findAll(all === 'true' || all === '1');
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.generations.findOne(id);
  }

  @Post()
  @Roles('owner', 'master_receptionist')
  create(@Body() dto: CreateGenerationDto) {
    return this.generations.create(dto);
  }

  @Patch(':id')
  @Roles('owner', 'master_receptionist')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGenerationDto) {
    return this.generations.update(id, dto);
  }

  /** Soft delete — the row is retired, never removed (vehicles point at it). */
  @Delete(':id')
  @Roles('owner', 'master_receptionist')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.generations.deactivate(id);
  }
}
