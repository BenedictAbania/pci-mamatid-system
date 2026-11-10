import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { AdminButton, AdminShell, useAdminPalette, type AdminPalette } from '@/components/admin/admin-shell';
import { Notice } from '@/components/workflow/shared';
import { roleLabels } from '@/lib/auth/access';
import { loadSectionRanking, type RankedSection } from '@/lib/data/approved-data';
import type { ApprovedResult } from '@/lib/data/approved-results';
import { EMPTY_FILTERS, loadApprovedResult, loadSectionSummaries, type SectionSummary } from '@/lib/data/summary-data';
import { PCI_CONDITION_SCALE, getPciConditionCategory, getPciConditionVisual, type PciConditionCategory } from '@/lib/pci/pci-classification';
import { exportPdf } from '@/lib/report/export-pdf';
import { isoDate } from '@/lib/report/export-pdf.shared';
import { prioritiesReportParts } from '@/lib/report/priorities-report-html';
import { downloadCsv, formatDate } from '@/lib/utils/admin-utils';
import { useAuth } from '@/providers/AuthProvider';
import { useAppTheme } from '@/providers/ThemeProvider';
import { ConditionPill } from './report-frame';
import { SummaryTable, type Column } from './summary-parts';
import { SampleReportModal } from './sample-report-modal';
import { SectionReportModal } from './section-report-modal';

const COLUMNS: Column[] = [
  { label: 'Rank', flex: 0.7, align: 'center' }, { label: 'Section', flex: 1.5 }, { label: 'Branch', flex: 1.3 },
  { label: 'Section PCI', flex: 1.3, align: 'center' }, { label: 'Condition', flex: 1.3, align: 'center' },
  { label: 'Safety / High Severity', flex: 1.5, align: 'center' }, { label: 'Affected Area', flex: 1.1, align: 'center' }, { label: 'Action', flex: 0.7, align: 'center' },
];

/** Solid condition colour and its readable text colour, in either theme. */
function solid(category: PciConditionCategory, dark: boolean) {
  return dark ? { fill: category.darkColor, text: category.darkForegroundColor } : { fill: category.color, text: category.foregroundColor };
}

/**
 * Sections ranked for maintenance, colour-coded by PCI condition. The database sets the order:
 * lowest PCI first, then safety/high-severity distress, then larger affected area.
 */
