import { supabase } from './supabase';
import type { ApprovedResult } from './approved-results';

export const SUMMARY_PREVIEW_ROWS = 5;
export const SUMMARY_PAGE_SIZE = 50;
export type SummaryFilters = { branch: string; section: string; condition: string; sampleType: string; search: string };
export const EMPTY_FILTERS: SummaryFilters = { branch: '', section: '', condition: '', sampleType: '', search: '' };

const ROAD = 'report_snapshot->road->>';
const SAMPLE = 'report_snapshot->sample->>';
/** PostgREST `or()` uses commas, parentheses and `*` as syntax; drop them from free text. */
function searchTerm(raw: string) {
  return raw.replace(/[,()*%\\]/g, ' ').trim().slice(0, 80);
}

/**
 * Current, published sample results for the Viewer, filtered in the database.
 * RLS still limits the Viewer to published, Reviewer-approved snapshots.
 */
export async function loadSampleSummaries(filters: SummaryFilters, after: string | null, limit: number) {
  let query = supabase.from('approved_results')
    .select('id,sample_unit_id,input_revision,report_snapshot,approved_at,published_at,is_current,superseded_at', { count: 'exact' })
    .eq('is_current', true).not('published_at', 'is', null)
    .order('id').limit(limit);
  if (after) query = query.gt('id', after);
  if (filters.branch) query = query.eq(`${ROAD}branch_name`, filters.branch);
  if (filters.section) query = query.eq(`${ROAD}section_name`, filters.section);
  if (filters.condition) query = query.eq('report_snapshot->output->>condition', filters.condition);
  if (filters.sampleType) query = query.eq(`${SAMPLE}sample_type`, filters.sampleType);
  const term = searchTerm(filters.search);
  if (term) {
    const unit = term.match(/^(?:su[\s-]*)?0*(\d{1,6})$/i);
    query = unit ? query.eq(`${SAMPLE}unit_number`, unit[1])
      : query.or(`${ROAD}branch_name.ilike.*${term}*,${ROAD}section_name.ilike.*${term}*`);
  }
  const { data, error, count } = await query;
  if (error) throw new Error('Sample unit results are unavailable: ' + error.message);
  return { rows: (data ?? []) as ApprovedResult[], total: count ?? 0 };
}

/** Branch and section names for the filter lists, from the same published results. */
export async function loadSummaryOptions() {
  const { data, error } = await supabase.from('approved_results')
    .select(`branch:${ROAD}branch_name,section:${ROAD}section_name`)
    .eq('is_current', true).not('published_at', 'is', null).limit(1000);
  if (error) throw new Error('Filter options are unavailable: ' + error.message);
  const rows = (data ?? []) as unknown as { branch: string | null; section: string | null }[];
  const sections = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.branch || !row.section) continue;
    if (!sections.has(row.branch)) sections.set(row.branch, new Set());
    sections.get(row.branch)!.add(row.section);
  }
  const sort = (values: Iterable<string>) => [...values].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  return { branches: sort(sections.keys()), sectionsByBranch: Object.fromEntries([...sections].map(([branch, names]) => [branch, sort(names)])) as Record<string, string[]> };
}

export type SectionSample = { id: string; unit_number: number; sample_type: 'random' | 'additional'; area_sqm: number; pci: number; condition: string };
export type SectionSummary = {
  id: string; section_id: string; section_name: string; branch_name: string; pci: number; condition: string; method: string; published_at: string;
  area_sqm: number | null; total_sample_units: number | null; inspected: number; samples: SectionSample[];
};
export type SectionFilters = SummaryFilters;
/** Current published section results, filtered and paged in the database. */
export async function loadSectionSummaries(filters: SectionFilters, offset: number, limit: number) {
  const { data, error } = await supabase.rpc('lakad_section_summaries', {
    filter_branch: filters.branch || null, filter_section: filters.section || null, filter_condition: filters.condition || null,
    filter_sample_type: filters.sampleType || null, filter_search: filters.search.trim() || null, page_offset: offset, page_size: limit,
  });
  if (error) throw new Error('Section results are unavailable: ' + error.message);
  const result = data as { total: number; rows: SectionSummary[]; options: { branch: string; section: string }[] };
  const sectionsByBranch: Record<string, string[]> = {};
  for (const option of result.options ?? []) (sectionsByBranch[option.branch] ??= []).push(option.section);
  for (const list of Object.values(sectionsByBranch)) list.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  return { total: Number(result.total ?? 0), rows: result.rows ?? [], options: { branches: Object.keys(sectionsByBranch).sort(), sectionsByBranch } };
}
/** One published sample snapshot, for the sample report opened from a section. */
export async function loadApprovedResult(id: string) {
  const { data, error } = await supabase.from('approved_results')
    .select('id,sample_unit_id,input_revision,report_snapshot,approved_at,published_at,is_current,superseded_at').eq('id', id).maybeSingle();
  if (error || !data) throw new Error('This sample unit report is unavailable' + (error ? ': ' + error.message : '.'));
  return data as ApprovedResult;
}

/**
 * D6433-07 §11.1 Eqs. 5–7 breakdown for display, mirroring section.ts: the random
 * area-weighted mean represents the non-additional area; a complete census treats
 * every unit as random. The published PCI stays the authoritative value.
 */
export function sectionBreakdown(summary: Pick<SectionSummary, 'samples' | 'area_sqm' | 'total_sample_units'>) {
  const census = summary.total_sample_units !== null && summary.samples.length === summary.total_sample_units;
  const random = census ? summary.samples : summary.samples.filter(s => s.sample_type === 'random');
  const additional = census ? [] : summary.samples.filter(s => s.sample_type === 'additional');
  const sum = (rows: SectionSample[], pick: (s: SectionSample) => number) => rows.reduce((total, s) => total + pick(s), 0);
  const randomArea = sum(random, s => Number(s.area_sqm)), randomProduct = sum(random, s => Number(s.pci) * Number(s.area_sqm));
  const additionalArea = sum(additional, s => Number(s.area_sqm)), additionalProduct = sum(additional, s => Number(s.pci) * Number(s.area_sqm));
  const randomMean = randomArea ? randomProduct / randomArea : null;
  const area = Number(summary.area_sqm);
  const sectionPci = randomMean === null ? null : additional.length && area > 0 ? (randomMean * (area - additionalArea) + additionalProduct) / area : randomMean;
  return { census, random, additional, randomArea, randomProduct, additionalArea, additionalProduct, randomMean, sectionPci };
}
