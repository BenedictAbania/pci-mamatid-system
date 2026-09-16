export type Role = 'admin' | 'reviewer' | 'encoder' | 'viewer';
export const roleLabels: Record<Role, string> = { admin: 'System Administrator', reviewer: 'Civil Engineer', encoder: 'Field Inspector', viewer: 'Decision-maker' };
export function isRole(value: unknown): value is Role { return typeof value === 'string' && Object.hasOwn(roleLabels, value); }
export function homeForRole(role: Role) { return role === 'admin' ? '/dashboard' : '/workspace'; }
const routes: Record<string, readonly Role[]> = {
  '/dashboard': ['admin'], '/workspace': ['admin', 'reviewer', 'encoder', 'viewer'],
  '/field-inspections': ['admin', 'reviewer', 'encoder'], '/sampling': ['admin', 'reviewer'],
  '/road-network': ['admin', 'reviewer'], '/inspections': ['admin'],
  '/pci-results': ['admin'], '/maintenance-plan': ['admin'], '/users': ['admin'],
  '/reports': ['admin'], '/settings': ['admin'], '/rls-test': ['admin'],
};
export function canAccess(role: Role | null, path: string) { return !!role && !!routes[path]?.includes(role); }
