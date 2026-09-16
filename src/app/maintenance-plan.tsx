import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AdminEmpty, AdminPanel, AdminShell, useAdminPalette } from '@/components/admin/admin-shell';
import { useWorkflow } from '@/components/workflow/shared';
import { formatNumber } from '@/lib/admin-utils';
import { PrioritySection, rankPriorities } from '@/lib/pci-service';

export default function MaintenancePlanScreen() {
  const palette = useAdminPalette();
  const { width } = useWindowDimensions();
  const { data, loading, error, refresh } = useWorkflow();
  const [query, setQuery] = useState('');
  const isCompact = width < 850;

  if (!data) {
    return (
      <AdminShell loading={loading} onRefresh={refresh} subtitle="Prioritize maintenance directly from the latest computed road-section PCI scores." title="Maintenance Plan">
        <View />
      </AdminShell>
    );
  }

  const { branches, sections, results, settings } = data;
  const branchById = new Map(branches.map((item) => [item.id, item.name]));
  const sectionById = new Map(sections.map((item) => [item.id, item]));

  const { priority_safety = true, priority_area = true } = settings || {};

  // Find latest result for each section
  const latestResultsMap = new Map();
  for (const r of results) {
    if (!latestResultsMap.has(r.section_id) || latestResultsMap.get(r.section_id).published_at < r.published_at) {
      latestResultsMap.set(r.section_id, r);
    }
  }
  const latestResults = Array.from(latestResultsMap.values());

  const prioritySections: PrioritySection[] = latestResults.map(r => ({
    id: r.section_id,
    pci: r.pci,
    safety: r.safety,
    highSeverity: r.high_severity,
    affectedArea: r.affected_area
  }));

  const ranked = rankPriorities(prioritySections, priority_safety, priority_area);

  const plan = ranked
    .filter((r) => {
      const section = sectionById.get(r.id);
      const branchName = branchById.get(section?.branch_id || '');
      return `${section?.name || ''} ${branchName || ''} ${r.reason}`.toLowerCase().includes(query.trim().toLowerCase());
    });

  const urgent = ranked.filter((r) => r.pci < 40).length;
  const preventive = ranked.filter((r) => r.pci >= 55 && r.pci < 85).length;
  const monitor = ranked.filter((r) => r.pci >= 85).length;

  return (
    <AdminShell loading={loading} onRefresh={refresh} onSearchChange={setQuery} searchValue={query} subtitle="Prioritize maintenance directly from the latest computed road-section PCI scores." title="Maintenance Plan">
      {error ? <View style={[styles.notice, { backgroundColor: palette.redSoft, borderColor: palette.red }]}><Feather color={palette.red} name="alert-circle" size={17} /><Text style={[styles.noticeText, { color: palette.text }]}>{error}</Text></View> : null}

      <View style={[styles.metrics, isCompact && styles.stack]}>
        <Metric color={palette.red} icon="alert-triangle" label="Urgent attention" palette={palette} value={urgent} />
        <Metric color={palette.amber} icon="tool" label="Preventive candidates" palette={palette} value={preventive} />
        <Metric color={palette.green} icon="eye" label="Routine monitoring" palette={palette} value={monitor} />
        <Metric color={palette.blue} icon="activity" label="Assessed sections" palette={palette} value={latestResults.length} />
      </View>

      <AdminPanel palette={palette} subtitle={`Ranked according to LAKAD settings (Safety: ${priority_safety ? 'Yes' : 'No'}, Area: ${priority_area ? 'Yes' : 'No'})`} title="Priority Queue">
        {plan.length ? plan.map((item, index) => {
          const section = sectionById.get(item.id);
          const guidance = getMaintenanceGuidance(item.pci, palette);
          return (
            <View key={item.id} style={[styles.planRow, isCompact && styles.planRowCompact, { borderBottomColor: palette.border }]}>
              <View style={[styles.rank, { backgroundColor: index < 3 ? palette.redSoft : palette.blueSoft }]}><Text style={{ color: index < 3 ? palette.red : palette.blue, fontWeight: '900' }}>{item.rank}</Text></View>
              <View style={styles.identity}>
                <Text style={[styles.title, { color: palette.text }]}>{section?.name || 'Unknown'}</Text>
                <Text style={[styles.meta, { color: palette.muted }]}>{branchById.get(section?.branch_id || '') ?? 'Unknown branch'}</Text>
              </View>
              <View style={styles.pci}>
                <Text style={[styles.pciValue, { color: guidance.color }]}>{formatNumber(item.pci)}</Text>
                <Text style={[styles.smallLabel, { color: palette.muted }]}>PCI</Text>
              </View>
              <View style={styles.action}>
                <Text style={[styles.actionTitle, { color: palette.text }]}>{guidance.action}</Text>
                <Text style={[styles.meta, { color: palette.muted }]}>{item.reason}</Text>
              </View>
              <View style={[styles.priorityBadge, { backgroundColor: guidance.soft }]}><Text style={[styles.priorityText, { color: guidance.color }]}>{guidance.priority}</Text></View>
            </View>
          );
        }) : <AdminEmpty icon="tool" message={query ? 'No maintenance priorities match your search.' : 'Maintenance priorities will be generated once road-section PCI values are approved.'} palette={palette} />}
      </AdminPanel>

      <AdminPanel palette={palette} subtitle="The plan remains traceable to computed PCI data" title="How priorities are produced">
        <View style={[styles.explanation, isCompact && styles.stack]}>
          <Explanation icon="database" palette={palette} text="Uses each section’s current published PCI score." />
          <Explanation icon="arrow-up" palette={palette} text="Places the most deteriorated sections first based on active LAKAD Settings." />
          <Explanation icon="refresh-cw" palette={palette} text="Updates dynamically when new inspections are published." />
        </View>
      </AdminPanel>
    </AdminShell>
  );
}

