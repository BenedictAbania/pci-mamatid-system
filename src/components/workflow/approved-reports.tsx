import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { AdminButton, AdminEmpty, AdminPanel, AdminShell, useAdminPalette } from '@/components/admin/admin-shell';
import { Notice } from './shared';
import { TaskTabs } from './task-tabs';
import { PageControls } from './pagination';
import { loadApprovedPage, loadApprovedSummary, loadSectionReportPage, REPORT_PAGE_SIZE } from '@/lib/data/approved-data';
import { approvedReportCsv, type ApprovedResult } from '@/lib/data/approved-results';
import { downloadCsv, formatDate } from '@/lib/utils/admin-utils';
import { useAuth } from '@/providers/AuthProvider';
import { PhotoCard } from '@/components/workflow/photo-card';
import { DEMO_PREVIEW_ENABLED } from '@/lib/ui/demo-preview';

export function ApprovedReports({ title, mode: initialMode = 'results', initialTab = 'current', hub = false }: { title: string; mode?: 'results' | 'overview' | 'reports' | 'rankings'; initialTab?: string; hub?: boolean }) {
  const palette = useAdminPalette();
  const router = useRouter();
  const { role } = useAuth();
  const viewer = role === 'viewer';
  const [tab, setTab] = useState(initialMode === 'rankings' ? 'priorities' : initialTab === 'history' ? 'history' : initialTab === 'priorities' && !viewer ? 'priorities' : 'current');
  const historical = tab === 'history';
  const mode = tab === 'priorities' ? 'rankings' : initialMode;
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const cursor = cursors[cursors.length - 1];
  const [rows, setRows] = useState<ApprovedResult[]>([]);
  const [sections, setSections] = useState<Awaited<ReturnType<typeof loadSectionReportPage>>>([]);
  const [summary, setSummary] = useState<{ count: number; average: number | null } | null>(null);
  const scope = `${mode}:${historical}:${cursor ?? ''}:${viewer}`;
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const visibleRows = loadedScope === scope ? rows : [];
  const visibleSections = loadedScope === scope ? sections : [];
  const visibleSummary = loadedScope === scope ? summary : null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = visibleRows.find(row => row.id === selectedId) ?? null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError('');
    try {
      const [page, totals, ranking] = await Promise.all([
        mode === 'rankings' ? Promise.resolve([]) : loadApprovedPage(cursor, historical, viewer),
        loadApprovedSummary(),
        mode === 'rankings' ? loadSectionReportPage(cursor) : Promise.resolve([]),
      ]);
      if (request !== sequence.current) return;
      setRows(page); setSummary(totals); setSections(ranking); setLoadedScope(scope);
    } catch (reason) {
      if (request === sequence.current) setError(reason instanceof Error ? reason.message : 'Reports could not be loaded.');
    } finally { if (request === sequence.current) setLoading(false); }
  }, [cursor, historical, mode, scope, viewer]);
  useEffect(() => {
    // Synchronize the bounded page with the selected scope.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // Request sequence counter, not a DOM ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { ++sequence.current; };
  }, [refresh]);

  const dataPage = mode === 'rankings' ? visibleSections : visibleRows;
  function exportPage() {
    const csv = mode === 'rankings' ? [
      ['Rank', 'Section', 'PCI', 'Condition', 'Safety risk', 'High severity', 'Affected area', 'Method', 'Published'],
      ...visibleSections.map(s => [s.rank, s.road_snapshot?.section_name ?? 'Legacy snapshot: label unavailable', s.pci, s.condition, s.safety ? "Yes" : "No", s.high_severity, s.affected_area, s.method, s.published_at]),
    ] : approvedReportCsv(selected ? [selected] : visibleRows);
    downloadCsv('lakad-approved-' + (historical ? 'history' : 'current') + '-page-' + cursors.length + '.csv', csv);
  }
  return <AdminShell title={title} subtitle={viewer ? 'Published, Reviewer-approved snapshots only.' : 'Reviewer-approved snapshots; unpublished approvals remain visible to authorized staff.'} loading={loading} onRefresh={refresh}>
    {error ? <View style={{ gap: 10 }}><Notice error>{error} {loadedScope === scope ? 'Showing previously loaded data for this view. Refresh to check for changes.' : 'This view could not be loaded.'}</Notice><AdminButton palette={palette} label="Retry reports" onPress={() => void refresh()} /></View> : null}
    <Notice>Prototype calculations and unvalidated PCI are excluded from these reports. Approval of a reference result does not itself establish ASTM compliance.</Notice>
    {DEMO_PREVIEW_ENABLED && (role === 'admin' || role === 'reviewer') && <AdminButton palette={palette} tone="secondary" label="Open synthetic priority preview" onPress={() => router.push('/demo-priorities')} />}
    {visibleSummary && mode !== 'rankings' && <AdminPanel palette={palette} title="Current approved sample results">
      <Text style={{ color: palette.text, fontSize: 20 }}>{visibleSummary.count} current {viewer ? 'published ' : ''}approved samples · Average PCI {visibleSummary.average === null ? '—' : Number(visibleSummary.average).toFixed(1)}</Text>
      <Text style={{ color: palette.muted }}>Totals cover all authorized current results, independently of this page. Historical revisions are excluded.</Text>
    </AdminPanel>}
    {(hub || mode !== 'rankings') && <TaskTabs label="Results and reports" value={tab} items={[
      { value: 'current', label: viewer ? 'Current published results' : 'Current results' },
      { value: 'history', label: viewer ? 'Published history' : 'Approved history' },
      ...(!viewer && hub ? [{ value: 'priorities', label: 'Maintenance priorities' }] : []),
    ]} onChange={value => { setTab(value); setCursors([null]); setSelectedId(null); }} />}
    <View testID={selected ? 'lakad-report-register-with-selection' : 'lakad-report-register'}><AdminPanel palette={palette} title={mode === 'rankings' ? 'Current section priorities' : historical ? 'Approved historical snapshots' : 'Current approved results'}>
      <Text style={{ color: palette.muted, marginBottom: 12 }}>Up to {REPORT_PAGE_SIZE} records per page. Downloads include this page, or the selected snapshot.</Text>
      {mode === 'rankings' ? visibleSections.map(s => <View key={s.id} style={{ gap: 6, paddingVertical: 12 }}>
        <Text style={{ color: palette.text, fontWeight: '700' }}>{s.rank}. {s.road_snapshot?.section_name ?? 'Legacy snapshot: label unavailable'} · PCI {s.pci}</Text>
        <Text style={{ color: palette.muted }}>{s.condition} · Safety/high severity: {s.safety || s.high_severity > 0 ? 'Present' : 'Not recorded'} · Affected area {s.affected_area} m²</Text>
        <Text style={{ color: palette.muted }}>Lower PCI first, then safety/high severity and affected area. {s.method} · Published {formatDate(s.published_at)}</Text>
      </View>) : visibleRows.map(row => <Pressable accessibilityRole="button" accessibilityLabel={`Open saved snapshot: ${row.report_snapshot.road.section_name}, sample ${row.report_snapshot.sample.unit_number}, revision ${row.input_revision}`} key={row.id} onPress={() => setSelectedId(row.id)} style={{ padding: 14, borderWidth: 1, borderColor: selected?.id === row.id ? palette.blue : palette.border, borderRadius: 8, marginBottom: 8 }}>
        <Text style={{ color: palette.text, fontWeight: '700' }}>{row.report_snapshot.road.branch_name} / {row.report_snapshot.road.section_name} · SU-{row.report_snapshot.sample.unit_number} · PCI {row.report_snapshot.output.pci}</Text>
        <Text style={{ color: palette.muted }}>Revision {row.input_revision} · {row.is_current ? 'Current' : 'Superseded'} · {row.published_at ? 'Published ' + formatDate(row.published_at) : 'Approved; awaiting publication'}</Text>
      </Pressable>)}
      {!dataPage.length && loading && loadedScope !== scope && <Text style={{ color: palette.muted, paddingVertical: 16 }}>Loading this view…</Text>}
      {!dataPage.length && !loading && !error && visibleSummary !== null && <AdminEmpty palette={palette} icon="file-text" message={mode === 'rankings' ? 'No validated current section results are available. Section aggregation remains pending engineering validation.' : (viewer ? 'No published, approved results are available in this scope. Check again after eligible results are published.' : 'No approved results are available in this scope.')} />}
      <PageControls page={cursors.length} busy={loading || !!error} hasNext={dataPage.length === REPORT_PAGE_SIZE} previous={() => { setSelectedId(null); setCursors(cursors.slice(0, -1)); }} next={() => { const last = dataPage[dataPage.length - 1]; if (last) { setSelectedId(null); setCursors([...cursors, last.id]); } }} />
      {Platform.OS === 'web' && <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <AdminButton palette={palette} disabled={loading || !dataPage.length} label={selected ? 'Download selected snapshot CSV' : 'Download this page CSV'} onPress={exportPage} />
        <AdminButton palette={palette} tone="secondary" disabled={loading || !dataPage.length} label="Print / Save PDF" onPress={() => window.print()} />
      </View>}
    </AdminPanel></View>
    {selected && <AdminPanel palette={palette} title="Saved approved snapshot">
      {!selected.report_snapshot.historical_context_available && <Notice>Historical road and distress labels were not captured by the legacy workflow. They are shown as unavailable.</Notice>}
      <Text selectable style={{ color: palette.text }}>Revision {selected.input_revision} · Inspected {formatDate(selected.report_snapshot.sample.surveyed_at)} · {selected.report_snapshot.sample.area_sqm} m²</Text>
      <Text style={{ color: palette.text }}>{selected.report_snapshot.sample.inspection_notes}</Text>
      <Text selectable style={{ color: palette.muted }}>{selected.report_snapshot.edition} · Reference {selected.report_snapshot.reference_id} · Algorithm {selected.report_snapshot.algorithm_version}</Text>
      {selected.report_snapshot.distresses.map(d => <Text key={d.id} style={{ color: palette.text, marginVertical: 6 }}>{d.name} · {d.severity ?? 'Not applicable'} · {d.quantity} {d.unit_of_measure} · {d.notes}</Text>)}
      <Text selectable style={{ color: palette.text }}>PCI {selected.report_snapshot.output.pci} · {selected.report_snapshot.output.condition}</Text>
      <Text selectable style={{ color: palette.muted }}>Total deduct value {selected.report_snapshot.output.total_deduct_value} · Corrected deduct value {selected.report_snapshot.output.max_corrected_deduct_value}</Text>
      {selected.report_snapshot.sample.latitude !== null && selected.report_snapshot.sample.longitude !== null && <AdminButton palette={palette} tone="secondary" label="Open saved location" onPress={() => void Linking.openURL('https://www.openstreetmap.org/?mlat=' + selected.report_snapshot.sample.latitude + '&mlon=' + selected.report_snapshot.sample.longitude)} />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>{selected.report_snapshot.photos.map(photo => <PhotoCard key={photo.id} photo={{ ...photo, sample_unit_id: selected.sample_unit_id }} />)}</View>
    </AdminPanel>}
  </AdminShell>;
}
