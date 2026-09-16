import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AdminEmpty, AdminPanel, AdminShell, useAdminPalette } from '@/components/admin/admin-shell';
import { Notice, useWorkflow } from '@/components/workflow/shared';
import { formatDate, formatNumber, titleCase } from '@/lib/admin-utils';

export default function PciResultsScreen() {
  const palette = useAdminPalette();
  const { width } = useWindowDimensions();
  const { data, loading, error, refresh } = useWorkflow();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const isCompact = width < 1080;

  useEffect(() => {
    if (data?.computations?.length && !selectedId) {
      const verified = data.computations.find(c => c.verification === 'verified' && c.output_snapshot);
      // Select the first verified result after the remote register arrives.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (verified) setSelectedId(verified.id);
    }
  }, [data, selectedId]);

  if (!data) {
    return (
      <AdminShell loading={loading} onRefresh={refresh} onSearchChange={setQuery} searchValue={query} subtitle="Review computed pavement condition scores and recorded distress evidence." title="PCI Results">
        <View />
      </AdminShell>
    );
  }

  const { samples = [], sections = [], branches = [], computations = [], distresses = [], types = [] } = data;

  const sectionById = new Map(sections.map((item) => [item.id, item]));
  const branchById = new Map(branches.map((item) => [item.id, item.name]));
  const typeById = new Map(types.map((item: any) => [item.id, item]));
  const sampleById = new Map(samples.map((item) => [item.id, item]));

  const computed = computations.filter(c => c.verification === 'verified' && c.output_snapshot !== null);
  const filtered = computed.filter((c) => {
    const sample = sampleById.get(c.sample_unit_id);
    const section = sectionById.get(sample?.section_id || '');
    return `${section?.name ?? ''} ${section ? branchById.get(section.branch_id) : ''} ${c.output_snapshot?.condition ?? ''} ${sample?.unit_number}`.toLowerCase().includes(query.trim().toLowerCase());
  });

  const selected = computed.find((item) => item.id === selectedId) ?? null;
  const selectedSample = selected ? sampleById.get(selected.sample_unit_id) : null;
  const selectedSection = selectedSample ? sectionById.get(selectedSample.section_id) : null;

  const selectedDistresses = selectedSample ? distresses.filter((item) => item.sample_unit_id === selectedSample.id) : [];

  const average = computed.length ? computed.reduce((sum, item) => sum + (item.output_snapshot?.pci ?? 0), 0) / computed.length : null;
  const best = computed.length ? Math.max(...computed.map((item) => item.output_snapshot?.pci ?? 0)) : null;
  const lowest = computed.length ? Math.min(...computed.map((item) => item.output_snapshot?.pci ?? 0)) : null;

  return (
    <AdminShell loading={loading} onRefresh={refresh} onSearchChange={setQuery} searchValue={query} subtitle="Review computed pavement condition scores and recorded distress evidence." title="PCI Results">
      {error ? <Notice error>{error}</Notice> : null}

      <View style={[styles.metrics, isCompact && styles.stack]}>
        <Metric icon="activity" label="Computed Samples" palette={palette} value={computed.length.toLocaleString()} />
        <Metric icon="pie-chart" label="Average PCI" palette={palette} value={average === null ? '—' : average.toFixed(1)} />
        <Metric icon="arrow-up" label="Highest PCI" palette={palette} value={formatNumber(best)} />
        <Metric icon="arrow-down" label="Lowest PCI" palette={palette} value={formatNumber(lowest)} />
      </View>

      <View style={[styles.workspace, isCompact && styles.stack]}>
        <AdminPanel palette={palette} style={styles.resultsPanel} subtitle={`${filtered.length} computed result${filtered.length === 1 ? '' : 's'}`} title="Results register">
          {filtered.length ? filtered.map((c) => {
            const sample = sampleById.get(c.sample_unit_id);
            const section = sectionById.get(sample?.section_id || '');
            const active = selectedId === c.id;
            return (
              <Pressable key={c.id} onPress={() => setSelectedId(c.id)} style={[styles.resultRow, { backgroundColor: active ? palette.blueSoft : palette.panel, borderColor: active ? palette.blue : palette.border }]}>
                <View style={[styles.scoreCircle, { backgroundColor: scoreColor(c.output_snapshot?.pci ?? 0) }]}><Text style={styles.scoreText}>{(c.output_snapshot?.pci ?? 0).toFixed(0)}</Text></View>
                <View style={styles.resultCopy}>
                  <Text style={[styles.resultTitle, { color: palette.text }]}>{section?.name ?? 'Unknown road section'} · Unit {sample?.unit_number}</Text>
                  <Text style={[styles.resultMeta, { color: palette.muted }]}>{section ? branchById.get(section.branch_id) : ''} · {formatDate(c.created_at)}</Text>
                </View>
                <View style={styles.conditionCopy}>
                  <Text style={[styles.condition, { color: palette.text }]}>{c.output_snapshot?.condition ?? 'Unclassified'}</Text>
                  <Text style={[styles.resultMeta, { color: palette.muted }]}>Verified</Text>
                </View>
                <Feather color={palette.muted} name="chevron-right" size={18} />
              </Pressable>
            );
          }) : <AdminEmpty icon="activity" message={query ? 'No computed PCI results match your search.' : 'PCI results will appear after sample-unit computations are published.'} palette={palette} />}
        </AdminPanel>

        <AdminPanel palette={palette} style={styles.detailPanel} subtitle="Selected sample-unit evidence" title="Result details">
          {selected && selectedSample && selected.output_snapshot ? (
            <View style={styles.details}>
              <View style={styles.scoreHero}>
                <View style={[styles.largeScore, { backgroundColor: scoreColor(selected.output_snapshot.pci) }]}>
                  <Text style={styles.largeScoreValue}>{formatNumber(selected.output_snapshot.pci)}</Text>
                  <Text style={styles.largeScoreLabel}>PCI</Text>
                </View>
                <View style={styles.scoreHeroCopy}>
                  <Text style={[styles.detailTitle, { color: palette.text }]}>{selected.output_snapshot.condition ?? 'Unclassified'}</Text>
                  <Text style={[styles.resultMeta, { color: palette.muted }]}>{selectedSection?.name ?? 'Unknown section'} · Unit {selectedSample.unit_number}</Text>
                </View>
              </View>

              <View style={styles.detailGrid}>
                <Detail label="Total deduct value" palette={palette} value={formatNumber(selected.output_snapshot.total_deduct_value)} />
                <Detail label="Corrected DV" palette={palette} value={formatNumber(selected.output_snapshot.max_corrected_deduct_value)} />
                <Detail label="Computed" palette={palette} value={formatDate(selected.created_at)} />
              </View>

              <Text style={[styles.sectionLabel, { color: palette.text }]}>Recorded distresses</Text>

              {selectedDistresses.length ? selectedDistresses.map((distress) => (
                <View key={distress.id} style={[styles.distressRow, { borderBottomColor: palette.border }]}>
                  <View style={[styles.distressIcon, { backgroundColor: palette.amberSoft }]}><Feather color={palette.amber} name="alert-triangle" size={16} /></View>
                  <View style={styles.resultCopy}>
                    <Text style={[styles.resultTitle, { color: palette.text }]}>{typeById.get(distress.distress_type_id)?.name ?? 'Unknown distress'}</Text>
                    <Text style={[styles.resultMeta, { color: palette.muted }]}>{titleCase(distress.severity ?? 'Not specified')} · {formatNumber(distress.quantity)} {distress.unit_of_measure}</Text>
                  </View>
                </View>
              )) : <AdminEmpty icon="alert-triangle" message="No distress records are attached to this sample unit." palette={palette} />}
            </View>
          ) : <AdminEmpty icon="mouse-pointer" message="Select a computed result to inspect its PCI components." palette={palette} />}
        </AdminPanel>
      </View>
    </AdminShell>
  );
}

