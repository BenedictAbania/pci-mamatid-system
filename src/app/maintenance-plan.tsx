import { Redirect } from 'expo-router';
import { MaintenancePriorities } from '@/components/summaries/maintenance-priorities';
import { useAuth } from '@/providers/AuthProvider';

/** Sections ranked for maintenance: lowest PCI first, then safety/high severity, then affected area. */
export default function MaintenancePlanScreen() {
  const { role } = useAuth();
  return role === 'viewer' || role === 'reviewer'
    ? <MaintenancePriorities />
    : <Redirect href="/pci-results?tab=priorities" />;
}