export function MaintenancePriorities() {
  const p = useAdminPalette();
  const dark = useAppTheme().colorScheme === 'dark';
  const { role, profile, user } = useAuth();
  const [rows, setRows] = useState<RankedSection[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<SectionSummary | null>(null);
  const [sample, setSample] = useState<ApprovedResult | null>(null);
  const sequence = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError('');
    try {
      const result = await loadSectionRanking();
      if (request !== sequence.current) return;
      setRows(result.rows); setTruncated(result.truncated);
    } catch (reason) {
      if (request === sequence.current) setError(reason instanceof Error ? reason.message : 'Maintenance priorities could not be loaded.');
    } finally { if (request === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => {
    // Load the ranking once on open; Refresh reloads it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // Request sequence counter, not a DOM ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { ++sequence.current; };
  }, [refresh]);

  /** Opens the section report: its sample units and §11.1 computation. */
  async function view(row: RankedSection) {
    setError('');
    try {
      const name = row.road_snapshot?.section_name;
      const result = await loadSectionSummaries({ ...EMPTY_FILTERS, section: name ?? '' }, 0, 20);
      const summary = result.rows.find(r => r.section_id === row.section_id);
      if (!summary) throw new Error('The report for this section is unavailable.');
      setSelected(summary);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The report for this section is unavailable.'); }
  }

  async function downloadPdf() {
    setExporting(true); setError('');
    try {
      const generatedAt = new Date();
      const parts = prioritiesReportParts(rows, { generatedAt, generatedBy: profile?.full_name || user?.email || 'LAKAD user', roleLabel: role ? roleLabels[role] : '', truncated });
      await exportPdf({ ...parts, title: 'LAKAD Maintenance Priorities', filename: `LAKAD-Maintenance-Priorities-${isoDate(generatedAt)}.pdf` });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The PDF could not be generated.'); }
    finally { setExporting(false); }
  }

  function downloadCsvFile() {
    try {
      downloadCsv(`lakad-maintenance-priorities-${isoDate(new Date())}.csv`, [
        ['Rank', 'Section', 'Branch', 'Section PCI', 'Condition', 'Safety-related distress', 'High-severity distresses', 'Affected area (m²)', 'Published'],
        ...rows.map(r => [r.rank, r.road_snapshot?.section_name ?? '', r.road_snapshot?.branch_name ?? '', Number(r.pci).toFixed(2), getPciConditionCategory(Number(r.pci)).rating, r.safety ? 'Yes' : 'No', r.high_severity, r.affected_area, r.published_at]),
      ]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The CSV could not be downloaded.'); }
  }

  const counts = PCI_CONDITION_SCALE.map(category => ({ category, count: rows.filter(r => getPciConditionCategory(Number(r.pci)).rating === category.rating).length }));

  return <AdminShell title="Maintenance Priorities" subtitle="" loading={loading} onRefresh={() => void refresh()}>
    {!!error && <View style={{ gap: 10 }}><Notice error>{error}</Notice><AdminButton palette={p} label="Retry" onPress={() => void refresh()} /></View>}

    <View accessibilityLabel="Sections by condition" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {counts.map(({ category, count }) => <ConditionCount key={category.rating} palette={p} dark={dark} category={category} count={count} />)}
    </View>

    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: p.blueSoft, borderRadius: 10, padding: 14 }}>
      <Feather name="info" size={18} color={p.blue} style={{ marginTop: 2 }} />
      <Text style={{ color: p.text, flex: 1, lineHeight: 21 }}><Text style={{ fontWeight: '700' }}>How sections are ranked: </Text>lowest section PCI first. When PCI is tied, sections with safety-related or high-severity distress come first, then the larger affected area.</Text>
    </View>

    <SummaryTable palette={p} title="Ranked Sections" icon="alert-triangle" columns={COLUMNS} label="Ranked sections" aside={`${rows.length} ${rows.length === 1 ? 'Section' : 'Sections'}`}
      footer={<View style={{ gap: 12 }}>
        {truncated && <Notice>Showing the first {rows.length} sections. Some sections are not listed.</Notice>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <AdminButton palette={p} icon="download" label={exporting ? 'Preparing PDF…' : 'Download PDF'} disabled={exporting || loading || !rows.length} onPress={() => void downloadPdf()} />
          {Platform.OS === 'web' && <AdminButton palette={p} tone="secondary" icon="file-text" label="Download CSV" disabled={loading || !rows.length} onPress={downloadCsvFile} />}
        </View>
      </View>}>
      {rows.map(r => <PriorityRow key={r.id} palette={p} dark={dark} row={r} onView={() => void view(r)} />)}
      {!rows.length && !loading && !error && <Text style={{ color: p.muted, padding: 20, textAlign: 'center' }}>No section PCI results yet. A section appears here after its section PCI is published.</Text>}
      {!rows.length && loading && <Text style={{ color: p.muted, padding: 20, textAlign: 'center' }}>Loading priorities…</Text>}
    </SummaryTable>

    <SectionReportModal palette={p} row={selected} hidden={!!sample} onClose={() => setSelected(null)}
      onViewSample={id => void loadApprovedResult(id).then(setSample, reason => setError(reason instanceof Error ? reason.message : 'This sample unit report is unavailable.'))} />
    <SampleReportModal palette={p} row={sample} onClose={() => setSample(null)} />
  </AdminShell>;
}

/** One rating in the summary strip: its colour, name and number of sections. */
function ConditionCount({ palette: p, dark, category, count }: { palette: AdminPalette; dark: boolean; category: PciConditionCategory; count: number }) {
  const look = getPciConditionVisual(category, dark);
  const color = solid(category, dark);
  const active = count > 0;
  return <View accessibilityLabel={`${category.rating}, PCI ${category.range}: ${count} ${count === 1 ? 'section' : 'sections'}`}
    style={{ flexGrow: 1, flexBasis: 120, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12,
      borderColor: active ? look.borderColor : p.border, backgroundColor: active ? look.backgroundColor : p.panel }}>
    <View style={{ width: 12, height: 32, borderRadius: 3, backgroundColor: color.fill }} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={{ color: active ? look.foregroundColor : p.text, fontWeight: '700', fontSize: 14 }}>{category.rating}</Text>
      <Text style={{ color: active ? look.foregroundColor : p.muted, fontSize: 12 }}>{category.range}</Text>
    </View>
    <Text style={{ color: active ? look.foregroundColor : p.muted, fontWeight: '800', fontSize: 22, fontVariant: ['tabular-nums'] }}>{count}</Text>
  </View>;
}

function PriorityRow({ palette: p, dark, row, onView }: { palette: AdminPalette; dark: boolean; row: RankedSection; onView: () => void }) {
  const pci = Number(row.pci);
  const category = getPciConditionCategory(pci);
  const color = solid(category, dark);
  const flagged = row.safety || row.high_severity > 0;
  const name = row.road_snapshot?.section_name ?? 'Label not captured';
  const branch = row.road_snapshot?.branch_name ?? '—';
  const cell = (index: number) => ({ flex: COLUMNS[index].flex, alignItems: COLUMNS[index].align === 'center' ? 'center' as const : 'flex-start' as const });
  return <View accessibilityLabel={`Rank ${row.rank}: ${name}, ${branch}, PCI ${pci.toFixed(2)}, ${category.rating}, ${flagged ? 'safety or high-severity distress present' : 'no safety or high-severity distress'}, affected area ${row.affected_area} square metres, published ${formatDate(row.published_at)}`}
    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingRight: 16, paddingLeft: 11, borderLeftWidth: 5, borderLeftColor: color.fill, borderBottomWidth: 1, borderBottomColor: p.border }}>
    <View style={cell(0)}>
      <View style={{ minWidth: 34, height: 34, borderRadius: 17, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: color.fill }}>
        <Text style={{ color: color.text, fontWeight: '800', fontSize: 16 }}>{row.rank}</Text>
      </View>
    </View>
    <View style={cell(1)}>
      <Text style={{ color: p.text, fontSize: 16, fontWeight: '700' }}>{name}</Text>
      <Text style={{ color: p.muted, fontSize: 12 }}>Published {formatDate(row.published_at)}</Text>
    </View>
    <View style={cell(2)}><Text style={{ color: p.text, fontSize: 16 }}>{branch}</Text></View>
    <View style={[cell(3), { gap: 5 }]}>
      <Text style={{ color: p.text, fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{pci.toFixed(2)}</Text>
      <View accessibilityElementsHidden aria-hidden style={{ width: 90, height: 6, borderRadius: 3, backgroundColor: p.panelAlt, overflow: 'hidden' }}>
        <View style={{ width: `${Math.max(0, Math.min(100, pci))}%`, height: '100%', backgroundColor: color.fill }} />
      </View>
    </View>
    <View style={cell(4)}><ConditionPill pci={pci} dark={dark} /></View>
    <View style={cell(5)}>
      {flagged
        ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: p.redSoft, borderColor: p.red, borderWidth: 1, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 10 }}>
          <Feather name="alert-triangle" size={13} color={p.red} />
          <Text style={{ color: p.red, fontWeight: '700', fontSize: 13 }}>{row.high_severity > 0 ? `${row.high_severity} high severity` : 'Safety'}</Text>
        </View>
        : <Text style={{ color: p.muted, fontSize: 15 }}>None</Text>}
    </View>
    <View style={cell(6)}><Text style={{ color: p.text, fontSize: 16, fontVariant: ['tabular-nums'] }}>{Number(row.affected_area).toLocaleString('en-US', { maximumFractionDigits: 1 })} m²</Text></View>
    <View style={cell(7)}>
      <Pressable accessibilityRole="link" accessibilityLabel={`View ${name}`} onPress={onView}>
        <Text style={{ color: p.blue, fontSize: 16, fontWeight: '700', textDecorationLine: 'underline' }}>View</Text>
      </Pressable>
    </View>
  </View>;
}