function scoreColor(score: number) {
  if (score >= 85) return '#16A765';
  if (score >= 70) return '#2878F0';
  if (score >= 55) return '#F0AE32';
  if (score >= 40) return '#F47B20';
  return '#E52535';
}

function Metric({ icon, label, palette, value }: { icon: keyof typeof Feather.glyphMap; label: string; palette: ReturnType<typeof useAdminPalette>; value: string }) {
  return <View style={[styles.metric, { backgroundColor: palette.panel, borderColor: palette.border }]}><View style={[styles.metricIcon, { backgroundColor: palette.blueSoft }]}><Feather color={palette.blue} name={icon} size={19} /></View><View><Text style={[styles.metricLabel, { color: palette.muted }]}>{label}</Text><Text style={[styles.metricValue, { color: palette.text }]}>{value}</Text></View></View>;
}

function Detail({ label, palette, value }: { label: string; palette: ReturnType<typeof useAdminPalette>; value: string }) {
  return <View style={[styles.detail, { backgroundColor: palette.panelAlt }]}><Text style={[styles.detailLabel, { color: palette.muted }]}>{label}</Text><Text numberOfLines={1} style={[styles.detailValue, { color: palette.text }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', gap: 13, marginBottom: 16 },
  stack: { flexDirection: 'column' },
  metric: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 11, minHeight: 90, padding: 15 },
  metricIcon: { alignItems: 'center', borderRadius: 21, height: 42, justifyContent: 'center', width: 42 },
  metricLabel: { fontSize: 10.5 },
  metricValue: { fontSize: 22, fontWeight: '900', marginTop: 3 },
  workspace: { flexDirection: 'row', gap: 16 },
  resultsPanel: { flex: 1.15 },
  detailPanel: { flex: 0.85 },
  resultRow: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 11, marginBottom: 8, minHeight: 66, padding: 10 },
  scoreCircle: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  scoreText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  resultCopy: { flex: 1, minWidth: 0 },
  resultTitle: { fontSize: 12.5, fontWeight: '700' },
  resultMeta: { fontSize: 10.5, marginTop: 3 },
  conditionCopy: { alignItems: 'flex-end', minWidth: 80 },
  condition: { fontSize: 11.5, fontWeight: '700' },
  details: { gap: 14 },
  scoreHero: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  largeScore: { alignItems: 'center', borderRadius: 44, height: 88, justifyContent: 'center', width: 88 },
  largeScoreValue: { color: '#FFFFFF', fontSize: 25, fontWeight: '900' },
  largeScoreLabel: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  scoreHeroCopy: { flex: 1 },
  detailTitle: { fontSize: 20, fontWeight: '900' },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  detail: { borderRadius: 9, flexBasis: '46%', flexGrow: 1, padding: 11 },
  detailLabel: { fontSize: 9.5, textTransform: 'uppercase' },
  detailValue: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '800', marginTop: 3 },
  distressRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 9, minHeight: 58 },
  distressIcon: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
});
