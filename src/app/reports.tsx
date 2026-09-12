import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AdminButton, AdminEmpty, AdminPanel, AdminShell, useAdminPalette } from '@/components/admin/admin-shell';
import { loadPciData } from '@/lib/admin-data';
import { downloadCsv, formatDate, formatNumber, titleCase } from '@/lib/admin-utils';

type ReportData = Awaited<ReturnType<typeof loadPciData>>;

export default function ReportsScreen() {
  const palette = useAdminPalette();
  const { width } = useWindowDimensions();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const isCompact = width < 850;

  const refresh = useCallback(async () => {
    try {
      const reportData = await loadPciData();
      setError('');
      setData(reportData);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Report data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial synchronization with the remote data source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const branches = data?.branches ?? [];
  const sections = data?.sections ?? [];
  const inspections = data?.inspections ?? [];
  const profiles = data?.profiles ?? [];
  const distresses = data?.distresses ?? [];
  const branchById = new Map(branches.map((item) => [item.id, item.name]));
  const sectionById = new Map(sections.map((item) => [item.id, item]));
  const profileById = new Map(profiles.map((item) => [item.id, item.full_name]));
  const typeById = new Map((data?.distressTypes ?? []).map((item) => [item.id, item.name]));
  const computed = inspections.filter((item) => item.pci_score !== null);
  const average = computed.length
    ? computed.reduce((sum, item) => sum + Number(item.pci_score), 0) / computed.length
    : null;

  function printReport() {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.print();
      return;
    }
    setMessage('Print and PDF saving are available in the web application.');
  }

  function exportReport(name: 'roads' | 'inspections' | 'pci' | 'distresses') {
    if (Platform.OS !== 'web') {
      setMessage('CSV download is currently available in the web application.');
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    if (name === 'roads') {
      downloadCsv(`lakad-road-network-${stamp}.csv`, [
        ['Branch', 'Section', 'Length (m)', 'Width (m)', 'Area (m²)', 'PCI', 'Condition'],
        ...sections.map((section) => [
          branchById.get(section.branch_id) ?? '', section.name, section.length_meters,
          section.width_meters, section.area_sqm, section.pci_score, section.condition_label,
        ]),
      ]);
    } else if (name === 'inspections') {
      downloadCsv(`lakad-inspections-${stamp}.csv`, [
        ['Date', 'Branch', 'Road Section', 'Sample Unit', 'Type', 'Inspector', 'Status'],
        ...inspections.map((inspection) => {
          const section = sectionById.get(inspection.section_id);
          return [
            inspection.surveyed_at ?? inspection.created_at,
            section ? branchById.get(section.branch_id) ?? '' : '',
            section?.name ?? '', inspection.unit_number, inspection.sample_type,
            inspection.surveyed_by ? profileById.get(inspection.surveyed_by) ?? '' : '',
            inspection.status,
          ];
        }),
      ]);
    } else if (name === 'pci') {
      downloadCsv(`lakad-pci-results-${stamp}.csv`, [
        ['Branch', 'Road Section', 'Sample Unit', 'PCI', 'Condition', 'Computed At'],
        ...computed.map((inspection) => {
          const section = sectionById.get(inspection.section_id);
          return [
            section ? branchById.get(section.branch_id) ?? '' : '', section?.name ?? '',
            inspection.unit_number, inspection.pci_score, inspection.condition_label,
            inspection.pci_computed_at,
          ];
        }),
      ]);
    } else {
      downloadCsv(`lakad-distress-records-${stamp}.csv`, [
        ['Sample Unit ID', 'Distress Type', 'Severity', 'Quantity', 'Unit', 'Density (%)', 'Deduct Value'],
        ...distresses.map((distress) => [
          distress.sample_unit_id, typeById.get(distress.distress_type_id) ?? '',
          distress.severity, distress.quantity, distress.unit_of_measure,
          distress.density_percent, distress.deduct_value,
        ]),
      ]);
    }
    setMessage('CSV report downloaded successfully.');
  }

  return (
    <AdminShell action={<AdminButton icon="printer" label="Print / Save PDF" onPress={printReport} palette={palette} tone="secondary" />} loading={loading} onRefresh={() => void refresh()} subtitle="Generate downloadable operational reports from the current Supabase records." title="Reports">
      {error ? <Notice icon="alert-circle" message={error} palette={palette} tone="error" /> : null}
      {message ? <Notice icon="check-circle" message={message} palette={palette} tone="success" /> : null}

      <View style={[styles.summary, isCompact && styles.stack]}>
        <Summary label="Road sections" palette={palette} value={sections.length.toLocaleString()} />
        <Summary label="Inspections" palette={palette} value={inspections.length.toLocaleString()} />
        <Summary label="Computed PCI" palette={palette} value={computed.length.toLocaleString()} />
        <Summary label="Average PCI" palette={palette} value={average === null ? '—' : average.toFixed(1)} />
      </View>

      <AdminPanel palette={palette} subtitle="Each file is generated from live records visible to the signed-in administrator" title="Available exports">
        <View style={[styles.reportGrid, isCompact && styles.stack]}>
          <ReportCard count={sections.length} description="Branch and section dimensions, sampling counts, and current condition." icon="map" label="Road network register" onExport={() => exportReport('roads')} palette={palette} />
          <ReportCard count={inspections.length} description="Sample units, inspectors, survey dates, types, and workflow status." icon="clipboard" label="Inspection register" onExport={() => exportReport('inspections')} palette={palette} />
          <ReportCard count={computed.length} description="Computed PCI values and condition labels for assessed sample units." icon="activity" label="PCI results report" onExport={() => exportReport('pci')} palette={palette} />
          <ReportCard count={distresses.length} description="Recorded distress quantities, severities, densities, and deduct values." icon="alert-triangle" label="Distress inventory" onExport={() => exportReport('distresses')} palette={palette} />
        </View>
      </AdminPanel>

      <AdminPanel palette={palette} subtitle="A quick auditable snapshot of the most recent records" title="Latest data included">
        {inspections.length ? inspections.slice(0, 5).map((inspection) => {
          const section = sectionById.get(inspection.section_id);
          return (
            <View key={inspection.id} style={[styles.latestRow, { borderBottomColor: palette.border }]}>
              <View style={[styles.latestIcon, { backgroundColor: palette.blueSoft }]}><Feather color={palette.blue} name="clipboard" size={16} /></View>
              <View style={styles.latestCopy}><Text style={[styles.latestTitle, { color: palette.text }]}>{section?.name ?? 'Unknown section'} · Unit {inspection.unit_number}</Text><Text style={[styles.latestMeta, { color: palette.muted }]}>{formatDate(inspection.surveyed_at ?? inspection.created_at)} · {titleCase(inspection.status)}</Text></View>
              <Text style={[styles.latestPci, { color: palette.text }]}>PCI {formatNumber(inspection.pci_score)}</Text>
            </View>
          );
        }) : <AdminEmpty icon="file-text" message="Reports are ready, but there are no inspection records to preview yet." palette={palette} />}
      </AdminPanel>
    </AdminShell>
  );
}

function Summary({ label, palette, value }: { label: string; palette: ReturnType<typeof useAdminPalette>; value: string }) {
  return <View style={[styles.summaryCard, { backgroundColor: palette.panel, borderColor: palette.border }]}><Text style={[styles.summaryLabel, { color: palette.muted }]}>{label}</Text><Text style={[styles.summaryValue, { color: palette.text }]}>{value}</Text></View>;
}

function ReportCard({ count, description, icon, label, onExport, palette }: { count: number; description: string; icon: keyof typeof Feather.glyphMap; label: string; onExport: () => void; palette: ReturnType<typeof useAdminPalette> }) {
  return <View style={[styles.reportCard, { backgroundColor: palette.panelAlt, borderColor: palette.border }]}><View style={[styles.reportIcon, { backgroundColor: palette.blueSoft }]}><Feather color={palette.blue} name={icon} size={22} /></View><Text style={[styles.reportTitle, { color: palette.text }]}>{label}</Text><Text style={[styles.reportDescription, { color: palette.muted }]}>{description}</Text><Text style={[styles.reportCount, { color: palette.muted }]}>{count.toLocaleString()} record{count === 1 ? '' : 's'}</Text><AdminButton disabled={!count} icon="download" label="Download CSV" onPress={onExport} palette={palette} tone="secondary" /></View>;
}

function Notice({ icon, message, palette, tone }: { icon: keyof typeof Feather.glyphMap; message: string; palette: ReturnType<typeof useAdminPalette>; tone: 'error' | 'success' }) {
  const color = tone === 'error' ? palette.red : palette.green;
  return <View style={[styles.notice, { backgroundColor: tone === 'error' ? palette.redSoft : palette.greenSoft, borderColor: color }]}><Feather color={color} name={icon} size={17} /><Text style={[styles.noticeText, { color: palette.text }]}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', gap: 13 },
  stack: { flexDirection: 'column' },
  summaryCard: { borderRadius: 12, borderWidth: 1, flex: 1, minHeight: 83, padding: 14 },
  summaryLabel: { fontSize: 10.5 },
  summaryValue: { fontSize: 22, fontWeight: '900', marginTop: 5 },
  reportGrid: { flexDirection: 'row', gap: 13 },
  reportCard: { borderRadius: 11, borderWidth: 1, flex: 1, minHeight: 235, padding: 15 },
  reportIcon: { alignItems: 'center', borderRadius: 23, height: 46, justifyContent: 'center', width: 46 },
  reportTitle: { fontSize: 14, fontWeight: '800', marginTop: 12 },
  reportDescription: { flex: 1, fontSize: 11.5, lineHeight: 17, marginTop: 5 },
  reportCount: { fontSize: 10.5, marginBottom: 11, marginTop: 10 },
  latestRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 10, minHeight: 58 },
  latestIcon: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  latestCopy: { flex: 1 },
  latestTitle: { fontSize: 12.5, fontWeight: '700' },
  latestMeta: { fontSize: 10.5, marginTop: 3 },
  latestPci: { fontSize: 11.5, fontWeight: '800' },
  notice: { alignItems: 'center', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 11 },
  noticeText: { flex: 1, fontSize: 12 },
});
