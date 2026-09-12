import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AdminEmpty, AdminPanel, AdminShell, useAdminPalette } from '@/components/admin/admin-shell';
import { BranchRecord, loadRoadNetwork, SectionRecord } from '@/lib/admin-data';
import { formatNumber } from '@/lib/admin-utils';

export default function MaintenancePlanScreen() {
  const palette = useAdminPalette();
  const { width } = useWindowDimensions();
  const [sections, setSections] = useState<SectionRecord[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isCompact = width < 850;

  const refresh = useCallback(async () => {
    try {
      const result = await loadRoadNetwork();
      setError('');
      setSections(result.sections);
      setBranches(result.branches);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Maintenance priorities could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial synchronization with the remote data source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const branchById = useMemo(() => new Map(branches.map((item) => [item.id, item.name])), [branches]);
  const assessed = sections.filter((section) => section.pci_score !== null);
  const plan = assessed
    .filter((section) => `${section.name} ${branchById.get(section.branch_id) ?? ''} ${section.condition_label ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(a.pci_score) - Number(b.pci_score));
  const urgent = assessed.filter((section) => Number(section.pci_score) < 40).length;
  const preventive = assessed.filter((section) => Number(section.pci_score) >= 55 && Number(section.pci_score) < 85).length;
  const monitor = assessed.filter((section) => Number(section.pci_score) >= 85).length;

  return (
    <AdminShell loading={loading} onRefresh={() => void refresh()} onSearchChange={setQuery} searchValue={query} subtitle="Prioritize maintenance directly from the latest computed road-section PCI scores." title="Maintenance Plan">
      {error ? <View style={[styles.notice, { backgroundColor: palette.redSoft, borderColor: palette.red }]}><Feather color={palette.red} name="alert-circle" size={17} /><Text style={[styles.noticeText, { color: palette.text }]}>{error}</Text></View> : null}
      <View style={[styles.metrics, isCompact && styles.stack]}>
        <Metric color={palette.red} icon="alert-triangle" label="Urgent attention" palette={palette} value={urgent} />
        <Metric color={palette.amber} icon="tool" label="Preventive candidates" palette={palette} value={preventive} />
        <Metric color={palette.green} icon="eye" label="Routine monitoring" palette={palette} value={monitor} />
        <Metric color={palette.blue} icon="activity" label="Assessed sections" palette={palette} value={assessed.length} />
      </View>

      <AdminPanel palette={palette} subtitle="Automatically ordered from lowest to highest PCI" title="Priority queue">
        {plan.length ? plan.map((section, index) => {
          const guidance = getMaintenanceGuidance(Number(section.pci_score));
          return (
            <View key={section.id} style={[styles.planRow, isCompact && styles.planRowCompact, { borderBottomColor: palette.border }]}>
              <View style={[styles.rank, { backgroundColor: index < 3 ? palette.redSoft : palette.blueSoft }]}><Text style={{ color: index < 3 ? palette.red : palette.blue, fontWeight: '900' }}>{index + 1}</Text></View>
              <View style={styles.identity}><Text style={[styles.title, { color: palette.text }]}>{section.name}</Text><Text style={[styles.meta, { color: palette.muted }]}>{branchById.get(section.branch_id) ?? 'Unknown branch'} · {section.condition_label ?? 'Unclassified'}</Text></View>
              <View style={styles.pci}><Text style={[styles.pciValue, { color: guidance.color }]}>{formatNumber(section.pci_score)}</Text><Text style={[styles.smallLabel, { color: palette.muted }]}>PCI</Text></View>
              <View style={styles.action}><Text style={[styles.actionTitle, { color: palette.text }]}>{guidance.action}</Text><Text style={[styles.meta, { color: palette.muted }]}>{guidance.detail}</Text></View>
              <View style={[styles.priorityBadge, { backgroundColor: guidance.soft }]}><Text style={[styles.priorityText, { color: guidance.color }]}>{guidance.priority}</Text></View>
            </View>
          );
        }) : <AdminEmpty icon="tool" message={query ? 'No maintenance priorities match your search.' : 'Maintenance priorities will be generated once road-section PCI values are available.'} palette={palette} />}
      </AdminPanel>

      <AdminPanel palette={palette} subtitle="The plan remains traceable to computed PCI data" title="How priorities are produced">
        <View style={[styles.explanation, isCompact && styles.stack]}>
          <Explanation icon="database" palette={palette} text="Uses each section’s current PCI score from Supabase." />
          <Explanation icon="arrow-up" palette={palette} text="Places the most deteriorated sections first." />
          <Explanation icon="refresh-cw" palette={palette} text="Updates whenever the dashboard is refreshed." />
        </View>
      </AdminPanel>
    </AdminShell>
  );

  function getMaintenanceGuidance(score: number) {
    if (score < 25) return { priority: 'Critical', action: 'Reconstruction assessment', detail: 'Plan structural intervention and detailed engineering review.', color: palette.red, soft: palette.redSoft };
    if (score < 40) return { priority: 'High', action: 'Major rehabilitation', detail: 'Validate failures and prepare a rehabilitation scope.', color: palette.red, soft: palette.redSoft };
    if (score < 55) return { priority: 'High', action: 'Corrective maintenance', detail: 'Address high-impact distress before further deterioration.', color: palette.amber, soft: palette.amberSoft };
    if (score < 70) return { priority: 'Medium', action: 'Preventive maintenance', detail: 'Schedule sealing, patching, or localized treatment.', color: palette.amber, soft: palette.amberSoft };
    if (score < 85) return { priority: 'Low', action: 'Preservation treatment', detail: 'Preserve condition and continue routine inspections.', color: palette.blue, soft: palette.blueSoft };
    return { priority: 'Monitor', action: 'Routine monitoring', detail: 'No major intervention indicated by the current PCI.', color: palette.green, soft: palette.greenSoft };
  }
}

function Metric({ color, icon, label, palette, value }: { color: string; icon: keyof typeof Feather.glyphMap; label: string; palette: ReturnType<typeof useAdminPalette>; value: number }) {
  return <View style={[styles.metric, { backgroundColor: palette.panel, borderColor: palette.border }]}><View style={[styles.metricIcon, { backgroundColor: palette.panelAlt }]}><Feather color={color} name={icon} size={19} /></View><View><Text style={[styles.metricLabel, { color: palette.muted }]}>{label}</Text><Text style={[styles.metricValue, { color: palette.text }]}>{value.toLocaleString()}</Text></View></View>;
}

function Explanation({ icon, palette, text }: { icon: keyof typeof Feather.glyphMap; palette: ReturnType<typeof useAdminPalette>; text: string }) {
  return <View style={styles.explanationItem}><View style={[styles.explanationIcon, { backgroundColor: palette.blueSoft }]}><Feather color={palette.blue} name={icon} size={17} /></View><Text style={[styles.explanationText, { color: palette.muted }]}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', gap: 13 },
  stack: { flexDirection: 'column' },
  metric: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 10, minHeight: 88, padding: 14 },
  metricIcon: { alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  metricLabel: { fontSize: 10.5 },
  metricValue: { fontSize: 21, fontWeight: '900', marginTop: 3 },
  planRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 12, minHeight: 76, paddingVertical: 9 },
  planRowCompact: { alignItems: 'flex-start', flexWrap: 'wrap' },
  rank: { alignItems: 'center', borderRadius: 19, height: 38, justifyContent: 'center', width: 38 },
  identity: { flex: 1.1, minWidth: 160 },
  title: { fontSize: 13, fontWeight: '800' },
  meta: { fontSize: 10.5, lineHeight: 15, marginTop: 3 },
  pci: { alignItems: 'center', minWidth: 55 },
  pciValue: { fontSize: 20, fontWeight: '900' },
  smallLabel: { fontSize: 8.5, fontWeight: '700' },
  action: { flex: 1.4, minWidth: 210 },
  actionTitle: { fontSize: 12, fontWeight: '700' },
  priorityBadge: { borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6 },
  priorityText: { fontSize: 10, fontWeight: '900' },
  explanation: { flexDirection: 'row', gap: 18 },
  explanationItem: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 10 },
  explanationIcon: { alignItems: 'center', borderRadius: 19, height: 38, justifyContent: 'center', width: 38 },
  explanationText: { flex: 1, fontSize: 11.5, lineHeight: 17 },
  notice: { alignItems: 'center', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 11 },
  noticeText: { flex: 1, fontSize: 12 },
});
