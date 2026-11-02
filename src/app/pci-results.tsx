import { useLocalSearchParams } from 'expo-router';
import { ApprovedReports } from '@/components/workflow/approved-reports';
import { useAuth } from '@/providers/AuthProvider';
export default function PciResultsScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const { role, user } = useAuth();
  return <ApprovedReports key={[user?.id, role, tab].join(':')} title={role === 'admin' ? 'Results & Reports' : role === 'viewer' ? 'Published Results' : 'Results'} initialTab={tab} hub />;
}
