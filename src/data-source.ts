import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { Client } from './entities/client.entity';
import { Vehicle } from './entities/vehicle.entity';
import { VehicleGeneration } from './entities/vehicle-generation.entity';
import { User } from './entities/user.entity';
import { WorkOrder } from './entities/work-order.entity';
import { LaborLine } from './entities/labor-line.entity';
import { PartLine } from './entities/part-line.entity';
import { TaskTemplate } from './entities/task-template.entity';
import { PartTemplate } from './entities/part-template.entity';
import { TemplateGenerationPrice } from './entities/template-generation-price.entity';
import { TaskTemplatePart } from './entities/task-template-part.entity';
import { Setting } from './entities/setting.entity';
import { CalendarBlock } from './entities/calendar-block.entity';
import { Init1718200000000 } from './migrations/1718200000000-Init';
import { AddWorkOrderNotes1718300000000 } from './migrations/1718300000000-AddWorkOrderNotes';
import { AddWorkOrderDocNumber1718400000000 } from './migrations/1718400000000-AddWorkOrderDocNumber';
import { AddUserRolesAndActive1718500000000 } from './migrations/1718500000000-AddUserRolesAndActive';
import { AddWorkOrderPaidAmount1718600000000 } from './migrations/1718600000000-AddWorkOrderPaidAmount';
import { AddWorkOrderOrderNumber1718700000000 } from './migrations/1718700000000-AddWorkOrderOrderNumber';
import { AddPartLineUnit1718800000000 } from './migrations/1718800000000-AddPartLineUnit';
import { AddWorkOrderComplaintRecommendation1718900000000 } from './migrations/1718900000000-AddWorkOrderComplaintRecommendation';
import { AddLineOrderingAndIndexes1719000000000 } from './migrations/1719000000000-AddLineOrderingAndIndexes';
import { AddVehicleMakeAndGenerations1719100000000 } from './migrations/1719100000000-AddVehicleMakeAndGenerations';
import { AddCalendarBlocks1719200000000 } from './migrations/1719200000000-AddCalendarBlocks';
import { AddLineDiscountsAndManufacturer1719300000000 } from './migrations/1719300000000-AddLineDiscountsAndManufacturer';
import { AddPriceListAndPartTemplates1719400000000 } from './migrations/1719400000000-AddPriceListAndPartTemplates';
import { AddLineGroupsAndTemplateParts1719500000000 } from './migrations/1719500000000-AddLineGroupsAndTemplateParts';
import { AddTaskTemplatePartSlot1719600000000 } from './migrations/1719600000000-AddTaskTemplatePartSlot';
import { AddPartPurchasePrice1719700000000 } from './migrations/1719700000000-AddPartPurchasePrice';

loadEnv();

export const entities = [
  Client,
  Vehicle,
  VehicleGeneration,
  User,
  WorkOrder,
  LaborLine,
  PartLine,
  TaskTemplate,
  PartTemplate,
  TemplateGenerationPrice,
  TaskTemplatePart,
  Setting,
  CalendarBlock,
];

export const migrations = [
  Init1718200000000,
  AddWorkOrderNotes1718300000000,
  AddWorkOrderDocNumber1718400000000,
  AddUserRolesAndActive1718500000000,
  AddWorkOrderPaidAmount1718600000000,
  AddWorkOrderOrderNumber1718700000000,
  AddPartLineUnit1718800000000,
  AddWorkOrderComplaintRecommendation1718900000000,
  AddLineOrderingAndIndexes1719000000000,
  AddVehicleMakeAndGenerations1719100000000,
  AddCalendarBlocks1719200000000,
  AddLineDiscountsAndManufacturer1719300000000,
  AddPriceListAndPartTemplates1719400000000,
  AddLineGroupsAndTemplateParts1719500000000,
  AddTaskTemplatePartSlot1719600000000,
  AddPartPurchasePrice1719700000000,
];

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
