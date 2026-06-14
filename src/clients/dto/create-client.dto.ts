import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateClientDto {
  @IsString()
  @MinLength(1)
  full_name: string;

  @IsString()
  @MinLength(1)
  phone: string;

  // `source` is intentionally NOT accepted here: a manual HTTP create is always
  // `manual`. CSV import / future bot set their own source via the service layer.

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discount_default_pct?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
