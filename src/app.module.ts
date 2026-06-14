import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { entities, migrations } from './data-source';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { UsersModule } from './users/users.module';
import { ClientsModule } from './clients/clients.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { TaskTemplatesModule } from './task-templates/task-templates.module';
import { SettingsModule } from './settings/settings.module';
import { SearchModule } from './search/search.module';
import { HealthModule } from './health/health.module';
import { SeedModule } from './seed/seed.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities,
      migrations,
      migrationsRun: true,
      synchronize: false,
      logging: false,
    }),
    AuthModule,
    UsersModule,
    ClientsModule,
    VehiclesModule,
    WorkOrdersModule,
    TaskTemplatesModule,
    SettingsModule,
    SearchModule,
    HealthModule,
    SeedModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
