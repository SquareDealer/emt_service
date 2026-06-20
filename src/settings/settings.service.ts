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

/** Schedule/calendar settings — bound the timeline + default appointment length. */
export const WORKING_HOURS_START_KEY = 'working_hours_start';
export const WORKING_HOURS_END_KEY = 'working_hours_end';
export const SLOT_MINUTES_KEY = 'slot_minutes';
export const DEFAULT_APPOINTMENT_MIN_KEY = 'default_appointment_min';

/** Grid snap granularity allowed for the timeline. */
export const SLOT_MINUTES = [15, 30, 60] as const;

const DEFAULT_WORKING_HOURS_START = 8;
const DEFAULT_WORKING_HOURS_END = 20;
const DEFAULT_SLOT_MINUTES = 30;
const DEFAULT_APPOINTMENT_MIN = 60;

/** Executor requisites + VAT — everything the calc PDF needs from settings. */
export interface DocSettings {
  companyName: string;
  companyInn: string;
  companyAddress: string;
  companyPhone: string;
  vatRate: number;
}

/** Timeline bounds + default slot length for the calendar/booking UI. */
export interface ScheduleSettings {
  workingHoursStart: number;
  workingHoursEnd: number;
  slotMinutes: number;
  defaultAppointmentMin: number;
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

  /** Timeline bounds + default slot length (with safe, sane-clamped defaults). */
  async getScheduleSettings(): Promise<ScheduleSettings> {
    const all = await this.all();
    const intOr = (raw: string | undefined, fallback: number): number => {
      const n = Number(raw);
      return Number.isFinite(n) ? Math.trunc(n) : fallback;
    };

    let start = intOr(all[WORKING_HOURS_START_KEY], DEFAULT_WORKING_HOURS_START);
    let end = intOr(all[WORKING_HOURS_END_KEY], DEFAULT_WORKING_HOURS_END);
    start = Math.min(Math.max(start, 0), 23);
    end = Math.min(Math.max(end, 1), 24);
    // Guarantee a non-empty window even if persisted values are inconsistent.
    if (end <= start) {
      start = DEFAULT_WORKING_HOURS_START;
      end = DEFAULT_WORKING_HOURS_END;
    }

    const slotRaw = intOr(all[SLOT_MINUTES_KEY], DEFAULT_SLOT_MINUTES);
    const slot = (SLOT_MINUTES as readonly number[]).includes(slotRaw)
      ? slotRaw
      : DEFAULT_SLOT_MINUTES;

    let dflt = intOr(all[DEFAULT_APPOINTMENT_MIN_KEY], DEFAULT_APPOINTMENT_MIN);
    dflt = Math.min(Math.max(dflt, slot), (end - start) * 60);

    return {
      workingHoursStart: start,
      workingHoursEnd: end,
      slotMinutes: slot,
      defaultAppointmentMin: dflt,
    };
  }
}