function getMaintenanceGuidance(score: number, palette: any) {
  if (score < 25) return { priority: 'Critical', action: 'Reconstruction assessment', detail: 'Plan structural intervention and detailed engineering review.', color: palette.red, soft: palette.redSoft };
  if (score < 40) return { priority: 'High', action: 'Major rehabilitation', detail: 'Validate failures and prepare a rehabilitation scope.', color: palette.red, soft: palette.redSoft };
  if (score < 55) return { priority: 'High', action: 'Corrective maintenance', detail: 'Address high-impact distress before further deterioration.', color: palette.amber, soft: palette.amberSoft };
  if (score < 70) return { priority: 'Medium', action: 'Preventive maintenance', detail: 'Schedule sealing, patching, or localized treatment.', color: palette.amber, soft: palette.amberSoft };
  if (score < 85) return { priority: 'Low', action: 'Preservation treatment', detail: 'Preserve condition and continue routine inspections.', color: palette.blue, soft: palette.blueSoft };
  return { priority: 'Monitor', action: 'Routine monitoring', detail: 'No major intervention indicated by the current PCI.', color: palette.green, soft: palette.greenSoft };
}

function Metric({ color, icon, label, palette, value }: { color: string; icon: keyof typeof Feather.glyphMap; label: string; palette: ReturnType<typeof useAdminPalette>; value: number }) {
  return <View style={[styles.metric, { backgroundColor: palette.panel, borderColor: palette.border }]}><View style={[styles.metricIcon, { backgroundColor: palette.panelAlt }]}><Feather color={color} name={icon} size={19} /></View><View><Text style={[styles.metricLabel, { color: palette.muted }]}>{label}</Text><Text style={[styles.metricValue, { color: palette.text }]}>{value.toLocaleString()}</Text></View></View>;
}

function Explanation({ icon, palette, text }: { icon: keyof typeof Feather.glyphMap; palette: ReturnType<typeof useAdminPalette>; text: string }) {
  return <View style={styles.explanationItem}><View style={[styles.explanationIcon, { backgroundColor: palette.blueSoft }]}><Feather color={palette.blue} name={icon} size={17} /></View><Text style={[styles.explanationText, { color: palette.muted }]}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', gap: 13, marginBottom: 16 },
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
  explanation: { flexDirection: 'row', gap: 18, marginTop: 16 },
  explanationItem: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 10 },
  explanationIcon: { alignItems: 'center', borderRadius: 19, height: 38, justifyContent: 'center', width: 38 },
  explanationText: { flex: 1, fontSize: 11.5, lineHeight: 17 },
  notice: { alignItems: 'center', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 11, marginBottom: 16 },
  noticeText: { flex: 1, fontSize: 12 },
});
