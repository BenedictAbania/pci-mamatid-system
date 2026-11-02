import { Redirect } from 'expo-router';
import { ApprovedReports } from '@/components/workflow/approved-reports';
import { useAuth } from '@/providers/AuthProvider';
export default function MaintenancePlanScreen() {
  const { role } = useAuth();
  return role === 'viewer' ? <ApprovedReports title="Maintenance Priorities" mode="rankings" /> : <Redirect href="/pci-results?tab=priorities" />;
}
