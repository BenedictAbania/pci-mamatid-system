import { canAccess, type Role } from './access';

export type NavigationItem = { label: string; route: string; icon: 'home' | 'layers' | 'clipboard' | 'file-text' | 'users' | 'settings' | 'map' | 'alert-triangle' };
const items: Record<Role, NavigationItem[]> = {
  admin: [
    { label: 'Dashboard', route: '/dashboard', icon: 'home' },
    { label: 'User Accounts', route: '/users', icon: 'users' },
    { label: 'Reference Data', route: '/settings', icon: 'layers' },
  ],
  reviewer: [
    { label: 'Dashboard', route: '/dashboard', icon: 'home' },
    { label: 'Road Network', route: '/road-network', icon: 'map' },
  ],
  encoder: [
    { label: 'Home', route: '/workspace', icon: 'home' },
    { label: 'My Inspections', route: '/field-inspections', icon: 'clipboard' },
  ],
  viewer: [
    { label: 'Overview', route: '/workspace', icon: 'home' },
    { label: 'Published Results', route: '/pci-results', icon: 'file-text' },
    { label: 'Maintenance Priorities', route: '/maintenance-plan', icon: 'alert-triangle' },
  ],
};
export function navigationForRole(role: Role) { return items[role].filter(item => canAccess(role, item.route)); }
/** Legacy URLs remain valid, with one active navigation destination. */
export function navigationRoute(role: Role, pathname: string) {
  if (pathname === '/reports' || (pathname === '/maintenance-plan' && role !== 'viewer')) return '/pci-results';
  if (pathname === '/dashboard' && role === 'viewer') return '/workspace';
  if (pathname === '/workspace' && role === 'reviewer') return '/dashboard';
  return pathname;
}
