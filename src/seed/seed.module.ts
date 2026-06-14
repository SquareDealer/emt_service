import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { SettingsModule } from '../settings/settings.module';
import { TaskTemplatesModule } from '../task-templates/task-templates.module';
import { SeedService } from './seed.service';

@Module({
  imports: [UsersModule, SettingsModule, TaskTemplatesModule],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
