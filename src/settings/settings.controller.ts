import { Body, Controller, Get, Patch } from '@nestjs/common';
import { IsNumber, IsOptional, Min } from 'class-validator';
import { SettingsService } from './settings.service';

class UpdateSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  labor_rate?: number;
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  async get() {
    return { labor_rate: await this.settings.getLaborRate() };
  }

  @Patch()
  async update(@Body() dto: UpdateSettingsDto) {
    if (dto.labor_rate !== undefined) {
      await this.settings.setLaborRate(dto.labor_rate);
    }
    return { labor_rate: await this.settings.getLaborRate() };
  }
}
