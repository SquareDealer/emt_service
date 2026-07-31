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
  StreamableFile,
} from '@nestjs/common';
import { IsIn, IsObject, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { ArchiveSort, WorkOrdersService } from './work-orders.service';
import { WorkOrderLinesService } from './work-order-lines.service';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import {
  CreateLaborLineDto,
  CreatePartLineDto,
  CreateWorkOrderDto,
  SetPaidDto,
  UpdateLaborLineDto,
  UpdatePartLineDto,
  UpdateStatusDto,
  UpdateWorkOrderDto,
} from './dto/work-order.dto';

class ApplyTemplateBodyDto {
  @IsUUID()
  template_id: string;

  /** Omit to take the parts the template ticks by default. */
  @IsOptional()
  @IsUUID('4', { each: true })
  part_template_ids?: string[];

  @IsOptional()
  @IsObject()
  qty?: Record<string, number>;
}

class DuplicateWorkOrderDto {
  /** Omit to copy onto the same car. */
  @IsOptional()
  @IsUUID()
  vehicle_id?: string;
}

class RenameGroupDto {
  @IsString()
  @MinLength(1)
  name: string;
}

class MoveGroupDto {
  @IsIn(['up', 'down'])
  direction: 'up' | 'down';
}

@Controller('work-orders')
export class WorkOrdersController {
  constructor(
    private readonly workOrders: WorkOrdersService,
    private readonly lines: WorkOrderLinesService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserData) {
    return this.workOrders.findAll(user);
  }

  // literal routes must precede ':id' so they aren't parsed as a UUID
  @Get('board')
  board(@CurrentUser() user: CurrentUserData) {
    return this.workOrders.board(user);
  }

  @Get('calendar')
  calendar(
    @CurrentUser() user: CurrentUserData,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.workOrders.calendar(from, to, user);
  }

  @Get('archive')
  archive(
    @CurrentUser() user: CurrentUserData,
    @Query('q') q?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.workOrders.archive(
      {
        q,
        sort: sort as ArchiveSort,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      },
      user,
    );
  }

  @Post()
  create(@Body() dto: CreateWorkOrderDto, @CurrentUser() user: CurrentUserData) {
    return this.workOrders.create(dto, user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workOrders.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkOrderDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workOrders.update(id, dto, user);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workOrders.updateStatus(id, dto.status, user);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workOrders.remove(id, user);
  }

  @Post(':id/labor')
  addLabor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLaborLineDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.lines.addLaborLine(id, dto, user);
  }

  @Patch(':id/labor/:lineId')
  updateLabor(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: UpdateLaborLineDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.lines.updateLaborLine(id, lineId, dto, user);
  }

  @Delete(':id/labor/:lineId')
  removeLabor(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.lines.removeLaborLine(id, lineId, user);
  }

  @Post(':id/parts')
  addPart(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePartLineDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.lines.addPartLine(id, dto, user);
  }

  @Patch(':id/parts/:lineId')
  updatePart(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: UpdatePartLineDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.lines.updatePartLine(id, lineId, dto, user);
  }

  @Delete(':id/parts/:lineId')
  removePart(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.lines.removePartLine(id, lineId, user);
  }

  /** What applying a price-list entry would add — shown for confirmation. */
  @Get(':id/template-preview')
  previewTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('template_id', ParseUUIDPipe) templateId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.lines.previewTemplate(id, templateId, user);
  }

  /** Insert the work and the chosen parts as one block. */
  @Post(':id/apply-template')
  applyTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyTemplateBodyDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.lines.applyTemplate(id, dto, user);
  }

  @Patch(':id/groups/:groupKey')
  renameGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('groupKey', ParseUUIDPipe) groupKey: string,
    @Body() dto: RenameGroupDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.lines.renameGroup(id, groupKey, dto.name, user);
  }

  @Post(':id/groups/:groupKey/move')
  moveGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('groupKey', ParseUUIDPipe) groupKey: string,
    @Body() dto: MoveGroupDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.lines.moveGroup(id, groupKey, dto.direction, user);
  }

  /** Break the block apart — the lines stay, they just stop being grouped. */
  @Delete(':id/groups/:groupKey')
  ungroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('groupKey', ParseUUIDPipe) groupKey: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.lines.ungroup(id, groupKey, user);
  }

  /** Copy the order (optionally onto another car) — the estimate comes along. */
  @Post(':id/duplicate')
  duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DuplicateWorkOrderDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workOrders.duplicate(id, dto.vehicle_id, user);
  }

  @Post(':id/close')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workOrders.close(id, user);
  }

  @Patch(':id/paid')
  setPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPaidDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workOrders.setPaid(id, dto.paid_amount, user);
  }

  @Get(':id/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.workOrders.renderPdf(id, user);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':id/order-pdf')
  async orderPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.workOrders.renderOrderPdf(id, user);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
