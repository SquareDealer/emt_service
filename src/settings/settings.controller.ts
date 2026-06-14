import { Body, Controller, Get, Patch } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import {
  COMPANY_ADDRESS_KEY,
  COMPANY_INN_KEY,
  COMPANY_NAME_KEY,
  COMPANY_PHONE_KEY,
  SettingsService,
  VAT_RATE_KEY,
  VAT_RATES,
} from './settings.service';

class UpdateSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  labor_rate?: number;

  @IsOptional()
  @IsString()
  company_name?: string;

  @IsOptional()
  @IsString()
  company_inn?: string;

  @IsOptional()
  @IsString()
  company_address?: string;

  @IsOptional()
  @IsString()
  company_phone?: string;

  @IsOptional()
  @IsIn(VAT_RATES as unknown as number[])
  vat_rate?: number;
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  async get() {
    const docs = await this.settings.getDocSettings();
    return {
      labor_rate: await this.settings.getLaborRate(),
      company_name: docs.companyName,
      company_inn: docs.companyInn,
      company_address: docs.companyAddress,
      company_phone: docs.companyPhone,
      vat_rate: docs.vatRate,
    };
  }

  @Patch()
  async update(@Body() dto: UpdateSettingsDto) {
    if (dto.labor_rate !== undefined) {
      await this.settings.setLaborRate(dto.labor_rate);
    }
    if (dto.company_name !== undefined) {
      await this.settings.set(COMPANY_NAME_KEY, dto.company_name);
    }
    if (dto.company_inn !== undefined) {
      await this.settings.set(COMPANY_INN_KEY, dto.company_inn);
    }
    if (dto.company_address !== undefined) {
      await this.settings.set(COMPANY_ADDRESS_KEY, dto.company_address);
    }
    if (dto.company_phone !== undefined) {
      await this.settings.set(COMPANY_PHONE_KEY, dto.company_phone);
    }
    if (dto.vat_rate !== undefined) {
      await this.settings.set(VAT_RATE_KEY, String(dto.vat_rate));
    }
    return this.get();
  }
}
