import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskTemplate } from '../entities/task-template.entity';
import { TaskTemplatesService } from './task-templates.service';
import { TaskTemplatesController } from './task-templates.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TaskTemplate])],
  providers: [TaskTemplatesService],
  controllers: [TaskTemplatesController],
  exports: [TaskTemplatesService],
})
export class TaskTemplatesModule {}
