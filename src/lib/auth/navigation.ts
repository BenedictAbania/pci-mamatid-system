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
    { label: 'Inspections to Review', route: '/field-inspections', icon: 'clipboard' },
  ],
  encoder: [
    { label: 'Dashboard', route: '/dashboard', icon: 'home' },
    { label: 'My Inspections', route: '/field-inspections', icon: 'clipboard' },
  ],
  viewer: [
    { label: 'Dashboard', route: '/workspace', icon: 'home' },
    { label: 'Sample Units Summaries', route: '/sample-summaries', icon: 'file-text' },
    { label: 'Sections Summaries', route: '/section-summaries', icon: 'layers' },
  ],
};
export function navigationForRole(role: Role) { return items[role].filter(item => canAccess(role, item.route)); }
/** Legacy URLs remain valid, with one active navigation destination. */
export function navigationRoute(role: Role, pathname: string) {
  if (pathname === '/reports' || (pathname === '/maintenance-plan' && role !== 'viewer')) return '/pci-results';
  if (pathname === '/dashboard' && role === 'viewer') return '/workspace';
  if (role === 'viewer' && pathname === '/pci-results') return '/sample-summaries';
  if (role === 'viewer' && pathname === '/maintenance-plan') return '/section-summaries';
  if (pathname === '/workspace' && (role === 'reviewer' || role === 'encoder')) return '/dashboard';
  return pathname;
}
