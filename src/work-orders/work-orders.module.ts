import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkOrder } from '../entities/work-order.entity';
import { LaborLine } from '../entities/labor-line.entity';
import { PartLine } from '../entities/part-line.entity';
import { Vehicle } from '../entities/vehicle.entity';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersController } from './work-orders.controller';
import { PricingService } from './pricing.service';
import { SettingsModule } from '../settings/settings.module';
import { TaskTemplatesModule } from '../task-templates/task-templates.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkOrder, LaborLine, PartLine, Vehicle]),
    SettingsModule,
    TaskTemplatesModule,
  ],
  providers: [WorkOrdersService, PricingService],
  controllers: [WorkOrdersController],
  exports: [WorkOrdersService, PricingService],
})
export class WorkOrdersModule {}
