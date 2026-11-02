import { isRole, type Role } from './access.ts';

type AccessError = { code?: string; message?: string } | null;
export type SessionAccess = { role: Role; is_active: true };

/** A missing server access RPC never falls back to profile queries or assumed roles.
 * Keep backend error contents out of the user-facing message. */
export function requireSessionAccess(data: unknown, error: AccessError): SessionAccess {
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      throw new Error('You signed in, but this app version does not match the connected database. An administrator must configure a compatible test database before this version can be used.');
    }
    throw new Error('Your access could not be loaded. Check your connection and retry, or sign out and sign in again.');
  }
  if (!data || typeof data !== 'object' || !('role' in data) || !isRole(data.role)) {
    throw new Error('Your account has no supported LAKAD access profile. Contact an administrator.');
  }
  if ('is_active' in data && data.is_active === false) {
    throw new Error('Your account is deactivated. Contact an administrator.');
  }
  if (!('is_active' in data) || data.is_active !== true) {
    throw new Error('Your account access could not be verified. Contact an administrator.');
  }
  return { role: data.role, is_active: true };
}
