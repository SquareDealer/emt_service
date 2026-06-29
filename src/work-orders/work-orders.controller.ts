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
import { ArchiveSort, WorkOrdersService } from './work-orders.service';
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

@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

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
    return this.workOrders.addLaborLine(id, dto, user);
  }

  @Patch(':id/labor/:lineId')
  updateLabor(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: UpdateLaborLineDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workOrders.updateLaborLine(id, lineId, dto, user);
  }

  @Delete(':id/labor/:lineId')
  removeLabor(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workOrders.removeLaborLine(id, lineId, user);
  }

  @Post(':id/parts')
  addPart(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePartLineDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workOrders.addPartLine(id, dto, user);
  }

  @Patch(':id/parts/:lineId')
  updatePart(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: UpdatePartLineDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workOrders.updatePartLine(id, lineId, dto, user);
  }

  @Delete(':id/parts/:lineId')
  removePart(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workOrders.removePartLine(id, lineId, user);
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
