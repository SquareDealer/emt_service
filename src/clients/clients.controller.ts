import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientsService } from './clients.service';
import { ClientsImportService } from './import/clients-import.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

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
  create(@Body() dto: CreateClientDto) {
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

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.clients.remove(id);
  }
}
