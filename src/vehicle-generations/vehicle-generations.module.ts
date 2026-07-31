import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleGeneration } from '../entities/vehicle-generation.entity';
import { VehicleGenerationsService } from './vehicle-generations.service';
import { VehicleGenerationsController } from './vehicle-generations.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VehicleGeneration])],
  providers: [VehicleGenerationsService],
  controllers: [VehicleGenerationsController],
  exports: [VehicleGenerationsService],
})
export class VehicleGenerationsModule {}
