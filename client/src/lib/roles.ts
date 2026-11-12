import type { UserRole } from './types';

type R = UserRole | string | undefined;

/** Owner + receptionist see all orders and may assign a master. */
export function canAssignMaster(role: R): boolean {
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

/** Money analytics (revenue, purchase cost, margin) is the owner's eyes only. */
export function canSeeAnalytics(role: R): boolean {
  return role === 'owner';
}
