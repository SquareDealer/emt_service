import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  full_name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  phone?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discount_default_pct?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
