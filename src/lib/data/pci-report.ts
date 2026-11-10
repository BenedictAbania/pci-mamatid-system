import { supabase } from './supabase';
import type { ApprovedResult } from './approved-results';
import type { SectionSummary } from './summary-data';

/** Upper bound on rows read for one report, so a large network cannot stall the device. */
export const PCI_REPORT_MAX_ROWS = 1000;
const PAGE = 100;

export type PciReportSection = {
  section_id: string; section_name: string; branch_name: string;
  /** The current section result, or null when no section PCI is available yet. */
  summary: SectionSummary | null;
  samples: ApprovedResult[];
};
export type PciReportData = { sections: PciReportSection[]; sampleCount: number; truncated: boolean };

/**
 * Everything the PCI report needs, read with the signed-in account's own access:
 * - section PCI from `lakad_section_summaries` (the database scopes it per role);
 * - current sample unit results from `approved_results` (RLS: Viewers see published ones only).
 * Values come from the frozen approved snapshots, never from live joins.
 */
export async function loadPciReport(publishedOnly: boolean): Promise<PciReportData> {
  const summaries: SectionSummary[] = [];
  let truncated = false;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.rpc('lakad_section_summaries', { page_offset: offset, page_size: PAGE });
    if (error) throw new Error('Section results are unavailable: ' + error.message);
    const page = data as { total: number; rows: SectionSummary[] };
    summaries.push(...(page.rows ?? []));
    if (summaries.length >= Number(page.total ?? 0) || !page.rows?.length) break;
    if (summaries.length >= PCI_REPORT_MAX_ROWS) { truncated = true; break; }
  }

  const samples: ApprovedResult[] = [];
  let after: string | null = null;
  for (;;) {
    let query = supabase.from('approved_results')
      .select('id,sample_unit_id,input_revision,report_snapshot,approved_at,published_at,is_current,superseded_at')
      .eq('is_current', true).order('id').limit(PAGE);
    if (publishedOnly) query = query.not('published_at', 'is', null);
    if (after) query = query.gt('id', after);
    const { data, error } = await query;
    if (error) throw new Error('Sample unit results are unavailable: ' + error.message);
    const rows = (data ?? []) as ApprovedResult[];
    samples.push(...rows);
    if (rows.length < PAGE) break;
    if (samples.length >= PCI_REPORT_MAX_ROWS) { truncated = true; break; }
    after = rows[rows.length - 1].id;
  }

  const sections = new Map<string, PciReportSection>();
  for (const summary of summaries) {
    sections.set(summary.section_id, { section_id: summary.section_id, section_name: summary.section_name, branch_name: summary.branch_name, summary, samples: [] });
  }
  for (const row of samples) {
    const road = row.report_snapshot.road;
    const key = road.section_id;
    if (!sections.has(key)) sections.set(key, { section_id: key, section_name: road.section_name, branch_name: road.branch_name, summary: null, samples: [] });
    sections.get(key)!.samples.push(row);
  }
  const ordered = [...sections.values()].sort((a, b) =>
    a.branch_name.localeCompare(b.branch_name, 'en', { numeric: true }) || a.section_name.localeCompare(b.section_name, 'en', { numeric: true }));
  for (const section of ordered) section.samples.sort((a, b) => a.report_snapshot.sample.unit_number - b.report_snapshot.sample.unit_number);
  return { sections: ordered, sampleCount: samples.length, truncated };
}
