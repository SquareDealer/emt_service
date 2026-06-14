import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { SettingsService, LABOR_RATE_KEY } from '../settings/settings.service';
import { TaskTemplatesService } from '../task-templates/task-templates.service';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly log = new Logger(SeedService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly users: UsersService,
    private readonly settings: SettingsService,
    private readonly templates: TaskTemplatesService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.run();
  }

  /** Idempotent: safe to run on every boot. */
  async run(): Promise<void> {
    // 1. owner account
    if ((await this.users.count()) === 0) {
      const login = this.config.get<string>('SEED_OWNER_LOGIN', 'owner');
      const password = this.config.get<string>('SEED_OWNER_PASSWORD', 'owner');
      const name = this.config.get<string>('SEED_OWNER_NAME', 'Владелец');
      const isProd = this.config.get<string>('NODE_ENV') === 'production';
      if (isProd && (!password || password === 'owner')) {
        throw new Error(
          'Set a strong SEED_OWNER_PASSWORD in production (the default "owner" is not allowed)',
        );
      }
      const password_hash = await bcrypt.hash(password, 10);
      await this.users.create({ login, password_hash, name, role: 'owner' });
      this.log.log(`Создан владелец "${login}"`);
    }

    // 2. global labor rate
    if ((await this.settings.get(LABOR_RATE_KEY)) === null) {
      const rate = Number(this.config.get<string>('SEED_LABOR_RATE', '2000'));
      await this.settings.setLaborRate(Number.isFinite(rate) ? rate : 2000);
      this.log.log(`Ставка нормо-часа установлена: ${rate}`);
    }

    // 3. a couple of task templates
    if ((await this.templates.count()) === 0) {
      await this.templates.create({ name: 'Замена масла', default_hours: 1, default_price: null, active: true });
      await this.templates.create({ name: 'Диагностика', default_hours: 1.5, default_price: null, active: true });
      await this.templates.create({ name: 'ТО (регламент)', default_hours: 3, default_price: null, active: true });
      this.log.log('Добавлены базовые шаблоны работ');
    }
  }
}
