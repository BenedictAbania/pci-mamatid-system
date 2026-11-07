export type Role = 'admin' | 'reviewer' | 'encoder' | 'viewer';
export const roleLabels: Record<Role, string> = { admin: 'System Administrator', reviewer: 'Civil Engineer', encoder: 'Field Inspector', viewer: 'Decision-maker' };
export function isRole(value: unknown): value is Role { return typeof value === 'string' && Object.hasOwn(roleLabels, value); }
export function homeForRole(role: Role) { return role === 'admin' || role === 'reviewer' ? '/dashboard' : '/workspace'; }
/** Admins only see Dashboard, User Accounts and Reference Data (/settings). */
const routes: Record<string, readonly Role[]> = {
  '/dashboard': ['admin', 'reviewer', 'viewer'],
  '/workspace': ['reviewer', 'encoder', 'viewer'],
  '/field-inspections': ['reviewer', 'encoder'],
  '/sampling': ['reviewer'],
  '/road-network': ['reviewer'],
  '/pci-results': ['reviewer', 'viewer'],
  '/demo-priorities': ['reviewer'],
  '/maintenance-plan': ['reviewer', 'viewer'],
  '/users': ['admin'],
  '/reports': ['reviewer', 'viewer'],
  '/settings': ['admin'],
  '/rls-test': ['admin'],
};
export function canAccess(role: Role | null, path: string) { return !!role && !!routes[path]?.includes(role); }
