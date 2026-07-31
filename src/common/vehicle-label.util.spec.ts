import { vehicleLabel, vehicleLabelOr } from './vehicle-label.util';

describe('vehicleLabel', () => {
  it('joins make, model and generation code', () => {
    expect(vehicleLabel({ make: 'MINI', model: 'Hatch', generation_code: 'R56' })).toBe(
      'MINI Hatch R56',
    );
  });

  it('does not repeat the code when the model already contains it', () => {
    // Backfilled rows: `model` was the only field before the split and held the
    // generation code itself, so both columns say R56.
    expect(vehicleLabel({ make: 'MINI', model: 'R56', generation_code: 'R56' })).toBe('MINI R56');
    expect(vehicleLabel({ make: 'MINI', model: 'Кабрио R57', generation_code: 'R57' })).toBe(
      'MINI Кабрио R57',
    );
    expect(vehicleLabel({ make: 'MINI', model: 'r56', generation_code: 'R56' })).toBe('MINI r56');
  });

  it('handles non-MINI cars with no catalog link', () => {
    expect(vehicleLabel({ make: 'BMW', model: 'X5', generation_code: null })).toBe('BMW X5');
    expect(vehicleLabel({ make: 'Renault', model: 'Logan' })).toBe('Renault Logan');
  });

  it('skips missing pieces instead of leaving gaps', () => {
    expect(vehicleLabel({ make: 'BMW' })).toBe('BMW');
    expect(vehicleLabel({ model: 'X5' })).toBe('X5');
    expect(vehicleLabel({ make: '  ', model: '  ' })).toBe('');
    expect(vehicleLabel(null)).toBe('');
  });

  it('falls back only when there is nothing to show', () => {
    expect(vehicleLabelOr(null)).toBe('Автомобиль');
    expect(vehicleLabelOr({ make: 'BMW' })).toBe('BMW');
  });
});
