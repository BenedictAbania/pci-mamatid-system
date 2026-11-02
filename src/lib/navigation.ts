import { canAccess, type Role } from './access';

export type NavigationItem = { label: string; route: string; icon: 'home' | 'layers' | 'clipboard' | 'file-text' | 'users' | 'settings' | 'alert-triangle' };
const items: Record<Role, NavigationItem[]> = {
  admin: [
    { label: 'Home', route: '/dashboard', icon: 'home' },
    { label: 'Roads', route: '/road-network', icon: 'layers' },
    { label: 'Results & Reports', route: '/pci-results', icon: 'file-text' },
    { label: 'Users', route: '/users', icon: 'users' },
    { label: 'Settings', route: '/settings', icon: 'settings' },
  ],
  reviewer: [
    { label: 'Home', route: '/workspace', icon: 'home' },
    { label: 'Sampling Plans', route: '/sampling', icon: 'layers' },
    { label: 'Inspections to Review', route: '/field-inspections', icon: 'clipboard' },
    { label: 'Results', route: '/pci-results', icon: 'file-text' },
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
  if (pathname === '/road-network' && role === 'reviewer') return '/sampling';
  return pathname;
}
