import { Redirect } from 'expo-router';
import { ApprovedReports } from '@/components/workflow/approved-reports';
import { useAuth } from '@/providers/AuthProvider';

/** Sections ranked for maintenance: lowest PCI first, then safety/high severity, then affected area. */
export default function MaintenancePlanScreen() {
  const { role } = useAuth();
  return role === 'viewer' || role === 'reviewer'
    ? <ApprovedReports title="Maintenance Priorities" mode="rankings" />
    : <Redirect href="/pci-results?tab=priorities" />;
}
