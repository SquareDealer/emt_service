import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientsService } from './clients.service';
import { ClientsImportService } from './import/clients-import.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('clients')
export class ClientsController {
  constructor(
    private readonly clients: ClientsService,
    private readonly vehicles: VehiclesService,
    private readonly importer: ClientsImportService,
  ) {}

  @Get()
  findAll() {
    return this.clients.findAll();
  }

  @Post()
  async create(@Body() dto: CreateClientDto) {
    // Reject duplicate phone here (HTTP path only) so CSV import / bot keep their
    // own dedup logic via the shared service.create. Surface the existing client
    // so the UI can offer to open it.
    const existing = await this.clients.findByPhone(dto.phone);
    if (existing) {
      throw new ConflictException({
        code: 'DUPLICATE_PHONE',
        message: `Клиент с таким номером уже есть: ${existing.full_name}`,
        clientId: existing.id,
        clientName: existing.full_name,
      });
    }
    // HTTP create is always a manual entry; source is fixed server-side.
    return this.clients.create({ ...dto, source: 'manual' });
  }

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }),
  )
  async import(@UploadedFile() file?: Express.Multer.File) {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Файл не передан (поле "file")');
    }
    return this.importer.import(file.buffer);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clients.findOne(id);
  }

  @Get(':id/vehicles')
  async vehiclesOf(@Param('id', ParseUUIDPipe) id: string) {
    await this.clients.findOne(id); // 404 if client missing
    return this.vehicles.findByClient(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClientDto) {
    return this.clients.update(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'master_receptionist')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.clients.remove(id);
  }
}
