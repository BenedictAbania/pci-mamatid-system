import { supabase } from './supabase';
import type { Role } from './access';
import type { ApprovedResult } from './approved-results';
import type { SectionResult, WorkflowState } from './workflow-data';

export const DASHBOARD_PAGE_SIZE = 8;
export type Resource<T> = { status: 'ready'; data: T } | { status: 'loading' } | { status: 'error' | 'unavailable'; message: string };
export type WorkSummary = { sections: number; plansRequiringAttention: number; samples: number; accounts: number | null; pendingCalculations: number; states: Record<WorkflowState, number> };
export type DashboardInspection = { id: string; section_id: string; unit_number: number; workflow_state: WorkflowState; input_revision: number; updated_at: string; section_name: string };
export type RegisterPage = { rows: DashboardInspection[]; next: string | null };
export type RankedSection = SectionResult & { rank: number; road_snapshot: { section_name: string; branch_name: string } | null };
export type ResultSummary = { count: number; average: number | null; published: number; history: number; rows: ApprovedResult[]; sections: RankedSection[] };
export type DashboardData = { work: Resource<WorkSummary>; results: Resource<ResultSummary> };
function countQuery(table: string) { return supabase.from(table).select('id', { count: 'exact', head: true }); }
type Query = ReturnType<typeof countQuery>;
const states: WorkflowState[] = ['planned', 'draft', 'submitted', 'returned', 'approved', 'published'];
function requireArray<T>(data: unknown): T[] {
  if (!Array.isArray(data)) throw new Error('Incomplete dashboard response.');
  return data as T[];
}
function requireCount(value: number | null) {
  if (value === null || !Number.isSafeInteger(value) || value < 0) throw new Error('An exact total was not returned.');
  return value;
}
function fail(error: { message: string; code?: string } | null) {
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
}
function scope(query: Query, role: Role, userId: string) {
  if (role === 'encoder') return query.eq('assigned_to', userId);
  if (role === 'reviewer') return query.eq('reviewer_id', userId).neq('assigned_to', userId);
  return query;
}
async function count(table: string, filter?: (q: Query) => Query) {
  let query = countQuery(table);
  if (filter) query = filter(query);
  const result = await query; fail(result.error);
  return requireCount(result.count);
}
async function workSummary(role: Role, userId: string): Promise<WorkSummary> {
  const sampleScope = (q: Query) => scope(q, role, userId);
  const [sections, plansRequiringAttention, samples, accounts, pendingCalculations, ...totals] = await Promise.all([
    count('sections'), count('sections', q => q.is('homogeneous_confirmed_by', null)), count('sample_units', sampleScope), role === 'admin' ? count('profiles') : Promise.resolve(null),
    count('inspection_computations', q => q.eq('verification', 'pending')),
    ...states.map(state => count('sample_units', q => sampleScope(q).eq('workflow_state', state))),
  ]);
  return { sections, plansRequiringAttention, samples, accounts, pendingCalculations, states: Object.fromEntries(states.map((state, i) => [state, totals[i]])) as WorkSummary['states'] };
}
async function resultSummary(role: Role): Promise<ResultSummary> {
  const viewer = role === 'viewer';
  let page = supabase.from('approved_results').select('id,sample_unit_id,input_revision,report_snapshot,approved_at,published_at,is_current,superseded_at')
    .eq('is_current', true).is('superseded_at', null).order('approved_at', { ascending: false }).order('id').limit(3);
  if (viewer) page = page.not('published_at', 'is', null);
  const [summary, published, history, rows, sections] = await Promise.all([
    supabase.rpc('lakad_report_summary'),
    count('approved_results', q => q.eq('is_current', true).is('superseded_at', null).not('published_at', 'is', null)),
    count('approved_results', q => viewer ? q.not('published_at', 'is', null) : q),
    page, supabase.rpc('lakad_section_reports', { page_size: 3 }),
  ]);
  fail(summary.error); fail(rows.error); fail(sections.error);
  if (!summary.data || !Number.isSafeInteger(summary.data.count) || summary.data.count < 0 ||
      (summary.data.count === 0 ? summary.data.average !== null : !Number.isFinite(summary.data.average))) throw new Error('Incomplete result summary.');
  return { ...summary.data, published, history, rows: requireArray<ApprovedResult>(rows.data), sections: requireArray<RankedSection>(sections.data) };
}
export async function resource<T>(task: () => Promise<T>): Promise<Resource<T>> {
  try { return { status: 'ready', data: await task() }; }
  catch (error) {
    const code = (error as { code?: string }).code;
    const missing = ['42P01', '42703', '42883', 'PGRST202', 'PGRST205'].includes(code ?? '');
    return { status: missing ? 'unavailable' : 'error', message: missing
      ? 'This database is missing a dashboard prerequisite. Use a compatible review environment.'
      : 'Live dashboard data could not be loaded. Retry the request.' };
  }
}
/** Exact/head totals cover the full RLS scope, never a preview page. Viewer never
 * queries mutable inputs/accounts; Encoder never queries approved reports.
 * No service credentials, calculation execution, approval or publication here.
 */
export async function loadDashboardData(role: Role, userId: string): Promise<DashboardData> {
  const [work, results] = await Promise.all([
    role === 'viewer' ? Promise.resolve<Resource<WorkSummary>>({ status: 'unavailable', message: 'Viewers use published results only.' }) : resource(() => workSummary(role, userId)),
    role === 'encoder' ? Promise.resolve<Resource<ResultSummary>>({ status: 'unavailable', message: 'This home focuses on assigned inspection work.' }) : resource(() => resultSummary(role)),
  ]);
  return { work, results };
}
/** Stable ID cursor, bounded joins by this page's actual section IDs. */
export async function loadDashboardRegister(role: Role, userId: string, after: string | null = null): Promise<RegisterPage> {
  if (role === 'viewer') throw new Error('Viewers cannot read the inspection register.');
  if (after && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(after)) throw new Error('Invalid register cursor.');
  let query = supabase.from('sample_units').select('id,section_id,unit_number,workflow_state,input_revision,updated_at').order('id').limit(DASHBOARD_PAGE_SIZE + 1);
  if (role === 'encoder') query = query.eq('assigned_to', userId).in('workflow_state', ['planned', 'draft', 'returned']);
  if (role === 'reviewer') query = query.eq('reviewer_id', userId).neq('assigned_to', userId).eq('workflow_state', 'submitted');
  if (after) query = query.gt('id', after);
  const response = await query; fail(response.error);
  const page = requireArray<Omit<DashboardInspection, 'section_name'>>(response.data), rows = page.slice(0, DASHBOARD_PAGE_SIZE);
  const ids = [...new Set(rows.map(row => row.section_id))];
  const sections = ids.length ? await supabase.from('sections').select('id,name').in('id', ids).limit(DASHBOARD_PAGE_SIZE) : { data: [], error: null };
  fail(sections.error);
  const names = new Map(requireArray<{ id: string; name: string }>(sections.data).map(section => [section.id, section.name]));
  return { rows: rows.map(row => ({ ...row, section_name: names.get(row.section_id) ?? 'Section label unavailable' })), next: page.length > DASHBOARD_PAGE_SIZE ? rows.at(-1)!.id : null };
}
