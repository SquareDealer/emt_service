import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../entities/client.entity';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { ClientsImportService } from './import/clients-import.service';
import { VehiclesModule } from '../vehicles/vehicles.module';

@Module({
  imports: [TypeOrmModule.forFeature([Client]), VehiclesModule],
  providers: [ClientsService, ClientsImportService],
  controllers: [ClientsController],
  exports: [ClientsService],
})
export class ClientsModule {}
