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

  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;

  @IsNumber()
  @Min(0)
  unit_price: number;
}
