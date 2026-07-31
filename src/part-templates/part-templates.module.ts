import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartTemplate } from '../entities/part-template.entity';
import { PartTemplatesService } from './part-templates.service';
import { PartTemplatesController } from './part-templates.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PartTemplate])],
  providers: [PartTemplatesService],
  controllers: [PartTemplatesController],
  exports: [PartTemplatesService],
})
export class PartTemplatesModule {}
