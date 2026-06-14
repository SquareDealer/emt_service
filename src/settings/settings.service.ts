import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '../entities/setting.entity';

export const LABOR_RATE_KEY = 'labor_rate';
const DEFAULT_LABOR_RATE = 2000;

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting)
    private readonly repo: Repository<Setting>,
  ) {}

  async get(key: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { key } });
    return row ? row.value : null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(Setting)
      .values({ key, value })
      .orUpdate(['value', 'updated_at'], ['key'])
      .execute();
  }

  async getLaborRate(): Promise<number> {
    const raw = await this.get(LABOR_RATE_KEY);
    if (raw === null) return DEFAULT_LABOR_RATE;
    const n = Number(raw);
    return Number.isFinite(n) ? n : DEFAULT_LABOR_RATE;
  }

  async setLaborRate(rate: number): Promise<number> {
    await this.set(LABOR_RATE_KEY, String(rate));
    return rate;
  }

  async all(): Promise<Record<string, string>> {
    const rows = await this.repo.find();
    return rows.reduce<Record<string, string>>((acc, r) => {
      acc[r.key] = r.value;
      return acc;
    }, {});
  }
}
