import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { AdminButton, AdminShell, useAdminPalette } from '@/components/admin/admin-shell';
import { Notice } from '@/components/workflow/shared';
import { PageControls } from '@/components/workflow/pagination';
import { CONDITION_OPTIONS, FilterBar, FilterSelect, SummaryFooter, SummaryRow, SummaryTable, type Column } from './summary-parts';
import { SampleReportModal } from './sample-report-modal';
import { EMPTY_FILTERS, SUMMARY_PAGE_SIZE, SUMMARY_PREVIEW_ROWS, loadSampleSummaries, loadSummaryOptions, type SummaryFilters } from '@/lib/data/summary-data';
import type { ApprovedResult } from '@/lib/data/approved-results';

const COLUMNS: Column[] = [
  { label: 'Sample Unit', flex: 1 }, { label: 'Branch', flex: 1.3 }, { label: 'Section', flex: 1.3 },
  { label: 'PCI', flex: 0.7, align: 'center' }, { label: 'Condition Rating', flex: 1.3, align: 'center' }, { label: 'Action', flex: 0.7, align: 'center' },
];
const SAMPLE_TYPES = [{ value: 'random', label: 'Random' }, { value: 'additional', label: 'Additional' }];

/** Viewer: published sample unit PCI results with database-side filters. */
export function SampleSummaries() {
  const p = useAdminPalette();
  const [draft, setDraft] = useState<SummaryFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<SummaryFilters>(EMPTY_FILTERS);
  const [expanded, setExpanded] = useState(false);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [rows, setRows] = useState<ApprovedResult[]>([]);
  const [total, setTotal] = useState(0);
  const [options, setOptions] = useState<{ branches: string[]; sectionsByBranch: Record<string, string[]> }>({ branches: [], sectionsByBranch: {} });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const cursor = cursors[cursors.length - 1];
  const limit = expanded ? SUMMARY_PAGE_SIZE : SUMMARY_PREVIEW_ROWS;

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError('');
    try {
      const [page, choices] = await Promise.all([loadSampleSummaries(applied, cursor, limit), loadSummaryOptions()]);
      if (request !== sequence.current) return;
      setRows(page.rows); setTotal(page.total); setOptions(choices);
    } catch (reason) {
      if (request === sequence.current) { setRows([]); setTotal(0); setError(reason instanceof Error ? reason.message : 'Results could not be loaded.'); }
    } finally { if (request === sequence.current) setLoading(false); }
  }, [applied, cursor, limit]);
  useEffect(() => {
    // Load the filtered page whenever the applied filters or page change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // Request sequence counter, not a DOM ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { ++sequence.current; };
  }, [refresh]);

  function apply(next: SummaryFilters) { setApplied(next); setCursors([null]); setSelectedId(null); }
  const sectionChoices = draft.branch ? options.sectionsByBranch[draft.branch] ?? [] : [...new Set(Object.values(options.sectionsByBranch).flat())].sort();
  const selected = rows.find(row => row.id === selectedId) ?? null;
  const provisional = rows.some(row => (row.report_snapshot.output as { status?: string }).status === 'provisional');
  const shown = (cursors.length - 1) * SUMMARY_PAGE_SIZE + rows.length;
  const filtered = Object.values(applied).some(Boolean);

  return <AdminShell title="Sample Units Summaries" subtitle="" loading={loading} onRefresh={() => void refresh()}
    onSearchChange={search => { setDraft(d => ({ ...d, search })); apply({ ...applied, search }); }} searchValue={draft.search} searchLabel="Search Sample Unit ID, Sections, or Branch">
    <FilterBar palette={p} busy={loading} onApply={() => apply(draft)} onClear={() => { setDraft(EMPTY_FILTERS); apply(EMPTY_FILTERS); }}>
      <FilterSelect label="Branch" placeholder="All Branches" value={draft.branch} options={options.branches.map(b => ({ value: b, label: b }))} onChange={branch => setDraft(d => ({ ...d, branch, section: '' }))} />
      <FilterSelect label="Section" placeholder="All Sections" value={draft.section} options={sectionChoices.map(s => ({ value: s, label: s }))} onChange={section => setDraft(d => ({ ...d, section }))} />
      <FilterSelect label="Condition Rating" placeholder="All conditions" value={draft.condition} options={CONDITION_OPTIONS} onChange={condition => setDraft(d => ({ ...d, condition }))} />
      <FilterSelect label="Sample Type" placeholder="All Sample Types" value={draft.sampleType} options={SAMPLE_TYPES} onChange={sampleType => setDraft(d => ({ ...d, sampleType }))} />
    </FilterBar>
    {!!error && <View style={{ gap: 10 }}><Notice error>{error}</Notice><AdminButton palette={p} label="Retry" onPress={() => void refresh()} /></View>}
    {provisional && <Notice>Some results are provisional and await civil-engineering validation.</Notice>}
    <SummaryTable palette={p} title="Sample Unit PCI Results" icon="map" columns={COLUMNS} label="Sample unit PCI results"
      footer={<>
        <SummaryFooter palette={p} shown={shown} total={total} expanded={expanded} onToggle={() => { setExpanded(!expanded); setCursors([null]); }} />
        {expanded && <PageControls page={cursors.length} busy={loading} hasNext={rows.length === SUMMARY_PAGE_SIZE && shown < total}
          previous={() => setCursors(cursors.slice(0, -1))} next={() => { const last = rows.at(-1); if (last) setCursors([...cursors, last.id]); }} />}
      </>}>
      {rows.map(row => {
        const s = row.report_snapshot;
        const unit = `SU-${String(s.sample.unit_number).padStart(3, '0')}`;
        return <SummaryRow key={row.id} palette={p} columns={COLUMNS} selected={row.id === selectedId} onView={() => setSelectedId(row.id)}
          label={`${unit}, ${s.road.branch_name}, ${s.road.section_name}, PCI ${Number(s.output.pci).toFixed(1)}, ${s.output.condition}`}
          cells={[unit, s.road.branch_name, s.road.section_name, Number(s.output.pci).toFixed(1), s.output.condition]} />;
      })}
      {!rows.length && !loading && !error && <Text style={{ color: p.muted, padding: 20, textAlign: 'center' }}>{filtered ? 'No published results match these filters. Change or clear the filters.' : 'No published sample unit results yet. Results appear here after the Civil Engineer approves and publishes them.'}</Text>}
      {!rows.length && loading && <Text style={{ color: p.muted, padding: 20, textAlign: 'center' }}>Loading results…</Text>}
    </SummaryTable>
    <SampleReportModal palette={p} row={selected} onClose={() => setSelectedId(null)} />
  </AdminShell>;
}
