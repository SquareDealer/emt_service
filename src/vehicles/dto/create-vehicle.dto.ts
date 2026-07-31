import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateVehicleDto {
  @IsUUID()
  client_id: string;

  @IsOptional()
  @IsString()
  vin?: string;

  @IsOptional()
  @IsString()
  make?: string;

  @IsOptional()
  @IsString()
  model?: string;

  /** Optional link into the generations catalog; null для не-каталожных машин. */
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
