import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkOrder } from '../entities/work-order.entity';
import { LaborLine } from '../entities/labor-line.entity';
import { PartLine } from '../entities/part-line.entity';
import { Vehicle } from '../entities/vehicle.entity';
import { TaskTemplatePart } from '../entities/task-template-part.entity';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersCoreService } from './work-orders-core.service';
import { WorkOrderLinesService } from './work-order-lines.service';
import { WorkOrdersController } from './work-orders.controller';
import { PricingService } from './pricing.service';
import { WorkOrderPdfService } from './pdf/work-order-pdf.service';
import { SettingsModule } from '../settings/settings.module';
import { TaskTemplatesModule } from '../task-templates/task-templates.module';
import { PartTemplatesModule } from '../part-templates/part-templates.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkOrder, LaborLine, PartLine, Vehicle, TaskTemplatePart]),
    SettingsModule,
    TaskTemplatesModule,
    PartTemplatesModule,
    UsersModule,
  ],
  providers: [
    WorkOrdersCoreService,
    WorkOrdersService,
    WorkOrderLinesService,
    PricingService,
    WorkOrderPdfService,
  ],
  controllers: [WorkOrdersController],
  exports: [WorkOrdersService, WorkOrderLinesService, PricingService],
})
export class WorkOrdersModule {}
