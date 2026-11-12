import type { UserRole } from './types';

type R = UserRole | string | undefined;

/** Owner + receptionist see all orders and may assign a master. */
export function canAssignMaster(role: R): boolean {
  return role === 'owner' || role === 'master_receptionist';
}

/**
 * Works, their prices and the generations catalog are edited by the owner and
 * the receptionist; a plain master reads the price list. Mirrors
 * `@Roles('owner','master_receptionist')` on the server — the UI only hides
 * what the API would refuse anyway.
 */
export function canManageCatalog(role: R): boolean {
  return role === 'owner' || role === 'master_receptionist';
}

/** Only the owner manages staff accounts. */
export function canManageUsers(role: R): boolean {
  return role === 'owner';
}

/** A plain master sees only their own orders. */
export function isPlainMaster(role: R): boolean {
  return role === 'master';
}
