export type Role = 'admin' | 'reviewer' | 'encoder' | 'viewer';
export const roleLabels: Record<Role, string> = { admin: 'Admin', reviewer: 'Reviewer', encoder: 'Encoder', viewer: 'Viewer' };
/** Order of the role cards on account forms: two columns, Admin and Encoder on top. */
export const ROLE_ORDER: readonly Role[] = ['admin', 'encoder', 'reviewer', 'viewer'];
/** One-line summary shown on each role card. */
export const roleHints: Record<Role, string> = {
  admin: 'Manages accounts and settings',
  reviewer: 'Approves or returns',
  encoder: 'Records inspections',
  viewer: 'Read-only results',
};
/** Solid role colours (pills and card dots), the same in light and dark themes. */
export const roleColors: Record<Role, string> = { admin: '#FF5757', encoder: '#FF914D', reviewer: '#FFDE59', viewer: '#5CE1E6' };
export function isRole(value: unknown): value is Role { return typeof value === 'string' && Object.hasOwn(roleLabels, value); }
export function homeForRole(role: Role) { return role === 'viewer' ? '/workspace' : '/dashboard'; }
/** Admins only see Dashboard, User Accounts and Reference Data (/settings). */
const routes: Record<string, readonly Role[]> = {
  '/dashboard': ['admin', 'reviewer', 'encoder', 'viewer'],
  '/workspace': ['reviewer', 'encoder', 'viewer'],
  '/field-inspections': ['reviewer', 'encoder'],
  '/sampling': ['reviewer'],
  '/road-network': ['reviewer'],
  '/pci-results': ['reviewer', 'viewer'],
  '/sample-summaries': ['viewer'],
  '/section-summaries': ['viewer'],
  '/demo-priorities': ['reviewer'],
  '/maintenance-plan': ['reviewer', 'viewer'],
  '/users': ['admin'],
  '/reports': ['reviewer', 'viewer'],
  '/settings': ['admin'],
  '/rls-test': ['admin'],
};
export function canAccess(role: Role | null, path: string) { return !!role && !!routes[path]?.includes(role); }
