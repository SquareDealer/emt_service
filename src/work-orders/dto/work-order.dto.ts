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

const DISCOUNTS: DiscountType[] = ['percent', 'fixed'];

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
  @IsString()
  complaint?: string;

  @IsOptional()
  @IsString()
  recommendation?: string;

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

  /** Estimate block this line joins. Client-generated uuid; null = ungrouped. */
  @IsOptional()
  @IsUUID()
  group_key?: string | null;

  @IsOptional()
  @IsString()
  group_name?: string | null;

  /** Per-line discount. Send null to clear (@IsOptional() lets null through). */
  @IsOptional()
  @IsIn(DISCOUNTS)
  discount_type?: DiscountType | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount_value?: number | null;
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

  /** Brand, kept apart from the name so the documents can show it separately. */
  @IsOptional()
  @IsString()
  manufacturer?: string | null;

  /** Catalog entry this line was picked from. */
  @IsOptional()
  @IsUUID()
  part_template_id?: string | null;

  /** Estimate block this line joins. Client-generated uuid; null = ungrouped. */
  @IsOptional()
  @IsUUID()
  group_key?: string | null;

  @IsOptional()
  @IsString()
  group_name?: string | null;


  /** Per-line discount. Send null to clear (@IsOptional() lets null through). */
  @IsOptional()
  @IsIn(DISCOUNTS)
  discount_type?: DiscountType | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount_value?: number | null;
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

  /** Per-line discount. Send null to clear (@IsOptional() lets null through). */
  @IsOptional()
  @IsIn(DISCOUNTS)
  discount_type?: DiscountType | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount_value?: number | null;
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

  @IsOptional()
  @IsString()
  manufacturer?: string | null;

  /** Per-line discount. Send null to clear (@IsOptional() lets null through). */
  @IsOptional()
  @IsIn(DISCOUNTS)
  discount_type?: DiscountType | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount_value?: number | null;
}
