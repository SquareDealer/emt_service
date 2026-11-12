import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CurrentUserData } from '../auth/current-user.decorator';
import {
  CreatePartTemplateDto,
  PartTemplatesController,
  UpdatePartTemplateDto,
  assertCostAccess,
} from './part-templates.controller';
import { PartTemplatesService } from './part-templates.service';

const user = (role: string) => ({ id: 'u1', role }) as unknown as CurrentUserData;
const ID = '11111111-1111-4111-8111-111111111111';

describe('assertCostAccess', () => {
  it.each(['master_receptionist', 'master'])('%s: purchase_price → 403 (и число, и null)', (role) => {
    expect(() => assertCostAccess(user(role), { purchase_price: 1 })).toThrow(ForbiddenException);
    expect(() => assertCostAccess(user(role), { purchase_price: null })).toThrow(ForbiddenException);
  });
  it('owner: проходит', () => {
    expect(() => assertCostAccess(user('owner'), { purchase_price: 1 })).not.toThrow();
    expect(() => assertCostAccess(user('owner'), { purchase_price: null })).not.toThrow();
  });
  it.each(['owner', 'master_receptionist', 'master'])('%s: тело без поля проходит', (role) => {
    expect(() => assertCostAccess(user(role), {})).not.toThrow();
  });
});

describe('PartTemplatesController: закупка только владельцу', () => {
  function setup() {
    const calls: Array<[string, unknown[]]> = [];
    const svc = {
      findAll: (...a: unknown[]) => { calls.push(['findAll', a]); return []; },
      findOne: (...a: unknown[]) => { calls.push(['findOne', a]); return {}; },
      create: (...a: unknown[]) => { calls.push(['create', a]); return {}; },
      update: (...a: unknown[]) => { calls.push(['update', a]); return {}; },
    };
    return { ctl: new PartTemplatesController(svc as unknown as PartTemplatesService), calls };
  }

  it.each([
    ['owner', true],
    ['master_receptionist', false],
    ['master', false],
  ])('%s: findAll/findOne получают withCost=%s', (role, expected) => {
    const { ctl, calls } = setup();
    ctl.findAll(user(role), 'q', 'true');
    ctl.findOne(user(role), ID);
    expect(calls[0][1][2]).toBe(expected);
    expect(calls[1][1][1]).toBe(expected);
  });

  it('приёмщик не может создать/изменить с закупкой, сервис не вызывается', () => {
    const { ctl, calls } = setup();
    expect(() => ctl.create(user('master_receptionist'), { name: 'x', purchase_price: 1 })).toThrow(ForbiddenException);
    expect(() => ctl.update(user('master_receptionist'), ID, { purchase_price: null })).toThrow(ForbiddenException);
    expect(calls).toHaveLength(0);
  });
});

describe('DTO запчасти: верхняя граница purchase_price', () => {
  it('Create/Update: выше предела не проходит, предел проходит', async () => {
    for (const cls of [CreatePartTemplateDto, UpdatePartTemplateDto]) {
      const bad = plainToInstance(cls, { name: 'x', purchase_price: 10_000_000_000 });
      const good = plainToInstance(cls, { name: 'x', purchase_price: 9_999_999_999.99 });
      expect((await validate(bad)).length).toBeGreaterThan(0);
      expect((await validate(good)).length).toBe(0);
    }
  });
});
