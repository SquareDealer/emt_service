import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class UpdateVehicleDto {
  @IsOptional()
  @IsString()
  vin?: string;

  @IsOptional()
  @IsString()
  make?: string;

  @IsOptional()
  @IsString()
  model?: string;

  /** Send null to unlink from the catalog (make/model typed by hand stay). */
  @IsOptional()
  @IsUUID()
  generation_id?: string | null;

  @IsOptional()
  @IsString()
  plate?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  mileage?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
