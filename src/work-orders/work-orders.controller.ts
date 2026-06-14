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
import { WorkOrdersService } from './work-orders.service';
import {
  CreateLaborLineDto,
  CreatePartLineDto,
  CreateWorkOrderDto,
  UpdateStatusDto,
  UpdateWorkOrderDto,
} from './dto/work-order.dto';

@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  @Get()
  findAll() {
    return this.workOrders.findAll();
  }

  // literal routes must precede ':id' so they aren't parsed as a UUID
  @Get('board')
  board() {
    return this.workOrders.board();
  }

  @Get('calendar')
  calendar(@Query('from') from?: string, @Query('to') to?: string) {
    return this.workOrders.calendar(from, to);
  }

  @Post()
  create(@Body() dto: CreateWorkOrderDto) {
    return this.workOrders.create(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.workOrders.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWorkOrderDto) {
    return this.workOrders.update(id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.workOrders.updateStatus(id, dto.status);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.workOrders.remove(id);
  }

  @Post(':id/labor')
  addLabor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLaborLineDto,
  ) {
    return this.workOrders.addLaborLine(id, dto);
  }

  @Delete(':id/labor/:lineId')
  removeLabor(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.workOrders.removeLaborLine(id, lineId);
  }

  @Post(':id/parts')
  addPart(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePartLineDto,
  ) {
    return this.workOrders.addPartLine(id, dto);
  }

  @Delete(':id/parts/:lineId')
  removePart(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.workOrders.removePartLine(id, lineId);
  }

  @Post(':id/close')
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.workOrders.close(id);
  }
}
