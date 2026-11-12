import { describe, expect, it } from 'vitest';
import { canManageCatalog } from './roles';

describe('canManageCatalog', () => {
  it('lets the owner and the receptionist edit the price list', () => {
    expect(canManageCatalog('owner')).toBe(true);
    expect(canManageCatalog('master_receptionist')).toBe(true);
  });

  it('keeps a plain master and an unknown user read-only', () => {
    expect(canManageCatalog('master')).toBe(false);
    expect(canManageCatalog(undefined)).toBe(false);
  });
});
