import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AnalyticsController } from './analytics.controller';

describe('AnalyticsController: только владелец', () => {
  it('класс помечен Roles(owner) и защищён RolesGuard', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AnalyticsController)).toEqual(['owner']);
    expect(Reflect.getMetadata('__guards__', AnalyticsController)).toContain(RolesGuard);
  });

  it('ни один обработчик не задаёт собственных ролей, расширяющих доступ', () => {
    const names = Object.getOwnPropertyNames(AnalyticsController.prototype).filter(
      (n) => n !== 'constructor',
    );
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      const handler = (AnalyticsController.prototype as unknown as Record<string, object>)[n];
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toBeUndefined();
    }
  });
});
