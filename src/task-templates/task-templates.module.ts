import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskTemplate } from '../entities/task-template.entity';
import { TemplateGenerationPrice } from '../entities/template-generation-price.entity';
import { VehicleGeneration } from '../entities/vehicle-generation.entity';
import { TaskTemplatePart } from '../entities/task-template-part.entity';
import { TaskTemplatesService } from './task-templates.service';
import { TaskTemplatesController } from './task-templates.controller';
import { PriceListService } from './price-list.service';
import { PriceListController } from './price-list.controller';
import { PriceResolutionService } from './price-resolution.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TaskTemplate,
      TemplateGenerationPrice,
      VehicleGeneration,
      TaskTemplatePart,
    ]),
    SettingsModule,
  ],
  providers: [TaskTemplatesService, PriceListService, PriceResolutionService],
  controllers: [TaskTemplatesController, PriceListController],
  exports: [TaskTemplatesService, PriceListService, PriceResolutionService],
})
export class TaskTemplatesModule {}
