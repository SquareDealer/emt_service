import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import {
  DiscountType,
  WorkOrderStatus,
} from '../../entities/work-order.entity';
import { PartUnit } from '../../entities/part-line.entity';

const STATUSES: WorkOrderStatus[] = [
  'scheduled',
  'in_progress',
  'waiting',
  'done',
  'closed',
];

export class CreateWorkOrderDto {
  @IsUUID()
  vehicle_id: string;

  @IsOptional()
  @IsUUID()
  assigned_master_id?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsDateString()
  scheduled_at?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  scheduled_duration_min?: number;

  @IsOptional()
  @IsIn(STATUSES)
  status?: WorkOrderStatus;
}

export class UpdateWorkOrderDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  scheduled_at?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  scheduled_duration_min?: number;

  @IsOptional()
  @IsUUID()
  assigned_master_id?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: WorkOrderStatus;

  @IsOptional()
  @IsIn(['percent', 'fixed'])
  discount_type?: DiscountType | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount_value?: number | null;
}

export class UpdateStatusDto {
  @IsIn(STATUSES)
  status: WorkOrderStatus;
}

export class SetPaidDto {
  @IsNumber()
  @Min(0)
  paid_amount: number;
}

export class CreateLaborLineDto {
  @IsOptional()
  @IsUUID()
  template_id?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rate_snapshot?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price_override?: number;
}

export class CreatePartLineDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  catalog_number?: string;

  // numeric: pieces are whole, liters can be fractional (e.g. 1.5)
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  qty?: number;

  @IsOptional()
  @IsIn(['pcs', 'l'])
  unit?: PartUnit;

  @IsNumber()
  @Min(0)
  unit_price: number;
}

export class UpdateLaborLineDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hours?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rate_snapshot?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price_override?: number | null;
}

export class UpdatePartLineDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  catalog_number?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  qty?: number;

  @IsOptional()
  @IsIn(['pcs', 'l'])
  unit?: PartUnit;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unit_price?: number;
}
