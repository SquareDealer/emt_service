import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalendarBlock } from '../entities/calendar-block.entity';
import { CalendarBlocksService } from './calendar-blocks.service';
import { CalendarBlocksController } from './calendar-blocks.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CalendarBlock])],
  providers: [CalendarBlocksService],
  controllers: [CalendarBlocksController],
  exports: [CalendarBlocksService],
})
export class CalendarBlocksModule {}
