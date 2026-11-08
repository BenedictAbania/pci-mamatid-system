import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { AdminButton, AdminShell, useAdminPalette } from '@/components/admin/admin-shell';
import { Notice } from '@/components/workflow/shared';
import { PageControls } from '@/components/workflow/pagination';
import { CONDITION_OPTIONS, FilterBar, FilterSelect, SummaryFooter, SummaryRow, SummaryTable, type Column } from './summary-parts';
import { SectionReportModal } from './section-report-modal';
import { SampleReportModal } from './sample-report-modal';
import { EMPTY_FILTERS, SUMMARY_PAGE_SIZE, SUMMARY_PREVIEW_ROWS, loadApprovedResult, loadSectionSummaries, type SectionFilters, type SectionSummary } from '@/lib/data/summary-data';
import type { ApprovedResult } from '@/lib/data/approved-results';

const COLUMNS: Column[] = [
  { label: 'Section', flex: 1.2 }, { label: 'Branch', flex: 1.2 }, { label: 'Total Samples', flex: 1.1, align: 'center' }, { label: 'Inspected', flex: 0.9, align: 'center' },
  { label: 'Section PCI', flex: 1, align: 'center' }, { label: 'Condition Rating', flex: 1.3, align: 'center' }, { label: 'Action', flex: 0.7, align: 'center' },
];
const SAMPLE_TYPES = [{ value: 'random', label: 'Random' }, { value: 'additional', label: 'Additional' }];

/** Viewer: current published section PCI results, filtered and paged in the database. */
export function SectionSummaries() {
  const p = useAdminPalette();
  const [draft, setDraft] = useState<SectionFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<SectionFilters>(EMPTY_FILTERS);
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<SectionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [options, setOptions] = useState<{ branches: string[]; sectionsByBranch: Record<string, string[]> }>({ branches: [], sectionsByBranch: {} });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sample, setSample] = useState<ApprovedResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const limit = expanded ? SUMMARY_PAGE_SIZE : SUMMARY_PREVIEW_ROWS;

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError('');
    try {
      const result = await loadSectionSummaries(applied, page * limit, limit);
      if (request !== sequence.current) return;
      setRows(result.rows); setTotal(result.total); setOptions(result.options);
    } catch (reason) {
      if (request === sequence.current) { setRows([]); setTotal(0); setError(reason instanceof Error ? reason.message : 'Results could not be loaded.'); }
    } finally { if (request === sequence.current) setLoading(false); }
  }, [applied, page, limit]);
  useEffect(() => {
    // Load the filtered page whenever the applied filters or page change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // Request sequence counter, not a DOM ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { ++sequence.current; };
  }, [refresh]);

  function apply(next: SectionFilters) { setApplied(next); setPage(0); setSelectedId(null); }
  const sectionChoices = draft.branch ? options.sectionsByBranch[draft.branch] ?? [] : [...new Set(Object.values(options.sectionsByBranch).flat())].sort();
  const selected = rows.find(r => r.id === selectedId) ?? null;
  const shown = page * limit + rows.length;
  const filtered = Object.values(applied).some(Boolean);

  return <AdminShell title="Section Summaries" subtitle="" loading={loading} onRefresh={() => void refresh()}
    onSearchChange={search => { setDraft(d => ({ ...d, search })); apply({ ...applied, search }); }} searchValue={draft.search} searchLabel="Search Sections or Branch">
    <FilterBar palette={p} busy={loading} onApply={() => apply(draft)} onClear={() => { setDraft(EMPTY_FILTERS); apply(EMPTY_FILTERS); }}>
      <FilterSelect label="Branch" placeholder="All Branches" value={draft.branch} options={options.branches.map(b => ({ value: b, label: b }))} onChange={branch => setDraft(d => ({ ...d, branch, section: '' }))} />
      <FilterSelect label="Section" placeholder="All Sections" value={draft.section} options={sectionChoices.map(s => ({ value: s, label: s }))} onChange={section => setDraft(d => ({ ...d, section }))} />
      <FilterSelect label="Condition Rating" placeholder="All conditions" value={draft.condition} options={CONDITION_OPTIONS} onChange={condition => setDraft(d => ({ ...d, condition }))} />
      <FilterSelect label="Sample Type" placeholder="All Sample Types" value={draft.sampleType} options={SAMPLE_TYPES} onChange={sampleType => setDraft(d => ({ ...d, sampleType }))} />
    </FilterBar>
    {!!error && <View style={{ gap: 10 }}><Notice error>{error}</Notice><AdminButton palette={p} label="Retry" onPress={() => void refresh()} /></View>}
    <SummaryTable palette={p} title="Pavement Section Summary" icon="map" columns={COLUMNS} label="Pavement section summary"
      aside={`${total} ${total === 1 ? 'Section' : 'Sections'}`}
      footer={<>
        <SummaryFooter palette={p} shown={shown} total={total} expanded={expanded} onToggle={() => { setExpanded(!expanded); setPage(0); }} />
        {expanded && <PageControls page={page + 1} busy={loading} hasNext={shown < total} previous={() => setPage(Math.max(0, page - 1))} next={() => setPage(page + 1)} />}
      </>}>
      {rows.map(r => <SummaryRow key={r.id} palette={p} columns={COLUMNS} selected={r.id === selectedId} onView={() => setSelectedId(r.id)}
        label={`${r.section_name}, ${r.branch_name}, ${r.total_sample_units ?? '—'} total samples, ${r.inspected} inspected, PCI ${Number(r.pci).toFixed(1)}, ${r.condition}`}
        cells={[r.section_name, r.branch_name, r.total_sample_units === null ? '—' : String(r.total_sample_units), String(r.inspected), Number(r.pci).toFixed(1), r.condition]} />)}
      {!rows.length && !loading && !error && <Text style={{ color: p.muted, padding: 20, textAlign: 'center' }}>{filtered ? 'No published sections match these filters. Change or clear the filters.' : 'No published section results yet. A section PCI appears after all of its sample units are approved and the section result is published.'}</Text>}
      {!rows.length && loading && <Text style={{ color: p.muted, padding: 20, textAlign: 'center' }}>Loading results…</Text>}
    </SummaryTable>
    <SectionReportModal palette={p} row={selected} hidden={!!sample} onClose={() => setSelectedId(null)}
      onViewSample={id => void loadApprovedResult(id).then(setSample, reason => setError(reason instanceof Error ? reason.message : 'This sample unit report is unavailable.'))} />
    <SampleReportModal palette={p} row={sample} onClose={() => setSample(null)} />
  </AdminShell>;
}
