export type Role = 'admin' | 'reviewer' | 'encoder' | 'viewer';
export const roleLabels: Record<Role, string> = { admin: 'System Administrator', reviewer: 'Civil Engineer', encoder: 'Field Inspector', viewer: 'Decision-maker' };
export function isRole(value: unknown): value is Role { return typeof value === 'string' && Object.hasOwn(roleLabels, value); }
export function homeForRole(role: Role) { return role === 'admin' ? '/dashboard' : '/workspace'; }
const routes: Record<string, readonly Role[]> = {
  '/dashboard': ['admin', 'viewer'],
  '/workspace': ['reviewer', 'encoder', 'viewer'],
  '/field-inspections': ['reviewer', 'encoder'],
  '/sampling': ['reviewer'],
  '/road-network': ['admin', 'reviewer'],
  // This legacy CRUD screen bypasses the authenticated workflow and is intentionally inaccessible.
  '/inspections': [],
  '/pci-results': ['admin', 'reviewer', 'viewer'],
  '/maintenance-plan': ['admin', 'reviewer', 'viewer'],
  '/users': ['admin'],
  '/reports': ['admin', 'reviewer', 'viewer'],
  '/settings': ['admin'],
  '/rls-test': ['admin'],
};
export function canAccess(role: Role | null, path: string) { return !!role && !!routes[path]?.includes(role); }
