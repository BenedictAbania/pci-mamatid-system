import { supabase } from './supabase';
import type { ApprovedResult } from './approved-results';
import type { SectionResult } from './workflow-data';
export const REPORT_PAGE_SIZE = 50;

export async function loadApprovedPage(after: string | null, historical: boolean, viewer: boolean) {
  let query = supabase.from('approved_results')
    .select('id,sample_unit_id,input_revision,report_snapshot,approved_at,published_at,is_current,superseded_at')
    .order('id').limit(REPORT_PAGE_SIZE);
  if (after) query = query.gt('id', after);
  if (!historical) query = query.eq('is_current', true);
  if (viewer) query = query.not('published_at', 'is', null);
  const { data, error } = await query;
  if (error) throw new Error('Approved reports unavailable. Verify the reviewed published-revisions migration: ' + error.message);
  return data as ApprovedResult[];
}
export async function loadApprovedSummary() {
  const { data, error } = await supabase.rpc('lakad_report_summary');
  if (error) throw new Error(error.message);
  return data as { count: number; average: number | null };
}
export async function loadSectionReportPage(after: string | null) {
  const { data, error } = await supabase.rpc('lakad_section_reports', { page_after: after, page_size: REPORT_PAGE_SIZE });
  if (error) throw new Error(error.message);
  return data as RankedSection[];
}
export type RankedSection = SectionResult & { rank: number; road_snapshot: { section_name: string; branch_name: string } | null };

/** Upper bound on ranked sections read at once. */
export const RANKING_MAX_ROWS = 500;
/** Every current ranked section the account may read, in rank order (the database ranks them). */
export async function loadSectionRanking() {
  const rows: RankedSection[] = [];
  let after: string | null = null;
  for (;;) {
    const page = await loadSectionReportPage(after);
    rows.push(...page);
    if (page.length < REPORT_PAGE_SIZE) return { rows, truncated: false };
    if (rows.length >= RANKING_MAX_ROWS) return { rows, truncated: true };
    after = page[page.length - 1].id;
  }
}
