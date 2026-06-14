import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '../entities/setting.entity';

export const LABOR_RATE_KEY = 'labor_rate';
const DEFAULT_LABOR_RATE = 2000;

export const COMPANY_NAME_KEY = 'company_name';
export const COMPANY_INN_KEY = 'company_inn';
export const COMPANY_ADDRESS_KEY = 'company_address';
export const COMPANY_PHONE_KEY = 'company_phone';
export const VAT_RATE_KEY = 'vat_rate';

/** Allowed VAT rates: 0 = «Без НДС», 10/20 = НДС в составе суммы. */
export const VAT_RATES = [0, 10, 20] as const;

/** Executor requisites + VAT — everything the calc PDF needs from settings. */
export interface DocSettings {
  companyName: string;
  companyInn: string;
  companyAddress: string;
  companyPhone: string;
  vatRate: number;
}

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

  /** Executor requisites + VAT for the calculation document (with safe defaults). */
  async getDocSettings(): Promise<DocSettings> {
    const all = await this.all();
    const vat = Number(all[VAT_RATE_KEY] ?? '0');
    return {
      companyName: all[COMPANY_NAME_KEY] ?? '',
      companyInn: all[COMPANY_INN_KEY] ?? '',
      companyAddress: all[COMPANY_ADDRESS_KEY] ?? '',
      companyPhone: all[COMPANY_PHONE_KEY] ?? '',
      vatRate: (VAT_RATES as readonly number[]).includes(vat) ? vat : 0,
    };
  }
}
