import { Body, Controller, Get, Patch } from '@nestjs/common';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  COMPANY_ADDRESS_KEY,
  COMPANY_INN_KEY,
  COMPANY_NAME_KEY,
  COMPANY_PHONE_KEY,
  DEFAULT_APPOINTMENT_MIN_KEY,
  SettingsService,
  SLOT_MINUTES,
  SLOT_MINUTES_KEY,
  VAT_RATE_KEY,
  VAT_RATES,
  WORKING_HOURS_END_KEY,
  WORKING_HOURS_START_KEY,
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

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  working_hours_start?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  working_hours_end?: number;

  @IsOptional()
  @IsIn(SLOT_MINUTES as unknown as number[])
  slot_minutes?: number;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(1440)
  default_appointment_min?: number;
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  async get() {
    const docs = await this.settings.getDocSettings();
    const sched = await this.settings.getScheduleSettings();
    return {
      labor_rate: await this.settings.getLaborRate(),
      company_name: docs.companyName,
      company_inn: docs.companyInn,
      company_address: docs.companyAddress,
      company_phone: docs.companyPhone,
      vat_rate: docs.vatRate,
      working_hours_start: sched.workingHoursStart,
      working_hours_end: sched.workingHoursEnd,
      slot_minutes: sched.slotMinutes,
      default_appointment_min: sched.defaultAppointmentMin,
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
    if (dto.working_hours_start !== undefined) {
      await this.settings.set(WORKING_HOURS_START_KEY, String(dto.working_hours_start));
    }
    if (dto.working_hours_end !== undefined) {
      await this.settings.set(WORKING_HOURS_END_KEY, String(dto.working_hours_end));
    }
    if (dto.slot_minutes !== undefined) {
      await this.settings.set(SLOT_MINUTES_KEY, String(dto.slot_minutes));
    }
    if (dto.default_appointment_min !== undefined) {
      await this.settings.set(DEFAULT_APPOINTMENT_MIN_KEY, String(dto.default_appointment_min));
    }
    return this.get();
  }
}
