import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { CalendarBlocksService } from './calendar-blocks.service';

class CreateBlockDto {
  @IsOptional()
  @IsString()
  title?: string | null;

  @IsISO8601()
  starts_at: string;

  @IsInt()
  @Min(5)
  @Max(60 * 24 * 30)
  duration_min: number;

  /** null = shop-wide. A master's request is forced to themselves by the service. */
  @IsOptional()
  @IsUUID()
  user_id?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

class UpdateBlockDto {
  @IsOptional()
  @IsString()
  title?: string | null;

  @IsOptional()
  @IsISO8601()
  starts_at?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60 * 24 * 30)
  duration_min?: number;

  @IsOptional()
  @IsUUID()
  user_id?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

@Controller('calendar-blocks')
export class CalendarBlocksController {
  constructor(private readonly blocks: CalendarBlocksService) {}

  @Get()
  range(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.blocks.range(from, to, user);
  }

  @Post()
  create(@Body() dto: CreateBlockDto, @CurrentUser() user: CurrentUserData) {
    return this.blocks.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBlockDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.blocks.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserData) {
    return this.blocks.remove(id, user);
  }
}
