import { useState } from 'react';
import { View } from 'react-native';
import { AdminButton, useAdminPalette } from '@/components/admin/admin-shell';
import { Notice } from '@/components/workflow/shared';
import { roleLabels } from '@/lib/auth/access';
import { loadPciReport } from '@/lib/data/pci-report';
import { exportPciReport } from '@/lib/report/export-pci-report';
import { useAuth } from '@/providers/AuthProvider';

/**
 * "Download PCI report": one PDF with every section PCI and sample unit PCI the
 * signed-in account may read. Viewers get published results only.
 */
export function PciReportButton() {
  const p = useAdminPalette();
  const { role, profile, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!role) return null;
  const publishedOnly = role === 'viewer';

  async function generate() {
    setBusy(true); setError('');
    try {
      const data = await loadPciReport(publishedOnly);
      await exportPciReport(data, {
        generatedAt: new Date(), generatedBy: profile?.full_name || user?.email || 'LAKAD user',
        roleLabel: roleLabels[role!], publishedOnly,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The PCI report could not be generated.');
    } finally { setBusy(false); }
  }

  return <View style={{ gap: 8 }}>
    <AdminButton palette={p} tone="secondary" icon="download" label={busy ? 'Preparing PCI report…' : 'Download PCI report (PDF)'} disabled={busy} onPress={() => void generate()} />
    {!!error && <Notice error>{error}</Notice>}
  </View>;
}
