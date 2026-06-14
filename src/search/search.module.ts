import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../entities/client.entity';
import { Vehicle } from '../entities/vehicle.entity';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Client, Vehicle])],
  providers: [SearchService],
  controllers: [SearchController],
})
export class SearchModule {}
