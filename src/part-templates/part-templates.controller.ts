import {
  Body,
  Controller,
  ForbiddenException,
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
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
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
  @IsNumber()
  @Min(0)
  purchase_price?: number | null;

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
  @IsNumber()
  @Min(0)
  purchase_price?: number | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

function assertCostAccess(user: CurrentUserData, dto: { purchase_price?: number | null }) {
  if (dto.purchase_price !== undefined && user.role !== 'owner') {
    throw new ForbiddenException('Закупочную цену меняет только владелец');
  }
}

/** Anyone signed in may read the catalog; only owner/receptionist may shape it. */
@Controller('part-templates')
@UseGuards(RolesGuard)
export class PartTemplatesController {
  constructor(private readonly parts: PartTemplatesService) {}

  @Get()
  findAll(
    @CurrentUser() user: CurrentUserData,
    @Query('q') q?: string,
    @Query('all') all?: string,
  ) {
    return this.parts.findAll(q, all === 'true' || all === '1', user.role === 'owner');
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentUserData, @Param('id', ParseUUIDPipe) id: string) {
    return this.parts.findOne(id, user.role === 'owner');
  }

  @Post()
  @Roles('owner', 'master_receptionist')
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreatePartTemplateDto) {
    assertCostAccess(user, dto);
    return this.parts.create(dto);
  }

  @Patch(':id')
  @Roles('owner', 'master_receptionist')
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartTemplateDto,
  ) {
    assertCostAccess(user, dto);
    return this.parts.update(id, dto);
  }

  /** Soft delete — estimate lines reference catalog entries. */
  @Delete(':id')
  @Roles('owner', 'master_receptionist')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.parts.deactivate(id);
  }
}
