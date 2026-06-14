import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { Client } from './entities/client.entity';
import { Vehicle } from './entities/vehicle.entity';
import { User } from './entities/user.entity';
import { WorkOrder } from './entities/work-order.entity';
import { LaborLine } from './entities/labor-line.entity';
import { PartLine } from './entities/part-line.entity';
import { TaskTemplate } from './entities/task-template.entity';
import { Setting } from './entities/setting.entity';
import { Init1718200000000 } from './migrations/1718200000000-Init';
import { AddWorkOrderNotes1718300000000 } from './migrations/1718300000000-AddWorkOrderNotes';

loadEnv();

export const entities = [
  Client,
  Vehicle,
  User,
  WorkOrder,
  LaborLine,
  PartLine,
  TaskTemplate,
  Setting,
];

export const migrations = [Init1718200000000, AddWorkOrderNotes1718300000000];

/** Standalone DataSource for the TypeORM CLI (migrations). */
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities,
  migrations,
  synchronize: false,
  logging: false,
});

export default AppDataSource;
